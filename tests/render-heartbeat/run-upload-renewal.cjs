const assert = require('node:assert/strict');
const { createHash, createHmac } = require('node:crypto');
const Module = require('node:module');
const path = require('node:path');
const { fixture } = require('../production-edit/run-finishing-v5.cjs');

const root = path.resolve(__dirname, '../..');
const previousLoad = Module._load;
class FixtureAuthError extends Error { constructor(code, message) { super(message); this.code = code; } }
Module._load = function (id, parent, isMain) {
  if (parent?.filename.includes('/convex/')) {
    if (id === './_generated/server') return { internalMutation: value => value, httpAction: value => value };
    if (id === './auth') return { ConvexAuthError: FixtureAuthError, ConvexAuthorizationError: FixtureAuthError };
  }
  return previousLoad.call(this, id, parent, isMain);
};
const authority = require(path.join(root, 'convex/authorization.ts'));
const withAuthTypes = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === './authorization' && parent?.filename.endsWith('/convex/renderUploadAuthorization.ts')) return authority;
  return withAuthTypes.call(this, id, parent, isMain);
};
const { renew } = require(path.join(root, 'convex/renderUploadAuthorization.ts'));
const { rendererUploadAuthorization } = require(path.join(root, 'convex/renderUploadAuthorizationHttp.ts'));
const checksum = createHash('sha256').update('owned fixture bytes').digest('base64');
const secret = 'local-signed-render-upload-renewal';
const url = 'https://fixture.convex.cloud/api/storage/upload?one';
const previousEnv = { ...process.env };
process.env.FINALFRAME_RENDER_WORKER_ENABLED = 'true';
process.env.FINALFRAME_MOVIE_ENABLED = 'true';
process.env.FINALFRAME_MOVIE_WORKER_ENABLED = 'true';
process.env.RENDER_WORKER_SHARED_SECRET = secret;

function context(movie = false) {
  const ctx = fixture();
  Object.assign(ctx.rows.get('project_1'), { studioId: 'studio_1', ownerUserId: 'user_1', status: 'ACTIVE' });
  ctx.put('users', { _id: 'user_1', externalId: 'owner', status: 'active' });
  ctx.put('studios', { _id: 'studio_1', externalId: 'studio', ownerUserId: 'user_1', ownerExternalId: 'owner', status: 'active' });
  ctx.put('members', { _id: 'member_1', studioId: 'studio_1', userId: 'user_1', status: 'active', role: 'owner' });
  ctx.put('projectMembers', { _id: 'pm_1', projectId: 'project_1', userId: 'user_1', status: 'ACTIVE', role: 'OWNER' });
  const now = Date.now();
  const input = { jobId: 'job_1', projectId: 'project_1', leaseId: 'lease_1', attempt: 1, idempotencyKey: 'callback_1',
    identity: movie ? 'a'.repeat(64) : 'manifest_1', mimeType: 'video/mp4', byteSize: 123, checksum, occurredAt: now };
  const dispatch = { jobId: input.jobId, leaseId: input.leaseId, attempt: input.attempt, idempotencyKey: input.idempotencyKey, storageUploadUrl: 'https://fixture.convex.cloud/api/storage/upload?expired' };
  const job = { _id: input.jobId, projectId: input.projectId, leaseId: input.leaseId, createdByUserId: 'user_1', callbackIdempotencyKey: input.idempotencyKey,
    acceptedAt: now - 60 * 60_000, leaseExpiresAt: now + 30_000, status: movie ? 'PROCESSING' : 'SUBMITTED', executionStage: 'UPLOADING' };
  if (movie) {
    ctx.put('movieExports', { _id: 'movie_output', projectId: input.projectId, movieVersionId: 'movie_version', mergeJobId: job._id, planHash: input.identity, status: 'MERGING' });
    ctx.put('movieMergeJobs', { ...job, movieVersionId: 'movie_version', movieExportId: 'movie_output', planHash: input.identity, attempt: 1,
      dispatchPayload: { ...dispatch, planHash: input.identity, projectId: input.projectId, movieVersionId: 'movie_version', movieExportId: 'movie_output' } });
  } else {
    ctx.put('renderJobs', { ...job, dispatchAttempt: 1, manifestId: input.identity,
      dispatchPayload: { ...dispatch, manifest: { version: 5, manifestId: input.identity, projectId: input.projectId, output: { codec: 'h264' } } } });
  }
  ctx.issues = 0;
  ctx.storage.generateUploadUrl = async () => { ctx.issues++; return url; };
  return { ctx, input };
}

let checks = 0;
async function check(name, action) { await action(); checks++; console.log(`PASS ${name}`); }

(async () => {
  try {
    await check('accepted exact render gets one private URL and immutable dispatch', async () => {
      const { ctx, input } = context();
      const original = structuredClone(ctx.rows.get(input.jobId));
      assert.deepEqual(await renew.handler(ctx, input), { uploadUrl: url });
      assert.deepEqual(await renew.handler(ctx, { ...input, occurredAt: Date.now() }), { uploadUrl: url });
      assert.deepEqual(ctx.rows.get(input.jobId), original);
      assert.equal(ctx.issues, 1);
      assert.equal(ctx.count('renderUploadRenewals'), 1);
      assert.equal(ctx.count('generationJobs'), 0);
      await assert.rejects(renew.handler(ctx, { ...input, byteSize: 124 }), /no longer matches/);
      ctx.rows.get('pm_1').status = 'REMOVED';
      await assert.rejects(renew.handler(ctx, input), /authorized/);
      assert.equal(ctx.issues, 1);
    });
    await check('wrong job, project, lease, attempt, key, manifest or codec cannot mint', async () => {
      const { ctx, input } = context();
      for (const change of [{ jobId: 'foreign' }, { projectId: 'foreign' }, { leaseId: 'wrong' }, { attempt: 2 },
        { idempotencyKey: 'wrong' }, { identity: 'wrong' }, { mimeType: 'video/webm' }, { occurredAt: Date.now() - 65_000 }]) {
        await assert.rejects(renew.handler(ctx, { ...input, ...change }));
      }
      ctx.rows.get(input.jobId).acceptedAt = undefined;
      await assert.rejects(renew.handler(ctx, input), /accepted/);
      assert.equal(ctx.issues, 0);
    });
    await check('movie recovery is limited to the exact accepted plan inside the existing reconciliation window', async () => {
      const { ctx, input } = context(true);
      const job = ctx.rows.get(input.jobId);
      job.leaseExpiresAt = Date.now() - 100;
      await assert.rejects(renew.handler(ctx, input), /accepted/);
      job.executionStage = 'RECONCILIATION_REQUIRED';
      ctx.rows.get('movie_output').status = 'NEEDS_ATTENTION';
      assert.deepEqual(await renew.handler(ctx, input), { uploadUrl: url });
      ctx.rows.get('movie_output').status = 'CANCELED';
      await assert.rejects(renew.handler(ctx, input), /movie export/);
      ctx.rows.get('movie_output').status = 'NEEDS_ATTENTION';
      job.acceptedAt = Date.now() - 2 * 60 * 60_000;
      await assert.rejects(renew.handler(ctx, input), /accepted/);
      assert.equal(ctx.issues, 1);
    });
    await check('signed HTTP binds exact raw bytes, timestamp, bound and private mutation', async () => {
      const { ctx, input } = context();
      ctx.runMutation = (_ref, args) => renew.handler(ctx, args);
      const sign = raw => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
      const request = (raw, signature = sign(raw)) => new Request('https://fixture.convex.site/renderer/upload-capability', {
        method: 'POST', body: raw, headers: { 'x-finalframe-renderer-signature': signature },
      });
      const raw = JSON.stringify(input);
      assert.equal((await rendererUploadAuthorization(ctx, request(`${raw} `, sign(raw)))).status, 401);
      assert.equal((await rendererUploadAuthorization(ctx, request('x'.repeat(4097)))).status, 413);
      assert.equal((await rendererUploadAuthorization(ctx, request(JSON.stringify({ ...input, occurredAt: Date.now() - 65_000 })))).status, 400);
      assert.equal(ctx.issues, 0);
      const success = await rendererUploadAuthorization(ctx, request(raw));
      assert.equal(success.status, 200);
      assert.equal(success.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await success.json(), { uploadUrl: url });
      ctx.rows.get(input.jobId).status = 'COMPLETED';
      assert.equal((await rendererUploadAuthorization(ctx, request(raw))).status, 409);
      assert.equal(ctx.issues, 1);
    });
    console.log(`Render upload renewal: ${checks} PASS. Actual signed handler and authorization resolver, isolated contracts, no deployment.`);
  } finally {
    for (const key of ['FINALFRAME_RENDER_WORKER_ENABLED', 'FINALFRAME_MOVIE_ENABLED', 'FINALFRAME_MOVIE_WORKER_ENABLED', 'RENDER_WORKER_SHARED_SECRET']) {
      if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
