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
    DATA_DIR: '/tmp/llm-select-test',
    DATABASE_PATH: ':memory:',
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
    usage: { prompt_tokens: 100, completion_tokens: 50 },
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
    formatConsistencySummary: 'Channel has consistent weekly uploads with stable format.',
    selectedVideoIds: selectedIds,
    selectionRationale: 'Selected for format diversity and recency.',
  });
}

import { __setLlmForTest, __resetLlmForTest } from '../client';
import { runVideoSelection } from '../select';
import { LlmBusinessRuleError } from '../call';
import type { SelectInput } from '../select';

const CHANNEL_ID = 'UCtest123';
const RUN_ID = 1;

function makeSelectInput(videoIds: string[]): SelectInput {
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
      uploadsPlaylistId: 'UUtest123',
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
    videos: videoIds.map((id) => ({
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
    })),
  };
}

describe.skipIf(!sqlite3Available)('runVideoSelection', () => {
  let db: Db;

  beforeEach(() => {
    mockDumpRaw.mockClear();
    mockDumpRaw.mockImplementation(async (rel: string) => rel);
    db = makeDb();
    db.insert(schema.channels).values({ id: CHANNEL_ID, title: 'Test Channel' }).run();
    db.insert(schema.pipelineRuns).values({ triggeredBy: 'manual' }).run();
  });

  afterEach(() => {
    __resetLlmForTest();
  });

  it('inserts a video_selections row and returns selectionId on success', async () => {
    const videoIds = makeVideoIds(20);
    const selectedIds = videoIds.slice(0, 3);
    const json = makeSelectOutputJson(videoIds, selectedIds);

    __setLlmForTest(makeFakeClient([json]));

    const result = await runVideoSelection(
      { channelId: CHANNEL_ID, runId: RUN_ID, input: makeSelectInput(videoIds) },
      db,
    );

    expect(result.selectionId).toBeTypeOf('number');
    expect(result.output.selectedVideoIds).toEqual(selectedIds);
    expect(result.output.videoClassifications).toHaveLength(20);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });

    const rows = db.select().from(schema.videoSelections).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.channelId).toBe(CHANNEL_ID);
    expect(rows[0]!.runId).toBe(RUN_ID);
    expect(rows[0]!.promptVersion).toBe('select-v1');
    expect(rows[0]!.modelUsed).toBe('claude-test-think');
    expect(rows[0]!.inputTokens).toBe(100);
    expect(rows[0]!.outputTokens).toBe(50);
  });

  it('throws LlmBusinessRuleError when selectedVideoIds contains IDs not in classifications', async () => {
    const videoIds = makeVideoIds(20);
    // Include a foreign ID in selectedVideoIds
    const badOutput = {
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

    __setLlmForTest(makeFakeClient([JSON.stringify(badOutput)]));

    await expect(
      runVideoSelection(
        { channelId: CHANNEL_ID, runId: RUN_ID, input: makeSelectInput(videoIds) },
        db,
      ),
    ).rejects.toThrow(LlmBusinessRuleError);
  });

  it('still inserts video_selections row before throwing LlmBusinessRuleError', async () => {
    const videoIds = makeVideoIds(20);
    const badOutput = {
      videoClassifications: videoIds.map((id) => ({
        videoId: id,
        classification: 'representative',
        reasoning: 'ok',
        automationRelevanceScore: 5,
      })),
      formatConsistencySummary: 'summary',
      selectedVideoIds: ['vid001', 'vid002', 'BOGUS_ID'],
      selectionRationale: 'rationale',
    };

    __setLlmForTest(makeFakeClient([JSON.stringify(badOutput)]));

    await expect(
      runVideoSelection(
        { channelId: CHANNEL_ID, runId: RUN_ID, input: makeSelectInput(videoIds) },
        db,
      ),
    ).rejects.toThrow(LlmBusinessRuleError);

    // Row was still persisted before the validation threw
    const rows = db.select().from(schema.videoSelections).all();
    expect(rows).toHaveLength(1);
  });
});
