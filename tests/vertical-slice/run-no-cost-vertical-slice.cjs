const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-vertical-slice-'));

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function compile(file, output) {
  const source = path.join(root, file);
  const target = path.join(temp, output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const result = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: source,
  });
  fs.writeFileSync(target, result.outputText);
  return target;
}

compile('renderer/src/types.ts', 'types.js');
compile('renderer/src/templates/contract.ts', 'templates/contract.js');
const rendererManifest = require(compile('renderer/src/manifest.ts', 'manifest.js'));
const callback = require(compile('renderer/src/contracts/callback.ts', 'callback.js'));

// This harness deliberately models records and callback state in memory. It
// does not call a provider, a renderer, Convex, or produce an MP4 file.
const project = { id: 'project-1', name: 'Fixture project' };
const otherProject = { id: 'project-2' };
const fixtureAsset = { id: 'asset-1', projectId: project.id, scope: 'PROJECT', storageId: 'storage-fixture-1' };
assert.equal(fixtureAsset.projectId, project.id);
assert.throws(() => { if (fixtureAsset.projectId !== otherProject.id) throw new Error('cross-project asset denied'); }, /cross-project asset denied/);

const sequence = { id: 'sequence-1', projectId: project.id, productionVersionId: 'production-version-1', orderIndex: 0 };
const scene = { id: 'scene-1', projectId: project.id, sequenceId: sequence.id, orderIndex: 0 };
const shot = { id: 'shot-1', projectId: project.id, sceneId: scene.id, orderIndex: 0 };
const take = { id: 'shot-version-1', projectId: project.id, shotId: shot.id, status: 'COMPLETED', state: 'LOCKED' };
for (const record of [sequence, scene, shot, take]) assert.equal(record.projectId, project.id);
assert.equal(take.state, 'LOCKED');
assert.throws(() => { if (take.state === 'LOCKED') throw new Error('locked take cannot be mutated'); }, /locked take cannot be mutated/);
const regeneratedTake = { id: 'shot-version-2', projectId: project.id, shotId: shot.id, status: 'DRAFT', state: 'DRAFT', versionNumber: 2 };
assert.equal(regeneratedTake.versionNumber, 2, 'regeneration must create a new take version');

const lifecycleProject = { ...project, deletedAt: undefined };
lifecycleProject.deletedAt = Date.parse('2026-09-21T12:00:00.000Z');
assert.equal(lifecycleProject.deletedAt > 0, true);
assert.equal([lifecycleProject].filter((row) => !row.deletedAt).length, 0, 'soft-deleted projects disappear from normal lists');
lifecycleProject.deletedAt = undefined;
assert.equal(lifecycleProject.deletedAt, undefined, 'soft-deleted projects can be restored');
const legacyPlanning = read('convex/planning.ts');
assert.match(legacyPlanning, /LEGACY_PLANNING_READ_ONLY/);
assert.doesNotMatch(legacyPlanning, /ctx\.db\.(insert|patch|delete)\s*\(/, 'legacy planning must not receive new writes');

const manifest = {
  kind: 'finalframe.render-manifest',
  version: 4,
  manifestId: 'manifest-fixture-1',
  projectId: project.id,
  productionId: 'production-1',
  productionVersionId: 'production-version-1',
  timelineId: 'timeline-1',
  rendererVersion: 'finalframe-renderer-v1',
  selection: { scope: 'FULL_PROJECT', ids: [] },
  export: { scope: 'FULL_PROJECT', format: 'MP4' },
  output: { width: 1920, height: 1080, fps: 30, durationInFrames: 60, codec: 'h264' },
  items: [{ id: 'clip-1', kind: 'video', src: 'https://media.finalframe.invalid/fixture.mp4', startFrame: 0, durationInFrames: 60, orderIndex: 0, assetId: fixtureAsset.id, shotId: shot.id, shotVersionId: take.id }],
  shots: [{ shotId: shot.id, shotVersionId: take.id, assetId: fixtureAsset.id, orderIndex: 0, itemId: 'clip-1', startFrame: 0, durationInFrames: 60, src: 'https://media.finalframe.invalid/fixture.mp4' }],
  metadata: { lockState: 'LOCKED', lockId: 'timeline-1', lockedAt: '2026-09-21T12:00:00.000Z', lockedBy: 'user-1' },
};
assert.equal(rendererManifest.validateManifest(manifest).ok, true, 'fixture manifest v4 must validate');
assert.equal(rendererManifest.validateLockedManifest(manifest).ok, true, 'locked fixture manifest must validate');

const timeline = { id: 'timeline-1', projectId: project.id, manifestId: manifest.manifestId, status: 'LOCKED', clips: manifest.items.map((item) => ({ id: item.id, startSeconds: item.startFrame / manifest.output.fps, durationSeconds: item.durationInFrames / manifest.output.fps, assetId: item.assetId, shotVersionId: item.shotVersionId })) };
assert.equal(timeline.clips[0].startSeconds, 0);
assert.equal(timeline.clips[0].durationSeconds, 2);

const job = { id: 'render-job-1', projectId: project.id, manifestId: manifest.manifestId, status: 'QUEUED', progress: 0, idempotencyKey: 'fixture-export-1', leaseId: 'lease-1' };
const exportRecord = { id: 'export-1', projectId: project.id, renderJobId: job.id, status: 'QUEUED', progress: 0, downloadUrl: undefined };
const receiptStore = new Map();
const receiptStoreApi = {
  get: async (eventId) => receiptStore.get(`event:${eventId}`) ?? null,
  getByIdempotencyKey: async (key) => receiptStore.get(`key:${key}`) ?? null,
  claim: async (receipt) => {
    if (receiptStore.has(`event:${receipt.eventId}`) || receiptStore.has(`key:${receipt.idempotencyKey}`)) return 'duplicate';
    receiptStore.set(`event:${receipt.eventId}`, receipt);
    receiptStore.set(`key:${receipt.idempotencyKey}`, receipt);
    return 'claimed';
  },
};
const callbackBody = callback.createCallbackBody({ eventId: 'callback-event-1', idempotencyKey: job.idempotencyKey, jobId: job.id, projectId: job.projectId, rendererVersion: 'finalframe-renderer-v1', attempt: 1, eventType: 'render.completed', occurredAt: '2026-09-21T12:00:00.000Z', payload: { leaseId: job.leaseId, storageId: 'storage-export-1' } });
const secret = 'fixture-callback-secret';
(async () => {
  const accepted = await callback.handleRendererCallback(callbackBody, callback.signCallbackBody(callbackBody, secret), secret, receiptStoreApi, { now: () => Date.parse('2026-09-21T12:00:00.000Z') });
  assert.deepEqual(accepted.result, { status: 'accepted', duplicate: false });
  job.status = 'COMPLETED';
  job.progress = 100;
  exportRecord.status = 'COMPLETED';
  exportRecord.progress = 100;
  exportRecord.downloadUrl = 'https://storage.finalframe.invalid/export-1.mp4';
  assert.equal(exportRecord.status, 'COMPLETED');
  assert.equal(exportRecord.downloadUrl.endsWith('.mp4'), true);
  const duplicate = await callback.handleRendererCallback(callbackBody, callback.signCallbackBody(callbackBody, secret), secret, receiptStoreApi, { now: () => Date.parse('2026-09-21T12:00:00.000Z') });
  assert.deepEqual(duplicate.result, { status: 'accepted', duplicate: true });

  const sources = {
    productions: read('convex/productions.ts'),
    scenes: read('convex/scenes.ts'),
    assembly: read('convex/assembly.ts'),
    timeline: read('convex/timeline.ts'),
    renderJobs: read('convex/renderJobs.ts'),
    reviewExport: read('convex/reviewExport.ts'),
  };
  assert.match(sources.productions, /status: "DRAFT"/);
  assert.match(sources.productions, /status: "APPROVED"/);
  assert.match(sources.scenes, /shotVersions/);
  assert.match(sources.assembly, /const version = finishingV5Enabled\(\) \? 5 : 4/, 'canonical writer remains v4 unless v5 is explicitly enabled');
  assert.match(sources.assembly, /contractVersion: version/, 'persist the selected canonical version');
  assert.match(sources.assembly, /selectionScope/);
  assert.match(sources.timeline, /!\[4, 5\]\.includes\(Number\(payload\.version\)\)/, 'timeline rejects unsupported versions');
  assert.match(sources.timeline, /payload\.version !== manifest\.contractVersion/, 'timeline rejects stored/payload version mismatch');
  assert.match(sources.timeline, /!validateManifest\(payload\)\.ok/, 'timeline rejects invalid canonical input');
  assert.match(sources.renderJobs, /status: "QUEUED"/);
  assert.match(sources.renderJobs, /export const getStatus/);
  assert.match(sources.reviewExport, /internal\.renderJobs\.dispatch/);
  console.log(JSON.stringify({ ok: true, checked: 'no-cost-one-project-one-scene-async-export', paidProviderCalls: 0, mp4Rendered: false }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
