import { test, expect, type Page } from '@playwright/test';
import {
  openTestDb,
  insertTestRun,
  insertTestChannel,
  insertTestQualification,
  cleanupTestChannels,
  type TestDb,
} from './helpers/seed';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="password"]', process.env['ADMIN_PASSWORD'] ?? 'test1234');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
}

let db: TestDb | null = null;
let runId = 0;

test.beforeAll(async () => {
  db = openTestDb();
  if (!db) return;
  cleanupTestChannels(db);
  runId = insertTestRun(db);
  for (let i = 1; i <= 3; i++) {
    insertTestChannel(db, `e2etest-dash-${i}`, {
      title: `E2ETest Dashboard Channel ${i}`,
      subscriberCount: 50000 * i,
    });
    insertTestQualification(db, `e2etest-dash-${i}`, runId, 70 + i, 'E2ETestNiche');
  }
  // Also seed a candidate and enriched channel for queue counts
  insertTestChannel(db, 'e2etest-dash-cand', {
    title: 'e2etest-dash-cand',
    discoveryStatus: 'candidate',
    outreachStatus: 'none',
    score: null,
  });
  insertTestChannel(db, 'e2etest-dash-enr', {
    title: 'e2etest-dash-enr',
    discoveryStatus: 'enriched',
    outreachStatus: 'none',
    score: null,
  });
});

test.afterAll(() => {
  if (!db) return;
  cleanupTestChannels(db);
  db.close();
});

test('renders dashboard heading and pipeline status card', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Stato pipeline')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avvia pipeline ora' })).toBeVisible();
});

test('renders quota and queue cards', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Quota YouTube oggi')).toBeVisible();
  await expect(page.getByText('Code')).toBeVisible();
  await expect(page.getByText('Nuovi candidati')).toBeVisible();
  await expect(page.getByText('In attesa di qualifica')).toBeVisible();
  await expect(page.getByText('Qualificati senza email')).toBeVisible();
});

test('shows top recent qualified channels when data exists', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await login(page);
  await expect(page.getByText('Ultimi canali qualificati')).toBeVisible();
  await expect(page.getByText('E2ETest Dashboard Channel 1')).toBeVisible();
});

test('clicking Avvia pipeline ora shows Pipeline avviata toast', async ({ page }) => {
  await page.route('/api/pipeline/run', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, runId: 9999 }),
      });
    } else {
      await route.continue();
    }
  });

  await login(page);
  const button = page.getByRole('button', { name: 'Avvia pipeline ora' });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();

  await button.click();

  await expect(button).toBeDisabled();
  await expect(page.getByText('Pipeline avviata')).toBeVisible({ timeout: 5000 });
});
