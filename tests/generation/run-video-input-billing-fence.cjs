const assert = require('node:assert/strict');
const h = require('./run-operation-controls.cjs');
const v = new Proxy({}, { get: () => () => ({}) });
const definitions = Object.fromEntries(['query', 'mutation', 'action', 'internalQuery', 'internalMutation'].map(name => [name, value => value]));
const model = { ...h.model, modelId: 'bytedance/seedance-2.5', modelVersion: 'bytedance/seedance-2.5-20260807', supportedSizes: ['1280x720'], estimatedCostPerSecond: undefined, pricingSkus: { video_tokens: .0000107, video_tokens_without_audio: .0000107, video_tokens_with_video_input: .0000064 } };
const request = { videoType: 'SOCIAL_CUTDOWN', task: 'GENERATE', operation: 'GENERATE', qualityTier: 'STANDARD', durationSeconds: 4, aspectRatio: '16:9', resolution: '720p', hasVideoReference: true };
function fixture(references = []) {
  const state = h.backendFixture({ operation: 'GENERATE' }, references, (_, __, auth) => h.compile('convex/videoRouting.ts', {
    './_generated/server': definitions, './_generated/api': { internal: h.api }, 'convex/values': { v }, './authorization': { requireProjectRole: auth, requireMember: auth, requireAdmin: auth },
    '../src/lib/ai/video-routing': h.routing, './generationWorkerContracts': h.contracts, './generationContinuity': { resolveGenerationContinuity: async (_, args) => ({ referenceAssetIds: args.referenceAssetIds }) },
  }));
  state.rows.set('catalog', { ...model, _id: 'catalog', table: 'videoModelCatalog', studioExternalId: 'studio', lastSeenAt: Date.now(), reviewedAt: Date.now(), reviewedCatalogFingerprint: h.routing.videoCatalogFingerprint(model) });
  state.rows.set('policy', { _id: 'policy', table: 'videoRoutePolicies', studioExternalId: 'studio', videoType: 'SOCIAL_CUTDOWN', qualityTier: 'STANDARD', path: 'AI_VIDEO', preferredModelIds: [model.modelId], maxCostUsd: 10, updatedAt: 1 });
  const create = state.create; state.create = args => create({ model: model.modelId, ...args });
  return state;
}
async function main() {
  const outputOnly = h.routing.estimateVideoCost(model, { ...request, hasVideoReference: false });
  const documentedInputAndOutput = (30 + 4) * 1280 * 720 * 24 / 1024 * .0000064;
  assert.ok(outputOnly < documentedInputAndOutput, 'output-only quote underfunds the actual video-input duration formula even before its minimum floor');
  assert.equal(h.routing.estimateVideoCost(model, request), undefined);
  assert.equal(h.routing.videoModelSupportsRequest(model, request), false);
  assert.throws(() => h.routing.selectVideoRoute(request, [model]));
  assert.equal(h.routing.estimateVideoCost({ ...model, pricingSkus: undefined, estimatedCostPerSecond: 10 }, request), undefined, 'a large fallback rate does not certify source duration');
  console.log('PASS live video-input SKU cannot authorize an output-only or fallback quote');

  const action = h.publicActionFixture({ operation: 'GENERATE' }, ['video']); action.model = model;
  assert.equal((await action.run()).success, false); assert.equal(action.mutations.length, 0);
  const denied = fixture(['video']);
  await assert.rejects(denied.create()); assert.equal(denied.writes.length, 0); assert.equal(denied.schedules.length, 0);
  console.log('PASS actual public action and canonical create deny video-input before reservation');

  const queued = fixture(); const created = await queued.create(); const job = queued.rows.get(created._id);
  // A queued job created before this fence existed retains its frozen refs.
  Object.assign(job.request, { hasVideoReference: true, referenceAssetIds: ['video'] });
  const before = queued.writes.length;
  await assert.rejects(queued.fence(created._id), error => error.code === 'ROUTE_CHANGED');
  assert.equal(queued.rows.get(created._id).submissionStartedAt, undefined); assert.equal(queued.writes.length, before);
  queued.rows.get(created._id).providerJobId = 'accepted-provider-job';
  assert.deepEqual(await queued.fence(created._id), { allowed: false }); assert.equal(queued.writes.length, before);
  console.log('PASS queued submission denied without re-reservation and accepted provider identity retained');
  let polls = 0; const mutations = [];
  const neverSubmit = () => { throw new Error('Accepted work must not discover, rebuild or submit a new request.'); };
  const worker = h.compile('convex/generationWorker.ts', {
    './_generated/server': { internalAction: value => value }, './_generated/api': { internal: h.api }, 'convex/values': { v }, '../src/lib/ai/video-routing': h.routing,
    './preparationWorker': {}, './generationWorkerContracts': { ...h.contracts, workerEnabled: () => true },
    '../src/lib/ai/model-discovery': { discoverOpenRouterVideoModels: neverSubmit },
    '../src/lib/adapters/openrouter-adapter': { buildVideoGenerationRequest: neverSubmit, generateVideo: neverSubmit, pollVideo: async id => { assert.equal(id, 'accepted-provider-job'); polls++; return { status: 'pending' }; } },
  });
  const accepted = { ...queued.rows.get(created._id), createdAt: Date.now() };
  await worker.run.handler({ runQuery: async () => ({ job: accepted, request: accepted.request }), runMutation: async (ref, args) => {
    mutations.push(ref);
    if (ref === 'generationJobs.claim') return { claimed: true, leaseId: 'lease' };
    assert.equal(ref, 'generationJobs.poll'); assert.equal(args.done, false); return {};
  } }, { jobId: created._id });
  assert.equal(polls, 1); assert.deepEqual(mutations, ['generationJobs.claim', 'generationJobs.poll']);
  console.log('PASS actual accepted worker keeps polling without discovery, submission fence or new reservation');
  console.log('Video-input billing fence: PASS (4 groups). No provider or database calls.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(h.cleanup);
