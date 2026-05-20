import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as schema from '../../db/schema';
import { QuotaExhausted } from '../../youtube/quota';

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

const { mockSearchChannels } = vi.hoisted(() => ({
  mockSearchChannels: vi.fn(),
}));

vi.mock('../../youtube/operations', () => ({
  searchChannels: mockSearchChannels,
}));

vi.mock('../../env', () => ({
  env: {
    NODE_ENV: 'test',
    PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT: 10000,
    PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER: 500,
    PIPELINE_TARGET_COUNTRY: 'IT',
    PIPELINE_TARGET_LANGUAGE: 'it',
    DATA_DIR: '/tmp/kw-sweep-test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
  },
}));

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { runKeywordSweep } from '../discovery/keyword-sweep';

function seedRun(db: Db): number {
  const result = db
    .insert(schema.pipelineRuns)
    .values({ triggeredBy: 'manual' })
    .returning({ id: schema.pipelineRuns.id })
    .get()!;
  return result.id;
}

function seedKeyword(
  db: Db,
  keyword: string,
  lastUsedAt?: Date | null,
  isActive = true,
): void {
  db.insert(schema.seedKeywords)
    .values({ keyword, isActive, lastUsedAt: lastUsedAt ?? null })
    .run();
}

function makeSearchResult(channelIds: string[]) {
  return { channelIds, nextPageToken: null, rawPath: 'raw/youtube/search/test.json' };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe.runIf(sqlite3Available)('runKeywordSweep', () => {
  it('inserts new channels with candidate status and correct source', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedKeyword(db, 'cucina italiana');
    mockSearchChannels.mockResolvedValueOnce(makeSearchResult(['UCaaa', 'UCbbb']));

    await runKeywordSweep({ runId, keywordCount: 5 }, db);

    const rows = db.select().from(schema.channels).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.discoveryStatus === 'candidate')).toBe(true);
    expect(rows.every((r) => r.discoverySource === 'keyword:cucina italiana')).toBe(true);
  });

  it('does not re-insert already known channels', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedKeyword(db, 'ricette italiane');
    db.insert(schema.channels).values({ id: 'UCaaa', title: 'Existing', discoveryStatus: 'candidate' }).run();
    mockSearchChannels.mockResolvedValueOnce(makeSearchResult(['UCaaa', 'UCbbb']));

    const result = await runKeywordSweep({ runId, keywordCount: 5 }, db);

    const rows = db.select().from(schema.channels).all();
    expect(rows).toHaveLength(2); // UCaaa existing + UCbbb new
    expect(result.candidatesInserted).toBe(1);
    expect(result.candidatesAlreadyKnown).toBe(1);
  });

  it('updates keyword lastUsedAt, totalUses, totalCandidatesProduced', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedKeyword(db, 'gameplay italiano');
    mockSearchChannels.mockResolvedValueOnce(makeSearchResult(['UCnew1', 'UCnew2']));

    await runKeywordSweep({ runId, keywordCount: 5 }, db);

    const kw = db.select().from(schema.seedKeywords).get()!;
    expect(kw.totalUses).toBe(1);
    expect(kw.totalCandidatesProduced).toBe(2);
    expect(kw.lastUsedAt).not.toBeNull();
    expect(Date.now() - kw.lastUsedAt!.getTime()).toBeLessThan(5000);
  });

  it('logs a pipelineEvents row per keyword', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedKeyword(db, 'tech italiano');
    seedKeyword(db, 'finanza personale');
    mockSearchChannels
      .mockResolvedValueOnce(makeSearchResult(['UCa']))
      .mockResolvedValueOnce(makeSearchResult(['UCb']));

    await runKeywordSweep({ runId, keywordCount: 5 }, db);

    const events = db.select().from(schema.pipelineEvents).all();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.event === 'discovery_keyword_complete')).toBe(true);
    expect(events.every((e) => e.stage === 'discovery')).toBe(true);
  });

  it('updates pipelineRuns searchesPerformed and candidatesFound', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedKeyword(db, 'viaggi italia');
    mockSearchChannels.mockResolvedValueOnce(makeSearchResult(['UCx', 'UCy', 'UCz']));

    await runKeywordSweep({ runId, keywordCount: 5 }, db);

    const run = db.select().from(schema.pipelineRuns).get()!;
    expect(run.searchesPerformed).toBe(1);
    expect(run.candidatesFound).toBe(3);
  });

  it('selects keywords ordered by lastUsedAt ASC NULLS FIRST', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    const old = new Date('2024-01-01');
    const recent = new Date('2024-06-01');
    seedKeyword(db, 'never-used', null);
    seedKeyword(db, 'old-used', old);
    seedKeyword(db, 'recent-used', recent);
    mockSearchChannels.mockResolvedValue(makeSearchResult([]));

    await runKeywordSweep({ runId, keywordCount: 2 }, db);

    const calls = mockSearchChannels.mock.calls.map((c) => (c[0] as { query: string }).query);
    expect(calls[0]).toBe('never-used');
    expect(calls[1]).toBe('old-used');
  });

  it('stops gracefully on QuotaExhausted mid-sweep and returns partial totals', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedKeyword(db, 'kw-first');
    seedKeyword(db, 'kw-second');
    mockSearchChannels
      .mockResolvedValueOnce(makeSearchResult(['UCfirst']))
      .mockRejectedValueOnce(new QuotaExhausted(9500, 9500));

    const result = await runKeywordSweep({ runId, keywordCount: 5 }, db);

    expect(result.searchesPerformed).toBe(1);
    expect(result.candidatesInserted).toBe(1);
    const rows = db.select().from(schema.channels).all();
    expect(rows).toHaveLength(1);
  });

  it('respects keywordCount limit', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedKeyword(db, 'kw1');
    seedKeyword(db, 'kw2');
    seedKeyword(db, 'kw3');
    mockSearchChannels.mockResolvedValue(makeSearchResult([]));

    await runKeywordSweep({ runId, keywordCount: 2 }, db);

    expect(mockSearchChannels).toHaveBeenCalledTimes(2);
  });

  it('skips inactive keywords', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedKeyword(db, 'active-kw', null, true);
    seedKeyword(db, 'inactive-kw', null, false);
    mockSearchChannels.mockResolvedValue(makeSearchResult([]));

    await runKeywordSweep({ runId, keywordCount: 5 }, db);

    expect(mockSearchChannels).toHaveBeenCalledTimes(1);
    const call = mockSearchChannels.mock.calls[0]![0] as { query: string };
    expect(call.query).toBe('active-kw');
  });

  it('handles empty search results without error', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedKeyword(db, 'obscure-topic');
    mockSearchChannels.mockResolvedValueOnce(makeSearchResult([]));

    const result = await runKeywordSweep({ runId, keywordCount: 5 }, db);

    expect(result.searchesPerformed).toBe(1);
    expect(result.candidatesInserted).toBe(0);
    expect(result.candidatesAlreadyKnown).toBe(0);
  });
});
