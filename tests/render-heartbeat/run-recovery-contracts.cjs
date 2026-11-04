const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createHmac, createHash, webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
globalThis.crypto ??= webcrypto;
function load(file, imports = {}) {
  const filename = path.join(root, file);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod); mod.require = id => Object.hasOwn(imports, id) ? imports[id] : normal(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);
  return mod.exports;
}
const policy = load('convex/renderHeartbeatPolicy.ts');
const worker = load('convex/renderWorkerContracts.ts');
const recovery = load('src/lib/render/recovery.ts');
const outputFormats = load('renderer/src/output-format.ts');
const graphicsContract = load('renderer/src/templates/graphics-v2-contract.ts');
const graphicsCertificate = load('renderer/src/templates/graphics-v2-certificate.ts', {'./graphics-v2-contract.js':graphicsContract});
const internal = new Proxy({}, { get: (_, module) => new Proxy({}, { get: (_, fn) => String(module) + '.' + String(fn) }) });
const server = { internalMutation: value => ({ ...value, visibility: 'internal' }), internalAction: value => value, mutation: value => ({ ...value, visibility: 'public' }), query: value => value };
let checks = 0;
async function check(label, fn) { await fn(); checks++; console.log('PASS ' + label); }
function fixture() {
  const state = { time: Date.now(), rows: new Map(), writes: [], scheduled: [], serial: 0, storage: { size: 512, contentType: 'video/mp4', sha256: 'canonical-checksum' } };
  const put = (table, row) => state.rows.set(row._id, { table, ...row });
  put('projects', { _id: 'project', studioExternalId: 'studio', metadata: { fixtureMarker: 'finalframe-dev-fixture-v1' } });
  put('manifests', { _id: 'manifest', projectId: 'project', productionId: 'production', contractVersion: 5, manifest: { version: 5, projectId: 'project', productionId: 'production', manifestId: 'manifest', output: { codec: 'h264' }, export: { format: 'MP4' } } });
  put('renderJobs', { _id: 'job', productionId: 'production', projectId: 'project', manifestId: 'manifest', studioExternalId: 'studio', status: 'SUBMITTED', executionStage: 'AWAITING_CALLBACK', acceptedAt: state.time - 10 * 60_000, startedAt: state.time - 10 * 60_000, leaseId: 'lease', leaseExpiresAt: state.time - 1, dispatchAttempt: 1, idempotencyKey: 'render-request', callbackIdempotencyKey: 'render-request:attempt:1', dispatchPayload: { manifest: { manifestId: 'manifest' } }, progress: 80, preset: 'LANDSCAPE' });
  const ctx = { db: {
    get: async id => state.rows.get(id) || null,
    system: { get: async (_table, id) => id === 'storage' ? state.storage : null },
    insert: async (table, value) => { const id = table + '-' + (++state.serial); put(table, { _id: id, ...value }); state.writes.push({ table, id }); return id; },
    patch: async (id, patch) => { state.rows.set(id, { ...state.rows.get(id), ...patch }); state.writes.push({ id, patch }); },
    query: table => { const filters = []; const matches = () => [...state.rows.values()].filter(row => row.table === table && filters.every(([key, value]) => row[key] === value)); const chain = { withIndex: (_, select) => { const q = { eq: (key, value) => { filters.push([key, value]); return q; } }; select(q); return chain; }, unique: async () => matches()[0] || null, take: async n => matches().slice(0, n) }; return chain; },
  }, scheduler: { runAfter: async (...args) => state.scheduled.push(args) } };
  const jobs = load('convex/renderJobs.ts', { './_generated/api': { internal }, './_generated/server': server, './authorization': { requireMember: async () => ({ studio: { externalId: 'studio' } }), requireProjectRole: async () => ({ project: state.rows.get('project'), user: { _id: 'user' } }) }, './_shared': { now: () => state.time }, '../renderer/src/templates/graphics-v2-certificate':graphicsCertificate, './graphicsAssets': { resolveGraphicImage: async () => { throw new Error('Poster dispatch is outside this accepted-callback fixture.'); } }, '../renderer/src/media/sha256': load('renderer/src/media/sha256.ts'), './renderHeartbeatPolicy': policy, '../renderer/src/manifest': { validateLockedManifest: () => ({ ok: true }) }, '../renderer/src/output-format': outputFormats, './movieAuthority': { authorizeMovieRenderContext: async () => { throw new Error('Ordinary recovery fixture cannot authorize movie rendering.'); } }, './renderWorkerContracts': worker, '../src/lib/render/recovery': recovery });
  const heartbeats = load('convex/renderHeartbeat.ts', { './_generated/api': { internal }, './_generated/server': server, './renderHeartbeatPolicy': policy, './renderWorkerContracts': worker });
  state.invoke = async (definition, args) => {
    const rows = structuredClone(state.rows); const beforeWrites = state.writes.length; const beforeSchedules = state.scheduled.length;
    try { return await definition.handler(ctx, args); } catch (error) { state.rows = rows; state.writes.length = beforeWrites; state.scheduled.length = beforeSchedules; throw error; }
  };
  state.ctx = ctx; state.jobs = jobs; state.heartbeats = heartbeats;
  state.callback = (patch = {}) => ({ jobId: 'job', projectId: 'project', leaseId: 'lease', attempt: 1, idempotencyKey: 'render-request:attempt:1', eventId: 'completion-event', event: 'COMPLETED', eventType: 'render.completed', occurredAt: state.time - 5 * 60_000, verifiedDeliveryAt: state.time, payloadHash: 'exact-body-hash', storageId: 'storage', mimeType: 'video/mp4', checksum: 'canonical-checksum', ...patch });
  state.expire = () => state.invoke(jobs.expireLease, { jobId: 'job', leaseId: 'lease' });
  state.getJob = () => state.rows.get('job');
  state.receipts = () => [...state.rows.values()].filter(row => row.table === 'renderCallbackReceipts');
  return state;
}
function httpRoutes(state) {
  const routes = new Map();
  load('convex/http.ts', { 'convex/server': { httpRouter: () => ({ route: route => routes.set(route.path, route.handler) }) }, './_generated/server': { httpAction: value => value }, './_generated/api': { internal }, './auth': { auth: { addHttpRoutes() {} } }, './renderHeartbeatPolicy': policy, './reviewMediaContract': load('convex/reviewMediaContract.ts') });
  state.ctx.runMutation = async (ref, args) => state.invoke(ref === 'renderHeartbeat.apply' ? state.heartbeats.apply : state.jobs.applyRendererCallback, args);
  return routes;
}
const secret = 'isolated-protocol-test-secret';
function signedRequest(route, body, delivery = true) {
  const sign = value => 'sha256=' + createHmac('sha256', secret).update(value).digest('hex');
  const timestamp = new Date().toISOString();
  return new Request('https://fixture.convex.site' + route, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret, 'x-finalframe-renderer-signature': sign(body), ...(delivery ? { 'x-finalframe-delivery-timestamp': timestamp, 'x-finalframe-delivery-signature': sign(timestamp + '\n' + body) } : {}) } });
}
async function main() {
  await check('accepted expiry retains original lease/attempt/key and blocks dispatch or automatic rerender', async () => {
    const state = fixture(); const original = structuredClone(state.getJob()); await state.expire();
    assert.equal(state.getJob().executionStage, 'RECONCILIATION_REQUIRED');
    for (const key of ['acceptedAt', 'leaseId', 'dispatchAttempt', 'callbackIdempotencyKey', 'dispatchPayload']) assert.deepEqual(state.getJob()[key], original[key]);
    assert(!state.scheduled.some(args => ['renderJobs.wake', 'renderJobs.dispatch'].includes(args[1])));
    assert.equal(await state.invoke(state.jobs.prepareForRenderer, { jobId: 'job' }), null);
    state.time = original.acceptedAt + policy.RENDER_ATTEMPT_MAX_MS + 1; await state.expire();
    assert.equal(state.getJob().executionStage, 'NEEDS_ATTENTION'); assert.equal(state.getJob().leaseId, 'lease'); assert.equal(state.receipts().length, 0);
  });
  await check('same accepted attempt reconciles verified stored completion after whole-backend outage', async () => {
    const state = fixture(); await state.expire(); state.rows.get('project').moderationStatus = 'RESTRICTED';
    const result = await state.invoke(state.jobs.applyRendererCallback, state.callback());
    assert.equal(result.duplicate, false); assert.equal(state.getJob().status, 'COMPLETED'); assert.equal(state.receipts().length, 1);
    assert.equal([...state.rows.values()].find(row => row.table === 'exports').checksum, 'canonical-checksum');
    assert.equal(state.rows.get('project').moderationStatus, 'RESTRICTED', 'retaining accepted output never clears exposure restrictions');
  });
  await check('recovery cannot bypass different lease/attempt/project/key, new failure, stale proof or output integrity', async () => {
    for (const patch of [{ leaseId: 'other' }, { attempt: 2 }, { projectId: 'foreign' }, { idempotencyKey: 'other' }, { event: 'FAILED', eventType: 'render.failed' }, { verifiedDeliveryAt: undefined }, { verifiedDeliveryAt: Date.now() - 61_000 }, { occurredAt: Date.now() - policy.RENDER_ATTEMPT_MAX_MS - 1 }, { storageId: 'absent' }, { checksum: 'wrong' }]) {
      const state = fixture(); await state.expire(); const writes = state.writes.length;
      await assert.rejects(state.invoke(state.jobs.applyRendererCallback, state.callback(patch))); assert.equal(state.writes.length, writes); assert.equal(state.receipts().length, 0);
    }
    for (const change of [state => { state.getJob().dispatchAttempt = 2; }, state => { state.getJob().executionStage = 'AWAITING_CALLBACK'; }, state => { state.getJob().acceptedAt = state.time - policy.RENDER_ATTEMPT_MAX_MS - 1; }, state => { state.rows.get('manifest').projectId = 'foreign'; }, state => { state.storage.contentType = 'audio/mpeg'; }]) {
      const state = fixture(); await state.expire(); change(state);
      await assert.rejects(state.invoke(state.jobs.applyRendererCallback, state.callback())); assert.equal(state.receipts().length, 0);
    }
  });
  await check('unaccepted expired work cannot use accepted completion recovery', async () => {
    const state = fixture(); state.getJob().acceptedAt = undefined; await state.expire();
    assert.equal(state.getJob().status, 'RETRYING'); assert.equal(state.getJob().leaseId, undefined);
    await assert.rejects(state.invoke(state.jobs.applyRendererCallback, state.callback())); assert.equal(state.receipts().length, 0);
  });
  await check('exact applied receipt replay is a no-op for24h with fresh delivery, never a new completion', async () => {
    const state = fixture(); await state.expire(); const original = state.callback(); await state.invoke(state.jobs.applyRendererCallback, original); const writes = state.writes.length;
    state.time += 12 * 60 * 60_000;
    assert.equal((await state.invoke(state.jobs.applyRendererCallback, { ...original, verifiedDeliveryAt: state.time })).duplicate, true); assert.equal(state.writes.length, writes);
    await assert.rejects(state.invoke(state.jobs.applyRendererCallback, { ...original, verifiedDeliveryAt: state.time, payloadHash: 'different' }));
    await assert.rejects(state.invoke(state.jobs.applyRendererCallback, { ...original, verifiedDeliveryAt: undefined }));
    state.time += 13 * 60 * 60_000; await assert.rejects(state.invoke(state.jobs.applyRendererCallback, { ...original, verifiedDeliveryAt: state.time }));
  });
  await check('actual signed HTTP completion recovers expired accepted lease while invalid delivery stays denied', async () => {
    const state = fixture(); await state.expire(); const routes = httpRoutes(state);
    const body = JSON.stringify({ version: 1, eventId: 'http-completion', eventType: 'render.completed', idempotencyKey: 'render-request:attempt:1', jobId: 'job', projectId: 'project', rendererVersion: 'test', occurredAt: new Date(state.time - 11 * 60_000).toISOString(), attempt: 1, payload: { leaseId: 'lease', storageId: 'storage', mimeType: 'video/mp4', checksum: 'canonical-checksum' } });
    assert.equal((await routes.get('/renderer/callback')(state.ctx, signedRequest('/renderer/callback', body, false))).status, 400);
    assert.equal((await routes.get('/renderer/callback')(state.ctx, signedRequest('/renderer/callback', body))).status, 202);
    assert.equal((await routes.get('/renderer/callback')(state.ctx, signedRequest('/renderer/callback', body))).status, 200);
    assert.equal(state.receipts()[0].payloadHash, createHash('sha256').update(body).digest('hex'));
  });
  await check('HTTP late delivery acknowledges only the exact previously applied receipt without new side effects', async () => {
    const state = fixture(); const currentTime = state.time; state.time -= 12 * 60 * 60_000;
    Object.assign(state.getJob(), { acceptedAt: state.time - 60_000, leaseExpiresAt: state.time - 1 }); await state.expire();
    const envelope = { version: 1, eventId: 'historical-completion', eventType: 'render.completed', idempotencyKey: 'render-request:attempt:1', jobId: 'job', projectId: 'project', rendererVersion: 'test', occurredAt: new Date(state.time).toISOString(), attempt: 1, payload: { leaseId: 'lease', storageId: 'storage', checksum: 'canonical-checksum' } };
    const body = JSON.stringify(envelope);
    await state.invoke(state.jobs.applyRendererCallback, state.callback({ eventId: envelope.eventId, occurredAt: state.time, payloadHash: createHash('sha256').update(body).digest('hex') }));
    state.time = currentTime; const routes = httpRoutes(state); const writes = state.writes.length;
    assert.equal((await routes.get('/renderer/callback')(state.ctx, signedRequest('/renderer/callback', body))).status, 200);
    assert.equal(state.writes.length, writes);
    assert.equal((await routes.get('/renderer/callback')(state.ctx, signedRequest('/renderer/callback', JSON.stringify({ ...envelope, eventId: 'new-late-event' })))).status, 409);
    assert.equal(state.writes.length, writes);
  });
  await check('signed pending-acceptance heartbeat gets425 without renewal then200 after same-lease ack', async () => {
    const state = fixture(); Object.assign(state.getJob(), { status: 'PROCESSING', acceptedAt: undefined, leaseExpiresAt: state.time + 60_000, dispatchLeaseId: 'http-lease' });
    const routes = httpRoutes(state); const originalExpiry = state.getJob().leaseExpiresAt;
    const body = patch => JSON.stringify({ version: 1, eventId: 'heartbeat', jobId: 'job', projectId: 'project', leaseId: 'lease', attempt: 1, occurredAt: new Date().toISOString(), stage: 'RENDERING', ...patch });
    assert.equal((await routes.get('/renderer/heartbeat')(state.ctx, signedRequest('/renderer/heartbeat', body(), false))).status, 425); assert.equal(state.getJob().leaseExpiresAt, originalExpiry); assert.equal(state.writes.length, 0);
    assert.equal((await routes.get('/renderer/heartbeat')(state.ctx, signedRequest('/renderer/heartbeat', body({ leaseId: 'wrong' }), false))).status, 409);
    await state.invoke(state.jobs.recordAcceptance, { jobId: 'job', leaseId: 'lease', dispatchLeaseId: 'http-lease', rendererJobId: 'job' });
    assert.equal((await routes.get('/renderer/heartbeat')(state.ctx, signedRequest('/renderer/heartbeat', body(), false))).status, 200); assert(state.getJob().leaseExpiresAt > originalExpiry);
  });
  await check('legacy claim/renew are internal and require private flags/key/marker with bounded wallclock', async () => {
    const state = fixture(); assert.equal(state.jobs.claim.visibility, 'internal'); assert.equal(state.jobs.renewLease.visibility, 'internal');
    Object.assign(state.getJob(), { status: 'QUEUED', acceptedAt: undefined, leaseId: undefined, startedAt: undefined });
    process.env.FINALFRAME_RENDER_WORKER_ENABLED = 'false'; process.env.FINALFRAME_DEV_FIXTURES = 'true'; process.env.FINALFRAME_DEV_FIXTURE_ENV = 'development'; process.env.FINALFRAME_DEV_FIXTURE_KEY = 'private-key';
    await assert.rejects(state.invoke(state.jobs.claim, { jobId: 'job', fixtureKey: 'wrong-key' })); assert.equal(state.writes.length, 0);
    for (const [key, invalid] of [['FINALFRAME_RENDER_WORKER_ENABLED', 'true'], ['FINALFRAME_DEV_FIXTURES', 'false'], ['FINALFRAME_DEV_FIXTURE_ENV', 'production']]) {
      const previous = process.env[key]; process.env[key] = invalid;
      await assert.rejects(state.invoke(state.jobs.claim, { jobId: 'job', fixtureKey: 'private-key' }), /internally/); process.env[key] = previous;
    }
    state.getJob().startedAt = state.time - policy.RENDER_ATTEMPT_MAX_MS - 1;
    await assert.rejects(state.invoke(state.jobs.claim, { jobId: 'job', fixtureKey: 'private-key' }), /wallclock/);
    state.getJob().startedAt = state.time - policy.RENDER_ATTEMPT_MAX_MS + 10_000;
    const claim = await state.invoke(state.jobs.claim, { jobId: 'job', fixtureKey: 'private-key' }); assert(claim.leaseId);
    assert.equal(state.getJob().leaseExpiresAt, state.time + 10_000); assert.equal(state.scheduled.at(-1)[0], 10_000);
    await state.invoke(state.jobs.renewLease, { jobId: 'job', leaseId: claim.leaseId, fixtureKey: 'private-key' });
    assert.equal(state.getJob().leaseExpiresAt, state.time + 10_000); assert.equal(state.scheduled.at(-1)[0], 10_000);
    state.getJob().startedAt = state.time - policy.RENDER_ATTEMPT_MAX_MS - 1;
    await assert.rejects(state.invoke(state.jobs.renewLease, { jobId: 'job', leaseId: claim.leaseId, fixtureKey: 'private-key' }), /wallclock/);
    state.rows.get('project').metadata = {};
    await assert.rejects(state.invoke(state.jobs.renewLease, { jobId: 'job', leaseId: claim.leaseId, fixtureKey: 'private-key' }), /internally/);
    process.env.FINALFRAME_RENDER_WORKER_ENABLED = 'true';
  });
  console.log('PASS renderer recovery (' + checks + '): actual expiry/callback/heartbeat/private handlers and HTTP signatures; isolated in-memory storage/transactions only, no database/renderer/provider calls.');
}
const previous = Object.fromEntries(['FINALFRAME_RENDER_WORKER_ENABLED', 'FINALFRAME_DEV_FIXTURES', 'FINALFRAME_DEV_FIXTURE_ENV', 'FINALFRAME_DEV_FIXTURE_KEY', 'RENDER_WORKER_SHARED_SECRET'].map(key => [key, process.env[key]]));
process.env.FINALFRAME_RENDER_WORKER_ENABLED = 'true'; process.env.RENDER_WORKER_SHARED_SECRET = secret;
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
