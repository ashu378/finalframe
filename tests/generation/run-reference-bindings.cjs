const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../../src/lib/production/workspace-controls.ts');
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { resolveShotReferencePrompt: resolve, validateShotOperationControls: validate } = compiled.exports;
const assets = [
  { id: 'face', mimeType: 'image/png' }, { id: 'outfit', mimeType: 'image/jpeg' },
  { id: 'performance', mimeType: 'video/mp4' }, { id: 'speech', mimeType: 'audio/wav' },
  { id: 'first', mimeType: 'image/png' }, { id: 'other', mimeType: 'application/pdf' },
];
const selected = ['first', 'outfit', 'performance', 'face', 'speech'];
const bindings = [
  { assetId: 'performance', alias: 'move', role: 'SOURCE_PERFORMANCE' },
  { assetId: 'face', alias: 'Lead', role: 'IDENTITY' },
  { assetId: 'outfit', alias: 'clothes', role: 'COSTUME' },
  { assetId: 'speech', alias: 'voice', role: 'RECORDING' },
];
const base = { prompt: 'Use @Lead for the person and @move for the performance.', assets, referenceAssetIds: selected, referenceBindings: bindings, firstFrameAssetId: 'first' };
let checks = 0;
function test(name, run) { run(); checks++; console.log(`PASS ${name}`); }
test('aliases resolve to actual per-modality order and explicit roles without changing input assets', () => {
  const before = JSON.stringify(base);
  const result = resolve(base);
  assert.match(result.prompt, /^Use image reference 2 for the person and video reference 1 for the performance\./);
  assert.match(result.prompt, /image reference 1: costume/);
  assert.match(result.prompt, /audio reference 1: recording/);
  assert.equal(result.referenceBindings[1].alias, 'lead');
  assert.equal(JSON.stringify(base), before);
});
test('structured changes, preservation and timing resolve the same selected references', () => {
  const result = resolve({ ...base, editInstructions: { change: ' Wear @clothes. ', preserve: 'Keep @lead and @voice.', timing: 'Follow @move at 1–3 seconds.' } });
  assert.match(result.prompt, /Requested changes: Wear image reference 1\./);
  assert.match(result.prompt, /Preserve: Keep image reference 2 and audio reference 1\./);
  assert.match(result.prompt, /Action timing: Follow video reference 1 at 1–3 seconds\./);
  assert.equal(result.editInstructions.change, 'Wear @clothes.');
});
test('legacy prompts including incidental handles remain byte-identical without explicit intent', () => {
  for (const prompt of ['An original scene.', 'Email hello@example.test and show @name.']) {
    assert.equal(resolve({ prompt, assets, referenceAssetIds: [] }).prompt, prompt);
    assert.equal(resolve({ prompt, assets, referenceAssetIds: [], editInstructions: { change: ' ', preserve: '', timing: '' } }).prompt, prompt);
  }
});
test('unknown aliases, foreign/unselected assets and duplicate aliases or assets fail closed', () => {
  assert.throws(() => resolve({ ...base, prompt: 'Use @foreign.' }), /every @mention/);
  assert.throws(() => resolve({ ...base, referenceBindings: [{ ...bindings[0], assetId: 'foreign' }] }), /from this project/);
  assert.throws(() => resolve({ ...base, referenceAssetIds: ['face'], referenceBindings: bindings }), /from this project/);
  assert.throws(() => resolve({ ...base, referenceBindings: [bindings[0], { ...bindings[1], alias: 'MOVE' }] }), /only once/);
  assert.throws(() => resolve({ ...base, referenceBindings: [bindings[0], { ...bindings[0], alias: 'other' }] }), /only once/);
});
test('quoted and bracketed aliases resolve while unknown punctuated aliases fail', () => {
  assert.match(resolve({ ...base, prompt: 'Use "@lead", [@clothes] and (@move).' }).prompt, /^Use "image reference 2", \[image reference 1\] and \(video reference 1\)\./);
  assert.throws(() => resolve({ ...base, prompt: 'Use [@foreign] and "@missing".' }), /every @mention/);
  assert.match(resolve({ ...base, prompt: 'Keep contact hello@example.test and use @lead.' }).prompt, /hello@example\.test/);
});
test('malformed or excessive bindings and instructions are rejected before submission', () => {
  for (const referenceBindings of [{}, [null], Array(51).fill(bindings[0]), [{ ...bindings[0], alias: 'bad alias' }], [{ ...bindings[0], alias: 'x'.repeat(41) }], [{ ...bindings[0], role: 'MASK' }]]) assert.throws(() => resolve({ ...base, referenceBindings }));
  for (const editInstructions of ['bad', [], { change: 'x'.repeat(2001), preserve: '', timing: '' }, { change: 5, preserve: '', timing: '' }]) assert.throws(() => resolve({ ...base, editInstructions }));
});
test('role modality and frame references are validated independently', () => {
  for (const binding of [{ assetId: 'face', alias: 'source', role: 'SOURCE_PERFORMANCE' }, { assetId: 'face', alias: 'voice', role: 'RECORDING' }, { assetId: 'speech', alias: 'face', role: 'IDENTITY' }]) assert.throws(() => resolve({ ...base, referenceBindings: [binding] }), /matching its reference role/);
  assert.match(resolve({ ...base, prompt: 'Use @start.', referenceBindings: [{ assetId: 'first', alias: 'start', role: 'IDENTITY' }] }).prompt, /^Use first frame\./);
  assert.throws(() => resolve({ ...base, referenceAssetIds: ['other'], referenceBindings: [{ assetId: 'other', alias: 'file', role: 'OBJECT' }] }), /matching its reference role/);
});
test('authoring validation rejects bad mentions in structured instructions and permits selected project intent', () => {
  const controls = { operation: 'EDIT', audioPolicy: 'KEEP_SOURCE', referenceAssetIds: selected, referenceBindings: bindings, firstFrameAssetId: '', lastFrameAssetId: '', editInstructions: { change: 'Use @clothes.', preserve: '@lead', timing: '' } };
  assert.deepEqual(validate(controls, assets), selected);
  assert.throws(() => validate({ ...controls, editInstructions: { ...controls.editInstructions, preserve: '@foreign' } }, assets), /every @mention/);
});
console.log(`${checks} reference-binding contract groups passed. No database, provider or renderer calls.`);
