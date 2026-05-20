# Plan: Agentic Qualification (two-step + transcripts)

**Branch:** `feat/08-agentic-qualification`
**Wave:** 3
**Depends on:** 05, 06, 07
**Estimated effort:** 3–4 days

## Overview

Implement the agentic qualification flow that is the heart of the system (spec §9). For each channel surviving plan 07's pre-qualification filter and video enrichment, run a two-step LLM pipeline: **step 1** classifies the 20 recent videos and autonomously selects 3–5 to examine in depth; **step 2** fetches the selected transcripts via plan 06; **step 3** produces the final structured assessment with metadata + step-1 reasoning + transcripts. The schema of the final assessment is identical to spec §9.4 (and §9.7) so downstream consumers (UI plan 12, draft generation plan 09) do not change.

## Context

Per spec §9, both step 1 and step 3 use `LLM_MODEL_THINK` via plan 05's `callLLM`. Step 1 produces `videoClassifications`, `formatConsistencySummary`, `selectedVideoIds`, `selectionRationale` — all persisted to `video_selections`. Step 2 calls plan 06's `getOrFetchManyTranscripts` (best-effort, non-blocking). Step 3 consumes truncated transcripts (~4,000 tokens per transcript via plan 05's `truncateMiddle`) and outputs the final assessment object that is written to `qualifications`. Re-qualification is skipped for any channel whose `lastQualifiedAt` is within `PIPELINE_REQUALIFY_AFTER_DAYS` unless force-flagged from the UI (plan 12). On failure of step 1 OR step 3 after one retry, the channel is marked `rejected_post_qual` with reason `'llm_format_failure'`.

## Validation Commands

- `pnpm typecheck`
- `pnpm test src/lib/llm src/lib/pipeline/qualification`
- `pnpm tsx scripts/qualify-one.ts <channelId>` — integration smoke against one real channel

### Task 1: Step 1 prompt and schema

- [ ] Create `src/lib/llm/prompts/select.ts`:
  - export `version = 'select-v1'`
  - export `system` — the exact text from spec §9.5
  - export `userTemplate(input: SelectInput): string` building the XML-tagged user message per spec §9.5

- [ ] Create `src/lib/llm/schemas.ts` (or extend it) with the zod schema for step 1 output:

```typescript
export const VideoClassificationSchema = z.object({
  videoId: z.string(),
  classification: z.enum(['format_anchor', 'representative', 'extemporaneous', 'outlier']),
  reasoning: z.string(),
  automationRelevanceScore: z.number().int().min(0).max(10),
});

export const SelectOutputSchema = z.object({
  videoClassifications: z.array(VideoClassificationSchema).length(20),
  formatConsistencySummary: z.string(),
  selectedVideoIds: z.array(z.string()).min(3).max(5),
  selectionRationale: z.string(),
});

export type SelectOutput = z.infer<typeof SelectOutputSchema>;
```

- [ ] Validation: confirm every `selectedVideoIds` entry appears in `videoClassifications` (post-parse business check in a separate function `validateSelectOutput`)
- [ ] Mark completed

### Task 2: Step 1 caller

- [ ] Create `src/lib/llm/select.ts`:

```typescript
export type SelectInput = {
  channel: ChannelDetail;
  aggregates: ChannelAggregates;
  videos: VideoDetail[]; // 20 most recent
};

export async function runVideoSelection(args: {
  channelId: string;
  runId: number;
  input: SelectInput;
}): Promise<{ selectionId: number; output: SelectOutput; usage: TokenUsage }>;
```

Behaviour:
- builds user message via `userTemplate`
- calls `callLLM` with `tier: 'think'`, `promptVersion: 'select-v1'`, `schema: SelectOutputSchema`, `context: { channelId, runId, kind: 'video_selection' }`
- on success: insert a `video_selections` row with `videoClassifications`, `selectedVideoIds`, `formatConsistencySummary`, `selectionRationale`, `modelUsed`, `promptVersion`, `inputTokens`, `outputTokens`, `latencyMs`, `rawResponsePath`
- run the business check `validateSelectOutput` (selectedIds ⊂ classifiedIds); on failure, throw `LlmBusinessRuleError` (handled upstream as a format failure)
- return `{ selectionId, output, usage }`

- [ ] Mark completed

### Task 3: Step 2 wiring

- [ ] Create `src/lib/pipeline/qualification/transcripts-stage.ts`:

```typescript
export async function fetchSelectedTranscripts(args: {
  channelId: string;
  selectedVideoIds: string[];
}): Promise<TranscriptFetchResult[]>;
```

- [ ] Thin wrapper around `getOrFetchManyTranscripts` (plan 06) that preserves input order and logs a `pipelineEvents` summary row with how many succeeded
- [ ] Mark completed

### Task 4: Step 3 prompt and schema

- [ ] Create `src/lib/llm/prompts/qualify.ts`:
  - export `version = 'qualify-v2'`
  - export `system` — the exact text from spec §9.7
  - export `userTemplate(input: QualifyInput): string` per spec §9.7, including `<your_earlier_classification>` and `<transcripts>` blocks

- [ ] Extend `src/lib/llm/schemas.ts` with the final assessment schema (spec §9.7 task block):

```typescript
export const AutomatableWorkflowSchema = z.object({
  name: z.string(),
  description: z.string(),
  automationApproach: z.string(),
  estimatedTimeSavedPerVideoMinutes: z.number().int().nonnegative(),
});

export const SignalSchema = z.object({
  type: z.enum(['positive', 'negative']),
  evidence: z.string(),
  videoId: z.string().nullable(),
});

export const QualifyOutputSchema = z.object({
  nicheClassification: z.string(),
  formatType: z.string(),
  automationPotentialScore: z.number().int().min(0).max(100),
  automatableWorkflows: z.array(AutomatableWorkflowSchema).max(5),
  suggestedSolution: z.string(),
  pitchAngle: z.string(),
  pitchLanguage: z.enum(['it', 'en']),
  signals: z.array(SignalSchema).min(2).max(8),
  disqualifiers: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

export type QualifyOutput = z.infer<typeof QualifyOutputSchema>;
```

- [ ] Mark completed

### Task 5: Step 3 caller

- [ ] Create `src/lib/llm/qualify.ts`:

```typescript
export type QualifyInput = SelectInput & {
  selection: SelectOutput;
  transcripts: Array<TranscriptFetchResult & { ok: true }>; // only successful ones
  failedTranscripts: Array<{ videoId: string; reason: string }>;
};

export async function runFinalQualification(args: {
  channelId: string;
  runId: number;
  videoSelectionId: number;
  input: QualifyInput;
}): Promise<{ qualificationId: number; output: QualifyOutput; usage: TokenUsage }>;
```

Behaviour:
- builds the user message via `userTemplate`, applying `truncateMiddle(transcript.text, 4000)` per transcript per spec §9.8
- if fewer than 5 transcripts succeeded, RELAX the cap proportionally (e.g. `Math.floor(20000 / successfulCount)`)
- calls `callLLM` with `tier: 'think'`, `promptVersion: 'qualify-v2'`, `schema: QualifyOutputSchema`, `context: { channelId, runId, kind: 'qualification' }`
- on success: insert a `qualifications` row populating every parsed field + `videoSelectionId` + token/latency/raw-path fields
- returns `{ qualificationId, output, usage }`
- Mark completed

### Task 6: Re-qualification policy

- [ ] Create `src/lib/pipeline/qualification/policy.ts`:

```typescript
export type RequalifyDecision =
  | { skip: true; reason: 'within_window' | 'no_videos' | 'wrong_status' }
  | { skip: false };

export async function shouldQualify(channelId: string, opts?: { force?: boolean }): Promise<RequalifyDecision>;
```

- [ ] Logic: skip if `force=false` AND `lastQualifiedAt` is within `filters.requalifyAfterDays`; skip if `discoveryStatus != 'enriched' && != 'qualified'`; skip if there are no rows in `videos` for the channel
- [ ] Mark completed

### Task 7: Per-channel orchestrator

- [ ] Create `src/lib/pipeline/qualification/qualify-channel.ts`:

```typescript
export async function qualifyChannel(args: {
  channelId: string;
  runId: number;
  force?: boolean;
}): Promise<{
  status: 'qualified' | 'skipped' | 'rejected_post_qual';
  reason?: string;
  qualificationId?: number;
}>;
```

Sequence:
1. `shouldQualify({ force })` → if skip, return `'skipped'`
2. Load channel (`getChannelById`) + last 20 videos (typed query helper) + `computeChannelAggregates`
3. **Step 1**: `runVideoSelection`
4. **Step 2**: `fetchSelectedTranscripts` (passes the `output.selectedVideoIds`)
5. **Step 3**: build `QualifyInput` merging step 1 output, successful transcripts, failed transcripts; call `runFinalQualification`
6. Update `channels`: `latestQualificationId`, `latestAutomationScore`, `lastQualifiedAt`, `discoveryStatus='qualified'`
7. Log `pipelineEvents`: `event='channel_qualified'`, `details={ score, transcriptsSuccessful, transcriptsFailed }`
8. Return `{ status: 'qualified', qualificationId }`

Error handling:
- `LlmFormatError` (after retry) at step 1 OR step 3 → mark `discoveryStatus='rejected_post_qual'`, `rejectionReason='llm_format_failure'`, log `event='channel_qualification_failed'`, return `'rejected_post_qual'`
- `LlmBusinessRuleError` from step 1 → same treatment
- Transient errors (network, proxy down) bubble up to the worker (plan 10) which decides whether to retry the whole run

- [ ] Mark completed

### Task 8: Batch orchestrator

- [ ] Create `src/lib/pipeline/qualification/run.ts`:

```typescript
export async function runQualification(args: {
  runId: number;
}): Promise<{
  qualified: number;
  skipped: number;
  rejected: number;
}>;
```

Behaviour:
- Selects channels WHERE `discoveryStatus='enriched'` ORDER BY `discoveredAt DESC` (caller already capped via `fetchVideosForSurvivingChannels`)
- Uses `pLimit(3)` to run up to 3 `qualifyChannel` calls concurrently
- Aggregates results; updates `pipelineRuns` counters: `channelsQualified`, `channelsPostRejected`, `llmCallsCount`, `llmTokensInput`, `llmTokensOutput`
- A single channel's failure does not abort the batch
- Mark completed

### Task 9: Force re-qualify hook

- [ ] Expose `forceRequalifyChannel(channelId: string): Promise<QualificationResult>` from `src/lib/pipeline/qualification/index.ts` for the UI (plan 12) to call from a server action
- [ ] Internally calls `qualifyChannel({ channelId, runId: null as any, force: true })` — a synthetic `pipelineRuns` row is created with `triggeredBy='manual'` and finalised when the call returns
- [ ] Mark completed

### Task 10: Integration test with mocked LLM and transcripts

- [ ] Create `src/lib/pipeline/qualification/__tests__/qualify-channel.integration.test.ts`:
  - in-memory DB + a test seam swapping `callLLM` for a deterministic mock that returns fixture JSON for step 1 and step 3
  - mock transcript fetcher: 3 of 5 succeed
  - seed: 1 channel + 20 videos
  - assert: 1 row in `video_selections`, 5 in `transcripts` (3 ok + 2 failed), 1 in `qualifications`, channel status updated, denormalised fields populated
- [ ] Add a second test where step 1 returns malformed JSON twice → channel rejected with `'llm_format_failure'`
- [ ] Add a third test where `selectedVideoIds` includes an ID not in `videoClassifications` → `LlmBusinessRuleError` → rejected
- [ ] Mark completed

### Task 11: Smoke script

- [ ] Create `scripts/qualify-one.ts`:
  - argv[2] is a channelId already present in the DB (run after plan 07's smoke)
  - calls `qualifyChannel({ channelId, runId, force: true })`
  - prints the resulting `QualifyOutput` and the latency/tokens for each step
- [ ] Mark completed

### Task 12: Definition of Done

- [ ] `pnpm typecheck` passes
- [ ] All unit and integration tests pass
- [ ] Smoke script against a real channel produces a complete `qualifications` row, a `video_selections` row, and ≥3 transcript rows
- [ ] Failed transcripts do not block step 3; final assessment is generated regardless
- [ ] Re-qualification is skipped within `requalifyAfterDays` unless `force=true`
- [ ] Raw blobs present under `data/raw/llm/video_selections/...` and `data/raw/llm/qualifications/...`
- [ ] `pipelineRuns` counters update correctly after a multi-channel batch
- [ ] Mark completed
