const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');

const repoRoot = path.resolve(__dirname, '../..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-render-contracts-'));

function compile(relativePath, outputName) {
    const sourcePath = path.join(repoRoot, relativePath);
    const outputPath = path.join(tempRoot, outputName);
    const result = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        fileName: sourcePath,
    });
    fs.writeFileSync(outputPath, result.outputText, 'utf8');
    return outputPath;
}

const contracts = require(compile('src/lib/render/contracts.ts', 'contracts.js'));
const fixtures = require(compile('tests/render/fixtures.ts', 'fixtures.js'));
const failures = [];

function check(label, callback) {
    try {
        callback();
    } catch (error) {
        failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

check('valid preset', () => {
    assert.equal(contracts.validateRenderPreset(fixtures.validRenderPreset).platform, 'REELS');
});

check('valid timeline', () => {
    const timeline = contracts.validateTimelineVersion(fixtures.validTimeline);
    assert.equal(timeline.tracks[0].clips[0].kind, 'VIDEO');
    assert.equal(timeline.captionTrackIds[0], 'captions-1');
});

check('valid assembly manifest', () => {
    const manifest = contracts.validateAssemblyManifest(fixtures.validAssemblyManifest);
    assert.equal(manifest.renderPreset.container, 'MP4');
    assert.equal(manifest.audioMix.tracks[0].role, 'VOICEOVER');
});

check('valid render states', () => {
    assert.equal(contracts.validateRenderJobState('VERIFYING'), 'VERIFYING');
    assert.equal(contracts.validateRenderJobState('COMPLETED'), 'COMPLETED');
});

check('valid export request', () => {
    const result = contracts.validateExportRequest({
        productionId: 'production-1',
        timelineVersionId: 'timeline-1',
        assemblyManifestId: 'manifest-1',
        presetId: 'preset-social-1080',
        destination: 'DOWNLOAD',
        requestedBy: 'user-1',
        idempotencyKey: 'export-production-1-v1',
    });
    assert.equal(result.destination, 'DOWNLOAD');
    assert.equal(contracts.validateExportStatus('READY'), 'READY');
});

check('rejects invalid preset dimensions', () => {
    assert.throws(() => contracts.validateRenderPreset({ ...fixtures.validRenderPreset, width: 0 }), /preset\.width/);
});

check('rejects mismatched track and clip kinds', () => {
    const invalid = structuredClone(fixtures.validTimeline);
    invalid.tracks[0].clips[0].kind = 'AUDIO';
    assert.throws(() => contracts.validateTimelineVersion(invalid), /must match its track kind/);
});

check('rejects negative probe size', () => {
    assert.throws(() => contracts.validateMediaProbe({
        probeVersion: '1', source: { assetId: 'asset-1' }, container: 'mp4', mimeType: 'video/mp4', byteSize: -1, durationSeconds: 1, streams: [], warnings: [], probedAt: '2026-08-25T00:00:00.000Z',
    }), /probe\.byteSize/);
});

if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
} else {
    console.log('Render contracts: PASS');
}
