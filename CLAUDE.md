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
pnpm tsx scripts/llm-smoke.ts  # manual LLM connectivity smoke test (requires local proxy)
pnpm tsx scripts/transcript-smoke.ts <videoId>  # manual transcript fetch smoke test (no API key required)
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

## UI components

- shadcn/ui components are in `src/components/ui/`. Tailwind v4 is in use (not v3).
- The `cn` utility (clsx + tailwind-merge) is exported from `src/lib/utils.ts`.
- PostCSS config: `postcss.config.mjs`.

## Database architecture

- SQLite via `better-sqlite3`; WAL mode + foreign keys + busy_timeout set on every connection in `src/lib/db/client.ts`.
- `getDb()` returns a lazy singleton stored on `globalThis` so Next.js hot-reloads in dev don't open multiple connections.
- `DATABASE_PATH` env var overrides the default `./data/pipeline.db`; the parent directory is created automatically.
- Schema is in `src/lib/db/schema.ts`; migrations live in `drizzle/`. Always commit `drizzle/` files alongside schema changes.
- Query helpers in `src/lib/db/queries.ts` accept an optional `db` parameter for test injection (tests use `:memory:` databases).
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
- `LlmFormatError` and `LlmCallError` both carry a `.rawPath` field so callers can log the failure location.
- `callLLM` accumulates token usage across retry attempts — the returned `usage` reflects all tokens consumed, including any failed first attempt.
- `runId` is required in `context` when `kind` is `video_selection` or `qualification`; omitting it throws immediately.
- Prompt modules live in `src/lib/llm/prompts/`; each exports `version` (string), `system` (string), and `userTemplate(args)` (function returning string).
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

## Testing

- Unit tests: vitest, environment `happy-dom`. Test files alongside source: `src/**/*.test.ts`.
- E2E tests: Playwright, chromium only. Test files in `e2e/`.
- Playwright browser cache is at `/workspace/.playwright-browsers` in this environment. The `test:e2e` script sets `PLAYWRIGHT_BROWSERS_PATH` accordingly.
- E2E tests use `ADMIN_PASSWORD=test1234` as the default when the env var is not set (set explicitly in `playwright.config.ts` webServer env).
