const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  for (const candidate of [request, request.endsWith('.js') ? request.slice(0, -3) + '.ts' : request]) {
    try { return originalResolve.call(this, candidate, parent, isMain, options); } catch {}
  }
  throw new Error(`Cannot resolve caption control module ${request}`);
};
Module._extensions['.ts'] = function(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: filename }).outputText, filename);
};
const { initialCaptionEditorStyle, captionTrackDownloadName } = require(path.join(root, 'src/lib/production/caption-controls.ts'));
const { validateCaptionStyle } = require(path.join(root, 'renderer/src/manifest.ts'));

const legacy = { fontSize: 28, color: '#aabbcc', backgroundColor: '#11223344', position: 'TOP', maxLines: 2, fontFamily: 'Legacy font', outlineWidth: 4, lineClamp: 1 };
const before = structuredClone(legacy);
const editable = initialCaptionEditorStyle(legacy);
assert.deepEqual(editable, { fontSize: 28, color: '#aabbcc', backgroundColor: '#11223344', position: 'TOP', maxLines: 2 });
assert.equal(validateCaptionStyle(editable).length, 0);
assert.deepEqual(legacy, before, 'opening a legacy style cannot rewrite the source snapshot');
for (const invalid of [{ fontSize: 4 }, { color: 'url(unsafe)' }, { backgroundColor: 'javascript:bad' }, { position: 'SIDEWAYS' }, { maxLines: 9 }]) {
  const offered = initialCaptionEditorStyle(invalid);
  for (const key of Object.keys(invalid)) assert.equal(offered[key], invalid[key], 'invalid allowed values cannot silently become passing defaults');
  assert.ok(validateCaptionStyle(offered).length > 0, 'server style validation remains authoritative');
}
assert.equal(validateCaptionStyle({ ...editable, fontFamily: 'invented' }).length > 0, true, 'direct authoring still rejects unknown style keys');
assert.deepEqual(initialCaptionEditorStyle(undefined), { fontSize: 42, color: '#ffffff', backgroundColor: '#00000000', position: 'BOTTOM', maxLines: 3 });
const first = captionTrackDownloadName('en', 'clip-one:caption:0', 'srt');
const second = captionTrackDownloadName('en', 'clip-two:caption:0', 'srt');
assert.notEqual(first, second, 'same-language canonical tracks need distinct download filenames');
assert.equal(first, 'finalframe-captions-en-track-clip-one%3Acaption%3A0.srt');
assert.equal(captionTrackDownloadName('en', 'clip-one:caption:0', 'vtt').endsWith('.vtt'), true);
assert.equal(/[\\/]/.test(captionTrackDownloadName('../en', '../track/name', 'srt')), false, 'track/language cannot introduce path separators');
console.log('Caption editor whitelist + per-track downloads: PASS; actual pure controls, no database/provider calls.');
