/** Owner-authorized small live acceptance. Online Convex only; no renderer export. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../dev-fixture/client.mjs';
const phase = process.argv[2];
assert(['narration-prepare', 'narration-queue', 'transcript-queue', 'receipt-queue', 'status', 'download'].includes(phase));
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
if (phase.endsWith('-queue')) assert.equal(process.env.FINALFRAME_ALLOW_PAID_TESTS, 'true');
const dir = process.env.FINALFRAME_AUDIO_EDIT_TEST_DIR || '/tmp/finalframe-audio-edit-tests';
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'narration.json');
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { text: 'Your ideas. Brought to life.' };
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
const { client } = await createAuthenticatedClient();
const account = await client.query(api.account.current, {});
assert(account.studio && ['owner', 'admin'].includes(account.role));
if (phase === 'narration-prepare') {
  const original = JSON.parse(fs.readFileSync(path.join(process.env.FINALFRAME_SMALL_VIDEO_TEST_DIR || '/tmp/finalframe-small-video-tests', 'explainer.json'), 'utf8'));
  assert.equal(original.studioExternalId, account.studio.externalId);
  state.project = original.project; state.productionId = original.canonicalPlan.productionId; state.productionVersionId = original.approved.versionId; state.originalVideoAssetId = original.lastJob?.assetId;
  const catalog = await client.action(api.stockVoices.catalog, { projectId: state.project.projectId });
  assert(catalog.choices.length);
  state.catalogModelName = catalog.modelName;
  if (!state.voice) {
    const choice = catalog.choices[0];
    state.choice = choice;
    state.voice = await client.action(api.stockVoices.select, { projectId: state.project.projectId, name: 'Live acceptance stock narrator', selectionKey: choice.selectionKey, idempotencyKey: 'live-narrator:' + state.project.projectId }); save();
  }
  const resource = { projectId: state.project.projectId, resourceType: 'voice', resourceId: state.voice.voiceId };
  const approval = await client.query(api.approvals.get, resource);
  if (!approval.approved) { await client.mutation(api.approvals.submitForReview, resource); await client.mutation(api.approvals.approve, resource); }
  if (!approval.locked) await client.mutation(api.approvals.lock, resource);
  assert((await client.query(api.voices.readiness, { projectId: state.project.projectId, voiceId: state.voice.voiceId })).ready);
  save(); console.log(JSON.stringify({ phase, projectId: state.project.projectId, voiceId: state.voice.voiceId, catalogModelName: state.catalogModelName, providerCalls: 0 }));
} else if (phase === 'narration-queue' || phase === 'transcript-queue' || phase === 'receipt-queue') {
  assert(state.voice);
  const transcript = phase === 'transcript-queue';
  const receipt = phase === 'receipt-queue';
  const field = transcript ? 'transcriptJob' : receipt ? 'receiptJob' : 'narrationJob';
  const args = { productionId: state.productionId, kind: transcript ? 'TRANSCRIPT' : 'NARRATION', ...(transcript ? { sourceAssetId: state.narrationResult.assetId } : { text: receipt ? 'Ready for your next scene.' : state.text, voiceId: state.voice.voiceId }), idempotencyKey: (transcript ? 'live-transcript:' : receipt ? 'live-narration-receipt:' : 'live-narration:') + state.project.projectId };
  if (!state[field]) { state[field] = await client.action(api.preparation.create, args); save(); }
  const replay = await client.action(api.preparation.create, args);
  assert.equal(replay._id, state[field]._id);
  state[field + 'IdempotencyVerified'] = true; save(); console.log(JSON.stringify({ phase, job: state[field], duplicateReturnedSameJob: true }));
} else if (phase === 'status') {
  for (const field of ['narrationJob', 'transcriptJob', 'receiptJob']) {
    if (!state[field]) continue;
    const result = await client.query(api.generationJobs.get, { jobId: state[field]._id });
    state[field === 'narrationJob' ? 'narrationResult' : field === 'receiptJob' ? 'receiptResult' : 'transcriptResult'] = result.job; save();
    if (field === 'transcriptJob' && result.job.status === 'COMPLETED') { assert.equal(result.job.transcriptText.toLowerCase().replace(/[^a-z]/g, ''), state.text.toLowerCase().replace(/[^a-z]/g, '')); state.transcriptVerified = true; save(); }
    console.log(JSON.stringify({ field, job: result.job }));
  }
} else if (phase === 'download') {
  assert.equal(state.narrationResult.status, 'COMPLETED');
  const media = await client.query(api.assetStorage.resolveAuthorizedMedia, { assetId: state.narrationResult.assetId });
  assert(media.url);
  const response = await fetch(media.url); assert(response.ok);
  const bytes = Buffer.from(await response.arrayBuffer());
  state.downloadPath = path.join(dir, 'narration.mp3'); fs.writeFileSync(state.downloadPath, bytes); save();
  console.log(JSON.stringify({ phase, path: state.downloadPath, bytes: bytes.length }));
}
