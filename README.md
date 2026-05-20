# Creator Pipeline

A single-operator system that discovers Italian YouTube channels, qualifies each one with an LLM, and prepares per-channel outreach drafts.

## Quickstart

```bash
git clone <repo-url>
cd creator-pipeline
pnpm install
cp .env.example .env
# Fill in required variables in .env (see table below)
pnpm dev
```

Open http://localhost:3000 — you will be redirected to `/login`. Enter your `ADMIN_PASSWORD` to access the dashboard.

## Environment variables

| Variable         | Required | Description                                               |
| ---------------- | -------- | --------------------------------------------------------- |
| `ADMIN_PASSWORD` | Yes      | Single shared password for the operator UI                |
| `SESSION_SECRET` | Yes      | At least 32 random characters; signs HMAC session cookies |

Generate a secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Scripts

| Command             | Description                                            |
| ------------------- | ------------------------------------------------------ |
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

## Database

The app uses SQLite via `better-sqlite3` with WAL mode enabled so the background worker and the Next.js UI can read and write concurrently.

The database file lives at `data/pipeline.db` by default (override with the `DATABASE_PATH` env var).

### Initialization

Run once before starting the app for the first time:

```bash
pnpm db:init
```

This command:
- Creates the `data/` directory if it does not exist
- Applies all pending Drizzle migrations
- Upserts default rows in the `settings` table (filter thresholds, pipeline config)

Re-running `pnpm db:init` is safe and idempotent — it only applies migrations that have not been applied yet and uses `INSERT OR REPLACE` for the settings rows.

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
