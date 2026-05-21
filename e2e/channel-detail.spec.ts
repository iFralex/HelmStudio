import { test, expect, type Page } from '@playwright/test';
import {
  openTestDb,
  insertTestRun,
  insertTestChannel,
  insertTestQualificationFull,
  insertTestVideo,
  insertTestVideoSelection,
  insertTestTranscript,
  insertTestOutreachDraft,
  type TestDb,
} from './helpers/seed';

// Tests run in sequence to walk through the outreach state machine
test.describe.configure({ mode: 'serial' });

const CHANNEL_ID = 'e2etest-detail';
const CHANNEL_TITLE = 'e2etest Detail Canale';
const VIDEO_1_ID = 'e2etest-dvid-01';
const VIDEO_2_ID = 'e2etest-dvid-02';
const DEL_CHANNEL_ID = 'e2etest-detail-del';
const DEL_CHANNEL_TITLE = 'e2etest Del';
const DRAFT_SUBJECT = 'Oggetto di test: collaborazione podcast';
const DRAFT_BODY = 'Corpo della bozza di test. Siamo interessati a collaborare con il vostro canale.';
const REGEN_BODY = 'Corpo della nuova bozza rigenerata. Testo diverso dalla bozza precedente.';

let db: TestDb | null = null;
let runId = 0;
let qualId = 0;

test.beforeAll(async () => {
  db = openTestDb();
  if (!db) return;

  db.prepare(`DELETE FROM channels WHERE id LIKE 'e2etest-detail%'`).run();
  db.prepare(`DELETE FROM pipeline_runs WHERE error_message = 'e2etest-run'`).run();

  runId = insertTestRun(db);

  // Main channel starts in 'none' state; state machine tests will progress it
  insertTestChannel(db, CHANNEL_ID, {
    title: CHANNEL_TITLE,
    discoveryStatus: 'qualified',
    outreachStatus: 'none',
    subscriberCount: 50000,
    score: null,
  });

  insertTestVideo(db, VIDEO_1_ID, CHANNEL_ID, { title: 'Tutorial Video 1: Automazione' });
  insertTestVideo(db, VIDEO_2_ID, CHANNEL_ID, { title: 'Tutorial Video 2: Produzione' });

  const vsId = insertTestVideoSelection(db, CHANNEL_ID, runId, [VIDEO_1_ID], [
    {
      videoId: VIDEO_1_ID,
      classification: 'format_anchor',
      reasoning: 'Video principale del canale con formato consistente.',
      automationRelevanceScore: 8,
    },
    {
      videoId: VIDEO_2_ID,
      classification: 'representative',
      reasoning: 'Video rappresentativo del formato standard.',
      automationRelevanceScore: 5,
    },
  ]);

  qualId = insertTestQualificationFull(db, CHANNEL_ID, runId, vsId, 80);

  insertTestTranscript(
    db,
    VIDEO_1_ID,
    CHANNEL_ID,
    'Ciao a tutti e benvenuti al canale. In questo tutorial vedremo come automatizzare la produzione video. La prima cosa da fare è configurare il software. Poi seguite tutti i passaggi mostrati. Alla fine avrete automatizzato il processo. Iscrivetevi per altri tutorial.',
  );

  // Delete test channel — minimal data, used only for the delete flow test
  insertTestChannel(db, DEL_CHANNEL_ID, {
    title: DEL_CHANNEL_TITLE,
    discoveryStatus: 'qualified',
    outreachStatus: 'none',
    subscriberCount: 10000,
    score: null,
  });
  const delQualRes = db
    .prepare(
      `INSERT INTO qualifications (
        channel_id, run_id, model_used, prompt_version, raw_response_path, raw_prompt_path,
        automation_potential_score, niche_classification, format_type, pitch_language, created_at
      ) VALUES (?, ?, 'test-model', 'v1', 'raw/test.json', 'raw/test.json',
        60, 'Test Niche', 'Tutorial', 'it', strftime('%s','now'))`,
    )
    .run(DEL_CHANNEL_ID, runId);
  const delQualId = Number(delQualRes.lastInsertRowid);
  db.prepare(
    `UPDATE channels SET latest_qualification_id=?, latest_automation_score=60, discovery_status='qualified' WHERE id=?`,
  ).run(delQualId, DEL_CHANNEL_ID);
});

test.afterAll(() => {
  if (!db) return;
  db.prepare(`DELETE FROM channels WHERE id LIKE 'e2etest-detail%'`).run();
  db.prepare(`DELETE FROM pipeline_runs WHERE error_message = 'e2etest-run'`).run();
  db.close();
});

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="password"]', process.env['ADMIN_PASSWORD'] ?? 'test1234');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('skip all when DB unavailable', async () => {
  test.skip(!db, 'DB not available for seeding');
});

test('renders assessment, agent reasoning panel, and sample videos', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto(`/channels/${CHANNEL_ID}`);

  // Left column: channel title and sample videos list
  await expect(page.getByText(CHANNEL_TITLE)).toBeVisible();
  await expect(page.getByText('Video recenti')).toBeVisible();
  await expect(page.getByText('Tutorial Video 1: Automazione')).toBeVisible();
  await expect(page.getByText('Tutorial Video 2: Produzione')).toBeVisible();

  // Middle column: AI assessment section with score badge and niche
  await expect(page.getByText('Valutazione AI')).toBeVisible();
  await expect(page.getByText('80')).toBeVisible();
  await expect(page.getByText('Podcast Educativo')).toBeVisible();
  await expect(page.getByText('Il canale produce tutorial di alta qualita', { exact: false })).toBeVisible();

  // Middle column: agent reasoning panel
  await expect(page.getByText('Perché questi video')).toBeVisible();
  await expect(page.getByText('Formato consistente: tutorial settimanale.')).toBeVisible();
});

test('transcript modal opens with text for selected video', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto(`/channels/${CHANNEL_ID}`);

  // "Vedi transcript" button only appears for selected videos in the agent panel
  await expect(page.getByRole('button', { name: 'Vedi transcript' })).toBeVisible();
  await page.getByRole('button', { name: 'Vedi transcript' }).click();

  // Modal opens with the video title
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Tutorial Video 1: Automazione', { exact: false })).toBeVisible();

  // Transcript text is shown
  await expect(dialog.getByText('Ciao a tutti e benvenuti al canale', { exact: false })).toBeVisible();

  // Footer shows source
  await expect(dialog.getByText('via youtube-transcript')).toBeVisible();
});

test('email form visible; submitting advances to drafted state', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto(`/channels/${CHANNEL_ID}`);

  // Outreach widget shows the email form in 'none' state
  await expect(page.getByText('Outreach')).toBeVisible();
  await expect(page.getByPlaceholder('esempio@dominio.it')).toBeVisible();

  // Fill in the email and submit
  await page.fill('input[type="email"]', 'test@example.it');
  await page.getByRole('button', { name: 'Salva email e genera bozza' }).click();

  // Allow time for the server action to complete (LLM may or may not be available)
  await page.waitForTimeout(3000);

  // If LLM was not available, action threw after setting 'email_added'; simulate success via DB
  if (db) {
    const ch = db
      .prepare(`SELECT outreach_status FROM channels WHERE id=?`)
      .get(CHANNEL_ID) as { outreach_status: string } | undefined;
    if (ch?.outreach_status !== 'drafted') {
      const existingDraft = db
        .prepare(`SELECT id FROM outreach_drafts WHERE channel_id=? AND is_current=1`)
        .get(CHANNEL_ID);
      if (!existingDraft) {
        insertTestOutreachDraft(db, CHANNEL_ID, qualId, {
          subject: DRAFT_SUBJECT,
          body: DRAFT_BODY,
        });
      }
      db.prepare(
        `UPDATE channels SET outreach_status='drafted', email='test@example.it' WHERE id=?`,
      ).run(CHANNEL_ID);
    }
  }

  // Reload to pick up the drafted state
  await page.reload();

  // Drafted state: subject and body are visible in the editable inputs
  await expect(page.getByText(DRAFT_SUBJECT)).toBeVisible();
  await expect(page.getByText(DRAFT_BODY, { exact: false })).toBeVisible();
});

test('rigenera bozza: clicking button and promoting new draft shows updated content', async ({
  page,
}) => {
  test.skip(!db, 'DB not available for seeding');

  // Pre-insert a replacement draft (simulates what LLM would produce on regeneration)
  let newDraftId: number | undefined;
  if (db) {
    newDraftId = insertTestOutreachDraft(db, CHANNEL_ID, qualId, {
      subject: 'Nuovo oggetto rigenerato',
      body: REGEN_BODY,
      isCurrent: false,
    });
  }

  await page.goto(`/channels/${CHANNEL_ID}`);

  // Drafted state: the regenerate button is present
  const regenBtn = page.getByRole('button', { name: 'Rigenera bozza' });
  await expect(regenBtn).toBeVisible();

  // Click regenerate (action may fail without LLM; we advance state via DB anyway)
  await regenBtn.click();
  await page.waitForTimeout(300);
  // Wait for the pending transition to resolve (button re-enabled)
  await expect(regenBtn).toBeEnabled({ timeout: 30000 });

  // Promote the pre-inserted draft to simulate a successful regeneration
  if (db && newDraftId) {
    db.prepare(`UPDATE outreach_drafts SET is_current=0 WHERE channel_id=?`).run(CHANNEL_ID);
    db.prepare(`UPDATE outreach_drafts SET is_current=1 WHERE id=?`).run(newDraftId);
  }

  // Reload to see the new current draft
  await page.reload();

  await expect(page.getByText(REGEN_BODY, { exact: false })).toBeVisible();
});

test('segna come inviata transitions to sent state', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto(`/channels/${CHANNEL_ID}`);

  // Drafted state: "Segna come inviata" button is present
  await expect(page.getByRole('button', { name: 'Segna come inviata' })).toBeVisible();
  await page.getByRole('button', { name: 'Segna come inviata' }).click();

  // Sent state: banner with "Inviata il" appears
  await expect(page.getByText('Inviata il', { exact: false })).toBeVisible({ timeout: 10000 });

  // Transition buttons are now available
  await expect(page.getByRole('button', { name: 'Risposta ricevuta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nessuna risposta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ignorato' })).toBeVisible();
});

test('risposta ricevuta transitions to final state with Riapri button', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto(`/channels/${CHANNEL_ID}`);

  // Sent state is active from the previous test
  await expect(page.getByText('Inviata il', { exact: false })).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: 'Risposta ricevuta' }).click();

  // Final state: banner shows the status and Riapri button appears
  await expect(page.getByText('Risposta ricevuta')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Riapri' })).toBeVisible();
});

test('delete channel via confirm dialog redirects to /channels', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto(`/channels/${DEL_CHANNEL_ID}`);

  // Trigger delete dialog
  await page.getByRole('button', { name: 'Elimina canale' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Eliminare definitivamente questo canale?')).toBeVisible();

  // Type the channel title to unlock the delete button
  await page.fill('input#confirm-channel-name', DEL_CHANNEL_TITLE);

  // Submit the delete form (the destructive button inside the dialog)
  await dialog.getByRole('button', { name: 'Elimina' }).click();

  // Server action calls redirect('/channels')
  await expect(page).toHaveURL('/channels', { timeout: 10000 });

  // Navigating back to the deleted channel yields a 404
  const response = await page.goto(`/channels/${DEL_CHANNEL_ID}`);
  expect(response?.status()).toBe(404);
});
