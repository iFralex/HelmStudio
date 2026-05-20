# Technical Design Document
## YouTube Creator Discovery, Qualification & Outreach Pipeline

**Version:** 1.0
**Date:** 2026-05-20
**Author:** [you]
**Status:** Ready for implementation

---

## 1. Executive Summary

A single-operator system that automatically discovers Italian YouTube channels, qualifies each one with an LLM that decides — per channel, with no hardcoded niche — whether the creator's workflow is automatable and what specifically could be offered, and prepares per-channel outreach drafts after the operator manually inserts the contact email.

Key properties:
- Runs as a **nightly batch** on the operator's Mac (no VPS required).
- **No automated email send.** The operator inserts the email address per channel and reviews the AI-generated draft before sending it from their own email client.
- **Free infrastructure**: SQLite on disk, official YouTube Data API v3 free tier (10,000 units/day), local LLM proxy exposing Claude via an OpenAI-compatible endpoint.
- **Full raw data persistence**: every API response (YouTube and LLM) is dumped to disk in a structured tree so any past channel, video, or qualification can be reviewed or reused without re-querying.
- **Thorough discovery**: combines keyword sweep (~70 Italian seed keywords, rotated) and category-based exploration across 11 YouTube categories, deduplicates, then filters before LLM qualification.
- **Agentic qualification**: a two-step LLM agent first surveys 20 recent videos, classifies each by its role in the channel's format (format anchor / representative / extemporaneous / outlier), and autonomously selects 3-5 videos whose transcripts are then fetched and fed back into a richer final assessment.

---

## 2. Scope, Goals & Non-Goals

### Goals
- Produce ~50 fully-qualified candidate channels per day, each with a rich AI assessment.
- Stay strictly within the YouTube Data API v3 free-tier daily quota (10,000 units).
- Keep total monthly cost effectively zero (Mac-hosted, free APIs, LLM via local proxy on Claude subscription).
- Provide a usable Next.js UI for review, manual email injection, draft generation, and status tracking.
- Save every raw artifact (search results, channel metadata, video lists, LLM prompts and responses) to disk in a structured, browsable layout.

### Non-Goals (v1)
- Automated email sending.
- Multi-tenant / multi-user.
- Reply tracking via inbox integration. Statuses are updated manually.
- Multi-country expansion. Italy only for now.

---

## 3. System Architecture

```
                  ┌─────────────────────────────────────────────┐
                  │  Background Worker (npx tsx worker/run.ts)  │
                  │  Triggered nightly by launchd OR manually   │
                  │  from the UI ("Run pipeline now")           │
                  └──────────────────┬──────────────────────────┘
                                     │
       ┌─────────────────────────────┼─────────────────────────────┐
       │                             │                             │
       ▼                             ▼                             ▼
┌─────────────┐               ┌─────────────┐               ┌─────────────┐
│  Discovery  │──────────────▶│Qualification│──────────────▶│  Outreach   │
│  (YouTube   │               │   (LLM via  │               │   Queue     │
│   Data API) │               │ local proxy)│               │  (DB state) │
└─────────────┘               └─────────────┘               └─────────────┘
       │                             │                             │
       ▼                             ▼                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│              SQLite (data/pipeline.db) + Raw blobs on disk           │
│              data/raw/youtube/...    data/raw/llm/...                │
└──────────────────────────────────────────────────────────────────────┘
       ▲                             ▲                             ▲
       │                             │                             │
       └─────────────────────────────┼─────────────────────────────┘
                                     │
                                     │ reads
                                     │
                  ┌──────────────────┴──────────────────┐
                  │       Next.js UI (App Router)        │
                  │  - Dashboard, channels list, detail  │
                  │  - Manual email input → draft        │
                  │  - Status updates, run history       │
                  └──────────────────────────────────────┘
```

The worker and the UI are **two separate processes sharing the same SQLite file** and the same `data/raw/` tree:
- `next dev` (or `next start` in production) → port 3000, the UI
- `npx tsx src/worker/run.ts` → invoked by launchd at scheduled time, or by an internal API route triggered from the UI

SQLite is configured in **WAL mode** so the UI can read while the worker writes.

---

## 4. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript 5.x** | Strong typing; you're more confident here than Python |
| Runtime | **Node.js 20 LTS** | Stable, native fetch, good perf for I/O-bound work |
| Framework | **Next.js 15 (App Router)** | Full-stack: UI + API routes + server actions in one project |
| Database | **SQLite via better-sqlite3** | Zero-config, file-on-disk, fast synchronous reads, perfect for single user. WAL mode lets worker + UI coexist |
| ORM | **Drizzle ORM** | TS-first, lightweight, great types, simple migrations |
| Migrations | **drizzle-kit** | Generated from schema files |
| UI styling | **Tailwind CSS v4** | Standard, zero-bikeshed |
| UI components | **shadcn/ui** | Copy-pasteable, owned in your repo, Tailwind-native |
| YouTube client | **googleapis** (official Google npm package) | Official, typed, handles auth & pagination |
| LLM client | **openai** npm SDK | Used against your local OpenAI-compatible proxy |
| Scheduling | **launchd** (macOS native) + manual UI trigger | More reliable on Mac than cron; wakes the machine if configured |
| Logging | **pino** + log files in `data/logs/` | Structured JSON logs |
| Schema validation | **zod** | Validate LLM JSON responses before persisting |
| Process runner (dev) | **tsx** | Run TS files directly without a build step |

### Stack rationale: why Node/TS over Python

You're more confident in TS, you'll be reviewing AI-generated code, and you'll be debugging it yourself. The single-language full-stack approach (UI + worker + DB layer all in TS) means one set of types, one tsconfig, one node_modules. The Mac-hosting constraint also rules out anything that requires a heavier runtime.

### Vercel free-tier feasibility (short answer: no, for the worker)

Vercel Hobby has 10-second function timeouts (60s on Edge). The worker run can take 20–40 minutes (mostly LLM latency: ~50 channels × ~10s/call = 500s + YouTube API). It does not fit serverless. **The Mac is the right host for the worker.** The UI alone could run on Vercel later (it's stateless except for the DB), but for v1 keep everything on the Mac and access the UI at `http://localhost:3000`.

If you later want remote access without buying a VPS: use Tailscale (free) to access the Mac from anywhere via its private IP.

---

## 5. Project Structure

```
yt-creator-pipeline/
├── src/
│   ├── app/                              # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx                      # Dashboard
│   │   ├── channels/
│   │   │   ├── page.tsx                  # List
│   │   │   └── [channelId]/
│   │   │       └── page.tsx              # Detail
│   │   ├── runs/
│   │   │   └── page.tsx                  # Run history
│   │   ├── settings/
│   │   │   └── page.tsx                  # Keywords, filters, models
│   │   ├── login/
│   │   │   └── page.tsx                  # Single password gate
│   │   └── api/
│   │       ├── pipeline/
│   │       │   └── run/route.ts          # POST: trigger run from UI
│   │       ├── channels/
│   │       │   └── [id]/
│   │       │       ├── email/route.ts    # POST: save email + trigger draft
│   │       │       ├── draft/route.ts    # POST: regenerate draft
│   │       │       ├── status/route.ts   # PATCH: update outreach status
│   │       │       └── delete/route.ts   # DELETE: GDPR deletion
│   │       └── auth/route.ts             # Single password check
│   ├── components/                       # shadcn/ui + custom
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts                 # Drizzle schema
│   │   │   ├── client.ts                 # DB connection
│   │   │   └── queries.ts                # Typed queries
│   │   ├── youtube/
│   │   │   ├── client.ts                 # googleapis wrapper
│   │   │   ├── search.ts                 # search.list logic
│   │   │   ├── channels.ts               # channels.list batch
│   │   │   ├── videos.ts                 # videos.list batch
│   │   │   └── quota.ts                  # Quota tracking
│   │   ├── llm/
│   │   │   ├── client.ts                 # OpenAI SDK against local proxy
│   │   │   ├── qualify.ts                # Qualification prompt + call
│   │   │   ├── draft.ts                  # Outreach draft prompt + call
│   │   │   └── schemas.ts                # zod schemas for outputs
│   │   ├── storage/
│   │   │   ├── raw.ts                    # Dump/load raw blobs to disk
│   │   │   └── paths.ts                  # Path conventions
│   │   ├── pipeline/
│   │   │   ├── run.ts                    # Orchestrator
│   │   │   ├── discovery.ts              # Stage 1
│   │   │   ├── enrichment.ts             # Stage 2 (channel + videos)
│   │   │   ├── filter.ts                 # Pre-qualification filter
│   │   │   ├── qualification.ts          # Stage 3 (LLM)
│   │   │   └── events.ts                 # Audit log
│   │   ├── seeds/
│   │   │   ├── keywords.ts               # Italian seed keyword pool
│   │   │   └── categories.ts             # YouTube category IDs to use
│   │   ├── auth.ts                       # Single-password session
│   │   └── env.ts                        # Typed env access
│   └── worker/
│       └── run.ts                        # Entry point for batch worker
├── data/
│   ├── pipeline.db                       # SQLite (gitignored)
│   ├── logs/
│   │   ├── worker-YYYY-MM-DD.log
│   │   └── ui.log
│   └── raw/
│       ├── youtube/
│       │   ├── search/
│       │   ├── channels/
│       │   └── videos/
│       └── llm/
│           ├── qualifications/
│           └── drafts/
├── drizzle/                              # Generated migrations
├── scripts/
│   ├── init-db.ts                        # First-time DB setup
│   ├── seed-keywords.ts                  # Import initial keyword list
│   └── install-launchd.sh                # Install nightly schedule
├── .env.example
├── .env                                  # gitignored
├── .gitignore
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── next.config.ts
└── README.md
```

`.gitignore` must include: `.env`, `data/`, `node_modules/`, `.next/`.

---

## 6. Data Model

SQLite via Drizzle ORM. WAL mode enabled so the worker and the UI can read/write concurrently.

### 6.1 Schema overview

```typescript
// src/lib/db/schema.ts
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── Core entities ────────────────────────────────────────────────────────

export const channels = sqliteTable('channels', {
  // YouTube channel ID is the primary key (e.g. "UCxxx...")
  id: text('id').primaryKey(),
  handle: text('handle'),                        // @handle if available
  title: text('title').notNull(),
  description: text('description'),
  country: text('country'),                      // ISO 3166-1 alpha-2
  defaultLanguage: text('default_language'),
  customUrl: text('custom_url'),

  // Stats (snapshot at lastFetchedAt)
  subscriberCount: integer('subscriber_count'),
  viewCount: integer('view_count'),
  videoCount: integer('video_count'),

  // YouTube metadata
  uploadsPlaylistId: text('uploads_playlist_id'),
  thumbnailUrl: text('thumbnail_url'),
  channelPublishedAt: text('channel_published_at'),  // ISO 8601

  // Pipeline state
  discoveryStatus: text('discovery_status', {
    enum: ['candidate', 'enriched', 'rejected_pre_qual', 'qualified', 'rejected_post_qual']
  }).notNull().default('candidate'),
  rejectionReason: text('rejection_reason'),
  discoverySource: text('discovery_source'),     // e.g. "keyword:notizie" or "category:25"

  // Outreach state
  outreachStatus: text('outreach_status', {
    enum: ['none', 'email_added', 'drafted', 'sent', 'replied', 'no_reply', 'ignored']
  }).notNull().default('none'),
  email: text('email'),
  emailAddedAt: integer('email_added_at', { mode: 'timestamp' }),
  outreachSentAt: integer('outreach_sent_at', { mode: 'timestamp' }),
  outreachNotes: text('outreach_notes'),

  // Latest qualification ref (denormalized for fast UI)
  latestQualificationId: integer('latest_qualification_id'),
  latestAutomationScore: integer('latest_automation_score'),

  // Raw blob ref
  rawMetaPath: text('raw_meta_path'),

  // Timestamps
  discoveredAt: integer('discovered_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  lastFetchedAt: integer('last_fetched_at', { mode: 'timestamp' }),
  lastQualifiedAt: integer('last_qualified_at', { mode: 'timestamp' }),
}, (t) => ({
  idxDiscoveryStatus: index('idx_channels_discovery_status').on(t.discoveryStatus),
  idxOutreachStatus: index('idx_channels_outreach_status').on(t.outreachStatus),
  idxScore: index('idx_channels_score').on(t.latestAutomationScore),
  idxCountry: index('idx_channels_country').on(t.country),
}));

export const videos = sqliteTable('videos', {
  id: text('id').primaryKey(),                   // YouTube video ID
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
  duration: text('duration'),                    // ISO 8601 (e.g. PT12M34S)
  durationSeconds: integer('duration_seconds'),
  viewCount: integer('view_count'),
  likeCount: integer('like_count'),
  commentCount: integer('comment_count'),
  thumbnailUrl: text('thumbnail_url'),
  tags: text('tags', { mode: 'json' }),          // string[]
  categoryId: text('category_id'),
  defaultLanguage: text('default_language'),
  defaultAudioLanguage: text('default_audio_language'),
  rawPath: text('raw_path'),
  fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  idxChannel: index('idx_videos_channel').on(t.channelId),
  idxPublished: index('idx_videos_published').on(t.publishedAt),
}));

export const qualifications = sqliteTable('qualifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  runId: integer('run_id').references(() => pipelineRuns.id),
  videoSelectionId: integer('video_selection_id').references(() => videoSelections.id),

  // LLM call metadata
  modelUsed: text('model_used').notNull(),
  promptVersion: text('prompt_version').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  latencyMs: integer('latency_ms'),

  // Structured assessment (the LLM output, also stored separately as raw JSON on disk)
  nicheClassification: text('niche_classification'),       // free-form text
  formatType: text('format_type'),                          // free-form text
  automationPotentialScore: integer('automation_potential_score'),  // 0-100
  automatableWorkflows: text('automatable_workflows', { mode: 'json' }), // array of objects
  suggestedSolution: text('suggested_solution'),
  pitchAngle: text('pitch_angle'),
  pitchLanguage: text('pitch_language', { enum: ['it', 'en'] }),
  signals: text('signals', { mode: 'json' }),               // array of {type, evidence, videoId?}
  disqualifiers: text('disqualifiers', { mode: 'json' }),   // array of strings
  confidence: real('confidence'),                            // 0..1
  rationale: text('rationale'),

  // Reference to raw dump
  rawResponsePath: text('raw_response_path').notNull(),
  rawPromptPath: text('raw_prompt_path').notNull(),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  idxChannel: index('idx_qual_channel').on(t.channelId),
  idxScore: index('idx_qual_score').on(t.automationPotentialScore),
}));

export const videoSelections = sqliteTable('video_selections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  runId: integer('run_id').references(() => pipelineRuns.id),

  // LLM step-1 (agent) output, captured for inspection in the UI
  videoClassifications: text('video_classifications', { mode: 'json' }).notNull(),
      // Array of: { videoId, classification, reasoning, automationRelevanceScore }
      // classification ∈ 'format_anchor' | 'representative' | 'extemporaneous' | 'outlier'

  selectedVideoIds: text('selected_video_ids', { mode: 'json' }).notNull(),
      // 3 to 5 videoIds chosen by the agent for transcript fetch

  formatConsistencySummary: text('format_consistency_summary'),
  selectionRationale: text('selection_rationale'),

  modelUsed: text('model_used').notNull(),
  promptVersion: text('prompt_version').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  latencyMs: integer('latency_ms'),
  rawResponsePath: text('raw_response_path').notNull(),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  idxChannel: index('idx_vselect_channel').on(t.channelId),
}));

export const transcripts = sqliteTable('transcripts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  videoId: text('video_id').notNull().references(() => videos.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),

  language: text('language'),                       // detected lang code
  source: text('source', { enum: ['youtube_transcript', 'captions_api'] }).notNull(),
      // 'youtube_transcript' = via npm `youtube-transcript` (public timedtext)
      // 'captions_api' = official Data API captions.download (kept for the future)

  text: text('text'),                                // full concatenated transcript text
  segments: text('segments', { mode: 'json' }),      // [{ start, duration, text }, ...]
  characterCount: integer('character_count'),
  fetchSucceeded: integer('fetch_succeeded', { mode: 'boolean' }).notNull().default(true),
  fetchError: text('fetch_error'),
  rawPath: text('raw_path'),

  fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  idxVideo: index('idx_transcripts_video').on(t.videoId),
  idxChannel: index('idx_transcripts_channel').on(t.channelId),
}));

export const outreachDrafts = sqliteTable('outreach_drafts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  qualificationId: integer('qualification_id').references(() => qualifications.id),

  language: text('language', { enum: ['it', 'en'] }).notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),

  modelUsed: text('model_used').notNull(),
  promptVersion: text('prompt_version').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  rawResponsePath: text('raw_response_path').notNull(),

  isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  idxChannel: index('idx_draft_channel').on(t.channelId),
}));

// ─── Operational tables ───────────────────────────────────────────────────

export const pipelineRuns = sqliteTable('pipeline_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  status: text('status', { enum: ['running', 'completed', 'failed', 'cancelled'] }).notNull().default('running'),
  triggeredBy: text('triggered_by', { enum: ['cron', 'manual'] }).notNull(),

  // Stage counters
  searchesPerformed: integer('searches_performed').notNull().default(0),
  candidatesFound: integer('candidates_found').notNull().default(0),
  channelsEnriched: integer('channels_enriched').notNull().default(0),
  channelsPreRejected: integer('channels_pre_rejected').notNull().default(0),
  channelsQualified: integer('channels_qualified').notNull().default(0),
  channelsPostRejected: integer('channels_post_rejected').notNull().default(0),

  // Resource usage
  youtubeQuotaUsed: integer('youtube_quota_used').notNull().default(0),
  llmCallsCount: integer('llm_calls_count').notNull().default(0),
  llmTokensInput: integer('llm_tokens_input').notNull().default(0),
  llmTokensOutput: integer('llm_tokens_output').notNull().default(0),

  errorMessage: text('error_message'),
  errorStack: text('error_stack'),
});

export const pipelineEvents = sqliteTable('pipeline_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: integer('run_id').references(() => pipelineRuns.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').references(() => channels.id, { onDelete: 'set null' }),
  stage: text('stage', { enum: ['discovery', 'enrichment', 'filter', 'qualification', 'meta'] }).notNull(),
  level: text('level', { enum: ['info', 'warn', 'error'] }).notNull().default('info'),
  event: text('event').notNull(),                  // short code e.g. "channel_enriched"
  message: text('message'),                        // human-readable
  details: text('details', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  idxRun: index('idx_events_run').on(t.runId),
  idxChannel: index('idx_events_channel').on(t.channelId),
}));

export const quotaLedger = sqliteTable('quota_ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // YouTube quota resets at midnight Pacific Time, but we track per UTC day for simplicity
  // and reserve a buffer to be safe.
  date: text('date').notNull(),                    // YYYY-MM-DD
  operation: text('operation').notNull(),          // 'search.list', 'channels.list', etc.
  units: integer('units').notNull(),
  runId: integer('run_id').references(() => pipelineRuns.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  idxDate: index('idx_quota_date').on(t.date),
}));

export const seedKeywords = sqliteTable('seed_keywords', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  keyword: text('keyword').notNull().unique(),
  notes: text('notes'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  totalUses: integer('total_uses').notNull().default(0),
  totalCandidatesProduced: integer('total_candidates_produced').notNull().default(0),
  addedAt: integer('added_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});
```

### 6.2 Notes on schema design

- **Timestamps** are stored as Unix epoch integers (Drizzle's `{ mode: 'timestamp' }` handles JS Date conversion). YouTube ISO 8601 dates are stored as text where they come from the API verbatim (e.g. `channelPublishedAt`).
- **`channels.discoveryStatus`** and **`channels.outreachStatus`** are independent state machines. A channel starts as `candidate`, becomes `enriched` after channel + video metadata is fetched, then either `qualified` or one of the rejection states. Outreach status is updated only by operator actions in the UI.
- **`latestQualificationId` / `latestAutomationScore`** are denormalized on `channels` so the list view doesn't need joins for sorting and filtering.
- **Raw blob paths** are stored relative to `data/raw/` so the DB stays portable.
- **Cascade deletes** on `videos`, `qualifications`, `outreachDrafts`, and `pipelineEvents` mean GDPR deletion of a channel cleans up everything downstream.

### 6.3 Initialization

`scripts/init-db.ts` runs the Drizzle migrator, then seeds:
- The default keyword list (appendix B) into `seed_keywords`.
- Default settings into `settings` (filters, model names, etc.).

```bash
npm run db:init
```

---

## 7. Raw Data Storage

Every external API response — YouTube and LLM — is dumped to disk as JSON. The DB stores a relative path; the file is the source of truth for re-analysis or debugging.

### 7.1 Directory layout

```
data/raw/
├── youtube/
│   ├── search/
│   │   └── 2026-05-20/
│   │       ├── notizie-1715000000.json          # full search.list response
│   │       └── rassegna-stampa-1715000300.json
│   ├── channels/
│   │   └── UCxxxxxxxxxxxxxxxxxxxxx/
│   │       ├── meta-2026-05-20T04-12-33Z.json   # channels.list response
│   │       └── uploads-2026-05-20T04-12-35Z.json # playlistItems.list response
│   └── videos/
│       └── UCxxxxxxxxxxxxxxxxxxxxx/
│           ├── batch-2026-05-20T04-12-40Z.json  # videos.list batch response
│           └── batch-2026-05-20T04-12-42Z.json
├── transcripts/
│   └── UCxxxxxxxxxxxxxxxxxxxxx/
│       ├── abc123XYZ_.json                    # raw youtube-transcript output
│       └── def456ABC_.json
└── llm/
    ├── video_selections/
    │   └── UCxxxxxxxxxxxxxxxxxxxxx/
    │       └── run-42-2026-05-20T04-22-00Z.json  # step-1 (agent) output
    ├── qualifications/
    │   └── UCxxxxxxxxxxxxxxxxxxxxx/
    │       └── run-42-2026-05-20T04-30-12Z.json  # step-3 (final) output
    └── drafts/
        └── UCxxxxxxxxxxxxxxxxxxxxx/
            └── 2026-05-21T10-05-00Z.json
```

### 7.2 File format

Each LLM blob is wrapped with full reproducibility context:

```json
{
  "schema_version": "1.0",
  "kind": "qualification",
  "channel_id": "UCxxxxxxxxxxxxxxxxxxxxx",
  "run_id": 42,
  "model": "claude-opus-4",
  "prompt_version": "qualify-v1",
  "request": {
    "messages": [
      { "role": "system", "content": "..." },
      { "role": "user", "content": "..." }
    ],
    "temperature": 0.3,
    "max_tokens": 2000
  },
  "response": { /* full OpenAI-compatible response */ },
  "parsed": { /* the validated object that went into the DB */ },
  "usage": { "input_tokens": 3421, "output_tokens": 512 },
  "latency_ms": 8312,
  "timestamp": "2026-05-20T04:30:12Z"
}
```

YouTube blobs are the raw `googleapis` response as returned, plus a thin envelope:

```json
{
  "kind": "search.list",
  "params": { "q": "notizie", "type": "channel", ... },
  "response": { /* raw */ },
  "quota_units": 100,
  "timestamp": "2026-05-20T04:00:00Z"
}
```

### 7.3 `src/lib/storage/raw.ts` API

```typescript
export async function dumpRaw(
  category: 'youtube' | 'llm',
  subPath: string,                  // e.g. "search/2026-05-20/notizie-...json"
  payload: object
): Promise<string>                   // returns relative path stored in DB

export async function loadRaw(relativePath: string): Promise<object>
```

The storage layer creates parent directories as needed and uses ISO timestamps with `:` replaced by `-` to be filesystem-safe on all platforms.

---

## 8. Phase 1 — Discovery

### 8.1 Goal

Produce ~150 new candidate channel IDs per daily run, drawn from a combination of keyword sweep (strategy A) and category exploration (strategy C), deduplicated against channels already in the DB.

### 8.2 Sub-stage 1a: keyword sweep

YouTube Data API v3 `search.list` is used with `type=channel` and `regionCode=IT` and `relevanceLanguage=it`.

- Per call: returns up to 50 results, costs 100 quota units.
- Pagination: up to 5 pages per keyword (`pageToken` chain) → 250 results per keyword, 500 units.
- **In practice** we take 1 page (50 results) per keyword per day; thoroughness comes from keyword diversity, not depth.

Keyword rotation: from `seed_keywords` table, pick the N keywords with the smallest `lastUsedAt` (oldest first). N is computed dynamically based on remaining quota budget. Default N = 30 keywords/day → 30 × 100 = 3,000 units.

For each keyword:
1. Call `search.list` with `q=<keyword>`, `type=channel`, `regionCode=IT`, `relevanceLanguage=it`, `maxResults=50`.
2. Dump response to `data/raw/youtube/search/<date>/<slug>-<ts>.json`.
3. Insert new candidate channel IDs into `channels` table (status=`candidate`, `discoverySource`=`keyword:<keyword>`).
4. Log a `pipelineEvent`: `discovery_keyword_complete` with count of new channels.
5. Update `seed_keywords.lastUsedAt`, `totalUses`, `totalCandidatesProduced`.

### 8.3 Sub-stage 1b: category exploration

For each YouTube video category in scope (see appendix C — 11 categories, excluding Music and Pets & Animals):

1. Call `videos.list` with `chart=mostPopular`, `regionCode=IT`, `videoCategoryId=<id>`, `maxResults=50`. Cost: 1 unit per call.
2. Extract `channelId` from each video.
3. Deduplicate and insert as candidates (`discoverySource`=`category:<id>`).

Cost: 11 categories × 1 unit = 11 units. Yields ~400-500 unique channels per run (with heavy overlap day-to-day; the dedup on `channels.id` handles it).

### 8.4 Sub-stage 1c: channel enrichment

For all new candidates from 1a and 1b (deduplicated):

1. Batch in groups of 50.
2. Call `channels.list` with `part=snippet,statistics,contentDetails,brandingSettings`, `id=<id1,id2,...,id50>`. Cost: 1 unit per call.
3. For each returned channel, update the row with: subscriber count, view count, video count, country, default language, uploads playlist ID, channel published date, full description, thumbnail.
4. Dump raw response per channel under `data/raw/youtube/channels/<id>/meta-<ts>.json`.
5. Set `discoveryStatus = 'enriched'`.

Cost estimate: 50 batches max = 50 units for 2,500 channels.

### 8.5 Sub-stage 1d: pre-qualification filter

This is a pure-DB step with no API calls. Applied to all newly enriched channels:

- Reject if `subscriberCount < 80,000` → `discoveryStatus = 'rejected_pre_qual'`, reason `'below_min_subscribers'`.
- Reject if `subscriberCount > 1,000,000` → reason `'above_max_subscribers'`.
- Reject if `country IS NOT NULL AND country != 'IT'` → reason `'wrong_country'`. (Some Italian creators leave country null; we keep those and let the LLM judge.)
- Reject if `defaultLanguage` is set and not in `['it', null]` → reason `'wrong_language'`.
- Reject if channel's most recent upload (we check `uploadsPlaylistId` in sub-stage 2 below; in v1 do this check there) → reason `'inactive'`.
- Reject if `videoCount < 20` → reason `'too_few_videos'`.

Surviving channels stay at `discoveryStatus = 'enriched'` and become eligible for stage 2.

### 8.6 Sub-stage 2: video metadata

For each enriched channel (capped at `PIPELINE_TARGET_QUALIFIED_PER_DAY`, default 50):

1. Fetch most recent 20 video IDs from the uploads playlist:
   - `playlistItems.list` with `playlistId=<uploadsPlaylistId>`, `maxResults=20`. Cost: 1 unit.
2. Reject channel if most recent video is older than 60 days → `rejected_pre_qual`, reason `'inactive'`.
3. Fetch full video details:
   - `videos.list` with `part=snippet,contentDetails,statistics`, `id=<comma-separated>`, `maxResults=50`. Cost: 1 unit (1 batch suffices for 20 videos).
4. Insert into `videos` table.
5. Dump raw to `data/raw/youtube/videos/<channel-id>/batch-<ts>.json`.

Cost: 50 channels × (1 + 1) = 100 units.

### 8.7 Quota budget summary

| Sub-stage | Calls | Unit cost | Total | Notes |
|---|---|---|---|---|
| 1a Keyword sweep | 30 | 100 | 3,000 | 30 keywords × 1 page |
| 1b Category exploration | 11 | 1 | 11 | One call per category |
| 1c Channel enrichment | ~50 | 1 | 50 | Batches of 50 |
| 2 Video metadata | ~100 | 1 | 100 | 50 channels × (playlist + videos) |
| **Subtotal** | | | **~3,200** | |
| **Buffer for retries** | | | **~1,000** | |
| **Total budget** | | | **~4,200** | Well under 10,000 |

The remaining ~5,800 units/day are intentional headroom. If you later want to add more keywords or scan more pages per keyword for thoroughness, you have room to do it without redesign.

---

## 9. Phase 2 — Agentic Qualification (Two-step + transcripts)

### 9.1 Overview

Qualification is an **agentic two-step pipeline**. The LLM itself decides which of the channel's 20 most recent videos are most worth examining in depth via transcript, those transcripts are then downloaded, and a final assessment is produced with the richer evidence in hand.

```
For each channel surviving the pre-qualification filter (typically ~50/day):

  STEP 1 — VIDEO SELECTION  (LLM call A, prompt "select-v1")
    Input:  channel + 20 recent videos metadata
    Output: per-video classification (format_anchor | representative |
            extemporaneous | outlier) + reasoning + automationRelevanceScore
            + format consistency summary + 3-5 chosen video IDs + rationale

  STEP 2 — TRANSCRIPT FETCH  (no LLM call)
    For each selected videoId:
      - Try `youtube-transcript` library (best-effort, free)
      - Multi-language fallback (it → en → any)
      - Persist success or failure; never block step 3

  STEP 3 — FINAL QUALIFICATION  (LLM call B, prompt "qualify-v2")
    Input:  channel + 20 video metadata + step-1 classifications +
            transcripts of the selected videos (truncated)
    Output: full structured assessment (same schema as v1)
```

The orchestration is in code, but the *judgment* — which videos are recurring formats, which look like one-offs, which are most informative for an automation assessment — is the LLM's. This makes it agentic without the unpredictability of a full tool-calling loop.

### 9.2 Why two steps instead of one

Three reasons:

1. **Token efficiency.** Feeding all 20 transcripts blindly would be ~80k tokens of mostly noise. Letting the LLM choose 3-5 means we pay only for the ~20k tokens of relevant transcripts.
2. **Better judgment.** Forcing the LLM to first classify and rank surfaces explicit reasoning about format consistency — the strongest signal for automation potential. The step-1 output is persisted and surfaced in the UI so the operator can audit the reasoning.
3. **Resilience.** If transcript fetch fails for every selected video, step 3 still runs (with metadata-only) and produces a (lower-confidence) assessment.

### 9.3 Why not a "true" tool-calling agent loop

A tool-calling agent (LLM has a `fetch_transcript(videoId)` tool and runs a free-form loop) is an alternative we considered and rejected for v1 because:

- More LLM calls per channel (3-6 instead of 2) → more latency and cost on paid endpoints.
- Unpredictable bounds (an agent might decide to fetch 12 transcripts).
- The two-step structured approach achieves the same user-facing property — *the AI picks what to examine* — with deterministic cost and clear audit trail.

Tool-calling is listed in §17 Future Considerations as a possible v2 evolution.

### 9.4 Model selection

Two models, both via the OpenAI-compatible local proxy at `LLM_BASE_URL`:

- **`LLM_MODEL_THINK`** (e.g. `claude-opus-4`): used for **both** step 1 and step 3. Step 1 is a judgment-heavy call (deciding what matters); step 3 is the high-value final assessment. On the local proxy the marginal cost is zero, so we use the strong model everywhere.
- **`LLM_MODEL_FAST`** (e.g. `claude-haiku-4-5`): used only for outreach draft generation in stage 3 of the broader pipeline (§10).

If you later run on paid endpoints and want to economize, switch step 1 to `LLM_MODEL_FAST` — the prompt is structured enough that smaller models cope well.

### 9.5 Step 1 — Video selection

**Prompt version:** `select-v1`. Model: `LLM_MODEL_THINK`. Temperature: 0.3.

#### System prompt

```
You are an expert evaluator of YouTube creators' workflow automation potential.

You will be given the metadata of a creator's 20 most recent videos. Your job
is to (a) classify each video by its role in the channel's overall output and
(b) select 3 to 5 videos whose transcripts would best inform an assessment of
whether the creator's video-making workflow is automatable.

Classification labels:
  - "format_anchor": this video exemplifies a recurring, repeatable format the
        creator runs regularly (daily news brief, weekly recap, recurring
        interview slot, fixed-segment commentary). Strongest signal.
  - "representative": typical for the channel's overall mix but not a recurring
        slot of its own. Useful for confirming general style.
  - "extemporaneous": one-off, atypical, or experimental video. Low signal.
  - "outlier": dramatically different from the channel's norm (life update,
        announcement, collab guest spot, sponsored stand-alone).

Selection criteria for the 3-5 transcripts to fetch:
  - Prefer "format_anchor" videos: 2-3 of these.
  - Include 1-2 "representative" videos for breadth.
  - Avoid "extemporaneous" and "outlier" unless they reveal something the
    other categories cannot (e.g. the only example of a sponsored format).
  - If you detect MULTIPLE distinct recurring formats, include at least one
    example of each.
  - Never pick more than 2 transcripts of the same obvious template — one or
    two examples per template is enough.

Output JSON only, conforming to the schema below. No prose, no code fences.
```

#### User message

```
<channel>
  <title>{title}</title>
  <handle>{handle}</handle>
  <description>{description}</description>
  <subscribers>{subscriberCount}</subscribers>
  <total_videos>{videoCount}</total_videos>
</channel>

<aggregate_stats>
  <uploads_per_week_last_90d>{uploadsPerWeek}</uploads_per_week_last_90d>
  <avg_duration_seconds>{avgDurationSeconds}</avg_duration_seconds>
  <duration_stddev_seconds>{durationStddev}</duration_stddev_seconds>
  <title_length_stddev>{titleStddev}</title_length_stddev>
</aggregate_stats>

<recent_videos count="20">
  {for each video:}
  <video id="{videoId}">
    <title>{title}</title>
    <description>{description_truncated_300}</description>
    <published>{publishedAt}</published>
    <duration_seconds>{durationSeconds}</duration_seconds>
    <views>{viewCount}</views>
    <tags>{tags_first_5}</tags>
    <category_id>{categoryId}</category_id>
  </video>
</recent_videos>

<task>
Output ONE JSON object with EXACTLY this shape. All fields required.

{
  "videoClassifications": [
    {
      "videoId": string,
      "classification": "format_anchor" | "representative" | "extemporaneous" | "outlier",
      "reasoning": string,                 // 1 short sentence citing concrete evidence
      "automationRelevanceScore": integer  // 0..10: how much examining THIS video's
                                           // transcript would inform an automation assessment
    }
    // EXACTLY 20 entries, one per input video, in the SAME order as the input
  ],

  "formatConsistencySummary": string,
      // 2-4 sentences. How many distinct recurring formats does this channel run?
      // Cite specific title/duration/structure patterns you observed.
      // If there is no clear recurring format, say so plainly.

  "selectedVideoIds": [string],
      // 3 to 5 video IDs (drawn from the 20 above) whose transcripts you want
      // fetched. Order from highest to lowest priority.

  "selectionRationale": string
      // 2-3 sentences explaining WHY these specific videos.
}
</task>
```

The response is parsed and validated against a zod schema. On invalid JSON, retry once with a correction instruction; on second failure, mark the channel `rejected_post_qual` with reason `'agent_step1_format_failure'` and skip.

### 9.6 Step 2 — Transcript fetch

For each `videoId` in `selectedVideoIds`:

1. **Idempotency check.** If a row exists in `transcripts` for this video with `fetchSucceeded=true`, reuse it.
2. **Fetch via `youtube-transcript`** (npm package):
   ```typescript
   import { YoutubeTranscript } from 'youtube-transcript';
   const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'it' });
   ```
3. **Language fallback ladder.** If `lang: 'it'` fails: retry `lang: 'en'`, then without `lang` (any available, including auto-generated). Record which language ultimately succeeded.
4. **Concatenation.** Join all segments into `text` (a single string) preserving spaces. Keep the timed `segments` JSON as well for later use.
5. **Persist.**
   - Insert a `transcripts` row (success or failure, both recorded).
   - On success, dump `{params, segments, language, fetchedAt}` to `data/raw/transcripts/<channelId>/<videoId>.json`.
6. **Politeness.** Throttle: max 2 transcripts in parallel per channel, with a 200ms gap between requests. We are calling a public endpoint, but a polite client avoids IP rate-limiting from YouTube.

#### Trade-off recorded: official `captions` API vs. `youtube-transcript` library

The original constraint was "use official APIs with those limits". For transcripts the **strictly official** path is `captions.list` (50 units/call) + `captions.download` (200 units/caption). At 5 transcripts × 50 channels/day = **52,500 units/day just for transcripts** — over 5× the entire daily quota. **Not viable on the free tier.**

The `youtube-transcript` library calls YouTube's public `timedtext` endpoint — the same one the web player uses to render captions for every viewer. It is technically outside the Data API surface, but:

- The data is publicly served by YouTube's infrastructure to every visitor.
- The library does not bypass authentication, scrape rendered HTML, or evade rate limits.
- We use the transcripts strictly for internal channel analysis (no republishing).

This is a documented design trade-off, explicitly recorded here so it is not buried. The `transcripts.source` column distinguishes the two paths so a future migration to the official API is purely a code swap. If you ever want to stay strictly on the official API: either skip transcripts entirely (the system degrades to step-3-with-metadata-only — `confidence` will be lower but assessments still happen), or request a Data API quota increase from Google (free if motivated; explain the research use case).

### 9.7 Step 3 — Final qualification

**Prompt version:** `qualify-v2`. Model: `LLM_MODEL_THINK`. Temperature: 0.3.

#### System prompt

```
You are an expert evaluator of YouTube creators' workflow automation potential.
You analyze public channel data — channel metadata, recent video metadata,
your own earlier classification of those videos, and the transcripts of the
ones you flagged as most representative — to decide whether the creator's
video-making process has automatable elements that an AI-tools provider could
productize for them.

You think about: research workload (clearly visible in transcripts of news,
review, analysis content), scripting patterns (repeated phrases, intros,
outros, segment structure observable across transcripts), recurring formats,
production cadence, evidence of single-operator vs team production, topical
freshness needs, and language.

When you cite evidence from transcripts in your `signals`, set the `videoId`
field so the operator can verify against the source.

You answer ONLY in JSON, conforming exactly to the schema in the user message.
No prose outside the JSON. No markdown fences.
```

#### User message

The same blocks as v1 (`<channel>`, `<aggregate_stats>`, `<recent_videos>`) PLUS:

```
<your_earlier_classification>
  <format_consistency_summary>{formatConsistencySummary}</format_consistency_summary>
  <selection_rationale>{selectionRationale}</selection_rationale>
  <video_classifications>
    {compact list: videoId, classification, automationRelevanceScore for each of 20}
  </video_classifications>
</your_earlier_classification>

<transcripts count="{n_successful}">
  {for each successful transcript:}
  <transcript video_id="{videoId}">
    <title>{title}</title>
    <duration_seconds>{durationSeconds}</duration_seconds>
    <language>{language}</language>
    <text>{transcript_text_truncated}</text>
  </transcript>
  {if any failed:}
  <transcripts_unavailable>
    <video id="{videoId}" reason="{reason}"/>
  </transcripts_unavailable>
</transcripts>

<task>
Output a single JSON object conforming to this schema:

{
  "nicheClassification": string,           // free-form niche description
  "formatType": string,                    // dominant format short label
  "automationPotentialScore": integer,     // 0..100
  "automatableWorkflows": [
    {
      "name": string,
      "description": string,               // 1-2 sentences on the current workflow
      "automationApproach": string,        // 1-2 sentences on the AI replacement
      "estimatedTimeSavedPerVideoMinutes": integer
    }
  ],                                        // 0 to 5 items
  "suggestedSolution": string,             // 3-5 sentences, channel-specific
  "pitchAngle": string,                    // 2-3 sentences for the outreach email
  "pitchLanguage": "it" | "en",
  "signals": [
    {
      "type": "positive" | "negative",
      "evidence": string,
      "videoId": string | null             // set if signal references a specific video
    }
  ],                                        // 2 to 8 items
  "disqualifiers": [string],
  "confidence": number,                    // 0..1
  "rationale": string                      // 3-6 sentences
}

You now have richer evidence than metadata alone: cite specific transcript
excerpts in `signals` when relevant, and let the transcripts inform the
SPECIFICITY of `automatableWorkflows.description` and `suggestedSolution`.
</task>
```

The response schema is identical to v1, so downstream DB persistence and UI rendering are unchanged.

### 9.8 Transcript truncation strategy

A 12-minute Italian video transcript is roughly 3,000-4,000 words ≈ 4,500-6,000 tokens. 5 transcripts could total 30k tokens — workable for Claude but wasteful. Per-transcript cap:

- **≤4,000 tokens per transcript.** If the full transcript exceeds the cap, keep `first 2,500 tokens + "... [middle elided, N tokens omitted] ..." + last 1,500 tokens`. Intro and conclusion concentrate the highest signal for format detection (recurring openers, sign-offs, segment markers).
- If fewer than 5 transcripts were successfully fetched, the cap relaxes proportionally (more context budget per transcript).
- Token counting uses `@anthropic-ai/tokenizer` or a simple approximation (`chars / 4`).

### 9.9 Validation, retry, failure modes

For both step 1 and step 3:
- Parse JSON. On parse failure, retry once with the appended user message: `"Your previous response did not match the required JSON schema. Reply with the JSON only."`
- After a second failure, mark the channel `rejected_post_qual` with reason `'llm_format_failure'` and log the raw response.

For step 2 (transcript fetch):
- Per-video failures are **non-blocking**. Logged in `transcripts.fetchError`, do not abort the channel's qualification.
- If 0 of N transcripts succeed, step 3 runs with the `<transcripts count="0">` block and an empty list. Step 3's system prompt is explicit about this case — the LLM should reflect the reduced evidence in a lower `confidence`.

### 9.10 Persistence

On step 1 success:
- Insert `video_selections` row.
- Dump `{request, response, parsed, usage, latency_ms, timestamp}` to `data/raw/llm/video_selections/<channelId>/run-<runId>-<ts>.json`.

On step 2 (per video):
- Insert `transcripts` row (success or failure).
- On success, dump segments + metadata to `data/raw/transcripts/<channelId>/<videoId>.json`.

On step 3 success:
- Dump qualification raw to `data/raw/llm/qualifications/<channelId>/run-<runId>-<ts>.json`.
- Insert `qualifications` row with `videoSelectionId` populated.
- Update `channels.latestQualificationId`, `channels.latestAutomationScore`, `channels.lastQualifiedAt`, `channels.discoveryStatus = 'qualified'`.
- Log `pipelineEvents`: `channel_qualified` with the score and selected video count.

### 9.11 UI surface

The channel detail page (§11.4) gains a new section between **AI assessment** and **Sample videos**:

**"Why these videos" — agent reasoning panel**
- The `formatConsistencySummary` rendered as a quote-styled paragraph.
- The `selectionRationale`.
- A compact 20-row table of every video: thumbnail, title, classification (colored badge), automationRelevanceScore (bar), reasoning. Selected videos are highlighted with a left-border accent.
- For each selected video: a "View transcript" button that opens a modal with the full transcript (paginated if long). A "Transcript unavailable" indicator with the failure reason if the fetch did not succeed.

This makes the agent's reasoning fully auditable: the operator can scan the table, click into a transcript, and verify the AI's reasoning against the source material — exactly the "conferma rapida e chiara" requirement.

### 9.12 Cost & latency estimate

Per channel:

| Step | Input tokens | Output tokens | Wall-clock |
|---|---|---|---|
| 1 (selection) | ~3,500 | ~1,500 | 6-10 s |
| 2 (transcripts × 5) | 0 | 0 | 2-4 s |
| 3 (final) | ~3,500 + ~20,000 | ~600 | 15-25 s |
| **Total** | **~27k** | **~2.1k** | **~25-40 s** |

For 50 channels/run with LLM concurrency 3: ~10-15 min wall-clock for the LLM stages. All free through the local Claude proxy.

If migrated to paid Claude API: roughly **€0.10-0.20/channel with Opus**, **€0.025-0.04/channel with Sonnet**. The local-proxy path stays the default.

---

## 10. Phase 3 — Outreach Preparation

### 10.1 Flow

This phase is **operator-driven**, not run by the worker. It happens in the UI:

1. Operator opens `/channels/[id]` for a qualified channel.
2. Operator reads the AI assessment, watches a few sample videos (links), decides to pursue.
3. Operator pastes the channel's contact email into the email field on the page and clicks **Save**.
4. The system:
   - Stores `channels.email`, sets `channels.outreachStatus = 'email_added'`, sets `emailAddedAt`.
   - **Automatically** kicks off draft generation (a server action calling `src/lib/llm/draft.ts`).
   - Inserts an `outreach_drafts` row, dumps raw under `data/raw/llm/drafts/<channel-id>/<ts>.json`.
   - Sets `channels.outreachStatus = 'drafted'`.
5. The page re-renders showing subject + body in an editable text area.
6. Operator edits if needed, clicks **Copy to clipboard**, pastes into their email client, sends.
7. Operator clicks **Mark as sent** in the UI → `outreachStatus = 'sent'`, `outreachSentAt` recorded.
8. Later, operator updates status manually: `replied` / `no_reply` / `ignored`. An optional `outreachNotes` field captures details.

### 10.2 Draft generation prompt

**Prompt version:** `draft-v1`. Uses `LLM_MODEL_FAST`.

#### System prompt

```
You write personalized cold outreach emails to YouTube creators offering AI workflow
automation services. You write in the language specified by the user. You always
reference a SPECIFIC recurring pattern from the creator's recent videos to demonstrate
you've actually watched their channel. You never use generic AI-pitch phrases like
"leverage cutting-edge AI" or "revolutionize your workflow". You write like a thoughtful
human technical founder reaching out to a creator they actually respect.

Your emails:
- Have a subject line under 60 characters, specific and concrete, NOT clickbait.
- Open by referencing one concrete observation about the creator's work.
- State plainly what you do and what you'd build for them.
- Mention the free pilot period (you build a working prototype tailored to them in week 1,
  they use it for free in week 2, only pay if it helps).
- Close with a low-friction CTA (15-minute call OR reply with feedback).
- Total length: 120-180 words.
- No bullet lists. No emojis. No exclamation marks except possibly one in the close.

Output ONLY a JSON object: { "subject": string, "body": string }.
No markdown fences, no surrounding prose.
```

#### User message (template)

```
Write a cold outreach email in {language}.

Sender: a small AI tooling company that builds custom AI workflow automation for individual
YouTube creators. The model is: week 1 they study the creator's workflow and build a
tailored prototype; week 2 the creator uses it free; if it helps, the creator pays per use
or a small subscription.

About the recipient:

<channel>
  <title>{title}</title>
  <handle>{handle}</handle>
  <subscribers>{subscriberCount}</subscribers>
  <country>{country}</country>
</channel>

<assessment>
  <niche>{nicheClassification}</niche>
  <format>{formatType}</format>
  <suggested_solution>{suggestedSolution}</suggested_solution>
  <pitch_angle>{pitchAngle}</pitch_angle>
</assessment>

<recent_videos count="5">
  {top 5 most recent video titles + published dates}
</recent_videos>

<concrete_workflow_to_reference>
  {automatableWorkflows[0] — the highest-impact one from the assessment}
</concrete_workflow_to_reference>

Write the email now. Reference the workflow above concretely. Output JSON only.
```

### 10.3 Regeneration

The UI exposes a **Regenerate draft** button. Each regeneration creates a new `outreach_drafts` row and flips `is_current` accordingly (only one draft per channel is `is_current=true` at a time). Older drafts remain in DB + on disk for review.

### 10.4 No automated sending

The system **never** sends an email. The body is rendered in an editable textarea with a "Copy" button. The operator chooses the moment to send and the actual identity from which to send. This is intentional both for compliance (operator is in control of every communication) and for quality (every send is reviewed).

---

## 11. UI Specification

Next.js 15 App Router. Tailwind v4 + shadcn/ui for components. Server Components by default; Server Actions for mutations. Single password gate (no users table, just one env-set password and a signed cookie).

### 11.1 Routes

| Route | Purpose |
|---|---|
| `/login` | Single password form |
| `/` | Dashboard |
| `/channels` | List with filters, sort, search |
| `/channels/[id]` | Channel detail + outreach actions |
| `/runs` | Pipeline run history |
| `/runs/[id]` | Single run detail (events log) |
| `/settings` | Keywords, filters, model config |
| `/api/pipeline/run` | POST: trigger an ad-hoc run |
| `/api/channels/[id]/email` | POST: save email + generate draft |
| `/api/channels/[id]/draft` | POST: regenerate draft |
| `/api/channels/[id]/status` | PATCH: update outreach status |
| `/api/channels/[id]/delete` | DELETE: GDPR delete |

### 11.2 Dashboard (`/`)

Shows at-a-glance state. Cards stacked vertically on mobile, grid on desktop:

1. **Today's pipeline status**: last run's start/finish/status; if currently running, show progress (stage + counters).
2. **Quota usage today**: bar chart, units used / 10,000.
3. **Queue counts**: candidates pending enrichment, enriched pending qualification, qualified pending review (no email yet), drafted pending send, sent awaiting reply.
4. **Top 10 newly qualified channels**: ranked by automation score, with thumbnail, title, score, niche. Click → detail page.
5. **Recent events**: tail of `pipeline_events` for the latest run.

A prominent **"Run pipeline now"** button (POSTs to `/api/pipeline/run`) is hidden if a run is currently in progress.

### 11.3 Channels list (`/channels`)

Server-rendered table. Filters in URL search params (so links are shareable, refreshes are state-preserving):

**Filters:**
- `status`: outreach status (multi-select)
- `minScore`, `maxScore`: automation score range
- `minSubs`, `maxSubs`: subscriber range
- `niche`: free-text contains-match against `nicheClassification`
- `format`: free-text contains-match against `formatType`
- `language`: pitch language
- `search`: free-text against title + handle + description

**Sort:**
- `latestAutomationScore` desc (default)
- `subscriberCount` desc
- `lastQualifiedAt` desc
- `discoveredAt` desc

**Columns:**
- Thumbnail
- Title + handle
- Subscribers (formatted: 124K, 1.2M)
- Niche
- Format
- **Score** (with color: green ≥70, yellow 40-69, gray <40)
- Pitch lang
- Outreach status (colored badge)
- Last qualified

Each row links to detail. Pagination: 50/page.

### 11.4 Channel detail (`/channels/[id]`) — the workhorse page

Three columns on desktop, stacked on mobile.

**Left column: channel info**
- Thumbnail, title, handle, channel URL (external link to YouTube)
- Subscribers, total videos, country, language, channel age
- Description (collapsible if long)
- Discovery source ("Found via keyword: notizie")
- Discovered date
- **Sample videos** — last 10 videos as a list, each with thumbnail, title, published date, duration, views, like count. Each title is a link to the YouTube video.

**Middle column: AI assessment**

The full qualification rendered in human-readable form:
- **Score badge** (large, colored)
- **Niche** + **Format** + **Confidence** + **Pitch language**
- **Rationale** (prose)
- **Suggested solution** (prose)
- **Pitch angle** (prose)
- **Automatable workflows** — each as a card with name, description, approach, time saved
- **Signals** — two columns (positive | negative), each item showing evidence; if a signal has a `videoId`, render a small clickable thumbnail next to it
- **Disqualifiers** — red banner if non-empty
- Footer: model used, qualification timestamp, "View raw JSON" link (downloads the dumped file)

A **Re-qualify** button at the bottom triggers a new LLM call (creates a new `qualifications` row, updates `latestQualificationId`).

**Right column: outreach**

State-dependent:

- If `outreachStatus = 'none'`:
  - Email input field + Save button
  - On save: stores email, sets `email_added`, automatically triggers draft generation, transitions to next state
  
- If `outreachStatus = 'email_added'`:
  - Loading spinner ("Generating draft…")
  
- If `outreachStatus = 'drafted'` (or later):
  - **Subject** (editable text input)
  - **Body** (editable textarea, ~12 rows)
  - Buttons: **Copy** (copies "Subject: …\n\n…body" to clipboard), **Regenerate**, **Mark as sent**
  - Below: a small log of all drafts ever generated for this channel (collapsed by default)
  
- If `outreachStatus = 'sent'`:
  - Shown timestamp of send
  - Buttons: **Mark as replied**, **Mark as no reply**, **Mark as ignored**
  - **Notes** textarea (free-form, auto-saved on blur)
  
- If `outreachStatus ∈ {'replied', 'no_reply', 'ignored'}`:
  - Final state, with summary
  - **Reopen** button (back to drafted state)

At the bottom of the page, a small **Delete this channel** action (with a confirmation modal) handles GDPR deletion: removes the channel and all related rows (CASCADE), then deletes the corresponding `data/raw/...` directories.

### 11.5 Runs page (`/runs`)

Table of past pipeline runs. Columns: started, duration, trigger (cron/manual), status, candidates found, qualified, rejected, quota used, LLM tokens. Each row links to `/runs/[id]` which shows the full `pipeline_events` log for that run, plus per-stage counters.

### 11.6 Settings (`/settings`)

- **Seed keywords**: list/add/edit/deactivate. Show per-keyword stats (`totalUses`, `totalCandidatesProduced`) so the operator can prune unproductive keywords.
- **Filters**: min/max subs, country, language, requalify-after-days. Stored in `settings` table.
- **Model config**: shows current `LLM_MODEL_FAST` and `LLM_MODEL_THINK` from env (read-only here; edit in `.env`).
- **Prompt versions**: shows current versions in use (read-only).
- **Manual data export**: download a CSV of all channels (for backup or external review).

### 11.7 Auth

`POST /api/auth` with `{ password }` matches against `ADMIN_PASSWORD` from `.env`. On success, sets a signed HTTP-only cookie (`session=<jwt>` or just an HMAC token). Middleware in `middleware.ts` redirects to `/login` for any other route if the cookie is missing or invalid. This is intentionally lightweight — single-user, single-machine.

### 11.8 Visual style

Minimal, dense, utilitarian. shadcn/ui defaults with a slightly muted neutral palette. The point is information density and fast scanning, not delight. Mobile is supported but desktop is the primary mode.

---

## 12. Background Worker

### 12.1 Entry point

```bash
npx tsx src/worker/run.ts [--manual]
```

`src/worker/run.ts` is responsible for:
1. Opening the DB.
2. Creating a `pipeline_runs` row with status `running`, `triggeredBy=cron|manual`.
3. Wrapping the entire pipeline in a try/catch that updates the run on success or failure.
4. Calling `runPipeline(runId)` from `src/lib/pipeline/run.ts`.
5. Closing the DB cleanly.

### 12.2 Orchestrator (`src/lib/pipeline/run.ts`)

Pseudocode:

```typescript
export async function runPipeline(runId: number) {
  await ensureQuotaHeadroom(runId);                 // throws if < 4500 units remaining today

  // Discovery
  const newCandidates = await discoverViaKeywords(runId);
  const moreCandidates = await discoverViaCategories(runId);
  const allCandidateIds = dedupe([...newCandidates, ...moreCandidates]);

  // Enrichment
  await enrichChannels(runId, allCandidateIds);

  // Pre-qualification filter (DB-only)
  await preQualificationFilter(runId);

  // Pick the top N enriched channels for video fetch + LLM
  const pick = await selectChannelsForQualification(runId, /* limit */ 50);
  await fetchRecentVideos(runId, pick);
  await preQualificationFilter(runId);              // re-run for the "inactive" rule that needs videos

  // LLM qualification
  await qualifyChannels(runId, pick.filter(stillEnriched));

  await finalizeRun(runId);
}
```

Each function:
- Logs `pipelineEvents` for major sub-steps.
- Updates run counters on `pipelineRuns`.
- Persists raw blobs.
- Handles errors per-channel without aborting the whole run (catch + log + skip).

### 12.3 Concurrency & rate limits

YouTube API has rate limits even before quota: nominally 1 request/sec per project. The googleapis library does not enforce this. We add a simple async limiter:

```typescript
import pLimit from 'p-limit';
const ytLimiter = pLimit(2);   // max 2 concurrent YT API calls
```

LLM calls (local proxy) — we throttle to a reasonable concurrency to not overload the local process:

```typescript
const llmLimiter = pLimit(3);
```

### 12.4 Scheduling on macOS via launchd

Use launchd, not cron, on macOS — it's the supported scheduler and handles wake-from-sleep more gracefully.

`scripts/install-launchd.sh` writes a plist to `~/Library/LaunchAgents/com.you.yt-creator-pipeline.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.you.yt-creator-pipeline</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>-lc</string>
        <string>cd /Users/YOU/path/to/yt-creator-pipeline && /opt/homebrew/bin/npx tsx src/worker/run.ts >> data/logs/launchd.log 2>&1</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>4</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/YOU/path/to/yt-creator-pipeline/data/logs/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOU/path/to/yt-creator-pipeline/data/logs/launchd.err.log</string>
</dict>
</plist>
```

Load with:
```bash
launchctl load ~/Library/LaunchAgents/com.you.yt-creator-pipeline.plist
```

**Caveat:** if the Mac is asleep at 4:00 AM, launchd does not wake it. Two options:
1. `pmset` schedule a wake at 03:58:
   ```bash
   sudo pmset repeat wakeorpoweron MTWRFSU 03:58:00
   ```
2. Or rely on the manual UI trigger when you next open the app — the orchestrator is idempotent (deduplication on `channels.id`, qualification skipped if `lastQualifiedAt` is within `REQUALIFY_AFTER_DAYS`).

### 12.5 Idempotency

The orchestrator is safe to re-run:
- Channels are deduplicated by primary key. Re-discovery just updates `lastFetchedAt`.
- Videos are deduplicated by primary key.
- Qualification is skipped for a channel whose `lastQualifiedAt` is more recent than `REQUALIFY_AFTER_DAYS` ago. Force re-qualification is possible from the UI (the **Re-qualify** button bypasses the check).
- Quota is tracked separately from runs, so a re-run on the same day continues spending against the same daily budget.

---

## 13. Quota & Rate Limit Management

### 13.0 Transcript fetching is outside YouTube quota

Transcripts are fetched via the `youtube-transcript` npm library, which uses YouTube's public `timedtext` endpoint. **No Data API quota is consumed.** This is the design trade-off documented in §9.6: it sidesteps the otherwise prohibitive 200-units-per-caption official cost. If you ever switch `transcripts.source` to `captions_api`, factor in 50 (list) + 200 (download) = 250 units per transcript.

### 13.1 YouTube quota tracking

Every YouTube API call is wrapped in a function that:
1. Computes the unit cost for the operation.
2. Reads today's spent units from `quotaLedger` (sum where `date = today`).
3. If `spent + cost > 9500` (500-unit safety buffer), throws `QuotaExhausted`.
4. Performs the API call.
5. Inserts a `quotaLedger` row with the operation and units.

The quota date is computed in **Pacific Time** (YouTube's reset zone), with a 30-min buffer. A small utility in `src/lib/youtube/quota.ts` handles this.

### 13.2 LLM rate limits

If the local proxy rejects calls with 429 or proxy-busy errors, we retry with exponential backoff (1s, 2s, 4s, 8s, max 4 retries). After exhaustion, mark the channel as `rejected_post_qual`, reason `llm_unavailable`, and continue.

### 13.3 Run abort

If `QuotaExhausted` is raised mid-run:
- Current stage finishes the in-flight item.
- The run is marked `cancelled` (not `failed`) with an informational message.
- Channels that made it through are kept in their current state; the next run picks up where this one left off.

---

## 14. Configuration

### 14.1 `.env.example`

```bash
# ─── YouTube Data API v3 ─────────────────────────────────────────────────
# Get a key from console.cloud.google.com → enable YouTube Data API v3 → create API key
YOUTUBE_API_KEY=

# ─── LLM (OpenAI-compatible local proxy) ──────────────────────────────────
LLM_BASE_URL=http://localhost:3456/v1
LLM_API_KEY=not-needed
# "Think" model: used for the per-channel qualification (high-value call)
LLM_MODEL_THINK=claude-opus-4
# "Fast" model: used for outreach draft generation
LLM_MODEL_FAST=claude-haiku-4-5

# ─── Pipeline configuration ──────────────────────────────────────────────
PIPELINE_TRIGGER_HOUR=4
PIPELINE_TRIGGER_MINUTE=0
PIPELINE_MIN_SUBSCRIBERS=80000
PIPELINE_MAX_SUBSCRIBERS=1000000
PIPELINE_TARGET_COUNTRY=IT
PIPELINE_TARGET_LANGUAGE=it
PIPELINE_KEYWORDS_PER_RUN=30
PIPELINE_TARGET_QUALIFIED_PER_RUN=50
PIPELINE_INACTIVE_DAYS=60
PIPELINE_REQUALIFY_AFTER_DAYS=90
PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT=10000
PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER=500

# ─── Storage ──────────────────────────────────────────────────────────────
DATA_DIR=./data

# ─── UI auth ──────────────────────────────────────────────────────────────
ADMIN_PASSWORD=
SESSION_SECRET=                  # 32+ random chars, used to sign auth cookies

# ─── Logging ──────────────────────────────────────────────────────────────
LOG_LEVEL=info                   # debug | info | warn | error
```

### 14.2 Typed env access

`src/lib/env.ts` validates all env vars at startup using zod and exports a typed `env` object. Missing required vars cause a clear startup error.

---

## 15. Compliance & Operations

### 15.1 GDPR posture

The system processes public channel data and a manually-entered email address per channel. The lawful basis for the email outreach is **legitimate interest** under GDPR Art. 6(1)(f), provided each outreach:
- Identifies the sender clearly.
- States how the recipient's contact was obtained ("from your public channel description").
- Provides an opt-out (a single sentence: "Reply 'unsubscribe' and I won't contact you again").
- Doesn't continue after an opt-out.

The system supports compliance by:
- Logging when each email was added, sent, and any status updates.
- Providing the `DELETE /api/channels/[id]/delete` endpoint that removes the channel and **all** related rows + raw blobs.
- Keeping an `outreachNotes` field where the operator can record an opt-out request.

A `data/processing_register.md` template is included in the repo for documenting the data processing activities (helpful if anyone ever asks).

### 15.2 Backups

`data/pipeline.db` and `data/raw/` together are the full state. Recommended backup: a Time Machine drive or rsync to an external disk weekly. Optionally compress monthly snapshots of `data/raw/` (it grows linearly with channels processed).

### 15.3 Observability

- Structured logs via `pino` to `data/logs/worker-YYYY-MM-DD.log`.
- `pipeline_events` table is the in-app audit trail (visible in `/runs/[id]`).
- A simple `SELECT date, SUM(units)` query gives quota usage over time for trend monitoring.

---

## 16. Build Plan

Five phases, each independently testable. Numbers are rough effort estimates assuming AI-assisted development.

### Phase 1 — Foundations (1-2 days)
- `package.json`, TypeScript config, Next.js project init.
- Drizzle schema, migrations, `npm run db:init`.
- `src/lib/env.ts` with zod validation.
- `src/lib/storage/raw.ts` for filesystem dumps.
- `src/lib/db/client.ts`, basic CRUD queries.
- Single password auth + login page.

**Done when:** `npm run dev` starts, login works, an empty `/channels` page renders.

### Phase 2 — Discovery (2-3 days)
- `src/lib/youtube/client.ts` with googleapis init.
- `src/lib/youtube/quota.ts` quota tracker.
- `src/lib/youtube/search.ts` — keyword sweep.
- Category exploration via `videos.list?chart=mostPopular`.
- `src/lib/youtube/channels.ts` — batch enrichment.
- `src/lib/pipeline/discovery.ts` orchestrating the above.
- Seed the `seed_keywords` table from appendix B.
- Channels list page (`/channels`) renders real data, filterable.

**Done when:** running `npx tsx src/worker/run.ts` with only Phase 1+2 produces ~100-200 enriched candidates in the DB, all raw blobs on disk, list page shows them.

### Phase 3 — Pre-qualification + video fetch (1 day)
- Pre-qualification filter (sub count, country, language, video count).
- `src/lib/youtube/videos.ts` — uploads playlist + video details.
- Inactive-channel rejection.
- Per-channel video list visible on `/channels/[id]`.

**Done when:** the surviving ~50 channels have 10-20 recent videos each in the DB, visible in the UI.

### Phase 4 — Agentic qualification (3-4 days)
- `src/lib/llm/client.ts` OpenAI SDK wired to local proxy.
- `src/lib/llm/schemas.ts` zod schemas for **both** step-1 and step-3 outputs.
- `src/lib/llm/select.ts` step 1: video selection prompt + call + validate.
- `src/lib/transcripts/fetcher.ts` step 2: `youtube-transcript` wrapper, language fallback, persistence.
- `src/lib/llm/qualify.ts` step 3: final qualification with transcripts.
- `src/lib/pipeline/qualification.ts` orchestrator chaining the three steps per channel.
- Channel detail page renders the full AI assessment AND the new "Why these videos" panel with the 20-row classification table and transcript modals.
- Dashboard shows queues.

**Done when:** all enriched channels become qualified via the two-step agent, the UI shows rich assessments with the agent's video classifications and accessible transcripts, all raw LLM blobs and transcripts are on disk.

### Phase 5 — Outreach + polish (2 days)
- Manual email input form.
- Draft generation server action (`src/lib/llm/draft.ts`).
- Editable subject/body, copy, regenerate, mark-as-sent flow.
- Status update endpoints.
- Run history page.
- Settings page (keywords, filters).
- GDPR delete endpoint.
- launchd plist + install script.

**Done when:** full end-to-end loop works: nightly run → review qualified channels → enter email → review draft → copy & send → update status.

### Total: ~8-11 days of focused work for a single dev with AI assistance.

---

## 17. Future Considerations

These are explicitly out of scope for v1 but worth keeping in mind so the architecture doesn't preclude them.

- **Vercel + Turso migration**: The UI (Next.js) can move to Vercel; the DB can move to Turso (libSQL — SQLite-compatible). The worker still runs on the Mac or moves to a small VPS (because it needs long-running jobs). All it takes is swapping the `better-sqlite3` connection string for a libsql HTTP one.
- **Switch transcript source to official `captions` API**: if you obtain a YouTube Data API quota increase, set `transcripts.source = 'captions_api'` and route through the official endpoint. The `transcripts` table is shaped to make this a one-file change.
- **True tool-calling agent**: replace the deterministic two-step flow with an LLM loop that has `fetch_transcript(videoId)` (and possibly `fetch_more_videos(channelId, n)`) as tools and decides dynamically what to examine. Worth it if the two-step approach feels too rigid in practice; rejected for v1 because of cost predictability.
- **Reply tracking via IMAP**: When outreach volume rises, automated reply tracking (`Got reply: yes/no`) saves manual work. Add an IMAP listener that matches incoming mail against `channels.email`.
- **A/B prompt tracking**: `qualifications.promptVersion` already supports this. Add a UI to compare scores across versions.
- **Multi-country**: Add `country` to the settings table, parameterize the discovery search calls. The schema already supports it.
- **Multi-user**: Replace the password gate with a real auth provider (Clerk, Auth.js). Add a `users` table and a `userId` FK on `channels`.
- **Cost dashboarding**: When/if LLM moves off the local proxy, the `qualifications.inputTokens` and `qualifications.outputTokens` columns let you compute cost-per-channel.

---

## Appendix A — Sample qualification output (illustrative)

```json
{
  "nicheClassification": "Italian daily current-affairs commentary and news analysis",
  "formatType": "talking_head_commentary",
  "automationPotentialScore": 82,
  "automatableWorkflows": [
    {
      "name": "morning_news_research_brief",
      "description": "Creator appears to publish a ~12-minute commentary video every weekday around 8am Italian time, requiring overnight research across Italian and international news sources.",
      "automationApproach": "Build an AI agent that runs at 6am, ingests RSS feeds from ANSA, Corriere, Repubblica, Reuters, FT, BBC, and 4-5 sector-specific sources; produces a structured brief with 8-12 ranked stories, key quotes, factual claims with source links, and 3 suggested angles for commentary, formatted to the creator's existing scripting structure (intro hook + 3 sub-topics + closer).",
      "estimatedTimeSavedPerVideoMinutes": 90
    },
    {
      "name": "title_thumbnail_variants_generator",
      "description": "Titles follow a consistent 'Topic: provocative_statement' pattern; thumbnails feature creator's face + headline overlay.",
      "automationApproach": "AI generates 8 title variants per topic optimized for CTR while staying on-brand; generates 4 thumbnail overlay text variants. Operator picks one.",
      "estimatedTimeSavedPerVideoMinutes": 15
    },
    {
      "name": "description_seo_pack",
      "description": "Video descriptions show inconsistent length and SEO structure across recent uploads.",
      "automationApproach": "Generate a 500-word description with embedded keyword targets, timestamps for chapters, source citations, and standard channel CTAs.",
      "estimatedTimeSavedPerVideoMinutes": 10
    }
  ],
  "suggestedSolution": "A single 'morning-brief' agent invoked manually at 6am that produces a Markdown research brief + a structured scripting outline tailored to this creator's voice. Plus a small Notion-style web page where the creator opens the day's brief and clicks 'generate title variants' / 'generate description' once they've finalized their angle. The brief agent uses Italian-language sources by default and falls back to English for international stories.",
  "pitchAngle": "Lead with the daily research workload. Reference the consistency of their 8am Mon-Fri uploads as proof of disciplined production. Frame the offering as 'I'll cut your morning research from 2 hours to 15 minutes, free pilot for a week'. Avoid generic AI buzzwords.",
  "pitchLanguage": "it",
  "signals": [
    { "type": "positive", "evidence": "5 of last 5 weekday videos uploaded between 7:30-8:30 Italian time, indicating disciplined morning production pipeline", "videoId": null },
    { "type": "positive", "evidence": "Video titled 'Il vero motivo per cui...' shows consistent provocative-statement format across recent uploads", "videoId": "abc123XYZ_" },
    { "type": "positive", "evidence": "Description of latest video lists 7 distinct source citations, suggesting heavy research workload", "videoId": "def456ABC_" },
    { "type": "positive", "evidence": "No co-host or guest voices detected across last 20 videos, suggesting single-operator production", "videoId": null },
    { "type": "negative", "evidence": "Channel description references a small team ('il nostro team') — production might be less single-operator than visible content suggests", "videoId": null }
  ],
  "disqualifiers": [],
  "confidence": 0.78,
  "rationale": "Strong fit on three axes confirmed by transcripts: (1) high-cadence weekday production indicates a workflow under time pressure, (2) the three sampled format-anchor transcripts share an identical 30-second cold-open structure and a recurring 'tre cose da sapere oggi' segment, confirming an automatable scripting template, (3) heavy research evidence in both descriptions and transcripts (named sources cited verbatim) suggests significant pre-production time to displace. The main uncertainty is whether the team-reference in the channel description means a researcher already exists, which would reduce willingness to pay. The pitch should test this directly. Score 82 reflects high upside with moderate uncertainty about the buying decision."
}
```

---

## Appendix B — Initial seed keywords (Italian)

To be inserted into `seed_keywords` by `scripts/seed-keywords.ts`. Mix of broad topical terms, content-format terms, and niche terms. The system rotates through these, picking the oldest-used N per day.

```
News & current affairs:
  notizie, rassegna stampa, attualità, politica italiana, geopolitica, cronaca,
  approfondimento, analisi politica, esteri, economia italiana

Finance & business:
  finanza personale, investimenti, criptovalute, borsa, mercati finanziari,
  imprenditoria, business, marketing digitale, partita iva, freelance

Tech & science:
  tecnologia, intelligenza artificiale, programmazione, recensione tech,
  smartphone, scienza, divulgazione scientifica, fisica, astronomia

Lifestyle & culture:
  cucina italiana, ricette, viaggio, lifestyle, fitness, palestra,
  psicologia, crescita personale, libri recensione, cinema recensione

Entertainment:
  podcast italiano, intervista, gameplay italiano, vlog quotidiano,
  comicità, satira, reazione, commentary italiano

Education & how-to:
  tutorial italiano, corso online, lezione, spiegazione, come fare,
  guida, didattica, formazione

Specialty:
  auto recensione, moto, calcio analisi, storia italiana, true crime italia,
  motivazione, salute, alimentazione, sport estremi
```

Approximately 70 keywords. Add/remove via the Settings UI as you learn which produce useful candidates.

---

## Appendix C — YouTube video category IDs (in scope vs excluded)

| ID | Category | Use? |
|---|---|---|
| 1 | Film & Animation | exclude (mostly licensed/clip content) |
| 2 | Autos & Vehicles | **include** |
| 10 | Music | **exclude** (per default filters) |
| 15 | Pets & Animals | exclude (often kid-targeted) |
| 17 | Sports | **include** |
| 19 | Travel & Events | **include** |
| 20 | Gaming | **include** |
| 22 | People & Blogs | **include** |
| 23 | Comedy | **include** |
| 24 | Entertainment | **include** |
| 25 | News & Politics | **include** |
| 26 | Howto & Style | **include** |
| 27 | Education | **include** |
| 28 | Science & Technology | **include** |
| 29 | Nonprofits & Activism | exclude (volume too low) |

So 11 categories in scope. The included set is hardcoded in `src/lib/seeds/categories.ts` but listed here for clarity.

---

## Appendix D — Quick-start commands

```bash
# Initial setup
git init
npm init -y
# (install dependencies — see package.json template in the repo)
cp .env.example .env
# Edit .env with your YOUTUBE_API_KEY, ADMIN_PASSWORD, SESSION_SECRET, and LLM_* vars
npm run db:init
npm run seed:keywords

# Start the UI in development
npm run dev
# Visit http://localhost:3000, log in

# Run the pipeline manually
npx tsx src/worker/run.ts

# Install nightly launchd schedule
bash scripts/install-launchd.sh

# Inspect quota usage today
sqlite3 data/pipeline.db "SELECT date, operation, SUM(units) FROM quota_ledger WHERE date = date('now') GROUP BY operation;"

# Tail the worker log
tail -f data/logs/launchd.log
```

---

## Appendix E — Open questions resolved in this version

For traceability, these are the design decisions confirmed in the requirements pass:

| # | Question | Decision |
|---|---|---|
| 1 | Who builds | Operator + AI assistant — doc written as implementation spec |
| 2 | Stack | Node.js + TypeScript + Next.js (operator's preferred ecosystem) |
| 3 | Host | Mac, with optional later move to Vercel UI + Mac/VPS worker |
| 4 | Budget | Effectively zero — Mac + free YouTube tier + LLM via local proxy on existing Claude subscription |
| 5 | Volume | ~150 candidates/day, ~50 qualified/day |
| 6 | Schedule | Nightly batch (launchd at 4am), plus manual UI trigger |
| 7 | Geo | Italy only |
| 8 | Min subs | 80,000 |
| 9 | Max subs | 1,000,000 |
| 10 | Excluded categories | Music, Pets & Animals (kid-safety); Film & Animation, Nonprofits also excluded |
| 11 | Discovery | A (keyword sweep, 30 keywords/day from a pool of ~70) + C (10 categories) |
| 12 | LLM client | OpenAI SDK against local proxy; two models (think, fast) in `.env` |
| 13 | Qualification output | All requested fields, rich, JSON-validated |
| 13b | Qualification flow | **Agentic two-step**: LLM selects representative videos → fetch transcripts → LLM produces final assessment with transcript evidence |
| 13c | Transcript source | `youtube-transcript` library (public timedtext endpoint, free); official `captions` API kept as future option in `transcripts.source` column |
| 14 | Outreach language | Decided per-channel by the LLM (`pitchLanguage`) |
| 15 | Draft generation | Automatic on email save |
| 16 | Post-send tracking | Manual statuses (no inbox integration) |
| 17 | UI | Next.js (SPA) per operator preference |
| 18 | Auth | Single-user with password gate |
| 19 | Re-qualification | Default 90 days, overridable from UI |
| 20 | GDPR | Deletion endpoint + processing register + opt-out support in outreach |
| 21 | Raw data persistence | All YouTube + LLM blobs dumped to `data/raw/` in structured tree |

---

*End of design document.*
