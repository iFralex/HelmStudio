# Plan: YouTube Data API Client & Quota Tracker

**Branch:** `feat/04-youtube-client`
**Wave:** 2
**Depends on:** 01, 02, 03
**Estimated effort:** 2 days

## Overview

Wrap the official `googleapis` SDK with typed, quota-aware functions for the four operations the pipeline uses: `search.list`, `channels.list`, `playlistItems.list`, `videos.list`. Add a strict quota ledger that refuses calls once the daily budget is exhausted (spec §13), persists every raw response to disk per spec §7, and applies a polite concurrency limit. This plan does not yet _use_ the client for the pipeline — that's plan 07; here we deliver the building blocks plus a CLI smoke script.

## Context

The YouTube Data API v3 free tier is 10,000 units/day, resetting at midnight Pacific Time. Unit costs per operation are fixed (spec §13.1, §8.7). The quota ledger is persisted in the `quota_ledger` table (plan 02) and every API wrapper consults it transactionally: any call that would push spent units over `DAILY_LIMIT - SAFETY_BUFFER` throws `QuotaExhausted`. We hardcode no business logic about _what_ to search or fetch — the pipeline plans drive that. We also do not enforce a per-call retry policy beyond exponential backoff for transient 5xx and 429.

## Validation Commands

- `pnpm typecheck`
- `pnpm test src/lib/youtube`
- `pnpm tsx scripts/youtube-smoke.ts` — manual smoke, asserts <100 units consumed

### Task 1: Install dependencies

- [x] Install `googleapis` and `p-limit`
- [x] Mark completed

### Task 2: Client singleton

- [x] Create `src/lib/youtube/client.ts`:

```typescript
import { google, youtube_v3 } from 'googleapis';
import { env } from '@/lib/env';

let _yt: youtube_v3.Youtube | null = null;

export function getYoutube(): youtube_v3.Youtube {
  if (_yt) return _yt;
  _yt = google.youtube({ version: 'v3', auth: env.YOUTUBE_API_KEY });
  return _yt;
}
```

- [x] Mark completed

### Task 3: Quota ledger

- [x] Create `src/lib/youtube/quota.ts`:

```typescript
export type YoutubeOperation =
  | 'search.list'
  | 'channels.list'
  | 'playlistItems.list'
  | 'videos.list';

export const OPERATION_COSTS: Record<YoutubeOperation, number> = {
  'search.list': 100,
  'channels.list': 1,
  'playlistItems.list': 1,
  'videos.list': 1,
};

export class QuotaExhausted extends Error {
  constructor(
    public readonly spent: number,
    public readonly cap: number,
  ) {
    super(`YouTube quota exhausted: ${spent}/${cap} units used today`);
    this.name = 'QuotaExhausted';
  }
}

export async function assertHeadroom(operation: YoutubeOperation, runId?: number): Promise<void>;
// reads today's spent units (Pacific-Time date) and throws QuotaExhausted if
// spent + cost > DAILY_LIMIT - SAFETY_BUFFER

export async function recordQuotaUse(operation: YoutubeOperation, runId?: number): Promise<void>;
// inserts a row in quota_ledger

export async function todayUnitsSpent(): Promise<number>;
// SUM(units) where date = today (Pacific)

export function pacificDateString(d = new Date()): string;
// returns YYYY-MM-DD in America/Los_Angeles
```

- [x] Use `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', ... })` for the Pacific date string
- [x] Unit tests for `pacificDateString` boundary (UTC 06:00 = previous Pacific day, etc.)
- [x] Mark completed

### Task 4: Operation wrappers

- [x] Create `src/lib/youtube/operations.ts` with **typed** wrappers around each operation we use, each:
  - calling `assertHeadroom`
  - performing the SDK call
  - calling `recordQuotaUse`
  - dumping the raw response envelope to disk via plan 03's `dumpRaw`
  - returning a typed, narrowed view of the response

```typescript
export async function searchChannels(params: {
  query: string;
  pageToken?: string;
  maxResults?: number; // default 50
  regionCode?: string; // default env.PIPELINE_TARGET_COUNTRY
  relevanceLanguage?: string; // default env.PIPELINE_TARGET_LANGUAGE
  runId?: number;
}): Promise<{ channelIds: string[]; nextPageToken: string | null; rawPath: string }>;

export async function getChannels(params: {
  ids: string[]; // up to 50
  runId?: number;
}): Promise<{ channels: ChannelDetail[]; rawPaths: Record<string, string> }>;
// rawPaths is { channelId -> relative path to a per-channel slice of the response }

export async function getMostPopularByCategory(params: {
  categoryId: string;
  regionCode?: string;
  maxResults?: number;
  runId?: number;
}): Promise<{ channelIds: string[]; rawPath: string }>;
// uses videos.list?chart=mostPopular and extracts channelId of each video

export async function getUploadsPlaylistItems(params: {
  playlistId: string;
  maxResults?: number; // default 20
  runId?: number;
}): Promise<{ videoIds: string[]; rawPath: string }>;

export async function getVideos(params: {
  ids: string[]; // up to 50
  channelIdForStorage: string; // for the raw blob path
  runId?: number;
}): Promise<{ videos: VideoDetail[]; rawPath: string }>;
```

- [x] `ChannelDetail` and `VideoDetail` are concrete types defined in `src/lib/youtube/types.ts`, including the fields written into the `channels` and `videos` tables (spec §6.1)
- [x] `getChannels` MUST chunk inputs into batches of 50 transparently (caller can pass any count); each batch is one `channels.list` call and one quota unit
- [x] Same for `getVideos`
- [x] Mark completed

### Task 5: Concurrency limiter

- [x] Create `src/lib/youtube/limiter.ts`:

```typescript
import pLimit from 'p-limit';
const ytLimit = pLimit(2);
export const withYoutubeLimit = <T>(fn: () => Promise<T>) => ytLimit(fn);
```

- [x] Wrap every SDK call inside `withYoutubeLimit` in `operations.ts`
- [x] Mark completed

### Task 6: Retry policy

- [x] Create `src/lib/youtube/retry.ts` with `withRetry(fn, { attempts: 4, baseMs: 500 })`:
  - retries on `ECONNRESET`, `ETIMEDOUT`, HTTP 5xx, HTTP 429
  - does NOT retry on 400/401/403/404 (those are programmer errors or genuine misses)
  - jittered exponential backoff: `min(baseMs * 2^attempt + random(0..250), 10s)`
- [x] Apply `withRetry` inside the operation wrappers, AROUND the SDK call (so a successful retry still records quota only once)
- [x] Mark completed

### Task 7: Smoke script

- [x] Create `scripts/youtube-smoke.ts`:
  - assert `YOUTUBE_API_KEY` present
  - call `searchChannels({ query: 'rassegna stampa' })` → log first 3 channel IDs
  - call `getChannels({ ids: [first 3] })` → log titles and subscriber counts
  - print quota used so far today
- [x] This script writes to `data/raw/...` so a successful run also exercises the storage layer
- [x] Mark completed

### Task 8: Unit tests with VCR-style fixtures

- [x] Install `nock` (or use Vitest's `vi.spyOn` directly)
- [x] Capture once: a real `search.list`, `channels.list`, `videos.list` response to a fixtures directory (run smoke script with a `--record` flag that writes responses to `src/lib/youtube/__tests__/fixtures/`)
- [x] Tests:
  - "searchChannels parses channelIds and pageToken"
  - "getChannels batches >50 ids into multiple calls and aggregates results"
  - "operation throws QuotaExhausted when budget tight"
  - "recordQuotaUse persists a ledger row"
  - "raw blob path is stored and readable round-trip"
- [x] Mark completed

### Task 9: Quota dashboard helper

- [x] Create `src/lib/youtube/dashboard.ts`:

```typescript
export async function quotaSummary(): Promise<{
  date: string;
  spent: number;
  cap: number;
  safetyBuffer: number;
  remaining: number;
  byOperation: Record<YoutubeOperation, number>;
}>;
```

- [x] Will be consumed by the dashboard UI in plan 11 — define it now so the contract is stable
- [x] Mark completed

### Task 10: Definition of Done

- [ ] `pnpm typecheck` passes
- [ ] All tests pass (unit + smoke)
- [ ] Smoke script consumes ≤120 quota units when run end-to-end
- [ ] `quota_ledger` rows match the operations called
- [ ] Raw blobs land at the paths defined in plan 03 (`data/raw/youtube/...`)
- [ ] `QuotaExhausted` is raised correctly when the safety buffer threshold is crossed (integration test injects a high pre-existing `quota_ledger` total)
- [ ] Mark completed
