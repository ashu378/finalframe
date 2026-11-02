const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-workspace-controls-'));
try {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/lib/production/workspace-controls.ts'), 'utf8');
    fs.writeFileSync(path.join(dir, 'controls.cjs'), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
    const { validateShotOperationControls: validate } = require(path.join(dir, 'controls.cjs'));
    const assets = [{ id: 'image', mimeType: 'image/png' }, { id: 'video', mimeType: 'video/mp4' }, { id: 'audio', mimeType: 'audio/wav' }];
    const base = { operation: 'GENERATE', audioPolicy: 'SILENT', referenceAssetIds: [], firstFrameAssetId: '', lastFrameAssetId: '' };
    assert.deepEqual(validate(base, assets), []);
    assert.throws(() => validate({ ...base, referenceAssetIds: ['foreign'] }, assets), /this project/);
    assert.throws(() => validate({ ...base, firstFrameAssetId: 'video' }, assets), /project images/);
    assert.throws(() => validate({ ...base, operation: 'FRAME_TO_VIDEO' }, assets), /first frame/);
    assert.throws(() => validate({ ...base, operation: 'APPEARANCE_EDIT' }, assets), /source video/);
    assert.throws(() => validate({ ...base, operation: 'PERFORMANCE_TRANSFER', referenceAssetIds: ['video'] }, assets), /character reference/);
    assert.deepEqual(validate({ ...base, operation: 'PERFORMANCE_TRANSFER', referenceAssetIds: ['video', 'image'] }, assets), ['video', 'image']);
    assert.throws(() => validate({ ...base, operation: 'LIP_SYNC', referenceAssetIds: ['image'] }, assets), /audio recording/);
    assert.deepEqual(validate({ ...base, operation: 'LIP_SYNC', referenceAssetIds: ['image', 'audio'], audioPolicy: 'USE_RECORDING' }, assets), ['image', 'audio']);
    assert.throws(() => validate({ ...base, audioPolicy: 'KEEP_SOURCE' }, assets), /source video/);
    assert.throws(() => validate({ ...base, audioPolicy: 'USE_RECORDING' }, assets), /audio recording/);
    assert.deepEqual(validate({ ...base, referenceAssetIds: ['image'], firstFrameAssetId: 'image' }, assets), ['image']);
    console.log('PASS workspace operation validation (12 assertions); no database or provider calls.');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
