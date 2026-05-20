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

| Command             | Description                           |
| ------------------- | ------------------------------------- |
| `pnpm dev`          | Start Next.js dev server on port 3000 |
| `pnpm build`        | Production build                      |
| `pnpm start`        | Start production server               |
| `pnpm typecheck`    | TypeScript type-check (no emit)       |
| `pnpm lint`         | ESLint                                |
| `pnpm format`       | Prettier (write)                      |
| `pnpm format:check` | Prettier (check only, for CI)         |
| `pnpm test`         | Vitest unit tests                     |
| `pnpm test:e2e`     | Playwright end-to-end tests           |

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
