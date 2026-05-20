# Plan: LLM Client & Prompt Infrastructure

**Branch:** `feat/05-llm-client`
**Wave:** 2
**Depends on:** 01, 02, 03
**Estimated effort:** 2 days

## Overview

Stand up the LLM layer used by plans 08 (qualification) and 09 (outreach drafts). Concretely: an OpenAI-SDK-based client pointing at the operator's local Claude proxy (spec §9.3), versioned prompt files, a generic `callLLM` wrapper that validates responses against a `zod` schema with retry-on-format-failure, raw-dump persistence per call, token/latency tracking, and a polite concurrency limit.

## Context

The LLM is reached via the operator's existing local proxy (e.g. `http://localhost:3456/v1`) exposing Claude through an OpenAI-compatible interface (spec §9, §14). The OpenAI SDK is configured with `baseURL` + a dummy `apiKey`. Two model names sit in `.env`: `LLM_MODEL_THINK` (used for high-value calls — step 1 selection and step 3 qualification in plan 08) and `LLM_MODEL_FAST` (used for outreach drafts in plan 09). Every call is wrapped by `callLLM` which enforces JSON-only output, validates against zod, retries once on schema failure with an appended correction message, and persists the full prompt-and-response envelope to `data/raw/llm/...`.

## Validation Commands

- `pnpm typecheck`
- `pnpm test src/lib/llm`
- `pnpm tsx scripts/llm-smoke.ts` — manual smoke, requires local proxy running

### Task 1: Install dependencies

- [x] Install `openai`, `p-limit`
- [x] Already installed in plan 03: `zod`
- [x] Mark completed

### Task 2: LLM client singleton

- [x] Create `src/lib/llm/client.ts`:

```typescript
import OpenAI from 'openai';
import { env } from '@/lib/env';

let _client: OpenAI | null = null;

export function getLlm(): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({
    baseURL: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
  });
  return _client;
}

export const MODELS = {
  think: () => env.LLM_MODEL_THINK,
  fast: () => env.LLM_MODEL_FAST,
} as const;

export type ModelTier = keyof typeof MODELS;
```

- [x] Mark completed

### Task 3: Prompt versioning

- [x] Create `src/lib/llm/prompts/` directory; each prompt is a TypeScript module exporting `system`, `userTemplate`, and `version`:

```typescript
// src/lib/llm/prompts/select.ts (real content delivered in plan 08)
export const version = 'select-v1';
export const system = `...`;
export function userTemplate(args: SelectInput): string { ... }
```

- [x] Establish the convention now with a placeholder prompt module `src/lib/llm/prompts/placeholder.ts` exporting `version='placeholder-v0'` and a trivial template — used only by tests
- [x] Mark completed

### Task 4: Concurrency limiter

- [x] Create `src/lib/llm/limiter.ts` with `pLimit(3)` for concurrent LLM calls
- [x] Mark completed

### Task 5: Generic `callLLM` wrapper

- [ ] Create `src/lib/llm/call.ts`:

```typescript
import { z, ZodSchema } from 'zod';

export type CallLlmArgs<T> = {
  tier: ModelTier;
  promptVersion: string; // e.g. 'select-v1'
  system: string;
  user: string;
  schema: ZodSchema<T>; // validates the parsed JSON response
  temperature?: number; // default 0.3
  maxTokens?: number; // default 4096
  // For raw-blob persistence; the caller knows the channel and run context.
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

export async function callLLM<T>(args: CallLlmArgs<T>): Promise<CallLlmResult<T>>;
```

Behaviour:

- runs inside `withLlmLimit`
- builds the OpenAI `chat.completions.create({ model, messages, temperature, max_tokens, response_format: { type: 'json_object' } if the proxy supports it; otherwise rely on prompt discipline })`
- measures latency with `performance.now()`
- on response: extract assistant text, attempt `JSON.parse`, strip markdown fences if present
- validate against `schema`
- **on parse OR validation failure**: retry once with an appended `user` message: `"Your previous response did not match the required JSON schema. Reply with the JSON only."` plus the previous assistant message; on the SECOND failure throw `LlmFormatError`
- dump raw envelope (system, user, full response, parsed, usage, latency, timestamp, prompt version, model) to disk via plan 03's `dumpRaw` at one of:
  - `paths.rawLlmVideoSelection(channelId, runId, ts)` for kind `video_selection`
  - `paths.rawLlmQualification(channelId, runId, ts)` for kind `qualification`
  - `paths.rawLlmDraft(channelId, ts)` for kind `draft`
  - `paths.rawLlmPlaceholder(...)` for kind `placeholder` (test-only)
- return `{ parsed, usage, latencyMs, modelUsed, rawPath }`

- [ ] Define `LlmFormatError`, `LlmCallError` exceptions; both carry `rawPath` so the caller can write a failure record
- [ ] Mark completed

### Task 6: Token estimation utility

- [ ] Create `src/lib/llm/tokens.ts`:

```typescript
export function estimateTokens(text: string): number;
// chars / 4 with a small empirical adjustment; used for prompt budgeting (plan 08
// transcript truncation). Not a substitute for the API's reported token count.

export function truncateMiddle(text: string, maxTokens: number): string;
// returns text whose estimate is <= maxTokens. If shorter, returns as-is.
// Otherwise keeps head ~60% and tail ~40% with a "[... N tokens omitted ...]"
// marker, per spec §9.8.
```

- [ ] Unit tests covering: short input untouched, long input truncated to within budget, marker present
- [ ] Mark completed

### Task 7: Smoke script

- [ ] Create `scripts/llm-smoke.ts`:
  - assert env present, local proxy reachable
  - issues a single `callLLM` with a trivial echo prompt (system: "Reply with exactly `{\"ok\": true}`") and the `placeholder` kind
  - asserts the parsed result matches `{ ok: true }`
  - prints model used, latency, tokens, raw path
- [ ] Mark completed

### Task 8: Tests with a mock proxy

- [ ] Create `src/lib/llm/__tests__/call.test.ts`:
  - mocks the OpenAI client (replace `getLlm()` via a `__setLlmForTest(fakeClient)` test seam)
  - test "happy path: parses, validates, persists raw, returns parsed"
  - test "retries once on JSON parse failure and succeeds on retry"
  - test "throws LlmFormatError after two consecutive format failures"
  - test "validation error triggers retry"
  - test "raw path is created and contents include both attempts in case of retry"
- [ ] Mark completed

### Task 9: Stats helpers

- [ ] Create `src/lib/llm/dashboard.ts`:

```typescript
export async function llmStatsForRun(runId: number): Promise<{
  callsCount: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
}>;
// Aggregates from `qualifications`, `video_selections`, `outreach_drafts` rows
// joined by runId where applicable.
```

- [ ] Will be consumed by the runs UI in plan 13
- [ ] Mark completed

### Task 10: Definition of Done

- [ ] `pnpm typecheck` passes
- [ ] All unit tests pass
- [ ] Smoke script returns a parsed JSON object in <5 seconds on the local proxy
- [ ] Two format-failure retries observed in a forced-failure unit test, with both attempts persisted in the raw blob
- [ ] `LLM_MODEL_THINK` and `LLM_MODEL_FAST` are switchable at runtime via env without code changes
- [ ] Mark completed
