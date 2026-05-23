import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import type OpenAI from 'openai';

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    LLM_BASE_URL: 'http://localhost:3456/v1',
    LLM_API_KEY: 'not-needed',
    LLM_MODEL_THINK: 'claude-test-think',
    LLM_MODEL_FAST: 'claude-test-fast',
    DATA_DIR: '/tmp/llm-test-data',
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
    rawLlmQualification: (channelId: string, runId: number, ts: string) =>
      `raw/llm/qualifications/${channelId}/run-${runId}-${ts}.json`,
    rawLlmDraft: (channelId: string, ts: string) =>
      `raw/llm/drafts/${channelId}/${ts}.json`,
    rawLlmPlaceholder: (channelId: string, ts: string) =>
      `raw/llm/placeholder/${channelId}/${ts}.json`,
  },
  tsForFilename: () => '2024-01-01T00-00-00-000Z',
}));

import { callLLM, LlmFormatError, LlmCallError } from '../call';
import { __setLlmForTest, __resetLlmForTest } from '../client';

type FakeCompletion = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
};

function makeCompletionResponse(content: string, model = 'claude-test-think'): FakeCompletion {
  return {
    id: 'test-id',
    object: 'chat.completion',
    created: Date.now(),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
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

const testSchema = z.object({ ok: z.boolean() });

const baseArgs = {
  tier: 'think' as const,
  promptVersion: 'placeholder-v0',
  system: 'Test system prompt',
  user: 'Test user prompt',
  schema: testSchema,
  context: { channelId: 'test-channel', kind: 'placeholder' as const },
};

describe('callLLM', () => {
  beforeEach(() => {
    mockDumpRaw.mockClear();
    mockDumpRaw.mockImplementation(async (rel: string) => rel);
  });

  afterEach(() => {
    __resetLlmForTest();
  });

  it('happy path: parses, validates, persists raw, returns parsed', async () => {
    const fakeClient = makeFakeClient(['{"ok": true}']);
    __setLlmForTest(fakeClient);

    const result = await callLLM(baseArgs);

    expect(result.parsed).toEqual({ ok: true });
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, costUsd: null });
    expect(result.modelUsed).toBe('claude-test-think');
    expect(result.rawPath).toContain('placeholder');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    expect(mockDumpRaw).toHaveBeenCalledOnce();
    const payload = mockDumpRaw.mock.calls[0]![1] as Record<string, unknown>;
    expect((payload.attempts as string[])).toHaveLength(1);
    expect(payload.parsed).toEqual({ ok: true });
  });

  it('retries once on JSON parse failure and succeeds on retry', async () => {
    const fakeClient = makeFakeClient(['not valid json', '{"ok": true}']);
    __setLlmForTest(fakeClient);

    const result = await callLLM(baseArgs);

    expect(result.parsed).toEqual({ ok: true });

    const createFn = fakeClient.chat.completions.create as ReturnType<typeof vi.fn>;
    expect(createFn).toHaveBeenCalledTimes(2);

    const secondCallArgs = createFn.mock.calls[1]![0] as { messages: Array<{ role: string; content: string }> };
    expect(secondCallArgs.messages).toHaveLength(4);
    expect(secondCallArgs.messages[2]).toMatchObject({ role: 'assistant', content: 'not valid json' });
    expect(secondCallArgs.messages[3]!.content).toContain('did not match the required JSON schema');
  });

  it('accumulates token usage across retry attempts', async () => {
    let callCount = 0;
    const createFn = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'claude-test-think',
        choices: [{ index: 0, message: { role: 'assistant', content: callCount === 1 ? 'bad json' : '{"ok": true}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: callCount === 1 ? 10 : 20, completion_tokens: callCount === 1 ? 5 : 8 },
      };
    });
    __setLlmForTest({ chat: { completions: { create: createFn } } } as unknown as OpenAI);

    const result = await callLLM(baseArgs);

    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 13, costUsd: null });
  });

  it('throws LlmCallError when retry API call fails after first parse failure', async () => {
    const retryErr = new Error('Network timeout on retry');
    let callCount = 0;
    const createFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return makeCompletionResponse('not valid json');
      throw retryErr;
    });
    __setLlmForTest({ chat: { completions: { create: createFn } } } as unknown as OpenAI);

    await expect(callLLM(baseArgs)).rejects.toThrow(LlmCallError);
    expect(createFn).toHaveBeenCalledTimes(2);

    expect(mockDumpRaw).toHaveBeenCalledOnce();
    const payload = mockDumpRaw.mock.calls[0]![1] as Record<string, unknown>;
    expect((payload.attempts as string[])).toHaveLength(1);
    expect(payload.attempts).toContain('not valid json');
  });

  it('throws LlmFormatError after two consecutive format failures', async () => {
    const fakeClient = makeFakeClient(['not json', 'also not json']);
    __setLlmForTest(fakeClient);

    await expect(callLLM(baseArgs)).rejects.toThrow(LlmFormatError);

    const createFn = fakeClient.chat.completions.create as ReturnType<typeof vi.fn>;
    expect(createFn).toHaveBeenCalledTimes(2);
  });

  it('validation error triggers retry', async () => {
    const strictSchema = z.object({ value: z.number() });
    const fakeClient = makeFakeClient(['{"ok": true}', '{"value": 42}']);
    __setLlmForTest(fakeClient);

    const result = await callLLM({ ...baseArgs, schema: strictSchema });

    expect(result.parsed).toEqual({ value: 42 });

    const createFn = fakeClient.chat.completions.create as ReturnType<typeof vi.fn>;
    expect(createFn).toHaveBeenCalledTimes(2);
  });

  it('raw path is created and contents include both attempts in case of retry', async () => {
    const fakeClient = makeFakeClient(['invalid json', '{"ok": true}']);
    __setLlmForTest(fakeClient);

    await callLLM(baseArgs);

    expect(mockDumpRaw).toHaveBeenCalledOnce();
    const payload = mockDumpRaw.mock.calls[0]![1] as Record<string, unknown>;
    const attempts = payload.attempts as string[];
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toBe('invalid json');
    expect(attempts[1]).toBe('{"ok": true}');
    expect(payload.parsed).toEqual({ ok: true });
  });

  it('LlmFormatError carries a non-empty rawPath', async () => {
    const fakeClient = makeFakeClient(['bad', 'also bad']);
    __setLlmForTest(fakeClient);

    await expect(callLLM(baseArgs)).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof LlmFormatError)) return false;
      return err.rawPath.length > 0 && err.rawPath.includes('placeholder');
    });
  });

  it('raw blob includes both failed attempts when LlmFormatError is thrown', async () => {
    const fakeClient = makeFakeClient(['attempt1', 'attempt2']);
    __setLlmForTest(fakeClient);

    await expect(callLLM(baseArgs)).rejects.toThrow(LlmFormatError);

    expect(mockDumpRaw).toHaveBeenCalledOnce();
    const payload = mockDumpRaw.mock.calls[0]![1] as Record<string, unknown>;
    const attempts = payload.attempts as string[];
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toBe('attempt1');
    expect(attempts[1]).toBe('attempt2');
  });

  it('strips markdown fences from JSON response', async () => {
    const fakeClient = makeFakeClient(['```json\n{"ok": true}\n```']);
    __setLlmForTest(fakeClient);

    const result = await callLLM(baseArgs);
    expect(result.parsed).toEqual({ ok: true });
  });

  it('uses fast model when tier is fast', async () => {
    const createFn = vi.fn().mockImplementation(async () => {
      return makeCompletionResponse('{"ok": true}', 'claude-test-fast');
    });
    const fakeClient = { chat: { completions: { create: createFn } } } as unknown as OpenAI;
    __setLlmForTest(fakeClient);

    const result = await callLLM({ ...baseArgs, tier: 'fast' });

    expect(result.modelUsed).toBe('claude-test-fast');
    const callArgs = createFn.mock.calls[0]![0] as { model: string };
    expect(callArgs.model).toBe('claude-test-fast');
  });

  it('routes kind video_selection with runId to correct raw path', async () => {
    const fakeClient = makeFakeClient(['{"ok": true}']);
    __setLlmForTest(fakeClient);

    const result = await callLLM({
      ...baseArgs,
      context: { channelId: 'test-channel', runId: 42, kind: 'video_selection' },
    });

    expect(result.rawPath).toContain('video_selections');
    expect(result.rawPath).toContain('run-42-');
  });

  it('routes kind qualification with runId to correct raw path', async () => {
    const fakeClient = makeFakeClient(['{"ok": true}']);
    __setLlmForTest(fakeClient);

    const result = await callLLM({
      ...baseArgs,
      context: { channelId: 'test-channel', runId: 7, kind: 'qualification' },
    });

    expect(result.rawPath).toContain('qualifications');
    expect(result.rawPath).toContain('run-7-');
  });

  it('throws when video_selection is called without runId', async () => {
    const fakeClient = makeFakeClient(['{"ok": true}']);
    __setLlmForTest(fakeClient);

    await expect(
      callLLM({ ...baseArgs, context: { channelId: 'test-channel', kind: 'video_selection' } }),
    ).rejects.toThrow('runId is required');
  });

  it('throws when qualification is called without runId', async () => {
    const fakeClient = makeFakeClient(['{"ok": true}']);
    __setLlmForTest(fakeClient);

    await expect(
      callLLM({ ...baseArgs, context: { channelId: 'test-channel', kind: 'qualification' } }),
    ).rejects.toThrow('runId is required');
  });

  it('throws LlmCallError when the API call fails', async () => {
    const failingClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('Network error')),
        },
      },
    } as unknown as OpenAI;
    __setLlmForTest(failingClient);

    await expect(callLLM(baseArgs)).rejects.toThrow(LlmCallError);
    expect(mockDumpRaw).toHaveBeenCalledOnce();
    const payload = mockDumpRaw.mock.calls[0]![1] as Record<string, unknown>;
    expect(typeof payload.error).toBe('string');
  });
});
