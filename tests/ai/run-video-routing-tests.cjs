const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('../../node_modules/typescript');

const root = path.resolve(__dirname, '../..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-video-routing-'));
function compileSource(relative, filename) {
  const sourcePath = path.join(root, relative);
  const outputPath = path.join(tempRoot, filename);
  const outputText = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: sourcePath }).outputText;
  fs.writeFileSync(outputPath, outputText);
  return outputPath;
}
const source = fs.readFileSync(path.join(root, 'src/lib/ai/video-routing.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: 'video-routing.ts' }).outputText;
const compiled = new Module(path.join(tempRoot, 'video-routing.js'), module);
compiled.filename = path.join(tempRoot, 'video-routing.js');
compiled.paths = Module._nodeModulePaths(tempRoot);
compiled._compile(output, compiled.filename);
const routing = compiled.exports;

const expectedTypes = [
  'ANIMATED_COMEDY_2D', 'REALISTIC_SKIT_UGC', 'PRODUCT_SAAS_LAUNCH', 'MOTION_GRAPHICS',
  'EXPLAINER_STORY', 'CINEMATIC_FILM', 'MUSIC_VIDEO', 'SOCIAL_CUTDOWN',
];
assert.deepEqual(routing.VIDEO_TYPES, expectedTypes);
const creationForm = fs.readFileSync(path.join(root, 'src/components/production/create-production-form.tsx'), 'utf8');
const productionActions = fs.readFileSync(path.join(root, 'src/lib/production/actions.ts'), 'utf8');
assert.match(creationForm, /option value=\{4\}>4 seconds/);
assert.match(creationForm, /option value=\{8\}>8 seconds/);
assert.match(productionActions, /Math\.max\(4,/);
assert.match(productionActions, /duration <= 8 \? 1 :/);
assert.match(productionActions, /enforceShortClipShape/);
assert.equal(routing.normalizeVideoType('ANIMATED_COMEDY_2D'), 'ANIMATED_COMEDY_2D');
assert.equal(routing.normalizeVideoType('REALISTIC_AI_SKIT'), 'REALISTIC_SKIT_UGC');
assert.equal(routing.normalizeVideoType('AI_PRODUCT_AD'), 'PRODUCT_SAAS_LAUNCH');
assert.equal(routing.normalizeVideoType('VOICEOVER_STORY'), 'EXPLAINER_STORY');
assert.equal(routing.normalizeVideoType('SHORT_FILM'), 'CINEMATIC_FILM');
assert.equal(routing.defaultVideoProductionPath('MOTION_GRAPHICS'), 'MOTION_GRAPHICS');
assert.equal(routing.defaultVideoProductionPath('PRODUCT_SAAS_LAUNCH'), 'COMPOSITED');
assert.equal(routing.defaultVideoProductionPath('ANIMATED_COMEDY_2D'), 'AI_VIDEO');

const model = {
  provider: 'openrouter', modelId: 'provider/model-a', available: true, supportsTextToVideo: true,
  supportsImageReferences: true, supportsVideoReferences: true, supportsFirstFrame: true, supportsLastFrame: true,
  supportsVideoEdit: true, supportsVideoExtension: true, supportsAudio: true, supportsCombinedFrameReferences: true,
  supportedDurations: [4, 6, 8], supportedResolutions: ['720p', '1080p'],
  supportedAspectRatios: ['9:16', '16:9'], estimatedCostPerSecond: 0.1,
  supportedParameters: ['duration', 'aspect_ratio', 'resolution', 'input_references', 'frame_images', 'generate_audio'],
};
const baseRequest = { videoType: 'CINEMATIC_FILM', task: 'GENERATE', qualityTier: 'STANDARD', durationSeconds: 6, aspectRatio: '16:9' };
assert.equal(routing.videoModelSupportsRequest(model, baseRequest), true);
assert.equal(routing.selectVideoRoute(baseRequest, [model]).modelId, model.modelId);
assert.equal(routing.selectVideoRoute(baseRequest, [model]).resolution, '720p', 'an unspecified resolution resolves to a supported default');
for (const videoType of expectedTypes) {
  const selection = routing.selectVideoRoute({ ...baseRequest, videoType }, videoType === 'MOTION_GRAPHICS' ? [] : [model]);
  assert.equal(selection.modelId, videoType === 'MOTION_GRAPHICS' ? 'renderer/motion-graphics' : model.modelId, `${videoType} must route through its eligible path`);
  const metadata = routing.buildVideoRouteMetadata(
    { ...baseRequest, videoType, task: 'FRAME_TO_VIDEO', resolution: selection.resolution, hasImageReferences: true, requiresFirstFrame: true, requiresLastFrame: true, requiresAudio: false },
    selection,
    { modelVersion: 'catalog-fixture-v1', referenceAssetIds: ['asset-style'], audioAssetIds: videoType === 'MUSIC_VIDEO' ? ['asset-audio'] : [] },
  );
  assert.equal(metadata.videoType, videoType, `${videoType} must be persisted on its route metadata`);
  assert.equal(metadata.task, 'FRAME_TO_VIDEO');
  assert.equal(metadata.resolution, selection.resolution, `${videoType} must persist the resolution used for pricing and submission`);
  assert.equal(metadata.referenceAssetIds[0], 'asset-style');
  assert.deepEqual(metadata.audioAssetIds, videoType === 'MUSIC_VIDEO' ? ['asset-audio'] : []);
  assert.equal(metadata.modelVersion, 'catalog-fixture-v1');
}
assert.equal(routing.selectVideoRoute({ ...baseRequest, videoType: 'MOTION_GRAPHICS' }, []).provider, 'internal');

assert.equal(routing.videoModelSupportsRequest(model, { ...baseRequest, durationSeconds: 5 }), false, 'unsupported durations are rejected');
assert.equal(routing.videoModelSupportsRequest(model, { ...baseRequest, aspectRatio: '4:5' }), false, 'unsupported aspect ratios are rejected');
assert.equal(routing.videoModelSupportsRequest(model, { ...baseRequest, resolution: '4k' }), false, 'unsupported resolutions are rejected');
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsFirstFrame: false }, { ...baseRequest, task: 'FRAME_TO_VIDEO', requiresFirstFrame: true }), false);
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsLastFrame: false }, { ...baseRequest, requiresLastFrame: true }), false);
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsImageReferences: false }, { ...baseRequest, hasImageReferences: true }), false);
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsVideoReferences: false }, { ...baseRequest, task: 'EDIT', hasVideoReference: true }), false);
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsVideoEdit: true }, { ...baseRequest, task: 'EDIT', hasVideoReference: true }), false, 'video editing stays unavailable until the provider request is implemented');
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsVideoExtension: true }, { ...baseRequest, task: 'EXTEND', hasVideoReference: true }), false, 'video extension stays unavailable until the provider request is implemented');
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsAudio: false }, { ...baseRequest, requiresAudio: true }), false);
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsVideoReferences: true }, { ...baseRequest, hasVideoReference: true }), false, 'reviewed video reference controls do not certify input billing or minimum-token floors');
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsAudioReferences: false }, { ...baseRequest, hasAudioReference: true }), false, 'audio references cannot silently be dropped');
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsCombinedFrameReferences: false }, { ...baseRequest, requiresFirstFrame: true, hasImageReferences: true }), false, 'frame precedence must not silently drop required references');
assert.equal(routing.videoModelSupportsRequest({ ...model, reviewedOperations: ['APPEARANCE_EDIT'] }, { ...baseRequest, operation: 'APPEARANCE_EDIT', task: 'EDIT', hasVideoReference: true }), false, 'review flags alone cannot certify source-derived edit controls or billing');
assert.equal(routing.videoModelSupportsRequest({ ...model, reviewedOperations: ['APPEARANCE_EDIT'] }, { ...baseRequest, operation: 'OBJECT_REPLACE', task: 'EDIT', hasVideoReference: true }), false, 'one reviewed edit recipe does not certify every operation');
const continuationModel = { ...model, reviewedOperations: ['EXTEND'], pricingSkus: { cents_per_second_output_720p: 17, cents_per_second_video_continuation_720p: 41, cents_per_second_video_continuation_1080p: 53 } };
assert.equal(routing.videoModelSupportsRequest(continuationModel, { ...baseRequest, task: 'EXTEND', previousJobId: 'gen-vid-123-abcdefghijklmnopqrst', previousModelId: model.modelId }), true);
assert.equal(routing.videoModelSupportsRequest({ ...model, reviewedOperations: ['EXTEND'] }, { ...baseRequest, task: 'EXTEND', previousJobId: 'gen-vid-123-abcdefghijklmnopqrst', previousModelId: 'other/model' }), false, 'continuation remains pinned to original model');
const continuationRequest = { ...baseRequest, task: 'EXTEND', previousJobId: 'gen-vid-123-abcdefghijklmnopqrst', previousModelId: model.modelId, resolution: '720p' };
assert.equal(routing.estimateVideoCost(continuationModel, continuationRequest), 2.46, 'continuation uses41c rather than17c output rate');
assert.equal(routing.estimateVideoCost(continuationModel, { ...continuationRequest, resolution: undefined }), 3.18, 'unspecified continuation resolution is bounded by maximum dedicated rate');
for (const patch of [{ pricingSkus: { cents_per_second_output_720p: 17 } }, { pricingSkus: { cents_per_second_video_continuation_720p: 41, unknown_input_units: 1 } }, { pricingSkus: { cents_per_second_video_continuation_720p: 0 } }, { pricingSkus: undefined, estimatedCostPerSecond: .17 }]) assert.equal(routing.estimateVideoCost({ ...continuationModel, ...patch }, continuationRequest), undefined, 'missing or unbounded continuation units failclosed');
assert.equal(routing.videoModelSupportsRequest(continuationModel, { ...continuationRequest, maximumCostUsd: 2 }), false, 'normal-output budget cannot fund higher continuation rate');
assert.equal(routing.estimateVideoCost(continuationModel, { ...continuationRequest, hasImageReferences: true }), undefined, 'uncertified extra continuation reference charges cannot be ignored');
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsLipSync: true, supportsAudioReferences: true, reviewedOperations: ['LIP_SYNC'] }, { ...baseRequest, operation: 'LIP_SYNC', hasImageReferences: true, hasAudioReference: true }), false, 'supplied audio duration needs a certified billing bound');
assert.equal(routing.videoModelSupportsRequest({ ...model, supportsPerformanceTransfer: true, reviewedOperations: ['PERFORMANCE_TRANSFER'] }, { ...baseRequest, operation: 'PERFORMANCE_TRANSFER', hasImageReferences: true, hasVideoReference: true }), false, 'generic multimodal references do not certify exact performance transfer');
assert.equal(routing.videoModelSupportsRequest({ ...model, reviewedOperations: ['EDIT'] }, { ...baseRequest, task: 'EDIT', hasVideoReference: true, requiresMask: true }), false, 'undocumented mask controls fail closed');
assert.equal(routing.videoModelSupportsRequest({ ...model, estimatedCostPerSecond: 0.2 }, { ...baseRequest, maximumCostUsd: 1 }), false, 'routes above the budget are rejected');
assert.equal(routing.videoModelSupportsRequest({ ...model, estimatedCostPerSecond: undefined }, { ...baseRequest, maximumCostUsd: 1 }), false, 'unknown price cannot pass an explicit cap');
const pricedByResolution = { ...model, estimatedCostPerSecond: 0.1, pricingSkus: { 'per-video-second': 0.1, 'per-video-second-1080p': 0.5 } };
assert.equal(routing.selectVideoRoute({ ...baseRequest, resolution: '1080p' }, [pricedByResolution]).estimatedCostUsd, 3, 'resolution-specific pricing is used for the estimate');
assert.equal(routing.videoModelSupportsRequest(pricedByResolution, { ...baseRequest, resolution: '1080p', maximumCostUsd: 1 }), false, 'resolution pricing is enforced by the cap');
const tokenPriced = { ...model, supportedSizes: ['1280x720', '720x1280'], estimatedCostPerSecond: undefined, pricingSkus: { 'per-video-token': 0.000001 } };
assert.ok(Math.abs(routing.selectVideoRoute({ ...baseRequest, durationSeconds: 4 }, [tokenPriced]).estimatedCostUsd - 0.0864) < 1e-10, 'per-token pricing estimates from the closest supported output size');
assert.equal(routing.videoModelSupportsRequest(tokenPriced, { ...baseRequest, durationSeconds: 4, maximumCostUsd: 0.08 }), false, 'per-token cost estimates enforce the cap');
// Pricing fixtures mirror current OpenRouter /videos/models SKU shapes.
const currentVeo = {
  ...model, modelId: 'google/veo-3.1-lite', supportedDurations: [4, 6, 8], supportedResolutions: ['720p', '1080p'],
  supportedAspectRatios: ['16:9', '9:16'], estimatedCostPerSecond: undefined,
  pricingSkus: { duration_seconds_with_audio_720p: 0.05, duration_seconds_without_audio_720p: 0.03 },
};
assert.equal(routing.selectVideoRoute({ ...baseRequest, durationSeconds: 4, resolution: '720p', requiresAudio: true }, [currentVeo]).estimatedCostUsd, 0.2, 'current duration_seconds_with_audio SKUs include audio pricing');
assert.equal(routing.selectVideoRoute({ ...baseRequest, durationSeconds: 4, resolution: '720p' }, [currentVeo]).estimatedCostUsd, 0.12, 'current duration_seconds_without_audio SKUs are selected when audio is off');
const currentWan = {
  ...model, modelId: 'alibaba/wan-3.0', supportedDurations: [4, 8], supportedResolutions: ['480p', '720p'],
  supportedAspectRatios: ['16:9'], estimatedCostPerSecond: undefined,
  pricingSkus: { duration_seconds_480p: 0.05, duration_seconds_720p: 0.1, image_to_video_duration_seconds_720p: 0.1 },
};
assert.equal(routing.selectVideoRoute({ ...baseRequest, durationSeconds: 4, resolution: '720p', task: 'FRAME_TO_VIDEO' }, [currentWan]).estimatedCostUsd, 0.4, 'current task/resolution-specific dollar-per-second SKUs are recognized');
const currentGrok = {
  ...model, modelId: 'x-ai/grok-imagine-video-1.5-lite', supportedDurations: [4, 8], supportedResolutions: ['480p', '720p'],
  supportedAspectRatios: ['16:9'], estimatedCostPerSecond: undefined,
  pricingSkus: { cents_per_video_output_second_480p: 2, cents_per_video_output_second_720p: 3, cents_per_image_input: 1 },
};
assert.equal(routing.selectVideoRoute({ ...baseRequest, durationSeconds: 4, resolution: '480p', hasImageReferences: true, imageReferenceCount: 2 }, [currentGrok]).estimatedCostUsd, 0.1, 'current cents-per-second and per-image SKUs are converted and counted');
const currentSeedance = {
  ...model, modelId: 'bytedance/seedance-2.0-mini', supportedDurations: [4, 8], supportedResolutions: ['480p', '720p'],
  supportedAspectRatios: ['16:9'], supportedSizes: ['854x480', '1280x720'], estimatedCostPerSecond: undefined,
  pricingSkus: { video_tokens: 0.0000035, video_tokens_without_audio: 0.0000035 },
};
assert.ok(Math.abs(routing.selectVideoRoute({ ...baseRequest, durationSeconds: 4, resolution: '480p' }, [currentSeedance]).estimatedCostUsd - 0.134505) < 1e-10, 'current token-priced models use the documented video token formula');
assert.throws(() => routing.selectVideoRoute(baseRequest, []), /No available video model/);

const economy = routing.selectVideoRoute({ ...baseRequest, qualityTier: 'ECONOMY' }, [model, { ...model, modelId: 'provider/cheap', estimatedCostPerSecond: 0.02 }]);
assert.equal(economy.modelId, 'provider/cheap');
const standard = routing.selectVideoRoute(baseRequest, [model, { ...model, modelId: 'provider/cheap', estimatedCostPerSecond: 0.02 }], { videoType: 'CINEMATIC_FILM', qualityTier: 'STANDARD', path: 'AI_VIDEO', preferredModelIds: [model.modelId] });
assert.equal(standard.modelId, model.modelId, 'standard respects the reviewed preference order');
const premiumPolicy = { videoType: 'CINEMATIC_FILM', qualityTier: 'PREMIUM', path: 'AI_VIDEO', preferredModelIds: [model.modelId], maxCostUsd: 1 };
assert.equal(routing.selectVideoRoute({ ...baseRequest, qualityTier: 'PREMIUM' }, [model], premiumPolicy).modelId, model.modelId);
assert.throws(() => routing.selectVideoRoute({ ...baseRequest, qualityTier: 'PREMIUM' }, [model]), /administrator/);
assert.throws(() => routing.selectVideoRoute({ ...baseRequest, qualityTier: 'PREMIUM' }, [model], { ...premiumPolicy, maxCostUsd: undefined }), /spending cap/);
assert.throws(() => routing.selectVideoRoute({ ...baseRequest, qualityTier: 'PREMIUM' }, [model], { ...premiumPolicy, maxCostUsd: 0.2 }), /spending cap/);

const aliasMap = new Map([
  ['@/lib/ai/types', compileSource('src/lib/ai/types.ts', 'types.js')],
  ['@/lib/ai/model-registry', compileSource('src/lib/ai/model-registry.ts', 'model-registry.js')],
  ['@/lib/ai/capabilities', compileSource('src/lib/ai/capabilities.ts', 'capabilities.js')],
  ['@/lib/ai/model-discovery', compileSource('src/lib/ai/model-discovery.ts', 'model-discovery.js')],
  ['@/lib/types/database', path.join(tempRoot, 'database.js')],
]);
fs.writeFileSync(path.join(tempRoot, 'database.js'), 'module.exports = {};\n');
for (const [alias, file] of [...aliasMap]) { aliasMap.set(alias.replace('@/lib/ai/', '../ai/').replace('@/lib/types/', '../types/'), file); }
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  return aliasMap.get(request) || originalResolveFilename.call(this, request, parent, isMain, options);
};
const adapterModule = new Module(path.join(tempRoot, 'openrouter-adapter.js'), module);
adapterModule.filename = path.join(tempRoot, 'openrouter-adapter.js');
adapterModule.paths = Module._nodeModulePaths(tempRoot);
adapterModule._compile(ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/adapters/openrouter-adapter.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: 'openrouter-adapter.ts' }).outputText, adapterModule.filename);
const discovery = require(aliasMap.get('@/lib/ai/model-discovery'));
Module._resolveFilename = originalResolveFilename;
const adapter = adapterModule.exports;

async function testMockedProviderContract() {
  let catalogUrl;
  const catalog = await discovery.discoverOpenRouterVideoModels({
    force: true,
    staleIfError: false,
    fetch: async (url) => {
      catalogUrl = url;
      return new Response(JSON.stringify({ data: [{
        id: 'provider/model-a', supported_durations: [4, 8], supported_resolutions: ['720p'],
        supported_aspect_ratios: ['16:9'], supported_sizes: ['1280x720'],
        pricing_skus: { 'per-video-second': '0.05' }, allowed_passthrough_parameters: ['output_config'],
      }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(catalogUrl, 'https://openrouter.ai/api/v1/videos/models');
  assert.equal(catalog[0].supportedDurations.includes(8), true);
  assert.equal(catalog[0].pricingSkus['per-video-second'], 0.05);
  assert.deepEqual(catalog[0].supportedSizes, ['1280x720']);
  assert.deepEqual(catalog[0].allowedPassthroughParameters, ['output_config']);

  let videoCalls = 0;
  let requestPayload;
  const submission = await adapter.generateVideo({
  model: 'local/test-video', prompt: 'A fixture generation request', duration: 4, aspectRatio: '9:16', resolution: '720p',
  frameImages: [{ url: 'https://fixture.test/first.png', frameType: 'first_frame' }, { url: 'https://fixture.test/last.png', frameType: 'last_frame' }],
  inputReferences: [{ url: 'https://fixture.test/style.png' }], generateAudio: false,
}, { apiKey: null, fallbackModels: [], retry: { maxRetries: 0 }, mock: { seed: 'no-cost-video-route', handler: async (request) => {
  videoCalls += 1; requestPayload = request.body;
  return { body: { id: 'provider-job-fixture', status: 'queued', model: 'local/test-video' }, headers: { 'x-request-id': 'request-fixture' } };
} } });
  assert.equal(videoCalls, 1);
  assert.equal(submission.id, 'provider-job-fixture');
  assert.deepEqual(requestPayload.frame_images.map((item) => item.frame_type), ['first_frame', 'last_frame']);
  assert.equal(requestPayload.input_references[0].type, 'image_url');
  assert.equal(requestPayload.generate_audio, false, 'OpenRouter must not silently generate audio by default');
  let rejectedCalls = 0;
  await assert.rejects(() => adapter.generateVideo({ model: 'local/test-video', prompt: 'No provider fallback after rejection' }, {
    apiKey: null, fallbackModels: [], retry: { maxRetries: 0 }, mock: { seed: 'single-route-only', handler: async () => {
      rejectedCalls += 1;
      return { status: 400, body: { error: { message: 'unsupported request' } } };
    } },
  }));
  assert.equal(rejectedCalls, 1, 'a dynamically selected route has no hidden fallback submission');

  discovery.clearOpenRouterModelCache();
  let exactPayload;
  await adapter.generateVideo({ model: 'provider/model-b', prompt: 'Preserve explicit selection' }, {
    apiKey: 'fixture-key', allowDiscoveredModel: true, beforeMediaSubmit: async () => {},
    fetch: async (url, init) => {
      if (String(url).endsWith('/videos/models')) return new Response(JSON.stringify({ data: [{ id: 'provider/model-a' }, { id: 'provider/model-b' }] }), { headers: { 'content-type': 'application/json' } });
      exactPayload = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 'accepted-exact', status: 'pending' }), { headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(exactPayload.model, 'provider/model-b', 'catalog discovery must never replace the exact admin-selected model with the first entry');
  let preflightFenceCalls = 0;
  let preflightPosts = 0;
  discovery.clearOpenRouterModelCache();
  await assert.rejects(() => adapter.generateVideo({ model: 'provider/missing-model', prompt: 'Never submitted' }, {
    apiKey: 'fixture-key', allowDiscoveredModel: true,
    beforeMediaSubmit: async () => { preflightFenceCalls += 1; },
    fetch: async (url) => {
      if (String(url).endsWith('/videos/models')) return new Response(JSON.stringify({ data: [{ id: 'provider/other' }] }), { headers: { 'content-type': 'application/json' } });
      preflightPosts += 1;
      throw new Error('A POST must not happen');
    },
  }), /selected video model is not available/);
  assert.equal(preflightFenceCalls, 0, 'catalog preflight failure must not fence a nonexistent submission');
  assert.equal(preflightPosts, 0);
  const fenceError = Object.assign(new Error('FENCE_REJECTED'), { code: 'FENCE_REJECTED' });
  let fencedPosts = 0;
  await assert.rejects(() => adapter.generateVideo({ model: 'local/test-video', prompt: 'Fence denied' }, {
    mock: { seed: 'fence-denied', handler: async () => { fencedPosts += 1; return { body: { id: 'must-not-submit', status: 'pending' } }; } },
    beforeMediaSubmit: async () => { throw fenceError; },
  }), (error) => error === fenceError && error.details?.submissionUnknown !== true);
  assert.equal(fencedPosts, 0, 'failed transaction fence prevents provider POST');
  let ambiguousCalls = 0;
  await assert.rejects(() => adapter.generateVideo({ model: 'local/test-video', prompt: 'Do not buy a second output' }, {
    fallbackModels: ['local/fallback'], maxRetries: 5,
    mock: { seed: 'ambiguous-post', handler: async () => { ambiguousCalls += 1; return { status: 503, body: { error: { message: 'upstream interrupted' } } }; } },
  }), (error) => error.details?.submissionUnknown === true && error.retryable === false);
  assert.equal(ambiguousCalls, 1, 'ambiguous media POST must not retry or fall back');
  let typedPayload;
  await adapter.generateVideo({ model: 'local/test-video', prompt: 'Source performance', previousJobId: 'gen-vid-123-abcdefghijklmnopqrst', inputReferences: [{ kind: 'video', url: 'https://fixture.test/source.mp4' }, { kind: 'audio', url: 'https://fixture.test/source.wav' }] }, {
    mock: { seed: 'typed-refs', handler: async (request) => { typedPayload = request.body; return { body: { id: 'accepted', status: 'pending' } }; } },
  });
  assert.deepEqual(typedPayload.input_references.map((reference) => reference.type), ['video_url', 'audio_url']);
  assert.equal(typedPayload.input_references[0].video_url.url, 'https://fixture.test/source.mp4');
  assert.equal(typedPayload.previous_job_id, 'gen-vid-123-abcdefghijklmnopqrst');
  const upscalePayload = adapter.buildVideoGenerationRequest({ model: 'local/test-video', prompt: 'Finish approved footage', inputReferences: [{ kind: 'video', url: 'https://fixture.test/source.mp4' }], upscaleFactor: 2.5, creativity: 1 }, { allowDiscoveredModel: true });
  assert.equal(upscalePayload.upscale_factor, 2.5);
  assert.equal(upscalePayload.creativity, 1);
  assert.equal(upscalePayload.input_references[0].type, 'video_url');
  const sourceVideo = [{ kind: 'video', url: 'https://fixture.test/source.mp4' }];
  const editPayload = adapter.buildVideoGenerationRequest({ model: 'black-forest-labs/flux-video-edit', prompt: 'Change the toy car paint.', inputReferences: sourceVideo }, { allowDiscoveredModel: true });
  assert.deepEqual(editPayload, { model: 'black-forest-labs/flux-video-edit', prompt: 'Change the toy car paint.', input_references: [{ type: 'video_url', video_url: { url: 'https://fixture.test/source.mp4' } }] });
  for (const patch of [{ duration: 4 }, { aspectRatio: '16:9' }, { resolution: '720p' }, { generateAudio: true }, { upscaleFactor: 2 }, { creativity: 1 }, { inputReferences: [] }, { inputReferences: [{ kind: 'image', url: 'https://fixture.test/portrait.png' }] }]) assert.throws(() => adapter.buildVideoGenerationRequest({ model: 'black-forest-labs/flux-video-edit', prompt: 'Edit source.', inputReferences: sourceVideo, ...patch }, { allowDiscoveredModel: true }), /Source-derived|editing/);
  const certifiedUpscalePayload = adapter.buildVideoGenerationRequest({ model: 'black-forest-labs/flux-video-upscale', prompt: 'Enlarge source.', inputReferences: sourceVideo, upscaleFactor: 2, creativity: 0 }, { allowDiscoveredModel: true });
  assert.equal(certifiedUpscalePayload.upscale_factor, 2); assert.equal(certifiedUpscalePayload.creativity, 0); assert.equal(certifiedUpscalePayload.generate_audio, undefined);
  for (const id of ['black-forest-labs/flux-video-edit', 'black-forest-labs/flux-3-video']) assert.equal(discovery.normalizeDiscoveredVideoModel({ id, pricing_skus: { cents_per_second_output: 3, unknown_input_units: 'unbounded' } }), null, 'unknown source-operation billing cannot disappear during catalog normalization');
  let downloadAuthorization;
  const downloaded = await adapter.downloadVideo('accepted', { apiKey: 'fixture-key', fetch: async (_url, init) => {
    downloadAuthorization = new Headers(init.headers).get('authorization');
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'video/mp4' } });
  } });
  assert.equal(downloadAuthorization, 'Bearer fixture-key');
  assert.equal(downloaded.body.byteLength, 3);
  await assert.rejects(() => adapter.downloadVideo('accepted', { apiKey: 'fixture-key', maxResponseBytes: 2, fetch: async () => new Response(new Uint8Array([1, 2, 3])) }), /exceeds the allowed size/);
  const clone = adapter.buildSpeechSynthesisRequest({ model: 'local/test-speech', input: 'A consented reference voice', inputReferences: [{ url: 'https://fixture.test/consented.wav' }] }, { allowDiscoveredModel: true });
  assert.equal(clone.voice, undefined);
  assert.equal(clone.input_references[0].type, 'input_audio');
  assert.throws(() => adapter.buildSpeechSynthesisRequest({ model: 'local/test-speech', input: 'Voice.', voice: 'stock', responseFormat: 'wav' }, { allowDiscoveredModel: true }), /MP3 or PCM/);
  assert.throws(() => adapter.buildSpeechSynthesisRequest({ model: 'local/test-speech', input: 'Voice', voice: 'stock', inputReferences: [{ url: 'https://fixture.test/consented.wav' }] }, { allowDiscoveredModel: true }), /not both/);
  const seedModel = 'bytedance-seed/seed-audio-1-0';
  const samples = [{ url: 'https://fixture.test/one.wav' }, { url: 'https://fixture.test/two.wav' }];
  assert.equal(adapter.buildSpeechSynthesisRequest({ model: seedModel, input: '@Audio1 First. @Audio2 Second.', inputReferences: samples }, { allowDiscoveredModel: true }).input_references.length, 2);
  for (const text of ['Both clips but no explicit speakers.', '@Audio1 Only one clip addressed.', '@Audio1 First. @Audio3 Missing clip.']) assert.throws(() => adapter.buildSpeechSynthesisRequest({ model: seedModel, input: text, inputReferences: samples }, { allowDiscoveredModel: true }), /matching @Audio/);
  assert.throws(() => adapter.buildSpeechSynthesisRequest({ model: seedModel, input: '@Audio1 No sample.', voice: 'stock' }, { allowDiscoveredModel: true }), /matching @Audio/);
  for (const reference of [{ url: 'https://fixture.test/one.wav', data: 'AAAA' }, { url: 'file:///private.wav' }, { url: 'https://user:password@fixture.test/one.wav' }, { data: 'A'.repeat(20 * 1024 * 1024 + 1) }]) assert.throws(() => adapter.buildSpeechSynthesisRequest({ model: seedModel, input: 'One sample.', inputReferences: [reference] }, { allowDiscoveredModel: true }), /reference|Reference/);
  for (const endpoints of [[{ supports_voice_cloning: true }], [{ supports_voice_cloning: true, supports_multiple_audio_references: true }, { supports_voice_cloning: true, supports_multiple_audio_references: false }], [{ supports_voice_cloning: true, supports_multiple_audio_references: true }]]) {
    let posts = 0; let fences = 0;
    const supported = endpoints.every(endpoint => endpoint.supports_multiple_audio_references === true);
    const operation = adapter.synthesizeSpeech({ model: seedModel, input: '@Audio1 First. @Audio2 Second.', inputReferences: samples, responseFormat: 'mp3' }, {
      apiKey: 'isolated-test-key', allowDiscoveredModel: supported, fallbackModels: [], beforeMediaSubmit: async () => { fences++; },
      fetch: async (url, init) => {
        if (String(url).endsWith('/models?output_modalities=speech')) return new Response(JSON.stringify({ data: [{ id: seedModel }] }), { headers: { 'content-type': 'application/json' } });
        if (String(url).endsWith('/endpoints')) return new Response(JSON.stringify({ data: { endpoints } }), { headers: { 'content-type': 'application/json' } });
        assert.equal(init.method, 'POST'); posts++; assert.deepEqual(JSON.parse(init.body).input_references, samples.map(input_audio => ({ type: 'input_audio', input_audio })));
        return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } });
      },
    });
    if (supported) assert.equal((await operation).body.byteLength, 3); else await assert.rejects(operation, /Multiple reference/);
    assert.equal(posts, supported ? 1 : 0); assert.equal(fences, supported ? 1 : 0);
  }

}

testMockedProviderContract().then(() => {
  console.log(JSON.stringify({ ok: true, checked: 'eight-video-type-routing-capability-cost-and-provider-contracts' }));
}).catch((error) => { console.error(error); process.exitCode = 1; });

console.log(JSON.stringify({ ok: true, checked: 'eight-video-type-routing-capability-and-cost-contracts' }));
