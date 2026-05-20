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

## Testing

- Unit tests: vitest, environment `happy-dom`. Test files alongside source: `src/**/*.test.ts`.
- E2E tests: Playwright, chromium only. Test files in `e2e/`.
- Playwright browser cache is at `/workspace/.playwright-browsers` in this environment. The `test:e2e` script sets `PLAYWRIGHT_BROWSERS_PATH` accordingly.
- E2E tests use `ADMIN_PASSWORD=test1234` as the default when the env var is not set (set explicitly in `playwright.config.ts` webServer env).
