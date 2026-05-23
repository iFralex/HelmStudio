import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type OpenAI from 'openai';
import * as schema from '../../db/schema';

let sqlite3Available = true;
try {
  new Database(':memory:').close();
} catch {
  sqlite3Available = false;
}

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    LLM_BASE_URL: 'http://localhost:3456/v1',
    LLM_API_KEY: 'not-needed',
    LLM_MODEL_THINK: 'claude-test-think',
    LLM_MODEL_FAST: 'claude-test-fast',
    DATA_DIR: '/tmp/llm-qualify-test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
  },
}));

const { mockDumpRaw } = vi.hoisted(() => ({
  mockDumpRaw: vi.fn().mockImplementation(async (rel: string) => rel),
}));

vi.mock('@/lib/storage/raw', () => ({
  dumpRaw: mockDumpRaw,
}));

vi.mock('@/lib/storage/paths', () => ({
  paths: {
    rawLlmQualification: (channelId: string, runId: number, ts: string) =>
      `raw/llm/qualifications/${channelId}/run-${runId}-${ts}.json`,
  },
  tsForFilename: () => '2024-01-01T00-00-00-000Z',
}));

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../drizzle');

type Db = ReturnType<typeof drizzle<typeof schema>>;

function makeDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

function makeCompletionResponse(content: string): object {
  return {
    id: 'test-id',
    object: 'chat.completion',
    created: Date.now(),
    model: 'claude-test-think',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 200, completion_tokens: 100 },
  };
}

function makeFakeClient(responses: string[]): OpenAI {
  let callCount = 0;
  const createFn = vi.fn().mockImplementation(async () => {
    const idx = Math.min(callCount, responses.length - 1);
    callCount++;
    return makeCompletionResponse(responses[idx]!);
  });
  return { chat: { completions: { create: createFn } } } as unknown as OpenAI;
}

function makeQualifyOutputJson(): string {
  return JSON.stringify({
    nicheClassification: 'Tech Review',
    formatType: 'structured_review',
    scores: {
      workflowRepeatability: 80,
      evidenceStrength: 70,
      commercialViability: 65,
      final: 73,
    },
    analysisMode: 'evidence_driven',
    analysisModeReasoning: 'Two TIER_1 workflows found in transcripts.',
    automatableWorkflows: [
      {
        name: 'Research compilation',
        description: 'Aggregate product specs from multiple sources',
        automationApproach: 'LLM-based web scraping and summarization',
        evidenceTier: 'TIER_1',
        evidenceBasis: 'Creator states "ci vuole un sacco di tempo a trovare i dati" in vid001',
        estimatedTimeSavedPerVideoMinutes: 45,
        timeSavedReasoning: 'Creator spends ~1h on research per video; automation handles 75% = ~45 min saved.',
        productReadiness: 'off_the_shelf',
      },
    ],
    suggestedSolution: 'AI research assistant that compiles specs and pricing',
    pitchAngle: 'Streamline your review prep with AI',
    signals: [
      { type: 'positive', evidence: 'Consistent structured format across videos', videoId: 'vid001' },
      { type: 'positive', evidence: 'Creator states research takes a lot of time', videoId: 'vid001' },
      { type: 'positive', evidence: 'Repeated intro/outro formula across all videos', videoId: null },
      { type: 'negative', evidence: 'Some videos rely on hands-on testing', videoId: null },
    ],
    disqualifiers: [],
    disqualifierScoreImpact: 'No disqualifiers applied.',
    salesObjections: ['Il mio processo è già rodato e veloce'],
    confidence: 82,
    rationale: 'Channel shows strong automation potential via research phase.',
  });
}

import { __setLlmForTest, __resetLlmForTest } from '../client';
import { runFinalQualification } from '../qualify';
import type { QualifyInput } from '../qualify';

const CHANNEL_ID = 'UCqualtest1';
const RUN_ID = 1;

function makeVideoIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `vid${String(i + 1).padStart(3, '0')}`);
}

function makeQualifyInput(videoIds: string[], transcriptCount: number): QualifyInput {
  const videos = videoIds.map((id) => ({
    id,
    channelId: CHANNEL_ID,
    title: `Video ${id}`,
    description: 'A test video',
    publishedAt: '2024-01-01',
    duration: 'PT10M',
    durationSeconds: 600,
    viewCount: 5000,
    likeCount: 200,
    commentCount: 30,
    thumbnailUrl: null,
    tags: ['tag1'],
    categoryId: '22',
    defaultLanguage: 'it',
    defaultAudioLanguage: 'it',
  }));

  const selectedIds = videoIds.slice(0, Math.max(3, transcriptCount));
  const transcripts = selectedIds.slice(0, transcriptCount).map((videoId) => ({
    ok: true as const,
    videoId,
    language: 'it',
    segments: [{ text: 'Hello world', start: 0, duration: 5 }],
    text: 'Hello world transcript text',
    characterCount: 27,
  }));

  const failedTranscripts = selectedIds.slice(transcriptCount).map((videoId) => ({
    videoId,
    reason: 'no_captions',
  }));

  return {
    channel: {
      id: CHANNEL_ID,
      handle: '@testchannel',
      title: 'Test Channel',
      description: 'A test channel',
      country: 'IT',
      defaultLanguage: 'it',
      customUrl: null,
      subscriberCount: 50000,
      viewCount: 1000000,
      videoCount: 200,
      uploadsPlaylistId: 'UUqualtest1',
      thumbnailUrl: null,
      channelPublishedAt: '2020-01-01',
    },
    aggregates: {
      uploadsPerWeekLast90d: 1.5,
      avgDurationSeconds: 600,
      durationStddevSeconds: 120,
      avgViews: 5000,
      distinctCategories: 2,
      titleLengthStddev: 8.5,
    },
    videos,
    selection: {
      videoClassifications: videoIds.map((id) => ({
        videoId: id,
        classification: 'representative' as const,
        reasoning: 'Typical upload',
        automationRelevanceScore: 7,
      })),
      formatConsistencySummary: 'Consistent weekly uploads.',
      selectedVideoIds: selectedIds.slice(0, 3),
      selectionRationale: 'Good coverage of channel format.',
    },
    transcripts,
    failedTranscripts,
  };
}

describe.skipIf(!sqlite3Available)('runFinalQualification', () => {
  let db: Db;

  beforeEach(() => {
    mockDumpRaw.mockClear();
    mockDumpRaw.mockImplementation(async (rel: string) => rel);
    db = makeDb();
    db.insert(schema.channels).values({ id: CHANNEL_ID, title: 'Test Channel' }).run();
    db.insert(schema.pipelineRuns).values({ triggeredBy: 'manual' }).run();
    db
      .insert(schema.videoSelections)
      .values({
        channelId: CHANNEL_ID,
        runId: RUN_ID,
        videoClassifications: [],
        selectedVideoIds: [],
        modelUsed: 'claude-test-think',
        promptVersion: 'select-v1',
        rawResponsePath: 'raw/llm/video_selections/test/run-1.json',
      })
      .run();
  });

  afterEach(() => {
    __resetLlmForTest();
  });

  it('inserts a qualifications row and returns qualificationId on success', async () => {
    const videoIds = makeVideoIds(20);
    const json = makeQualifyOutputJson();
    __setLlmForTest(makeFakeClient([json]));

    const result = await runFinalQualification(
      {
        channelId: CHANNEL_ID,
        runId: RUN_ID,
        videoSelectionId: 1,
        input: makeQualifyInput(videoIds, 5),
      },
      db,
    );

    expect(result.qualificationId).toBeTypeOf('number');
    expect(result.output.scores.final).toBe(73);
    expect(result.output.analysisMode).toBe('evidence_driven');
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100, costUsd: null });

    const rows = db.select().from(schema.qualifications).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.channelId).toBe(CHANNEL_ID);
    expect(rows[0]!.runId).toBe(RUN_ID);
    expect(rows[0]!.videoSelectionId).toBe(1);
    expect(rows[0]!.promptVersion).toBe('qualify-v12');
    expect(rows[0]!.modelUsed).toBe('claude-test-think');
    expect(rows[0]!.automationPotentialScore).toBe(73);
    expect(rows[0]!.workflowRepeatabilityScore).toBe(80);
    expect(rows[0]!.evidenceStrengthScore).toBe(70);
    expect(rows[0]!.commercialViabilityScore).toBe(65);
    expect(rows[0]!.analysisMode).toBe('evidence_driven');
    expect(rows[0]!.confidence).toBe(82);
    expect(rows[0]!.rawResponsePath).toBeTruthy();
    expect(rows[0]!.rawPromptPath).toBeTruthy();
  });

  it('succeeds when some transcripts failed (partial transcripts)', async () => {
    const videoIds = makeVideoIds(20);
    const json = makeQualifyOutputJson();
    __setLlmForTest(makeFakeClient([json]));

    const result = await runFinalQualification(
      {
        channelId: CHANNEL_ID,
        runId: RUN_ID,
        videoSelectionId: 1,
        input: makeQualifyInput(videoIds, 3),
      },
      db,
    );

    expect(result.qualificationId).toBeTypeOf('number');
    const rows = db.select().from(schema.qualifications).all();
    expect(rows).toHaveLength(1);
  });

  it('succeeds when zero transcripts succeeded', async () => {
    const videoIds = makeVideoIds(20);
    const json = makeQualifyOutputJson();
    __setLlmForTest(makeFakeClient([json]));

    const result = await runFinalQualification(
      {
        channelId: CHANNEL_ID,
        runId: RUN_ID,
        videoSelectionId: 1,
        input: makeQualifyInput(videoIds, 0),
      },
      db,
    );

    expect(result.qualificationId).toBeTypeOf('number');
  });
});
