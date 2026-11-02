const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-timeline-behavior-'));
function actualFunctions(file, names) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const selected = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(selected.length, names.length, 'Every tested production helper must exist');
  const printer = ts.createPrinter();
  const code = selected.map(node => printer.printNode(ts.EmitHint.Unspecified, node, source)).join('\n') + '\nexport { ' + names.join(', ') + ' };';
  const output = path.join(temp, path.basename(file) + '.cjs');
  fs.writeFileSync(output, ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
  return require(output);
}
const editor = actualFunctions('convex/timelineEditor.ts', ['record', 'stringValue', 'optionalString', 'numberValue', 'optionalNumber', 'findClip', 'applyEdit']);
const assembly = actualFunctions('convex/assembly.ts', ['rendererAudioTracks']);
const composer = actualFunctions('src/lib/production/workspace-controls.ts', ['validateCompositionAudioTracks']);
const clip = (id, startSeconds, durationSeconds, extra = {}) => ({ id, trackId: 'track', kind: 'VIDEO', startSeconds, durationSeconds, assetId: 'video', metadata: {}, ...extra });
const state = clips => ({ metadata: {}, tracks: [{ id: 'track', kind: 'VIDEO', orderIndex: 0, metadata: {}, clips }] });
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
try {
  check('untrimmed splits advance the second source and bound the first', () => {
    const next = editor.applyEdit(state([clip('first', 0, 4)]), 'split', { clipId: 'first', splitAtSeconds: 2 });
    assert.equal(next.tracks[0].clips[0].trimEndSeconds, 2);
    assert.equal(next.tracks[0].clips[1].trimStartSeconds, 2);
    assert.equal(next.tracks[0].clips[1].startSeconds, 2);
  });
  check('splitting an already trimmed clip advances from its source offset', () => {
    const next = editor.applyEdit(state([clip('first', 0, 4, { trimStartSeconds: 3, trimEndSeconds: 7 })]), 'split', { clipId: 'first', splitAtSeconds: 2 });
    assert.equal(next.tracks[0].clips[0].trimEndSeconds, 5);
    assert.equal(next.tracks[0].clips[1].trimStartSeconds, 5);
    assert.equal(next.tracks[0].clips[1].trimEndSeconds, 7);
  });
  check('toolbar trim bounds determine the new playback duration', () => {
    const next = editor.applyEdit(state([clip('first', 5, 4)]), 'trim', { clipId: 'first', trimStartSeconds: 1, trimEndSeconds: 3 });
    assert.equal(next.tracks[0].clips[0].durationSeconds, 2);
    assert.equal(next.tracks[0].clips[0].startSeconds, 5);
    assert.throws(() => editor.applyEdit(state([clip('first', 0, 4)]), 'trim', { clipId: 'first', trimStartSeconds: 2, trimEndSeconds: 1 }));
  });
  check('reordering changes actual start times without source changes', () => {
    const next = editor.applyEdit(state([clip('a', 0, 1), clip('b', 1, 2), clip('c', 3, 1, { trimStartSeconds: 3 })]), 'reorder', { clipId: 'c', toIndex: 0 });
    assert.deepEqual(next.tracks[0].clips.map(c => [c.id, c.startSeconds]), [['c', 0], ['a', 1], ['b', 2]]);
    assert.equal(next.tracks[0].clips[0].trimStartSeconds, 3);
  });
  check('decibels become linear gain and unsupported controls reject', () => {
    const audio = () => { const value = state([clip('audio', 0, 4, { kind: 'AUDIO' })]); value.tracks[0].kind = 'AUDIO'; return value; };
    const next = editor.applyEdit(audio(), 'adjustAudio', { clipId: 'audio', volumeDb: -12, fadeInSeconds: .2, fadeOutSeconds: .4, muted: true });
    assert(Math.abs(next.tracks[0].clips[0].volume - .251188643150958) < 1e-10);
    assert.deepEqual(next.tracks[0].clips[0].metadata.audio, { fadeInSeconds: .2, fadeOutSeconds: .4, muted: true });
    for (const input of [{ volume: 3 }, { volumeDb: 40 }, { volume: .2, volumeDb: -10 }, { pan: .5 }, { muted: 'false' }, { fadeOutSeconds: 5 }]) assert.throws(() => editor.applyEdit(audio(), 'adjustAudio', { clipId: 'audio', ...input }));
  });
  check('replacement cannot retain an unrelated original take identity', () => {
    const next = editor.applyEdit(state([clip('first', 0, 4, { shotVersionId: 'original-take' })]), 'replace', { clipId: 'first', assetId: 'replacement' });
    assert.equal(next.tracks[0].clips[0].assetId, 'replacement'); assert.equal(next.tracks[0].clips[0].shotVersionId, undefined);
  });
  check('renderer audio receives frame offsets, trims, fades, gain and role', () => {
    const [track] = assembly.rendererAudioTracks([{ trackKind: 'AUDIO', timelineClipId: 'voice', sourceUrl: 'https://fixture.invalid/voice.mp3', startSeconds: .25, durationSeconds: 3, trimStartSeconds: .5, volume: 0, fadeInSeconds: .2, fadeOutSeconds: .4, audioRole: 'voiceover' }], 30);
    assert.deepEqual({ start: track.startFrame, trim: track.trimStartInFrames, duration: track.durationInFrames, volume: track.volume, fadeIn: track.fadeInFrames, fadeOut: track.fadeOutFrames, role: track.role }, { start: 7, trim: 15, duration: 90, volume: 0, fadeIn: 6, fadeOut: 12, role: 'voiceover' });
  });
  check('composer permits overlapping narration/music but rejects invalid lanes', () => {
    const music = { assetId: 'music', startSeconds: 0, durationSeconds: 4, volume: .2, role: 'music' };
    const voice = { assetId: 'voice', startSeconds: .25, durationSeconds: 3.2, volume: 1, role: 'voiceover' };
    composer.validateCompositionAudioTracks([music, voice], 4);
    for (const patch of [{ assetId: '' }, { startSeconds: -1 }, { durationSeconds: 5 }, { volume: 2 }, { trimStartSeconds: -1 }, { fadeOutSeconds: 8 }]) assert.throws(() => composer.validateCompositionAudioTracks([{ ...music, ...patch }], 4));
    assert.throws(() => composer.validateCompositionAudioTracks(Array(17).fill(music), 4));
  });
  console.log(`Timeline behavior: PASS (${checks}); real production helpers, no local database or provider calls.`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
