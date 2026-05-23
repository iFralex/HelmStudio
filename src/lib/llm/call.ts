import { ZodSchema } from 'zod';
import { getLlm, MODELS, ModelTier } from './client';
import { withLlmLimit } from './limiter';
import { paths, tsForFilename } from '@/lib/storage/paths';
import { dumpRaw } from '@/lib/storage/raw';
import { computeCostUsd } from './pricing';

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

export type TokenUsage = { inputTokens: number; outputTokens: number; costUsd: number | null };

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
  usage: TokenUsage;
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

const REPAIR_SYSTEM =
  'You are a JSON repair assistant. ' +
  'You receive broken or schema-invalid JSON output and a description of the problem. ' +
  'Fix the JSON so it is valid and matches the required schema. ' +
  'Return ONLY the corrected JSON. No markdown fences. No explanations.';

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
    let rawTokens = { inputTokens: 0, outputTokens: 0 };
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
        service_tier: 'flex',
      });
      modelUsed = response.model ?? model;
      if (response.usage) {
        rawTokens = {
          inputTokens: rawTokens.inputTokens + response.usage.prompt_tokens,
          outputTokens: rawTokens.outputTokens + response.usage.completion_tokens,
        };
      }
      return response.choices[0]?.message?.content ?? '';
    }

    function tryParse(text: string): { ok: true; parsed: T } | { ok: false; errorHint: string } {
      try {
        const obj = JSON.parse(stripMarkdownFences(text));
        const result = schema.safeParse(obj);
        if (result.success) return { ok: true, parsed: result.data };
        return { ok: false, errorHint: `Schema validation failed: ${result.error.message}` };
      } catch {
        return { ok: false, errorHint: 'The output is not valid JSON — it cannot be parsed.' };
      }
    }

    const buildUsage = (): TokenUsage => ({
      ...rawTokens,
      costUsd: computeCostUsd(modelUsed, rawTokens.inputTokens, rawTokens.outputTokens),
    });

    async function dump(extra: Record<string, unknown>): Promise<void> {
      await dumpRaw(rawPath, {
        promptVersion,
        system,
        user,
        attempts: attemptTexts,
        usage: buildUsage(),
        latencyMs: performance.now() - start,
        timestamp: new Date().toISOString(),
        model: modelUsed,
        ...extra,
      });
    }

    // Attempt 1: original prompt
    let firstText: string;
    try {
      firstText = await doApiCall([{ role: 'system', content: system }, { role: 'user', content: user }]);
    } catch (err) {
      await dump({ error: String(err) });
      throw new LlmCallError(`LLM API call failed: ${String(err)}`, rawPath);
    }
    attemptTexts.push(firstText);

    const firstResult = tryParse(firstText);
    if (firstResult.ok) {
      await dump({ parsed: firstResult.parsed });
      return { parsed: firstResult.parsed, usage: buildUsage(), latencyMs: performance.now() - start, modelUsed, rawPath };
    }

    // Attempts 2–3: dedicated JSON repair calls
    let lastErrorHint = firstResult.errorHint;
    for (let i = 0; i < 2; i++) {
      const brokenText = attemptTexts[attemptTexts.length - 1]!;
      let repairText: string;
      try {
        repairText = await doApiCall([
          { role: 'system', content: REPAIR_SYSTEM },
          { role: 'user', content: `Problem: ${lastErrorHint}\n\nBroken JSON:\n${brokenText}` },
        ]);
      } catch (err) {
        await dump({ error: String(err) });
        throw new LlmCallError(`LLM repair call failed: ${String(err)}`, rawPath);
      }
      attemptTexts.push(repairText);

      const repairResult = tryParse(repairText);
      if (repairResult.ok) {
        await dump({ parsed: repairResult.parsed });
        return { parsed: repairResult.parsed, usage: buildUsage(), latencyMs: performance.now() - start, modelUsed, rawPath };
      }
      lastErrorHint = repairResult.errorHint;
    }

    // All 3 attempts failed
    await dump({ error: lastErrorHint });
    throw new LlmFormatError('LLM response failed schema validation after 3 attempts', rawPath);
  });
}
