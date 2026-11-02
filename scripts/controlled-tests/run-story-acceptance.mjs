/** Live, resumable launch recipes. Each paid submission uses the existing
 * project-owned worker and shared budget; accepted jobs are never repurchased. */
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
const phase = process.argv[2]; const name = process.argv[3];
assert(['prepare', 'queue', 'status', 'download', 'compose'].includes(phase));
if (phase === 'queue') assert.equal(process.env.FINALFRAME_ALLOW_PAID_TESTS, 'true');
const root = process.env.FINALFRAME_COMPLETE_TEST_DIR || '/tmp/finalframe-complete-acceptance';
const recipes = JSON.parse(fs.readFileSync(path.join(root, 'recipes.json'), 'utf8'));
const recipe = recipes[name]; assert(recipe);
const file = path.join(root, name + '.json');
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { name, model: recipe.model, jobs: [], frames: [] };
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
const { client } = await createAuthenticatedClient(); const { studio } = await client.query(api.account.current, {}); assert(studio);
async function approve(resourceType, resourceId) {
  const args = { projectId: state.project.projectId, ...(state.plan ? { productionId: state.plan.productionId } : {}), resourceType, resourceId };
  const current = await client.query(api.approvals.get, args);
  if (!current.approved) { await client.mutation(api.approvals.submitForReview, args); await client.mutation(api.approvals.approve, args); }
  if (!current.locked) await client.mutation(api.approvals.lock, args);
}
if (phase === 'prepare') {
  if (!state.project) { state.project = await client.mutation(api.projects.create, { name: 'Live acceptance · ' + name, projectType: recipe.videoType, description: 'Small live launch recipe; explicit owned references, shared budget and immutable acceptance evidence.' }); save(); }
  for (let index = 0; index < recipe.framePaths.length; index++) {
    if (state.frames[index]) continue;
    const uploadUrl = await client.mutation(api.assetStorage.generateUploadUrl, { projectId: state.project.projectId });
    const response = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: fs.readFileSync(recipe.framePaths[index]) }); assert(response.ok);
    const { storageId } = await response.json();
    state.frames[index] = await client.mutation(api.assetStorage.ingestAsset, { studioExternalId: studio.externalId, projectId: state.project.projectId, scope: 'PROJECT', storageId, source: 'UPLOADED', roles: ['REFERENCE'], name: name + ' · owned frame ' + (index + 1), mimeType: 'image/jpeg', rights: { status: 'OWNED' }, metadata: { controlledTest: true, origin: recipe.framePaths[index] } }); save();
  }
  for (const frame of state.frames) await approve('asset', frame.assetId);
  if (!state.character) { state.character = await client.mutation(api.continuity.createResource, { projectId: state.project.projectId, kind: 'CHARACTER', name: recipe.subject, profile: { description: recipe.continuity }, assetIds: [state.frames[0].assetId] }); save(); }
  await approve('projectResourceVersion', state.character.resourceVersionId);
  if (!state.bible) { state.bible = await client.mutation(api.continuity.createBible, { projectId: state.project.projectId, snapshot: { resourceBindings: [{ resourceId: state.character.resourceId, resourceVersionId: state.character.resourceVersionId }], rules: [recipe.continuity], story: recipe.story, visualStyle: recipe.style }, idempotencyKey: 'launch-bible:' + state.project.projectId }); save(); }
  await approve('continuityBible', state.bible.bibleId);
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'video-catalog.json'), 'utf8')).data.map(normalizeDiscoveredVideoModel).filter(Boolean);
  const model = catalog.find(m => m.id === recipe.model); assert(model);
  await client.mutation(api.videoRouting.refreshCatalog, { studioExternalId: studio.externalId, models: catalog.map(m => ({ provider: 'openrouter', modelId: m.id, name: m.name, supportedDurations: m.supportedDurations, supportedResolutions: m.supportedResolutions, supportedAspectRatios: m.supportedAspectRatios, supportedSizes: m.supportedSizes, supportedParameters: m.allowedPassthroughParameters, pricingSkus: m.pricingSkus })) });
  assert(model.raw.supported_frame_images?.includes('first_frame'));
  if (recipe.shots.some(s => s.lastFrame)) assert(model.raw.supported_frame_images.includes('last_frame'));
  await client.mutation(api.videoRouting.reviewModelCapabilities, { studioExternalId: studio.externalId, modelId: recipe.model, available: true, supportsTextToVideo: true, supportsImageReferences: false, supportsFirstFrame: true, supportsLastFrame: model.raw.supported_frame_images.includes('last_frame'), supportsAudio: model.raw.generate_audio === true, reviewedOperations: ['GENERATE', 'FRAME_TO_VIDEO'] });
  const previous = await client.query(api.videoRouting.forGeneration, { studioExternalId: studio.externalId, videoType: recipe.videoType, qualityTier: recipe.qualityTier });
  state.previousPolicy ??= previous.policy; save();
  await client.mutation(api.videoRouting.savePolicy, { studioExternalId: studio.externalId, videoType: recipe.videoType, qualityTier: recipe.qualityTier, path: 'AI_VIDEO', preferredModelIds: [recipe.model, ...(previous.policy?.preferredModelIds || []).filter(id => id !== recipe.model)], maxCostUsd: recipe.maxCostUsd });
  const config = await client.query(api.videoRouting.forGeneration, { studioExternalId: studio.externalId, videoType: recipe.videoType, qualityTier: recipe.qualityTier });
  state.routes = recipe.shots.map(shot => selectVideoRoute({ videoType: recipe.videoType, qualityTier: recipe.qualityTier, task: 'FRAME_TO_VIDEO', durationSeconds: shot.duration, aspectRatio: '16:9', resolution: recipe.resolution, requiresFirstFrame: true, requiresLastFrame: Boolean(shot.lastFrame), requiresAudio: recipe.audio, imageReferenceCount: shot.lastFrame ? 2 : 1, maximumCostUsd: recipe.maxCostUsd }, config.catalog.filter(m => m.reviewedAt && m.available), config.policy));
  assert(state.routes.every(route => route.modelId === recipe.model)); save();
  if (!state.plan) {
    const context = await client.query(api.continuity.productionPlanningContext, { projectId: state.project.projectId, continuityBibleId: state.bible.bibleId });
    const plan = { summary: recipe.story, workflow: 'SHORT_FILM', assumptions: ['Controlled manually authored launch script.'], questions: [], operations: [], bible: { projectContext: { title: name, duration: recipe.shots.reduce((n, s) => n + s.duration, 0), language: 'en' }, characters: [], locations: [], products: [], style: { visualStyle: recipe.style }, story: { logline: recipe.story } }, sequences: [{ title: 'Short acceptance story', description: recipe.story, orderIndex: 0, scenes: recipe.shots.map((shot, index) => ({ title: shot.title, purpose: shot.title, visualDirection: shot.prompt, orderIndex: index, shots: [{ title: shot.title, prompt: shot.prompt, durationSeconds: shot.duration, orderIndex: 0, requiredAssetIds: [state.frames[0].assetId, ...(shot.lastFrame ? [state.frames[1].assetId] : [])], metadata: { resourceVersionIds: [state.character.resourceVersionId], operation: 'FRAME_TO_VIDEO', firstFrameAssetId: state.frames[0].assetId, ...(shot.lastFrame ? { lastFrameAssetId: state.frames[1].assetId } : {}), audioPolicy: recipe.audio ? 'GENERATE' : 'SILENT' } }] })) }] };
    state.plan = await client.mutation(api.productions.createPlan, { studioExternalId: studio.externalId, projectExternalId: state.project.externalId, workflow: 'SHORT_FILM', inputMode: 'SCRIPT', durationSeconds: recipe.shots.reduce((n, s) => n + s.duration, 0), language: 'en', outputPreset: 'WEBSITE_LANDSCAPE', input: { prompt: recipe.story, videoType: recipe.videoType, continuityBibleId: state.bible.bibleId, continuityContext: context }, plan, estimate: { estimatedProviderCostUsd: state.routes.reduce((n, r) => n + r.estimatedCostUsd, 0) }, idempotencyKey: 'launch-story-plan:' + state.project.projectId }); save();
  }
  if (!state.approved) { state.approved = await client.mutation(api.productions.approvePlan, { planId: state.plan.planId }); save(); }
  const graph = await client.query(api.scenes.list, { productionId: state.plan.productionId, productionVersionId: state.approved.versionId });
  state.shotIds = graph.flatMap(sequence => sequence.scenes.flatMap(scene => scene.shots.map(shot => shot._id))); assert.equal(state.shotIds.length, recipe.shots.length); save();
  console.log(JSON.stringify({ phase, name, projectId: state.project.projectId, routes: state.routes, paidCalls: 0 }));
} else if (phase === 'queue') {
  for (let index = 0; index < state.shotIds.length; index++) {
    const args = { productionId: state.plan.productionId, shotId: state.shotIds[index], provider: 'openrouter', model: recipe.model, estimatedCost: 1, estimatedProviderCostUsd: state.routes[index].estimatedCostUsd, capability: recipe.qualityTier === 'PREMIUM' ? 'VIDEO_FINAL' : 'VIDEO_PREVIEW', modality: 'VIDEO', idempotencyKey: 'launch-story:' + state.project.projectId + ':' + index, request: { videoType: recipe.videoType, qualityTier: recipe.qualityTier, task: 'FRAME_TO_VIDEO', duration: recipe.shots[index].duration, ratio: '16:9', resolution: recipe.resolution, requiresAudio: recipe.audio, maximumCostUsd: recipe.maxCostUsd } };
    if (!state.jobs[index]) { state.jobs[index] = await client.mutation(api.generationJobs.create, args); save(); }
    assert.equal((await client.mutation(api.generationJobs.create, args))._id, state.jobs[index]._id);
  }
  console.log(JSON.stringify({ phase, name, jobs: state.jobs.map(job => job._id), duplicatesReused: true }));
} else if (phase === 'status' || phase === 'download') {
  state.results = [];
  for (let index = 0; index < state.jobs.length; index++) {
    const { job } = await client.query(api.generationJobs.get, { jobId: state.jobs[index]._id }); state.results.push(job); save();
    if (phase === 'download') {
      assert.equal(job.status, 'COMPLETED'); const media = await client.query(api.assetStorage.resolveAuthorizedMedia, { assetId: job.assetId }); const response = await fetch(media.url); assert(response.ok);
      fs.writeFileSync(path.join(root, name + '-shot-' + (index + 1) + '.mp4'), Buffer.from(await response.arrayBuffer()));
    }
  }
  console.log(JSON.stringify({ phase, name, jobs: state.results.map(j => ({ id: j._id, status: j.status, stage: j.executionStage, model: j.model, providerCostUsd: j.providerCostUsd, errorCode: j.errorCode, attempts: j.attemptCount })) }));
} else {
  assert.equal(state.results.length, recipe.shots.length);
  for (const job of state.results) { assert.equal(job.status, 'COMPLETED'); await approve('asset', job.assetId); await approve('shotVersion', job.shotVersionId); }
  if (!state.timeline) { state.timeline = await client.mutation(api.timeline.createDraft, { productionId: state.plan.productionId, productionVersionId: state.approved.versionId, clips: state.results.map(j => ({ kind: 'TAKE', shotVersionId: j.shotVersionId })), idempotencyKey: 'launch-story-timeline:' + state.project.projectId }); save(); }
  await approve('timeline', state.timeline.timelineId);
  if (!state.assembly) { state.assembly = await client.mutation(api.assembly.createJob, { productionId: state.plan.productionId, timelineId: state.timeline.timelineId, selectionScope: 'FULL_PROJECT', idempotencyKey: 'launch-story-manifest:' + state.project.projectId }); save(); }
  console.log(JSON.stringify({ phase, name, timelineId: state.timeline.timelineId, manifestId: state.assembly.manifestId, items: state.assembly.manifest.items.length, durationFrames: state.assembly.manifest.output.durationInFrames }));
}
