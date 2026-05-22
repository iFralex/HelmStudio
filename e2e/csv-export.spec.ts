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

const CSV_HEADER =
  'id,titolo,handle,iscritti,paese,lingua,videoTotali,nicchia,format,score,confidence,linguaPitch,email,statoOutreach,qualificatoIl,discoveredIl,discoverySource,urlYoutube';

let db: TestDb | null = null;
let runId = 0;

test.beforeAll(async () => {
  db = openTestDb();
  if (!db) return;
  cleanupTestChannels(db);
  runId = insertTestRun(db);

  for (let i = 1; i <= 3; i++) {
    const id = `e2etest-csv-q-${i}`;
    insertTestChannel(db, id, {
      title: `e2etest CSV Qualificato ${i}`,
      discoveryStatus: 'qualified',
      outreachStatus: 'none',
      subscriberCount: 50000,
      score: 70,
    });
    insertTestQualification(db, id, runId, 70, 'E2ETestCsvNicchia');
  }

  for (let i = 1; i <= 2; i++) {
    const id = `e2etest-csv-e-${i}`;
    insertTestChannel(db, id, {
      title: `e2etest CSV Arricchito ${i}`,
      discoveryStatus: 'enriched',
      outreachStatus: 'none',
      subscriberCount: 5000,
      score: null,
    });
  }
});

test.afterAll(() => {
  if (!db) return;
  cleanupTestChannels(db);
  db.close();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('CSV export returns 200 with correct content-type and header row', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');

  const response = await page.request.get('/api/channels/export?q=e2etest-csv-q-1');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/csv');

  const body = await response.text();
  const lines = body.split('\r\n').filter(Boolean);
  expect(lines[0]).toBe(CSV_HEADER);
});

test('CSV export contains all three seeded qualified channels', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');

  const response = await page.request.get('/api/channels/export?q=e2etest-csv-q-');
  expect(response.status()).toBe(200);

  const body = await response.text();
  const lines = body.split('\r\n').filter(Boolean);

  // Header + 3 channels = 4 lines
  expect(lines.length).toBe(4);

  for (let i = 1; i <= 3; i++) {
    expect(body).toContain(`e2etest-csv-q-${i}`);
  }
});

test('CSV export rows include YouTube URL column', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');

  const response = await page.request.get('/api/channels/export?q=e2etest-csv-q-1');
  expect(response.status()).toBe(200);

  const body = await response.text();
  expect(body).toContain('https://youtube.com/channel/e2etest-csv-q-1');
});

test('CSV export content-disposition header uses Italian filename', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');

  const response = await page.request.get('/api/channels/export?q=e2etest-csv-q-1');
  const disposition = response.headers()['content-disposition'] ?? '';
  expect(disposition).toContain('attachment');
  expect(disposition).toMatch(/canali-\d{4}-\d{2}-\d{2}\.csv/);
});
