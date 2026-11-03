const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const h = require('./run-operation-controls.cjs');
const v = new Proxy({}, { get: () => () => ({}) });
const modelId = 'black-forest-labs/flux-3-video';
const previousJobId = 'gen-vid-123-abcdefghijklmnopqrst';
const acceptedId = 'gen-vid-456-abcdefghijklmnopqrst';
const model = { ...h.model, modelId, canonicalSlug: 'fixture-flux-3', supportedDurations: [5], reviewedOperations: ['EXTEND'], pricingSkus: { cents_per_second_video_continuation_720p: 41 } };
const catalog = [{ id: modelId, ...model, allowedPassthroughParameters: model.supportedParameters }];
const discovery = { discoverOpenRouterVideoModels: async () => catalog };
const rejectionBody = JSON.stringify({ error: { code: 'invalid_request', param: 'previous_job_id', message: 'PRIVATE_PROVIDER_TOKEN https://private.invalid/media?secret=PRIVATE_PROMPT', raw: 'BASE64_PRIVATE_MEDIA' } });
const types = h.compile('src/lib/ai/types.ts');
const capabilities = h.compile('src/lib/ai/capabilities.ts', { './model-registry': h.registry, './types': types });
const adapter = h.compile('src/lib/adapters/openrouter-adapter.ts', { '../ai/capabilities': capabilities, '../ai/model-registry': h.registry, '../ai/model-discovery': discovery, '../ai/types': types });
const worker = h.compile('convex/generationWorker.ts', {
  './_generated/server': { internalAction: value => value }, './_generated/api': { internal: h.api }, 'convex/values': { v },
  '../src/lib/ai/video-routing': h.routing, './preparationWorker': {},
  './generationWorkerContracts': { ...h.contracts, workerEnabled: () => true },
  '../src/lib/ai/model-discovery': discovery, '../src/lib/adapters/openrouter-adapter': adapter,
});

async function fixture() {
  const state = h.backendFixture({ operation: 'EXTEND', audioPolicy: 'SILENT', previousJobId }, [], (state, ctx, auth) => h.compile('convex/videoRouting.ts', {
    './_generated/server': { query: value => value, mutation: value => value, action: value => value, internalQuery: value => value, internalMutation: value => value },
    './_generated/api': { internal: h.api }, 'convex/values': { v }, './authorization': { requireProjectRole: auth, requireMember: auth, requireAdmin: auth },
    '../src/lib/ai/video-routing': h.routing, './generationWorkerContracts': h.contracts,
    './generationContinuity': { resolveGenerationContinuity: async (_, args) => ({ referenceAssetIds: args.referenceAssetIds }) },
  }));
  state.rows.set('catalog', { ...model, _id: 'catalog', table: 'videoModelCatalog', studioExternalId: 'studio', lastSeenAt: Date.now(), reviewedAt: Date.now(), reviewedCatalogFingerprint: h.routing.videoCatalogFingerprint(model) });
  state.rows.set('policy', { _id: 'policy', table: 'videoRoutePolicies', studioExternalId: 'studio', videoType: 'SOCIAL_CUTDOWN', qualityTier: 'STANDARD', path: 'AI_VIDEO', preferredModelIds: [modelId], maxCostUsd: 10, updatedAt: 1 });
  state.rows.get('source-job').model = modelId;
  state.rows.get('source-take').model = modelId;
  state.rows.get('shot').durationSeconds = 5;
  const made = await state.create({ model: modelId });
  state.jobId = made._id;
  state.fences = 0;
  state.workerCtx = {
    runQuery: async ref => { assert.equal(ref, 'generationJobs.getWorkerInput'); const job = state.rows.get(made._id); return { job, request: job.request, references: [] }; },
    runMutation: async (ref, args) => {
      assert.ok(ref.startsWith('generationJobs.'));
      const name = ref.slice('generationJobs.'.length);
      if (name === 'fenceSubmission') state.fences++;
      assert.equal(typeof state.jobs[name]?.handler, 'function', name);
      return state.jobs[name].handler(state.ctx, args);
    },
  };
  return state;
}

let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
async function withTransport(outcome, run) {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'offline-fixture-key';
  const requests = [];
  global.fetch = async (url, init) => {
    assert.ok(String(url).startsWith('https://openrouter.ai/api/v1/videos'));
    if (init.method === 'GET') return new Response(JSON.stringify({ id: acceptedId, status: 'queued' }), { status: 200 });
    assert.equal(url, 'https://openrouter.ai/api/v1/videos');
    assert.equal(init.method, 'POST');
    requests.push(JSON.parse(init.body));
    if (outcome === 'network') throw new TypeError('offline fixture network failure');
    if (outcome === 'timeout') throw Object.assign(new Error('offline fixture abort'), { name: 'AbortError' });
    if (typeof outcome === 'function') return outcome();
    return outcome === 202
      ? new Response(JSON.stringify({ id: acceptedId, status: 'queued' }), { status: 202, headers: { 'x-request-id': 'req_fixture123456' } })
      : new Response(rejectionBody, { status: outcome, headers: { 'x-request-id': 'req_fixture123456' } });
  };
  try { await run(requests); }
  finally { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = originalKey; }
}
async function main() {
  await check('real builder omits absent and empty references, preserving populated image/audio/video controls', () => {
    const input = { model: modelId, prompt: 'fixture', duration: 5, aspectRatio: '16:9', resolution: '720p', generateAudio: false, previousJobId };
    const absent = adapter.buildVideoGenerationRequest(input, { allowDiscoveredModel: true });
    assert.deepEqual(adapter.buildVideoGenerationRequest({ ...input, frameImages: [], inputReferences: [] }, { allowDiscoveredModel: true }), absent);
    assert.equal(Object.hasOwn(absent, 'frame_images'), false);
    assert.equal(Object.hasOwn(absent, 'input_references'), false);
    const full = adapter.buildVideoGenerationRequest({ ...input, previousJobId: undefined, frameImages: [{ url: 'https://fixture.invalid/first', frameType: 'first_frame' }], inputReferences: ['image', 'audio', 'video'].map(kind => ({ kind, url: `https://fixture.invalid/${kind}` })) }, { allowDiscoveredModel: true });
    assert.equal(full.frame_images[0].frame_type, 'first_frame');
    assert.deepEqual(full.input_references.map(ref => ref.type), ['image_url', 'audio_url', 'video_url']);
  });
  await check('actual worker through real adapter serializes exact continuation and one fenced POST, then polls accepted job', async () => {
    await withTransport(202, async requests => {
      const state = await fixture();
      await worker.run.handler(state.workerCtx, { jobId: state.jobId });
      assert.deepEqual(requests, [{ model: modelId, prompt: 'Continue', aspect_ratio: '16:9', duration: 5, resolution: '720p', previous_job_id: previousJobId, generate_audio: false }]);
      assert.equal(state.fences, 1);
      assert.equal(state.rows.get(state.jobId).providerJobId, acceptedId);
      // Make the next bounded poll due. No second submission/fallback is allowed.
      state.rows.get(state.jobId).nextAttemptAt = 0;
      await worker.run.handler(state.workerCtx, { jobId: state.jobId });
      assert.equal(requests.length, 1);
      assert.equal(state.fences, 1);
      assert.equal(state.creditSettlements.length, 0);
      assert.equal(state.providerSettlements.length, 0);
    });
  });
  await check('actual 400 rejection invokes financial RELEASE and cannot automatically POST again', async () => {
    await withTransport(400, async requests => {
      const state = await fixture();
      await worker.run.handler(state.workerCtx, { jobId: state.jobId });
      const job = state.rows.get(state.jobId);
      assert.equal(job.status, 'FAILED'); assert.equal(job.errorCode, 'INVALID_REQUEST'); assert.equal(job.providerJobId, undefined);
      assert.deepEqual(job.response.submissionDiagnostic, {
        version: 1, controlFingerprint: createHash('sha256').update(JSON.stringify({ duration: 5, aspectRatio: '16:9', resolution: '720p', generateAudio: false, continuation: true, frameImageCount: 0, inputReferenceCount: 0 })).digest('hex'),
        httpStatus: 400, requestId: 'req_fixture123456', providerCode: 'invalid_request', providerParam: 'previous_job_id',
        responseDigest: createHash('sha256').update(rejectionBody).digest('hex'),
      });
      for (const token of ['PRIVATE_', 'https:', 'BASE64_', 'providerMessage']) assert.equal(JSON.stringify(job.response).includes(token), false);
      const detail = await state.jobs.get.handler(state.ctx, { jobId: state.jobId });
      const list = await state.jobs.list.handler(state.ctx, { productionId: 'production' });
      for (const projection of [detail, list]) {
        assert.equal(JSON.stringify(projection).includes('submissionDiagnostic'), false);
        assert.equal(JSON.stringify(projection).includes('req_fixture123456'), false);
      }
      assert.deepEqual(state.creditSettlements.map(row => row.outcome), ['RELEASE']);
      assert.deepEqual(state.providerSettlements.map(row => row.accepted), [false]);
      await worker.run.handler(state.workerCtx, { jobId: state.jobId });
      assert.equal(requests.length, 1); assert.equal(state.fences, 1);
    });
  });
  await check('actual 408/5xx/network/abort remain uncertain with retained accounting authority and no repeat POST', async () => {
    for (const outcome of [408, 500, 'network', 'timeout']) await withTransport(outcome, async requests => {
      const state = await fixture();
      await worker.run.handler(state.workerCtx, { jobId: state.jobId });
      const job = state.rows.get(state.jobId);
      assert.equal(job.status, 'PROCESSING'); assert.equal(job.executionStage, 'RECONCILIATION_REQUIRED'); assert.equal(job.providerJobId, undefined);
      assert.match(job.response.submissionDiagnostic.controlFingerprint, /^[0-9a-f]{64}$/);
      assert.equal(job.response.submissionDiagnostic.httpStatus, typeof outcome === 'number' ? outcome : undefined);
      assert.deepEqual(state.creditSettlements.map(row => row.outcome), ['COMMIT']);
      assert.deepEqual(state.providerSettlements.map(row => row.accepted), [true]);
      await worker.run.handler(state.workerCtx, { jobId: state.jobId });
      assert.equal(requests.length, 1); assert.equal(state.fences, 1);
      assert.equal(state.creditSettlements.some(row => row.outcome === 'RELEASE'), false);
      assert.equal(state.providerSettlements.some(row => row.accepted === false), false);
    });
  });
  await check('bounded malformed/oversized/interrupted error bodies never persist raw content or change HTTP outcome', async () => {
    const broken = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('PRIVATE_PARTIAL')); controller.error(new Error('PRIVATE_READ_FAILURE')); } }), { status: 400 });
    const locked = () => { const response = new Response('PRIVATE_LOCKED_BODY', { status: 400 }); response.body.getReader(); return response; };
    const malformed = () => new Response('PRIVATE_RAW_BODY {not-json', { status: 400, headers: { 'x-request-id': 'https://private.invalid/token' } });
    let canceled = false;
    const oversized = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { canceled = true; } }), { status: 500 });
    for (const make of [broken, locked, malformed, oversized]) await withTransport(make, async requests => {
      const state = await fixture();
      await worker.run.handler(state.workerCtx, { jobId: state.jobId });
      const job = state.rows.get(state.jobId), diagnostic = job.response.submissionDiagnostic;
      const unknown = make === oversized;
      assert.equal(job.executionStage, unknown ? 'RECONCILIATION_REQUIRED' : 'FAILED');
      assert.equal(diagnostic.httpStatus, unknown ? 500 : 400);
      assert.equal(diagnostic.requestId, undefined); assert.equal(diagnostic.providerCode, undefined);
      assert.equal(diagnostic.providerParam, undefined);
      if (make === malformed) assert.equal(diagnostic.responseDigest, createHash('sha256').update('PRIVATE_RAW_BODY {not-json').digest('hex'));
      else assert.equal(diagnostic.responseDigest, undefined, 'no digest of a partial or oversized body');
      assert.equal(JSON.stringify(job.response).includes('PRIVATE_'), false);
      assert.deepEqual(state.creditSettlements.map(row => row.outcome), [unknown ? 'COMMIT' : 'RELEASE']);
      await worker.run.handler(state.workerCtx, { jobId: state.jobId }); assert.equal(requests.length, 1);
    });
    assert.equal(canceled, true);
  });
  await check('actual failure persistence re-sanitizes diagnostics after lease and terminal guards', async () => {
    const state = await fixture(); await state.fence(state.jobId);
    const safe = { version: 1, controlFingerprint: 'a'.repeat(64), httpStatus: 400, providerCode: 'invalid_request', providerParam: 'duration' };
    const tainted = { ...safe, raw: 'PRIVATE_BODY', message: 'PRIVATE_MESSAGE', requestId: 'https://private.invalid/token' };
    const before = state.writes.length;
    await assert.rejects(state.jobs.fail.handler(state.ctx, { jobId: state.jobId, leaseId: 'wrong-lease', errorCode: 'INVALID_REQUEST', rejected: true, submissionDiagnostic: tainted }), /lease/);
    assert.equal(state.writes.length, before); assert.equal(state.creditSettlements.length, 0);
    await state.jobs.fail.handler(state.ctx, { jobId: state.jobId, leaseId: 'lease', errorCode: 'INVALID_REQUEST', rejected: true, submissionDiagnostic: tainted });
    assert.deepEqual(state.rows.get(state.jobId).response.submissionDiagnostic, safe);
    assert.equal(state.creditSettlements[0].outcome, 'RELEASE');
    const terminalWrites = state.writes.length;
    await state.jobs.fail.handler(state.ctx, { jobId: state.jobId, leaseId: 'wrong-lease', errorCode: 'INVALID_REQUEST', rejected: true, submissionDiagnostic: { ...safe, controlFingerprint: 'b'.repeat(64) } });
    assert.equal(state.writes.length, terminalWrites);
    assert.deepEqual(state.rows.get(state.jobId).response.submissionDiagnostic, safe);
    const invalid = await fixture(); await invalid.fence(invalid.jobId);
    await invalid.jobs.fail.handler(invalid.ctx, { jobId: invalid.jobId, leaseId: 'lease', errorCode: 'INVALID_REQUEST', rejected: true, submissionDiagnostic: { ...safe, version: 99 } });
    assert.equal(invalid.rows.get(invalid.jobId).response.submissionDiagnostic, undefined);
    assert.equal(invalid.creditSettlements[0].outcome, 'RELEASE');
  });
  await check('best-effort diagnostic cancellation cannot stall the authoritative 400 outcome', async () => {
    let canceled = 0;
    const stalledCleanup = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { canceled++; return new Promise(() => {}); } }), { status: 400 });
    await withTransport(stalledCleanup, async requests => {
      const state = await fixture(); let timer;
      try { await Promise.race([
        worker.run.handler(state.workerCtx, { jobId: state.jobId }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Diagnostic cleanup stalled original outcome')), 500); }),
      ]); } finally { clearTimeout(timer); }
      assert.equal(state.rows.get(state.jobId).status, 'FAILED');
      assert.equal(state.rows.get(state.jobId).response.submissionDiagnostic.httpStatus, 400);
      assert.deepEqual(state.creditSettlements.map(row => row.outcome), ['RELEASE']);
      assert.equal(requests.length, 1); assert.equal(canceled, 1);
    });
  });
  await check('diagnostic hashing failure cannot mask rejection or uncertainty and never triggers another POST', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: { digest: async () => { throw new Error('PRIVATE_HASH_FAILURE'); } } } });
    try {
      for (const outcome of [400, 500, 'network']) await withTransport(outcome, async requests => {
        const state = await fixture(); await worker.run.handler(state.workerCtx, { jobId: state.jobId });
        const job = state.rows.get(state.jobId), unknown = outcome !== 400;
        assert.equal(job.executionStage, unknown ? 'RECONCILIATION_REQUIRED' : 'FAILED');
        assert.equal(job.response.submissionDiagnostic, undefined);
        assert.deepEqual(state.creditSettlements.map(row => row.outcome), [unknown ? 'COMMIT' : 'RELEASE']);
        await worker.run.handler(state.workerCtx, { jobId: state.jobId }); assert.equal(requests.length, 1);
      });
    } finally { if (original) Object.defineProperty(globalThis, 'crypto', original); else delete globalThis.crypto; }
  });
  console.log(`Continuation real transport: PASS (${checks}); isolated catalog/fetch/database/accounting seams, actual worker/adapter/job handlers; no network or database calls.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(h.cleanup);
