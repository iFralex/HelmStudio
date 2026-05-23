import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';

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

const { mockRunDiscovery, mockRunQualification, mockTodayUnitsSpent } = vi.hoisted(() => ({
  mockRunDiscovery: vi.fn(),
  mockRunQualification: vi.fn(),
  mockTodayUnitsSpent: vi.fn(),
}));

vi.mock('../discovery/run', () => ({ runDiscovery: mockRunDiscovery }));
vi.mock('../qualification/run', () => ({ runQualification: mockRunQualification }));
vi.mock('../../youtube/quota', () => ({
  todayUnitsSpent: mockTodayUnitsSpent,
  QuotaExhausted: class QuotaExhausted extends Error {
    spent: number;
    cap: number;
    constructor(spent: number, cap: number) {
      super(`YouTube quota exhausted: ${spent}/${cap} units used today`);
      this.spent = spent;
      this.cap = cap;
      this.name = 'QuotaExhausted';
    }
  },
}));

vi.mock('../../env', () => ({
  env: {
    NODE_ENV: 'test',
    PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT: 10000,
    PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER: 500,
    DATA_DIR: '/tmp/run-test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
  },
}));

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../services/settings', () => ({
  getPipelineConfig: vi.fn().mockResolvedValue({
    triggerHour: 2,
    triggerMinute: 0,
    keywordsPerRun: 5,
    targetQualifiedPerRun: 50,
    inactiveDays: 60,
    requalifyAfterDays: 90,
  }),
}));

import { runPipeline } from '../run';
import { openRun, ConcurrentRunError } from '../lifecycle';
import { QuotaExhausted } from '../../youtube/quota';

describe.runIf(sqlite3Available)('runPipeline', () => {
  let db: Db;

  const discoverySummary = {
    searchesPerformed: 3,
    candidatesFound: 10,
    channelsEnriched: 8,
    channelsPreRejected: 2,
    channelsReadyForQualification: 6,
    cancelled: false,
  };
  const qualificationSummary = { qualified: 4, skipped: 1, rejected: 1 };

  beforeEach(() => {
    db = makeDb();
    mockTodayUnitsSpent.mockReset();
    mockRunDiscovery.mockReset();
    mockRunQualification.mockReset();
    mockTodayUnitsSpent.mockReturnValue(0);
    mockRunDiscovery.mockResolvedValue(discoverySummary);
    mockRunQualification.mockResolvedValue(qualificationSummary);
  });

  it('opens a run row, runs both stages, closes as completed', async () => {
    const result = await runPipeline({ triggeredBy: 'manual' }, db);

    expect(result.status).toBe('completed');
    expect(result.runId).toBeTypeOf('number');
    expect(result.summary.discovery).toEqual(discoverySummary);
    expect(result.summary.qualification).toEqual(qualificationSummary);

    const row = db
      .select()
      .from(schema.pipelineRuns)
      .where(eq(schema.pipelineRuns.id, result.runId!))
      .get();
    expect(row?.status).toBe('completed');
    expect(row?.finishedAt).toBeTruthy();
    expect(row?.triggeredBy).toBe('manual');
  });

  it('passes runId to both stage functions', async () => {
    const result = await runPipeline({ triggeredBy: 'cron' }, db);

    expect(mockRunDiscovery).toHaveBeenCalledWith(result.runId, {}, db);
    expect(mockRunQualification).toHaveBeenCalledWith({ runId: result.runId }, db);
  });

  it('returns cancelled (no runId) when preflight quota check fails', async () => {
    // With 10000 limit, 500 buffer → cap = 9500. Spent 5001 → headroom 4499 < 4500 required
    mockTodayUnitsSpent.mockReturnValue(5001);

    const result = await runPipeline({ triggeredBy: 'cron' }, db);

    expect(result.status).toBe('cancelled');
    expect(result.runId).toBeUndefined();
    expect(mockRunDiscovery).not.toHaveBeenCalled();
    const runs = db.select().from(schema.pipelineRuns).all();
    expect(runs).toHaveLength(0);
  });

  it('blocks a second concurrent call (concurrent-run guard)', async () => {
    // Open a run manually so one is already running
    await openRun('cron', db);

    await expect(runPipeline({ triggeredBy: 'manual' }, db)).rejects.toThrow(ConcurrentRunError);
  });

  it('closes run as cancelled when QuotaExhausted is thrown mid-run', async () => {
    const { QuotaExhausted } = await import('../../youtube/quota');
    mockRunDiscovery.mockRejectedValue(new QuotaExhausted(9000, 9500));

    const result = await runPipeline({ triggeredBy: 'cron' }, db);

    expect(result.status).toBe('cancelled');
    expect(result.runId).toBeTypeOf('number');

    const row = db
      .select()
      .from(schema.pipelineRuns)
      .where(eq(schema.pipelineRuns.id, result.runId!))
      .get();
    expect(row?.status).toBe('cancelled');
    expect(row?.finishedAt).toBeTruthy();
    expect(row?.errorMessage).toContain('quota');
  });

  it('closes run as failed and re-throws on generic error', async () => {
    const boom = new Error('unexpected boom');
    mockRunDiscovery.mockRejectedValue(boom);

    await expect(runPipeline({ triggeredBy: 'manual' }, db)).rejects.toThrow('unexpected boom');

    const runs = db.select().from(schema.pipelineRuns).all();
    expect(runs).toHaveLength(1);
    const failedRun = runs[0]!;
    expect(failedRun.status).toBe('failed');
    expect(failedRun.errorMessage).toBe('unexpected boom');
    expect(failedRun.finishedAt).toBeTruthy();
  });

  it('skips discovery when stages=[qualification]', async () => {
    const result = await runPipeline({ triggeredBy: 'manual', stages: ['qualification'] }, db);

    expect(result.status).toBe('completed');
    expect(mockRunDiscovery).not.toHaveBeenCalled();
    expect(mockRunQualification).toHaveBeenCalled();
  });

  it('skips qualification when stages=[discovery]', async () => {
    const result = await runPipeline({ triggeredBy: 'manual', stages: ['discovery'] }, db);

    expect(result.status).toBe('completed');
    expect(mockRunDiscovery).toHaveBeenCalled();
    expect(mockRunQualification).not.toHaveBeenCalled();
  });

  it('skips qualification and returns cancelled when discovery is cancelled due to quota', async () => {
    mockRunDiscovery.mockResolvedValue({ ...discoverySummary, cancelled: true });

    const result = await runPipeline({ triggeredBy: 'cron' }, db);

    expect(result.status).toBe('cancelled');
    expect(result.runId).toBeTypeOf('number');
    expect(mockRunQualification).not.toHaveBeenCalled();

    const row = db
      .select()
      .from(schema.pipelineRuns)
      .where(eq(schema.pipelineRuns.id, result.runId!))
      .get();
    expect(row?.status).toBe('cancelled');
  });

  it('closes run as cancelled when QuotaExhausted is thrown during qualification', async () => {
    mockRunQualification.mockRejectedValue(new QuotaExhausted(9000, 9500));

    const result = await runPipeline({ triggeredBy: 'cron' }, db);

    expect(result.status).toBe('cancelled');
    expect(result.runId).toBeTypeOf('number');
    expect(result.summary.discovery).toEqual(discoverySummary);

    const row = db
      .select()
      .from(schema.pipelineRuns)
      .where(eq(schema.pipelineRuns.id, result.runId!))
      .get();
    expect(row?.status).toBe('cancelled');
    expect(row?.finishedAt).toBeTruthy();
    expect(row?.errorMessage).toContain('quota');
  });

  it('ConcurrentRunError carries the blocking runId', async () => {
    const blockingId = await openRun('cron', db);

    try {
      await runPipeline({ triggeredBy: 'manual' }, db);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConcurrentRunError);
      expect((err as ConcurrentRunError).runId).toBe(blockingId);
    }
  });
});
