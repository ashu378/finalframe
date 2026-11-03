const assert = require('node:assert/strict');
const h = require('./run-operation-controls.cjs');
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
const source = { ...h.upscaleSource };
const model = { ...h.model, modelId: h.upscaleModelId, canonicalSlug:'reviewed-upscale-version-1', supportedDurations: [], supportedResolutions: [], supportedAspectRatios: [], upscaleFactor: { min: 1.5, max: 3 }, creativityLevels: [0, 1], pricingSkus: { ...h.upscalePrices }, reviewedOperations: ['UPSCALE'] };
const request = { videoType: 'SOCIAL_CUTDOWN', task: 'EDIT', operation: 'UPSCALE', qualityTier: 'STANDARD', durationSeconds: 4, aspectRatio: '16:9', hasVideoReference: true, upscaleFactor: 2, creativity: 0, upscaleSource: source };
function certifiedFixture() {
  const state = h.backendFixture({ operation: 'UPSCALE', upscaleFactor: 2, creativity: 0 }, ['video'], (state, ctx, auth) => {
    const v = new Proxy({}, { get: () => () => ({}) });
    const definitions = { query: value => value, mutation: value => value, action: value => value, internalQuery: value => value, internalMutation: value => value };
    return h.compile('convex/videoRouting.ts', {
      './_generated/server': definitions, './_generated/api': { internal: h.api }, 'convex/values': { v },
      './authorization': { requireProjectRole: auth, requireMember: auth, requireAdmin: auth },
      '../src/lib/ai/video-routing': h.routing, './generationWorkerContracts': h.contracts,
      './generationContinuity': { resolveGenerationContinuity: async (_, args) => ({ referenceAssetIds: args.referenceAssetIds }) },
    });
  });
  state.rows.set('catalog', { ...model, _id: 'catalog', table: 'videoModelCatalog', studioExternalId: 'studio', lastSeenAt: Date.now(), reviewedAt: Date.now(), reviewedCatalogFingerprint: h.routing.videoCatalogFingerprint(model) });
  state.rows.set('policy', { _id: 'policy', table: 'videoRoutePolicies', studioExternalId: 'studio', videoType: 'SOCIAL_CUTDOWN', qualityTier: 'STANDARD', path: 'AI_VIDEO', preferredModelIds: [h.upscaleModelId], maxCostUsd: 10, updatedAt: 1 });
  state.certify = async (probe = {}) => state.routing.recordUpscaleSourceProbe.handler(state.ctx, { productionId: 'production', shotId: 'shot', assetId: 'video', storageId: 'storage', checksum: state.storage.sha256, byteSize: state.storage.size, probe: { ...source, videoCodec: 'h264', hasAudio: false, ...probe } });
  state.live = () => ({ liveCatalogFingerprint: h.routing.videoCatalogFingerprint(state.rows.get('catalog')), liveCatalogCheckedAt: Date.now() });
  return state;
}
async function main() {
  await check('quote converts cents correctly and covers the full measured source using documented output cap', () => {
    const quote = h.routing.quoteVideoUpscale(model, request);
    assert.equal(quote.billableDurationSeconds, 5); assert.equal(quote.maximumOutputPixels, 13_750_000);
    assert.equal(quote.rateUsdPerMegapixelSecond, .035); assert(quote.costUsd >= 2.40625 && quote.costUsd <= 2.406251);
    assert.equal(h.routing.quoteVideoUpscale(model, { ...request, creativity: 1 }).costUsd, 3.4375);
    const fullSourceCost = h.routing.quoteVideoUpscale(model, { ...request, durationSeconds: 1, upscaleSource: { ...source, durationSeconds: 20 } }).costUsd;
    assert(fullSourceCost >= 9.625 && fullSourceCost <= 9.625001, 'requested shot trim never underprices full source processing');
    assert.equal(h.routing.videoModelSupportsRequest(model, request), true, 'source-derived operation does not invent duration/framing catalog limits');
    assert.equal(h.routing.videoModelSupportsRequest(model, { ...request, maximumCostUsd: 2 }), false);
    assert.equal(h.routing.videoModelSupportsRequest(model, { ...request, resolution: '720p' }), false);
  });
  await check('unknown units, generic fallbacks, changed controls, unmeasured or oversized sources failclosed', () => {
    for (const patch of [{ pricingSkus: { 'per-video-second': .01 }, estimatedCostPerSecond: .01 }, { pricingSkus: { ...h.upscalePrices, unknown_input_cost: 1 } }, { upscaleFactor: { min: 1, max: 4 } }, { creativityLevels: [0] }, { modelId: 'unreviewed/upscale' }]) assert.equal(h.routing.quoteVideoUpscale({ ...model, ...patch }, request), undefined);
    for (const patch of [{ durationSeconds: 20.01 }, { width: 3840, height: 2160 }, { byteSize: 50_000_001 }, { width: NaN }, { checksum: '' }]) assert.equal(h.routing.quoteVideoUpscale(model, { ...request, upscaleSource: { ...source, ...patch } }), undefined);
    assert.equal(h.routing.quoteVideoUpscale(model, { ...request, upscaleSource: undefined }), undefined);
    assert.equal(h.routing.quoteVideoUpscale(model, { ...request, creativity: 2 }), undefined);
  });
  await check('fingerprint includes exact controls/prices and is independent of object property order', () => {
    const original = h.routing.videoCatalogFingerprint(model);
    assert.equal(h.routing.videoCatalogFingerprint({ ...model, upscaleFactor: { max: 3, min: 1.5 }, pricingSkus: { cents_per_megapixel_second_creative: 5, cents_per_megapixel_second_precise: 3.5 } }), original);
    for (const patch of [{ upscaleFactor: { min: 1.5, max: 4 } }, { creativityLevels: [0] }, { pricingSkus: { ...h.upscalePrices, cents_per_megapixel_second_precise: 4 } }]) assert.notEqual(h.routing.videoCatalogFingerprint({ ...model, ...patch }), original);
    const discovery = h.compile('src/lib/ai/model-discovery.ts', { './types': { AICapabilityError: Error } });
    const normalized = discovery.normalizeDiscoveredVideoModel({ id: h.upscaleModelId, supported_durations: null, supported_resolutions: null, supported_aspect_ratios: null, upscale_factor: { min: 1.5, max: 3 }, creativity: [0, 1], pricing_skus: h.upscalePrices });
    assert.deepEqual(normalized.upscaleFactor, { min: 1.5, max: 3 }); assert.deepEqual(normalized.creativityLevels, [0, 1]); assert.deepEqual(normalized.supportedDurations, []);
    assert.equal(discovery.normalizeDiscoveredVideoModel({ id: h.upscaleModelId, upscale_factor: { min: 1.5, max: 3 }, creativity: [0, 1], pricing_skus: { ...h.upscalePrices, unknown_input_charge: 'unbounded' } }), null, 'unknown input billing cannot disappear during normalization');
    assert.equal(discovery.normalizeDiscoveredVideoModel({ id: h.upscaleModelId, upscale_factor: { min: 1.5, max: 3 }, creativity: [0, 1, 'unknown'], pricing_skus: h.upscalePrices }), null);
  });
  await check('forced submission-time discovery cannot reuse an older in-flight catalog request', async () => {
    const discovery = h.compile('src/lib/ai/model-discovery.ts', { './types': { AICapabilityError: Error } });
    let release; let calls = 0;
    const old = discovery.discoverOpenRouterVideoModels({ baseUrl: 'https://catalog.fixture', fetch: async () => { calls++; await new Promise(resolve => { release = resolve; }); return new Response(JSON.stringify({ data: [{ id: 'old/model' }] })); } });
    const fresh = await discovery.discoverOpenRouterVideoModels({ baseUrl: 'https://catalog.fixture', force: true, staleIfError: false, fetch: async () => { calls++; return new Response(JSON.stringify({ data: [{ id: 'current/model' }] })); } });
    assert.equal(fresh[0].id, 'current/model'); assert.equal(calls, 2); release(); await old;
  });
  await check('version-only change revokes upscale review and invalidates an older quote even after re-review',async()=>{
    const state=certifiedFixture();await state.certify();const made=await state.create();const catalog=state.rows.get('catalog');const quote=structuredClone(state.rows.get(made._id).request.upscaleQuote);catalog.canonicalSlug='replacement-upscale-version-2';
    const writes=state.writes.length;await assert.rejects(state.create({idempotencyKey:'new-upscale-version-request'}));assert.equal(state.writes.length,writes);
    await assert.rejects(state.fence(made._id,state.live()),error=>error.code==='ROUTE_CHANGED');catalog.reviewedCatalogFingerprint=h.routing.videoCatalogFingerprint(catalog);
    await assert.rejects(state.fence(made._id,state.live()),error=>error.code==='ROUTE_CHANGED');assert.deepEqual(state.rows.get(made._id).request.upscaleQuote,quote);assert.equal(state.rows.get(made._id).submissionStartedAt,undefined);
    state.rows.get(made._id).providerJobId='accepted-before-version-change';assert.equal((await state.fence(made._id,state.live())).allowed,false);
  });
  await check('canonical creation refuses forged asset metadata without an internal measured certificate', async () => {
    const state = certifiedFixture();
    state.rows.get('video').metadata = { technicalProbe: { width: 1280, height: 720, durationSeconds: .1 }, technicalStatus: 'PASS' };
    await assert.rejects(state.create(), /Measure the current stored video/); assert.equal(state.writes.length, 0);
    await state.certify();
    const result = await state.create({ request: { ratio: '16:9', upscaleSource: { ...source, width: 1, height: 1, durationSeconds: .1 }, upscaleQuote: { costUsd: .001 } } });
    const job = state.rows.get(result._id);
    assert.deepEqual(job.request.upscaleSource, source); assert.equal(job.request.duration, 4.04);
    assert(job.estimatedProviderCostUsd >= 2.40625 && job.estimatedProviderCostUsd <= 2.406251); assert.equal(job.request.upscaleQuote.costUsd, job.estimatedProviderCostUsd);
    assert.equal((await state.fence(result._id, state.live())).allowed, true);
  });
  await check('probe writer binds measured bytes to current project/asset/storage and rejects mismatches', async () => {
    for (const mutate of [state => { state.storage.sha256 = 'changed'; }, state => { state.rows.get('video').projectId = 'foreign'; }, state => { state.rows.get('video').deletedAt = 1; }]) {
      const state = certifiedFixture(); mutate(state);
      await assert.rejects(state.certify({ checksum: 'storage-checksum', byteSize: 999 }), /changed|stored project|source|limits/);
      assert.equal(state.writes.length, 0);
    }
    const state = certifiedFixture(); await assert.rejects(state.certify({ durationSeconds: 21 }), /limits/); assert.equal(state.writes.length, 0);
  });
  await check('authenticated no-inference action probes the canonical URL and caches only internally written measurements', async () => {
    const state = certifiedFixture();
    let calls = 0;
    const previousFetch = global.fetch; const previousUrl = process.env.RENDER_WORKER_URL; const previousSecret = process.env.RENDER_WORKER_SHARED_SECRET;
    process.env.RENDER_WORKER_URL = 'https://renderer.fixture'; process.env.RENDER_WORKER_SHARED_SECRET = 'fixture-secret';
    state.ctx.runQuery = async (_, args) => state.routing.upscaleSourceContext.handler(state.ctx, args);
    state.ctx.runMutation = async (_, args) => state.routing.recordUpscaleSourceProbe.handler(state.ctx, args);
    global.fetch = async (url, init) => { calls++; assert.equal(url, 'https://renderer.fixture/media/probe'); assert.equal(JSON.parse(init.body).url, 'https://fixture.convex.cloud/api/storage/video'); assert.equal(init.redirect, 'error'); return new Response(JSON.stringify({ ...source, videoCodec: 'h264', hasAudio: false }), { headers: { 'content-type': 'application/json' } }); };
    try {
      const args = { productionId: 'production', shotId: 'shot' };
      assert.deepEqual(await state.routing.prepareUpscaleSource.handler(state.ctx, args), source);
      assert.deepEqual(await state.routing.prepareUpscaleSource.handler(state.ctx, args), source); assert.equal(calls, 1);
    } finally { global.fetch = previousFetch; if (previousUrl === undefined) delete process.env.RENDER_WORKER_URL; else process.env.RENDER_WORKER_URL = previousUrl; if (previousSecret === undefined) delete process.env.RENDER_WORKER_SHARED_SECRET; else process.env.RENDER_WORKER_SHARED_SECRET = previousSecret; }
  });
  await check('platform quarantine overrides studio availability at discovery, creation and submission fence', async () => {
    const before = certifiedFixture(); await before.certify(); before.rows.get('catalog').platformQuarantinedAt = 0;
    const visible = await before.routing.forGeneration.handler(before.ctx, { studioExternalId: 'studio', videoType: 'SOCIAL_CUTDOWN', qualityTier: 'STANDARD' });
    assert.equal(visible.catalog[0].available, false);
    const writes = before.writes.length;
    await assert.rejects(before.create(), /supports all|reviewed video route/); assert.equal(before.writes.length, writes);
    const queued = certifiedFixture(); await queued.certify(); const result = await queued.create(); queued.rows.get('catalog').platformQuarantinedAt = Date.now(); queued.rows.get('catalog').available = true;
    await assert.rejects(queued.fence(result._id, queued.live()), error => error.code === 'ROUTE_CHANGED'); assert.equal(queued.rows.get(result._id).submissionStartedAt, undefined);
  });
  await check('submission fence rejects changed storage, measured facts, catalog, prices, mode or stale live proof', async () => {
    const changes = [state => { state.storage.sha256 = 'changed'; }, state => { state.storage.size++; }, state => { state.rows.get('video').storageId = 'other'; }, state => { [...state.rows.values()].find(row => row.table === 'verifiedMediaProbes').width = 640; }, state => { state.rows.get('catalog').upscaleFactor = { min: 1.5, max: 4 }; }, state => { state.rows.get('catalog').pricingSkus = { ...h.upscalePrices, cents_per_megapixel_second_precise: 4 }; }, state => { [...state.rows.values()].find(row => row.table === 'generationJobs' && row._id !== 'source-job').request.creativity = 1; }];
    for (const change of changes) {
      const state = certifiedFixture(); await state.certify(); const result = await state.create(); change(state);
      await assert.rejects(state.fence(result._id, state.live()), error => error.code === 'ROUTE_CHANGED'); assert.equal(state.rows.get(result._id).submissionStartedAt, undefined);
    }
    for (const proof of [{}, { liveCatalogFingerprint: 'invented', liveCatalogCheckedAt: Date.now() }, { liveCatalogCheckedAt: Date.now() - 31_000 }, { liveCatalogCheckedAt: Date.now() + 60_000 }]) {
      const state = certifiedFixture(); await state.certify(); const result = await state.create();
      await assert.rejects(state.fence(result._id, { ...state.live(), ...proof, ...(Object.keys(proof).length ? {} : { liveCatalogFingerprint: undefined }) }), error => error.code === 'ROUTE_CHANGED'); assert.equal(state.rows.get(result._id).submissionStartedAt, undefined);
    }
  });
  await check('actual worker omits unsupported generation controls and supplies fresh live proof before one submission', async () => {
    const state = certifiedFixture(); await state.certify(); const result = await state.create(); const job = state.rows.get(result._id);
    let posts = 0; let captured; let liveProof;
    const previousKey = process.env.OPENROUTER_API_KEY; process.env.OPENROUTER_API_KEY = 'fixture-only';
    const v = new Proxy({}, { get: () => () => ({}) });
    const worker = h.compile('convex/generationWorker.ts', {
      './_generated/server': { internalAction: value => value }, './_generated/api': { internal: h.api }, 'convex/values': { v },
      '../src/lib/ai/model-discovery': { discoverOpenRouterVideoModels: async options => { assert.equal(options.force, true); assert.equal(options.staleIfError, false); return [{ id: model.modelId, ...model, allowedPassthroughParameters: model.supportedParameters }]; } },
      '../src/lib/ai/video-routing': h.routing, './preparationWorker': {}, './generationWorkerContracts': { ...h.contracts, workerEnabled: () => true },
      '../src/lib/adapters/openrouter-adapter': { buildVideoGenerationRequest: () => {}, generateVideo: async (input, options) => { captured = input; await options.beforeMediaSubmit(); posts++; return { id: 'accepted', modelUsed: model.modelId }; }, pollVideo: async () => ({ status: 'pending' }) },
    });
    const ctx = { runQuery: async () => ({ job, request: job.request, references: [{ assetId: 'video', kind: 'video', url: 'https://fixture.convex.cloud/api/storage/video' }] }), runMutation: async (ref, args) => { if (ref === 'generationJobs.claim') return { claimed: true, leaseId: 'lease' }; if (ref === 'generationJobs.fenceSubmission') { liveProof = args; return state.fence(result._id, args); } return {}; } };
    try { await worker.run.handler(ctx, { jobId: result._id }); } finally { if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey; }
    assert.equal(posts, 1); for (const parameter of ['duration', 'aspectRatio', 'resolution', 'frameImages']) assert.equal(captured[parameter], undefined);
    assert.equal(captured.upscaleFactor, 2); assert.equal(captured.creativity, 0); assert.equal(liveProof.liveCatalogFingerprint, job.request.upscaleQuote.catalogFingerprint);
  });
  await check('technical output checks require real enlargement and bound factor, duration and output cap', () => {
    const quote = h.routing.quoteVideoUpscale(model, request);
    const input = { operation: 'UPSCALE', ratio: '1280:720', duration: 4.04, upscaleSource: source, upscaleFactor: 2, upscaleQuote: quote };
    const valid = { width: 2560, height: 1440, durationSeconds: 4.04, videoCodec: 'h264', hasAudio: false };
    assert.equal(h.contracts.validateMediaProbe(valid, input).width, 2560);
    for (const patch of [{ width: 1280, height: 720 }, { width: 3840, height: 2160 }, { width: 5120, height: 2880 }, { durationSeconds: 6 }]) assert.throws(() => h.contracts.validateMediaProbe({ ...valid, ...patch }, input), /MEDIA_VALIDATION_FAILED/);
  });
  console.log('Upscale certification: PASS (' + checks + '); actual policy/actions/mutations/worker using in-memory or injected HTTP seams only. No database or provider calls.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(h.cleanup);
