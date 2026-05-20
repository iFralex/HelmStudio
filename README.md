# Creator Pipeline

A single-operator system that discovers Italian YouTube channels, qualifies each one with an LLM, and prepares per-channel outreach drafts.

## Quickstart

```bash
git clone <repo-url>
cd creator-pipeline
pnpm install
pnpm bootstrap      # copies .env.example → .env, creates data/ dirs, seeds DB
# Edit .env with real values before starting (see table below)
pnpm dev
```

Open http://localhost:3000 — you will be redirected to `/login`. Enter your `ADMIN_PASSWORD` to access the dashboard.

## Environment variables

| Variable                               | Required | Default              | Description                                                           |
| -------------------------------------- | -------- | -------------------- | --------------------------------------------------------------------- |
| `ADMIN_PASSWORD`                       | Yes      | —                    | Min 8 characters; single shared password for the operator UI          |
| `SESSION_SECRET`                       | Yes      | —                    | Min 32 random characters; signs HMAC session cookies                  |
| `YOUTUBE_API_KEY`                      | Yes      | —                    | Google Cloud API key with YouTube Data API v3 enabled (min 20 chars)  |
| `LLM_BASE_URL`                         | Yes      | —                    | Base URL of the LLM API (e.g. `https://api.anthropic.com`)            |
| `LLM_MODEL_THINK`                      | Yes      | —                    | Model identifier for slow/high-quality reasoning step                 |
| `LLM_MODEL_FAST`                       | Yes      | —                    | Model identifier for fast/cheap operations                            |
| `DATABASE_PATH`                        | No       | `./data/pipeline.db` | Path to the SQLite database file                                      |
| `LLM_API_KEY`                          | No       | `not-needed`         | API key for the LLM provider                                          |
| `DATA_DIR`                             | No       | `./data`             | Root directory for all persisted data (db, logs, raw API dumps)       |
| `LOG_LEVEL`                            | No       | `info`               | Log verbosity: `debug`, `info`, `warn`, `error`                       |
| `PIPELINE_TRIGGER_HOUR`                | No       | `4`                  | Hour (0–23) for the daily cron trigger                                |
| `PIPELINE_TRIGGER_MINUTE`              | No       | `0`                  | Minute (0–59) for the daily cron trigger                              |
| `PIPELINE_MIN_SUBSCRIBERS`             | No       | `80000`              | Minimum subscriber count for channel qualification                    |
| `PIPELINE_MAX_SUBSCRIBERS`             | No       | `1000000`            | Maximum subscriber count for channel qualification                    |
| `PIPELINE_TARGET_COUNTRY`              | No       | `IT`                 | ISO 3166-1 alpha-2 country code for targeting                         |
| `PIPELINE_TARGET_LANGUAGE`             | No       | `it`                 | ISO 639-1 language code for targeting                                 |
| `PIPELINE_KEYWORDS_PER_RUN`            | No       | `30`                 | Number of keywords to process per pipeline run                        |
| `PIPELINE_TARGET_QUALIFIED_PER_RUN`    | No       | `50`                 | Target number of newly qualified channels per run                     |
| `PIPELINE_INACTIVE_DAYS`               | No       | `60`                 | Days of inactivity before a channel is skipped                        |
| `PIPELINE_REQUALIFY_AFTER_DAYS`        | No       | `90`                 | Days after qualification before a channel can be re-qualified         |
| `PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT`   | No       | `10000`              | YouTube Data API v3 daily quota limit                                 |
| `PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER` | No       | `500`                | Quota units to keep in reserve before the pipeline stops              |

Generate a secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Scripts

| Command             | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `pnpm bootstrap`    | First-run setup: copy .env, create data/ dirs, seed DB |
| `pnpm dev`          | Start Next.js dev server on port 3000                  |
| `pnpm build`        | Production build                                       |
| `pnpm start`        | Start production server                                |
| `pnpm typecheck`    | TypeScript type-check (no emit)                        |
| `pnpm lint`         | ESLint                                                 |
| `pnpm format`       | Prettier (write)                                       |
| `pnpm format:check` | Prettier (check only, for CI)                          |
| `pnpm test`         | Vitest unit tests                                      |
| `pnpm test:e2e`     | Playwright end-to-end tests                            |
| `pnpm db:init`      | Initialize database, run migrations, seed settings     |
| `pnpm db:generate`  | Generate a new migration from schema changes           |
| `pnpm db:migrate`   | Apply pending migrations to the database               |
| `pnpm db:studio`    | Open Drizzle Studio to browse the database interactively |
| `pnpm tsx scripts/llm-smoke.ts` | Manual LLM connectivity smoke test (requires local proxy) |

## Third-party library notes

**youtube-transcript** (`youtube-transcript` package, pinned): fetches captions via YouTube's public `timedtext` endpoint (no API quota cost). This endpoint is undocumented and can break without notice when YouTube changes its internal implementation. If transcript fetching stops working, check the package's issue tracker for updates and bump the pin.

## Database

The app uses SQLite via `better-sqlite3` with WAL mode enabled so the background worker and the Next.js UI can read and write concurrently.

The database file lives at `data/pipeline.db` by default (override with the `DATABASE_PATH` env var).

### Initialization

For first-time setup, use `pnpm bootstrap` (called from the Quickstart above). It:
- Copies `.env.example` → `.env` if no `.env` exists
- Creates `data/`, `data/logs/`, and `data/raw/` directories
- Runs `pnpm db:init` to apply migrations and seed defaults

To re-run only the database step (safe to repeat, idempotent):

```bash
pnpm db:init
```

This command:
- Applies all pending Drizzle migrations
- Upserts default rows in the `settings` table (filter thresholds, pipeline config)

Re-running `pnpm db:init` skips settings rows that already exist, so existing customizations are preserved.

### Schema evolution

When you change `src/lib/db/schema.ts`, follow these steps to keep migrations in sync:

1. Edit `src/lib/db/schema.ts` with your changes.
2. Run `pnpm db:generate` — Drizzle Kit compares the current schema against the last migration snapshot and writes a new SQL file under `drizzle/`.
3. Review the generated SQL to confirm the changes are correct (no unintended column drops, etc.).
4. Run `pnpm db:migrate` (or `pnpm db:init`) to apply the new migration to your local database.
5. Commit both `src/lib/db/schema.ts` and the new `drizzle/` files together.

## Directory layout

```
src/
  app/                  Next.js App Router
    (app)/              Protected route group (requires auth)
      layout.tsx        App shell with top nav
      page.tsx          Dashboard
      channels/         Channel list + detail pages
      runs/             Pipeline run history
      settings/         Keywords, filters, model config
    login/              Public login page
    api/                API routes (auth, pipeline, channels)
  components/           shadcn/ui + custom components
  lib/
    auth.ts             Single-password session helpers
    db/                 Drizzle schema, client, queries
    youtube/            YouTube Data API v3 client
    llm/                OpenAI-compatible LLM client + prompts
    storage/            Raw blob persistence (disk)
    pipeline/           Orchestrator + pipeline stages
    seeds/              Italian keyword pool + category IDs
  worker/
    run.ts              Batch worker entry point
data/                   SQLite + raw blobs + logs (gitignored)
drizzle/                Generated migrations
scripts/                DB init, keyword seed, launchd install
e2e/                    Playwright tests
```
