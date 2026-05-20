import { ZodSchema } from 'zod';
import { getLlm, MODELS, ModelTier } from './client';
import { withLlmLimit } from './limiter';
import { paths, tsForFilename } from '@/lib/storage/paths';
import { dumpRaw } from '@/lib/storage/raw';

export class LlmFormatError extends Error {
  constructor(
    message: string,
    public readonly rawPath: string,
  ) {
    super(message);
    this.name = 'LlmFormatError';
  }
}

export class LlmCallError extends Error {
  constructor(
    message: string,
    public readonly rawPath: string,
  ) {
    super(message);
    this.name = 'LlmCallError';
  }
}

export class LlmBusinessRuleError extends Error {
  constructor(
    message: string,
    public readonly rawPath: string,
  ) {
    super(message);
    this.name = 'LlmBusinessRuleError';
  }
}

export type TokenUsage = { inputTokens: number; outputTokens: number };

export type CallLlmArgs<T> = {
  tier: ModelTier;
  promptVersion: string;
  system: string;
  user: string;
  schema: ZodSchema<T>;
  temperature?: number;
  maxTokens?: number;
  context: {
    channelId: string;
    runId?: number;
    kind: 'video_selection' | 'qualification' | 'draft' | 'placeholder';
  };
};

export type CallLlmResult<T> = {
  parsed: T;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
  modelUsed: string;
  rawPath: string;
};

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
}

function buildRawPath(
  context: CallLlmArgs<unknown>['context'],
  ts: string,
): string {
  const { channelId, runId, kind } = context;
  switch (kind) {
    case 'video_selection':
      if (runId === undefined) throw new Error('runId is required for kind video_selection');
      return paths.rawLlmVideoSelection(channelId, runId, ts);
    case 'qualification':
      if (runId === undefined) throw new Error('runId is required for kind qualification');
      return paths.rawLlmQualification(channelId, runId, ts);
    case 'draft':
      return paths.rawLlmDraft(channelId, ts);
    case 'placeholder':
      return paths.rawLlmPlaceholder(channelId, ts);
  }
}

export async function callLLM<T>(args: CallLlmArgs<T>): Promise<CallLlmResult<T>> {
  return withLlmLimit(async () => {
    const {
      tier,
      promptVersion,
      system,
      user,
      schema,
      temperature = 0.3,
      maxTokens = 4096,
      context,
    } = args;

    const model = MODELS[tier];
    const llm = getLlm();
    const ts = tsForFilename();
    const rawPath = buildRawPath(context, ts);
    const start = performance.now();

    const attemptTexts: string[] = [];
    let usage = { inputTokens: 0, outputTokens: 0 };
    let modelUsed = model;

    async function doApiCall(
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    ): Promise<string> {
      const response = await llm.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      });
      modelUsed = response.model ?? model;
      if (response.usage) {
        usage = {
          inputTokens: usage.inputTokens + response.usage.prompt_tokens,
          outputTokens: usage.outputTokens + response.usage.completion_tokens,
        };
      }
      return response.choices[0]?.message?.content ?? '';
    }

    function tryParse(text: string): { ok: true; parsed: T } | { ok: false; error: unknown } {
      try {
        const obj = JSON.parse(stripMarkdownFences(text));
        const result = schema.safeParse(obj);
        if (result.success) return { ok: true, parsed: result.data };
        return { ok: false, error: result.error };
      } catch (e) {
        return { ok: false, error: e };
      }
    }

    const systemMsg = { role: 'system' as const, content: system };

    // First attempt
    let firstText: string;
    try {
      firstText = await doApiCall([systemMsg, { role: 'user', content: user }]);
    } catch (err) {
      const latencyMs = performance.now() - start;
      await dumpRaw(rawPath, {
        promptVersion,
        system,
        user,
        attempts: [],
        usage,
        latencyMs,
        timestamp: new Date().toISOString(),
        model: modelUsed,
        error: String(err),
      });
      throw new LlmCallError(`LLM API call failed: ${String(err)}`, rawPath);
    }
    attemptTexts.push(firstText);

    const firstResult = tryParse(firstText);
    if (firstResult.ok) {
      const latencyMs = performance.now() - start;
      await dumpRaw(rawPath, {
        promptVersion,
        system,
        user,
        attempts: attemptTexts,
        parsed: firstResult.parsed,
        usage,
        latencyMs,
        timestamp: new Date().toISOString(),
        model: modelUsed,
      });
      return { parsed: firstResult.parsed, usage, latencyMs, modelUsed, rawPath };
    }

    // Retry once with correction message
    let secondText: string;
    try {
      secondText = await doApiCall([
        systemMsg,
        { role: 'user', content: user },
        { role: 'assistant', content: firstText },
        {
          role: 'user',
          content:
            'Your previous response did not match the required JSON schema. Reply with the JSON only.',
        },
      ]);
    } catch (err) {
      const latencyMs = performance.now() - start;
      await dumpRaw(rawPath, {
        promptVersion,
        system,
        user,
        attempts: attemptTexts,
        usage,
        latencyMs,
        timestamp: new Date().toISOString(),
        model: modelUsed,
        error: String(err),
      });
      throw new LlmCallError(`LLM API call failed on retry: ${String(err)}`, rawPath);
    }
    attemptTexts.push(secondText);

    const secondResult = tryParse(secondText);
    const latencyMs = performance.now() - start;

    if (secondResult.ok) {
      await dumpRaw(rawPath, {
        promptVersion,
        system,
        user,
        attempts: attemptTexts,
        parsed: secondResult.parsed,
        usage,
        latencyMs,
        timestamp: new Date().toISOString(),
        model: modelUsed,
      });
      return { parsed: secondResult.parsed, usage, latencyMs, modelUsed, rawPath };
    }

    // Both attempts failed
    await dumpRaw(rawPath, {
      promptVersion,
      system,
      user,
      attempts: attemptTexts,
      usage,
      latencyMs,
      timestamp: new Date().toISOString(),
      model: modelUsed,
      error: String(secondResult.error),
    });
    throw new LlmFormatError(
      'LLM response failed schema validation after 2 attempts',
      rawPath,
    );
  });
}
