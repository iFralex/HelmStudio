import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as schema from '../../../db/schema';
import { _resetSettingsCache } from '../../../services/settings';

let sqlite3Available = true;
try {
  new Database(':memory:').close();
} catch {
  sqlite3Available = false;
}

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../../drizzle');

type Db = ReturnType<typeof drizzle<typeof schema>>;

function makeDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

vi.mock('../../../env', () => ({
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
    DATA_DIR: '/tmp/policy-test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
  },
}));

import { shouldQualify } from '../policy';

function seedChannel(
  db: Db,
  id: string,
  overrides: Partial<typeof schema.channels.$inferInsert> = {},
): void {
  db.insert(schema.channels)
    .values({
      id,
      title: `Channel ${id}`,
      discoveryStatus: 'enriched',
      ...overrides,
    })
    .run();
}

function seedVideo(db: Db, videoId: string, channelId: string): void {
  db.insert(schema.videos)
    .values({
      id: videoId,
      channelId,
      title: `Video ${videoId}`,
      publishedAt: new Date(),
    })
    .run();
}

describe.runIf(sqlite3Available)('shouldQualify', () => {
  beforeEach(() => {
    _resetSettingsCache();
  });

  it('returns skip=false for eligible enriched channel with videos', async () => {
    const db = makeDb();
    seedChannel(db, 'UCa');
    seedVideo(db, 'v1', 'UCa');

    const decision = await shouldQualify('UCa', {}, db);

    expect(decision).toEqual({ skip: false });
  });

  it('returns skip=false for eligible qualified channel with videos', async () => {
    const db = makeDb();
    seedChannel(db, 'UCa', {
      discoveryStatus: 'qualified',
      lastQualifiedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
    });
    seedVideo(db, 'v1', 'UCa');

    const decision = await shouldQualify('UCa', {}, db);

    expect(decision).toEqual({ skip: false });
  });

  it('skips channel with wrong_status for candidate', async () => {
    const db = makeDb();
    seedChannel(db, 'UCa', { discoveryStatus: 'candidate' });

    const decision = await shouldQualify('UCa', {}, db);

    expect(decision).toEqual({ skip: true, reason: 'wrong_status' });
  });

  it('skips channel with wrong_status for rejected_pre_qual', async () => {
    const db = makeDb();
    seedChannel(db, 'UCa', { discoveryStatus: 'rejected_pre_qual' });

    const decision = await shouldQualify('UCa', {}, db);

    expect(decision).toEqual({ skip: true, reason: 'wrong_status' });
  });

  it('skips channel with wrong_status for rejected_post_qual', async () => {
    const db = makeDb();
    seedChannel(db, 'UCa', { discoveryStatus: 'rejected_post_qual' });

    const decision = await shouldQualify('UCa', {}, db);

    expect(decision).toEqual({ skip: true, reason: 'wrong_status' });
  });

  it('skips channel that does not exist', async () => {
    const db = makeDb();

    const decision = await shouldQualify('UCnonexistent', {}, db);

    expect(decision).toEqual({ skip: true, reason: 'wrong_status' });
  });

  it('skips channel with no videos', async () => {
    const db = makeDb();
    seedChannel(db, 'UCa');

    const decision = await shouldQualify('UCa', {}, db);

    expect(decision).toEqual({ skip: true, reason: 'no_videos' });
  });

  it('skips channel recently qualified (within window)', async () => {
    const db = makeDb();
    seedChannel(db, 'UCa', {
      discoveryStatus: 'qualified',
      lastQualifiedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago, within 90-day window
    });
    seedVideo(db, 'v1', 'UCa');

    const decision = await shouldQualify('UCa', {}, db);

    expect(decision).toEqual({ skip: true, reason: 'within_window' });
  });

  it('does not skip recently qualified channel when force=true', async () => {
    const db = makeDb();
    seedChannel(db, 'UCa', {
      discoveryStatus: 'qualified',
      lastQualifiedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
    });
    seedVideo(db, 'v1', 'UCa');

    const decision = await shouldQualify('UCa', { force: true }, db);

    expect(decision).toEqual({ skip: false });
  });

  it('does not skip when lastQualifiedAt is null (never qualified)', async () => {
    const db = makeDb();
    seedChannel(db, 'UCa', { lastQualifiedAt: null });
    seedVideo(db, 'v1', 'UCa');

    const decision = await shouldQualify('UCa', {}, db);

    expect(decision).toEqual({ skip: false });
  });

  it('does not skip when qualification window has passed', async () => {
    const db = makeDb();
    seedChannel(db, 'UCa', {
      discoveryStatus: 'enriched',
      lastQualifiedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago > 90-day window
    });
    seedVideo(db, 'v1', 'UCa');

    const decision = await shouldQualify('UCa', {}, db);

    expect(decision).toEqual({ skip: false });
  });
});
