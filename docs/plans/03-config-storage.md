# Plan: Configuration, Env Validation & Raw Storage

**Branch:** `feat/03-config-storage`
**Wave:** 1
**Depends on:** 01, 02
**Estimated effort:** 1 day

## Overview

Build the configuration backbone and the raw-data persistence layer that every later plan consumes. Concretely: a `zod`-validated typed `env` module that the process refuses to start without all required vars; a structured filesystem layout under `data/raw/` for dumping every external API response (YouTube and LLM) per spec §7; a pino-based logger writing to `data/logs/`; and a small settings service layered over the `settings` DB table for runtime-mutable knobs.

## Context

Per spec §7 every external API response is dumped to disk and the DB stores only the relative path; this is the source of truth for re-analysis and audit. The raw tree mirrors the categories described in spec §7.1. Env validation must fail loud on startup (no silent `undefined` propagation) — both the worker (plan 10) and the Next.js app load the same `env` module. Runtime-mutable settings (filters, keyword pool size, etc.) live in the `settings` table seeded by plan 02; this plan adds the typed accessor layer.

## Validation Commands

- `pnpm typecheck`
- `pnpm test src/lib/env src/lib/storage src/lib/logger`
- `pnpm dev` with a deliberately incomplete `.env` → server boot must fail with a clear list of missing vars

### Task 1: Install dependencies

- [x] Install runtime: `zod`, `pino`, `pino-pretty` (dev), `nanoid`
- [x] Mark completed

### Task 2: Typed env module

- [x] Create `src/lib/env.ts`:

```typescript
import { z } from 'zod';
import 'dotenv/config';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Auth (plan 01)
  ADMIN_PASSWORD: z.string().min(8),
  SESSION_SECRET: z.string().min(32),

  // Database (plan 02)
  DATABASE_PATH: z.string().default('./data/pipeline.db'),

  // YouTube (plan 04)
  YOUTUBE_API_KEY: z.string().min(20),

  // LLM (plan 05)
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().default('not-needed'),
  LLM_MODEL_THINK: z.string().min(1),
  LLM_MODEL_FAST: z.string().min(1),

  // Pipeline (spec §14)
  PIPELINE_TRIGGER_HOUR: z.coerce.number().int().min(0).max(23).default(4),
  PIPELINE_TRIGGER_MINUTE: z.coerce.number().int().min(0).max(59).default(0),
  PIPELINE_MIN_SUBSCRIBERS: z.coerce.number().int().nonnegative().default(80000),
  PIPELINE_MAX_SUBSCRIBERS: z.coerce.number().int().positive().default(1000000),
  PIPELINE_TARGET_COUNTRY: z.string().length(2).default('IT'),
  PIPELINE_TARGET_LANGUAGE: z.string().length(2).default('it'),
  PIPELINE_KEYWORDS_PER_RUN: z.coerce.number().int().positive().default(30),
  PIPELINE_TARGET_QUALIFIED_PER_RUN: z.coerce.number().int().positive().default(50),
  PIPELINE_INACTIVE_DAYS: z.coerce.number().int().positive().default(60),
  PIPELINE_REQUALIFY_AFTER_DAYS: z.coerce.number().int().positive().default(90),
  PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT: z.coerce.number().int().positive().default(10000),
  PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER: z.coerce.number().int().nonnegative().default(500),

  // Storage
  DATA_DIR: z.string().default('./data'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
```

- [x] Make sure `dotenv/config` import is conditional in production where env is provided by the OS, not a `.env` file
- [x] Update `.env.example` to include EVERY var with a sensible placeholder and an inline comment
- [x] Mark completed

### Task 3: Path conventions

- [x] Create `src/lib/storage/paths.ts` exposing pure functions that build relative paths under `DATA_DIR`:

```typescript
export const dataDir = () => env.DATA_DIR;

export const paths = {
  db: () => path.join(env.DATA_DIR, 'pipeline.db'),
  logsDir: () => path.join(env.DATA_DIR, 'logs'),

  rawYoutubeSearch: (date: string, slug: string, ts: string) =>
    path.join('raw', 'youtube', 'search', date, `${slug}-${ts}.json`),

  rawYoutubeChannelMeta: (channelId: string, ts: string) =>
    path.join('raw', 'youtube', 'channels', channelId, `meta-${ts}.json`),

  rawYoutubeChannelUploads: (channelId: string, ts: string) =>
    path.join('raw', 'youtube', 'channels', channelId, `uploads-${ts}.json`),

  rawYoutubeVideosBatch: (channelId: string, ts: string) =>
    path.join('raw', 'youtube', 'videos', channelId, `batch-${ts}.json`),

  rawTranscript: (channelId: string, videoId: string) =>
    path.join('raw', 'transcripts', channelId, `${videoId}.json`),

  rawLlmVideoSelection: (channelId: string, runId: number, ts: string) =>
    path.join('raw', 'llm', 'video_selections', channelId, `run-${runId}-${ts}.json`),

  rawLlmQualification: (channelId: string, runId: number, ts: string) =>
    path.join('raw', 'llm', 'qualifications', channelId, `run-${runId}-${ts}.json`),

  rawLlmDraft: (channelId: string, ts: string) =>
    path.join('raw', 'llm', 'drafts', channelId, `${ts}.json`),
};

export function tsForFilename(d = new Date()): string {
  // ISO with `:` replaced by `-` for filesystem safety
  return d.toISOString().replace(/:/g, '-');
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}
```

- [x] All raw paths are relative; absolute path = `path.join(env.DATA_DIR, relative)`. Stored in DB as the relative path only (spec §7).
- [x] Mark completed

### Task 4: Raw dump / load API

- [x] Create `src/lib/storage/raw.ts`:

```typescript
export async function dumpRaw(relativePath: string, payload: unknown): Promise<string>;
// returns the relativePath after writing { ensures parent dir }

export async function loadRaw<T = unknown>(relativePath: string): Promise<T>;
// throws ENOENT if missing

export async function deleteRawForChannel(channelId: string): Promise<void>;
// removes data/raw/{transcripts,youtube/channels,youtube/videos,llm/qualifications,
// llm/video_selections,llm/drafts}/<channelId>/ — used by GDPR deletion in plan 12
```

- [x] All writes are atomic: write to `<path>.tmp` then `fs.rename`
- [x] All reads use `fs.readFile` + `JSON.parse`; errors are surfaced, not swallowed
- [x] Unit tests covering round-trip and `deleteRawForChannel`
- [x] Mark completed

### Task 5: Logger

- [x] Create `src/lib/logger.ts`:

```typescript
import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'creator-pipeline' },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
```

- [x] In production, additionally write to `data/logs/worker-<date>.log` via `pino.multistream` with daily rotation (use a small rotation helper or `pino/file`)
- [x] Mark completed

### Task 6: Settings service

- [x] Create `src/lib/services/settings.ts`:

```typescript
type FiltersSetting = {
  minSubscribers: number;
  maxSubscribers: number;
  country: string;
  language: string;
  requalifyAfterDays: number;
  inactiveDays: number;
};

type PipelineConfigSetting = {
  keywordsPerRun: number;
  targetQualifiedPerRun: number;
};

export async function getFilters(): Promise<FiltersSetting>;
export async function updateFilters(patch: Partial<FiltersSetting>): Promise<FiltersSetting>;

export async function getPipelineConfig(): Promise<PipelineConfigSetting>;
export async function updatePipelineConfig(
  patch: Partial<PipelineConfigSetting>,
): Promise<PipelineConfigSetting>;
```

- [x] Backed by the `settings` table (plan 02); reads cache for 30 seconds in-process to reduce DB hits in hot paths
- [x] On read miss, fall back to the env defaults from `env.ts` and persist them
- [x] Used by the UI Settings page (plan 13) and the worker (plan 10)
- [x] Unit tests: round-trip read/write, partial update merges with stored value
- [x] Mark completed

### Task 7: Tests

- [ ] `src/lib/env/__tests__/env.test.ts` — Vitest with `process.env` stub: missing required var → process exits with non-zero
- [ ] `src/lib/storage/__tests__/raw.test.ts` — round-trip dump/load, atomic write, deleteRawForChannel removes the right tree
- [ ] `src/lib/services/__tests__/settings.test.ts` — partial updates merge correctly, defaults are persisted on first read
- [ ] Mark completed

### Task 8: Bootstrap script

- [ ] Create `scripts/bootstrap.ts` invoked by `pnpm bootstrap`:
  - confirms `.env` exists (else creates from `.env.example` with a warning)
  - creates `data/`, `data/logs/`, `data/raw/` if missing
  - runs `pnpm db:init` programmatically
  - logs the resolved env (with secrets masked) for sanity check
- [ ] Mark completed

### Task 9: Definition of Done

- [ ] `pnpm typecheck` passes
- [ ] All unit tests pass
- [ ] `pnpm dev` with valid `.env` boots; with a missing required var, it exits with a clear list of errors
- [ ] `pnpm bootstrap` works on a clean checkout (no `data/`, no `.env`)
- [ ] Settings service round-trips through DB and falls back to env defaults on first access
- [ ] Mark completed
