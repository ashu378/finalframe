const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-operation-controls-'));
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
function compile(relative, imports = {}) {
  const filename = path.join(temp, relative.replaceAll('/', '-') + '.cjs');
  const result = new Module(filename, module);
  result.filename = filename;
  result.require = name => { if (Object.hasOwn(imports, name)) return imports[name]; throw new Error('Unexpected dependency: ' + name); };
  result._compile(ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: relative }).outputText, filename);
  return result.exports;
}
const controls = compile('src/lib/production/workspace-controls.ts');
const routing = compile('src/lib/ai/video-routing.ts');
const contracts = compile('convex/generationWorkerContracts.ts');
const api = new Proxy({}, { get: (_, module) => new Proxy({}, { get: (_, fn) => String(module) + '.' + String(fn) }) });
const providerJobId = 'gen-vid-123-abcdefghijklmnopqrst';
const previousJobId = providerJobId;
const model = {
  provider: 'openrouter', modelId: 'test/reviewed', available: true, reviewedAt: 1,
  supportsTextToVideo: true, supportsImageReferences: true, supportsVideoReferences: true,
  supportsFirstFrame: true, supportsLastFrame: true, supportsVideoEdit: true,
  supportsVideoExtension: true, supportsAudio: true, supportsAudioReferences: true,
  supportsLipSync: true, supportsUpscale: true, supportsSourceAudioPreservation: true,
  reviewedOperations: ['EDIT', 'LIP_SYNC', 'EXTEND', 'UPSCALE'], supportedDurations: [4],
  supportedResolutions: ['720p'], supportedAspectRatios: ['16:9'], supportedParameters: [],
  pricingSkus: { cents_per_second_output: 1, cents_per_second_video_continuation_720p: 1 },
};
const upscaleModelId = 'black-forest-labs/flux-video-upscale';
const upscaleSource = { assetId: 'video', storageId: 'storage', checksum: 'storage-checksum', byteSize: 512, width: 1280, height: 720, durationSeconds: 4.04 };
const upscalePrices = { cents_per_megapixel_second_precise: 3.5, cents_per_megapixel_second_creative: 5 };
const baseControls = { operation: 'GENERATE', audioPolicy: 'SILENT', referenceAssetIds: [], firstFrameAssetId: '', lastFrameAssetId: '' };
const assets = [{ id: 'image', mimeType: 'image/png' }, { id: 'video', mimeType: 'video/mp4' }, { id: 'audio', mimeType: 'audio/wav' }];
function publicActionFixture(metadata, references = []) {
  const fixture = { mutations: [], estimates: [], routingEnabled: true, model: { ...model }, source: { ...upscaleSource }, rawCatalog: { upscale_factor: { min: 1.5, max: 3 }, creativity: [0, 1] } };
  if (metadata.operation === 'UPSCALE') fixture.model = { ...fixture.model, modelId: upscaleModelId, pricingSkus: { ...upscalePrices }, upscaleFactor: { min: 1.5, max: 3 }, creativityLevels: [0, 1] };
  const client = {
    action: async () => ({ ...fixture.source }),
    query: async ref => {
      if (ref === 'account.current') return { user: { id: 'user' } };
      if (ref === 'generation.getShot') return { production: { projectId: 'project', studioExternalId: 'studio', outputPreset: 'LANDSCAPE' }, project: { projectType: 'REALISTIC_SKIT_UGC' }, shot: { prompt: 'Continue the action', durationSeconds: 4, metadata }, referenceAssets: references.map(id => ({ assetId: id, mimeType: assets.find(asset => asset.id === id).mimeType })), hasAudioReference: references.includes('audio'), audioAssetIds: references.includes('audio') ? ['audio'] : [] };
      if (ref === 'videoRouting.forGeneration') return { catalog: [fixture.model], policy: { path: 'AI_VIDEO', preferredModelIds: [fixture.model.modelId], maxCostUsd: 10, updatedAt: 1 } };
      throw new Error('Unexpected query ' + ref);
    },
    mutation: async (ref, args) => { fixture.mutations.push({ ref, args }); return { _id: 'job' }; },
  };
  fixture.actions = compile('src/lib/generation/actions.ts', {
    '../../../convex/_generated/api': { api }, '@/lib/convex/server': { getAuthenticatedConvexClient: async () => client },
    '@/lib/ai/capabilities': { assertCapability: () => ({ provider: 'openrouter', model: 'test/reviewed' }) },
    '@/lib/credits/service': { estimateProductionCost: async input => { fixture.estimates.push(input); return { totalCredits: 1 }; } },
    '@/lib/ai/video-routing': routing, '@/lib/config/feature-flags': { isFeatureEnabled: () => fixture.routingEnabled },
    '@/lib/ai/model-discovery': { discoverOpenRouterVideoModels: async () => [{ id: fixture.model.modelId, upscaleFactor: fixture.rawCatalog.upscale_factor, creativityLevels: fixture.rawCatalog.creativity, supportedDurations: fixture.model.supportedDurations, supportedResolutions: fixture.model.supportedResolutions, supportedAspectRatios: fixture.model.supportedAspectRatios, supportedSizes: ['1280x720'], pricingSkus: fixture.model.pricingSkus, allowedPassthroughParameters: [], raw: fixture.rawCatalog }] },
    '@/lib/production/workspace-controls': controls,
  });
  fixture.run = () => fixture.actions.createShotGenerationJob({ productionId: 'production', shotId: 'shot', requestId: 'operation-contract-00001' });
  return fixture;
}
function workspaceActionFixture() {
  const fixture = { mutations: [] };
  const client = {
    query: async ref => {
      if (ref === 'projects.getByExternalId') return { _id: 'project' };
      if (ref === 'scenes.getShot') return { _id: 'shot', projectId: 'project', productionId: 'production', metadata: { previousJobId: 'obsolete', upscaleFactor: 3, creativity: 1 } };
      if (ref === 'assetStorage.listProjectAssets') return assets.map(asset => ({ _id: asset.id, mimeType: asset.mimeType }));
      if (ref === 'generationJobs.list') return [{ _id: 'source-job', projectId: 'project', productionId: 'production', provider: 'openrouter', modality: 'VIDEO', operation: 'SHOT_GENERATION', providerJobId, model: 'test/reviewed', shotVersionId: 'source-take', assetId: 'video' }];
      if (ref === 'approvals.get') return { currentState: 'APPROVED', resource: { projectId: 'project', productionId: 'production', provider: 'openrouter', model: 'test/reviewed', status: 'COMPLETED', assetId: 'video', versionNumber: 1 } };
      throw new Error('Unexpected workspace query ' + ref);
    },
    mutation: async (ref, args) => { fixture.mutations.push({ ref, args }); return {}; },
  };
  const actions = compile('src/lib/production/workspace-actions.ts', { 'next/cache': { revalidatePath: () => {} }, '../../../convex/_generated/api': { api }, '@/lib/convex/server': { getAuthenticatedConvexClient: async () => client }, './workspace-controls': controls });
  fixture.save = selected => actions.saveShotOperationControls({ projectExternalId: 'project-external', productionId: 'production', shotId: 'shot', controls: selected });
  return fixture;
}
function backendFixture(metadata, referenceAssetIds = [], routingFactory) {
  const state = { approval: 'APPROVED', routeChecks: [], writes: [], schedules: [], rows: new Map(), counter: 0 };
  const row = (table, value) => state.rows.set(value._id, { ...value, table });
  row('projects', { _id: 'project', studioExternalId: 'studio', ownerUserId: 'user' });
  row('users', { _id: 'user', status: 'active' });
  row('productions', { _id: 'production', projectId: 'project', studioExternalId: 'studio', currentVersionId: 'version' });
  row('productionVersions', { _id: 'version', productionId: 'production', status: 'APPROVED' });
  row('shots', { _id: 'shot', projectId: 'project', productionId: 'production', productionVersionId: 'version', sceneId: 'scene', prompt: 'Continue', durationSeconds: 4, requiredAssetIds: referenceAssetIds, metadata });
  row('scenes', { _id: 'scene', productionId: 'production', sequenceId: 'sequence' });
  for (const asset of assets) row('assets', { _id: asset.id, projectId: 'project', productionId: 'production', scope: 'PROJECT', storageId: 'storage', mimeType: asset.mimeType });
  row('generationJobs', { _id: 'source-job', projectId: 'project', productionId: 'production', provider: 'openrouter', providerJobId, model: 'test/reviewed', status: 'COMPLETED', operation: 'SHOT_GENERATION', modality: 'VIDEO', shotVersionId: 'source-take', shotId: 'source-shot', response: { assetId: 'video' } });
  row('shotVersions', { _id: 'source-take', projectId: 'project', productionId: 'production', shotId: 'source-shot', provider: 'openrouter', model: 'test/reviewed', status: 'COMPLETED', assetId: 'video', versionNumber: 1 });
  state.storage = { sha256: 'storage-checksum', size: 512, contentType: 'video/mp4' };
  const ctx = { storage: { getUrl: async () => 'https://fixture.convex.cloud/api/storage/video' }, db: {
    system: { get: async () => state.storage },
    get: async id => state.rows.get(id) || null,
    normalizeId: (_, id) => id,
    query: table => {
      const filters = [];
      const chain = { withIndex: (_, cb) => { const q = { eq: (key, value) => { filters.push([key, value]); return q; } }; cb(q); return chain; }, order: () => chain, first: async () => matches()[0] || null, unique: async () => matches()[0] || null, take: async n => matches().slice(0, n) };
      const matches = () => [...state.rows.values()].filter(item => item.table === table && filters.every(([key, value]) => item[key] === value));
      return chain;
    },
    insert: async (table, value) => { const id = table + (++state.counter); row(table, { ...value, _id: id }); state.writes.push({ table, value }); return id; },
    patch: async (id, patch) => { state.rows.set(id, { ...state.rows.get(id), ...patch }); state.writes.push({ id, patch }); },
  }, scheduler: { runAfter: async (...args) => state.schedules.push(args) } };
  const v = new Proxy({}, { get: () => () => ({}) });
  const auth = async () => ({ project: state.rows.get('project'), user: state.rows.get('user') });
  const jobs = compile('convex/generationJobs.ts', {
    './_generated/api': { internal: { generationWorker: { run: 'run' } } },
    './_generated/server': { query: value => value, mutation: value => value, internalQuery: value => value, internalMutation: value => value },
    'convex/values': { v }, './authorization': { requireProjectAccess: auth, requireProjectRole: auth },
    './resourceStates': { ensureResourceState: async () => {}, getEffectiveResourceState: async (_, projectId, type, id) => ({ currentState: id === 'source-take' ? state.approval : 'DRAFT' }) },
    './financial': { estimateGenerationCredits: () => 1, reserveGenerationCreditsInTransaction: async () => ({ reservationId: 'credit-hold' }) },
    './providerBudget': { reserveProviderBudget: async (_, args) => { row('providerBudgets', { _id: 'budget', status: 'ACTIVE', allowedStudioExternalIds: ['studio'] }); row('providerBudgetReservations', { _id: 'hold', jobId: args.jobId, budgetId: 'budget', status: 'RESERVED', estimatedMicros: Math.ceil(args.estimatedCostUsd * 1e6) }); return 'hold'; } },
    './videoRouting': routingFactory ? (state.routing = routingFactory(state, ctx, auth)) : { resolveUpscaleSourceCertificate: async () => ({ ...upscaleSource }), validateReviewedVideoJob: async (_, args) => { state.routeChecks.push(args.request); return { estimatedCostUsd: .04, selection: { provider: 'openrouter', modelId: args.modelId, path: 'AI_VIDEO', resolution: args.request.operation === 'UPSCALE' ? undefined : '720p', routeReason: 'Test-reviewed', policyVersion: 1, ...(args.request.operation === 'EXTEND' ? { continuationQuote: routing.quoteVideoContinuation(model, args.request) } : {}), ...(args.request.operation === 'UPSCALE' ? { upscaleQuote: routing.quoteVideoUpscale({ ...model, modelId: upscaleModelId, upscaleFactor: { min: 1.5, max: 3 }, creativityLevels: [0, 1], pricingSkus: upscalePrices }, { ...args.request, upscaleSource }) } : {}) } }; } },
    './generationContinuity': { resolveGenerationContinuity: async (_, args) => ({ referenceAssetIds: args.referenceAssetIds, selectedResourceVersionIds: [], voiceIds: [], planningContextSnapshot: null }) },
    './voices': {}, '../src/lib/ai/preparation': {}, '../src/lib/production/workspace-controls': controls, '../src/lib/ai/video-routing': routing,
    './generationWorkerContracts': { ...contracts, workerEnabled: () => true },
  });
  state.create = async (overrides = {}) => jobs.create.handler(ctx, { productionId: 'production', shotId: 'shot', provider: 'openrouter', model: metadata.operation === 'UPSCALE' ? upscaleModelId : 'test/reviewed', request: { ratio: '16:9', previousModelId: 'invented/model', upscaleFactor: 99, creativity: 99 }, estimatedCost: 1, idempotencyKey: 'operation-contract-00001', ...overrides });
  state.ctx = ctx; state.jobs = jobs;
  state.fence = async (id, extra = {}) => { state.rows.set(id, { ...state.rows.get(id), leaseId: 'lease', leaseExpiresAt: Date.now() + 60_000 }); return jobs.fenceSubmission.handler(ctx, { jobId: id, leaseId: 'lease', ...(state.rows.get(id).request?.continuationQuote ? { liveCatalogFingerprint: state.rows.get(id).request.continuationQuote.catalogFingerprint, liveCatalogCheckedAt: Date.now() } : {}), ...extra }); };
  return state;
}
async function main() {
  await check('authoring requires a selected approved history source and validates upscale controls', () => {
    assert.throws(() => controls.validateShotOperationControls({ ...baseControls, operation: 'EXTEND', previousJobId }, assets), /approved completed/);
    assert.deepEqual(controls.validateShotOperationControls({ ...baseControls, operation: 'EXTEND', previousJobId }, assets, [{ providerJobId, model: 'test/reviewed' }]), []);
    for (const factor of [undefined, NaN, Infinity, 1, 3.1]) assert.throws(() => controls.validateShotOperationControls({ ...baseControls, operation: 'UPSCALE', referenceAssetIds: ['video'], upscaleFactor: factor, upscaleMode: 'PRECISE' }, assets), /factor/);
    assert.deepEqual(controls.validateShotOperationControls({ ...baseControls, operation: 'UPSCALE', referenceAssetIds: ['video'], upscaleFactor: 2, upscaleMode: 'CREATIVE' }, assets), ['video']);
    assert.equal(controls.supportsCatalogUpscaleControls({ upscale_factor: { min: 1.5, max: 3 }, creativity: [0, 1] }, 2, 1), true);
    for (const catalog of [{}, { upscale_factor: { min: 1.5, max: 3 } }, { upscale_factor: { min: 1.5, max: 3 }, creativity: [0] }]) assert.equal(controls.supportsCatalogUpscaleControls(catalog, 2, 1), false);
  });
  await check('actual workspace save binds canonical history and maps upscale mode while clearing stale controls', async () => {
    const fixture = workspaceActionFixture();
    assert.equal((await fixture.save({ ...baseControls, operation: 'EXTEND', previousJobId, previousModelId: 'invented/model' })).success, true);
    assert.equal(fixture.mutations[0].args.metadata.previousModelId, 'test/reviewed');
    assert.equal(fixture.mutations[0].args.metadata.upscaleFactor, null);
    assert.equal((await fixture.save({ ...baseControls, operation: 'UPSCALE', referenceAssetIds: ['video'], upscaleFactor: 2.5, upscaleMode: 'CREATIVE' })).success, true);
    assert.equal(fixture.mutations[1].args.metadata.upscaleFactor, 2.5); assert.equal(fixture.mutations[1].args.metadata.creativity, 1);
    assert.equal(fixture.mutations[1].args.metadata.previousJobId, null); assert.equal(fixture.mutations[1].args.metadata.previousModelId, null);
    const forged = workspaceActionFixture();
    assert.equal((await forged.save({ ...baseControls, operation: 'EXTEND', previousJobId: 'gen-vid-123-xxxxxxxxxxxxxxxxxxxx' })).success, false);
    assert.equal(forged.mutations.length, 0);
  });
  await check('portrait plus recording passes input validation without source video but uncertified lip-sync cannot queue', async () => {
    const fixture = publicActionFixture({ operation: 'LIP_SYNC', videoTask: 'EDIT', audioPolicy: 'USE_RECORDING' }, ['image', 'audio']);
    assert.doesNotThrow(() => controls.validateVideoOperationRequirements({ operation: 'LIP_SYNC', audioPolicy: 'USE_RECORDING', hasVideoReference: false, hasImageReferences: true, hasAudioReference: true }));
    assert.equal((await fixture.run()).success, false); assert.equal(fixture.mutations.length, 0);
    for (const refs of [['image'], ['audio']]) { const invalid = publicActionFixture({ operation: 'LIP_SYNC', audioPolicy: 'USE_RECORDING' }, refs); assert.equal((await invalid.run()).success, false); assert.equal(invalid.mutations.length, 0); }
  });
  await check('actual public continuation stays pinned to its selected completed model without redundant video input', async () => {
    const fixture = publicActionFixture({ operation: 'EXTEND', audioPolicy: 'SILENT', previousJobId, previousModelId: 'test/reviewed' });
    assert.equal((await fixture.run()).success, true);
    assert.equal(fixture.mutations[0].args.request.previousJobId, providerJobId);
    const invalid = publicActionFixture({ operation: 'EXTEND', audioPolicy: 'SILENT', previousJobId, previousModelId: 'other/model' });
    assert.equal((await invalid.run()).success, false); assert.equal(invalid.mutations.length, 0);
  });
  await check('actual public upscale preserves factor and mode; absent catalog controls or pricing cannot queue', async () => {
    const metadata = { operation: 'UPSCALE', audioPolicy: 'SILENT', upscaleFactor: 2.5, creativity: 1 };
    const fixture = publicActionFixture(metadata, ['video']);
    assert.equal((await fixture.run()).success, true);
    assert.equal(fixture.mutations[0].args.request.upscaleFactor, 2.5); assert.equal(fixture.mutations[0].args.request.creativity, 1);
    assert.equal(fixture.estimates[0].videoSeconds, Math.ceil(upscaleSource.durationSeconds), 'displayed credits cover the complete certified source rather than shot trim');
    const missing = publicActionFixture(metadata, ['video']); missing.rawCatalog = {};
    assert.equal((await missing.run()).success, false); assert.equal(missing.mutations.length, 0);
    const unpriced = publicActionFixture(metadata, ['video']); unpriced.model.pricingSkus = { cents_per_megapixel_second_precise: .035 };
    assert.equal((await unpriced.run()).success, false); assert.equal(unpriced.mutations.length, 0);
  });
  await check('advanced operations keep audited routing and undocumented masks failclosed', async () => {
    const fixture = publicActionFixture({ operation: 'EXTEND', audioPolicy: 'SILENT', previousJobId, previousModelId: 'test/reviewed' }); fixture.routingEnabled = false;
    assert.equal((await fixture.run()).success, false); assert.equal(fixture.mutations.length, 0);
    const mask = publicActionFixture({ operation: 'EDIT', audioPolicy: 'SILENT', requiresMask: true }, ['video']);
    assert.equal((await mask.run()).success, false); assert.equal(mask.mutations.length, 0);
  });
  await check('canonical creation derives continuation model from saved source and preserves upscale settings', async () => {
    const fixture = backendFixture({ operation: 'EXTEND', previousJobId, previousModelId: 'invented/model' });
    const result = await fixture.create();
    assert.equal(fixture.rows.get(result._id).request.previousModelId, 'test/reviewed');
    assert.equal((await fixture.fence(result._id)).allowed, true);
    const upscale = backendFixture({ operation: 'UPSCALE', upscaleFactor: 2.5, creativity: 1 }, ['video']);
    const upscaled = await upscale.create();
    assert.equal(upscale.rows.get(upscaled._id).request.upscaleFactor, 2.5); assert.equal(upscale.rows.get(upscaled._id).request.creativity, 1);
    assert.equal(upscale.routeChecks[0].upscaleFactor, 2.5);
    const accepted = backendFixture({ operation: 'EXTEND', previousJobId });
    const alreadySubmitted = await accepted.create();
    accepted.rows.get(alreadySubmitted._id).providerJobId = 'accepted-provider-job'; accepted.approval = 'REVISION_REQUESTED';
    assert.deepEqual(await accepted.fence(alreadySubmitted._id), { allowed: false }, 'an accepted job never receives another submission fence');
  });
  await check('canonical continuation rejects foreign production/project/model, unfinished or unapproved source before writes', async () => {
    for (const patch of [{ productionId: 'other-production' }, { projectId: 'other-project' }, { model: 'other/model' }, { status: 'PROCESSING' }, { modality: 'AUDIO' }]) {
      const fixture = backendFixture({ operation: 'EXTEND', previousJobId });
      Object.assign(fixture.rows.get('source-job'), patch);
      await assert.rejects(fixture.create(), /Continuation/); assert.equal(fixture.writes.length, 0);
    }
    const unapproved = backendFixture({ operation: 'EXTEND', previousJobId }); unapproved.approval = 'DRAFT';
    await assert.rejects(unapproved.create(), /Approve/); assert.equal(unapproved.writes.length, 0);
    const deleted = backendFixture({ operation: 'EXTEND', previousJobId }); deleted.rows.get('video').deletedAt = 1;
    await assert.rejects(deleted.create(), /unavailable/); assert.equal(deleted.writes.length, 0);
    const forged = backendFixture({ operation: 'EXTEND', previousJobId }); forged.rows.get('source-take').assetId = 'image';
    await assert.rejects(forged.create(), /take is unavailable/); assert.equal(forged.writes.length, 0);
  });
  await check('submission fence rechecks continuation approval and relationships without starting another submission', async () => {
    for (const change of [state => { state.approval = 'REVISION_REQUESTED'; }, state => { state.rows.get('source-job').productionId = 'foreign'; }, state => { state.rows.get('video').deletedAt = 1; }]) {
      const fixture = backendFixture({ operation: 'EXTEND', previousJobId });
      const created = await fixture.create(); change(fixture);
      await assert.rejects(fixture.fence(created._id), error => error.code === 'ROUTE_CHANGED');
      assert.equal(fixture.rows.get(created._id).submissionStartedAt, undefined);
    }
  });
  console.log('Operation control contracts: PASS (' + checks + '); actual application actions and Convex handlers with isolated in-memory seams. No database or provider calls.');
}
module.exports = { compile, controls, routing, contracts, backendFixture, publicActionFixture, api, upscaleModelId, upscaleSource, upscalePrices, model, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(module.exports.cleanup);
