const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-timeline-view-'));
try {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/lib/production/timeline-view.ts'), 'utf8');
    fs.writeFileSync(path.join(dir, 'view.cjs'), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
    const { toTimelineVersion } = require(path.join(dir, 'view.cjs'));
    const timeline = { _id: 'timeline', productionId: 'production', status: 'DRAFT', versionNumber: 1, durationSeconds: 4, createdAt: 1, createdByUserId: 'owner' };
    const draft = { timeline, tracks: [
        { id: 'video-track', kind: 'VIDEO', orderIndex: 0, clips: [{ id: 'video-clip', trackId: 'video-track', assetId: 'video', startSeconds: 0, durationSeconds: 2, trimStartSeconds: 3 }] },
        { id: 'graphic-track', kind: 'GRAPHIC', orderIndex: 1, clips: [{ id: 'title-clip', trackId: 'graphic-track', startSeconds: 2, durationSeconds: 2, metadata: { motionTemplateId: 'brand-card', templateProps: { title: 'Exact title', brandName: 'Project brand' } } }] },
        { id: 'audio-track', kind: 'AUDIO', orderIndex: 2, clips: [{ id: 'audio-clip', trackId: 'audio-track', assetId: 'audio', startSeconds: 0, durationSeconds: 2, volume: 0.5 }] },
    ] };
    const view = toTimelineVersion(draft, 'LOCKED');
    assert.equal(view.status, 'LOCKED');
    assert.equal(view.tracks[0].clips[0].sourceStartSeconds, 3, 'source trim must not be replaced by timeline position');
    assert.equal(view.tracks[0].clips[0].sourceDurationSeconds, 2);
    assert.deepEqual(view.tracks.map((track) => track.id), ['video-track', 'graphic-track', 'audio-track']);
    assert.deepEqual(view.tracks.flatMap((track) => track.clips.map((clip) => clip.id)), ['video-clip', 'title-clip', 'audio-clip']);
    assert.equal(view.tracks[1].clips[0].props.title, 'Exact title');
    assert.equal(view.tracks[1].clips[0].templateId, 'brand-card');
    assert(Math.abs(view.tracks[2].clips[0].volumeDb + 6.020599913279624) < 0.00001);
    const legacy = toTimelineVersion({ timeline, tracks: [{ _id: 'raw-track', kind: 'VIDEO' }], clips: [{ _id: 'raw-clip', trackId: 'raw-track', assetId: 'raw-asset', startSeconds: 0, durationSeconds: 2 }] }, 'APPROVED');
    assert.equal(legacy.status, 'APPROVED');
    assert.equal(legacy.tracks[0].clips[0].id, 'raw-clip');
    assert.equal(toTimelineVersion(null), undefined);
    const portrait = toTimelineVersion({ ...draft, timeline: { ...timeline, outputPreset: 'SOCIAL_VERTICAL' } });
    assert.deepEqual([portrait.width, portrait.height], [1080, 1920]);
    const square = toTimelineVersion({ ...draft, timeline: { ...timeline, outputPreset: 'SQUARE' } });
    assert.deepEqual([square.width, square.height], [1080, 1080]);
    assert.deepEqual([view.width, view.height], [1920, 1080]);
    console.log('PASS normalized and legacy timeline editor projections (14 assertions); no database or provider calls.');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
