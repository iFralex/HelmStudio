import { test, expect } from '@playwright/test';

test('redirects to login when unauthenticated', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/login');
});

test('logs in with correct password and lands on dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="password"]', process.env['ADMIN_PASSWORD'] ?? 'test1234');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Pipeline non ancora avviata.')).toBeVisible();
});

test('rejects wrong password', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');
  await expect(page.getByText('Password errata')).toBeVisible();
  await expect(page).toHaveURL('/login');
});
