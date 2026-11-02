import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Read-only browser verification of an existing online fixture. Authentication
// uses its existing account; no fixture records or provider jobs are created.
const email = process.env.FINALFRAME_FIXTURE_OWNER_EMAIL;
const password = process.env.FINALFRAME_FIXTURE_OWNER_PASSWORD;
const project = process.env.FINALFRAME_READONLY_PROJECT;
const production = process.env.FINALFRAME_READONLY_PRODUCTION;
if (!email || !password || !project || !production) throw new Error('Set private fixture credentials and an existing project/production selector.');
const base = process.env.FINALFRAME_BROWSER_TEST_URL || 'http://127.0.0.1:3000';
const path = `${base}/dashboard/projects/${project}/workspace/edit?production=${production}`;
const output = process.env.FINALFRAME_SCREENSHOT_DIR || '/tmp/finalframe-workspace-verification';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
let passed = 0;
async function verify(options, suffix) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`PAGE: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/login`); await page.waitForLoadState('networkidle');
    await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click(); await page.waitForURL((url) => url.pathname === '/dashboard');
    await page.goto(path); await page.getByRole('heading', { name: 'Build the first timeline', exact: true }).waitFor();
    const editor = page.getByRole('region', { name: 'Practical timeline editor', exact: true });
    await expect(editor.getByRole('button', { name: 'Select video clip', exact: true })).toHaveCount(1);
    await expect(editor.getByRole('button', { name: 'Select graphic clip', exact: true })).toHaveCount(1);
    await expect(editor.getByRole('button', { name: 'Select audio clip', exact: true })).toHaveCount(1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await expect.poll(async () => page.locator('#main-content .ff-scroll-reveal').count()).toBe(0);
    await page.screenshot({ path: `${output}/edit-readonly-${suffix}.png`, fullPage: true });
    console.log(`PASS ${suffix} existing online timeline shows video, graphic, and audio clips with no horizontal overflow`); passed++;
    await context.close();
}
try {
    await verify({ viewport: { width: 1440, height: 1000 } }, 'desktop');
    await verify({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, 'mobile');
    assert.deepEqual(errors, [], 'Browser must not report hydration, duplicate-key, or runtime errors.');
    console.log('PASS no hydration, duplicate-key, or runtime browser errors'); passed++;
    console.log(JSON.stringify({ onlineConvex: true, checks: passed, fixtureWrites: 0, paidProviderCalls: 0, rendererSubmissions: 0 }));
} catch (error) { for (const message of errors) console.error(message); throw error; } finally { await browser.close(); }
