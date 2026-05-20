# Plan: Discovery, Enrichment & Pre-qualification Filter

**Branch:** `feat/07-discovery-pipeline`
**Wave:** 3
**Depends on:** 04
**Estimated effort:** 2–3 days

## Overview

Implement the entire pre-LLM half of the pipeline (spec §8): keyword sweep, category exploration, channel metadata enrichment, pre-qualification filter, and recent-video fetch. After this plan a single call to `runDiscovery(runId)` produces ~150 candidate channels per day with full metadata and ~50 surviving channels with 20 recent videos each — ready to be qualified by plan 08. Quota budget per run stays around 3,200 units, well below the 10,000-unit daily limit (spec §8.7).

## Context

Discovery combines **strategy A** (~30 keyword searches/day, 100 units each) and **strategy C** (one most-popular call per allowed category, 1 unit each, 11 categories — spec §8.2, §8.3). Channels are deduplicated by `youtube_channel_id`. The pre-qualification filter (spec §8.5) is a pure-DB operation: subscriber range, country, language, video count, recency. Video fetching is capped at `PIPELINE_TARGET_QUALIFIED_PER_RUN` (default 50) per run to stay in quota and to let plan 08's LLM stage operate at predictable cost.

## Validation Commands

- `pnpm typecheck`
- `pnpm test src/lib/pipeline`
- `pnpm tsx scripts/run-discovery.ts` — integration smoke (consumes ~3.2k quota units)

### Task 1: Seed keyword pool

- [x] Create `src/lib/seeds/keywords.ts` exporting the curated Italian keyword list from spec Appendix B (~70 keywords)
- [x] Create `scripts/seed-keywords.ts` that upserts each keyword into `seed_keywords` (idempotent: existing rows untouched, missing ones inserted)
- [x] Add npm script `seed:keywords` → `tsx scripts/seed-keywords.ts`
- [x] Run it as part of `pnpm bootstrap` (extend the bootstrap script from plan 03)
- [x] Mark completed

### Task 2: Category list

- [x] Create `src/lib/seeds/categories.ts`:

```typescript
export const IN_SCOPE_CATEGORY_IDS = [
  '2', // Autos & Vehicles
  '17', // Sports
  '19', // Travel & Events
  '20', // Gaming
  '22', // People & Blogs
  '23', // Comedy
  '24', // Entertainment
  '25', // News & Politics
  '26', // Howto & Style
  '27', // Education
  '28', // Science & Technology
] as const;
export type CategoryId = (typeof IN_SCOPE_CATEGORY_IDS)[number];
```

- [x] Source: spec Appendix C. Excluded: Music (10), Pets & Animals (15), Film & Animation (1), Nonprofits (29)
- [x] Mark completed

### Task 3: Keyword sweep

- [x] Create `src/lib/pipeline/discovery/keyword-sweep.ts`:

```typescript
export async function runKeywordSweep(args: {
  runId: number;
  keywordCount: number; // from settings.pipelineConfig.keywordsPerRun
}): Promise<{
  searchesPerformed: number;
  candidatesInserted: number;
  candidatesAlreadyKnown: number;
}>;
```

Behaviour:

- Select N keywords from `seed_keywords` where `isActive=true`, ordered by `lastUsedAt ASC NULLS FIRST` (oldest first; nulls = never used = highest priority)
- For each keyword:
  - Call `searchChannels({ query, runId })` from plan 04
  - Insert any new `channels` rows with `discoveryStatus='candidate'` and `discoverySource='keyword:<keyword>'`; update `discoveredAt` for new rows
  - Update `seed_keywords` row: `lastUsedAt=now()`, `totalUses+=1`, `totalCandidatesProduced += newCount`
- Log a `pipelineEvents` entry per keyword: `event='discovery_keyword_complete'`, `details={ keyword, newCount, alreadyKnownCount }`
- Update `pipelineRuns.searchesPerformed` and `pipelineRuns.candidatesFound`
- On `QuotaExhausted` (plan 04) mid-sweep: stop gracefully, log, return current totals
- [x] Mark completed

### Task 4: Category exploration

- [ ] Create `src/lib/pipeline/discovery/category-exploration.ts`:

```typescript
export async function runCategoryExploration(args: { runId: number }): Promise<{
  categoriesProcessed: number;
  candidatesInserted: number;
  candidatesAlreadyKnown: number;
}>;
```

Behaviour:

- For each `IN_SCOPE_CATEGORY_IDS`:
  - Call `getMostPopularByCategory({ categoryId, runId })` (plan 04) — extracts unique channel IDs from the most-popular videos
  - Insert new channels with `discoverySource='category:<id>'`
  - Log `pipelineEvents`: `event='discovery_category_complete'`, `details={ categoryId, newCount }`
- On `QuotaExhausted`: same graceful stop as keyword sweep
- Mark completed

### Task 5: Channel enrichment

- [ ] Create `src/lib/pipeline/discovery/enrichment.ts`:

```typescript
export async function enrichCandidateChannels(args: {
  runId: number;
}): Promise<{ enrichedCount: number; failedCount: number }>;
```

Behaviour:

- Query channels WHERE `discoveryStatus='candidate'` AND `lastFetchedAt IS NULL`
- Pass the IDs to `getChannels({ ids, runId })` (plan 04) — wrapper batches internally
- For each returned channel detail:
  - Update the `channels` row: `title`, `handle`, `description`, `country`, `defaultLanguage`, `customUrl`, `subscriberCount`, `viewCount`, `videoCount`, `uploadsPlaylistId`, `thumbnailUrl`, `channelPublishedAt`, `lastFetchedAt=now()`, `rawMetaPath=<from getChannels result>`
  - Set `discoveryStatus='enriched'`
- For channel IDs that come back missing from the API response (deleted/terminated): set `discoveryStatus='rejected_pre_qual'`, `rejectionReason='not_found'`
- Update `pipelineRuns.channelsEnriched`
- Log per-batch summary events
- Mark completed

### Task 6: Pre-qualification filter

- [ ] Create `src/lib/pipeline/discovery/filter.ts`:

```typescript
export async function applyPreQualificationFilter(args: {
  runId: number;
}): Promise<{ rejected: number; surviving: number }>;
```

Logic (spec §8.5), applied to channels WHERE `discoveryStatus='enriched'` AND no current `latestQualificationId`:

- If `subscriberCount < filters.minSubscribers` → `rejected_pre_qual`, reason `'below_min_subscribers'`
- If `subscriberCount > filters.maxSubscribers` → `rejected_pre_qual`, reason `'above_max_subscribers'`
- If `country IS NOT NULL AND country != filters.country` → reason `'wrong_country'`
- If `defaultLanguage IS NOT NULL AND defaultLanguage != filters.language` → reason `'wrong_language'`
- If `videoCount < 20` → reason `'too_few_videos'`

(`'inactive'` is applied AFTER video fetch in Task 7 because it needs the most recent upload date.)

- Read filters from settings via plan 03's `getFilters()` service
- Update `pipelineRuns.channelsPreRejected`
- One `pipelineEvents` row per rejected channel: `event='channel_pre_rejected'`, `details={ reason }`
- Mark completed

### Task 7: Video enrichment

- [ ] Create `src/lib/pipeline/discovery/video-enrichment.ts`:

```typescript
export async function fetchVideosForSurvivingChannels(args: {
  runId: number;
  limit: number; // settings.pipelineConfig.targetQualifiedPerRun
}): Promise<{
  channelsWithVideos: number;
  channelsInactive: number;
  videosFetched: number;
}>;
```

Behaviour:

- Select up to `limit` channels WHERE `discoveryStatus='enriched'` AND `latestQualificationId IS NULL` AND `uploadsPlaylistId IS NOT NULL`, ORDER BY `discoveredAt DESC` (newest first — we prefer fresh candidates over old leftovers)
- For each channel:
  - `getUploadsPlaylistItems({ playlistId, maxResults: 20, runId })` (plan 04)
  - If `videoIds` is empty OR most recent `publishedAt` is older than `filters.inactiveDays` ago → set `discoveryStatus='rejected_pre_qual'`, reason `'inactive'`, continue
  - `getVideos({ ids: videoIds, channelIdForStorage: channelId, runId })` (plan 04) — auto-batches into ≤50/call
  - For each `VideoDetail`: insert into `videos` table (idempotent on PK); store `tags`, `categoryId`, `defaultLanguage`, `defaultAudioLanguage`, `durationSeconds` (parsed from ISO 8601), `rawPath`
- Update `pipelineRuns.channelsEnriched` (only the channels that passed) — leave `discoveryStatus='enriched'` for the survivors; plan 08 will move them to `qualified` or `rejected_post_qual`
- Mark completed

### Task 8: ISO 8601 duration parser

- [ ] Create `src/lib/youtube/duration.ts`:

```typescript
export function parseIso8601Duration(iso: string): number;
// e.g. 'PT1H12M34S' → 4354
// Throws on unparseable input.
```

- [ ] Unit tests covering: seconds only, minutes only, hours+minutes+seconds, hours only, edge `PT0S`
- [ ] Mark completed

### Task 9: Aggregate stats computation

- [ ] Create `src/lib/pipeline/aggregates.ts`:

```typescript
export type ChannelAggregates = {
  uploadsPerWeekLast90d: number;
  avgDurationSeconds: number;
  durationStddevSeconds: number;
  avgViews: number;
  distinctCategories: number;
  titleLengthStddev: number;
};

export async function computeChannelAggregates(channelId: string): Promise<ChannelAggregates>;
```

- [ ] Reads the 20 most recent rows from `videos` for that channel
- [ ] Returns zeros when fewer than 3 videos exist (edge case)
- [ ] Will be consumed by plan 08's prompt building
- [ ] Unit tests with synthetic video fixtures
- [ ] Mark completed

### Task 10: Orchestrator

- [ ] Create `src/lib/pipeline/discovery/run.ts`:

```typescript
export async function runDiscovery(runId: number): Promise<{
  searchesPerformed: number;
  candidatesFound: number;
  channelsEnriched: number;
  channelsPreRejected: number;
  channelsReadyForQualification: number;
}>;
```

Sequence:

1. `runKeywordSweep`
2. `runCategoryExploration`
3. `enrichCandidateChannels`
4. `applyPreQualificationFilter`
5. `fetchVideosForSurvivingChannels`
6. Re-run `applyPreQualificationFilter`? No — `'inactive'` is already applied in step 5
7. Return summary; the worker (plan 10) hands off to plan 08's qualification stage

- [ ] Each step catches `QuotaExhausted` and short-circuits the whole orchestrator with a partial result + run status `'cancelled'`
- [ ] Mark completed

### Task 11: Integration test

- [ ] Create `src/lib/pipeline/__tests__/discovery.integration.test.ts`:
  - Use an in-memory SQLite + mocked YouTube operations (via the test seam from plan 04)
  - Fixture: 3 keywords + 2 categories → produces 8 channels
  - Half have <80k subs, half above → filter rejects 4
  - Survivors: 2 with recent uploads, 2 inactive → final pool = 2 with full video metadata
  - Assert correct row counts in `channels`, `videos`, `pipeline_events`, `quota_ledger`
- [ ] Mark completed

### Task 12: Smoke script

- [ ] Create `scripts/run-discovery.ts`:
  - opens a new `pipelineRuns` row
  - calls `runDiscovery(runId)`
  - prints the summary and the quota used
- [ ] Mark completed

### Task 13: Definition of Done

- [ ] `pnpm typecheck` passes
- [ ] All unit and integration tests pass
- [ ] `pnpm tsx scripts/seed-keywords.ts` populates `seed_keywords` with ~70 rows
- [ ] `pnpm tsx scripts/run-discovery.ts` against the real API produces:
  - 100–300 candidate channels in `channels`
  - 30–80 enriched survivors
  - ≤50 with full video metadata
  - ≤4,000 units consumed (matches spec §8.7)
- [ ] All raw blobs present under `data/raw/youtube/`
- [ ] All operations idempotent — re-running on the same day adds new keywords/categories but does not duplicate channels
- [ ] Mark completed
