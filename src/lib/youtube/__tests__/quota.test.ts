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

import {
  pacificDateString,
  todayUnitsSpent,
  assertHeadroom,
  recordQuotaUse,
  checkAndRecordQuota,
  QuotaExhausted,
  OPERATION_COSTS,
} from '../quota';

describe('pacificDateString', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns YYYY-MM-DD format', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
    expect(pacificDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('UTC 06:00 is previous Pacific day in winter (PST = UTC-8)', () => {
    // Jan 15 06:00 UTC = Jan 14 22:00 PST
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T06:00:00Z'));
    expect(pacificDateString()).toBe('2024-01-14');
  });

  it('UTC 06:00 is previous Pacific day in summer (PDT = UTC-7)', () => {
    // Jul 15 06:00 UTC = Jul 14 23:00 PDT
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-15T06:00:00Z'));
    expect(pacificDateString()).toBe('2024-07-14');
  });

  it('UTC 08:01 is the same Pacific day in winter', () => {
    // Jan 15 08:01 UTC = Jan 15 00:01 PST
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T08:01:00Z'));
    expect(pacificDateString()).toBe('2024-01-15');
  });

  it('UTC 07:01 is the same Pacific day in summer', () => {
    // Jul 15 07:01 UTC = Jul 15 00:01 PDT
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-15T07:01:00Z'));
    expect(pacificDateString()).toBe('2024-07-15');
  });

  it('accepts an explicit date argument', () => {
    const d = new Date('2025-06-01T10:00:00Z');
    expect(pacificDateString(d)).toBe('2025-06-01');
  });
});

describe.runIf(sqlite3Available)('todayUnitsSpent', () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 when no ledger rows exist', async () => {
    const spent = await todayUnitsSpent(db);
    expect(spent).toBe(0);
  });

  it('sums units for today (Pacific date)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'search.list', units: 100 }).run();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'channels.list', units: 1 }).run();
    const spent = await todayUnitsSpent(db);
    expect(spent).toBe(101);
  });

  it('ignores rows from other dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'search.list', units: 100 }).run();
    db.insert(schema.quotaLedger).values({ date: '2024-03-14', operation: 'search.list', units: 999 }).run();
    const spent = await todayUnitsSpent(db);
    expect(spent).toBe(100);
  });
});

describe.runIf(sqlite3Available)('assertHeadroom', () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not throw when budget has headroom', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    await expect(assertHeadroom('search.list', undefined, db)).resolves.toBeUndefined();
  });

  it('throws QuotaExhausted when adding cost exceeds cap', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    // cap = 10000 - 500 = 9500; insert 9450 already spent
    db.insert(schema.quotaLedger).values({ date: today, operation: 'search.list', units: 9450 }).run();
    // search.list costs 100; 9450 + 100 = 9550 > 9500 → should throw
    await expect(assertHeadroom('search.list', undefined, db)).rejects.toThrow(QuotaExhausted);
  });

  it('allows call at the exact cap boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    // cap = 9500; insert 9499 spent; adding 1 (channels.list) = 9500 = cap → allowed
    db.insert(schema.quotaLedger).values({ date: today, operation: 'channels.list', units: 9499 }).run();
    await expect(assertHeadroom('channels.list', undefined, db)).resolves.toBeUndefined();
  });

  it('QuotaExhausted carries spent and cap values', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'search.list', units: 9500 }).run();
    let err: QuotaExhausted | undefined;
    try {
      await assertHeadroom('search.list', undefined, db);
    } catch (e) {
      err = e as QuotaExhausted;
    }
    expect(err).toBeInstanceOf(QuotaExhausted);
    expect(err?.spent).toBe(9500);
    expect(err?.cap).toBe(9500);
  });
});

describe.runIf(sqlite3Available)('recordQuotaUse', () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inserts a row with correct operation and units', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    await recordQuotaUse('search.list', undefined, db);
    const spent = await todayUnitsSpent(db);
    expect(spent).toBe(OPERATION_COSTS['search.list']);
  });

  it('uses Pacific date for the ledger row', async () => {
    vi.useFakeTimers();
    // UTC 06:00 on Jan 15 = Jan 14 in PST
    vi.setSystemTime(new Date('2024-01-15T06:00:00Z'));
    await recordQuotaUse('channels.list', undefined, db);
    const rows = db.select().from(schema.quotaLedger).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe('2024-01-14');
  });

  it('records runId when provided', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    // Insert a pipeline run first to satisfy the foreign key
    db.insert(schema.pipelineRuns).values({ triggeredBy: 'manual' }).run();
    const run = db.select().from(schema.pipelineRuns).get()!;
    await recordQuotaUse('videos.list', run.id, db);
    const rows = db.select().from(schema.quotaLedger).all();
    expect(rows[0]!.runId).toBe(run.id);
  });

  it('accumulates multiple calls correctly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    await recordQuotaUse('search.list', undefined, db);
    await recordQuotaUse('channels.list', undefined, db);
    await recordQuotaUse('channels.list', undefined, db);
    const spent = await todayUnitsSpent(db);
    expect(spent).toBe(102); // 100 + 1 + 1
  });
});

describe.runIf(sqlite3Available)('checkAndRecordQuota', () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inserts a quota row when headroom is available', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    checkAndRecordQuota('channels.list', undefined, db);
    const rows = db.select().from(schema.quotaLedger).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.units).toBe(OPERATION_COSTS['channels.list']);
    expect(rows[0]!.date).toBe('2024-03-15');
  });

  it('throws QuotaExhausted and rolls back when quota is exhausted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'search.list', units: 9500 }).run();
    expect(() => checkAndRecordQuota('channels.list', undefined, db)).toThrow(QuotaExhausted);
    const rows = db.select().from(schema.quotaLedger).all();
    expect(rows).toHaveLength(1); // only the pre-inserted row, no new record added
  });

  it('allows call at the exact cap boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'channels.list', units: 9499 }).run();
    checkAndRecordQuota('channels.list', undefined, db);
    const spent = db
      .select({ total: schema.quotaLedger.units })
      .from(schema.quotaLedger)
      .all()
      .reduce((s, r) => s + r.total, 0);
    expect(spent).toBe(9500);
  });

  it('QuotaExhausted carries spent and cap values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    db.insert(schema.quotaLedger).values({ date: today, operation: 'search.list', units: 9500 }).run();
    let err: QuotaExhausted | undefined;
    try {
      checkAndRecordQuota('search.list', undefined, db);
    } catch (e) {
      err = e as QuotaExhausted;
    }
    expect(err).toBeInstanceOf(QuotaExhausted);
    expect(err?.spent).toBe(9500);
    expect(err?.cap).toBe(9500);
  });
});
