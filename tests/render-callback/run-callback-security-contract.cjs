const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-callback-contract-'));

function compile(relativePath, outputName) {
  const source = path.join(root, relativePath);
  const output = path.join(temp, outputName);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const result = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: source,
  });
  fs.writeFileSync(output, result.outputText);
  return output;
}

const callback = require(compile('renderer/src/contracts/callback.ts', 'callback.js'));
const now = Date.parse('2026-09-21T12:00:00.000Z');
const secret = 'callback-contract-secret';
const body = callback.createCallbackBody({
  eventId: 'event-1', idempotencyKey: 'render-job-1', jobId: 'job-1', projectId: 'project-1', rendererVersion: 'renderer-v1', attempt: 1,
  eventType: 'render.completed', occurredAt: new Date(now).toISOString(), payload: { leaseId: 'lease-1', storageId: 'storage-1' },
});
const signature = callback.signCallbackBody(body, secret);
const receipts = new Map();
const store = {
  get: async (eventId) => receipts.get(`event:${eventId}`) ?? null,
  getByIdempotencyKey: async (idempotencyKey) => receipts.get(`key:${idempotencyKey}`) ?? null,
  claim: async (receipt) => {
    if (receipts.has(`event:${receipt.eventId}`) || receipts.has(`key:${receipt.idempotencyKey}`)) return 'duplicate';
    receipts.set(`event:${receipt.eventId}`, receipt);
    receipts.set(`key:${receipt.idempotencyKey}`, receipt);
    return 'claimed';
  },
};

(async () => {
  const accepted = await callback.handleRendererCallback(body, signature, secret, store, { now: () => now });
  assert.deepEqual(accepted.result, { status: 'accepted', duplicate: false });
  const duplicateEvent = await callback.handleRendererCallback(body, signature, secret, store, { now: () => now });
  assert.deepEqual(duplicateEvent.result, { status: 'accepted', duplicate: true });

  const differentEvent = callback.createCallbackBody({
    eventId: 'event-2', idempotencyKey: 'render-job-1', jobId: 'job-1', projectId: 'project-1', rendererVersion: 'renderer-v1', attempt: 1,
    eventType: 'render.completed', occurredAt: new Date(now).toISOString(), payload: { leaseId: 'lease-1', storageId: 'storage-1' },
  });
  const duplicateKey = await callback.handleRendererCallback(differentEvent, callback.signCallbackBody(differentEvent, secret), secret, store, { now: () => now });
  assert.equal(duplicateKey.result.status, 'rejected');

  const stale = await callback.handleRendererCallback(body, signature, secret, { get: async () => null, claim: async () => 'claimed' }, { now: () => now + 11 * 60 * 1000 });
  assert.equal(stale.result.status, 'rejected');
  const forged = await callback.handleRendererCallback(body, 'sha256=forged', secret, { get: async () => null, claim: async () => 'claimed' }, { now: () => now });
  assert.equal(forged.result.status, 'rejected');

  const http = fs.readFileSync(path.join(root, 'convex/http.ts'), 'utf8');
  const jobs = fs.readFileSync(path.join(root, 'convex/renderJobs.ts'), 'utf8');
  const schema = fs.readFileSync(path.join(root, 'convex/schema.ts'), 'utf8');

  const renderJobsPath = compile('convex/renderJobs.ts', 'renderJobs.js');
  const manifestPath = compile('renderer/src/manifest.ts', 'renderer-manifest.js');
  compile('renderer/src/types.ts', 'types.js');
  compile('renderer/src/templates/contract.ts', 'templates/contract.js');
  const workerPolicyPath = compile('convex/renderWorkerContracts.ts', 'renderWorkerContracts.js');
  const Module = require('node:module');
  const originalLoad = Module._load;
  const fixedNow = now + 60_000;
  const job = { _id: 'job-1', idempotencyKey: 'render-job-1', projectId: 'project-1', studioExternalId: 'studio-1', studioId: 'studio-1', productionId: 'production-1', status: 'PROCESSING', progress: 5, leaseId: 'lease-1', leaseExpiresAt: fixedNow + 300_000, preset: 'HD', manifestId: 'manifest-1' };
  const receipts = new Map();
  const fakeExports = new Map();
  const context = {
    db: {
      get: async (id) => id === job._id ? job : id === 'storage-1' ? { _id: id, sha256: 'sha256:fixture', contentType: 'video/mp4', size: 10 } : receipts.get(id) ?? fakeExports.get(id) ?? null,
      query: (table) => ({ withIndex: (_index, builderCallback) => {
        const constraints = {};
        const builder = { eq: (field, value) => { constraints[field] = value; return builder; } };
        builderCallback(builder);
        const values = table === 'renderCallbackReceipts' ? [...receipts.values()].filter((row) => Object.entries(constraints).every(([field, value]) => row[field] === value)) : table === 'exports' ? [...fakeExports.values()].filter((row) => Object.entries(constraints).every(([field, value]) => row[field] === value)) : [];
        return { unique: async () => values.length > 1 ? (() => { throw new Error('duplicate rows'); })() : values[0] ?? null, collect: async () => values, take: async (limit) => values.slice(0, limit) };
      } }),
      insert: async (table, value) => { const id = `${table}-${receipts.size + fakeExports.size + 1}`; const row = { ...value, _id: id }; if (table === 'renderCallbackReceipts') receipts.set(id, row); else fakeExports.set(id, row); return id; },
      patch: async (id, value) => { if (id === job._id) Object.assign(job, value); else if (receipts.has(id)) Object.assign(receipts.get(id), value); else if (fakeExports.has(id)) Object.assign(fakeExports.get(id), value); },
      system: { get: async (_table, id) => id === 'storage-1' ? { _id: id, sha256: 'sha256:fixture', contentType: 'video/mp4', size: 10 } : null },
    },
    scheduler: { runAfter: async () => undefined },
  };
  Module._load = function load(request, parent, isMain) {
    if (request === 'convex/values') return { v: { union: (...values) => values, literal: (value) => value, id: (value) => value, optional: (value) => value, string: () => 'string', number: () => 'number', boolean: () => 'boolean', any: () => 'any', null: () => 'null' } };
    if (request === './_generated/server') return { internalAction: (definition) => definition, internalMutation: (definition) => definition, mutation: (definition) => definition, query: (definition) => definition };
    if (request === '../renderer/src/manifest') return originalLoad.call(this, manifestPath, parent, isMain);
    if (request === './renderWorkerContracts') return originalLoad.call(this, workerPolicyPath, parent, isMain);
    if (request === './_generated/api') return { internal: { renderJobs: {} } };
    if (request === './authorization') return { requireMember: async () => ({ studio: { externalId: 'studio-1', _id: 'studio-1' } }), requireProjectRole: async () => ({}) };
    if (request === './_shared') return { now: () => fixedNow };
    return originalLoad.call(this, request, parent, isMain);
  };
  let renderJobs;
  try { renderJobs = require(renderJobsPath); } finally { Module._load = originalLoad; }
  const secureArgs = { jobId: job._id, leaseId: job.leaseId, event: 'COMPLETED', eventId: 'event-secure-1', idempotencyKey: job.idempotencyKey, projectId: job.projectId, eventType: 'render.completed', occurredAt: now, attempt: 1, payloadHash: 'payload-hash', signature: 'sha256:signature', storageId: 'storage-1' };
  const completed = await renderJobs.applyRendererCallback.handler(context, secureArgs);
  assert.equal(completed.job.status, 'COMPLETED');
  assert.equal(receipts.size, 1);
  const replay = await renderJobs.applyRendererCallback.handler(context, secureArgs);
  assert.equal(replay.duplicate, true, 'the same callback event must be replay-safe');
  receipts.clear();
  job.status = 'PROCESSING';
  job.leaseId = 'lease-2';
  await assert.rejects(() => renderJobs.applyRendererCallback.handler(context, { ...secureArgs, eventId: 'event-wrong-lease', leaseId: 'wrong-lease' }), /lease/);

  assert.match(http, /request\.text\(\)/, 'Convex must sign the raw request body');
  assert.match(http, /x-finalframe-renderer-signature/, 'Convex must require the renderer signature header');
  assert.match(http, /crypto\.subtle/, 'Convex must verify HMAC with Web Crypto');
  assert.match(http, /CALLBACK_STALE/, 'stale callbacks must be rejected');
  assert.match(http, /internal\.renderJobs\.applyRendererCallback/, 'only the internal callback mutation may apply effects');
  assert.match(jobs, /renderCallbackReceipts/, 'callbacks must claim durable receipts');
  assert.match(jobs, /export const callback = internalMutation/, 'browser clients must not call the renderer callback mutation');
  assert.match(jobs, /idempotencyKey !== \(job\.callbackIdempotencyKey \?\? job\.idempotencyKey\)/, 'callback idempotency must match the job');
  assert.match(jobs, /job\.leaseId !== args\.leaseId/, 'callbacks must match the active lease');
  assert.match(jobs, /status === "COMPLETED"/, 'completed-job callbacks must be idempotent');
  assert.match(schema, /renderCallbackReceipts: defineTable/, 'receipt storage must be schema-backed');
  console.log(JSON.stringify({ ok: true, checked: 'renderer-callback-signature-replay-lease-security' }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
