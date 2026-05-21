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

  // 10 high-score channels (score=75, outreach=email_added)
  for (let i = 1; i <= 10; i++) {
    const id = `e2etest-ch-${String(i).padStart(3, '0')}`;
    insertTestChannel(db, id, {
      title: `e2etest-ch-${String(i).padStart(3, '0')}`,
      discoveryStatus: 'qualified',
      outreachStatus: 'email_added',
      subscriberCount: 100000,
      score: 75,
    });
    insertTestQualification(db, id, runId, 75, 'E2ETestHighNiche');
  }

  // 50 low-score channels (score=40, outreach=none)
  for (let i = 11; i <= 60; i++) {
    const id = `e2etest-ch-${String(i).padStart(3, '0')}`;
    insertTestChannel(db, id, {
      title: `e2etest-ch-${String(i).padStart(3, '0')}`,
      discoveryStatus: 'qualified',
      outreachStatus: 'none',
      subscriberCount: 5000,
      score: 40,
    });
    insertTestQualification(db, id, runId, 40, 'E2ETestLowNiche');
  }

  // 1 channel with unique title fragment for search test
  insertTestChannel(db, 'e2etest-ch-uniquealpha', {
    title: 'e2etest-ch-uniquealpha-special',
    discoveryStatus: 'qualified',
    outreachStatus: 'none',
    subscriberCount: 20000,
    score: 55,
  });
  insertTestQualification(db, 'e2etest-ch-uniquealpha', runId, 55, 'E2ETestUniqueNiche');
});

test.afterAll(() => {
  if (!db) return;
  cleanupTestChannels(db);
  db.close();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('skip all when DB unavailable', async () => {
  test.skip(!db, 'DB not available for seeding');
});

test('shows 50 channels on page 1 with pagination for 61 test channels', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto('/channels?q=e2etest-ch-');

  // Should show pagination text "Pagina 1 di 2"
  await expect(page.getByText('Pagina 1 di 2')).toBeVisible();

  // Should show "Successivi" button (next page exists)
  await expect(page.getByRole('button', { name: 'Successivi' })).toBeVisible();

  // Should NOT show "Precedenti" button (on page 1)
  await expect(page.getByRole('button', { name: 'Precedenti' })).not.toBeVisible();

  // Table rows should be 50 (one per channel, plus header)
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(50);
});

test('filter by minScore=70 shows only high-scoring channels', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto('/channels?q=e2etest-ch-&minScore=70');

  // 10 channels have score=75, rest have score=40
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(10);

  // No pagination (10 < 50)
  await expect(page.getByText(/Pagina \d+ di \d+/)).not.toBeVisible();
});

test('filter by outreachStatus=email_added shows only matching channels', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto('/channels?q=e2etest-ch-&status=email_added');

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(10);

  // All visible rows should show "Email aggiunta" outreach status
  const badges = page.locator('tbody tr td').filter({ hasText: 'Email aggiunta' });
  await expect(badges).toHaveCount(10);
});

test('search for title fragment shows one matching row', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto('/channels?q=uniquealpha-special');

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(1);

  await expect(page.getByText('e2etest-ch-uniquealpha-special')).toBeVisible();
});

test('URL preserves filters across reload', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto('/channels?q=e2etest-ch-&minScore=70&status=email_added');

  // Verify current filters show filtered results
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(10);

  // Reload
  await page.reload();

  // After reload, same filters should still apply
  await expect(rows).toHaveCount(10);
  expect(page.url()).toContain('minScore=70');
  expect(page.url()).toContain('status=email_added');
  expect(page.url()).toContain('q=e2etest-ch-');
});

test('empty state shows noResults message and reset link', async ({ page }) => {
  await page.goto('/channels?q=absolutely-nonexistent-xyz-123');

  await expect(page.getByText('Nessun canale corrisponde ai filtri.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset filtri' })).toBeVisible();
});
