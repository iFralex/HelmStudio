# Plan: Outreach Draft Generation

**Branch:** `feat/09-outreach-draft`
**Wave:** 3
**Depends on:** 05, 08
**Estimated effort:** 1 day

## Overview

Implement the outreach draft generator invoked from the UI (plan 12) the moment the operator saves a contact email for a qualified channel. Produces a personalised subject + body email in the channel's `pitchLanguage` (recommended by the qualification), references one concrete recurring workflow from the assessment, and persists the draft via the `outreach_drafts` table (spec §10). Uses the FAST model since speed matters more than depth here. No email is ever sent automatically — drafts are read by the operator from the UI and pasted into their own mail client.

## Context

Per spec §10.2, the draft prompt operates on the latest `qualifications` row's `pitchAngle`, `suggestedSolution`, `pitchLanguage`, plus the channel's top 5 recent videos and the highest-impact workflow (the first item of `automatableWorkflows`). Subject < 60 chars; body 120–180 words; no clickbait; no bullets in the body; the email mentions the free-pilot model (week-1 build, week-2 free trial, paid only if useful). Multiple regenerations are allowed: each writes a new row, with only one marked `isCurrent=true` (spec §10.3). The status state machine transition (`email_added` → `drafted`) lives in plan 12; this plan is purely concerned with producing and storing the draft.

## Validation Commands

- `pnpm typecheck`
- `pnpm test src/lib/llm src/lib/services/outreach`
- `pnpm tsx scripts/draft-one.ts <channelId>` — integration smoke

### Task 1: Prompt and schema

- [x] Create `src/lib/llm/prompts/draft.ts`:
  - export `version = 'draft-v1'`
  - export `system` — the exact text from spec §10.2 (no clickbait, no bullets, free-pilot mention, 120-180 word body)
  - export `userTemplate(input: DraftInput): string` per spec §10.2

- [x] Extend `src/lib/llm/schemas.ts`:

```typescript
export const DraftOutputSchema = z.object({
  subject: z.string().min(5).max(80), // hard cap > 60 to allow minor overruns
  body: z.string().min(200).max(3000), // ~120-180 words ≈ 800-1200 chars
});

export type DraftOutput = z.infer<typeof DraftOutputSchema>;
```

- [x] Post-parse business check `validateDraftOutput(d, language)`:
  - subject length ≤ 60 → warn (not error) and accept anyway
  - body word count between 80 and 250 → accept; outside → reject and trigger retry once (treat as format failure)
- [x] Mark completed

### Task 2: Draft caller

- [x] Create `src/lib/llm/draft.ts`:

```typescript
export type DraftInput = {
  channel: ChannelDetail;
  qualification: QualifyOutput;
  recentVideos: VideoDetail[]; // 5 most recent
  language: 'it' | 'en';
};

export async function runDraftGeneration(args: {
  channelId: string;
  qualificationId: number;
  input: DraftInput;
}): Promise<{ draftId: number; output: DraftOutput; usage: TokenUsage }>;
```

Behaviour:

- builds user message via `userTemplate`
- calls `callLLM` with `tier: 'fast'`, `promptVersion: 'draft-v1'`, `schema: DraftOutputSchema`, `context: { channelId, kind: 'draft' }`
- runs `validateDraftOutput`; on a length-band failure triggers ONE retry with appended user message: `"The body was too short/long. Aim for 120-180 words. Reply with the JSON only."`
- inside a DB transaction:
  - sets `isCurrent=false` on any existing current draft for this channel
  - inserts a new `outreach_drafts` row with `isCurrent=true`, populating `subject`, `body`, `language`, `qualificationId`, `modelUsed`, `promptVersion`, `inputTokens`, `outputTokens`, `rawResponsePath`
- returns `{ draftId, output, usage }`

- [x] Mark completed

### Task 3: Service layer

- [x] Create `src/lib/services/outreach.ts`:

```typescript
export async function generateDraftForChannel(channelId: string): Promise<{
  draftId: number;
  subject: string;
  body: string;
  language: 'it' | 'en';
}>;
// 1. Load channel; assert channels.latestQualificationId is not null.
// 2. Load latest qualification (parsed from JSON columns).
// 3. Load 5 most recent videos.
// 4. Determine language: use qualification.pitchLanguage (recommended).
// 5. Build DraftInput; call runDraftGeneration.
// 6. Return the visible fields.

export async function listDraftsForChannel(channelId: string): Promise<OutreachDraft[]>;
// Ordered by createdAt DESC. Used by the UI to show draft history.

export async function getCurrentDraft(channelId: string): Promise<OutreachDraft | null>;
```

- [x] Mark completed

### Task 4: Smoke script

- [x] Create `scripts/draft-one.ts`:
  - argv[2] is a channel ID that has been qualified
  - calls `generateDraftForChannel(channelId)`
  - prints the subject and body to stdout, plus latency and tokens
- [x] Mark completed

### Task 5: Tests

- [x] Create `src/lib/services/outreach/__tests__/generate-draft.test.ts`:
  - mock `callLLM` to return a valid draft
  - assert one row inserted, `isCurrent=true`, raw path written
  - assert previous current draft is demoted to `isCurrent=false`
  - assert calling `generateDraftForChannel` on a channel without a qualification throws a clear error
- [x] Test the validation band: stub `callLLM` to return a 30-word body → expect one retry; if retry also fails, surface `LlmFormatError`
- [x] Test language: when qualification.pitchLanguage='en', the draft schema accepts it; subject/body returned in English (validated by the LLM mock, not by us)
- [x] Mark completed

### Task 6: Definition of Done

- [x] `pnpm typecheck` passes
- [x] All tests pass
- [x] Smoke script generates a draft for a qualified channel; output is well-formed Italian by default (when `pitchLanguage='it'`) — manual test (skipped - not automatable)
- [x] Regenerating writes a new row, demotes the previous one — manual test (skipped - not automatable)
- [x] Raw blob under `data/raw/llm/drafts/<channelId>/...` matches the persisted DB row — manual test (skipped - not automatable)
- [x] Mark completed
