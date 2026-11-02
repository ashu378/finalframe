import assert from 'node:assert/strict';
import { validateManifest, validateLockedManifest } from '../dist/manifest.js';
import { createAssemblyPlan } from '../dist/assembly/plan.js';
import { nativeVideoVolume, visualPresentation } from '../dist/assembly/transitions.js';
import { RENDER_MANIFEST_VERSION } from '../dist/types.js';
import { serializeCaptionSidecars } from '../dist/captions.js';

const manifest = {
  kind: 'finalframe.render-manifest', version: 5, manifestId: 'v5-contract', projectId: 'project-v5', rendererVersion: 'test',
  selection: { scope: 'TIMELINE', ids: [] }, export: { scope: 'TIMELINE', format: 'MP4' },
  output: { width: 320, height: 180, fps: 10, durationInFrames: 30, codec: 'h264' },
  tracks: [{ id: 'picture', kind: 'VIDEO', orderIndex: 0 }, { id: 'sound', kind: 'AUDIO', orderIndex: 1 }],
  items: [
    { id: 'first', kind: 'video', trackId: 'picture', src: 'https://media.finalframe.app/first.mp4', startFrame: 0, durationInFrames: 20, orderIndex: 0 },
    { id: 'second', kind: 'image', trackId: 'picture', src: 'https://media.finalframe.app/second.png', startFrame: 10, durationInFrames: 20, orderIndex: 1 },
  ],
  audioTracks: [{ id: 'music', trackId: 'sound', src: 'https://media.finalframe.app/music.wav', startFrame: 0, durationInFrames: 30, volume: 0.5 }],
  captionTracks: [{ id: 'en', language: 'en', style: { fontSize: 24, color: '#ffffff', backgroundColor: '#000000cc', position: 'TOP', maxLines: 2 }, cues: [{ id: 'cue', startFrame: 3, durationInFrames: 6, text: 'Every word remains.' }] }],
  transitions: [{ id: 'join', fromItemId: 'first', toItemId: 'second', kind: 'DISSOLVE', durationInFrames: 10, audioPolicy: 'PRESERVE' }],
  metadata: { lockState: 'LOCKED', lockId: 'lock-v5', lockedAt: '2026-11-02T00:00:00Z', lockedBy: 'owner' },
};

let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
function rejects(change, message) { const invalid = structuredClone(manifest); change(invalid); assert.equal(validateManifest(invalid).ok, false, message); }

check('v5 readers preserve writer4 and accept mixed-media same-track transitions', () => {
  assert.equal(RENDER_MANIFEST_VERSION, 4);
  assert.equal(validateManifest(manifest).ok, true);
  assert.equal(validateLockedManifest(manifest).ok, true);
  const original = JSON.stringify(manifest);
  const plan = createAssemblyPlan(manifest);
  assert.equal(plan.transitions[0].startFrame, 10);
  assert.equal(plan.durationInFrames, 30);
  assert.deepEqual(plan.audioTracks, manifest.audioTracks);
  assert.equal(JSON.stringify(manifest), original, 'reader must never retime or rewrite source manifests');
  const implicit = structuredClone(manifest); delete implicit.tracks;
  implicit.items.forEach(item => delete item.trackId); implicit.audioTracks.forEach(track => delete track.trackId);
  assert.equal(validateManifest(implicit).ok, true);
});

check('v4 retains existing cut/unstyled caption behavior', () => {
  const old = structuredClone(manifest); old.version = 4;
  old.captionTracks[0].style = { arbitraryLegacyStyle: 'retained but not applied' };
  assert.equal(validateManifest(old).ok, true);
  assert.deepEqual(createAssemblyPlan(old).transitions, []);
  assert.deepEqual(createAssemblyPlan(old).tracks, []);
});

check('transition identity, adjacency, exact overlap and bounded handles fail closed', () => {
  rejects(m => m.transitions[0].toItemId = 'missing');
  rejects(m => m.transitions[0].fromItemId = 'second');
  rejects(m => m.transitions[0].kind = 'CUT');
  rejects(m => delete m.transitions[0].audioPolicy);
  rejects(m => m.transitions[0].durationInFrames = 9);
  rejects(m => m.transitions[0].durationInFrames = 11);
  rejects(m => m.transitions[0].durationInFrames = 21);
  rejects(m => m.items[1].startFrame = 11);
  rejects(m => m.items[1].orderIndex = 0);
  rejects(m => m.items[1].orderIndex = 1.5);
  rejects(m => m.transitions.push({ ...m.transitions[0], id: 'duplicate-edge' }));
  rejects(m => { m.tracks.push({ id: 'other', kind: 'VIDEO', orderIndex: 2 }); m.items[1].trackId = 'other'; });
  rejects(m => m.transitions = []);
  rejects(m => { m.items.splice(1, 0, { ...m.items[0], id: 'interposed', startFrame: 5, durationInFrames: 5, orderIndex: 1 }); m.items[2].orderIndex = 2; });
  rejects(m => m.output.durationInFrames = 29);
});

check('visual, audio and caption lanes remain separate', () => {
  rejects(m => m.items[1].trackId = 'sound');
  rejects(m => m.audioTracks[0].trackId = 'picture');
  rejects(m => m.audioTracks[0].fadeOutFrames = 31);
  rejects(m => m.items[0].trackId = 'unknown-track');
  rejects(m => m.tracks.push({ ...m.tracks[0] }));
  rejects(m => m.tracks[0].kind = 'CAPTIONS');
});

check('caption styles reject arbitrary CSS and invalid ranges without truncation', () => {
  rejects(m => m.captionTracks[0].style.fontSize = 11);
  rejects(m => m.captionTracks[0].style.fontSize = 121);
  rejects(m => m.captionTracks[0].style.fontSize = 24.5);
  rejects(m => m.captionTracks[0].style.color = 'url(javascript:bad)');
  rejects(m => m.captionTracks[0].style.backgroundColor = 'transparent');
  rejects(m => m.captionTracks[0].style.position = 'absolute');
  rejects(m => m.captionTracks[0].style.maxLines = 5);
  rejects(m => m.captionTracks[0].style.lineClamp = 1);
  rejects(m => m.captionTracks[0].style.fontFamily = 'remote-font');
  rejects(m => m.captionTracks.push(structuredClone(m.captionTracks[0])));
  const full = 'This complete text is retained for measured fitting. '.repeat(12);
  const copy = structuredClone(manifest); copy.captionTracks[0].cues[0].text = full;
  assert.equal(createAssemblyPlan(copy).captionTracks[0].cues[0].text, full);
});

check('transition visual and native-audio policies have explicit frame semantics', () => {
  const plan = createAssemblyPlan(manifest); const transition = plan.transitions[0];
  const first = plan.items[0]; const second = plan.items[1];
  assert.equal(visualPresentation(second, 15, transition).opacity, 0.5);
  assert.equal(visualPresentation(first, 15, undefined, transition).opacity, 1);
  assert.equal(nativeVideoVolume(0.8, 15, transition), 0.8, 'PRESERVE keeps native gain');
  const crossfade = { ...transition, audioPolicy: 'CROSSFADE' };
  assert.equal(nativeVideoVolume(0.8, 10, crossfade), 0);
  assert.equal(nativeVideoVolume(0.8, 15, crossfade), 0.4);
  assert.equal(nativeVideoVolume(0.8, 15, undefined, crossfade), 0.4);
  assert.equal(nativeVideoVolume(0.8, 20, crossfade), 0.8);
  assert.equal(visualPresentation(first, 15, undefined, { ...transition, kind: 'FADE' }).opacity, 0);
  assert.equal(visualPresentation(second, 15, { ...transition, kind: 'FADE' }).opacity, 0);
  assert.equal(visualPresentation(second, 15, { ...transition, kind: 'WIPE' }).clipPath, 'inset(0 50% 0 0)');
  assert.equal(visualPresentation(second, 15, { ...transition, kind: 'SLIDE' }).transform, 'translateX(50%)');
});

check('SRT and VTT share exact frame-derived cue times and complete plain multiline text', () => {
  const track = { id: 'sidecar', language: 'en', cues: [{ id: 'cue', startFrame: 1, durationInFrames: 2, text: 'Ideas & pictures.\nEvery word.' }] };
  const sidecars = serializeCaptionSidecars(track, 30);
  assert.equal(sidecars.srt, '1\n00:00:00,033 --> 00:00:00,100\nIdeas & pictures.\nEvery word.\n');
  assert.equal(sidecars.vtt, 'WEBVTT\n\n1\n00:00:00.033 --> 00:00:00.100\nIdeas &amp; pictures.\nEvery word.\n');
  for (const text of ['<script>bad</script>', '<00:00:01.000>word', 'first\n\nsecond', 'first\n  \nsecond', 'text\u0000bad', '\nfirst', 'last\n']) {
    assert.throws(() => serializeCaptionSidecars({ ...track, cues: [{ ...track.cues[0], text }] }, 30));
    rejects(m => m.captionTracks[0].cues[0].text = text);
  }
});

console.log(`Renderer v5 contract tests: ${checks} PASS; no database/provider calls.`);
