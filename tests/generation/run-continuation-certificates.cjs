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
