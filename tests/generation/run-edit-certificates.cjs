const assert = require('node:assert/strict');
const h = require('./run-operation-controls.cjs');
const modelId = 'black-forest-labs/flux-video-edit';
const model = { ...h.model, modelId, supportedDurations: [], supportedResolutions: [], supportedAspectRatios: [], pricingSkus: { cents_per_second_output: 3 }, reviewedOperations: ['EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE'] };
const source = { ...h.upscaleSource, hasAudio: true };
const request = { videoType: 'SOCIAL_CUTDOWN', task: 'EDIT', operation: 'APPEARANCE_EDIT', audioPolicy: 'KEEP_SOURCE', qualityTier: 'STANDARD', durationSeconds: source.durationSeconds, aspectRatio: '1280:720', hasVideoReference: true, requiresSourceAudioPreservation: true, editSource: source };
const definitions = { query: value => value, mutation: value => value, action: value => value, internalQuery: value => value, internalMutation: value => value };
const v = new Proxy({}, { get: () => () => ({}) });
function fixture(operation = 'APPEARANCE_EDIT') {
  const state = h.backendFixture({ operation, audioPolicy: 'KEEP_SOURCE' }, ['video'], (state, ctx, auth) => h.compile('convex/videoRouting.ts', {
    './_generated/server': definitions, './_generated/api': { internal: h.api }, 'convex/values': { v }, './authorization': { requireProjectRole: auth, requireMember: auth, requireAdmin: auth },
    '../src/lib/ai/video-routing': h.routing, './generationWorkerContracts': h.contracts, './generationContinuity': { resolveGenerationContinuity: async (_, args) => ({ referenceAssetIds: args.referenceAssetIds }) },
  }));
  state.rows.set('catalog', { ...model, _id: 'catalog', table: 'videoModelCatalog', studioExternalId: 'studio', lastSeenAt: Date.now(), reviewedAt: Date.now(), reviewedCatalogFingerprint: h.routing.videoCatalogFingerprint(model) });
  state.rows.set('policy', { _id: 'policy', table: 'videoRoutePolicies', studioExternalId: 'studio', videoType: 'SOCIAL_CUTDOWN', qualityTier: 'STANDARD', path: 'AI_VIDEO', preferredModelIds: [modelId], maxCostUsd: 10, updatedAt: 1 });
  const originalCreate = state.create; state.create = args => originalCreate({ model: modelId, ...args });
  state.certify = (probe = {}) => state.routing.recordEditSourceProbe.handler(state.ctx, { productionId: 'production', shotId: 'shot', assetId: 'video', storageId: 'storage', checksum: state.storage.sha256, byteSize: state.storage.size, probe: { ...source, videoCodec: 'h264', audioCodec: 'aac', ...probe } });
  state.live = () => ({ liveCatalogFingerprint: h.routing.videoCatalogFingerprint(state.rows.get('catalog')), liveCatalogCheckedAt: Date.now() });
  return state;
}
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
async function main() {
  await check('documented edit quote charges complete measured footage and inherits null catalog generation controls', () => {
    assert.equal(h.routing.quoteVideoEdit(model, request).costUsd, .15);
    assert.equal(h.routing.videoModelSupportsRequest(model, request), true);
    assert.equal(h.routing.quoteVideoEdit(model, { ...request, durationSeconds: 1, editSource: { ...source, durationSeconds: 14.1 } }).costUsd, .45);
    for (const operation of model.reviewedOperations) assert.equal(h.routing.selectVideoRoute({ ...request, operation }, [model]).editQuote.version, 'FLUX_SOURCE_VIDEO_EDIT_V1');
  });
  await check('edits reject unsupported masks, audio modes, extra references, output controls and unknown units', () => {
    for (const patch of [{ audioPolicy: 'SILENT' }, { audioPolicy: 'USE_RECORDING' }, { hasAudioReference: true }, { hasImageReferences: true }, { requiresFirstFrame: true }, { resolution: '720p' }, { requiresMask: true }, { requiresAudio: true }, { previousJobId: 'prior' }, { upscaleFactor: 2 }, { editSource: undefined }]) assert.equal(h.routing.videoModelSupportsRequest(model, { ...request, ...patch }), false);
    for (const patch of [{ durationSeconds: 15.01 }, { byteSize: 50 * 1024 * 1024 + 1 }, { checksum: '' }, { width: 0 }]) assert.equal(h.routing.quoteVideoEdit(model, { ...request, editSource: { ...source, ...patch } }), undefined);
    for (const pricingSkus of [{ duration_seconds: .03 }, { cents_per_second_output: 3, unknown_input_charge: .1 }]) assert.equal(h.routing.quoteVideoEdit({ ...model, pricingSkus }, request), undefined);
    assert.equal(h.routing.videoModelSupportsRequest(model, { ...request, maximumCostUsd: .14 }), false);
  });
  await check('public generation uses full trusted source and exposes its actual ceiling rather than shot trim', async () => {
    const action = h.publicActionFixture({ operation: 'OBJECT_REPLACE', audioPolicy: 'KEEP_SOURCE' }, ['video']);
    action.model = { ...model, reviewedAt: 1 }; action.source = { ...source, durationSeconds: 8.1 };
    const result = await action.run(); assert.equal(result.success, true);
    assert.equal(action.mutations[0].args.estimatedProviderCostUsd, .27); assert.equal(action.estimates[0].videoSeconds, 9);
    assert.equal(action.mutations[0].args.request.editQuote.source.durationSeconds, 8.1);
  });
  await check('actual create ignores forged certificates and requires canonical internally measured storage facts', async () => {
    for (const operation of model.reviewedOperations) {
      const state = fixture(operation); await assert.rejects(state.create(), /Measure/); assert.equal(state.writes.length, 0);
      await state.certify(); const result = await state.create({ request: { ratio: '16:9', editSource: { durationSeconds: .1 }, editQuote: { costUsd: .001 } } });
      const job = state.rows.get(result._id); assert.deepEqual(job.request.editSource, source); assert.equal(job.request.duration, source.durationSeconds); assert.equal(job.estimatedProviderCostUsd, .15);
      assert.equal((await state.fence(result._id, state.live())).allowed, true);
    }
  });
  await check('source writes and pre-submit fence reject changed bytes, ownership, probes, pricing and fresh-proof gaps', async () => {
    for (const probe of [{ durationSeconds: 16 }, { byteSize: 999 }, { hasAudio: undefined }]) { const state = fixture(); await assert.rejects(state.certify(probe)); assert.equal(state.writes.length, 0); }
    for (const change of [state => state.storage.sha256 = 'changed', state => state.storage.size++, state => state.rows.get('video').projectId = 'foreign', state => [...state.rows.values()].find(row => row.table === 'verifiedMediaProbes').durationSeconds = 6, state => state.rows.get('catalog').pricingSkus.cents_per_second_output = 4, state => state.rows.get('catalog').platformQuarantinedAt = 0]) {
      const state = fixture(); await state.certify(); const result = await state.create(); change(state); await assert.rejects(state.fence(result._id, state.live()), error => error.code === 'ROUTE_CHANGED'); assert.equal(state.rows.get(result._id).submissionStartedAt, undefined);
    }
    for (const patch of [{ liveCatalogFingerprint: 'wrong' }, { liveCatalogCheckedAt: Date.now() - 31_000 }]) { const state = fixture(); await state.certify(); const result = await state.create(); await assert.rejects(state.fence(result._id, { ...state.live(), ...patch })); }
  });
  await check('actual worker preserves source input, omits generation controls and rechecks live quote before one submit', async () => {
    const state = fixture(); await state.certify(); const result = await state.create(); const job = state.rows.get(result._id); let posts = 0; let captured;
    const previous = process.env.OPENROUTER_API_KEY; process.env.OPENROUTER_API_KEY = 'fixture-only';
    const worker = h.compile('convex/generationWorker.ts', {
      './_generated/server': { internalAction: value => value }, './_generated/api': { internal: h.api }, 'convex/values': { v }, '../src/lib/ai/video-routing': h.routing, './preparationWorker': {}, './generationWorkerContracts': { ...h.contracts, workerEnabled: () => true },
      '../src/lib/ai/model-discovery': { discoverOpenRouterVideoModels: async options => { assert.equal(options.force, true); return [{ id: modelId, ...model, allowedPassthroughParameters: model.supportedParameters }]; } },
      '../src/lib/adapters/openrouter-adapter': { buildVideoGenerationRequest: () => {}, generateVideo: async (input, options) => { captured = input; await options.beforeMediaSubmit(); posts++; return { id: 'accepted', modelUsed: modelId }; }, pollVideo: async () => ({ status: 'pending' }) },
    });
    const ctx = { runQuery: async () => ({ job, request: job.request, references: [{ assetId: 'video', kind: 'video', url: 'https://fixture.convex.cloud/api/storage/video' }] }), runMutation: async (ref, args) => ref === 'generationJobs.claim' ? { claimed: true, leaseId: 'lease' } : ref === 'generationJobs.fenceSubmission' ? state.fence(result._id, args) : {} };
    try { await worker.run.handler(ctx, { jobId: result._id }); } finally { if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous; }
    assert.equal(posts, 1); for (const key of ['duration', 'aspectRatio', 'resolution', 'frameImages']) assert.equal(captured[key], undefined); assert.equal(captured.inputReferences[0].kind, 'video');
  });
  await check('technical checks preserve source timing, ratio and original audio with documented720p output ceiling', () => {
    const input = { ...request, duration: source.durationSeconds, ratio: '1280:720', editQuote: h.routing.quoteVideoEdit(model, request) };
    const valid = { width: 1280, height: 720, durationSeconds: source.durationSeconds, videoCodec: 'h264', hasAudio: true };
    assert.equal(h.contracts.validateMediaProbe(valid, input).hasAudio, true);
    for (const patch of [{ durationSeconds: 6 }, { width: 1920, height: 1080 }, { hasAudio: false }, { width: 720, height: 1280 }]) assert.throws(() => h.contracts.validateMediaProbe({ ...valid, ...patch }, input), /MEDIA_VALIDATION_FAILED/);
  });
  console.log(`Source video edit certificates: PASS (${checks}); actual policy/actions/handlers/worker in isolated memory only, no database/provider/renderer calls.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(h.cleanup);
