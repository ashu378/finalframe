import { expect, test } from '@playwright/test';

const publicRoutes = [
  { path: '/', name: 'home' },
  { path: '/methodology', name: 'methodology' },
  { path: '/login', name: 'login' },
  { path: '/pricing', name: 'pricing' },
  { path: '/legal/privacy', name: 'legal-privacy' },
];

test.describe('FinalFrame visual smoke', () => {
  for (const route of publicRoutes) {
    test(`${route.name} has a stable responsive surface`, async ({ page }, testInfo) => {
      const providerRequests: string[] = [];
      page.on('request', (request) => {
        const hostname = new URL(request.url()).hostname;
        if (/openrouter|bachs|renderer\./i.test(hostname)) providerRequests.push(request.url());
      });
      await page.goto(route.path, { waitUntil: 'networkidle' });
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body')).not.toContainText('Application error: a client-side exception has occurred');
      await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on ${route.path}`).toBe(false);
      expect(providerRequests, `public route made a provider request: ${providerRequests.join(', ')}`).toEqual([]);

      await page.screenshot({
        path: testInfo.outputPath(`visual-${route.name}.png`),
        fullPage: true,
      });
    });
  }

  test('reduced motion keeps the static ambient fallback', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('.ff-ambient__fallback').first()).toBeVisible();
    await expect(page.locator('.ff-ambient__canvas').first()).toBeHidden();
  });

  test('WebGL-disabled browsers keep the static ambient fallback', async ({ page }) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext as unknown as (this: HTMLCanvasElement, kind: string, ...args: unknown[]) => RenderingContext | null;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
          if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
          return getContext.call(this, kind, ...args);
        },
      });
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('.ff-ambient__fallback').first()).toBeVisible();
    await expect(page.locator('.ff-ambient__canvas canvas')).toHaveCount(0);
  });
});

const testEmail = process.env.E2E_TEST_EMAIL;
const testPassword = process.env.E2E_TEST_PASSWORD;

test.describe('authenticated visual smoke (optional)', () => {
  test.skip(!testEmail || !testPassword, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to capture authenticated surfaces.');

  for (const route of [
    { path: '/dashboard', name: 'dashboard' },
    { path: '/dashboard/assets', name: 'dashboard-assets' },
    { path: '/dashboard/templates', name: 'dashboard-templates' },
    { path: '/dashboard/settings', name: 'dashboard-settings' },
  ]) {
    test(`${route.name} keeps its studio shell`, async ({ page }, testInfo) => {
      await page.goto('/login');
      await page.getByLabel('Email address').fill(testEmail!);
      await page.getByLabel('Password').fill(testPassword!);
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/\/dashboard/);
      await page.goto(route.path, { waitUntil: 'networkidle' });
      await expect(page.locator('body')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on ${route.path}`).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`visual-${route.name}.png`), fullPage: true });
    });
  }
});
