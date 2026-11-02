/** Online timeline/edit/manifest acceptance with real stored media. No provider or render submission. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../dev-fixture/client.mjs';
const require = createRequire(import.meta.url); const ts = require('typescript');
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, file);
const compiled = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-audio-manifest-'));
process.on('exit', () => fs.rmSync(compiled, { recursive: true, force: true }));
for (const name of ['types', 'templates/contract', 'manifest']) {
  const target = path.join(compiled, name + '.js'); fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, ts.transpileModule(fs.readFileSync(new URL('../../renderer/src/' + name + '.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
}
const { validateManifest } = require(path.join(compiled, 'manifest.js'));
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
const dir = process.env.FINALFRAME_AUDIO_EDIT_TEST_DIR || '/tmp/finalframe-audio-edit-tests';
const file = path.join(dir, 'audio-sync.json');
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
const { client } = await createAuthenticatedClient(); const { studio } = await client.query(api.account.current, {}); assert(studio);
const narration = JSON.parse(fs.readFileSync(path.join(dir, 'narration.json'), 'utf8'));
const source = JSON.parse(fs.readFileSync(path.join(process.env.FINALFRAME_SMALL_VIDEO_TEST_DIR || '/tmp/finalframe-small-video-tests', 'explainer.json'), 'utf8'));
assert.equal(source.studioExternalId, studio.externalId);
assert.equal(narration.narrationResult.status, 'COMPLETED');
const projectId = source.project.projectId; const productionId = source.canonicalPlan.productionId;
const videoAssetId = source.lastJob.assetId; const voiceAssetId = narration.narrationResult.assetId;
const checks = []; function pass(name) { checks.push(name); console.log('PASS ' + name); }
async function approve(resourceType, resourceId) {
  const resource = { projectId, productionId, resourceType, resourceId };
  const before = await client.query(api.approvals.get, resource);
  if (!before.approved) { await client.mutation(api.approvals.submitForReview, resource); await client.mutation(api.approvals.approve, resource); }
  if (!before.locked) await client.mutation(api.approvals.lock, resource);
}
if (!state.music) {
  const url = await client.mutation(api.assetStorage.generateUploadUrl, { projectId });
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: fs.readFileSync(path.join(dir, 'music-fixture.wav')) }); assert(response.ok);
  const { storageId } = await response.json();
  state.music = await client.mutation(api.assetStorage.ingestAsset, { studioExternalId: studio.externalId, projectId, productionId, scope: 'PROJECT', storageId, source: 'UPLOADED', roles: ['MUSIC'], name: 'Original acceptance music · 120 BPM', mimeType: 'audio/wav', metadata: JSON.parse(fs.readFileSync(path.join(dir, 'music-beats.json'), 'utf8')), rights: { status: 'OWNED' } }); save();
}
for (const id of [videoAssetId, voiceAssetId, state.music.assetId]) await approve('asset', id);
const args = { productionId, productionVersionId: source.approved.versionId, idempotencyKey: 'live-sync-v1:' + projectId, clips: [{ kind: 'ASSET', assetId: videoAssetId, durationSeconds: 4 }], audioTracks: [
  { assetId: state.music.assetId, startSeconds: 0, durationSeconds: 4, volume: .2, role: 'music', fadeInSeconds: .1, fadeOutSeconds: .25 },
  { assetId: voiceAssetId, startSeconds: .25, durationSeconds: 3.2, volume: 1, role: 'voiceover' },
] };
if (!state.base) { state.base = await client.mutation(api.timeline.createDraft, args); save(); }
assert.equal((await client.mutation(api.timeline.createDraft, args)).timelineId, state.base.timelineId);
pass('composition replay returns one timeline');
async function draft(id) { return client.query(api.timelineEditor.getDraft, { productionId, timelineId: id }); }
let current = await draft(state.base.timelineId);
assert.equal(current.tracks.filter(track => track.kind === 'AUDIO').length, 2);
pass('overlapping music and narration have separate audio lanes');
async function edit(name, kind, input, timelineId = current.timeline._id) {
  const command = { timelineId, kind, input, idempotencyKey: 'live-sync-v1:' + projectId + ':' + name };
  const result = await client.mutation(api.timelineEditor.apply, command);
  const replay = await client.mutation(api.timelineEditor.apply, command);
  assert.equal(replay.timelineId, result.timelineId);
  const next = await draft(result.timelineId); state[name] = result; save(); return next;
}
for (let index = 0; index < 3; index++) {
  const track = current.tracks.find(track => track.kind === 'VIDEO');
  const target = track.clips.find(clip => clip.durationSeconds > 1.01);
  current = await edit('split-' + index, 'split', { clipId: target.id, splitAtSeconds: 1 });
}
let video = current.tracks.find(track => track.kind === 'VIDEO');
assert.deepEqual(video.clips.map(clip => clip.trimStartSeconds ?? 0), [0, 1, 2, 3]);
assert.deepEqual(video.clips.map(clip => clip.startSeconds), [0, 1, 2, 3]);
pass('splits preserve increasing source offsets and beat-aligned starts');
current = await edit('reorder', 'reorder', { clipId: video.clips[3].id, toIndex: 0 });
video = current.tracks.find(track => track.kind === 'VIDEO');
assert.deepEqual(video.clips.map(clip => clip.trimStartSeconds ?? 0), [3, 0, 1, 2]);
assert.deepEqual(video.clips.map(clip => clip.startSeconds), [0, 1, 2, 3]);
pass('visual reorder changes playback order and retimes clips onto 120 BPM beats');
const original = await draft(state.base.timelineId);
assert.equal(original.tracks.find(track => track.kind === 'VIDEO').clips.length, 1);
pass('edits create new versions and preserve the original timeline');
const trimmed = await edit('trim', 'trim', { clipId: video.clips[0].id, trimStartSeconds: 3.25, trimEndSeconds: 3.75, durationSeconds: .5 });
assert.equal(trimmed.tracks.find(track => track.kind === 'VIDEO').clips[0].trimStartSeconds, 3.25);
await assert.rejects(client.mutation(api.timelineEditor.apply, { timelineId: current.timeline._id, kind: 'trim', input: { clipId: video.clips[0].id, trimStartSeconds: 4, trimEndSeconds: 5, durationSeconds: 1 }, idempotencyKey: 'live-sync-invalid-trim:' + projectId }), /beyond its source/);
pass('trimming persists source offsets and rejects reading beyond the stored clip');
const undo = await client.mutation(api.timelineEditor.undo, { timelineId: current.timeline._id, idempotencyKey: 'live-sync-undo:' + projectId });
const undone = await draft(undo.timelineId);
assert.deepEqual(undone.tracks.find(track => track.kind === 'VIDEO').clips.map(clip => clip.trimStartSeconds ?? 0), [0, 1, 2, 3]);
const redo = await client.mutation(api.timelineEditor.redo, { timelineId: undo.timelineId, idempotencyKey: 'live-sync-redo:' + projectId });
current = await draft(redo.timelineId);
assert.deepEqual(current.tracks.find(track => track.kind === 'VIDEO').clips.map(clip => clip.trimStartSeconds ?? 0), [3, 0, 1, 2]);
pass('undo and redo restore actual playback ordering');
const musicTrack = current.tracks.find(track => track.kind === 'AUDIO' && track.clips[0].assetId === state.music.assetId);
await assert.rejects(client.mutation(api.timelineEditor.apply, { timelineId: current.timeline._id, kind: 'adjustAudio', input: { clipId: musicTrack.clips[0].id, volume: 8 }, idempotencyKey: 'live-sync-invalid-volume:' + projectId }), /playback range/);
await assert.rejects(client.mutation(api.timelineEditor.apply, { timelineId: current.timeline._id, kind: 'adjustAudio', input: { clipId: musicTrack.clips[0].id, pan: 2 }, idempotencyKey: 'live-sync-invalid-pan:' + projectId }), /panning is not supported/);
current = await edit('audio-adjust', 'adjustAudio', { clipId: musicTrack.clips[0].id, volumeDb: -12, fadeInSeconds: .2, fadeOutSeconds: .4, muted: false });
const adjustedMusic = current.tracks.find(track => track.kind === 'AUDIO' && track.clips[0].assetId === state.music.assetId).clips[0];
assert(Math.abs(adjustedMusic.volume - Math.pow(10, -12 / 20)) < 1e-9);
pass('decibels convert to linear gain, fades persist, and unsupported audio controls fail safely');
const baseMusic = original.tracks.find(track => track.kind === 'AUDIO' && track.clips[0].assetId === state.music.assetId).clips[0];
const muted = await edit('audio-mute', 'adjustAudio', { clipId: baseMusic.id, muted: true }, state.base.timelineId);
await approve('timeline', muted.timeline._id);
const mutedAssembly = await client.mutation(api.assembly.createJob, { productionId, timelineId: muted.timeline._id, selectionScope: 'FULL_PROJECT', idempotencyKey: 'live-sync-muted-manifest:' + projectId });
assert.equal(mutedAssembly.manifest.audioTracks.find(track => track.role === 'music').volume, 0);
assert.equal(mutedAssembly.manifest.audioTracks.find(track => track.role === 'voiceover').volume, 1);
pass('music mute reaches the manifest without muting the narration lane');
await approve('timeline', current.timeline._id);
await assert.rejects(client.mutation(api.timelineEditor.apply, { timelineId: current.timeline._id, kind: 'adjustAudio', input: { clipId: adjustedMusic.id, volume: .1 }, idempotencyKey: 'live-sync-locked-edit:' + projectId }), /cannot be edited|locked/);
pass('locked timeline edits are denied');
const assemblyArgs = { productionId, timelineId: current.timeline._id, selectionScope: 'FULL_PROJECT', idempotencyKey: 'live-sync-manifest:' + projectId };
const result = await client.mutation(api.assembly.createJob, assemblyArgs);
const manifest = result.manifest; assert.equal(manifest.version, 4);
assert(validateManifest(manifest).ok, JSON.stringify(validateManifest(manifest)));
assert.equal(manifest.audioTracks.length, 2);
const music = manifest.audioTracks.find(track => track.role === 'music'); const voice = manifest.audioTracks.find(track => track.role === 'voiceover');
assert(music && voice); const fps = manifest.output.fps;
assert.equal(music.startFrame, 0); assert.equal(music.fadeInFrames, Math.floor(.2 * fps)); assert.equal(music.fadeOutFrames, Math.floor(.4 * fps));
assert.equal(voice.startFrame, Math.floor(.25 * fps));
assert.deepEqual(manifest.items.map(item => item.trimStartInFrames), [3, 0, 1, 2].map(second => second * fps));
assert.deepEqual(manifest.items.map(item => item.startFrame), [0, 1, 2, 3].map(second => second * fps));
pass('canonical renderer manifest preserves beat cuts, source trims, gain, fades and narration offset');
state.timelineId = current.timeline._id; state.manifest = manifest; state.checks = checks; state.renderSubmissions = 0; state.paidProviderCalls = 0; save();
console.log(JSON.stringify({ onlineConvex: true, checks: checks.length, manifestId: result.manifestId, timelineId: state.timelineId, rendererSubmissions: 0, paidProviderCalls: 0 }));
