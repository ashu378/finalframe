const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const registration = Object.fromEntries(['internalMutation', 'internalAction', 'internalQuery', 'mutation', 'query'].map(name => [name, value => value]));
const validator = new Proxy({}, { get: () => () => ({}) });
function fixture(codec = 'h264', format = 'MP4', mimeType = 'video/mp4', version = 5) {
  const state = { time: Date.now(), rows: new Map(), serial: 0, urlReads: 0, storage: { size: 128, contentType: mimeType, sha256: 'original-local-hash' } };
  const put = (table, value) => state.rows.set(value._id, { table, ...value });
  put('projects', { _id: 'project', studioExternalId: 'studio' });
  put('productions', { _id: 'production', projectId: 'project', studioExternalId: 'studio', workflow: 'IDEA_TO_VIDEO' });
  put('manifests', { _id: 'manifest', projectId: 'project', productionId: 'production', contractVersion: version, manifest: { version, output: { codec }, export: { format } } });
  put('renderJobs', { _id: 'job', projectId: 'project', productionId: 'production', manifestId: 'manifest', studioExternalId: 'studio', studioId: 'studio', status: 'SUBMITTED', executionStage: 'AWAITING_CALLBACK', progress: 80, leaseId: 'lease', leaseExpiresAt: state.time + 300_000, dispatchAttempt: 1, idempotencyKey: 'original-render-request', preset: 'original-preset' });
  const ctx = { db: {
    get: async id => state.rows.get(id) ?? null,
    normalizeId: (_table, id) => id,
    system: { get: async (_table, id) => id === 'storage' ? state.storage : null },
    insert: async (table, value) => { const id = `${table}-${++state.serial}`; put(table, { _id: id, ...value }); return id; },
    patch: async (id, value) => Object.assign(state.rows.get(id), value),
    query: table => {
      const constraints = []; const matches = () => [...state.rows.values()].filter(row => row.table === table && constraints.every(([field, value]) => row[field] === value));
      const chain = { withIndex: (_index, apply) => { const q = { eq: (field, value) => { constraints.push([field, value]); return q; } }; apply(q); return chain; }, order: () => chain, unique: async () => matches()[0] ?? null, take: async limit => matches().slice(0, limit) };
      return chain;
    },
  }, storage: { getUrl: async () => { state.urlReads++; return 'https://local.invalid/original-export'; } }, scheduler: { runAfter: async () => undefined } };
  const imports = {
    'convex/values': { v: validator }, './_generated/server': registration, './_generated/api': { internal: { renderJobs: {} } },
    './authorization': { requireProjectAccess: async () => ({ project: state.rows.get('project'), projectRole: 'OWNER' }), requireProjectRole: async () => ({}), requireMember: async () => ({ studio: { externalId: 'studio', _id: 'studio' } }) },
    './_shared': { now: () => state.time }, './resourceStates': {}, './approvals': {}, './movieAuthority': {},
  };
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, mod);
    mod.require = request => {
      if (Object.hasOwn(imports, request)) return imports[request];
      if (request.startsWith('.')) {
        const candidate = path.resolve(path.dirname(filename), request.replace(/\.js$/, ''));
        if (fs.existsSync(`${candidate}.ts`)) return load(`${candidate}.ts`);
      }
      return require(request);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
    return mod.exports;
  }
  state.jobs = load(path.join(root, 'convex/renderJobs.ts'));
  state.review = load(path.join(root, 'convex/reviewExport.ts'));
  state.validateManifest = load(path.join(root, 'renderer/src/manifest.ts')).validateManifest;
  state.call = async (definition, args) => {
    const before = structuredClone(state.rows); const serial = state.serial;
    try { return await definition.handler(ctx, args); } catch (error) { state.rows = before; state.serial = serial; throw error; }
  };
  state.args = { jobId: 'job', projectId: 'project', leaseId: 'lease', attempt: 1, idempotencyKey: 'original-render-request', eventId: 'original-event', event: 'COMPLETED', eventType: 'render.completed', occurredAt: state.time, payloadHash: 'exact-original-callback-hash', storageId: 'storage', mimeType };
  state.exports = () => [...state.rows.values()].filter(row => row.table === 'exports');
  state.share = () => {
    const token = 'A'.repeat(43); const output = state.exports()[0];
    put('timelines', { _id: 'timeline', projectId: 'project', productionId: 'production', versionNumber: 1, durationSeconds: 8 });
    const manifest = state.rows.get('manifest').manifest;
    Object.assign(manifest, { timelineId: 'timeline', timelineVersionNumber: 1, selection: { scope: 'SCENES' } });
    Object.assign(manifest.output, { durationInFrames: 30, fps: 30 });
    put('reviews', { _id: 'review', projectId: 'project', productionId: 'production', manifestId: 'manifest', timelineId: 'timeline', timelineVersionNumber: 1, exportId: output._id, status: 'REQUESTED' });
    put('reviewLinks', { _id: 'review-link', projectId: 'project', productionId: 'production', reviewId: 'review', manifestId: 'manifest', timelineId: 'timeline', timelineVersionNumber: 1, exportId: output._id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: state.time + 3_600_000, label: 'Original local review' });
    return token;
  };
  return state;
}
let checks = 0;
async function check(name, work) { await work(); checks++; console.log(`PASS ${name}`); }
(async () => {
  await check('successful bounded retry clears current failure while preserving attempt receipts and completed legacy projections stay truthful', async () => {
    const state = fixture();
    await state.call(state.jobs.applyRendererCallback, {...state.args, event:'FAILED',eventType:'render.failed',eventId:'first-failure',retryable:true,errorCode:'RENDER_HANDOFF_REJECTED'});
    assert.equal(state.rows.get('job').status,'RETRYING');
    assert.equal(state.rows.get('job').errorCode,'RENDER_HANDOFF_REJECTED');
    // Isolate the next accepted worker transport; exercise the real callback,
    // completion and query handlers rather than purchasing or rendering media.
    Object.assign(state.rows.get('job'),{status:'SUBMITTED',leaseId:'second-lease',leaseExpiresAt:state.time+300000,dispatchAttempt:2,callbackIdempotencyKey:'second-attempt-callback'});
    const completed={...state.args,eventId:'second-completion',attempt:2,leaseId:'second-lease',idempotencyKey:'second-attempt-callback'};
    await state.call(state.jobs.applyRendererCallback,completed);
    const job=state.rows.get('job');assert.equal(job.status,'COMPLETED');assert.equal(job.errorCode,undefined);assert.equal(job.errorMessage,undefined);
    const receipts=[...state.rows.values()].filter(r=>r.table==='renderCallbackReceipts');assert.equal(receipts.length,2);assert(receipts.every(r=>r.status==='APPLIED'));assert(receipts.some(r=>r.eventType==='render.failed'&&r.attempt===1));
    assert.equal((await state.call(state.jobs.getStatus,{jobId:'job'})).export.downloadUrl,'https://local.invalid/original-export');
    Object.assign(job,{errorCode:'RENDER_HANDOFF_REJECTED',errorMessage:'legacy private failure'});
    const status=await state.call(state.jobs.getStatus,{jobId:'job'});assert.equal(status.job.errorCode,undefined);assert.equal(status.job.errorMessage,undefined);
    assert.equal((await state.call(state.jobs.applyRendererCallback,completed)).duplicate,true);assert.equal(state.rows.get('job').errorCode,'RENDER_HANDOFF_REJECTED','receipt replay does not rewrite historical rows');
    await assert.rejects(state.call(state.jobs.applyRendererCallback,{...state.args,eventId:'late-failure',event:'FAILED',eventType:'render.failed'}));assert.equal(state.rows.get('job').status,'COMPLETED');
  });
  await check('actual completion and download handlers accept all three canonical formats in v4/v5', async () => {
    for (const version of [4, 5]) for (const [codec, format, mimeType] of [['h264', 'MP4', 'video/mp4'], ['vp9', 'WEBM', 'video/webm'], ['prores', 'MOV', 'video/quicktime']]) {
      const state = fixture(codec, format, mimeType, version);
      assert.equal((await state.call(state.jobs.applyRendererCallback, state.args)).job.status, 'COMPLETED');
      assert.equal(state.exports().length, 1); assert.equal(state.exports()[0].mimeType, mimeType);
      const output = await state.call(state.review.getExport, { exportId: state.exports()[0]._id }); assert.equal(output.downloadUrl, 'https://local.invalid/original-export'); assert.equal(state.urlReads, 1);
      const count = state.rows.size;
      assert.equal((await state.call(state.jobs.applyRendererCallback, state.args)).duplicate, true); assert.equal(state.rows.size, count);
      const token = state.share();
      assert.equal((await state.call(state.review.getSharedReview, { token })).videoUrl, `/api/review-media/export/${token}`);
      assert.equal(state.urlReads, 1, 'public review has no direct storage URL read');
      assert.deepEqual(await state.call(state.review.resolveSharedMedia, { token }), { url: 'https://local.invalid/original-export', size: 128, contentType: mimeType });
      const candidates = await state.call(state.review.shareCandidates, { projectId: 'project' });
      assert.equal(candidates[0].id, output._id);
      assert.match(candidates[0].label, /Selected scenes/);
    }
  });
  await check('selected-scene comments and display are bounded by the exact export, not the source timeline', async () => {
    const state = fixture(); await state.call(state.jobs.applyRendererCallback, state.args); const token = state.share();
    assert.equal((await state.call(state.review.getSharedReview, { token })).durationSeconds, 1);
    const comment = { token, authorName: 'Reviewer', body: 'At the end of the selected scene.', requestId: 'scoped-review-test-request', timeSeconds: 1 };
    const saved = await state.call(state.review.addSharedComment, comment);
    assert.equal((await state.call(state.review.addSharedComment, comment)).id, saved.id);
    await assert.rejects(state.call(state.review.addSharedComment, { ...comment, requestId: 'overrun-review-test-request', timeSeconds: 1.1 }), /timestamp/i);
    state.rows.get('timeline').versionNumber = 2;
    assert.deepEqual(await state.call(state.review.shareCandidates, { projectId: 'project' }), []);
    assert.equal(await state.call(state.review.getSharedReview, { token }), null);
  });
  await check('creator reads only exact client feedback, including retained feedback after revocation', async () => {
    const state = fixture(); await state.call(state.jobs.applyRendererCallback, state.args); const token = state.share();
    const saved = await state.call(state.review.addSharedComment, { token, authorName: 'Reviewer', body: 'Client feedback.', requestId: 'retained-review-test-request', timeSeconds: 0.5 });
    state.rows.set('foreign-comment', { table: 'comments', _id: 'foreign-comment', reviewLinkId: 'review-link', reviewId: 'another-review', body: 'Wrong review.' });
    state.rows.set('decision', { table: 'approvals', _id: 'decision', projectId: 'project', productionId: 'production', reviewId: 'review', resourceType: 'review', resourceId: 'review', decision: 'CLIENT_REVISION_REQUESTED', note: 'Client requests a longer shot.' });
    state.rows.get('review').status = 'CHANGES_REQUESTED';
    state.rows.get('review-link').revokedAt = state.time;
    const args = { projectId: 'project', linkId: 'review-link' };
    const feedback = await state.call(state.review.getShareFeedback, args);
    assert.deepEqual(feedback, { timelineVersionNumber: 1, status: 'CHANGES_REQUESTED', decisionNote: 'Client requests a longer shot.', comments: [{ id: saved.id, authorName: 'Reviewer', body: 'Client feedback.', timeSeconds: 0.5, resolved: false }] });
    assert.equal(await state.call(state.review.getSharedReview, { token }), null);
    assert.equal(await state.call(state.review.resolveSharedMedia, { token }), null);
    assert.equal(state.urlReads, 0, 'revocation blocks storage resolution');
    await assert.rejects(state.call(state.review.getShareFeedback, { ...args, projectId: 'another-project' }), /link not found/);
  });
  await check('expired, archived and moderated reviews deny storage before getting the origin URL', async () => {
    const state = fixture(); await state.call(state.jobs.applyRendererCallback, state.args); const token = state.share();
    state.rows.get('review-link').expiresAt = Date.now() - 1;
    assert.equal(await state.call(state.review.resolveSharedMedia, { token }), null);
    state.rows.get('review-link').expiresAt = Date.now() + 60_000;
    state.rows.get('project').status = 'ARCHIVED';
    assert.equal(await state.call(state.review.resolveSharedMedia, { token }), null);
    state.rows.get('project').status = 'ACTIVE';
    state.rows.get('project').moderationStatus = 'RESTRICTED';
    assert.equal(await state.call(state.review.resolveSharedMedia, { token }), null);
    assert.equal(state.urlReads, 0);
  });
  await check('wrong claimed MIME, matching but wrong stored MIME and inconsistent manifest are denied atomically', async () => {
    for (const failure of ['wrong-claim', 'wrong-storage', 'both-wrong', 'missing-webm-claim', 'format-mismatch', 'version-mismatch']) {
      const state = fixture('vp9', 'WEBM', 'video/webm');
      if (failure === 'wrong-claim' || failure === 'both-wrong') state.args.mimeType = 'video/mp4';
      if (failure === 'wrong-storage' || failure === 'both-wrong') state.storage.contentType = 'video/mp4';
      if (failure === 'missing-webm-claim') delete state.args.mimeType;
      if (failure === 'format-mismatch') state.rows.get('manifest').manifest.export.format = 'MP4';
      if (failure === 'version-mismatch') state.rows.get('manifest').contractVersion = 4;
      const before = JSON.stringify([...state.rows]);
      await assert.rejects(state.call(state.jobs.applyRendererCallback, state.args), /media type|format|contract/);
      assert.equal(JSON.stringify([...state.rows]), before); assert.equal(state.exports().length, 0);
    }
  });
  await check('download revalidates stored type and ownership before exposing a URL', async () => {
    for (const failure of ['stored', 'claimed', 'ownership', 'format']) {
      const state = fixture('prores', 'MOV', 'video/quicktime'); await state.call(state.jobs.applyRendererCallback, state.args); const output = state.exports()[0];
      if (failure === 'stored') state.storage.contentType = 'video/mp4';
      if (failure === 'claimed') output.mimeType = 'video/mp4';
      if (failure === 'ownership') state.rows.get('manifest').projectId = 'foreign-project';
      if (failure === 'format') state.rows.get('manifest').manifest.export.format = 'MP4';
      await assert.rejects(state.call(state.review.getExport, { exportId: output._id })); assert.equal(state.urlReads, 0);
    }
  });
  await check('applied exact receipts replay unchanged while new downloads still require matching media', async () => {
    const state = fixture(); await state.call(state.jobs.applyRendererCallback, state.args); const count = state.rows.size;
    state.storage.contentType = 'video/webm'; state.rows.get('manifest').manifest.output.codec = 'vp9';
    assert.equal((await state.call(state.jobs.applyRendererCallback, state.args)).duplicate, true); assert.equal(state.rows.size, count);
    await assert.rejects(state.call(state.review.getExport, { exportId: state.exports()[0]._id })); assert.equal(state.urlReads, 0);
  });
  await check('wrong-format shared review URLs and new links are denied without exposing media', async () => {
    for (const failure of ['stored', 'claimed', 'format']) {
      const state = fixture('vp9', 'WEBM', 'video/webm'); await state.call(state.jobs.applyRendererCallback, state.args); const output = state.exports()[0]; const token = state.share();
      if (failure === 'stored') state.storage.contentType = 'video/mp4';
      if (failure === 'claimed') output.mimeType = 'video/mp4';
      if (failure === 'format') state.rows.get('manifest').manifest.export.format = 'MP4';
      assert.equal(await state.call(state.review.getSharedReview, { token }), null); assert.equal(state.urlReads, 0);
      assert.deepEqual(await state.call(state.review.shareCandidates, { projectId: 'project' }), []);
      const count = state.rows.size;
      await assert.rejects(state.call(state.review.createShareLink, { projectId: 'project', exportId: output._id, tokenHash: 'b'.repeat(64) }), /media type|format/);
      assert.equal(state.rows.size, count);
    }
  });
  await check('legacy and canonical H264 missing claimed MIME retain MP4 meaning only', async () => {
    for (const version of [2, 3, 5]) {
      const state = fixture('h264', 'MP4', 'video/mp4', version); delete state.args.mimeType;
      await state.call(state.jobs.applyRendererCallback, state.args); const output = state.exports()[0]; delete output.mimeType;
      assert.ok((await state.call(state.review.getExport, { exportId: output._id })).downloadUrl);
      if (version <= 3) {
        state.storage.contentType = 'video/webm'; output.mimeType = 'video/webm'; await assert.rejects(state.call(state.review.getExport, { exportId: output._id }));
        state.storage.contentType = 'video/mp4'; output.mimeType = 'video/quicktime'; await assert.rejects(state.call(state.review.getExport, { exportId: output._id }));
        delete output.mimeType; state.rows.get('manifest').contractVersion = version + 1; await assert.rejects(state.call(state.review.getExport, { exportId: output._id }), /contract/);
      }
    }
  });
  await check('historical assembly v3 remains MP4 read-only with exact stored contract agreement', async () => {
    // Shape retained from ed0e29c:convex/assembly.ts manifestPayload: v3 had
    // sources rather than renderer items, an external project ID and no export
    // format. Stored records did not yet have canonical contractVersion.
    const historical = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/legacy-assembly-v3.json'), 'utf8'));
    const state = fixture(); const stored = state.rows.get('manifest'); stored.manifest = historical; delete stored.contractVersion; delete stored.projectId;
    state.rows.set('legacy-export', { table: 'exports', _id: 'legacy-export', productionId: 'production', manifestId: 'manifest', status: 'COMPLETED', storageId: 'storage', preset: 'HD' });
    assert.equal(state.validateManifest(historical).ok, false, 'v3 is never a new renderer contract');
    const read = () => state.call(state.review.getExport, { exportId: 'legacy-export' });
    assert.ok((await read()).downloadUrl); stored.contractVersion = 3; assert.ok((await read()).downloadUrl);
    stored.contractVersion = 2; await assert.rejects(read(), /contract/); state.rows.get('manifest').contractVersion = 3;
    state.storage.contentType = 'video/webm'; await assert.rejects(read(), /media type/); state.storage.contentType = 'video/mp4';
    state.rows.get('legacy-export').mimeType = 'video/quicktime'; await assert.rejects(read(), /media type/);
  });
  console.log(`Output-format backend contracts: ${checks} PASS; actual handlers, in-memory fixtures only.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
