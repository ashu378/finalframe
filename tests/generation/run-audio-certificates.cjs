const assert = require('node:assert/strict');
const h = require('./run-operation-controls.cjs');
const v = new Proxy({}, { get: () => () => ({}) });
const sample = { assetId: 'audio', storageId: 'storage', checksum: Buffer.alloc(32,3).toString('base64'), byteSize: 512, durationSeconds: 8.125, audioCodec: 'pcm_s16le', audioFormat: 'wav', durationMeasurement: 'DECODED_PCM_SAMPLES_V1', sampleRate: 48000, channels: 1, hasVideo: false };
function fixture() {
  const state = h.backendFixture({ operation: 'LIP_SYNC', audioPolicy: 'USE_RECORDING' }, ['image', 'audio']);
  state.storage.sha256 = sample.checksum; state.storage.contentType = 'audio/wav'; state.denied = false;
  const auth = async () => { if (state.denied) throw new Error('Forbidden project'); return { project: state.rows.get('project') }; };
  state.module = h.compile('convex/audioCertificates.ts', {
    './_generated/server': { internalAction: value => value, action: value => value, internalQuery: value => ({ ...value, visibility: 'internal' }), internalMutation: value => ({ ...value, visibility: 'internal' }) },
    './voices': {}, '../src/lib/ai/model-registry': h.registry, './_generated/api': { internal: h.api }, 'convex/values': { v }, './authorization': { requireProjectRole: auth }, './generationWorkerContracts': h.contracts,
    './generationContinuity': { resolveGenerationContinuity: async (_, args) => ({ referenceAssetIds: args.referenceAssetIds }) },
  });
  state.ctx.storage.getUrl = async () => 'https://fixture.convex.cloud/api/storage/recording';
  state.args = { productionId: 'production', shotId: 'shot' };
  state.write = (probe = {}, binding = {}) => state.module.recordProbe.handler(state.ctx, { ...state.args, assetId: 'audio', storageId: 'storage', checksum: state.storage.sha256, byteSize: state.storage.size, probe: { ...sample, decodedSampleCount: sample.durationSeconds *16000, decodedSampleRate:16000, hasAudio: true, ...probe }, ...binding });
  state.resolve = () => state.module.resolveAudioSourceCertificate(state.ctx, { projectId: 'project', assetId: 'audio' });
  return state;
}
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
async function main() {
  await check('only internal trusted measurements bind duration to canonical recording bytes', async () => {
    const state = fixture(); state.rows.get('audio').metadata = { durationSeconds: .1, technicalProbe: { durationSeconds: .1 } };
    assert.equal(state.module.recordProbe.visibility, 'internal'); await assert.rejects(state.resolve(), /Measure/); assert.equal(state.writes.length, 0);
    assert.deepEqual(await state.write(), sample); assert.deepEqual(await state.resolve(), sample);
    state.storage.sha256 = 'new-bytes'; await assert.rejects(state.resolve(), /Measure/);
  });
  await check('probe writer rejects invalid media and changed storage without certificate writes', async () => {
    for (const patch of [{ durationSeconds: 0 }, { durationSeconds: NaN }, { hasAudio: false }, { hasVideo: true }, { hasVideo: undefined }, { channels: 0 }, { sampleRate: 0 }, { byteSize: 1000 }, { audioCodec: '' }, { durationMeasurement: undefined }, { decodedSampleCount: 1 }, { decodedSampleRate: 8000 }]) { const state = fixture(); await assert.rejects(state.write(patch)); assert.equal(state.writes.length, 0); }
    for (const binding of [{ checksum: 'forged' }, { storageId: 'foreign' }, { assetId: 'image' }, { byteSize: 1000 }]) { const state = fixture(); await assert.rejects(state.write({}, binding)); assert.equal(state.writes.length, 0); }
  });
  await check('project authorization, lifecycle, current shot and exact audio selection guard probe access', async () => {
    for (const change of [state => state.denied = true, state => state.rows.get('project').moderationStatus = 'RESTRICTED', state => state.rows.get('project').deletedAt = 1, state => state.rows.get('audio').projectId = 'foreign', state => state.rows.get('version').status = 'DRAFT', state => state.rows.get('shot').productionVersionId = 'old', state => state.rows.get('shot').requiredAssetIds = ['image'], state => state.rows.get('shot').requiredAssetIds = ['audio', 'audio']]) {
      const state = fixture(); change(state); await assert.rejects(state.module.sourceContext.handler(state.ctx, state.args)); assert.equal(state.writes.length, 0);
    }
  });
  await check('authenticated no-inference action probes canonical audio and caches trusted facts', async () => {
    const state = fixture(); let calls = 0;
    state.ctx.runQuery = async (_, args) => state.module.sourceContext.handler(state.ctx, args);
    state.ctx.runMutation = async (_, args) => state.module.recordProbe.handler(state.ctx, args);
    const old = { fetch: global.fetch, url: process.env.RENDER_WORKER_URL, secret: process.env.RENDER_WORKER_SHARED_SECRET };
    process.env.RENDER_WORKER_URL = 'https://renderer.fixture'; process.env.RENDER_WORKER_SHARED_SECRET = 'isolated-key';
    global.fetch = async (url, init) => { calls++; assert.equal(url, 'https://renderer.fixture/media/probe'); assert.equal(init.headers['x-finalframe-worker-secret'], 'isolated-key'); assert.equal(init.redirect, 'error'); assert.deepEqual(JSON.parse(init.body), { url: 'https://fixture.convex.cloud/api/storage/recording', kind: 'audio', verifyAudioDuration: true, checksum: sample.checksum, byteSize: sample.byteSize }); return new Response(JSON.stringify({ ...sample, decodedSampleCount: sample.durationSeconds *16000, decodedSampleRate:16000, hasAudio: true })); };
    try { assert.deepEqual(await state.module.prepareSource.handler(state.ctx, state.args), sample); assert.deepEqual(await state.module.prepareSource.handler(state.ctx, state.args), sample); assert.equal(calls, 1); }
    finally { global.fetch = old.fetch; for (const [key, value] of [['RENDER_WORKER_URL', old.url], ['RENDER_WORKER_SHARED_SECRET', old.secret]]) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.equal([...state.rows.values()].filter(row => row.table === 'generationJobs').length, 1, 'measurement creates no new provider job');
  });
  await check('measuring a recording does not certify missing Avatar duration billing or performance controls', async () => {
    const state = fixture(); await state.write();
    for (const operation of ['LIP_SYNC', 'PERFORMANCE_TRANSFER']) assert.equal(h.routing.videoModelSupportsRequest({ ...h.model, modelId: 'heygen/avatar-iv', supportsPerformanceTransfer: true, reviewedOperations: [operation], supportedDurations: [], pricingSkus: { duration_seconds: .05 } }, { videoType: 'SOCIAL_CUTDOWN', task: 'EDIT', operation, durationSeconds: sample.durationSeconds, aspectRatio: '16:9', qualityTier: 'STANDARD', hasImageReferences: true, hasAudioReference: true, hasVideoReference: operation === 'PERFORMANCE_TRANSFER' }), false);
  });
  console.log(`Audio measurement certificates: PASS (${checks}); actual action/internal handlers in isolated memory and injected HTTP only, no database/provider/renderer calls.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(h.cleanup);
