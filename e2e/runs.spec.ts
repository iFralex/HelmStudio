import { test, expect, type Page } from '@playwright/test';
import {
  openTestDb,
  insertTestRunFull,
  insertTestEvent,
  deleteTestRuns,
  type TestDb,
} from './helpers/seed';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="password"]', process.env['ADMIN_PASSWORD'] ?? 'test1234');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
}

let db: TestDb | null = null;
let completedRunId = 0;
let cancelledRunId = 0;

test.beforeAll(async () => {
  db = openTestDb();
  if (!db) return;

  completedRunId = insertTestRunFull(db, {
    status: 'completed',
    triggeredBy: 'manual',
    candidatesFound: 15,
    channelsQualified: 5,
  });

  cancelledRunId = insertTestRunFull(db, {
    status: 'cancelled',
    triggeredBy: 'cron',
    errorMessage: 'e2etest: quota esaurita durante il run',
  });

  insertTestEvent(db, completedRunId, {
    stage: 'discovery',
    event: 'keyword_sweep_done',
    level: 'info',
  });
  insertTestEvent(db, completedRunId, {
    stage: 'qualification',
    event: 'channel_qualified',
    level: 'info',
    details: { score: 78 },
  });
});

test.afterAll(() => {
  if (!db) return;
  deleteTestRuns(db, [completedRunId, cancelledRunId].filter(Boolean));
  db.close();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('runs list shows both seeded run rows', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto('/runs');

  await expect(page.getByRole('heading', { name: 'Run della pipeline' })).toBeVisible();

  await expect(page.locator(`a[href="/runs/${completedRunId}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/runs/${cancelledRunId}"]`)).toBeVisible();
});

test('runs list shows correct status badges for seeded runs', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto('/runs');

  const completedRow = page.locator('tr').filter({ hasText: String(completedRunId) });
  await expect(completedRow.getByText('Completato')).toBeVisible();

  const cancelledRow = page.locator('tr').filter({ hasText: String(cancelledRunId) });
  await expect(cancelledRow.getByText('Annullato')).toBeVisible();
});

test('completed run detail shows counters and events but no error section', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto(`/runs/${completedRunId}`);

  await expect(page.getByRole('heading', { name: `Run #${completedRunId}` })).toBeVisible();
  await expect(page.getByText('Completato')).toBeVisible();
  await expect(page.getByText('Manuale')).toBeVisible();

  await expect(page.getByText('Contatori')).toBeVisible();
  await expect(page.getByText('Candidati trovati')).toBeVisible();

  await expect(page.getByText('keyword_sweep_done')).toBeVisible();
  await expect(page.getByText('channel_qualified')).toBeVisible();

  await expect(page.locator('.border-destructive\\/30')).not.toBeVisible();
});

test('cancelled run detail shows error banner with message', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto(`/runs/${cancelledRunId}`);

  await expect(page.getByRole('heading', { name: `Run #${cancelledRunId}` })).toBeVisible();
  await expect(page.getByText('Annullato')).toBeVisible();

  await expect(page.getByText('Errore')).toBeVisible();
  await expect(page.getByText('e2etest: quota esaurita durante il run')).toBeVisible();
});

test('back link from run detail navigates to runs list', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto(`/runs/${completedRunId}`);

  await page.getByText('← Tutti i run').click();
  await expect(page).toHaveURL('/runs');
});
