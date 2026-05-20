import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach } from 'vitest';
import * as schema from '../../db/schema';

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

import { llmStatsForRun } from '../dashboard';

describe.runIf(sqlite3Available)('llmStatsForRun', () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
    // Seed a channel and pipeline run for FK references
    db.insert(schema.channels).values({ id: 'ch1', title: 'Test Channel' }).run();
    db.insert(schema.pipelineRuns).values({ triggeredBy: 'manual' }).run();
  });

  it('returns zeros when no LLM records exist for the run', async () => {
    const result = await llmStatsForRun(1, db);
    expect(result.callsCount).toBe(0);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.avgLatencyMs).toBe(0);
  });

  it('aggregates video_selections for the run', async () => {
    db.insert(schema.videoSelections)
      .values({
        channelId: 'ch1',
        runId: 1,
        videoClassifications: [],
        selectedVideoIds: [],
        modelUsed: 'claude-test',
        promptVersion: 'v1',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 1000,
        rawResponsePath: 'raw/vs.json',
      })
      .run();

    const result = await llmStatsForRun(1, db);
    expect(result.callsCount).toBe(1);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.avgLatencyMs).toBe(1000);
  });

  it('aggregates qualifications for the run', async () => {
    db.insert(schema.qualifications)
      .values({
        channelId: 'ch1',
        runId: 1,
        modelUsed: 'claude-test',
        promptVersion: 'v1',
        inputTokens: 200,
        outputTokens: 80,
        latencyMs: 2000,
        rawResponsePath: 'raw/qual.json',
        rawPromptPath: 'raw/qual-prompt.json',
      })
      .run();

    const result = await llmStatsForRun(1, db);
    expect(result.callsCount).toBe(1);
    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(80);
    expect(result.avgLatencyMs).toBe(2000);
  });

  it('aggregates outreach_drafts via qualification join', async () => {
    const qualId = db
      .insert(schema.qualifications)
      .values({
        channelId: 'ch1',
        runId: 1,
        modelUsed: 'claude-test',
        promptVersion: 'v1',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        rawResponsePath: 'raw/qual.json',
        rawPromptPath: 'raw/qual-prompt.json',
      })
      .returning({ id: schema.qualifications.id })
      .get();

    db.insert(schema.outreachDrafts)
      .values({
        channelId: 'ch1',
        qualificationId: qualId!.id,
        language: 'it',
        subject: 'Ciao',
        body: 'Body text',
        modelUsed: 'claude-test',
        promptVersion: 'draft-v1',
        inputTokens: 150,
        outputTokens: 60,
        rawResponsePath: 'raw/draft.json',
      })
      .run();

    const result = await llmStatsForRun(1, db);
    // 1 qual + 1 draft = 2 calls
    expect(result.callsCount).toBe(2);
    expect(result.inputTokens).toBe(150); // 0 from qual + 150 from draft
    expect(result.outputTokens).toBe(60); // 0 from qual + 60 from draft
  });

  it('combines all three source tables', async () => {
    db.insert(schema.videoSelections)
      .values({
        channelId: 'ch1',
        runId: 1,
        videoClassifications: [],
        selectedVideoIds: [],
        modelUsed: 'claude-test',
        promptVersion: 'v1',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 1000,
        rawResponsePath: 'raw/vs.json',
      })
      .run();

    const qualId = db
      .insert(schema.qualifications)
      .values({
        channelId: 'ch1',
        runId: 1,
        modelUsed: 'claude-test',
        promptVersion: 'v1',
        inputTokens: 200,
        outputTokens: 80,
        latencyMs: 2000,
        rawResponsePath: 'raw/qual.json',
        rawPromptPath: 'raw/qual-prompt.json',
      })
      .returning({ id: schema.qualifications.id })
      .get();

    db.insert(schema.outreachDrafts)
      .values({
        channelId: 'ch1',
        qualificationId: qualId!.id,
        language: 'en',
        subject: 'Hello',
        body: 'Body',
        modelUsed: 'claude-test',
        promptVersion: 'draft-v1',
        inputTokens: 120,
        outputTokens: 40,
        rawResponsePath: 'raw/draft.json',
      })
      .run();

    const result = await llmStatsForRun(1, db);
    expect(result.callsCount).toBe(3);
    expect(result.inputTokens).toBe(420); // 100 + 200 + 120
    expect(result.outputTokens).toBe(170); // 50 + 80 + 40
    // avgLatency: (1000 + 2000 + 0) / 3 = 1000
    expect(result.avgLatencyMs).toBeCloseTo(1000, 0);
  });

  it('excludes records from a different run', async () => {
    db.insert(schema.pipelineRuns).values({ triggeredBy: 'cron' }).run(); // run id=2

    db.insert(schema.videoSelections)
      .values({
        channelId: 'ch1',
        runId: 2,
        videoClassifications: [],
        selectedVideoIds: [],
        modelUsed: 'claude-test',
        promptVersion: 'v1',
        inputTokens: 999,
        outputTokens: 999,
        latencyMs: 9999,
        rawResponsePath: 'raw/vs2.json',
      })
      .run();

    const result = await llmStatsForRun(1, db);
    expect(result.callsCount).toBe(0);
    expect(result.inputTokens).toBe(0);
  });
});
