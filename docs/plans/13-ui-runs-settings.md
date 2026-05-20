# Plan: UI — Runs History, Settings & CSV Export

**Branch:** `feat/13-ui-runs-settings`
**Wave:** 4
**Depends on:** 10, 11
**Estimated effort:** 1–2 days

## Overview

Final UI surface: the runs history at `/runs` and `/runs/[id]` (spec §11.5), the settings page at `/settings` (spec §11.6) — keywords CRUD, filter knobs, read-only model and prompt info — and a CSV export endpoint for the channels list. Closes the feature loop: every piece of state the operator might want to inspect or tweak is now reachable from the navigation. Italian copy throughout.

## Context

Per spec §11.5 the runs page is a table of `pipelineRuns` rows with the per-stage counters; the run-detail page additionally displays the `pipelineEvents` log for that run. Per spec §11.6 the settings page exposes the runtime-mutable knobs (keywords pool + the filters that govern pre-qualification) plus read-only views of the env-driven configuration (LLM models, prompt versions). Filters edited here are persisted via plan 03's settings service and consumed by plan 07's pre-qualification filter. The CSV export is a straightforward streamed response from the channels list query (plan 11) — no new query primitives needed.

## Validation Commands

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test src/components/runs src/components/settings src/app/api/channels`
- `pnpm test:e2e e2e/runs.spec.ts e2e/settings.spec.ts e2e/csv-export.spec.ts`

### Task 1: Italian copy additions

- [ ] Extend `src/lib/ui/copy.ts` with two new groups:

```typescript
runs: {
  title: 'Run della pipeline',
  emptyState: 'Nessun run ancora — avvia la pipeline dal cruscotto.',
  columnId: '#',
  columnStartedAt: 'Avviato',
  columnFinishedAt: 'Concluso',
  columnTriggeredBy: 'Avviato da',
  columnStatus: 'Stato',
  columnCandidates: 'Candidati',
  columnQualified: 'Qualificati',
  columnQuota: 'Quota',
  columnLlmTokens: 'Token LLM',
  triggeredByLabel: { cron: 'Programmato', manual: 'Manuale' },
  statusLabel: {
    running: 'In corso',
    completed: 'Completato',
    failed: 'Fallito',
    cancelled: 'Annullato',
  },
  durationLabel: (s: number) => `${Math.floor(s / 60)} min ${s % 60} s`,
  runDetailTitle: (id: number) => `Run #${id}`,
  backToRuns: '← Tutti i run',
  countersTitle: 'Contatori',
  counterSearches: 'Ricerche keyword',
  counterCandidates: 'Candidati trovati',
  counterEnriched: 'Canali arricchiti',
  counterPreRejected: 'Pre-scartati',
  counterQualified: 'Qualificati',
  counterPostRejected: 'Scartati dopo qualifica',
  counterQuota: 'Unità quota usate',
  counterLlmCalls: 'Chiamate LLM',
  counterLlmTokensInput: 'Token input',
  counterLlmTokensOutput: 'Token output',
  errorTitle: 'Errore',
  eventsTitle: 'Eventi',
  noEvents: 'Nessun evento registrato.',
  eventColumnTime: 'Quando',
  eventColumnStage: 'Stadio',
  eventColumnEvent: 'Evento',
  eventColumnChannel: 'Canale',
  eventColumnDetails: 'Dettagli',
},
settings: {
  title: 'Impostazioni',

  // Filtri
  filtersTitle: 'Filtri di pre-qualifica',
  filtersDescription: 'Applicati prima della valutazione AI per scartare canali fuori scope.',
  minSubscribers: 'Iscritti minimi',
  maxSubscribers: 'Iscritti massimi',
  country: 'Paese (ISO 2 lettere)',
  language: 'Lingua (ISO 2 lettere)',
  requalifyAfterDays: 'Riqualifica dopo (giorni)',
  inactiveDays: 'Soglia inattività (giorni senza upload)',
  saveFilters: 'Salva filtri',
  filtersSaved: 'Filtri aggiornati.',

  // Keywords
  keywordsTitle: 'Keyword di ricerca',
  keywordsDescription: 'Le keyword vengono ruotate ogni run: le meno usate vengono scelte per prime.',
  columnKeyword: 'Keyword',
  columnIsActive: 'Attiva',
  columnLastUsedAt: 'Ultimo uso',
  columnTotalUses: 'Usi totali',
  columnTotalCandidates: 'Candidati prodotti',
  columnNotes: 'Note',
  addKeywordTitle: 'Aggiungi keyword',
  addKeywordButton: 'Aggiungi',
  newKeywordPlaceholder: 'es. "rassegna stampa quotidiana"',
  newKeywordNotesPlaceholder: 'Note opzionali…',
  deactivate: 'Disattiva',
  activate: 'Attiva',
  deleteKeyword: 'Elimina',
  deleteKeywordConfirm: 'Eliminare definitivamente questa keyword?',
  keywordAdded: 'Keyword aggiunta.',
  keywordUpdated: 'Keyword aggiornata.',
  keywordDeleted: 'Keyword eliminata.',

  // Pipeline config
  pipelineConfigTitle: 'Configurazione pipeline',
  keywordsPerRun: 'Keyword per run',
  targetQualifiedPerRun: 'Target qualificati per run',
  savePipelineConfig: 'Salva configurazione',
  pipelineConfigSaved: 'Configurazione aggiornata.',

  // Read-only env
  modelsTitle: 'Modelli LLM (sola lettura, da .env)',
  modelThink: 'Modello "think"',
  modelFast: 'Modello "fast"',
  llmBaseUrl: 'Endpoint proxy LLM',
  promptsTitle: 'Versioni prompt (sola lettura)',
  promptSelect: 'Selezione video',
  promptQualify: 'Qualifica finale',
  promptDraft: 'Bozza outreach',

  // Export
  exportTitle: 'Esporta dati',
  exportDescription: 'Esporta tutti i canali (con i filtri applicabili) in CSV.',
  exportButton: 'Scarica CSV dei canali',
  exportRunning: 'Generazione in corso…',
},
```

- [ ] Mark completed

### Task 2: Runs list page

- [ ] Add to `src/lib/db/queries.ts`:

```typescript
export async function listRuns(opts?: { limit?: number; before?: number }): Promise<PipelineRun[]>;
// Ordered by startedAt DESC. `before` is a cursor (startedAt epoch ms) for pagination.

export async function getRunById(id: number): Promise<PipelineRun | null>;

export async function listEventsForRun(
  runId: number,
  opts?: {
    channelId?: string;
    stage?: string;
  },
): Promise<Array<PipelineEvent & { channelTitle: string | null }>>;
// LEFT JOIN channels to surface the title alongside the channelId.
```

- [ ] Create `src/app/(app)/runs/page.tsx`:
  - server component, reads `searchParams.before`
  - calls `listRuns({ limit: 50, before })`
  - renders a header with `copy.runs.title` and a table of runs
  - columns: id, startedAt (relative + absolute on hover), finishedAt or — , triggeredBy badge, status badge (color per `statusColor(status)`), candidates, qualified, quota used (compact), LLM tokens (compact, input+output)
  - each row links to `/runs/[id]`
  - footer pagination: "Carica i precedenti" linking to `?before=<earliestStartedAt>`
- [ ] Mark completed

### Task 3: Status colour helper

- [ ] Extend `src/lib/ui/format.ts`:

```typescript
export function statusColor(s: PipelineRun['status']): 'green' | 'blue' | 'red' | 'gray';
// completed → green, running → blue, failed → red, cancelled → gray
```

- [ ] Use it as a small badge component in the runs table
- [ ] Mark completed

### Task 4: Run detail page

- [ ] Create `src/app/(app)/runs/[id]/page.tsx`:
  - server component
  - `getRunById(id)` → 404 helper on null
  - layout: header with `copy.runs.runDetailTitle(id)` + "← Tutti i run" back link
  - top card: status badge, triggeredBy, startedAt, finishedAt, duration (`copy.runs.durationLabel`)
  - if `errorMessage`: red callout with the message; collapsible to show `errorStack`
  - **Contatori** grid (3×4 layout, one stat per cell using `copy.runs.counter*`)
  - **Eventi** section:
    - `<EventsTable>` server component listing all events for this run
    - columns per `copy.runs.eventColumn*`
    - filter controls (URL params): by `stage` (multi-select), by `channelId` (typeahead with channel title)
    - details column renders the JSON `details` as a small inline preformatted block (line-clamped to 2 lines, click to expand inline)
    - virtualised rendering only if rows > 200 (use `@tanstack/react-virtual` if needed; otherwise plain table)

- [ ] If the run is `'running'`, the page polls itself every 5 s via a small client island showing a "Aggiornamento automatico" indicator
- [ ] Mark completed

### Task 5: Settings page shell

- [ ] Create `src/app/(app)/settings/page.tsx`:
  - server component
  - loads: `getFilters()` and `getPipelineConfig()` (plan 03), `listKeywords()` (Task 6), env-derived values for read-only sections
  - renders a single page with **sections** separated by `<Separator />`:
    1. Filtri di pre-qualifica (form)
    2. Configurazione pipeline (form)
    3. Keyword di ricerca (table + add form)
    4. Modelli LLM (read-only)
    5. Versioni prompt (read-only)
    6. Esporta dati (CSV button)
- [ ] Each section gets its own client island for the form when needed; static read-only sections stay server-rendered
- [ ] Mark completed

### Task 6: Keywords CRUD

- [ ] Add to `src/lib/db/queries.ts`:

```typescript
export async function listKeywords(): Promise<SeedKeyword[]>;
// Ordered by isActive DESC, lastUsedAt ASC NULLS FIRST.

export async function createKeyword(input: {
  keyword: string;
  notes?: string;
}): Promise<SeedKeyword>;
export async function updateKeyword(
  id: number,
  patch: Partial<Pick<SeedKeyword, 'isActive' | 'notes'>>,
): Promise<void>;
export async function deleteKeyword(id: number): Promise<void>;
```

- [ ] Constraints: `keyword` is trimmed; duplicate (case-insensitive) → throw `KeywordAlreadyExists` mapped to a localised toast
- [ ] Create `src/components/settings/keywords-section.tsx`:
  - header + description from `copy.settings.keywords*`
  - row of inputs for "add new" at the top
  - table of all keywords with columns per `copy.settings.column*`; each row has actions: toggle active (`copy.settings.deactivate` / `activate`), edit notes (inline input on click), delete (with confirm dialog)
  - actions invoke server actions in `src/app/(app)/settings/actions.ts`
- [ ] Mark completed

### Task 7: Filters & pipeline-config forms

- [ ] Create `src/components/settings/filters-form.tsx`:
  - client form (uses `useFormState` + `useFormStatus`) bound to the `updateFilters` server action
  - inputs for each field per `copy.settings.*`
  - zod validation on the server side: `minSubscribers < maxSubscribers`, `country` 2-letter ISO, etc.
  - on success: toast `copy.settings.filtersSaved`
- [ ] Create `src/components/settings/pipeline-config-form.tsx`:
  - same pattern; bound to `updatePipelineConfig`
  - validates `keywordsPerRun` 1..70 and `targetQualifiedPerRun` 1..200
- [ ] Mark completed

### Task 8: Settings server actions

- [ ] Create `src/app/(app)/settings/actions.ts`:

```typescript
'use server';

export async function updateFiltersAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }>;
export async function updatePipelineConfigAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }>;

export async function createKeywordAction(input: {
  keyword: string;
  notes?: string;
}): Promise<void>;
export async function updateKeywordAction(input: {
  id: number;
  isActive?: boolean;
  notes?: string;
}): Promise<void>;
export async function deleteKeywordAction(input: { id: number }): Promise<void>;
```

- [ ] Each action validates with zod, performs the DB write, calls `revalidatePath('/settings')`
- [ ] All return-value typing makes the form components display localised errors
- [ ] Mark completed

### Task 9: Read-only models and prompts sections

- [ ] Create `src/components/settings/models-section.tsx`:
  - displays `env.LLM_MODEL_THINK`, `env.LLM_MODEL_FAST`, `env.LLM_BASE_URL` in a small definition list
  - a one-liner note: "Modificare nel file `.env` e riavviare il worker."
- [ ] Create `src/components/settings/prompts-section.tsx`:
  - displays the current prompt versions imported from plan 08/09's prompt modules:
    - `select.version` (e.g. `select-v1`)
    - `qualify.version` (e.g. `qualify-v2`)
    - `draft.version` (e.g. `draft-v1`)
  - a one-liner note: "I prompt sono versionati nel codice (`src/lib/llm/prompts/`)."
- [ ] Mark completed

### Task 10: CSV export endpoint

- [ ] Create `src/app/api/channels/export/route.ts`:
  - `GET /api/channels/export?...` — accepts the same filter query params as `/channels` (Task 5 of plan 11)
  - parses with the same zod schema (refactor: extract the schema into `src/lib/db/list-channels-filters.ts` so both consumers share it)
  - streams rows in chunks of 500 from `listChannelsForUi({ ...filters, pageSize: 500, page: n })` until exhausted
  - columns (header row in Italian):
    `id`, `youtubeChannelId`, `titolo`, `handle`, `iscritti`, `paese`, `lingua`, `videoTotali`, `nicchia`, `format`, `score`, `confidence`, `linguaPitch`, `email`, `statoOutreach`, `qualificatoIl`, `discoveredIl`, `discoverySource`, `urlYoutube`
  - URL column built as `https://youtube.com/channel/<youtubeChannelId>` (handle column also kept if present)
  - `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="canali-YYYY-MM-DD.csv"`
  - escapes commas, quotes, newlines per RFC 4180
- [ ] The settings page button is just an `<a href="/api/channels/export">` (no extra JS); also exposed in the channels list page as "Esporta CSV con questi filtri" that passes the current URL search params through
- [ ] Mark completed

### Task 11: E2E tests

- [ ] Create `e2e/runs.spec.ts`:
  - seed two runs (one completed, one cancelled) with synthetic events
  - log in, go to `/runs`, assert two rows with the correct status badges
  - click into the completed run → assert counters render, events table renders, error section absent
  - click into the cancelled run → assert the error banner is visible

- [ ] Create `e2e/settings.spec.ts`:
  - log in, go to `/settings`
  - update filters (set `minSubscribers=100000`) → assert success toast + value persists on reload
  - add a new keyword "test integrazione" → assert it appears in the table
  - deactivate it → assert badge flips
  - delete it (confirm dialog) → assert removed
  - the read-only sections render the env values and prompt versions

- [ ] Create `e2e/csv-export.spec.ts`:
  - seed 5 channels with varying data
  - log in, request `/api/channels/export?status=qualified` (Playwright's `request.get` with the auth cookie)
  - assert the body parses as CSV with the expected header
  - assert only qualified channels are present
- [ ] Mark completed

### Task 12: Definition of Done

- [ ] `pnpm typecheck` and `pnpm lint` pass
- [ ] All E2E tests pass
- [ ] Filters set in `/settings` are picked up by the next pipeline run (verified by running `pnpm worker:manual` after a change and observing `pipeline_events` reasons)
- [ ] Keywords CRUD persists across restarts; deactivated keywords are skipped by plan 07's `runKeywordSweep`
- [ ] CSV download opens in Excel and Numbers with correct UTF-8 (umlauts, accents render); Italian column headers present
- [ ] All visible strings are Italian (`copy.runs.*`, `copy.settings.*`); no hardcoded English
- [ ] Mark completed
