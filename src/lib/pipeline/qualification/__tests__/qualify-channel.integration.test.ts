import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type OpenAI from 'openai';
import * as schema from '../../../db/schema';
import { _resetSettingsCache } from '../../../services/settings';

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
    DATA_DIR: '/tmp/qualify-integration-test',
    DATABASE_PATH: ':memory:',
    PIPELINE_MIN_SUBSCRIBERS: 80000,
    PIPELINE_MAX_SUBSCRIBERS: 1000000,
    PIPELINE_TARGET_COUNTRY: 'IT',
    PIPELINE_TARGET_LANGUAGE: 'it',
    PIPELINE_REQUALIFY_AFTER_DAYS: 90,
    PIPELINE_INACTIVE_DAYS: 60,
    PIPELINE_KEYWORDS_PER_RUN: 3,
    PIPELINE_TARGET_QUALIFIED_PER_RUN: 50,
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
    rawLlmVideoSelection: (channelId: string, runId: number, ts: string) =>
      `raw/llm/video_selections/${channelId}/run-${runId}-${ts}.json`,
    rawLlmQualification: (channelId: string, runId: number, ts: string) =>
      `raw/llm/qualifications/${channelId}/run-${runId}-${ts}.json`,
    rawTranscript: (channelId: string, videoId: string) =>
      `raw/transcripts/${channelId}/${videoId}.json`,
  },
  tsForFilename: () => '2024-01-01T00-00-00-000Z',
}));

const { mockFetchTranscript } = vi.hoisted(() => ({
  mockFetchTranscript: vi.fn(),
}));

vi.mock('@/lib/transcripts/fetcher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/transcripts/fetcher')>();
  return { ...actual, fetchTranscript: mockFetchTranscript };
});

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../../drizzle');

type Db = ReturnType<typeof drizzle<typeof schema>>;

function makeDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

function makeVideoIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `vid${String(i + 1).padStart(3, '0')}`);
}

function makeSelectOutputJson(videoIds: string[], selectedIds: string[]): string {
  const classifications = videoIds.map((id, i) => ({
    videoId: id,
    classification: i % 4 === 0 ? 'format_anchor' : 'representative',
    reasoning: 'Typical structured episode.',
    automationRelevanceScore: 7,
  }));
  return JSON.stringify({
    videoClassifications: classifications,
    formatConsistencySummary: 'Channel has consistent weekly uploads.',
    selectedVideoIds: selectedIds,
    selectionRationale: 'Selected for format diversity.',
  });
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
    analysisModeReasoning: 'Two TIER_1 workflows found.',
    automatableWorkflows: [
      {
        name: 'Research compilation',
        description: 'Aggregate product specs from multiple sources',
        automationApproach: 'LLM-based summarization',
        evidenceTier: 'TIER_1',
        evidenceBasis: 'Creator states it takes a long time in vid001',
        estimatedTimeSavedPerVideoMinutes: 45,
        timeSavedReasoning: '~1h research per video, 75% automatable = 45 min saved.',
        productReadiness: 'off_the_shelf',
      },
    ],
    suggestedSolution: 'AI research assistant',
    pitchAngle: 'Streamline your review prep',
    signals: [
      { type: 'positive', evidence: 'Consistent format', videoId: 'vid001' },
      { type: 'positive', evidence: 'Creator states research takes a long time', videoId: 'vid001' },
      { type: 'positive', evidence: 'Repeated intro/outro formula across all videos', videoId: null },
      { type: 'negative', evidence: 'Some hands-on testing', videoId: null },
    ],
    disqualifiers: [],
    disqualifierScoreImpact: 'No disqualifiers applied.',
    salesObjections: ['Il mio processo è già rodato e veloce'],
    confidence: 0.82,
    rationale: 'Strong automation potential.',
  });
}

function makeCompletionResponse(content: string): object {
  return {
    id: 'test-id',
    object: 'chat.completion',
    created: Date.now(),
    model: 'claude-test-think',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

function makeFakeClient(responses: string[]): OpenAI {
  let callCount = 0;
  return {
    chat: {
      completions: {
        create: vi.fn().mockImplementation(async () => {
          const idx = Math.min(callCount, responses.length - 1);
          callCount++;
          return makeCompletionResponse(responses[idx]!);
        }),
      },
    },
  } as unknown as OpenAI;
}

const CHANNEL_ID = 'UCintegration1';
const RUN_ID = 1;

function seedDb(db: Db): void {
  db.insert(schema.channels)
    .values({
      id: CHANNEL_ID,
      title: 'Integration Test Channel',
      discoveryStatus: 'enriched',
      subscriberCount: 100000,
      description: 'A test channel for integration tests',
      country: 'IT',
      defaultLanguage: 'it',
    })
    .run();

  const videoIds = makeVideoIds(20);
  for (let i = 0; i < videoIds.length; i++) {
    const videoId = videoIds[i]!;
    db.insert(schema.videos)
      .values({
        id: videoId,
        channelId: CHANNEL_ID,
        title: `Video ${videoId} with a longer title`,
        publishedAt: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000),
        durationSeconds: 600,
        viewCount: 5000,
        categoryId: '22',
      })
      .run();
  }

  db.insert(schema.pipelineRuns).values({ triggeredBy: 'manual' }).run();
}

import { __setLlmForTest, __resetLlmForTest } from '../../../llm/client';
import { qualifyChannel } from '../qualify-channel';

describe.skipIf(!sqlite3Available)('qualifyChannel integration', () => {
  let db: Db;

  beforeEach(() => {
    mockDumpRaw.mockClear();
    mockDumpRaw.mockImplementation(async (rel: string) => rel);
    mockFetchTranscript.mockReset();
    _resetSettingsCache();
    db = makeDb();
    seedDb(db);
  });

  afterEach(() => {
    __resetLlmForTest();
  });

  it('happy path: inserts video_selections and qualifications rows, updates channel status and denormalised fields', async () => {
    const videoIds = makeVideoIds(20);
    const selectedIds = videoIds.slice(0, 5);

    __setLlmForTest(makeFakeClient([makeSelectOutputJson(videoIds, selectedIds), makeQualifyOutputJson()]));

    mockFetchTranscript
      .mockResolvedValueOnce({ ok: true, videoId: selectedIds[0], language: 'it', segments: [], text: 'Transcript 1', characterCount: 12 })
      .mockResolvedValueOnce({ ok: true, videoId: selectedIds[1], language: 'it', segments: [], text: 'Transcript 2', characterCount: 12 })
      .mockResolvedValueOnce({ ok: true, videoId: selectedIds[2], language: 'it', segments: [], text: 'Transcript 3', characterCount: 12 })
      .mockResolvedValueOnce({ ok: false, videoId: selectedIds[3], reason: 'no_captions', message: 'No captions' })
      .mockResolvedValueOnce({ ok: false, videoId: selectedIds[4], reason: 'no_captions', message: 'No captions' });

    const result = await qualifyChannel({ channelId: CHANNEL_ID, runId: RUN_ID, force: true }, db);

    expect(result.status).toBe('qualified');
    expect(result.qualificationId).toBeTypeOf('number');

    const transcriptRows = db.select().from(schema.transcripts).all();
    expect(transcriptRows).toHaveLength(5);
    expect(transcriptRows.filter((r) => r.fetchSucceeded)).toHaveLength(3);
    expect(transcriptRows.filter((r) => !r.fetchSucceeded)).toHaveLength(2);

    const selections = db.select().from(schema.videoSelections).all();
    expect(selections).toHaveLength(1);
    expect(selections[0]!.channelId).toBe(CHANNEL_ID);
    expect(selections[0]!.runId).toBe(RUN_ID);
    expect(selections[0]!.selectedVideoIds as unknown as string[]).toEqual(selectedIds);

    const quals = db.select().from(schema.qualifications).all();
    expect(quals).toHaveLength(1);
    expect(quals[0]!.channelId).toBe(CHANNEL_ID);
    expect(quals[0]!.runId).toBe(RUN_ID);
    expect(quals[0]!.videoSelectionId).toBe(selections[0]!.id);
    expect(quals[0]!.automationPotentialScore).toBe(73);
    expect(quals[0]!.workflowRepeatabilityScore).toBe(80);
    expect(quals[0]!.evidenceStrengthScore).toBe(70);
    expect(quals[0]!.commercialViabilityScore).toBe(65);
    expect(quals[0]!.analysisMode).toBe('evidence_driven');
    expect(quals[0]!.confidence).toBeCloseTo(0.82);
    expect(quals[0]!.rawResponsePath).toBeTruthy();

    const channel = db.select().from(schema.channels).where(eq(schema.channels.id, CHANNEL_ID)).get();
    expect(channel!.discoveryStatus).toBe('qualified');
    expect(channel!.latestQualificationId).toBe(result.qualificationId);
    expect(channel!.latestAutomationScore).toBe(73);
    expect(channel!.lastQualifiedAt).toBeTruthy();

    const events = db.select().from(schema.pipelineEvents).all();

    const qualifiedEvent = events.find((e) => e.event === 'channel_qualified');
    expect(qualifiedEvent).toBeDefined();
    const qDetails = qualifiedEvent!.details as Record<string, number>;
    expect(qDetails.score).toBe(73);
    expect(qDetails.transcriptsSuccessful).toBe(3);
    expect(qDetails.transcriptsFailed).toBe(2);

    const transcriptEvent = events.find((e) => e.event === 'transcripts_fetched');
    expect(transcriptEvent).toBeDefined();
    const tDetails = transcriptEvent!.details as Record<string, number>;
    expect(tDetails.succeeded).toBe(3);
    expect(tDetails.failed).toBe(2);
    expect(tDetails.total).toBe(5);
  });

  it('rejects channel with llm_format_failure when step 1 returns malformed JSON twice', async () => {
    __setLlmForTest(makeFakeClient(['not valid json { at all']));

    const result = await qualifyChannel({ channelId: CHANNEL_ID, runId: RUN_ID, force: true }, db);

    expect(result.status).toBe('rejected_post_qual');
    expect(result.reason).toBe('llm_format_failure');

    const channel = db.select().from(schema.channels).where(eq(schema.channels.id, CHANNEL_ID)).get();
    expect(channel!.discoveryStatus).toBe('rejected_post_qual');
    expect(channel!.rejectionReason).toBe('llm_format_failure');

    const events = db.select().from(schema.pipelineEvents).all();
    const failedEvent = events.find((e) => e.event === 'channel_qualification_failed');
    expect(failedEvent).toBeDefined();
  });

  it('rejects channel when selectedVideoIds contains ID not in videoClassifications', async () => {
    const videoIds = makeVideoIds(20);
    const badSelectOutput = {
      videoClassifications: videoIds.map((id) => ({
        videoId: id,
        classification: 'representative',
        reasoning: 'ok',
        automationRelevanceScore: 5,
      })),
      formatConsistencySummary: 'summary',
      selectedVideoIds: ['vid001', 'vid002', 'NOT_IN_LIST'],
      selectionRationale: 'rationale',
    };

    __setLlmForTest(makeFakeClient([JSON.stringify(badSelectOutput)]));

    const result = await qualifyChannel({ channelId: CHANNEL_ID, runId: RUN_ID, force: true }, db);

    expect(result.status).toBe('rejected_post_qual');
    expect(result.reason).toBe('llm_format_failure');

    const channel = db.select().from(schema.channels).where(eq(schema.channels.id, CHANNEL_ID)).get();
    expect(channel!.discoveryStatus).toBe('rejected_post_qual');
    expect(channel!.rejectionReason).toBe('llm_format_failure');

    const events = db.select().from(schema.pipelineEvents).all();
    const failedEvent = events.find((e) => e.event === 'channel_qualification_failed');
    expect(failedEvent).toBeDefined();
  });
});
