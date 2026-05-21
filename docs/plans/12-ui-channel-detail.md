# Plan: UI — Channel Detail (assessment + agent reasoning + outreach)

**Branch:** `feat/12-ui-channel-detail`
**Wave:** 4
**Depends on:** 08, 09, 11
**Estimated effort:** 3 days

## Overview

Build the workhorse page of the system: `/channels/[channelId]`. This is where the operator audits the AI's reasoning, decides whether to pursue a channel, inserts the contact email, reviews and edits the generated outreach draft, copies it for sending, and updates the post-send status. Three columns (spec §11.4): channel info + sample videos on the left, full AI assessment + the "Perché questi video" agent reasoning panel (spec §9.11) in the middle, outreach widget on the right. Italian copy throughout.

## Context

This page is the most state-rich in the app. It reads from `channels`, `videos`, `qualifications`, `video_selections`, `transcripts`, and `outreach_drafts` to render. It mutates `channels` (`email`, `outreachStatus`, `outreachNotes`, `outreachSentAt`), creates new `outreach_drafts` rows on regenerate, and can force a fresh `qualifications` row via the "Riqualifica" button. The GDPR delete action (spec §15.1) removes the channel and all related rows and raw blobs. All mutations are server actions; long-running ones (regenerate draft, re-qualify) show pending UI via React's `useTransition` / `useFormStatus`.

## Validation Commands

- `pnpm typecheck`
- `pnpm test src/components/channel-detail src/app/api/channels`
- `pnpm test:e2e e2e/channel-detail.spec.ts`

### Task 1: Data loader

- [x] Extend `src/lib/db/queries.ts`:

```typescript
export async function getChannelDetail(channelId: string): Promise<{
  channel: Channel;
  videos: Video[]; // 20 most recent, joined with classification
  qualification: Qualification | null;
  videoSelection: VideoSelection | null;
  transcriptsByVideo: Map<string, Transcript | null>;
  currentDraft: OutreachDraft | null;
  draftHistory: OutreachDraft[]; // ordered by createdAt desc
} | null>;
```

- [x] Returns `null` if the channel doesn't exist (404 in the page)
- [x] Mark completed

### Task 2: Italian copy additions

- [x] Extend `src/lib/ui/copy.ts` with a `channelDetail` group:

```typescript
channelDetail: {
  notFound: 'Canale non trovato.',
  openOnYoutube: 'Apri su YouTube',
  subscribers: 'iscritti',
  totalVideos: 'video totali',
  country: 'Paese',
  language: 'Lingua',
  channelCreated: 'Canale creato il',
  description: 'Descrizione',
  recentVideos: 'Video recenti',
  noVideos: 'Nessun video scaricato.',

  // AI assessment
  assessmentTitle: 'Valutazione AI',
  score: 'Score',
  niche: 'Nicchia',
  format: 'Format',
  pitchLanguage: 'Lingua pitch',
  confidence: 'Confidence',
  rationale: 'Razionale',
  suggestedSolution: 'Soluzione suggerita',
  pitchAngle: 'Angolo di pitch',
  automatableWorkflows: 'Workflow automatizzabili',
  timeSavedPerVideo: (m: number) => `~${m} min risparmiati per video`,
  signals: 'Segnali',
  positiveSignals: 'Positivi',
  negativeSignals: 'Negativi',
  disqualifiers: 'Squalificanti',
  noDisqualifiers: 'Nessuno',
  modelUsed: 'Modello',
  qualifiedAt: 'Qualificato il',
  rawJsonLink: 'JSON grezzo',
  requalifyButton: 'Riqualifica',
  requalifying: 'Qualifica in corso…',
  notQualified: 'Non ancora qualificato.',

  // Agent reasoning panel
  whyTheseVideosTitle: 'Perché questi video',
  formatConsistency: 'Consistenza dei format',
  selectionRationale: 'Razionale di selezione',
  classificationTable: 'Classificazione dei 20 video',
  columnClassification: 'Classificazione',
  columnRelevance: 'Rilevanza',
  columnReasoning: 'Motivazione',
  classificationLabel: {
    format_anchor: 'Anchor di format',
    representative: 'Rappresentativo',
    extemporaneous: 'Estemporaneo',
    outlier: 'Outlier',
  },
  viewTranscript: 'Vedi transcript',
  transcriptUnavailable: 'Transcript non disponibile',
  transcriptModalTitle: (videoTitle: string) => `Transcript — ${videoTitle}`,

  // Outreach widget
  outreachTitle: 'Outreach',
  emailLabel: 'Email di contatto',
  emailPlaceholder: 'esempio@dominio.it',
  emailSaveButton: 'Salva email e genera bozza',
  generatingDraft: 'Sto generando la bozza…',
  draftSubject: 'Oggetto',
  draftBody: 'Corpo',
  copyToClipboard: 'Copia (Oggetto + Corpo)',
  copied: 'Copiato!',
  regenerate: 'Rigenera bozza',
  regenerating: 'Rigenero…',
  markAsSent: 'Segna come inviata',
  sentAt: (d: string) => `Inviata il ${d}`,
  markAsReplied: 'Risposta ricevuta',
  markAsNoReply: 'Nessuna risposta',
  markAsIgnored: 'Ignorato',
  reopen: 'Riapri',
  notesLabel: 'Note',
  notesPlaceholder: 'Note interne libere…',
  draftHistory: 'Cronologia bozze',
  draftHistoryEmpty: 'Nessuna bozza precedente.',

  // GDPR
  deleteChannel: 'Elimina canale',
  deleteChannelConfirmTitle: 'Eliminare definitivamente questo canale?',
  deleteChannelConfirmBody: 'Saranno rimossi i dati del canale, le valutazioni AI, i transcript e le bozze. L\'azione è irreversibile.',
  deleteChannelConfirmAction: 'Elimina',
  deleteChannelCancel: 'Annulla',
}
```

- [x] Mark completed

### Task 3: Page shell

- [x] Create `src/app/(app)/channels/[channelId]/page.tsx`:
  - server component
  - `params.channelId`
  - calls `getChannelDetail`
  - on null → `notFound()` (Next.js helper) with localised 404 page
  - renders a three-column grid on `lg` breakpoint, stacked on smaller screens

- [x] Mark completed

### Task 4: Left column — channel info + sample videos

- [x] Create `src/components/channel-detail/channel-info.tsx`:
  - thumbnail (rounded, ~80px)
  - title, handle (linked to YouTube), country, language flag emoji
  - stat row: subscribers (compact), total videos
  - channel created date
  - description (collapsible if >300 chars, "Mostra altro" / "Mostra meno")
  - discovery source badge ("Trovato via keyword: rassegna stampa" or "Trovato in categoria: Notizie e Politica")
  - "Apri su YouTube" link

- [x] Create `src/components/channel-detail/sample-videos-list.tsx`:
  - last 10 videos
  - per row: small thumbnail (~60×34), title (linked to youtu.be/<id>), published date, duration, views (compact)
  - hover: title becomes underlined
- [x] Mark completed

### Task 5: Middle column — AI assessment

- [x] Create `src/components/channel-detail/assessment-card.tsx`:
  - large score badge top-left (colored per `scoreColor` from plan 11)
  - row: niche, format, pitch language flag, confidence percentage
  - section **Razionale** — paragraph from `qualification.rationale`
  - section **Soluzione suggerita** — paragraph
  - section **Angolo di pitch** — paragraph
  - section **Workflow automatizzabili** — vertical stack of small cards, each with name, description, automationApproach, time-saved badge
  - section **Segnali** — two columns (Positivi | Negativi); each item: evidence text; if `videoId` is set, render a clickable small video thumbnail next to it (anchors to the sample-videos list via `#video-<id>`)
  - section **Squalificanti** — if non-empty, render as a red callout banner; else show `copy.channelDetail.noDisqualifiers`
  - footer: model used, qualifiedAt (Italian relative), "JSON grezzo" link (downloads `qualification.rawResponsePath` via `GET /api/raw?path=...` — Task 11)

- [x] Re-qualify button at the bottom:
  - `<form action={requalifyAction}>` server action
  - on submit → call `forceRequalifyChannel(channelId)` (plan 08, Task 9), then `revalidatePath('/channels/[channelId]')`
  - while pending, button text becomes `copy.channelDetail.requalifying`
- [x] If `qualification` is null, render `copy.channelDetail.notQualified` and just the Riqualifica button
- [x] Mark completed

### Task 6: "Perché questi video" agent panel

- [x] Create `src/components/channel-detail/agent-reasoning-panel.tsx`:
  - section header with the brain icon and `copy.channelDetail.whyTheseVideosTitle`
  - `<blockquote>` for `videoSelection.formatConsistencySummary`
  - paragraph for `videoSelection.selectionRationale`
  - sub-header `copy.channelDetail.classificationTable`
  - table of 20 rows; columns: thumbnail (24px), video title (linked), classification badge, relevance bar (small horizontal bar 0..10), reasoning text
  - selected videos (those in `videoSelection.selectedVideoIds`) have a left-border accent (e.g. `border-l-2 border-emerald-500`) AND a "Vedi transcript" button at the end of the row
  - clicking "Vedi transcript" opens a shadcn `<Dialog>` titled per `copy.channelDetail.transcriptModalTitle` showing the transcript text in a scroll area; if the transcript row's `fetchSucceeded=false`, show `copy.channelDetail.transcriptUnavailable` + the recorded `fetchError`
- [x] Mark completed

### Task 7: Right column — outreach widget (state machine)

- [x] Create `src/components/channel-detail/outreach-widget.tsx`:
  - dispatches on `channel.outreachStatus`

  **`'none'` state**
  - `<Input type="email">` + button `copy.channelDetail.emailSaveButton`
  - server action `saveEmailAndDraft({ channelId, email })`:
    - updates `channels.email`, `channels.outreachStatus='email_added'`, `channels.emailAddedAt=now`
    - calls `generateDraftForChannel(channelId)` (plan 09)
    - on success: updates `channels.outreachStatus='drafted'`
    - revalidates path
  - while pending: spinner + `copy.channelDetail.generatingDraft`

  **`'email_added'` state (transient — drafting in progress)**
  - polling skeleton; reuse the same generating UI
  - this state should auto-progress within ~15s; if it stalls for >60s show an error + manual "Riprova" button

  **`'drafted'` state**
  - `<Input>` for subject (editable, server action `updateDraftSubject` saves on blur)
  - `<Textarea>` for body (12 rows, monospace optional, editable, saves on blur)
  - row of buttons: `Copia (Oggetto + Corpo)` (client action — uses `navigator.clipboard.writeText("Oggetto: ...\n\nbody")` and shows `copy.channelDetail.copied` toast); `Rigenera bozza` (server action regenerating draft); `Segna come inviata` (server action: status='sent', `outreachSentAt=now`)
  - draft history collapsible at the bottom: list rows showing `createdAt`, model used, "Visualizza" link opening that draft in a modal (read-only)

  **`'sent'` state**
  - banner: `copy.channelDetail.sentAt(formatDate(outreachSentAt))`
  - subject/body displayed read-only
  - buttons: `Risposta ricevuta`, `Nessuna risposta`, `Ignorato`
  - `<Textarea>` for `outreachNotes` (autosave on blur)

  **`'replied' | 'no_reply' | 'ignored'` state**
  - summary banner showing the final state
  - read-only subject/body + notes
  - `Riapri` button → server action setting `outreachStatus='drafted'`

- [x] All buttons use shadcn variants and respect a `disabled` state during transitions
- [x] Mark completed

### Task 8: Server actions

- [ ] Create `src/app/(app)/channels/[channelId]/actions.ts`:

```typescript
'use server';

export async function saveEmailAndDraft(input: { channelId: string; email: string }): Promise<void>;
export async function regenerateDraft(input: { channelId: string }): Promise<void>;
export async function updateDraftSubject(input: {
  draftId: number;
  subject: string;
}): Promise<void>;
export async function updateDraftBody(input: { draftId: number; body: string }): Promise<void>;
export async function markOutreachStatus(input: {
  channelId: string;
  status: OutreachStatus;
}): Promise<void>;
export async function updateOutreachNotes(input: {
  channelId: string;
  notes: string;
}): Promise<void>;
export async function requalifyChannel(input: { channelId: string }): Promise<void>;
export async function deleteChannel(input: { channelId: string }): Promise<void>;
```

- [ ] Each action:
  - validates input with zod
  - performs the DB mutation in a transaction
  - calls `revalidatePath` for the channel page (and `/channels`, `/` for delete)
  - logs at `info` level
  - audit-friendly: writes a `pipelineEvents` row with `stage='meta'`, `event='outreach_status_changed' | 'draft_regenerated' | 'channel_deleted' | ...`
- [ ] Email validation: trims + zod `z.string().email()`; on invalid, throw with Italian message displayed via toast in the calling form
- [ ] Mark completed

### Task 9: GDPR delete flow

- [ ] In the channel info card (left column footer), add a small destructive `<Button variant="ghost" size="sm">` with the `copy.channelDetail.deleteChannel` label
- [ ] Clicking opens a confirm `<AlertDialog>` with the localized body and a typed-name guard (operator must type the channel title to enable the delete button)
- [ ] On confirm → `deleteChannel` server action:
  - removes the `channels` row (cascades to videos, qualifications, video_selections, transcripts, outreach_drafts, pipeline_events)
  - calls `deleteTranscriptsForChannel(channelId)` (plan 06) AND `deleteRawForChannel(channelId)` (plan 03)
  - logs `pipelineEvents`: `stage='meta'`, `event='channel_deleted'`
  - `redirect('/channels')` with a success toast
- [ ] Mark completed

### Task 10: Transcript viewer modal

- [ ] Create `src/components/channel-detail/transcript-modal.tsx`:
  - props: `videoId`, `videoTitle`, `transcript: Transcript | null`
  - if `transcript` is null OR `fetchSucceeded=false`: render `copy.channelDetail.transcriptUnavailable` + the error
  - else: a max-height-80vh scroll area with the transcript text rendered as paragraphs split on every 6th sentence (rough readability)
  - footer: language tag (e.g. "🇮🇹 it"), character count, source ("via youtube-transcript")
- [ ] Mark completed

### Task 11: Raw JSON download endpoint

- [ ] Create `src/app/api/raw/route.ts`:
  - `GET /api/raw?path=<relativePath>`
  - validates the path is within `data/raw/...` (prevents traversal)
  - streams the file with `Content-Type: application/json` and `Content-Disposition: attachment`
  - 404 if missing
- [ ] Linked from the assessment card footer and (optionally) the transcript modal
- [ ] Mark completed

### Task 12: Loading and error states

- [ ] Create `src/app/(app)/channels/[channelId]/loading.tsx` with shadcn skeletons matching the 3-column layout
- [ ] Create `src/app/(app)/channels/[channelId]/error.tsx` with a friendly Italian error message and a "Torna ai canali" link
- [ ] Mark completed

### Task 13: E2E test

- [ ] Create `e2e/channel-detail.spec.ts`:
  - seed a fully qualified channel (use a test helper inserting all required rows)
  - log in, navigate to `/channels/<id>`
  - assert assessment, agent reasoning panel, sample videos render
  - click "Vedi transcript" on a selected video → modal opens with text
  - in the outreach widget, type an email and submit → wait for status `'drafted'` → assert subject + body visible
  - click `Rigenera bozza` → assert a new draft appears (different body)
  - click `Segna come inviata` → assert state transitions to `'sent'`
  - mark as `Risposta ricevuta` → assert final state
  - delete the channel via the confirm dialog → assert redirect to `/channels` and the row is gone
- [ ] Mark completed

### Task 14: Definition of Done

- [ ] `pnpm typecheck` and `pnpm lint` pass
- [ ] All E2E tests pass
- [ ] Page renders in <500ms on a channel with full data (transcripts, drafts) — manual benchmark
- [ ] Every state of the outreach widget reachable and correctly transitions
- [ ] GDPR delete leaves no rows or raw files behind (post-delete check)
- [ ] All visible strings are Italian (`copy.channelDetail.*`); no hardcoded English
- [ ] Mark completed
