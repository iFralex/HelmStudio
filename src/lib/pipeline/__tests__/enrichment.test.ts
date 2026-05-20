import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { QuotaExhausted } from '../../youtube/quota';
import type { ChannelDetail } from '../../youtube/types';

let sqlite3Available = true;
try {
  new Database(':memory:').close();
} catch {
  sqlite3Available = false;
}

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../drizzle');

type Db = ReturnType<typeof drizzle<typeof schema>>;

function makeDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

const { mockGetChannels } = vi.hoisted(() => ({
  mockGetChannels: vi.fn(),
}));

vi.mock('../../youtube/operations', () => ({
  getChannels: mockGetChannels,
}));

vi.mock('../../env', () => ({
  env: {
    NODE_ENV: 'test',
    PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT: 10000,
    PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER: 500,
    PIPELINE_TARGET_COUNTRY: 'IT',
    PIPELINE_TARGET_LANGUAGE: 'it',
    DATA_DIR: '/tmp/enrichment-test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
  },
}));

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { enrichCandidateChannels } from '../discovery/enrichment';

function seedRun(db: Db): number {
  const result = db
    .insert(schema.pipelineRuns)
    .values({ triggeredBy: 'manual' })
    .returning({ id: schema.pipelineRuns.id })
    .get()!;
  return result.id;
}

function seedCandidate(db: Db, id: string): void {
  db.insert(schema.channels)
    .values({ id, title: id, discoveryStatus: 'candidate' })
    .run();
}

function makeChannelDetail(id: string, overrides: Partial<ChannelDetail> = {}): ChannelDetail {
  return {
    id,
    handle: `handle-${id}`,
    title: `Channel ${id}`,
    description: 'Test channel',
    country: 'IT',
    defaultLanguage: 'it',
    customUrl: `@handle-${id}`,
    subscriberCount: 100000,
    viewCount: 5000000,
    videoCount: 50,
    uploadsPlaylistId: `UU${id.slice(2)}`,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    channelPublishedAt: '2020-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeGetChannelsResult(ids: string[], missingIds: string[] = []) {
  const presentIds = ids.filter((id) => !missingIds.includes(id));
  const channels = presentIds.map((id) => makeChannelDetail(id));
  const rawPaths: Record<string, string> = {};
  for (const id of presentIds) {
    rawPaths[id] = `raw/youtube/channels/${id}/meta.json`;
  }
  return { channels, rawPaths };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe.runIf(sqlite3Available)('enrichCandidateChannels', () => {
  it('returns zeros when no candidates exist', async () => {
    const db = makeDb();
    const runId = seedRun(db);

    const result = await enrichCandidateChannels({ runId }, db);

    expect(result.enrichedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(mockGetChannels).not.toHaveBeenCalled();
  });

  it('enriches candidate channels with metadata and sets status to enriched', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedCandidate(db, 'UCaaa');
    seedCandidate(db, 'UCbbb');
    mockGetChannels.mockResolvedValueOnce(makeGetChannelsResult(['UCaaa', 'UCbbb']));

    const result = await enrichCandidateChannels({ runId }, db);

    expect(result.enrichedCount).toBe(2);
    expect(result.failedCount).toBe(0);

    const rows = db.select().from(schema.channels).orderBy(schema.channels.id).all();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.discoveryStatus).toBe('enriched');
      expect(row.title).toMatch(/^Channel UC/);
      expect(row.subscriberCount).toBe(100000);
      expect(row.uploadsPlaylistId).not.toBeNull();
      expect(row.lastFetchedAt).not.toBeNull();
      expect(row.rawMetaPath).toMatch(/raw\/youtube\/channels/);
    }
  });

  it('marks missing channels as rejected_pre_qual with reason not_found', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedCandidate(db, 'UCexists');
    seedCandidate(db, 'UCdeleted');
    mockGetChannels.mockResolvedValueOnce(makeGetChannelsResult(['UCexists', 'UCdeleted'], ['UCdeleted']));

    const result = await enrichCandidateChannels({ runId }, db);

    expect(result.enrichedCount).toBe(1);
    expect(result.failedCount).toBe(1);

    const deleted = db
      .select()
      .from(schema.channels)
      .where(eq(schema.channels.id, 'UCdeleted'))
      .get();
    const enriched = db
      .select()
      .from(schema.channels)
      .where(eq(schema.channels.id, 'UCexists'))
      .get();

    expect(enriched?.discoveryStatus).toBe('enriched');
    expect(deleted?.discoveryStatus).toBe('rejected_pre_qual');
    expect(deleted?.rejectionReason).toBe('not_found');
  });

  it('logs a pipelineEvents row per batch', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedCandidate(db, 'UCaaa');
    mockGetChannels.mockResolvedValueOnce(makeGetChannelsResult(['UCaaa']));

    await enrichCandidateChannels({ runId }, db);

    const events = db.select().from(schema.pipelineEvents).all();
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe('enrichment_batch_complete');
    expect(events[0]?.stage).toBe('enrichment');
  });

  it('updates pipelineRuns.channelsEnriched', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedCandidate(db, 'UCaaa');
    seedCandidate(db, 'UCbbb');
    mockGetChannels.mockResolvedValueOnce(makeGetChannelsResult(['UCaaa', 'UCbbb']));

    await enrichCandidateChannels({ runId }, db);

    const run = db.select().from(schema.pipelineRuns).get()!;
    expect(run.channelsEnriched).toBe(2);
  });

  it('skips channels that already have lastFetchedAt set', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    db.insert(schema.channels)
      .values({ id: 'UCalready', title: 'Already enriched', discoveryStatus: 'candidate', lastFetchedAt: new Date() })
      .run();
    seedCandidate(db, 'UCnew');
    mockGetChannels.mockResolvedValueOnce(makeGetChannelsResult(['UCnew']));

    const result = await enrichCandidateChannels({ runId }, db);

    expect(result.enrichedCount).toBe(1);
    expect(mockGetChannels).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ['UCnew'] }),
      db,
    );
  });

  it('stops gracefully on QuotaExhausted and returns partial totals', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    // Seed 55 candidates to force 2 batches (50 + 5)
    const ids = Array.from({ length: 55 }, (_, i) => `UC${String(i).padStart(5, '0')}`);
    for (const id of ids) {
      seedCandidate(db, id);
    }
    const firstBatchIds = ids.slice(0, 50);
    mockGetChannels
      .mockResolvedValueOnce(makeGetChannelsResult(firstBatchIds))
      .mockRejectedValueOnce(new QuotaExhausted(9500, 9500));

    const result = await enrichCandidateChannels({ runId }, db);

    expect(result.enrichedCount).toBe(50);
    expect(mockGetChannels).toHaveBeenCalledTimes(2);

    const run = db.select().from(schema.pipelineRuns).get()!;
    expect(run.channelsEnriched).toBe(50);
  });
});
