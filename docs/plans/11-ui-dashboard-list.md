# Plan: UI — Dashboard & Channels List

**Branch:** `feat/11-ui-dashboard-list`
**Wave:** 4
**Depends on:** 02, 10
**Estimated effort:** 2 days

## Overview

Build the two top-level pages of the operator UI: the dashboard at `/` and the channels list at `/channels`. The dashboard shows at-a-glance pipeline state (last run, current queues, quota usage, top recent qualifications) and exposes the "Avvia pipeline ora" button. The channels list is the operator's primary discovery surface — a server-rendered, filterable, sortable table of every channel ever processed, with URL-state filters (per spec §11.3). All copy and labels are in Italian.

## Context

Per spec §11.1 the UI is a single Next.js 15 App Router app with shadcn/ui components. Pages are React Server Components by default; mutations use server actions. Filters live in URL search params so refreshes preserve state and links are shareable. Data is read directly from SQLite via the typed query helpers from plan 02; no separate API layer is needed except for the dashboard polling endpoint (plan 10's `/api/pipeline/status`) and the manual-trigger endpoint. UI language is Italian throughout; identifiers, comments, and route names remain English per project policy.

## Validation Commands

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test src/components`
- `pnpm test:e2e e2e/dashboard.spec.ts e2e/channels-list.spec.ts`

### Task 1: Page-level data loaders

- [x] Extend `src/lib/db/queries.ts` from plan 02 with:

```typescript
export type ListChannelsFilters = {
  outreachStatus?: OutreachStatus[];
  minScore?: number;
  maxScore?: number;
  minSubs?: number;
  maxSubs?: number;
  nicheContains?: string;
  formatContains?: string;
  pitchLanguage?: 'it' | 'en';
  search?: string; // matches title / handle / description
  sort?: 'score_desc' | 'subs_desc' | 'qualified_at_desc' | 'discovered_at_desc';
  page?: number; // 1-indexed
  pageSize?: number; // default 50
};

export async function listChannelsForUi(filters: ListChannelsFilters): Promise<{
  rows: Array<Channel & { latestQualification: Qualification | null }>;
  totalCount: number;
  page: number;
  pageSize: number;
}>;

export async function dashboardSnapshot(): Promise<{
  latestRun: PipelineRun | null;
  queues: Record<DiscoveryStatus | OutreachStatus, number>;
  topRecent: Array<{
    channelId: string;
    title: string;
    handle: string | null;
    thumbnailUrl: string | null;
    score: number;
    nicheClassification: string;
  }>;
  quota: ReturnType<typeof quotaSummary>;
}>;
```

- [x] All filters compose into a single SQL query; the SQL builds use Drizzle's typed query API
- [x] Mark completed

### Task 2: Italian copy module

- [x] Create `src/lib/ui/copy.ts` with all Italian labels used across plans 11–13, grouped by page:

```typescript
export const copy = {
  nav: {
    dashboard: 'Dashboard',
    channels: 'Canali',
    runs: 'Run',
    settings: 'Impostazioni',
    logout: 'Esci',
  },
  dashboard: {
    title: 'Dashboard',
    runNow: 'Avvia pipeline ora',
    runInProgress: 'Pipeline in corso…',
    runCooldown: 'Pipeline non avviata oggi',
    quotaToday: 'Quota YouTube oggi',
    unitsUsed: (n: number, cap: number) =>
      `${n.toLocaleString('it-IT')} / ${cap.toLocaleString('it-IT')} unità`,
    queueCandidates: 'Nuovi candidati',
    queueEnriched: 'In attesa di qualifica',
    queueQualifiedNoEmail: 'Qualificati senza email',
    queueDrafted: 'Bozze in attesa di invio',
    queueSentNoReply: 'Inviati senza risposta',
    topRecent: 'Ultimi canali qualificati',
    noData: 'Nessun dato ancora — avvia la pipeline per cominciare.',
  },
  channels: {
    title: 'Canali',
    columnThumbnail: '',
    columnTitle: 'Titolo',
    columnSubscribers: 'Iscritti',
    columnNiche: 'Nicchia',
    columnFormat: 'Format',
    columnScore: 'Score',
    columnPitchLanguage: 'Lingua pitch',
    columnOutreachStatus: 'Outreach',
    columnLastQualified: 'Ultima qualifica',
    filtersTitle: 'Filtri',
    filterOutreachStatus: 'Stato outreach',
    filterMinScore: 'Score minimo',
    filterMaxScore: 'Score massimo',
    filterMinSubs: 'Iscritti minimi',
    filterMaxSubs: 'Iscritti massimi',
    filterNiche: 'Nicchia contiene',
    filterFormat: 'Format contiene',
    filterPitchLanguage: 'Lingua pitch',
    search: 'Cerca per titolo, handle o descrizione',
    sortScoreDesc: 'Score ↓',
    sortSubsDesc: 'Iscritti ↓',
    sortQualifiedDesc: 'Qualifica più recente',
    sortDiscoveredDesc: 'Scoperta più recente',
    paginationNext: 'Successivi',
    paginationPrev: 'Precedenti',
    pageOf: (page: number, total: number) => `Pagina ${page} di ${total}`,
    noResults: 'Nessun canale corrisponde ai filtri.',
  },
  outreachStatus: {
    none: 'Da rivedere',
    email_added: 'Email aggiunta',
    drafted: 'Bozza pronta',
    sent: 'Inviata',
    replied: 'Risposta ricevuta',
    no_reply: 'Nessuna risposta',
    ignored: 'Ignorato',
  },
};
```

- [x] Used as `copy.dashboard.runNow` throughout templates — single source of truth, easy to audit
- [x] Mark completed

### Task 3: Top navigation refinement

- [x] Update the layout from plan 01 (`src/app/(app)/layout.tsx`):
  - replace placeholder labels with `copy.nav.*`
  - active-link styling (subtle bottom border on the current section)
  - on the right side: a compact quota indicator (e.g. "YT: 2.3k/10k") linking to the dashboard
- [x] Mark completed

### Task 4: Dashboard page

- [x] Replace `src/app/(app)/page.tsx` content. Three rows:

  **Row 1 — Pipeline status**
  - card with current state: "Pipeline in corso (run #N, fase: qualifica, 14/50 canali processati)" OR "Ultimo run #N completato 4h fa" OR `copy.dashboard.runCooldown`
  - on the right of the card, `<Button>` "Avvia pipeline ora" → POSTs to `/api/pipeline/run`; disabled while a run is active; on 409 response shows a toast
  - if a run is active, this card polls `/api/pipeline/status` every 3s and re-renders progress (client component)

  **Row 2 — Three small cards side by side**
  - Quota YouTube oggi: progress bar `unitsUsed / 10k`, `unitsUsed`-by-operation breakdown in a tooltip
  - Queues card: list of 5 queue counts (`copy.dashboard.queue*`), each clicking through to a pre-filtered `/channels` URL
  - LLM today: total calls + total tokens (sum from `pipeline_runs` rows for today)

  **Row 3 — Top recent qualifications**
  - 10 cards in a responsive grid: thumbnail, title, handle, score badge, niche
  - clicking a card → `/channels/[channelId]`

- [x] Component decomposition:
  - `<DashboardLayout>` server component fetching `dashboardSnapshot`
  - `<RunStatusCard>` client component for polling
  - `<QuotaCard>`, `<QueuesCard>`, `<LlmCard>` server components
  - `<TopRecentGrid>` server component
- [x] Mark completed

### Task 5: Channels list page

- [x] Create `src/app/(app)/channels/page.tsx`:
  - reads `searchParams` from the page props (App Router supports this in server components)
  - parses params into `ListChannelsFilters` (Zod schema for safety; unknown values → defaults)
  - calls `listChannelsForUi(filters)`
  - renders a `<FiltersBar>` client component (writes back to URL via `useRouter().replace`) and a `<ChannelsTable>` server component

- [x] Filters live in URL params — exhaustive list per spec §11.3:
  - `status` (multi, comma-separated)
  - `minScore`, `maxScore`
  - `minSubs`, `maxSubs`
  - `niche` (contains)
  - `format` (contains)
  - `lang` (`it` | `en`)
  - `q` (free text → title/handle/description)
  - `sort` (one of the four enum values)
  - `page` (1-indexed)

- [x] Default sort: `score_desc`
- [x] Page size: 50; pagination footer with prev/next + "Pagina X di Y"
- [x] Empty state: `copy.channels.noResults` + a "Reset filtri" link clearing all params
- [x] Mark completed

### Task 6: Channels table

- [x] Create `src/components/channels/channels-table.tsx`:
  - shadcn `<Table>` with `<TableHeader>`/`<TableBody>`
  - columns from `copy.channels.column*`
  - Score column: a small numeric badge with color from a helper `scoreColor(score)`:
    - `>=70` → green
    - `40..69` → yellow
    - `<40` → gray
  - Subscribers formatted with `formatCompact(n)` → `12.4K`, `1.2M` (Italian locale via `Intl.NumberFormat('it-IT', { notation: 'compact' })`)
  - Outreach status: small badge using `copy.outreachStatus[status]`
  - Last qualified: relative-time via `Intl.RelativeTimeFormat` with Italian locale (e.g. "3 ore fa")
  - Each row is a `<Link>` to `/channels/[channelId]`
- [x] Mark completed

### Task 7: Filters bar component

- [x] Create `src/components/channels/filters-bar.tsx`:
  - client component
  - `<Input>` for `search`, debounced 300ms
  - `<Select>` for `outreachStatus` (multi-select via shadcn `<DropdownMenuCheckboxItem>`)
  - two `<Input type="number">` pairs for score and subscribers ranges (with `placeholder` showing defaults)
  - `<Input>` for `niche` (contains) and `format` (contains)
  - `<Select>` for `lang` (`it` / `en` / "tutte")
  - `<Select>` for `sort`
  - "Cancella filtri" link
  - All changes synced into `URLSearchParams` via `useRouter().replace(\`/channels?\${qs}\`)`; preserves `page` only when other filters don't change
- [x] Mark completed

### Task 8: Helpers

- [x] Create `src/lib/ui/format.ts`:

```typescript
export function formatCompact(n: number, locale = 'it-IT'): string;
export function formatNumber(n: number, locale = 'it-IT'): string;
export function formatDate(d: Date | number, locale = 'it-IT'): string; // 20 mag 2026
export function formatRelative(d: Date | number, locale = 'it-IT'): string; // 3 ore fa
export function scoreColor(score: number | null): 'green' | 'yellow' | 'gray';
```

- [x] Use `Intl.RelativeTimeFormat` for `formatRelative` (equivalent to dayjs/relativeTime, no extra dependency since dayjs is not installed)
- [x] Mark completed

### Task 9: E2E tests

- [ ] Create `e2e/dashboard.spec.ts`:
  - seed DB with a recent run + queue counts (use a test helper that inserts directly)
  - log in (reuse helper from plan 01's auth tests)
  - assert dashboard renders: latest run info, queue counts, top recent grid with at least 1 card
  - click "Avvia pipeline ora" → assert button becomes disabled and a toast "Pipeline avviata" appears
- [ ] Create `e2e/channels-list.spec.ts`:
  - seed 60 channels at varying scores and statuses
  - go to `/channels`, assert 50 visible, pagination shows "Pagina 1 di 2"
  - filter by `minScore=70` → assert only high-scoring rows
  - filter by `outreachStatus=email_added` → assert only those
  - search for a title fragment → assert one matching row
  - URL preserves filters across reload
- [ ] Mark completed

### Task 10: Definition of Done

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] All E2E tests pass
- [ ] Dashboard renders in <500ms on a DB with 10,000 channels (manual benchmark)
- [ ] Channels list with all filters applied still renders <800ms on the same DB
- [ ] All visible strings are Italian (`copy.*`); no hardcoded English in templates
- [ ] Mark completed
