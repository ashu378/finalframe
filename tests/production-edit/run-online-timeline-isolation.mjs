import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../../scripts/dev-fixture/client.mjs';
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
const dir = '/tmp/finalframe-audio-edit-tests/';
const sync = JSON.parse(fs.readFileSync(dir + 'audio-sync.json', 'utf8'));
const source = JSON.parse(fs.readFileSync(path.join(process.env.FINALFRAME_SMALL_VIDEO_TEST_DIR || '/tmp/finalframe-small-video-tests', 'explainer.json'), 'utf8'));
const narration = JSON.parse(fs.readFileSync(dir + 'narration.json', 'utf8'));
const foreign = JSON.parse(fs.readFileSync(dir + 'appearance-edit.json', 'utf8'));
const { client } = await createAuthenticatedClient();
const productionId = source.canonicalPlan.productionId;
const base = await client.query(api.timelineEditor.getDraft, { productionId, timelineId: sync.base.timelineId });
const clipId = base.tracks.find(track => track.kind === 'VIDEO').clips[0].id;
const before = (await client.query(api.timeline.list, { productionId })).length;
for (const [name, assetId, expected] of [['foreign-project', foreign.source.assetId, /outside this project/], ['audio-in-video', narration.narrationResult.assetId, /match the clip/]]) {
  await assert.rejects(client.mutation(api.timelineEditor.apply, { timelineId: sync.base.timelineId, kind: 'replace', input: { clipId, assetId }, idempotencyKey: 'live-timeline-isolation:' + name + ':' + source.project.projectId }), expected);
}
await assert.rejects(client.mutation(api.timeline.createDraft, { productionId, productionVersionId: source.approved.versionId, idempotencyKey: 'live-timeline-overrun:' + source.project.projectId, clips: [{ kind: 'ASSET', assetId: source.lastJob.assetId, durationSeconds: 8 }] }), /beyond its source/);
await assert.rejects(client.mutation(api.timelineEditor.apply, { timelineId: sync.base.timelineId, kind: 'addTransition', input: { clipId, transitionKind: 'DISSOLVE', durationSeconds: .25 }, idempotencyKey: 'live-unsupported-dissolve:' + source.project.projectId }), /Only cut transitions/);
await assert.rejects(client.mutation(api.timelineEditor.apply, { timelineId: sync.base.timelineId, kind: 'updateCaptions', input: { clipId, cues: [{ startSeconds: 0, endSeconds: 1, text: 'Must not disappear from export' }] }, idempotencyKey: 'live-unsupported-caption:' + source.project.projectId }), /not connected/);
assert.equal((await client.query(api.timeline.list, { productionId })).length, before);
console.log(JSON.stringify({ onlineConvex: true, checks: ['cross-project replacement denied', 'audio-as-video replacement denied', 'source-duration overrun denied', 'unwired transition denied', 'unwired captions denied', 'failed edits create no timeline version'], paidProviderCalls: 0, renderSubmissions: 0 }));
