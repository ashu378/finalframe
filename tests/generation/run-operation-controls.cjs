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
  result.require = name => { if (Object.hasOwn(imports, name)) return imports[name]; if(name.endsWith('/ai/model-registry'))return registry;if(name.endsWith('/ai/video-reference-contracts'))return motionReferences;if(name.endsWith('/renderer/src/media/source-audio-contract'))return sourceAudioContract;if(name.endsWith('/production/workspace-controls'))return controls;if(name==='./resourceStates')return {requireApprovedResource:()=>{throw Error('Unexpected resource approval call');}};if(name.endsWith('/generation/finish-options')||name==='./finish-options')return finishOptions;if(name==='./castReadiness')return castReadiness; if(name.endsWith('/renderer/src/output-presets')) return outputPresets; if (name.endsWith('/renderer/src/media/sha256')) return checksums;if(name.endsWith('/ai/character-reference-estimate'))return characterReference;if(name.endsWith('/ai/transcription')||name==='./transcription')return transcription;if(name.endsWith('/ai/music'))return music;if(name.endsWith('/ai/sfx')||name==='./sfx')return sfx;if(name.endsWith('/ai/image-response'))return imageResponse;if(name.endsWith('/ai/submission-diagnostic'))return submissionDiagnostic;if(name.endsWith('/ai/model-discovery'))return {discoverOpenRouterVideoModels:()=>{throw Error('Unexpected catalog request');}}; throw new Error('Unexpected dependency: ' + name); };
  result._compile(ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: relative }).outputText, filename);
  return result.exports;
}
const finishOptions=compile('src/lib/generation/finish-options.ts');
const checksums = compile('renderer/src/media/sha256.ts');
const outputPresets = compile('renderer/src/output-presets.ts');
const sourceAudioContract=compile('renderer/src/media/source-audio-contract.ts');
const castRequirements=compile('src/lib/production/cast-requirements.ts');
const castReadiness=compile('convex/castReadiness.ts',{'convex/values':require('convex/values'),'../src/lib/production/cast-requirements':castRequirements,'../renderer/src/media/sha256':checksums});
const imageResponse = compile('src/lib/ai/image-response.ts');
const submissionDiagnostic = compile('src/lib/ai/submission-diagnostic.ts');
const controls = compile('src/lib/production/workspace-controls.ts');
const registry = compile('src/lib/ai/model-registry.ts');
const actualReferenceContract = registry.getReviewedVideoReferenceContract;
registry.getReviewedVideoReferenceContract = (id,slug) => id.startsWith('test/') ? {version:'VIDEO_REFERENCE_SEMANTICS_V1',modelId:id,canonicalSlug:slug??'fixture',imageMode:'SUBJECT_GUIDANCE',maxImageReferences:50,supportsAudioReferences:true,combinedFrameReferences:true,documentationUrl:'https://fixture.invalid/no-live-model',reviewedOn:'fixture'} : actualReferenceContract(id,slug);
const transcription = compile('src/lib/ai/transcription.ts');
const characterReference = compile('src/lib/ai/character-reference-estimate.ts');
const music=compile('src/lib/ai/music.ts',{'./model-registry':registry});
const sfx=compile('src/lib/ai/sfx.ts',{'./model-registry':registry});
const preparation = compile('src/lib/ai/preparation.ts', { './model-registry': registry,'./music':music });
const shotEstimate = compile('src/lib/generation/shot-estimate.ts');
const studioMemberships = compile('convex/studioMemberships.ts');
const pricing = compile('src/lib/credits/pricing.ts');
const motionReferences=compile('src/lib/ai/video-reference-contracts.ts',{'./model-registry':registry});
const routing = compile('src/lib/ai/video-routing.ts', { './model-registry': registry,'./video-reference-contracts':motionReferences });
const contracts = compile('convex/generationWorkerContracts.ts');
const recipeContract = compile('src/lib/production/recipes/contract.ts');
const recipeSchema = compile('src/lib/production/recipes/schema.ts', { './contract': recipeContract });
const recipeCompiler = compile('src/lib/production/recipes/compiler.ts', { './contract': recipeContract, './schema': recipeSchema, '../../../../renderer/src/media/sha256': checksums });
const recipeProposal = compile('src/lib/production/recipes/proposal.ts', { './schema': recipeSchema, './compiler': recipeCompiler });
const recipeAuthority = compile('convex/recipeAuthority.ts', { './authorization': {}, '../renderer/src/media/sha256': checksums, '../src/lib/production/recipes/compiler': recipeCompiler, '../src/lib/production/recipes/proposal': recipeProposal, './generationContinuity': {}, './voices': {} });
const recipeReuse = compile('convex/recipeReuse.ts', { '../src/lib/production/recipes/compiler': recipeCompiler, './recipeAuthority': recipeAuthority });
const recipeAdmissions = compile('convex/recipeAdmissions.ts', { '../renderer/src/media/sha256': checksums, '../src/lib/production/recipes/compiler': recipeCompiler, './recipeAuthority': recipeAuthority, './recipeReuse':recipeReuse });
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
  const fixture = { mutations: [], estimates: [], actionCalls: [], routingEnabled: true, model: { ...model, supportedSizes: ['1280x720'], lastSeenAt: Date.now() }, source: { ...upscaleSource }, rawCatalog: { upscale_factor: { min: 1.5, max: 3 }, creativity: [0, 1] } };
  if (metadata.operation === 'UPSCALE') fixture.model = { ...fixture.model, modelId: upscaleModelId, pricingSkus: { ...upscalePrices }, upscaleFactor: { min: 1.5, max: 3 }, creativityLevels: [0, 1] };
  const client = {
    action: async (ref, args) => {
      fixture.actionCalls.push({ ref, args });
      if (fixture.actionFailures?.[ref]) throw fixture.actionFailures[ref];
      if (ref === 'videoRouting.refreshReviewedForQuote') return null;
      return { ...(fixture.actionSources?.[ref] ?? fixture.source) };
    },
    query: async ref => {
      if (ref === 'account.current') return { user: { id: 'user' } };
      if (ref === 'generation.getShot') return { production: { projectId: 'project', studioExternalId: 'studio', outputPreset: fixture.outputPreset || 'LANDSCAPE', projectType: fixture.productionVideoType }, project: { projectType: 'REALISTIC_SKIT_UGC' }, shot: { prompt: 'Continue the action', durationSeconds: fixture.shotDurationSeconds ?? 4, metadata }, referenceAssets: references.map(id => ({ assetId: id, mimeType: assets.find(asset => asset.id === id).mimeType })), hasAudioReference: references.includes('audio'), audioAssetIds: references.includes('audio') ? ['audio'] : [] };
      if (ref === 'videoRouting.forGeneration') return { catalog: [{ lastSeenAt: Date.now(), ...fixture.model }], policy: { path: 'AI_VIDEO', preferredModelIds: [fixture.model.modelId], maxCostUsd: 10, updatedAt: 1 } };
      throw new Error('Unexpected query ' + ref);
    },
    mutation: async (ref, args) => {
      fixture.mutations.push({ ref, args });
      if (ref === 'generationJobs.previewShotEstimate') return { estimateId: 'estimate', quoteHash: 'quote' };
      if (ref === 'generationJobs.createReviewedTake') {if(fixture.confirmationError)throw fixture.confirmationError;return { _id: 'job' };}
      throw new Error('Unexpected mutation ' + ref);
    },
  };
  fixture.actions = compile('src/lib/generation/actions.ts', {
    '../../../convex/_generated/api': { api }, '@/lib/convex/server': { getAuthenticatedConvexClient: async () => client },
    '@/lib/ai/capabilities': { assertCapability: () => ({ provider: 'openrouter', model: 'test/reviewed' }) },
    '@/lib/credits/service': { estimateProductionCost: async input => { fixture.estimates.push(input); return { totalCredits: 1 }; } },
    '@/lib/ai/video-routing': routing, '@/lib/config/feature-flags': { isFeatureEnabled: () => fixture.routingEnabled },
    '@/lib/ai/model-discovery': { discoverOpenRouterVideoModels: async () => [{ id: fixture.model.modelId, canonicalSlug: fixture.model.canonicalSlug, upscaleFactor: fixture.model.upscaleFactor, creativityLevels: fixture.model.creativityLevels, supportedDurations: fixture.model.supportedDurations, supportedResolutions: fixture.model.supportedResolutions, supportedAspectRatios: fixture.model.supportedAspectRatios, supportedSizes: fixture.model.supportedSizes, pricingSkus: fixture.livePricing ?? fixture.model.pricingSkus, allowedPassthroughParameters: fixture.model.supportedParameters, raw: fixture.rawCatalog }] },
    '@/lib/production/workspace-controls': controls,
  });
  fixture.run = () => fixture.actions.previewShotGeneration({ productionId: 'production', shotId: 'shot', requestId: 'operation-contract-00001' });
  return fixture;
}
function workspaceActionFixture() {
  const fixture = { mutations: [] };
  const client = {
    query: async ref => {
      if (ref === 'projects.getByExternalId') return { _id: 'project' };
      if (ref === 'scenes.getShot') return { _id: 'shot', projectId: 'project', productionId: 'production', prompt: 'Continue the scene.', metadata: { previousJobId: 'obsolete', upscaleFactor: 3, creativity: 1 } };
      if (ref === 'assetStorage.listProjectAssets') return assets.map(asset => ({ _id: asset.id, mimeType: asset.mimeType }));
      if (ref === 'generationJobs.list') return [{ _id: 'source-job', projectId: 'project', productionId: 'production', provider: 'openrouter', modality: 'VIDEO', operation: 'SHOT_GENERATION', providerJobId, model: 'test/reviewed', shotVersionId: 'source-take', assetId: 'video' }];
      if (ref === 'approvals.get') return { currentState: 'APPROVED', resource: { projectId: 'project', productionId: 'production', provider: 'openrouter', model: 'test/reviewed', status: 'COMPLETED', assetId: 'video', versionNumber: 1 } };
      throw new Error('Unexpected workspace query ' + ref);
    },
    mutation: async (ref, args) => { fixture.mutations.push({ ref, args }); return {}; },
  };
  const outputSettings=compile('renderer/src/output-settings.ts');
  const timelineLineage=compile('src/lib/production/timeline-lineage.ts');
  const actions = compile('src/lib/production/workspace-actions.ts', { './timeline-lineage':timelineLineage, '../../../renderer/src/output-settings':outputSettings, 'next/cache': { revalidatePath: () => {} }, '../../../convex/_generated/api': { api }, '@/lib/convex/server': { getAuthenticatedConvexClient: async () => client }, './workspace-controls': controls });
  fixture.save = selected => actions.saveShotOperationControls({ projectExternalId: 'project-external', productionId: 'production', shotId: 'shot', controls: selected });
  return fixture;
}
function backendFixture(metadata, referenceAssetIds = [], routingFactory, dependencies = {}) {
  const state = { approval: 'APPROVED', routeChecks: [], writes: [], schedules: [], rows: new Map(), counter: 0, creditEstimates: [], creditReservations: [], creditSettlements: [], providerSettlements: [] };
  const row = (table, value) => state.rows.set(value._id, { ...value, table });
  row('projects', { _id: 'project', studioExternalId: 'studio', ownerUserId: 'user' });
  row('users', { _id: 'user', status: 'active' });
  row('studios', { _id: 'studio-id', externalId: 'studio', ownerUserId: 'user', status: 'active' });
  row('members', { _id: 'studio-member', studioId: 'studio-id', userId: 'user', role: 'owner', status: 'active' });
  row('productions', { _id: 'production', projectId: 'project', studioExternalId: 'studio', currentVersionId: 'version', outputPreset: 'LANDSCAPE' });
  row('productionVersions', { _id: 'version', productionId: 'production', status: 'APPROVED' });
  row('shots', { _id: 'shot', projectId: 'project', productionId: 'production', productionVersionId: 'version', sceneId: 'scene', prompt: 'Continue', durationSeconds: 4, requiredAssetIds: referenceAssetIds, metadata });
  row('scenes', { _id: 'scene', productionId: 'production', sequenceId: 'sequence' });
  for (const asset of assets) row('assets', { _id: asset.id, projectId: 'project', productionId: 'production', scope: 'PROJECT', storageId: 'storage', mimeType: asset.mimeType });
  row('generationJobs', { _id: 'source-job', projectId: 'project', productionId: 'production', provider: 'openrouter', providerJobId, model: 'test/reviewed', status: 'COMPLETED', operation: 'SHOT_GENERATION', modality: 'VIDEO', shotVersionId: 'source-take', shotId: 'source-shot', response: { assetId: 'video' } });
  row('shotVersions', { _id: 'source-take', projectId: 'project', productionId: 'production', shotId: 'source-shot', provider: 'openrouter', model: 'test/reviewed', status: 'COMPLETED', assetId: 'video', versionNumber: 1 });
  if (!routingFactory) {
    row('videoModelCatalog', { _id: 'catalog', studioExternalId: 'studio', ...model });
    row('videoModelCatalog', { _id: 'upscale-catalog', studioExternalId: 'studio', ...model, modelId: upscaleModelId, pricingSkus: upscalePrices });
  }
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
    './_generated/api': { internal: { generationWorker: { run: 'run' },generationJobs:{expireLease:'expireLease'},providerReceipts:{reconcile:'receipt-reconcile'} } },
    './_generated/server': { query: value => value, mutation: value => value, internalQuery: value => value, internalMutation: value => value },
    './recipeAdmissions': recipeAdmissions, 'convex/values': { v }, './authorization': dependencies.authorization || { requireProjectAccess: auth, requireProjectRole: auth,resolveProjectAccessForActor:auth },
    './resourceStates': dependencies.resourceStates || { ensureResourceState: async () => {}, getEffectiveResourceState: async (_, projectId, type, id) => ({ currentState: id === 'source-take' ? state.approval : 'DRAFT' }) },
    './financial': { estimateGenerationCredits: args => { state.creditEstimates.push(args); return pricing.estimateGenerationCredits(args); }, reserveGenerationCreditsInTransaction: async (_, args) => { state.creditReservations.push(args); return { reservationId: 'credit-hold' }; }, settleGenerationCreditsInTransaction: async (_,args) => { state.creditSettlements.push(args); } },
    './providerBudget': { settleProviderBudget: async (_,args) => { state.providerSettlements.push(args); }, reserveProviderBudget: async (_, args) => { row('providerBudgets', { _id: 'budget', status: 'ACTIVE', allowedStudioExternalIds: ['studio'] }); row('providerBudgetReservations', { _id: 'hold', jobId: args.jobId, budgetId: 'budget', status: 'RESERVED', estimatedMicros: Math.ceil(args.estimatedCostUsd * 1e6) }); return 'hold'; } },
    './videoRouting': routingFactory ? (state.routing = routingFactory(state, ctx, auth)) : { resolveUpscaleSourceCertificate: async () => ({ ...upscaleSource }), validateReviewedVideoJob: async (_, args) => { state.routeChecks.push(args.request); return { request: args.request, estimatedCostUsd: .04, selection: { provider: 'openrouter', modelId: args.modelId, path: 'AI_VIDEO', resolution: args.request.operation === 'UPSCALE' ? undefined : '720p', routeReason: 'Test-reviewed', policyVersion: 1, ...(args.request.operation === 'EXTEND' ? { continuationQuote: routing.quoteVideoContinuation(model, args.request) } : {}), ...(args.request.operation === 'UPSCALE' ? { upscaleQuote: routing.quoteVideoUpscale({ ...model, modelId: upscaleModelId, upscaleFactor: { min: 1.5, max: 3 }, creativityLevels: [0, 1], pricingSkus: upscalePrices }, { ...args.request, upscaleSource }) } : {}) } }; } },
    './generationContinuity': { resolveGenerationContinuity: async (_, args) => ({ referenceAssetIds: args.referenceAssetIds, selectedResourceVersionIds: [], voiceIds: [], voiceVersionIds: [], resourceBindings: [], dialogueSegments: [], promptContext: null, planningContextSnapshot: null }) },
    '../src/lib/ai/model-registry': registry, './studioMemberships': studioMemberships, './voices': dependencies.voices || {}, './audioCertificates': dependencies.audio || {}, './imageCertificates': dependencies.image || {}, '../src/lib/ai/preparation': dependencies.preparation || preparation, '../src/lib/production/workspace-controls': controls, '../src/lib/ai/video-routing': routing,
    './generationWorkerContracts': { ...contracts, workerEnabled: () => true }, '../src/lib/generation/shot-estimate': shotEstimate,
  });
  const argsFor = (overrides = {}) => ({ productionId: 'production', shotId: 'shot', provider: 'openrouter', model: metadata.operation === 'UPSCALE' ? upscaleModelId : 'test/reviewed', request: { ratio: '16:9', previousModelId: 'invented/model', upscaleFactor: 99, creativity: 99 }, estimatedCost: 1, idempotencyKey: 'operation-contract-00001', ...overrides });
  state.preview = async overrides => jobs.previewShotEstimate.handler(ctx, argsFor(overrides));
  state.confirm = async ({ estimateId, quoteHash }) => jobs.createReviewedTake.handler(ctx, { estimateId, quoteHash });
  state.create = async overrides => state.confirm(await state.preview(overrides));
  state.ctx = ctx; state.jobs = jobs;
  state.fence = async (id, extra = {}) => { state.rows.set(id, { ...state.rows.get(id), leaseId: 'lease', leaseExpiresAt: Date.now() + 60_000 }); return jobs.fenceSubmission.handler(ctx, { jobId: id, leaseId: 'lease', ...(state.rows.get(id).request?.continuationQuote ? { liveCatalogFingerprint: state.rows.get(id).request.continuationQuote.catalogFingerprint, liveCatalogCheckedAt: Date.now() } : {}), ...extra }); };
  return state;
}
async function main() {
  await check('a quote refresh updates only unchanged reviewed stale models in the authorized studio', async () => {
    const now = Date.now();
    const lastSeenAt = now - 36 * 60 * 60 * 1000;
    const asLive = (row, patch = {}) => ({ id: row.modelId, ...row, allowedPassthroughParameters: row.supportedParameters, ...patch });
    let live = [];
    let discovers = 0;
    let canEdit = true;
    const state = backendFixture({ operation: 'GENERATE' }, [], (_, __, auth) => {
      const definitions = { query: value => value, mutation: value => value, action: value => value, internalQuery: value => value, internalMutation: value => value };
      const v = new Proxy({}, { get: () => () => ({}) });
      return compile('convex/videoRouting.ts', {
        './_generated/server': definitions, './_generated/api': { internal: api }, 'convex/values': { v },
        './authorization': { requireProjectRole: async (ctx, id, roles) => {
          assert.deepEqual(roles, ['OWNER', 'EDITOR']);
          if (!canEdit || id !== 'project') throw Error('Project edit role required');
          return auth();
        } },
        '../src/lib/ai/video-routing': routing, './generationWorkerContracts': contracts, './generationContinuity': {},
        '../src/lib/ai/model-discovery': { discoverOpenRouterVideoModels: async options => { discovers++; assert.equal(options.staleIfError, false); return live; } },
      });
    });
    const row = (id, patch = {}) => {
      const value = { ...model, _id: id, modelId: `test/${id}`, canonicalSlug: 'version-1', table: 'videoModelCatalog', studioExternalId: 'studio', lastSeenAt, ...patch };
      state.rows.set(id, { ...value, reviewedCatalogFingerprint: routing.videoCatalogFingerprint(value) });
      return state.rows.get(id);
    };
    const match = row('same');
    const unavailable = row('disabled', { available: false });
    const quarantined = row('quarantined', { platformQuarantinedAt: now });
    const unreviewed = row('unreviewed', { reviewedAt: undefined });
    const otherStudio = row('foreign', { studioExternalId: 'other' });
    const changedPrice = row('price');
    const changedVersion = row('version');
    const changedControls = row('controls');
    const missing = row('missing');
    const fresh = row('fresh', { lastSeenAt: now });
    live = [match, unavailable, quarantined, unreviewed, otherStudio, fresh].map(value => asLive(value)).concat(
      asLive(changedPrice, { pricingSkus: { ...changedPrice.pricingSkus, cents_per_second_output: 2 } }),
      asLive(changedVersion, { canonicalSlug: 'version-2' }), asLive(changedControls, { supportedDurations: [8] }),
    );
    const dispatch = (ref, args) => state.routing[ref.split('.')[1]].handler(state.ctx, args);
    const actionContext = { runQuery: dispatch, runMutation: dispatch };
    const refresh = projectId => state.routing.refreshReviewedForQuote.handler(actionContext, { projectId });
    await assert.rejects(refresh('another-project'), /edit role/);
    canEdit = false;
    await assert.rejects(refresh('project'), /edit role/);
    assert.equal(discovers, 0);
    canEdit = true;
    await refresh('project');
    assert.equal(discovers, 1);
    assert.equal(state.writes.length, 1);
    assert.deepEqual(Object.keys(state.writes[0].patch), ['lastSeenAt']);
    assert.deepEqual(state.rows.get(match._id), { ...match, lastSeenAt: state.writes[0].patch.lastSeenAt });
    for (const unchanged of [unavailable, quarantined, unreviewed, otherStudio, changedPrice, changedVersion, changedControls, missing, fresh]) assert.deepEqual(state.rows.get(unchanged._id), unchanged);
    assert.equal(state.creditReservations.length, 0);
    assert.equal(state.schedules.length, 0);
  });
  await check('ordinary quote rejects a stale row or live price drift before recording an estimate', async () => {
    const stale = publicActionFixture(baseControls);
    stale.model.lastSeenAt = Date.now() - 36 * 60 * 60 * 1000;
    assert.equal((await stale.run()).success, false);
    assert.deepEqual(stale.actionCalls[0], { ref: 'videoRouting.refreshReviewedForQuote', args: { projectId: 'project' } });
    assert.equal(stale.mutations.length, 0);
    const changed = publicActionFixture(baseControls);
    changed.livePricing = { ...changed.model.pricingSkus, cents_per_second_output: 2 };
    assert.equal((await changed.run()).success, false);
    assert.equal(changed.mutations.length, 0);
  });
  await check('public creation rejects private recipe authority markers before reserving', async () => { const state=backendFixture({operation:'GENERATE'},[]);await assert.rejects(state.create({request:{ratio:'16:9',recipeRunNodeId:'foreign-node'}}),/PRIVATE_AUTHORITY/);assert.equal(state.creditReservations.length,0); });
  await check('a quote makes no purchase and only the exact unexpired consent can schedule a take', async () => {
    const state = backendFixture({ operation: 'GENERATE' });
    const quote = await state.preview();
    assert.deepEqual(state.writes.map(write => write.table), ['estimates']);
    assert.equal(state.creditReservations.length, 0);
    assert.equal(state.schedules.length, 0);
    await assert.rejects(state.confirm({ ...quote, quoteHash: 'forged' }), /SHOT_ESTIMATE_CHANGED/);
    const estimate = state.rows.get(quote.estimateId);
    estimate.expiresAt = Date.now() - 1;
    await assert.rejects(state.confirm(quote), /SHOT_ESTIMATE_EXPIRED/);
    assert.equal(state.creditReservations.length, 0);
    assert.equal(state.schedules.length, 0);
    const reviewed = await state.preview();
    const job = await state.confirm(reviewed);
    const replay = await state.confirm(reviewed);
    assert.equal(replay._id, job._id);
    assert.equal(state.creditReservations.length, 1);
    assert.equal(state.schedules.length, 1);
  });
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
  await check('named media authoring saves normalized role intent and denies foreign aliases before writes', async () => {
    const fixture = workspaceActionFixture();
    const selected = { ...baseControls, operation: 'EDIT', audioPolicy: 'KEEP_SOURCE', referenceAssetIds: ['video', 'image'], referenceBindings: [{ assetId: 'image', alias: 'Lead', role: 'IDENTITY' }], editInstructions: { change: 'Use @lead.', preserve: 'Keep the camera.', timing: 'At 1–2 seconds.' } };
    assert.equal((await fixture.save(selected)).success, true);
    assert.equal(fixture.mutations[0].args.metadata.referenceBindings[0].alias, 'lead');
    assert.equal(fixture.mutations[0].args.metadata.editInstructions.change, 'Use @lead.');
    const before = fixture.mutations.length;
    assert.equal((await fixture.save({ ...selected, editInstructions: { ...selected.editInstructions, preserve: '@foreign' } })).success, false);
    assert.equal(fixture.mutations.length, before);
  });
  await check('seven project formats reach routing without silent landscape conversion', async () => {
    for (const preset of outputPresets.OUTPUT_PRESETS) {
      const fixture = publicActionFixture({}); fixture.outputPreset = preset.id;
      fixture.model = { ...fixture.model, supportedAspectRatios: [preset.aspectRatio], supportedResolutions: [`${Math.min(preset.width,preset.height)}p`], supportedSizes: [`${preset.width}x${preset.height}`] };
      const result = await fixture.run();
      assert.equal(result.success, true, preset.id);
      assert.equal(fixture.mutations.find(call => call.ref === 'generationJobs.previewShotEstimate').args.request.ratio, preset.aspectRatio);
    }
    const invalid = publicActionFixture({ aspectRatio: 'arbitrary' });
    assert.equal((await invalid.run()).success, false); assert.equal(invalid.mutations.length, 0);
  });
  await check('approved production recipe takes precedence over its project default', async () => {
    const fixture = publicActionFixture({}); fixture.productionVideoType = 'CINEMATIC_FILM';
    assert.equal((await fixture.run()).success, true);
    assert.equal(fixture.mutations.find(call => call.ref === 'generationJobs.previewShotEstimate').args.request.videoType, 'CINEMATIC_FILM');
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
module.exports = { sfx, compile, checksums, registry, preparation, music, controls, routing, contracts, backendFixture, publicActionFixture, api, upscaleModelId, upscaleSource, upscalePrices, model, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(module.exports.cleanup);
