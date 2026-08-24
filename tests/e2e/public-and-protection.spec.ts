import { expect, test } from '@playwright/test';

const publicRoutes = ['/', '/about', '/methodology', '/case-studies', '/pricing', '/contact', '/legal/privacy', '/legal/terms'];

test.describe('public website', () => {
  for (const route of publicRoutes) {
    test(`${route} loads without an application error`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('body')).not.toContainText('Application error: a client-side exception has occurred');
      await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
    });
  }

  test('mobile navigation opens and closes with Escape', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'This check belongs to the mobile project.');
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Open navigation menu' });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toHaveCount(0);
  });
});

test.describe('route protection', () => {
  for (const route of ['/dashboard', '/dashboard/create', '/admin', '/admin/jobs']) {
    test(`${route} redirects an unauthenticated visitor to login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login\?redirect=/);
    });
  }
});
