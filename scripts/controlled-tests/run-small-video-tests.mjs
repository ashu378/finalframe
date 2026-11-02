/** Opt-in paid acceptance against ONLINE development Convex only.
 * Provider submissions always use canonical budgeted actions/durable jobs.
 * Each phase is explicit; this script never renders an MP4 or auto-retries a purchase.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../dev-fixture/client.mjs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, filename) => m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
const { LEGACY_DIRECTOR_PLAN_SCHEMA } = require('../../src/lib/production/planning-schema.ts');
const { normalizeDiscoveredVideoModel } = require('../../src/lib/ai/model-discovery.ts');
const { selectVideoRoute } = require('../../src/lib/ai/video-routing.ts');
const phase = process.argv[2];
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
assert(['prepare', 'plan', 'queue', 'status', 'download'].includes(phase), 'Choose prepare, plan, queue, status, or download');
if (['plan', 'queue'].includes(phase)) assert.equal(process.env.FINALFRAME_ALLOW_PAID_TESTS, 'true', 'Explicit paid-test opt-in required');
const directory = process.env.FINALFRAME_LIVE_TEST_DIR || '/tmp/finalframe-small-video-tests';
fs.mkdirSync(directory, { recursive: true });
const caseName = process.env.FINALFRAME_TEST_CASE || 'cinematic-first';
assert(/^[a-z0-9-]{1,60}$/.test(caseName));
const file = path.join(directory, caseName + '.json');
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { caseName, videoType: process.env.FINALFRAME_TEST_VIDEO_TYPE || 'CINEMATIC_FILM', model: process.env.FINALFRAME_TEST_VIDEO_MODEL, brief: process.env.FINALFRAME_TEST_BRIEF, createdAt: new Date().toISOString() };
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
const { client } = await createAuthenticatedClient();
const account = await client.query(api.account.current, {});
assert(account.studio && ['owner', 'admin'].includes(account.role));
state.studioExternalId = account.studio.externalId;
if (phase === 'prepare') {
  assert(state.model && state.brief, 'Specify reviewed model and a brief');
  if (!state.project) {
    const name = 'Live acceptance · ' + caseName;
    const existing = (await client.query(api.projects.list, { studioExternalId: state.studioExternalId })).filter(p => p.name === name);
    assert(existing.length <= 1, 'Reconcile duplicate test projects before continuing');
    state.project = existing.length ? { projectId: existing[0]._id, externalId: existing[0].externalId, studioExternalId: state.studioExternalId } : await client.mutation(api.projects.create, { name, description: 'Owner-authorized small paid acceptance. Retain results and cost history.', projectType: state.videoType });
    save();
  }
  const raw = JSON.parse(fs.readFileSync(process.env.FINALFRAME_VIDEO_CATALOG_FILE || '/tmp/finalframe-live-video-catalog.json', 'utf8')).data;
  const catalog = raw.map(normalizeDiscoveredVideoModel).filter(Boolean);
  const selected = catalog.find(m => m.id === state.model); assert(selected);
  assert(selected.supportedDurations.includes(4) && selected.supportedResolutions.includes('720p') && selected.supportedAspectRatios.includes('16:9'));
  await client.mutation(api.videoRouting.refreshCatalog, { studioExternalId: state.studioExternalId, models: catalog.map(m => ({ provider: 'openrouter', modelId: m.id, name: m.name, supportedDurations: m.supportedDurations, supportedResolutions: m.supportedResolutions, supportedAspectRatios: m.supportedAspectRatios, supportedSizes: m.supportedSizes, supportedParameters: m.allowedPassthroughParameters, pricingSkus: m.pricingSkus })) });
  // This command initially reviews only documented text-to-video controls.
  // Advanced edit/reference capabilities require a separate evidence review.
  await client.mutation(api.videoRouting.reviewModelCapabilities, { studioExternalId: state.studioExternalId, modelId: state.model, available: true, supportsTextToVideo: true, supportsImageReferences: false, supportsFirstFrame: false, supportsLastFrame: false, supportsAudio: selected.raw.generate_audio === true, reviewedOperations: ['GENERATE'] });
  await client.mutation(api.videoRouting.savePolicy, { studioExternalId: state.studioExternalId, videoType: state.videoType, qualityTier: 'STANDARD', path: 'AI_VIDEO', preferredModelIds: [state.model], maxCostUsd: 0.75 });
  const config = await client.query(api.videoRouting.forGeneration, { studioExternalId: state.studioExternalId, videoType: state.videoType, qualityTier: 'STANDARD' });
  const request = { videoType: state.videoType, task: 'GENERATE', qualityTier: 'STANDARD', durationSeconds: 4, aspectRatio: '16:9', resolution: '720p', requiresAudio: false, hasImageReferences: false, hasVideoReference: false, hasAudioReference: false, requiresFirstFrame: false, requiresLastFrame: false, maximumCostUsd: 0.75 };
  state.route = selectVideoRoute(request, config.catalog.filter(m => m.reviewedAt && m.available), config.policy);
  state.constraints = request;
  save();
  console.log(JSON.stringify({ phase, projectId: state.project.projectId, studioExternalId: state.studioExternalId, route: state.route, providerCalls: 0 }));
} else if (phase === 'plan') {
  assert(state.project && state.route);
  if (!state.textReceipt) {
    state.textStartedAt = new Date().toISOString(); save();
    const response = await client.action(api.providerText.execute, { projectId: state.project.projectId, capability: 'STRUCTURED_PLANNING', messages: [
      { role: 'system', content: 'You are FinalFrame production planner. Return one production plan matching the JSON schema, exactly ONE sequence, ONE scene, ONE shot, exactly 4 seconds. The user intentionally approves this test plan for generation. No reference assets, no unrelated characters, no questions, no audio, no logos, no text overlays. requiredAssetIds must be empty. Use a detailed coherent video prompt. Do not invent provider metadata.' },
      { role: 'user', content: state.brief + '\nVideo type: ' + state.videoType + '. Landscape 16:9, 720p, silent, four seconds.' },
    ], structuredOutput: LEGACY_DIRECTOR_PLAN_SCHEMA });
    state.textReceipt = response;
    state.plan = JSON.parse(response.content);
    save();
  }
  const shots = state.plan.sequences.flatMap(s => s.scenes.flatMap(c => c.shots));
  assert.equal(shots.length, 1); assert.equal(shots[0].durationSeconds, 4); assert.equal(shots[0].requiredAssetIds.length, 0);
  if (!state.canonicalPlan) { state.canonicalPlan = await client.mutation(api.productions.createPlan, { studioExternalId: state.studioExternalId, projectExternalId: state.project.externalId, workflow: state.plan.workflow, inputMode: 'IDEA', durationSeconds: 4, language: 'en', outputPreset: 'WEBSITE_LANDSCAPE', input: { prompt: state.brief, videoType: state.videoType, textReceiptId: state.textReceipt.providerTextRequestId }, plan: state.plan, estimate: { qualityTier: 'STANDARD', estimatedProviderCostUsd: state.route.estimatedCostUsd }, idempotencyKey: 'paid-plan:' + state.project.projectId }); save(); }
  if (!state.approved) { state.approved = await client.mutation(api.productions.approvePlan, { planId: state.canonicalPlan.planId }); save(); }
  const graph = await client.query(api.scenes.list, { productionId: state.canonicalPlan.productionId, productionVersionId: state.approved.versionId });
  state.shotId = graph[0].scenes[0].shots[0]._id; save();
  console.log(JSON.stringify({ phase, projectId: state.project.projectId, productionId: state.canonicalPlan.productionId, shotId: state.shotId, model: state.textReceipt.modelUsed, costUsd: state.textReceipt.costUsd, approved: true }));
} else if (phase === 'queue') {
  assert(state.shotId);
  if (!state.creditGrant) {
    state.creditGrant = await client.mutation(api.financial.grantTestCredits, { studioExternalId: state.studioExternalId, amount: 1000, idempotencyKey: 'paid-acceptance-20261102:' + state.studioExternalId, reason: 'Owner-authorized development video acceptance; internal credits only, no payment record.' });
    save();
  }
  if (!state.job) {
    const args = { productionId: state.canonicalPlan.productionId, shotId: state.shotId, provider: 'openrouter', model: state.route.modelId, estimatedCost: 1, estimatedProviderCostUsd: state.route.estimatedCostUsd, capability: 'VIDEO_PREVIEW', modality: 'VIDEO', modelVersion: String(state.route.policyVersion), correlationId: 'live-test:' + state.project.projectId, idempotencyKey: 'live-test:' + state.project.projectId, request: { ...state.constraints, duration: 4, ratio: '16:9', maximumCostUsd: 0.75 } };
    state.job = await client.mutation(api.generationJobs.create, args); save();
    const replay = await client.mutation(api.generationJobs.create, args); assert.equal(replay._id, state.job._id);
    state.idempotencyVerified = true; save();
  }
  console.log(JSON.stringify({ phase, jobId: state.job._id, idempotencyVerified: state.idempotencyVerified, estimatedUsd: state.route.estimatedCostUsd }));
} else {
  assert(state.job);
  const result = await client.query(api.generationJobs.get, { jobId: state.job._id }); state.lastJob = result.job; save();
  if (phase === 'download') {
    assert.equal(result.job.status, 'COMPLETED'); assert(result.job.assetId);
    const media = await client.query(api.assetStorage.resolveAuthorizedMedia, { assetId: result.job.assetId });
    const response = await fetch(media.url, { signal: AbortSignal.timeout(60_000) }); assert(response.ok);
    assert(response.headers.get('content-type')?.startsWith('video/'));
    const bytes = Buffer.from(await response.arrayBuffer()); assert(bytes.length > 0 && bytes.length <= 64 * 1024 * 1024);
    state.localVideo = path.join(directory, caseName + '.mp4'); fs.writeFileSync(state.localVideo, bytes); save();
    console.log(JSON.stringify({ phase, file: state.localVideo, bytes: bytes.length, providerCostUsd: result.job.providerCostUsd }));
  } else console.log(JSON.stringify(result));
}
