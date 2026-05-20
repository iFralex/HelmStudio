# Plan: Database Schema & Migrations

**Branch:** `feat/02-database-schema`
**Wave:** 1
**Depends on:** 01
**Estimated effort:** 1–2 days

## Overview

Stand up the entire SQLite database for the system: Drizzle schema for every table from spec §6.1, drizzle-kit migrations, the WAL-mode connection singleton, typed query helpers, and an init script that seeds default `settings` rows. After this plan, the worker and the UI both share one database file (`data/pipeline.db`) and can read/write concurrently.

## Context

Database engine is **SQLite via better-sqlite3** (spec §4) running locally. **WAL mode is required** so that the long-running worker (plan 10) and the Next.js UI process can read/write at the same time (spec §3, §6). Tables follow spec §6.1 verbatim — no schema improvisation. Timestamps are stored as Unix epoch integers using Drizzle's `{ mode: 'timestamp' }`; cascading deletes from `channels` flow to `videos`, `qualifications`, `video_selections`, `transcripts`, `outreach_drafts`, and `pipeline_events`.

## Validation Commands

- `pnpm typecheck`
- `pnpm test src/lib/db`
- `pnpm db:init` (creates `data/pipeline.db` with all tables and seed settings)
- `pnpm db:studio` (manual smoke: schema renders, no errors)

### Task 1: Install dependencies

- [x] Install runtime: `better-sqlite3`, `drizzle-orm`
- [x] Install dev: `drizzle-kit`, `@types/better-sqlite3`
- [x] Mark completed

### Task 2: Database client singleton

- [x] Create `src/lib/db/client.ts`:

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const sqlite = new Database(process.env.DATABASE_PATH ?? './data/pipeline.db');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  _db = drizzle(sqlite, { schema });
  return _db;
}
```

- [x] Ensure the parent directory of `DATABASE_PATH` is created if missing
- [x] Mark completed

### Task 3: Schema definition

- [x] Create `src/lib/db/schema.ts` with the FULL table set from spec §6.1, in this order:
  - `channels`
  - `videos`
  - `videoSelections`
  - `transcripts`
  - `qualifications` (with `videoSelectionId` FK back to `videoSelections`)
  - `outreachDrafts`
  - `pipelineRuns`
  - `pipelineEvents`
  - `quotaLedger`
  - `seedKeywords`
  - `settings`
- [x] Use `sqliteTable`, `text`, `integer`, `real`, `index` from `drizzle-orm/sqlite-core`
- [x] Use `references()` with the callback form (`() => otherTable.id`) so forward references work
- [x] Indexes per spec §6.1: status fields, score, country, channel FKs, dates
- [x] All cascading deletes per spec §6.2
- [x] Mark completed

### Task 4: drizzle-kit configuration

- [x] Create `drizzle.config.ts`:

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_PATH ?? './data/pipeline.db' },
} satisfies Config;
```

- [x] Add scripts: `db:generate` → `drizzle-kit generate`, `db:migrate` → `drizzle-kit migrate`, `db:studio` → `drizzle-kit studio`
- [x] Mark completed

### Task 5: Initial migration

- [x] Run `pnpm db:generate` to produce `drizzle/0000_init.sql` from the schema
- [x] Inspect the generated SQL for correctness (foreign keys, indexes, defaults)
- [x] Commit the generated migration files
- [x] Mark completed

### Task 6: Init script

- [x] Create `scripts/init-db.ts`:
  - resolve `DATABASE_PATH` from env (default `./data/pipeline.db`)
  - create the parent directory if missing
  - run all pending migrations via `migrate(db, { migrationsFolder: './drizzle' })`
  - upsert default rows into `settings`:
    - `filters` → `{ minSubscribers, maxSubscribers, country, language, requalifyAfterDays, inactiveDays }` from env defaults (spec §14)
    - `pipeline_config` → `{ keywordsPerRun, targetQualifiedPerRun }`
  - log a one-line summary
- [x] Add script: `db:init` → `tsx scripts/init-db.ts`
- [x] Mark completed

### Task 7: Typed query helpers

- [x] Create `src/lib/db/queries.ts` with small, reusable typed queries used across the codebase:

```typescript
export async function getChannelById(id: string): Promise<Channel | null>;
export async function listChannels(opts: ListChannelsOpts): Promise<Channel[]>;
export async function countChannelsByStatus(): Promise<Record<DiscoveryStatus, number>>;
export async function getLatestQualification(channelId: string): Promise<Qualification | null>;
export async function getVideoSelectionByQualificationId(
  qualificationId: number,
): Promise<VideoSelection | null>;
export async function listTranscriptsForChannel(channelId: string): Promise<Transcript[]>;
export async function getCurrentDraft(channelId: string): Promise<OutreachDraft | null>;
export async function getLatestRun(): Promise<PipelineRun | null>;
export async function todayQuotaUsed(): Promise<number>;
export async function getSetting<T = unknown>(key: string): Promise<T | null>;
export async function setSetting(key: string, value: unknown): Promise<void>;
```

- [x] Each helper accepts a `db = getDb()` injected param for testability
- [x] Export inferred row types: `export type Channel = typeof channels.$inferSelect;` etc.
- [x] Mark completed

### Task 8: Unit tests

- [x] Create `src/lib/db/__tests__/schema.test.ts`:
  - test "inserts and reads a channel"
  - test "cascade-deletes videos, qualifications, drafts when a channel is deleted"
  - test "rejects duplicate channel id (PK constraint)"
  - test "stores and retrieves JSON-mode columns round-trip"
  - test "settings upsert" (insert then update on conflict)
- [x] Use an in-memory SQLite (`new Database(':memory:')`) for tests; apply migrations programmatically before each test suite
- [x] Mark completed

### Task 9: Documentation

- [x] Update README: "Database" section with `pnpm db:init` instructions and explanation that re-running it is idempotent
- [x] Document the schema-evolution flow: edit `schema.ts` → `pnpm db:generate` → review SQL → `pnpm db:migrate`
- [x] Mark completed

### Task 10: Definition of Done

- [x] `pnpm typecheck` passes with strict mode
- [x] All schema tests pass
- [x] `pnpm db:init` creates `data/pipeline.db` and is idempotent on re-run
- [x] `pnpm db:studio` opens, all 11 tables visible [x] manual test (skipped - not automatable)
- [x] Forward references in schema (e.g. `qualifications.videoSelectionId → videoSelections.id`) work without TypeScript or runtime errors
- [x] Mark completed
