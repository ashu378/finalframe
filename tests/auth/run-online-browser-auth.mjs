import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createAuthenticatedClient } from '../../scripts/dev-fixture/client.mjs';

// Account setup uses cloud Convex; this script never starts a database or
// submits a production plan, generation job, or render.
await createAuthenticatedClient();
const base = process.env.FINALFRAME_BROWSER_TEST_URL || 'http://127.0.0.1:3000';
const origin = new URL(base).origin;
const email = process.env.FINALFRAME_FIXTURE_OWNER_EMAIL;
const password = process.env.FINALFRAME_FIXTURE_OWNER_PASSWORD;
if (!email || !password) throw new Error('Configure the private online fixture account.');
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${origin}/dashboard`);
  await page.waitForURL((url) => url.pathname === '/login');
  assert.equal(new URL(page.url()).origin, origin, 'protected redirects must stay on the incoming origin');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard');
  await page.getByRole('heading', { name: 'What will you make today?' }).waitFor();
  const logout = page.getByRole('button', { name: 'Sign out of FinalFrame', exact: true });
  assert(await logout.isVisible());
  await logout.click();
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/login');
  assert.equal(new URL(page.url()).origin, origin);
  await page.goto(`${origin}/dashboard`);
  await page.waitForURL((url) => url.pathname === '/login');
  assert.equal(new URL(page.url()).origin, origin);
  console.log(JSON.stringify({ onlineConvex: true, checks: ['same-origin protected redirect', 'password login without email verification', 'authenticated dashboard', 'visible sign out', 'sign out clears access to protected dashboard'], paidProviderCalls: 0 }, null, 2));
} finally { await browser.close(); }
