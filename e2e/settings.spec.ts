import { test, expect, type Page } from '@playwright/test';
import { openTestDb, type TestDb } from './helpers/seed';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="password"]', process.env['ADMIN_PASSWORD'] ?? 'test1234');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
}

let db: TestDb | null = null;

test.beforeAll(async () => {
  db = openTestDb();
});

test.afterAll(() => {
  if (!db) return;
  db.prepare(`DELETE FROM seed_keywords WHERE keyword LIKE 'test integrazione%'`).run();
  db.close();
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('settings page renders all sections', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible();
  await expect(page.getByText('Filtri di pre-qualifica')).toBeVisible();
  await expect(page.getByText('Configurazione pipeline')).toBeVisible();
  await expect(page.getByText('Keyword di ricerca')).toBeVisible();
  await expect(page.getByText('Modelli LLM (sola lettura, da .env)')).toBeVisible();
  await expect(page.getByText('Versioni prompt (sola lettura)')).toBeVisible();
  await expect(page.getByText('Esporta dati')).toBeVisible();
});

test('updates minSubscribers filter and value persists on reload', async ({ page }) => {
  await page.goto('/settings');

  await page.locator('#minSubscribers').fill('100000');
  await page.getByRole('button', { name: 'Salva filtri' }).click();
  await expect(page.getByText('Filtri aggiornati.')).toBeVisible({ timeout: 5000 });

  await page.reload();
  await expect(page.locator('#minSubscribers')).toHaveValue('100000');

  // Reset to a small valid value so other tests are not affected
  await page.locator('#minSubscribers').fill('1000');
  await page.getByRole('button', { name: 'Salva filtri' }).click();
  await expect(page.getByText('Filtri aggiornati.')).toBeVisible({ timeout: 5000 });
});

test('adds keyword, deactivates it, then deletes it', async ({ page }) => {
  test.skip(!db, 'DB not available for seeding');
  await page.goto('/settings');

  await page.locator('input[name="keyword"]').fill('test integrazione');
  await page.getByRole('button', { name: 'Aggiungi' }).click();
  await expect(page.getByText('Keyword aggiunta.')).toBeVisible({ timeout: 5000 });

  await page.reload();
  const row = page.locator('tr').filter({ hasText: 'test integrazione' });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Disattiva' }).click();
  await expect(page.getByText('Keyword aggiornata.')).toBeVisible({ timeout: 5000 });

  await page.reload();
  const updatedRow = page.locator('tr').filter({ hasText: 'test integrazione' });
  await expect(updatedRow).toBeVisible();
  // After deactivation the row action button flips to "Attiva" (to re-activate)
  await expect(updatedRow.getByRole('button', { name: 'Attiva' })).toBeVisible();

  await updatedRow.getByRole('button', { name: 'Elimina' }).click();
  await expect(page.getByText('Eliminare definitivamente questa keyword?')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Elimina' }).click();
  await expect(page.getByText('Keyword eliminata.')).toBeVisible({ timeout: 5000 });

  await page.reload();
  await expect(page.locator('tr').filter({ hasText: 'test integrazione' })).not.toBeVisible();
});

test('read-only sections render model and prompt labels', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByText('Modello "think"')).toBeVisible();
  await expect(page.getByText('Modello "fast"')).toBeVisible();
  await expect(page.getByText('Endpoint proxy LLM')).toBeVisible();

  await expect(page.getByText('Selezione video')).toBeVisible();
  await expect(page.getByText('Qualifica finale')).toBeVisible();
  await expect(page.getByText('Bozza outreach')).toBeVisible();
});
