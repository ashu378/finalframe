const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-manifest-contract-'));

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
const manifest = require(compile('renderer/src/manifest.ts', 'manifest.cjs'));
const valid = {
  kind: 'finalframe.render-manifest',
  version: 4,
  manifestId: 'manifest-v4',
  projectId: 'project-1',
  productionId: 'production-1',
  rendererVersion: 'finalframe-renderer-v1',
  selection: { scope: 'SHOTS', ids: ['shot-version-1'] },
  export: { scope: 'SHOTS', format: 'MP4' },
  output: { width: 1920, height: 1080, fps: 30, durationInFrames: 90, codec: 'h264' },
  items: [{ id: 'clip-1', kind: 'video', src: 'https://media.example.invalid/clip.mp4', startFrame: 0, durationInFrames: 90, shotId: 'shot-1', shotVersionId: 'shot-version-1', assetId: 'asset-1' }],
  shots: [{ shotId: 'shot-1', shotVersionId: 'shot-version-1', assetId: 'asset-1', orderIndex: 0, itemId: 'clip-1', startFrame: 0, durationInFrames: 90, src: 'https://media.example.invalid/clip.mp4' }],
};

assert.equal(manifest.validateManifest(valid).ok, true, 'v4 manifest validates');
assert.equal(manifest.validateManifest({ ...valid, version: 5 }).ok, true, 'v5 reader retains canonical shot selection');
assert.equal(manifest.validateManifest({ ...valid, selection: { scope: 'SHOTS', ids: [] } }).ok, false, 'scoped manifest requires selected IDs');
assert.equal(manifest.validateManifest({ ...valid, version: 3 }).ok, false, 'v3 is not a writable renderer contract');
const split = { ...valid, items: [
  { ...valid.items[0], durationInFrames: 45 },
  { ...valid.items[0], id: 'clip-2', startFrame: 45, durationInFrames: 45, trimStartInFrames: 45 },
], shots: [
  { ...valid.shots[0], durationInFrames: 45 },
  { ...valid.shots[0], itemId: 'clip-2', startFrame: 45, durationInFrames: 45, orderIndex: 1 },
] };
assert.equal(manifest.validateManifest(split).ok, true, 'one take can appear in multiple split timeline clips');
assert.equal(manifest.validateManifest({ ...split, shots: [split.shots[0], split.shots[0]] }).ok, false, 'duplicate item occurrences fail');
assert.equal(manifest.validateManifest({ ...split, shots: [{ ...split.shots[0], itemId: 'foreign-clip' }] }).ok, false, 'shot references must resolve to their exact timeline item');

const assembly = read('convex/assembly.ts');
const timeline = read('convex/timeline.ts');
const renderJobs = read('convex/renderJobs.ts');
const reviewExport = read('convex/reviewExport.ts');
assert.match(assembly, /const version = finishingV5Enabled\(\) \? 5 : 4/, 'writer defaults to v4 and explicitly gates v5');
assert.match(assembly, /contractVersion: version/, 'stored contract uses the selected writer version');
assert.match(assembly, /selectionScope/);
assert.match(assembly, /selectedSceneIds/);
assert.match(assembly, /items = rendererItems/);
assert.match(assembly, /\[4, 5\]\.includes\(Number\(manifestData\.version\)\)/, 'idempotent assembly reads both supported canonical versions');
assert.match(timeline, /!\[4, 5\]\.includes\(Number\(payload\.version\)\)/, 'timeline rejects other manifest versions');
assert.match(timeline, /payload\.version !== manifest\.contractVersion/, 'timeline rejects payload/stored contract mismatch');
assert.match(timeline, /!validateManifest\(payload\)\.ok/, 'timeline validates the canonical payload before creating a version');
assert.match(timeline, /item\.startFrame/);
assert.match(renderJobs, /manifestData\.version !== 4/);
assert.match(renderJobs, /manifestData\.version !== 5/);
assert.match(renderJobs, /manifestData\.version !== manifest\.contractVersion/);
assert.match(renderJobs, /export const getStatus/);
assert.match(renderJobs, /status: "COMPLETED", progress: 100/);
assert.match(reviewExport, /manifestData\.version !== 4/);
assert.match(reviewExport, /manifestData\.version !== 5/);
assert.match(reviewExport, /manifestData\.version !== manifest\.contractVersion/);
assert.match(reviewExport, /by_idempotency/);
assert.match(reviewExport, /status: "QUEUED", progress: 0/);
assert.match(reviewExport, /downloadUrl/);

console.log(JSON.stringify({ ok: true, checked: 'manifest-v4-v5-selection-async-export' }));
