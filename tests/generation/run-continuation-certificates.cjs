const assert = require('node:assert/strict');
const h = require('./run-operation-controls.cjs');
const model = { ...h.model, reviewedOperations: ['EXTEND'], pricingSkus: { cents_per_second_output_720p: 17, cents_per_second_video_continuation_720p: 41 } };
const previousJobId = 'gen-vid-123-abcdefghijklmnopqrst';
const v = new Proxy({}, { get: () => () => ({}) });
function fixture() {
  const state = h.backendFixture({ operation: 'EXTEND', audioPolicy: 'SILENT', previousJobId }, [], (state, ctx, auth) => h.compile('convex/videoRouting.ts', {
    './_generated/server': { query: value => value, mutation: value => value, action: value => value, internalQuery: value => value, internalMutation: value => value }, './_generated/api': { internal: h.api }, 'convex/values': { v },
    './authorization': { requireProjectRole: auth, requireMember: auth, requireAdmin: auth }, '../src/lib/ai/video-routing': h.routing, './generationWorkerContracts': h.contracts, './generationContinuity': { resolveGenerationContinuity: async (_, args) => ({ referenceAssetIds: args.referenceAssetIds }) },
  }));
  state.rows.set('catalog', { ...model, _id: 'catalog', table: 'videoModelCatalog', studioExternalId: 'studio', lastSeenAt: Date.now(), reviewedAt: Date.now(), reviewedCatalogFingerprint: h.routing.videoCatalogFingerprint(model) });
  state.rows.set('policy', { _id: 'policy', table: 'videoRoutePolicies', studioExternalId: 'studio', videoType: 'SOCIAL_CUTDOWN', qualityTier: 'STANDARD', path: 'AI_VIDEO', preferredModelIds: [model.modelId], maxCostUsd: 10, updatedAt: 1 });
  state.live = () => ({ liveCatalogFingerprint: h.routing.videoCatalogFingerprint(state.rows.get('catalog')), liveCatalogCheckedAt: Date.now() });
  return state;
}
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
async function main() {
  await check('BFL canonical versions invalidate fingerprints while unrelated historical formats stay stable', () => {
    for (const modelId of ['black-forest-labs/flux-3-video','black-forest-labs/flux-video-edit','black-forest-labs/flux-video-upscale']) {
      const original={...model,modelId,canonicalSlug:'reviewed-version-1'};
      assert.notEqual(h.routing.videoCatalogFingerprint(original),h.routing.videoCatalogFingerprint({...original,canonicalSlug:'replacement-version-2'}));
      assert.notEqual(h.routing.videoCatalogFingerprint(original),h.routing.videoCatalogFingerprint({...original,canonicalSlug:undefined}));
    }
    const common={provider:'openrouter',modelId:'other/video',canonicalSlug:'old-version',supportedDurations:[5],supportedResolutions:['720p'],supportedAspectRatios:['16:9'],supportedParameters:[]};
    assert.equal(h.routing.videoCatalogFingerprint(common),'["openrouter","other/video",[5],["720p"],["16:9"],[],[]]');
    const continuation={...common,pricingSkus:{cents_per_second_video_continuation_720p:41}};
    assert.equal(h.routing.videoCatalogFingerprint(continuation),'["openrouter","other/video",[5],["720p"],["16:9"],[],[],[["cents_per_second_video_continuation_720p",41]],"OPENROUTER_CONTINUATION_OUTPUT_SECOND_V1"]');
    assert.equal(h.routing.videoCatalogFingerprint(continuation),h.routing.videoCatalogFingerprint({...continuation,canonicalSlug:'another-version'}));
    const upscale={...common,upscaleFactor:{min:1.5,max:3},creativityLevels:[0,1],pricingSkus:{cents_per_megapixel_second_precise:3.5,cents_per_megapixel_second_creative:5}};
    assert.equal(h.routing.videoCatalogFingerprint(upscale),'["openrouter","other/video",[5],["720p"],["16:9"],[],[],[1.5,3],[0,1],[["cents_per_megapixel_second_creative",5],["cents_per_megapixel_second_precise",3.5]],"FLUX_OUTPUT_MEGAPIXEL_SECOND_V1"]');
  });
  await check('BFL version-only refresh blocks stale review and frozen continuation quote before POST',async()=>{
    const state=fixture(),catalog=state.rows.get('catalog'),modelId='black-forest-labs/flux-3-video';
    Object.assign(catalog,{modelId,canonicalSlug:'reviewed-flux-version-1',supportedDurations:[5]});catalog.reviewedCatalogFingerprint=h.routing.videoCatalogFingerprint(catalog);
    state.rows.get('policy').preferredModelIds=[modelId];state.rows.get('source-job').model=modelId;state.rows.get('source-take').model=modelId;state.rows.get('shot').durationSeconds=5;
    const made=await state.create({model:modelId});const quote=structuredClone(state.rows.get(made._id).request.continuationQuote);catalog.canonicalSlug='replacement-flux-version-2';
    const writes=state.writes.length;await assert.rejects(state.create({model:modelId,idempotencyKey:'new-version-create-request'}));assert.equal(state.writes.length,writes);
    await assert.rejects(state.fence(made._id,state.live()),error=>error.code==='ROUTE_CHANGED');
    catalog.reviewedCatalogFingerprint=h.routing.videoCatalogFingerprint(catalog);
    await assert.rejects(state.fence(made._id,state.live()),error=>error.code==='ROUTE_CHANGED');assert.deepEqual(state.rows.get(made._id).request.continuationQuote,quote);assert.equal(state.rows.get(made._id).submissionStartedAt,undefined);
    state.rows.get(made._id).providerJobId='accepted-before-version-change';assert.equal((await state.fence(made._id,state.live())).allowed,false);
  });
  await check('canonical quote binds approved source provider job/model and newly requested output seconds', async () => {
    const state = fixture(); state.rows.get('video').durationSeconds = 120;
    const result = await state.create({ request: { previousJobId: 'forged', continuationQuote: { costUsd: .01 } } });
    const job = state.rows.get(result._id); const quote = job.request.continuationQuote;
    assert.equal(quote.sourceProviderJobId, previousJobId); assert.equal(quote.sourceModelId, model.modelId); assert.equal(quote.billableDurationSeconds, 4);
    assert.equal(quote.sku, 'cents_per_second_video_continuation_720p'); assert.equal(quote.rateUsdPerSecond, .41); assert.equal(quote.costUsd, 1.64); assert.equal(job.estimatedProviderCostUsd, 1.64);
    assert.equal((await state.fence(result._id, state.live())).allowed, true);
  });
  await check('normal output prices cannot replace a continuation certificate before reservation', async () => {
    const state = fixture(); state.rows.get('catalog').pricingSkus = { cents_per_second_output_720p: 17 };
    state.rows.get('catalog').reviewedCatalogFingerprint = h.routing.videoCatalogFingerprint(state.rows.get('catalog'));
    await assert.rejects(state.create()); assert.equal(state.writes.length, 0);
  });
  await check('fresh fence rejects price, source, quote and accepted-attempt authority changes', async () => {
    for (const change of [state => state.rows.get('catalog').pricingSkus.cents_per_second_video_continuation_720p = 42, state => state.rows.get('source-job').model = 'other', state => state.approval = 'DRAFT', state => state.rows.get('source-take').status = 'FAILED', state => [...state.rows.values()].find(row => row.table === 'generationJobs' && row._id !== 'source-job').request.continuationQuote.sku = 'cents_per_second_output_720p']) {
      const state = fixture(); const result = await state.create(); change(state); await assert.rejects(state.fence(result._id, state.live())); assert.equal(state.rows.get(result._id).submissionStartedAt, undefined);
    }
    for (const patch of [{ liveCatalogFingerprint: undefined }, { liveCatalogFingerprint: 'wrong' }, { liveCatalogCheckedAt: Date.now() - 31_000 }, { liveCatalogCheckedAt: Date.now() + 60_000 }]) { const state = fixture(); const result = await state.create(); await assert.rejects(state.fence(result._id, { ...state.live(), ...patch })); }
    const state = fixture(); const result = await state.create(); await state.fence(result._id, state.live());
    assert.equal((await state.fence(result._id, state.live())).allowed, false, 'already fenced submission cannot purchase again');
  });
  await check('actual continuation worker checks fresh catalog and submits exact completed provider source once', async () => {
    const state = fixture(); const result = await state.create(); const job = state.rows.get(result._id); let posts = 0; let discoveries = 0; let captured;
    const previous = process.env.OPENROUTER_API_KEY; process.env.OPENROUTER_API_KEY = 'fixture-only';
    const worker = h.compile('convex/generationWorker.ts', {
      './_generated/server': { internalAction: value => value }, './_generated/api': { internal: h.api }, 'convex/values': { v }, '../src/lib/ai/video-routing': h.routing, './preparationWorker': {}, './generationWorkerContracts': { ...h.contracts, workerEnabled: () => true },
      '../src/lib/ai/model-discovery': { discoverOpenRouterVideoModels: async options => { discoveries++; assert.equal(options.force, true); return [{ id: model.modelId, ...model, allowedPassthroughParameters: model.supportedParameters }]; } },
      '../src/lib/adapters/openrouter-adapter': { buildVideoGenerationRequest: () => {}, generateVideo: async (input, options) => { captured = input; await options.beforeMediaSubmit(); posts++; return { id: 'accepted', modelUsed: model.modelId }; }, pollVideo: async () => ({ status: 'pending' }) },
    });
    const ctx = { runQuery: async () => ({ job, request: job.request, references: [] }), runMutation: async (ref, args) => ref === 'generationJobs.claim' ? { claimed: true, leaseId: 'lease' } : ref === 'generationJobs.fenceSubmission' ? state.fence(result._id, args) : {} };
    try { await worker.run.handler(ctx, { jobId: result._id }); job.providerJobId = 'accepted'; await worker.run.handler(ctx, { jobId: result._id }); }
    finally { if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous; }
    assert.equal(posts, 1); assert.equal(discoveries, 1); assert.equal(captured.previousJobId, previousJobId); assert.equal(captured.model, model.modelId); assert.equal(captured.duration, 4);
  });
  console.log(`Continuation certificates: PASS (${checks}); actual policy/create/fence/worker with isolated memory only, no database/provider calls.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(h.cleanup);
