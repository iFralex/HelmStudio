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
pnpm db:init       # create data/ dir, run migrations, seed default settings (first run only)
pnpm db:generate   # generate new migration from schema changes
pnpm db:migrate    # apply pending migrations
pnpm db:studio     # open Drizzle Studio browser UI
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

## Testing

- Unit tests: vitest, environment `happy-dom`. Test files alongside source: `src/**/*.test.ts`.
- E2E tests: Playwright, chromium only. Test files in `e2e/`.
- Playwright browser cache is at `/workspace/.playwright-browsers` in this environment. The `test:e2e` script sets `PLAYWRIGHT_BROWSERS_PATH` accordingly.
- E2E tests use `ADMIN_PASSWORD=test1234` as the default when the env var is not set (set explicitly in `playwright.config.ts` webServer env).
