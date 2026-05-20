import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { _resetSettingsCache } from '../../services/settings';

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

import { vi } from 'vitest';

vi.mock('../../env', () => ({
  env: {
    NODE_ENV: 'test',
    PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT: 10000,
    PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER: 500,
    PIPELINE_TARGET_COUNTRY: 'IT',
    PIPELINE_TARGET_LANGUAGE: 'it',
    PIPELINE_MIN_SUBSCRIBERS: 80000,
    PIPELINE_MAX_SUBSCRIBERS: 1000000,
    PIPELINE_KEYWORDS_PER_RUN: 3,
    PIPELINE_TARGET_QUALIFIED_PER_RUN: 50,
    PIPELINE_INACTIVE_DAYS: 60,
    PIPELINE_REQUALIFY_AFTER_DAYS: 90,
    DATA_DIR: '/tmp/filter-test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
  },
}));

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { applyPreQualificationFilter } from '../discovery/filter';

function seedRun(db: Db): number {
  return db
    .insert(schema.pipelineRuns)
    .values({ triggeredBy: 'manual' })
    .returning({ id: schema.pipelineRuns.id })
    .get()!.id;
}

function seedEnrichedChannel(
  db: Db,
  id: string,
  overrides: Partial<typeof schema.channels.$inferInsert> = {},
): void {
  db.insert(schema.channels)
    .values({
      id,
      title: `Channel ${id}`,
      discoveryStatus: 'enriched',
      subscriberCount: 200_000,
      country: 'IT',
      defaultLanguage: 'it',
      videoCount: 50,
      ...overrides,
    })
    .run();
}

beforeEach(() => {
  _resetSettingsCache();
});

describe.runIf(sqlite3Available)('applyPreQualificationFilter', () => {
  it('rejects channel below min subscribers', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UC01', { subscriberCount: 79_999 });

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.rejected).toBe(1);
    expect(result.surviving).toBe(0);
    const ch = db.select().from(schema.channels).get()!;
    expect(ch.rejectionReason).toBe('below_min_subscribers');
    expect(ch.discoveryStatus).toBe('rejected_pre_qual');
  });

  it('rejects channel above max subscribers', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UC01', { subscriberCount: 1_000_001 });

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.rejected).toBe(1);
    expect(result.surviving).toBe(0);
    const ch = db.select().from(schema.channels).get()!;
    expect(ch.rejectionReason).toBe('above_max_subscribers');
  });

  it('rejects channel with unknown subscriber count (null)', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UC01', { subscriberCount: null });

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.rejected).toBe(1);
    expect(result.surviving).toBe(0);
    const ch = db.select().from(schema.channels).get()!;
    expect(ch.rejectionReason).toBe('unknown_subscriber_count');
  });

  it('rejects channel with wrong country', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UC01', { country: 'US' });

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.rejected).toBe(1);
    expect(result.surviving).toBe(0);
    const ch = db.select().from(schema.channels).get()!;
    expect(ch.rejectionReason).toBe('wrong_country');
  });

  it('rejects channel with wrong language', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UC01', { defaultLanguage: 'en' });

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.rejected).toBe(1);
    expect(result.surviving).toBe(0);
    const ch = db.select().from(schema.channels).get()!;
    expect(ch.rejectionReason).toBe('wrong_language');
  });

  it('rejects channel with too few videos', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UC01', { videoCount: 19 });

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.rejected).toBe(1);
    expect(result.surviving).toBe(0);
    const ch = db.select().from(schema.channels).get()!;
    expect(ch.rejectionReason).toBe('too_few_videos');
  });

  it('allows channel through when all fields match', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UC01');

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.rejected).toBe(0);
    expect(result.surviving).toBe(1);
    const ch = db.select().from(schema.channels).get()!;
    expect(ch.discoveryStatus).toBe('enriched');
    expect(ch.rejectionReason).toBeNull();
  });

  it('allows null country through (country unknown)', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UC01', { country: null });

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.surviving).toBe(1);
  });

  it('allows null language through (language unknown)', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UC01', { defaultLanguage: null });

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.surviving).toBe(1);
  });

  it('allows null videoCount through as if zero and rejects', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UC01', { videoCount: null });

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.rejected).toBe(1);
    const ch = db.select().from(schema.channels).get()!;
    expect(ch.rejectionReason).toBe('too_few_videos');
  });

  it('returns zeros for empty input', async () => {
    const db = makeDb();
    const runId = seedRun(db);

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.rejected).toBe(0);
    expect(result.surviving).toBe(0);
  });

  it('increments pipelineRuns.channelsPreRejected for rejections', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UC01', { subscriberCount: 1000 });
    seedEnrichedChannel(db, 'UC02', { country: 'US' });
    seedEnrichedChannel(db, 'UC03'); // survives

    await applyPreQualificationFilter({ runId }, db);

    const run = db.select().from(schema.pipelineRuns).where(eq(schema.pipelineRuns.id, runId)).get()!;
    expect(run.channelsPreRejected).toBe(2);
  });

  it('only processes enriched channels, not candidates or rejected', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    // These should be ignored (not enriched)
    db.insert(schema.channels).values({ id: 'UC01', title: 'c1', discoveryStatus: 'candidate' }).run();
    db.insert(schema.channels)
      .values({ id: 'UC02', title: 'c2', discoveryStatus: 'rejected_pre_qual', rejectionReason: 'inactive' })
      .run();
    // This should be processed
    seedEnrichedChannel(db, 'UC03');

    const result = await applyPreQualificationFilter({ runId }, db);

    expect(result.surviving).toBe(1);
    expect(result.rejected).toBe(0);
  });
});
