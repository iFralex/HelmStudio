import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as schema from '../../db/schema';

let sqlite3Available = true;
try {
  new Database(':memory:').close();
} catch {
  sqlite3Available = false;
}

vi.mock('../../env', () => ({
  env: {
    NODE_ENV: 'test',
    PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT: 10000,
    PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER: 500,
  },
}));

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../../drizzle');

type Db = ReturnType<typeof drizzle<typeof schema>>;

function makeDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

import { quotaSummary } from '../dashboard';
import { pacificDateString } from '../quota';

describe.runIf(sqlite3Available)('quotaSummary', () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns all zeros and correct date when ledger is empty', async () => {
    const result = await quotaSummary(db);
    expect(result.date).toBe('2024-03-15');
    expect(result.spent).toBe(0);
    expect(result.cap).toBe(9500); // 10000 - 500
    expect(result.safetyBuffer).toBe(500);
    expect(result.remaining).toBe(9500);
    expect(result.byOperation['search.list']).toBe(0);
    expect(result.byOperation['channels.list']).toBe(0);
    expect(result.byOperation['videos.list']).toBe(0);
    expect(result.byOperation['playlistItems.list']).toBe(0);
  });

  it('aggregates per-operation totals correctly', async () => {
    const today = pacificDateString();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'search.list', units: 100 }).run();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'search.list', units: 100 }).run();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'channels.list', units: 1 }).run();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'videos.list', units: 1 }).run();

    const result = await quotaSummary(db);
    expect(result.spent).toBe(202);
    expect(result.byOperation['search.list']).toBe(200);
    expect(result.byOperation['channels.list']).toBe(1);
    expect(result.byOperation['videos.list']).toBe(1);
    expect(result.byOperation['playlistItems.list']).toBe(0);
    expect(result.remaining).toBe(9298); // 9500 - 202
  });

  it('clamps remaining to 0 when spent exceeds cap', async () => {
    const today = pacificDateString();
    // Insert 9600 units — more than the cap of 9500
    db.insert(schema.quotaLedger).values({ date: today, operation: 'search.list', units: 9600 }).run();

    const result = await quotaSummary(db);
    expect(result.spent).toBe(9600);
    expect(result.remaining).toBe(0);
  });

  it('ignores rows from other dates', async () => {
    const today = pacificDateString();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'search.list', units: 100 }).run();
    db.insert(schema.quotaLedger).values({ date: '2024-03-14', operation: 'search.list', units: 9000 }).run();

    const result = await quotaSummary(db);
    expect(result.spent).toBe(100);
    expect(result.byOperation['search.list']).toBe(100);
  });
});
