/** Real source-video edit acceptance through canonical budgeted jobs. Never exports. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../dev-fixture/client.mjs';
const require = createRequire(import.meta.url); const ts = require('typescript');
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, file);
const { normalizeDiscoveredVideoModel } = require('../../src/lib/ai/model-discovery.ts');
const { selectVideoRoute } = require('../../src/lib/ai/video-routing.ts');
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
const phase = process.argv[2]; const caseName = process.argv[3] || 'appearance-edit';
assert(['prepare', 'queue', 'status', 'download'].includes(phase));
assert(['appearance-edit', 'object-replace'].includes(caseName));
if (phase === 'queue') assert.equal(process.env.FINALFRAME_ALLOW_PAID_TESTS, 'true');
const dir = process.env.FINALFRAME_AUDIO_EDIT_TEST_DIR || '/tmp/finalframe-audio-edit-tests'; fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, caseName + '.json');
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { caseName, model: process.env.FINALFRAME_TEST_EDIT_MODEL, operation: caseName === 'appearance-edit' ? 'APPEARANCE_EDIT' : 'OBJECT_REPLACE' };
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
const { client } = await createAuthenticatedClient(); const { studio, role } = await client.query(api.account.current, {}); assert(studio && ['owner', 'admin'].includes(role));
if (phase === 'prepare') {
  assert(state.model, 'Set the model after current catalog and endpoint review');
  if (!state.project) { state.project = await client.mutation(api.projects.create, { name: 'Live acceptance · ' + caseName, projectType: 'PRODUCT_SAAS_LAUNCH', description: 'Explicitly uploaded source for small instruction-guided video edit acceptance.' }); save(); }
  if (!state.source) {
    const url = await client.mutation(api.assetStorage.generateUploadUrl, { projectId: state.project.projectId });
    const bytes = fs.readFileSync(process.env.FINALFRAME_TEST_SOURCE_VIDEO || path.join(process.env.FINALFRAME_SMALL_VIDEO_TEST_DIR || '/tmp/finalframe-small-video-tests', 'product-launch.mp4'));
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'video/mp4' }, body: bytes }); assert(response.ok);
    const { storageId } = await response.json();
    state.source = await client.mutation(api.assetStorage.ingestAsset, { studioExternalId: studio.externalId, projectId: state.project.projectId, scope: 'PROJECT', storageId, source: 'UPLOADED', roles: ['REFERENCE'], name: 'Explicit test source · original speaker', mimeType: 'video/mp4', metadata: { testFixture: true, importedFrom: 'owner-controlled previous product sample', durationSeconds: 4 }, rights: { status: 'OWNED' } }); save();
    const resource = { projectId: state.project.projectId, resourceType: 'asset', resourceId: state.source.assetId };
    await client.mutation(api.approvals.submitForReview, resource); await client.mutation(api.approvals.approve, resource); await client.mutation(api.approvals.lock, resource);
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'video-catalog.json'), 'utf8')).data.map(normalizeDiscoveredVideoModel).filter(Boolean);
  const selected = catalog.find(m => m.id === state.model); assert(selected && selected.supportedDurations.includes(5) && selected.supportedResolutions.includes('2K'));
  await client.mutation(api.videoRouting.refreshCatalog, { studioExternalId: studio.externalId, models: catalog.map(m => ({ provider: 'openrouter', modelId: m.id, name: m.name, supportedDurations: m.supportedDurations, supportedResolutions: m.supportedResolutions, supportedAspectRatios: m.supportedAspectRatios, supportedSizes: m.supportedSizes, supportedParameters: m.allowedPassthroughParameters, pricingSkus: m.pricingSkus })) });
  await client.mutation(api.videoRouting.reviewModelCapabilities, { studioExternalId: studio.externalId, modelId: state.model, available: true, supportsTextToVideo: true, supportsImageReferences: false, supportsFirstFrame: false, supportsLastFrame: false, supportsAudio: selected.raw.generate_audio === true, supportsVideoReferences: true, supportsVideoEdit: true, reviewedOperations: ['EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE'] });
  const previous = await client.query(api.videoRouting.forGeneration, { studioExternalId: studio.externalId, videoType: 'PRODUCT_SAAS_LAUNCH', qualityTier: 'STANDARD' });
  await client.mutation(api.videoRouting.savePolicy, { studioExternalId: studio.externalId, videoType: 'PRODUCT_SAAS_LAUNCH', qualityTier: 'STANDARD', path: 'AI_VIDEO', preferredModelIds: [...new Set([...(previous.policy?.preferredModelIds || []), state.model])], maxCostUsd: 0.75 });
  const config = await client.query(api.videoRouting.forGeneration, { studioExternalId: studio.externalId, videoType: 'PRODUCT_SAAS_LAUNCH', qualityTier: 'STANDARD' });
  state.constraints = { videoType: 'PRODUCT_SAAS_LAUNCH', task: 'EDIT', operation: state.operation, qualityTier: 'STANDARD', durationSeconds: 5, aspectRatio: '16:9', resolution: '2K', hasVideoReference: true, requiresAudio: false, hasImageReferences: false, hasAudioReference: false, requiresFirstFrame: false, requiresLastFrame: false, maximumCostUsd: 0.75 };
  state.route = selectVideoRoute(state.constraints, config.catalog.filter(m => m.reviewedAt && m.available), config.policy); assert.equal(state.route.modelId, state.model);
  state.prompt = caseName === 'appearance-edit' ? 'Edit the provided source video @Video1. Change only the fabric mesh and solid body of the floating compact speaker to saturated warm orange. Keep its exact shape, size, fine mesh texture, pedestal, dark blue studio background, lighting, framing, and camera motion consistent with the source. One continuous five-second product shot, no text, no logos, no extra objects. Silent.' : 'Edit the provided source video @Video1. Replace only the floating compact speaker with one translucent amber glass cube in the same position and similar size, with polished edges and light refraction. Preserve the original round pedestal, dark blue studio background, lighting, framing, and camera motion. One continuous five-second product shot, no text, no logos, no other objects. Silent.';
  if (!state.plan) {
    const plan = { summary: 'Manually authored controlled source-video edit.', workflow: 'BUSINESS_AD', assumptions: [], questions: [], operations: [], bible: { projectContext: { title: caseName, duration: 5, language: 'en' }, characters: [], locations: [], products: [], style: { visualStyle: 'Preserve source commercial studio' }, story: { logline: state.prompt } }, sequences: [{ title: 'Edit acceptance', description: 'One test shot', orderIndex: 0, scenes: [{ title: caseName, purpose: 'Verify source-conditioned editing', visualDirection: state.prompt, orderIndex: 0, shots: [{ title: caseName, prompt: state.prompt, durationSeconds: 5, orderIndex: 0, camera: {}, requiredAssetIds: [state.source.assetId], metadata: { operation: state.operation, audioPolicy: 'SILENT' } }] }] }] };
    state.plan = await client.mutation(api.productions.createPlan, { studioExternalId: studio.externalId, projectExternalId: state.project.externalId, workflow: 'BUSINESS_AD', inputMode: 'FOOTAGE', durationSeconds: 5, language: 'en', outputPreset: 'WEBSITE_LANDSCAPE', input: { prompt: state.prompt, source: 'MANUALLY_AUTHORED_ACCEPTANCE' }, plan, estimate: { estimatedProviderCostUsd: state.route.estimatedCostUsd }, idempotencyKey: 'edit-plan:' + state.project.projectId }); save();
  }
  if (!state.approved) { state.approved = await client.mutation(api.productions.approvePlan, { planId: state.plan.planId }); save(); }
  const graph = await client.query(api.scenes.list, { productionId: state.plan.productionId, productionVersionId: state.approved.versionId }); state.shotId = graph[0].scenes[0].shots[0]._id; save();
  console.log(JSON.stringify({ caseName, phase, projectId: state.project.projectId, route: state.route, paidProviderCalls: 0 }));
} else if (phase === 'queue') {
  assert(state.shotId && state.route);
  const args = { productionId: state.plan.productionId, shotId: state.shotId, provider: 'openrouter', model: state.route.modelId, estimatedCost: 1, estimatedProviderCostUsd: state.route.estimatedCostUsd, capability: 'VIDEO_FINAL', modality: 'VIDEO', correlationId: 'live-edit:' + state.project.projectId, idempotencyKey: 'live-edit:' + state.project.projectId, request: { ...state.constraints, duration: 5, ratio: '16:9' } };
  if (!state.job) { state.job = await client.mutation(api.generationJobs.create, args); save(); }
  assert.equal((await client.mutation(api.generationJobs.create, args))._id, state.job._id); state.idempotencyVerified = true; save();
  console.log(JSON.stringify({ caseName, phase, job: state.job, duplicateReturnedSameJob: true }));
} else {
  const result = await client.query(api.generationJobs.get, { jobId: state.job._id }); state.result = result.job; save();
  if (phase === 'download') {
    assert.equal(result.job.status, 'COMPLETED'); const media = await client.query(api.assetStorage.resolveAuthorizedMedia, { assetId: result.job.assetId });
    const response = await fetch(media.url); assert(response.ok); const bytes = Buffer.from(await response.arrayBuffer()); state.downloadPath = path.join(dir, caseName + '.mp4'); fs.writeFileSync(state.downloadPath, bytes); save();
  }
  console.log(JSON.stringify({ caseName, phase, job: result.job, downloadPath: state.downloadPath }));
}
