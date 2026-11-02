import { expect, test } from '@playwright/test';

const publicRoutes = ['/', '/about', '/methodology', '/case-studies', '/pricing', '/contact', '/legal/privacy', '/legal/terms', '/legal/cookies', '/legal/gdpr'];

test.describe('public website', () => {
  for (const route of publicRoutes) {
    test(`${route} loads without an application error`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('body')).not.toContainText('Application error: a client-side exception has occurred');
      await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
    });
  }

  test('mobile navigation disclosure supports Tab and returns focus on Escape', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'This check belongs to the mobile project.');
    await page.goto('/');
    const menu = page.locator('button[aria-controls="mobile-public-navigation"]');
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    const navigation = page.getByRole('navigation', { name: 'Mobile main navigation' });
    await expect(navigation).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(navigation.getByRole('link', { name: 'How it works' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(navigation).toHaveCount(0);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
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
