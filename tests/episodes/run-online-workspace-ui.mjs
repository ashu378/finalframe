import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../../scripts/dev-fixture/client.mjs';
import { ensureFixtureMedia } from '../../scripts/dev-fixture/fixture-media.mjs';
import { createFixturePlan } from '../../scripts/dev-fixture/fake-providers.mjs';

// All persisted records and authentication use online Convex. This script does
// not submit a paid preparation, planning, generation, or renderer request.
let authenticated;
for (let attempt = 0; ; attempt++) {
    try { authenticated = await createAuthenticatedClient(); break; } catch (error) {
        if (attempt >= 2 || !/fetch failed|timeout|network/i.test(String(error?.message || error))) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
}
const { client } = authenticated;
const query = client.query.bind(client);
client.query = async (...args) => {
    for (let attempt = 0; ; attempt++) {
        try { return await query(...args); } catch (error) {
            if (attempt >= 2 || !/fetch failed|timeout|network/i.test(String(error?.message || error))) throw error;
            await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
};
const fixtureKey = process.env.FINALFRAME_DEV_FIXTURE_KEY;
const email = process.env.FINALFRAME_FIXTURE_OWNER_EMAIL;
const password = process.env.FINALFRAME_FIXTURE_OWNER_PASSWORD;
if (!fixtureKey || !email || !password) throw new Error('Configure the private online fixture account and fixture key.');
const base = process.env.FINALFRAME_BROWSER_TEST_URL || 'http://127.0.0.1:3000';
const marker = `finalframe-workspace-ui-${randomUUID()}`;
const screenshotDir = process.env.FINALFRAME_SCREENSHOT_DIR || '/tmp/finalframe-workspace-verification';
await mkdir(screenshotDir, { recursive: true });
const project = await client.mutation(api.devFixtures.ensureProject, { fixtureKey, externalId: marker, name: marker });
const browser = await chromium.launch({ headless: true });
let passed = 0;
let currentPage;
function pass(message) { passed++; console.log(`PASS ${message}`); }
async function approve(type, id) {
    const args = { projectId: project.projectId, resourceType: type, resourceId: id };
    await client.mutation(api.approvals.submitForReview, args); await client.mutation(api.approvals.approve, args); await client.mutation(api.approvals.lock, args);
}
async function login(context) {
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error('BROWSER_PAGE_ERROR', error.message));
    page.on('console', (message) => { if (message.type() === 'error') console.error('BROWSER_CONSOLE_ERROR', message.text().slice(0, 6000)); });
    await page.goto(`${base}/login`); await page.waitForLoadState('networkidle');
    await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard');
    return page;
}
try {
    const media = await ensureFixtureMedia(); const uploads = [];
    for (const role of ['IMAGE', 'VIDEO', 'AUDIO']) {
        const file = media.files.find((entry) => entry.role === role);
        assert(file, `Fixture ${role} required.`);
        const url = await client.mutation(api.assetStorage.generateUploadUrl, { studioExternalId: project.studioExternalId, projectId: project.projectId });
        const response = await fetch(url, { method: 'POST', headers: { 'content-type': file.mimeType }, body: await readFile(file.path) }); assert(response.ok);
        const { storageId } = await response.json();
        const saved = await client.mutation(api.assetStorage.ingestAsset, { studioExternalId: project.studioExternalId, projectId: project.projectId, scope: 'PROJECT', storageId, source: 'fixture', roles: [file.role], name: file.name, mimeType: file.mimeType, checksum: file.checksum, metadata: { fixtureMarker: marker }, rights: { status: 'APPROVED', consent: true }, consent: { status: 'APPROVED' } });
        uploads.push({ ...file, assetId: saved.assetId });
    }
    const image = uploads.find((file) => file.role === 'IMAGE'), video = uploads.find((file) => file.role === 'VIDEO'), audio = uploads.find((file) => file.role === 'AUDIO');
    const resource = await client.mutation(api.continuity.createResource, { projectId: project.projectId, kind: 'CHARACTER', name: 'Fixture Ada', profile: { description: 'Blue coat character for UI verification only.' }, assetIds: [image.assetId] });
    await approve('projectResourceVersion', resource.resourceVersionId);
    const bible = await client.mutation(api.continuity.createBible, { projectId: project.projectId, snapshot: { resourceBindings: [{ resourceId: resource.resourceId, resourceVersionId: resource.resourceVersionId }], rules: ['Keep the approved blue coat.'], story: 'Fixture story.', visualStyle: '2D comedy' } });
    await approve('continuityBible', bible.bibleId);
    const episode = await client.mutation(api.episodes.create, { projectId: project.projectId, episodeNumber: 1, title: 'Workspace verification', durationSeconds: 4, workflow: 'FIXTURE', inputMode: 'IDEA', language: 'en', outputPreset: 'SOCIAL_VERTICAL' });
    const continuityContext = await client.query(api.continuity.productionPlanningContext, { projectId: project.projectId, productionId: episode.productionId, continuityBibleId: bible.bibleId });
    const plan = await client.mutation(api.productions.createPlan, { studioExternalId: project.studioExternalId, projectExternalId: project.externalId, productionId: episode.productionId, workflow: 'FIXTURE', inputMode: 'IDEA', durationSeconds: 4, language: 'en', outputPreset: 'SOCIAL_VERTICAL', input: { fixtureMarker: marker, continuityBibleId: bible.bibleId, continuityContext }, plan: createFixturePlan(), estimate: { credits: 0, providerCalls: 0 }, idempotencyKey: `${marker}:plan` });
    const graph = await client.query(api.scenes.list, { productionId: episode.productionId, productionVersionId: plan.versionId }); const shot = graph[0].scenes[0].shots[0];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await login(context); currentPage = page;
    const path = `/dashboard/projects/${project.externalId}/workspace`;
    await page.goto(`${base}${path}/media?production=${episode.productionId}`);
    await page.getByRole('heading', { name: 'Project voices', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Continuity bible', exact: true }).waitFor();
    pass('media workspace exposes real project voice and continuity controls');
    await page.getByLabel('Voice name', { exact: true }).fill('Fixture reference voice');
    await page.getByLabel('How this voice is used').selectOption('CLONED');
    await page.getByLabel('Reference recording · maximum 15 MiB').selectOption(audio.assetId);
    await page.getByRole('button', { name: 'Save voice profile', exact: true }).click();
    const voiceCard = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fixture reference voice', exact: true }) });
    await voiceCard.getByText('I own this voice', { exact: false }).waitFor();
    await voiceCard.getByLabel('I own this voice', { exact: false }).check();
    await voiceCard.getByLabel('I agree that approved recordings', { exact: false }).check();
    await voiceCard.getByRole('button', { name: 'Record project voice consent', exact: true }).click();
    await voiceCard.getByRole('button', { name: 'Revoke future voice use', exact: true }).waitFor();
    await voiceCard.getByRole('button', { name: 'Submit for review', exact: true }).click();
    await voiceCard.getByRole('button', { name: 'Approve', exact: true }).click();
    await voiceCard.getByRole('button', { name: 'Lock version', exact: true }).click();
    const voices = await client.query(api.voices.list, { projectId: project.projectId }); const voice = voices.find((entry) => entry.name === 'Fixture reference voice');
    assert(voice?.hasConsent); assert.equal((await client.query(api.voices.readiness, { projectId: project.projectId, voiceId: voice._id })).ready, true);
    pass('voice UI saves project recording, explicit consent, approval and lock without provider calls');
    await voiceCard.getByLabel('Reason for revocation').fill('Fixture verification completed.');
    await voiceCard.getByRole('button', { name: 'Revoke future voice use', exact: true }).click();
    await voiceCard.getByText('Future synthesis is blocked.', { exact: false }).waitFor();
    assert.equal((await client.query(api.voices.readiness, { projectId: project.projectId, voiceId: voice._id })).ready, false);
    pass('voice consent revocation immediately blocks future synthesis');
    await page.screenshot({ path: `${screenshotDir}/media-desktop.png`, fullPage: true });
    await page.goto(`${base}${path}/storyboard?production=${episode.productionId}`);
    const shotCard = page.getByRole('article').filter({ has: page.getByRole('heading', { name: shot.title, exact: true }) });
    await shotCard.getByLabel('Fixture Ada · version 1', { exact: true }).check();
    await shotCard.getByRole('button', { name: 'Save shot bindings', exact: true }).click();
    await expect(shotCard.getByRole('button', { name: 'Save shot bindings', exact: true })).toBeEnabled({ timeout: 20000 });
    await shotCard.getByLabel('Video operation', { exact: true }).selectOption('APPEARANCE_EDIT');
    await shotCard.getByLabel(video.name, { exact: false }).check();
    await shotCard.getByRole('button', { name: 'Save operation requirements', exact: true }).click();
    await expect(shotCard.getByRole('button', { name: 'Save operation requirements', exact: true })).toBeEnabled({ timeout: 20000 });
    await expect.poll(async () => (await client.query(api.scenes.getShot, { shotId: shot._id })).metadata.operation, { timeout: 15000 }).toBe('APPEARANCE_EDIT');
    const savedShot = await client.query(api.scenes.getShot, { shotId: shot._id });
    assert.deepEqual(savedShot.metadata.resourceVersionIds, [resource.resourceVersionId]); assert.equal(savedShot.metadata.operation, 'APPEARANCE_EDIT'); assert(savedShot.requiredAssetIds.includes(video.assetId));
    pass('storyboard persists exact approved resource bindings and source-video operation requirements');
    await page.screenshot({ path: `${screenshotDir}/storyboard-desktop.png`, fullPage: true });
    const approvedPlan = await client.mutation(api.productions.approvePlan, { planId: plan.planId });
    for (const asset of uploads) await approve('asset', asset.assetId);
    await page.goto(`${base}${path}/edit?production=${episode.productionId}`);
    const composer = page.getByRole('region', { name: 'Compose a timeline', exact: true });
    await composer.getByLabel('Approved project footage or image', { exact: true }).selectOption(video.assetId);
    await composer.getByLabel('Clip length in seconds', { exact: true }).fill('2');
    await composer.getByRole('button', { name: 'Add project clip', exact: true }).click();
    await composer.getByLabel('Exact title', { exact: true }).fill('Fixture product launch');
    await composer.getByLabel('Graphic length in seconds', { exact: true }).fill('2');
    await composer.getByLabel('Project brand name · optional', { exact: true }).fill('Fixture brand');
    await composer.getByLabel('Approved project logo · optional', { exact: true }).selectOption(image.assetId);
    await composer.getByRole('button', { name: 'Add designed card', exact: true }).click();
    await composer.getByLabel('Approved project audio', { exact: true }).selectOption(audio.assetId);
    await composer.getByLabel('Audio length in seconds', { exact: true }).fill('2');
    await composer.getByRole('button', { name: 'Create draft timeline', exact: true }).click();
    await composer.getByText('Draft timeline saved.', { exact: false }).waitFor();
    const timeline = (await client.query(api.timeline.list, { productionId: episode.productionId }))[0];
    assert(timeline);
    const timelineCard = composer.getByRole('article').filter({ has: composer.getByRole('heading', { name: `Timeline version ${timeline.versionNumber}`, exact: true }) });
    await timelineCard.getByRole('button', { name: 'Submit for review', exact: true }).click();
    await timelineCard.getByRole('button', { name: 'Approve', exact: true }).click();
    await timelineCard.getByRole('button', { name: 'Lock version', exact: true }).click();
    await timelineCard.getByRole('button', { name: 'Build canonical manifest', exact: true }).click();
    await composer.getByText('Canonical assembly manifest saved.', { exact: false }).waitFor();
    const composed = await client.query(api.timeline.get, { timelineId: timeline._id });
    assert(composed.timeline.manifestId, 'Real initial timeline must retain the canonical manifest relationship.');
    const manifest = await client.query(api.assembly.getManifest, { manifestId: composed.timeline.manifestId });
    assert.equal(manifest.manifest.productionVersionId, approvedPlan.versionId);
    assert(manifest.manifest.items.some((item) => item.kind === 'GRAPHIC'));
    assert.equal(composed.timeline.durationSeconds, 4);
    assert(composed.clips.some((clip) => clip.assetId === audio.assetId));
    assert.equal((await client.query(api.renderJobs.list, { productionId: episode.productionId })).length, 0);
    pass('edit UI creates a real mixed-media initial timeline, approves and locks it, and builds a canonical manifest without rendering');
    await page.screenshot({ path: `${screenshotDir}/edit-desktop.png`, fullPage: true });
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const phone = await login(mobile);
    await phone.goto(`${base}${path}/media?production=${episode.productionId}`); await phone.getByRole('heading', { name: 'Project voices', exact: true }).waitFor();
    assert(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await phone.screenshot({ path: `${screenshotDir}/media-mobile.png`, fullPage: true });
    await phone.goto(`${base}${path}/storyboard?production=${episode.productionId}`); await phone.getByRole('heading', { name: 'Shots and takes', exact: true }).waitFor();
    assert(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await phone.screenshot({ path: `${screenshotDir}/storyboard-mobile.png`, fullPage: true });
    await phone.goto(`${base}${path}/edit?production=${episode.productionId}`); await phone.getByRole('heading', { name: 'Build the first timeline', exact: true }).waitFor();
    assert(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await phone.screenshot({ path: `${screenshotDir}/edit-mobile.png`, fullPage: true });
    pass('mobile media, storyboard, and composition remain usable without horizontal overflow');
    console.log(`Online workspace browser checks: ${passed} passed; paid provider calls: 0; renderer submissions: 0.`);
} catch (error) { if (currentPage) await currentPage.screenshot({ path: `${screenshotDir}/failure.png`, fullPage: true }).catch(() => {}); throw error; } finally { await browser.close(); await client.mutation(api.projects.softDelete, { projectId: project.projectId }).catch(() => console.error(`FIXTURE_CLEANUP_REQUIRED: ${project.externalId}`)); }
