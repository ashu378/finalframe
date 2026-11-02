/** Explicit online acceptance: approved test media -> real VPS -> stored export.
 * Does not submit to an AI provider. Keep jobs sequential on the shared host. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../dev-fixture/client.mjs';

assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
assert.equal(process.env.FINALFRAME_ALLOW_RENDER_TESTS, 'true');
const phase = process.argv[2];
const name = process.argv[3];
assert(['prepare', 'queue', 'status', 'download'].includes(phase));
assert(['cinematic-first', 'comedy-2d', 'realistic-ugc', 'product-launch', 'motion-graphics', 'explainer', 'music-visual', 'social-cutdown', 'soundtrack', 'appearance-edit', 'object-replace'].includes(name));
const root = process.env.FINALFRAME_COMPLETE_TEST_DIR || '/tmp/finalframe-complete-acceptance';
fs.mkdirSync(root, { recursive: true });
const file = path.join(root, name + '.json');
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { name, paidProviderCalls: 0 };
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
const { client } = await createAuthenticatedClient();
const editCase = ['appearance-edit', 'object-replace'].includes(name);
const source = JSON.parse(fs.readFileSync(path.join(editCase ? '/tmp/finalframe-audio-edit-tests' : '/tmp/finalframe-small-video-tests', (name === 'soundtrack' ? 'explainer' : name) + '.json'), 'utf8'));
const productionId = source.canonicalPlan?.productionId || source.plan.productionId;
const projectId = source.project.projectId;
async function approve(resourceType, resourceId) {
  const args = { projectId, productionId, resourceType, resourceId };
  const before = await client.query(api.approvals.get, args);
  if (!before.approved) { await client.mutation(api.approvals.submitForReview, args); await client.mutation(api.approvals.approve, args); }
  if (!before.locked) await client.mutation(api.approvals.lock, args);
}
if (phase === 'prepare') {
  if (!state.assembly) {
    if (name === 'motion-graphics') { state.timelineId = source.timeline.timelineId; state.assembly = source.assembly; }
    else if (name === 'soundtrack') {
      const sync = JSON.parse(fs.readFileSync('/tmp/finalframe-audio-edit-tests/audio-sync.json', 'utf8'));
      state.timelineId = sync.timelineId;
      state.assembly = { manifestId: sync.manifest.manifestId, manifest: sync.manifest };
    } else {
      const job = (await client.query(api.generationJobs.get, { jobId: source.job._id })).job;
      assert.equal(job.status, 'COMPLETED');
      assert(job.assetId && job.shotVersionId);
      await approve('asset', job.assetId); await approve('shotVersion', job.shotVersionId);
      if (!state.timelineId) {
        const timeline = await client.mutation(api.timeline.createDraft, { productionId, productionVersionId: source.approved.versionId, clips: [{ kind: 'TAKE', shotVersionId: job.shotVersionId }], idempotencyKey: 'complete-acceptance:timeline:' + projectId });
        state.timelineId = timeline.timelineId; save();
      }
      await approve('timeline', state.timelineId);
      state.assembly = await client.mutation(api.assembly.createJob, { productionId, timelineId: state.timelineId, selectionScope: 'FULL_PROJECT', idempotencyKey: 'complete-acceptance:manifest:' + projectId });
    }
    save();
  }
  if (!state.review) {
    state.review = await client.mutation(api.reviewExport.requestReview, { productionId, manifestId: state.assembly.manifestId, idempotencyKey: 'complete-acceptance:review:' + name + ':' + projectId }); save();
  }
  await client.mutation(api.reviewExport.approve, { reviewId: state.review._id, note: 'Controlled technical test acceptance only; owner creative sign-off remains separate.' });
  console.log(JSON.stringify({ name, phase, projectId, productionId, timelineId: state.timelineId, manifestId: state.assembly.manifestId, output: state.assembly.manifest.output, providerCalls: 0 }));
} else if (phase === 'queue') {
  const args = { productionId, manifestId: state.assembly.manifestId, reviewId: state.review._id, idempotencyKey: 'complete-acceptance:export:' + name + ':' + projectId };
  if (!state.exportRequest) { state.exportRequest = await client.mutation(api.reviewExport.requestExport, args); save(); }
  const replay = await client.mutation(api.reviewExport.requestExport, args);
  assert.equal(replay.job._id, state.exportRequest.job._id); assert.equal(replay.export._id, state.exportRequest.export._id);
  state.idempotencyVerified = true; save();
  console.log(JSON.stringify({ name, phase, jobId: replay.job._id, exportId: replay.export._id, status: replay.job.status, duplicateReturnedSameJobAndExport: true }));
} else {
  state.status = await client.query(api.renderJobs.getStatus, { jobId: state.exportRequest.job._id }); save();
  if (phase === 'download') {
    assert.equal(state.status.job.status, 'COMPLETED'); assert.equal(state.status.export.status, 'COMPLETED');
    assert(state.status.export.storageId && state.status.export.downloadUrl);
    const response = await fetch(state.status.export.downloadUrl); assert(response.ok);
    state.outputPath = path.join(root, name + '.mp4'); fs.writeFileSync(state.outputPath, Buffer.from(await response.arrayBuffer())); save();
  }
  console.log(JSON.stringify({ name, phase, status: state.status.job, exportId: state.status.export?._id, outputPath: state.outputPath }));
}
