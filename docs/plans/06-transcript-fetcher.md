# Plan: Transcript Fetcher

**Branch:** `feat/06-transcript-fetcher`
**Wave:** 2
**Depends on:** 01, 02, 03
**Estimated effort:** 1 day

## Overview

Implement the transcript-fetching layer consumed by plan 08 (agentic qualification, step 2). Uses the `youtube-transcript` npm library against YouTube's public `timedtext` endpoint per the trade-off documented in spec §9.6. Provides language fallback (it → en → any), idempotent persistence into the `transcripts` table and `data/raw/transcripts/`, polite throttling, and best-effort semantics (failures are recorded but never thrown into the caller).

## Context

The official `captions` Data API would cost 250 quota units per transcript (spec §9.6) — infeasible. We accept the documented trade-off and use the public timedtext endpoint. The `transcripts.source` enum (`youtube_transcript` | `captions_api`, plan 02 schema) keeps the door open to a future migration. Failure modes are common (no captions enabled, regional restrictions, broken auto-generation) and must NEVER propagate into the qualification call — plan 08 needs a clean degradation path where transcripts are simply missing for some videos.

## Validation Commands

- `pnpm typecheck`
- `pnpm test src/lib/transcripts`
- `pnpm tsx scripts/transcript-smoke.ts -- <videoId>` — manual smoke against a real video

### Task 1: Install dependency

- [ ] Install `youtube-transcript` (latest)
- [ ] Pin the version in `package.json`; document in README that the library can break when YouTube changes the endpoint
- [ ] Mark completed

### Task 2: Fetcher API

- [ ] Create `src/lib/transcripts/fetcher.ts`:

```typescript
export type TranscriptSegment = {
  text: string;
  start: number;     // seconds
  duration: number;  // seconds
};

export type TranscriptFetchResult =
  | {
      ok: true;
      videoId: string;
      language: string;          // resolved code, e.g. 'it', 'en', 'it-IT'
      segments: TranscriptSegment[];
      text: string;              // segments joined with spaces
      characterCount: number;
    }
  | {
      ok: false;
      videoId: string;
      reason:
        | 'no_captions'
        | 'unavailable'
        | 'forbidden'
        | 'rate_limited'
        | 'parse_error'
        | 'unknown';
      message: string;
    };

export async function fetchTranscript(
  videoId: string,
  opts?: { preferredLanguages?: string[] }, // default ['it', 'en']
): Promise<TranscriptFetchResult>;
// Tries each preferredLanguage in order, then unspecified language (any),
// and classifies the failure mode if all attempts fail.
```

- [ ] Use `youtube-transcript`'s `YoutubeTranscript.fetchTranscript(videoId, { lang })`; map its thrown errors to the `reason` enum
- [ ] Auto-generated transcripts are accepted (no quality filtering at this layer)
- [ ] Mark completed

### Task 3: Persistence layer

- [ ] Create `src/lib/transcripts/store.ts`:

```typescript
export async function getOrFetchTranscript(args: {
  videoId: string;
  channelId: string;
}): Promise<TranscriptFetchResult>;
// 1. Look up `transcripts` table for this videoId.
//    - If a row exists with fetchSucceeded=true → load text from rawPath if `text`
//      column is null (older row); return as an `ok: true` result.
//    - If a row exists with fetchSucceeded=false AND fetchedAt is younger than
//      24h → return the recorded failure (don't hammer the endpoint).
// 2. Otherwise call fetchTranscript(...).
// 3. On success: insert/update transcripts row (source='youtube_transcript');
//    dump raw envelope (params, segments, language, fetchedAt) via dumpRaw to
//    paths.rawTranscript(channelId, videoId).
// 4. On failure: insert a transcripts row with fetchSucceeded=false and
//    fetchError = reason + ': ' + message.
// 5. Always return the result.

export async function deleteTranscriptsForChannel(channelId: string): Promise<void>;
// Used by GDPR deletion (plan 12). Removes DB rows AND the data/raw/transcripts/
// directory for the channel.
```

- [ ] All writes idempotent on `videoId`
- [ ] Mark completed

### Task 4: Polite throttling

- [ ] Create `src/lib/transcripts/limiter.ts`:

```typescript
import pLimit from 'p-limit';

const limit = pLimit(2);          // max 2 concurrent timedtext fetches
const DELAY_BETWEEN_MS = 200;

let lastFinishedAt = 0;

export async function withTranscriptLimit<T>(fn: () => Promise<T>): Promise<T> {
  return limit(async () => {
    const elapsed = Date.now() - lastFinishedAt;
    if (elapsed < DELAY_BETWEEN_MS) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS - elapsed));
    }
    try {
      return await fn();
    } finally {
      lastFinishedAt = Date.now();
    }
  });
}
```

- [ ] Wrap `fetchTranscript` body inside this limiter
- [ ] Mark completed

### Task 5: Batch helper

- [ ] Create `src/lib/transcripts/batch.ts`:

```typescript
export async function getOrFetchManyTranscripts(args: {
  channelId: string;
  videoIds: string[];
  preferredLanguages?: string[];
}): Promise<TranscriptFetchResult[]>;
// Runs through the throttle; preserves input order in output; never throws.
// Used directly by plan 08's step-2 orchestration.
```

- [ ] Logs at `info` level a one-line summary per video (videoId, ok/reason, character count, language)
- [ ] Mark completed

### Task 6: Smoke script

- [ ] Create `scripts/transcript-smoke.ts`:
  - argv[2] is a video ID (e.g. a known Italian news clip)
  - calls `fetchTranscript(videoId)` and prints first 200 chars + total length + language + first segment timing
- [ ] Mark completed

### Task 7: Tests

- [ ] Create `src/lib/transcripts/__tests__/fetcher.test.ts`:
  - mock `YoutubeTranscript.fetchTranscript` via a Vitest spy
  - test "returns ok when first language succeeds"
  - test "falls back from 'it' to 'en' and succeeds"
  - test "returns no_captions when all attempts fail with no-captions errors"
  - test "classifies rate_limit / forbidden / unavailable correctly from thrown error messages"
- [ ] Create `src/lib/transcripts/__tests__/store.test.ts`:
  - test "first call writes DB row + raw file; second call reuses cached"
  - test "stores a failure row and short-circuits subsequent calls within 24h"
  - test "deleteTranscriptsForChannel clears DB and raw directory"
- [ ] Mark completed

### Task 8: Definition of Done

- [ ] `pnpm typecheck` passes
- [ ] All unit tests pass
- [ ] Smoke script successfully retrieves transcript for a known good video, classifies "no_captions" for a known music video, classifies "unavailable" for a deleted video
- [ ] No transcript fetch raises an uncaught exception — every error path produces a structured `TranscriptFetchResult`
- [ ] Concurrency limit observed: a synthetic 10-video batch never has more than 2 in flight
- [ ] Mark completed
