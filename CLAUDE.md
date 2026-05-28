# CLAUDE.md

This file documents architectural decisions, conventions, and non-obvious facts for AI agents working on this codebase.

## Commands

```bash
pnpm dev           # start dev server with Turbopack at http://localhost:3000
pnpm build         # production build
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint
pnpm format        # prettier --write .
pnpm format:check  # prettier --check .
pnpm test          # vitest run (unit tests under src/)
pnpm test:e2e      # playwright test (E2E tests under e2e/)
pnpm bootstrap     # first-run setup: copy .env, create data/ dirs, run db:init
pnpm db:init       # create data/ dir, run migrations, seed default settings (first run only)
pnpm db:generate   # generate new migration from schema changes
pnpm db:migrate    # apply pending migrations
pnpm db:studio     # open Drizzle Studio browser UI
pnpm worker:run    # run a full cron-mode pipeline cycle (discovery + qualification); consumes real quota
pnpm worker:manual # same as worker:run but sets triggeredBy='manual'
pnpm tsx scripts/llm-smoke.ts  # manual LLM connectivity smoke test (requires local proxy)
pnpm tsx scripts/transcript-smoke.ts <videoId>  # manual transcript fetch smoke test (no API key required)
pnpm seed:keywords             # upsert ~70 curated Italian keywords into seed_keywords (idempotent)
pnpm tsx scripts/run-discovery.ts  # manual discovery pipeline smoke run (~3,200 quota units consumed)
pnpm tsx scripts/qualify-one.ts <channelId>  # force-qualify one channel already in the DB (requires live LLM proxy)
pnpm tsx scripts/draft-one.ts <channelId>    # generate outreach draft for a qualified channel (requires live LLM proxy)
pnpm draft:add --channel <id|@handle> --subject "..." (--body "..." | --body-file f.txt) [--lang it|en] [--name "Mario"]  # manually add an outreach draft before an email address is entered (no LLM, no quota)
pnpm draft:prompt --channel <id|@handle>  # print the exact LLM prompt (JSON {system, user, language}) that would generate the draft email — no LLM call, no quota
pnpm channels:top [--limit N]  # print top N qualified channels by automation score with no email yet (best outreach leads), as JSON; default N=10
```

## Language convention

All user-facing UI strings must be in Italian. All code identifiers, comments, log messages, and plan files use English.

## Authentication architecture

- Single shared password held in `ADMIN_PASSWORD` env var; no users table.
- Sessions are HMAC-SHA256 signed cookies: `base64url(payload).base64url(sig)` where payload is `{ exp: timestamp }`.
- Cookie name: `session`. Duration: 30 days (hardcoded in `src/lib/auth.ts`).
- `SESSION_SECRET` must be at least 32 characters; validated on every use via `getSecret()`.
- Middleware lives at `src/middleware.ts`. Public paths: `/login`, `/api/auth` (and sub-paths).
- All protected app pages live under the `(app)` route group.

## Route structure

- `src/app/(app)/` — authenticated zone; all future feature pages go here
- `src/app/login/` — public login page
- `src/app/api/auth/route.ts` — POST login, sets `session` cookie
- `src/app/api/auth/logout/route.ts` — POST logout, clears `session` cookie
- `src/app/api/pipeline/run/route.ts` — POST: spawns the worker process if no run is active (202), or returns 409 `{ ok: false, error: 'run_already_active', runId }` if one is
- `src/app/api/pipeline/status/route.ts` — GET: returns `{ active, latestRun, quota, queues }` by composing `isRunActive()`, `getLatestRun()`, `quotaSummary()`, and `countChannelsByStatus()`; polled by the dashboard
- `src/app/api/raw/route.ts` — GET `/api/raw?path=<relativePath>`: serves a raw JSON file from `DATA_DIR/raw/` as a download attachment. Validates the resolved path is strictly inside `DATA_DIR/raw/` (path traversal guard); returns 400 on missing path, 403 if path escapes the raw directory, 404 if file is absent. Used by the channel detail page to let operators download LLM/qualification envelopes.
- `src/app/(app)/runs/page.tsx` — paginated list of pipeline runs; `?before=<ms-timestamp>` for cursor-based pagination (50 per page).
- `src/app/(app)/runs/[id]/page.tsx` — run detail: counters, filterable events table, error banner; auto-refreshes every 5 s when status is `running` via the `RunPoller` client island (`run-poller.tsx`).
- `src/app/(app)/settings/page.tsx` — settings page: filters form, pipeline-config form, keywords CRUD, read-only LLM model info, read-only prompt versions, CSV export link.
- `src/app/api/channels/export/route.ts` — GET `/api/channels/export`: accepts same filter query params as `/channels`; streams RFC 4180 CSV in 500-row pages (max 1,000 pages); filename `canali-YYYY-MM-DD.csv`.

## UI components

- shadcn/ui components are in `src/components/ui/`. Tailwind v4 is in use (not v3).
- The `cn` utility (clsx + tailwind-merge) is exported from `src/lib/utils.ts`.
- PostCSS config: `postcss.config.mjs`.
- Italian UI strings live in `src/lib/ui/copy.ts` as the `copy` object, grouped by page (`copy.nav`, `copy.dashboard`, `copy.channels`, `copy.outreachStatus`, `copy.channelDetail`, `copy.runs`, `copy.settings`). Always use `copy.*` in components — never hardcode Italian strings.
- Formatting utilities live in `src/lib/ui/format.ts`: `formatCompact` (compact locale number), `formatNumber`, `formatDate`, `formatDateTime` (includes time), `formatRelative` (uses `Intl.RelativeTimeFormat`, no extra dependency), `statusColor` (running → `'blue'`, completed → `'green'`, failed → `'red'`, cancelled → `'gray'`), `scoreColor` (≥70 → `'green'`, 40–69 → `'yellow'`, <40 → `'gray'`), `STATUS_COLOR_CLASSES` (Tailwind class map for each color). Do not duplicate these inline in components.
- Channel list filter parsing is extracted into `src/lib/db/list-channels-filters.ts` (`ChannelsSearchParamsSchema`, `parseChannelsFilters(flat, pageSize?)`). Both the channels page and the CSV export endpoint import from there — do not duplicate the Zod schema in either consumer.
- `ALL_OUTREACH_STATUSES` is exported from `src/lib/db/queries.ts` as the single source of truth for the ordered outreach status list.
- `next.config.ts` whitelists remote image domains for `next/image`: `yt3.ggpht.com` (channel thumbnails) and `i.ytimg.com` (video thumbnails). Add new domains here before using them with `<Image>`.

## Database architecture

- SQLite via `better-sqlite3`; WAL mode + foreign keys + busy_timeout set on every connection in `src/lib/db/client.ts`.
- `getDb()` returns a lazy singleton stored on `globalThis` so Next.js hot-reloads in dev don't open multiple connections.
- `DATABASE_PATH` env var overrides the default `./data/pipeline.db`; the parent directory is created automatically.
- Schema is in `src/lib/db/schema.ts`; migrations live in `drizzle/`. Always commit `drizzle/` files alongside schema changes.
- Query helpers in `src/lib/db/queries.ts` accept an optional `db` parameter for test injection (tests use `:memory:` databases).
- `listChannelsForUi(filters, db?)` in `src/lib/db/queries.ts` is the stable contract for the channels list page. Accepts `ListChannelsFilters` (outreachStatus, score/subscriber ranges, nicheContains, formatContains, pitchLanguage, free-text search, sort, page, pageSize); uses a LEFT JOIN on `qualifications`. Default sort: `score_desc`; default page size: 50.
- `dashboardSnapshot(db?)` in `src/lib/db/queries.ts` is the stable contract for the dashboard page. Returns `{ latestRun, queues, topRecent, quota }` via a single `Promise.all` of parallel queries. Do not query these tables directly from dashboard components.
- `todayLlmStats(db?)` in `src/lib/db/queries.ts` returns today's aggregate LLM call counts and token totals from `pipelineRuns`. Uses UTC midnight as the day boundary (intentionally different from `quotaSummary` which uses Pacific Time).
- `getChannelDetail(channelId, db?)` in `src/lib/db/queries.ts` is the stable contract for the channel detail page. Returns `{ channel, videos, qualification, videoSelection, transcriptsByVideo, currentDraft, draftHistory }` or `null` if the channel doesn't exist. `transcriptsByVideo` is a `Record<videoId, Transcript | null>` covering all 20 video rows (null for videos without a transcript). Do not query the underlying tables directly from channel detail components.
- `listRuns(opts?, db?)` in `src/lib/db/queries.ts` is the stable contract for the runs list page. Accepts `{ limit?, before? }` (before is a ms timestamp for cursor pagination); returns `PipelineRun[]` ordered by `startedAt DESC`.
- `getRunById(id, db?)` in `src/lib/db/queries.ts` returns a single `PipelineRun | null`; used by the run detail page.
- `findChannelByIdOrHandle(identifier, db?)` in `src/lib/db/queries.ts` resolves a channel by primary-key `id` first, then by `handle` matching both the `@`-prefixed and bare forms (handles are stored WITHOUT a leading `@` in practice). Used by the `add-draft`, `show-draft-prompt`, and `top-channels` CLIs; returns `Channel | null`.
- `topChannelsWithoutEmail(limit?, db?)` in `src/lib/db/queries.ts` returns the top channels by `latestAutomationScore DESC` that have a score (qualified) and no `email` yet — the best outreach leads still to contact. Backs the `channels:top` CLI. Default limit 10.
- `listEventsForRun(runId, opts?, db?)` in `src/lib/db/queries.ts` returns `Array<PipelineEvent & { channelTitle: string | null }>` with optional `stage` and `channelId` filters; LEFT JOINs `channels`. Used by the run detail page events table.
- `listKeywords(db?)`, `createKeyword(input, db?)`, `updateKeyword(id, patch, db?)`, `deleteKeyword(id, db?)` in `src/lib/db/queries.ts` are the stable CRUD contracts for seed keywords. `createKeyword` throws `KeywordAlreadyExists` (exported from the same module) on case-insensitive duplicate.
- Schema evolution: edit schema → `pnpm db:generate` → review generated SQL → `pnpm db:migrate`.
- `pnpm db:init` seeds `filters` and `pipeline_config` settings using `onConflictDoNothing` — safe to re-run without overwriting user-customized values.
- TypeScript scripts in `scripts/` are run with `tsx` (listed in devDependencies).

## Environment validation

- All env vars are declared and validated in `src/lib/env.ts` using a Zod schema (`EnvSchema`). The module calls `process.exit(1)` at import time if validation fails, printing field-level errors.
- `dotenv` is loaded only when `NODE_ENV !== 'production'`; in production env vars are injected by the host OS.
- To add a new env var: add it to `EnvSchema`, add it to `.env.example` with a comment, and add it to `DISPLAY_KEYS` in `scripts/bootstrap.ts`.
- `EnvSchema` is exported separately so tests can validate the schema without triggering the module-level exit.

## Raw storage

- All external API responses are dumped verbatim to `DATA_DIR/raw/` via `dumpRaw()` in `src/lib/storage/raw.ts`.
- Path helpers live in `src/lib/storage/paths.ts`. Paths returned are **relative** to `DATA_DIR`; use `absolutePath(rel)` only at I/O boundaries. Store only relative paths in the database.
- All writes are atomic: written to `<path>.tmp` then renamed to the final path.
- `deleteRawForChannel(channelId)` removes all per-channel raw data (transcripts, youtube/channels, youtube/videos, llm/*). It does NOT delete `raw/youtube/search/` (keyed by date/keyword, not channelId). This is the GDPR deletion hook.
- `channelId` passed to storage functions must be alphanumeric/dash/underscore only — validated at the storage layer.
- LLM raw envelopes are stored under `raw/llm/<kind>/<channelId>/`. Path helpers: `paths.rawLlmVideoSelection(channelId, runId, ts)`, `paths.rawLlmQualification(channelId, runId, ts)`, `paths.rawLlmDraft(channelId, ts)`, `paths.rawLlmPlaceholder(channelId, ts)`. `runId` is required for the first two.
- The `qualifications` table has both `rawResponsePath` and `rawPromptPath` columns; both are set to the same envelope file path (returned by `callLLM`) because the envelope already contains the full prompt (system + user) alongside the response. There is no separate prompt-only dump.
- Transcript raw envelopes are stored under `raw/transcripts/<channelId>/`. Path helper: `paths.rawTranscript(channelId, videoId)` — one file per video (overwritten on re-fetch).

## Logging

- Logger is exported from `src/lib/logger.ts` as `logger` (pino instance) and `childLogger(bindings)`.
- In development: pretty-printed to stdout via `pino-pretty`.
- In production: written to both stdout and `DATA_DIR/logs/worker-<YYYY-MM-DD>.log` (date stamped at process startup, not rotated mid-run).
- In test: plain pino, no pretty-print, no file output.
- `LOG_LEVEL` env var controls verbosity (default `info`).

## Settings service

- Settings are accessed via `src/lib/services/settings.ts` — never via raw DB queries in application code.
- Functions: `getFilters()`, `getPipelineConfig()`, `updateFilters(patch)`, `updatePipelineConfig(patch)`.
- All functions accept an optional `db` parameter for test injection (use an in-memory DB).
- The service keeps an in-process cache with a 30-second TTL; writes update the cache immediately.
- On first read, if the DB row is absent, env defaults are persisted to the DB automatically.
- Tests must call `_resetSettingsCache()` in `beforeEach` to avoid state leakage between test cases.
- UI components call settings mutations via server actions in `src/app/(app)/settings/actions.ts`, not the service directly. Exported actions: `updateFiltersAction`, `updatePipelineConfigAction`, `createKeywordAction`, `updateKeywordAction`, `deleteKeywordAction`. Each validates with Zod and calls `revalidatePath('/settings')`. `createKeywordAction` returns `{ ok: false, error: 'duplicate' }` when `KeywordAlreadyExists` is thrown, or `{ ok: false, error: 'empty' }` for blank input.

## YouTube client

- All YouTube Data API v3 calls go through typed wrappers in `src/lib/youtube/operations.ts` — never call the `googleapis` SDK directly from application code.
- Every wrapper calls `checkAndRecordQuota` before the SDK call (atomically checks headroom and records usage in a single SQLite transaction), then dumps the raw response via `dumpRaw`.
- The SDK singleton is a module-level lazy cache in `src/lib/youtube/client.ts` (`getYoutube()`), keyed on `YOUTUBE_API_KEY`.
- All wrappers accept an optional trailing `db` parameter for test injection — pass an in-memory Drizzle DB in tests.
- `withYoutubeLimit` (from `src/lib/youtube/limiter.ts`) caps concurrency at 2 simultaneous SDK calls; it wraps the inner SDK call, not the whole operation.
- `withRetry` (from `src/lib/youtube/retry.ts`) retries on `ECONNRESET`, `ETIMEDOUT`, HTTP 5xx, and 429 with jittered exponential backoff (max 10 s); it does NOT retry on 400/401/403/404.
- `getChannels` and `getVideos` transparently chunk their `ids` input into batches of 50; each batch is one API call and one quota debit. `getChannels` returns `rawPaths: Record<string, string>` (keyed by channelId); `getVideos` returns `rawPath: string | null` (last batch path, or null for empty input).
- Quota is tracked in Pacific Time via `pacificDateString()` in `src/lib/youtube/quota.ts` — the daily budget resets when the Pacific date rolls over, not UTC midnight.
- `checkAndRecordQuota(operation, runId?, db?)` throws `QuotaExhausted` (with `.spent` and `.cap` fields) if `spent + cost > PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT - PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER`; otherwise inserts the ledger row atomically.
- `quotaSummary()` in `src/lib/youtube/dashboard.ts` is the stable contract for dashboard UI — consume that rather than raw DB queries against `quotaLedger`.
- YouTube quota and operations tests conditionally skip all DB-dependent cases when `better-sqlite3` native bindings cannot load (e.g. arm64/Node version mismatch). `pnpm test` will report these as skipped, not failed.

## LLM client

- All LLM calls go through `callLLM` in `src/lib/llm/call.ts` — never call the OpenAI SDK directly from application code.
- The SDK singleton is a module-level lazy cache in `src/lib/llm/client.ts` (`getLlm()`). Two model tiers: `MODELS.think` (→ `LLM_MODEL_THINK`) and `MODELS.fast` (→ `LLM_MODEL_FAST`).
- `withLlmLimit` (from `src/lib/llm/limiter.ts`) caps concurrency at 3 simultaneous LLM calls.
- `callLLM` enforces JSON-only output (`response_format: { type: 'json_object' }`), validates against a Zod schema, and retries once on parse or validation failure by echoing the bad response back as an assistant turn and appending a correction prompt. After two consecutive failures it throws `LlmFormatError`.
- Every call dumps the full envelope (system, user, all attempt texts, parsed result or error, usage, latency, timestamp, prompt version, model) to `data/raw/llm/...` via `dumpRaw`. Path shape is determined by `context.kind`.
- `LlmFormatError`, `LlmCallError`, and `LlmBusinessRuleError` all carry a `.rawPath` field so callers can log the failure location. `LlmBusinessRuleError` is thrown by application-level callers (not `callLLM` itself) when post-parse business logic fails (e.g. `selectedVideoIds` contains IDs absent from `videoClassifications`). `qualifyChannel` catches both `LlmFormatError` and `LlmBusinessRuleError` and treats them identically.
- `callLLM` accumulates token usage across retry attempts — the returned `usage` reflects all tokens consumed, including any failed first attempt.
- `runId` is required in `context` when `kind` is `video_selection` or `qualification`; omitting it throws immediately.
- Prompt modules live in `src/lib/llm/prompts/`; each exports `version` (string), `system` (string), and `userTemplate(args)` (function returning string). Shared XML escaping lives in `src/lib/llm/prompts/xml-helpers.ts`.
- Zod output schemas for LLM callers live in `src/lib/llm/schemas.ts` (not alongside prompts). Post-parse business validation functions (e.g. `validateSelectOutput`) also live there and must be called by the caller after `callLLM` returns; on failure they throw `LlmBusinessRuleError`.
- Application code calls higher-level wrappers (`runVideoSelection` in `src/lib/llm/select.ts`, `runFinalQualification` in `src/lib/llm/qualify.ts`, `runDraftGeneration` in `src/lib/llm/draft.ts`) rather than `callLLM` directly. Each wrapper builds the user message, calls `callLLM`, inserts the result into its DB table, and returns `{ <entityId>, output, usage }`. `TokenUsage = { inputTokens: number; outputTokens: number }` is the shared return type accumulated across retry attempts. `runDraftGeneration` adds a second word-count retry loop on top of `callLLM`'s schema-level retry; it accumulates token usage across both layers.
- `llmStatsForRun(runId, db?)` in `src/lib/llm/dashboard.ts` is the stable contract for per-run LLM stats in the dashboard UI.
- `estimateTokens` and `truncateMiddle` in `src/lib/llm/tokens.ts` are used for prompt budgeting; `truncateMiddle` keeps head 60% / tail 40% with a marker.
- Test seams: `__setLlmForTest(fakeClient)` and `__resetLlmForTest()` in `src/lib/llm/client.ts`; call both in `beforeEach`/`afterEach`.

## Transcript client

- All transcript fetches in pipeline code go through `getOrFetchTranscript` in `src/lib/transcripts/store.ts`; call `fetchTranscript` directly only from scripts or tests.
- `fetchTranscript` in `src/lib/transcripts/fetcher.ts` calls the `youtube-transcript` library against YouTube's public `timedtext` endpoint (no API quota cost). It tries each preferred language in order, then falls back to any language, and always returns a structured `TranscriptFetchResult` — never throws.
- `withTranscriptLimit` (from `src/lib/transcripts/limiter.ts`) caps concurrency at 2 simultaneous timedtext fetches with a 200ms inter-request delay for sequential requests.
- `getOrFetchTranscript` provides idempotent persistence: on success it saves to the `transcripts` table and dumps a raw envelope to `data/raw/transcripts/<channelId>/<videoId>.json`; on failure it records `fetchSucceeded=false` with a 24-hour short-circuit cache to avoid hammering the endpoint.
- `getOrFetchManyTranscripts` in `src/lib/transcripts/batch.ts` is the batch entry point for plan 08. Runs all fetches through the concurrency throttle, preserves input order, and never throws.
- `deleteTranscriptsForChannel(channelId)` in `src/lib/transcripts/store.ts` is the GDPR deletion hook for transcripts: removes DB rows and the `data/raw/transcripts/<channelId>/` directory.
- Transcript store tests conditionally skip DB-dependent cases when `better-sqlite3` native bindings cannot load — same pattern as YouTube/quota tests.

## Discovery pipeline

- Entry point is `runDiscovery(runId, db?)` in `src/lib/pipeline/discovery/run.ts`. The run row must be pre-created in `pipeline_runs` by the caller.
- Five-step sequence: keyword sweep → category exploration → channel enrichment → pre-qualification filter → video enrichment.
- `QuotaExhausted` propagation: each inner step catches it, flushes partial DB counters, then re-throws. `runStep` in `run.ts` catches the re-throw, sets `pipelineRuns.status='cancelled'`, and skips all remaining steps via the `cancelled` flag.
- On normal completion `runDiscovery` sets `status='completed'` and `finishedAt`. On an unhandled exception it sets `status='failed'` with `errorMessage` before re-throwing.
- `runKeywordSweep` selects active keywords ordered by `lastUsedAt ASC NULLS FIRST` — never-used keywords are always processed first (SQLite puts NULLs first in ASC order).
- `enrichCandidateChannels` skips channels where `lastFetchedAt IS NOT NULL` — already-enriched channels are never re-fetched even if re-queued as candidates.
- `applyPreQualificationFilter` only processes channels with `discoveryStatus='enriched'` AND `latestQualificationId IS NULL` — previously qualified channels skip re-filtering. Channels with `null` subscriberCount are rejected as `unknown_subscriber_count`.
- `fetchVideosForSurvivingChannels` marks channels with empty playlists or most-recent video older than `filters.inactiveDays` as `rejected_pre_qual` with reason `inactive`.
- `pipelineRuns.channelsEnriched` is incremented by both the enrichment step (channels that got metadata) and the video-enrichment step (channels that got video sets).
- Seed data lives in `src/lib/seeds/` — `keywords.ts` exports `SEED_KEYWORDS`, `categories.ts` exports `IN_SCOPE_CATEGORY_IDS`.
- `computeChannelAggregates(channelId, db?)` in `src/lib/pipeline/aggregates.ts` is the stable contract for plan 08's LLM prompt building. Returns `ZERO_AGGREGATES` when fewer than 3 videos are present. Uses population stddev (not sample). Reads the 20 most recent videos.
- `parseIso8601Duration(iso)` in `src/lib/youtube/duration.ts` parses ISO 8601 duration strings (including P1DT… day component); throws on unparseable input. Used by `operations.ts` internally.

## Pipeline orchestrator

- Entry point: `runPipeline(opts, db?)` in `src/lib/pipeline/run.ts`. Accepts `triggeredBy: 'cron' | 'manual'` and optional `stages` array (`['discovery', 'qualification']` by default).
- Sequence: `preflightChecks()` → `openRun()` → `runDiscovery()` → `runQualification()` → `closeRun('completed')`.
- `preflightChecks()` in `src/lib/pipeline/preflight.ts` requires at least 4,500 units of headroom (`PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT - PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER - todayUnitsSpent >= 4500`); throws `InsufficientQuotaHeadroom` if not. `runPipeline` catches this and returns `{ status: 'cancelled' }` without opening a run row.
- `openRun(triggeredBy, db?)` in `src/lib/pipeline/lifecycle.ts` inserts a `pipeline_runs` row with `status='running'` inside a transaction that also checks for an existing running row; throws `ConcurrentRunError` if one is found.
- `closeRun(runId, status, errorMessage?, errorStack?, db?)` in `lifecycle.ts` is atomic (SELECT+UPDATE in one transaction) and idempotent: silently no-ops if the row is already in a terminal status.
- `isRunActive(db?)` returns `{ active: boolean; runId?: number }`.
- `runDiscovery` returns a `cancelled: boolean` flag when quota is exhausted mid-discovery. `runPipeline` checks this flag, calls `closeRun(runId, 'cancelled')`, skips qualification, and returns `status: 'cancelled'`.
- `QuotaExhausted` thrown by qualification closes the run as `'cancelled'`; any other error closes as `'failed'` and re-throws.
- The Next.js server never calls pipeline stages directly. `POST /api/pipeline/run` spawns the worker as a detached child process (`child.unref()`) and returns 202 immediately.

## Worker

- Entry point: `src/worker/run.ts`. Reads `--manual` flag from `process.argv` to set `triggeredBy`.
- Registers `SIGTERM`/`SIGINT` handlers that call `closeRun(runId, 'cancelled', 'received SIGTERM/SIGINT')` before exiting, so a `kill <pid>` never leaves a stale `running` row. Exits 1 on signal-triggered shutdown (run cancelled cleanly), 1 if an error occurs during cleanup.
- The worker writes pipeline state to the shared SQLite database; the UI reads it via `GET /api/pipeline/status`.

## Outreach draft

- Entry point for UI callers is `src/lib/services/outreach.ts`. Exported functions: `generateDraftForChannel(channelId, db?)`, `getDraftPrompt(channelId, db?)`, `addManualDraft(args, db?)`, `listDraftsForChannel(channelId, db?)`, `getCurrentDraft(channelId, db?)`.
- `generateDraftForChannel` requires the channel to have a `latestQualificationId`; throws immediately otherwise. Fetches the most-recent qualification row and the 5 most-recent videos to build the prompt context.
- Prompt-context construction is shared via the private `buildDraftContext(channelId, db)` helper (returns `{ input: DraftInput, qualificationId, language }`); both `generateDraftForChannel` and `getDraftPrompt` use it, so the inspected prompt is byte-identical to what generation would send.
- `getDraftPrompt(channelId, db?)` returns `{ system, user, language }` — the exact system + user messages `callLLM` would send for the draft — without calling the LLM or consuming quota. The greeting/footer are NOT part of the prompt (they are appended to the response), so they are absent. The CLI `scripts/show-draft-prompt.ts` (`pnpm draft:prompt`) prints this as JSON.
- `addManualDraft({ channelId, subject, body, language, recipientFirstName? }, db?)` inserts an operator-authored draft without calling the LLM. It runs `body` through `assembleEmail` (greeting + footer prepended/appended like the LLM path, so `body` is the email CORE only), sets `modelUsed`/`promptVersion`/`rawResponsePath` to the sentinel `'manual'`, demotes prior current drafts, logs a `draft_added_manually` event, and does NOT touch `outreachStatus`. Works on channels without a qualification (`qualificationId` is then null). The CLI `scripts/add-draft.ts` (`pnpm draft:add`) resolves the channel via `findChannelByIdOrHandle` and calls this.
- `saveEmailAndDraft` (server action) short-circuits: if a current draft already exists for the channel (e.g. one added via `addManualDraft`), it skips LLM generation entirely, saves the email, and sets `outreachStatus='drafted'` directly. Only when no current draft exists does it run `generateDraftForChannel`.
- Lower-level caller is `runDraftGeneration` in `src/lib/llm/draft.ts`. Uses `tier: 'fast'` model. Adds a word-count retry loop (one retry if body word count < 80 or > 250); accumulates token usage across both `callLLM` calls. Throws `LlmFormatError` if the retry still fails.
- Subject length > 60 chars is warn-only (logged, not an error); the draft is accepted anyway.
- `validateDraftOutput(d)` in `src/lib/llm/schemas.ts` performs the word-count check (80–250 words). Called by `runDraftGeneration` after `callLLM` returns.
- DB: `outreach_drafts` table (schema in `src/lib/db/schema.ts`). Only one draft per channel has `isCurrent=true`; `runDraftGeneration` demotes all previous current drafts inside a SQLite transaction before inserting the new row.
- `getCurrentDraft(channelId, db?)` in `src/lib/db/queries.ts` is the stable query contract for UI consumption.
- Draft language comes from `qualifications.pitchLanguage`, which is set at qualify time via `pitchLanguageForCountry(channel.country)` in `src/lib/outreach/pitch-language.ts` (`'IT'` or unknown country → `it`, else `en`). NOTE: `pitchAngle`/`suggestedSolution` are intentionally always written in English by the qualify prompt (internal context only) — only `pitchLanguage` controls the actual email language. Run `pnpm backfill:pitch-language` to recompute the field on existing qualifications (older rows had a hardcoded `'en'`).
- Outreach draft tests conditionally skip DB-dependent cases when `better-sqlite3` native bindings cannot load — same pattern as other DB-dependent tests.

## Qualification pipeline

- Entry points: `runQualification(args, db?)` in `src/lib/pipeline/qualification/run.ts` for batch runs (called from the discovery worker); `forceRequalifyChannel(channelId, db?)` in `src/lib/pipeline/qualification/index.ts` for UI-triggered single-channel runs.
- Three-step sequence per channel: Step 1 (`runVideoSelection`) classifies the 20 most-recent videos and selects 3–5 for deep analysis → Step 2 (`fetchSelectedTranscripts`) fetches transcripts for the selected videos (best-effort, non-blocking) → Step 3 (`runFinalQualification`) produces the final structured assessment.
- `shouldQualify(channelId, opts?, db?)` in `policy.ts` gates each channel: skips if `force=false` and `lastQualifiedAt` is within `requalifyAfterDays`, if `discoveryStatus` is not `'enriched'` or `'qualified'`, or if the channel has no video rows.
- `runQualification` selects `discoveryStatus='enriched'` channels ordered by `discoveredAt DESC` and uses `pLimit(3)` for concurrency. A single channel failure does not abort the batch. After the batch it writes aggregate LLM token/call counters to `pipelineRuns`.
- `forceRequalifyChannel` creates a synthetic `pipelineRuns` row with `triggeredBy='manual'`, calls `qualifyChannel(..., force: true)`, then finalises the run row with LLM token/call counters and `status='completed'`.
- Transcript budget: 4,000 tokens per transcript via `truncateMiddle`; if fewer than 5 transcripts succeeded the budget is redistributed proportionally (`Math.floor(20000 / successfulCount)`).
- LLM errors at step 1 or step 3 set `discoveryStatus='rejected_post_qual'`, `rejectionReason='llm_format_failure'`, and log a `channel_qualification_failed` pipeline event.
- On success, `qualifyChannel` updates denormalised fields on `channels`: `latestQualificationId`, `latestAutomationScore`, `lastQualifiedAt`, `discoveryStatus='qualified'`.

## Testing

- Unit tests: vitest, environment `happy-dom`. Test files alongside source: `src/**/*.test.ts`.
- E2E tests: Playwright, chromium only. Test files in `e2e/`.
- Playwright browser cache is at `/workspace/.playwright-browsers` in this environment. The `test:e2e` script sets `PLAYWRIGHT_BROWSERS_PATH` accordingly.
- E2E tests use `ADMIN_PASSWORD=test1234` as the default when the env var is not set (set explicitly in `playwright.config.ts` webServer env).
