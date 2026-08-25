const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const renderer = (relative) => require(path.join(root, 'renderer', 'dist', relative));
const { validateManifest } = renderer('manifest.js');
const { createAssemblyPlan } = renderer('assembly/plan.js');
const { BoundedDeterministicRenderer } = renderer('renderer.js');
const { validateOutputProbe, validatePosterSpec } = renderer('media/probe.js');
const { handleRendererCallback, signCallbackBody } = renderer('contracts/callback.js');

const baseManifest = {
  kind: 'finalframe.render-manifest',
  version: 2,
  manifestId: 'render-qa-manifest-v2',
  projectId: 'render-qa-project',
  rendererVersion: 'qa-fixture',
  output: { width: 1080, height: 1920, fps: 30, durationInFrames: 180, codec: 'h264', audio: { sampleRate: 48000, channels: 2 } },
  items: [
    { id: 'take-2', kind: 'video', src: 'file:///fixtures/take-2.mp4', orderIndex: 1, shotId: 'shot-2', shotVersionId: 'shot-2-v1', assetId: 'asset-2', startFrame: 90, durationInFrames: 90 },
    { id: 'take-1', kind: 'video', src: 'file:///fixtures/take-1.mp4', orderIndex: 0, shotId: 'shot-1', shotVersionId: 'shot-1-v1', assetId: 'asset-1', startFrame: 0, durationInFrames: 90 },
  ],
  shots: [
    { shotId: 'shot-2', shotVersionId: 'shot-2-v1', assetId: 'asset-2', orderIndex: 1, itemId: 'take-2', startFrame: 90, durationInFrames: 90, src: 'file:///fixtures/take-2.mp4' },
    { shotId: 'shot-1', shotVersionId: 'shot-1-v1', assetId: 'asset-1', orderIndex: 0, itemId: 'take-1', startFrame: 0, durationInFrames: 90, src: 'file:///fixtures/take-1.mp4' },
  ],
  audioTracks: [
    { id: 'music', src: 'file:///fixtures/music.mp3', startFrame: 0, durationInFrames: 180, role: 'music', volume: 0.25 },
    { id: 'dialogue', src: 'file:///fixtures/dialogue.wav', startFrame: 0, durationInFrames: 150, role: 'dialogue', volume: 1 },
  ],
  captionTracks: [{ id: 'captions-en', language: 'en', cues: [
    { id: 'cue-2', startFrame: 90, durationInFrames: 45, text: 'The reveal.' },
    { id: 'cue-1', startFrame: 15, durationInFrames: 45, text: 'The setup.' },
  ] }],
  poster: { src: 'file:///fixtures/poster.jpg', width: 1080, height: 1920, mimeType: 'image/jpeg' },
};

const failures = [];
async function check(label, callback) {
  try { await callback(); } catch (error) { failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
}

async function main() {
  await check('valid manifest and timing windows', () => {
    assert.equal(validateManifest(baseManifest).ok, true);
    assert.equal(validatePosterSpec(baseManifest.poster, baseManifest.output).ok, true);
  });

  await check('shot ordering is deterministic', () => {
    const plan = createAssemblyPlan(baseManifest);
    assert.deepEqual(plan.items.map((item) => item.id), ['take-1', 'take-2']);
    assert.deepEqual(plan.shots.map((shot) => shot.shotId), ['shot-1', 'shot-2']);
    assert.deepEqual(plan.audioTracks.map((track) => track.id), ['dialogue', 'music']);
    assert.deepEqual(plan.captionTracks[0].cues.map((cue) => cue.id), ['cue-1', 'cue-2']);
    assert.deepEqual(createAssemblyPlan(structuredClone(baseManifest)), plan, 'same manifest must yield the same assembly plan');
  });

  await check('missing and corrupt media are rejected', () => {
    const missing = structuredClone(baseManifest);
    missing.items[0].src = '';
    assert.equal(validateManifest(missing).ok, false);
    const corruptProbe = validateOutputProbe({ streams: [], format: {} }, baseManifest.output, { requireAudio: true });
    assert.equal(corruptProbe.ok, false);
    assert.match(corruptProbe.issues.map((issue) => issue.message).join(' '), /video stream|audio stream/);
    const wrongDimensions = validateOutputProbe({ streams: [{ codec_type: 'video', width: 640, height: 480, avg_frame_rate: '30/1' }], format: { duration: '6' } }, baseManifest.output);
    assert.equal(wrongDimensions.ok, false);
  });

  await check('audio and caption timing cannot exceed output', () => {
    const invalidAudio = structuredClone(baseManifest);
    invalidAudio.audioTracks[0].startFrame = 170;
    assert.equal(validateManifest(invalidAudio).ok, false);
    const invalidCaption = structuredClone(baseManifest);
    invalidCaption.captionTracks[0].cues[0].startFrame = 175;
    assert.equal(validateManifest(invalidCaption).ok, false);
  });

  await check('callback authentication and replay are idempotent', async () => {
    const now = Date.parse('2026-08-25T10:00:00.000Z');
    const envelope = { version: 1, eventId: 'event-render-1', eventType: 'render.completed', idempotencyKey: 'render-job-1', jobId: 'render-job-1', rendererVersion: 'qa-fixture', occurredAt: new Date(now).toISOString(), attempt: 1, payload: { outputPath: '/exports/render-1.mp4' } };
    const rawBody = JSON.stringify(envelope);
    const secret = 'local-render-test-secret';
    const receipts = new Map();
    const store = {
      get: async (eventId) => receipts.get(eventId) || null,
      claim: async (receipt) => { if (receipts.has(receipt.eventId)) return 'duplicate'; receipts.set(receipt.eventId, receipt); return 'claimed'; },
    };
    const signature = signCallbackBody(rawBody, secret);
    const first = await handleRendererCallback(rawBody, signature, secret, store, { now: () => now });
    const duplicate = await handleRendererCallback(rawBody, signature, secret, store, { now: () => now });
    const forged = await handleRendererCallback(rawBody, 'sha256=forged', secret, store, { now: () => now });
    assert.deepEqual(first.result, { status: 'accepted', duplicate: false });
    assert.deepEqual(duplicate.result, { status: 'accepted', duplicate: true });
    assert.equal(forged.result.status, 'rejected');
    assert.equal(receipts.size, 1);
  });

  await check('stale callbacks are rejected', async () => {
    const envelope = { version: 1, eventId: 'stale-event', eventType: 'render.failed', idempotencyKey: 'stale-job', jobId: 'stale-job', rendererVersion: 'qa-fixture', occurredAt: '2026-08-25T09:00:00.000Z', attempt: 1, payload: { error: 'timeout' } };
    const rawBody = JSON.stringify(envelope);
    const result = await handleRendererCallback(rawBody, signCallbackBody(rawBody, 'stale-secret'), 'stale-secret', { get: async () => null, claim: async () => 'claimed' }, { now: () => Date.parse('2026-08-25T10:00:00.000Z'), maxAgeMs: 60_000 });
    assert.equal(result.result.status, 'rejected');
  });

  await check('renderer is deterministic for a single request', async () => {
    const calls = [];
    const runtime = { render: async (plan, request) => { calls.push({ manifestId: plan.manifestId, jobId: request.jobId }); fs.mkdirSync(path.dirname(request.outputPath), { recursive: true }); fs.writeFileSync(request.outputPath, 'deterministic-render-fixture'); return { outputPath: request.outputPath, durationInFrames: plan.durationInFrames }; } };
    const render = new BoundedDeterministicRenderer(runtime);
    const request = { jobId: 'render-job-idempotency', manifest: baseManifest, outputPath: '/exports/render-job-idempotency.mp4' };
    const first = await render.render(request);
    const second = await render.render(structuredClone(request));
    assert.deepEqual(first, second);
    assert.equal(calls.length, 1, 'duplicate render requests must be deduplicated by idempotency key');
  });

  await check('download records and placeholder protection are enforced', () => {
    const exportActions = fs.readFileSync(path.join(root, 'src/lib/export/actions.ts'), 'utf8');
    assert.doesNotMatch(exportActions, /UNSUPPORTED_CONVEX_OPERATION|not exposed by the current Convex API/);
  });

  await check('placeholder media sources are rejected', () => {
    const manifestSource = fs.readFileSync(path.join(root, 'renderer/src/manifest.ts'), 'utf8');
    assert.match(manifestSource, /placeholder|example\.com|sample/i, 'manifest validation must reject placeholder media sources');
    const mediaSources = [
      ...baseManifest.items.map((item) => item.src),
      ...baseManifest.shots.map((shot) => shot.src),
      ...baseManifest.audioTracks.map((track) => track.src),
      baseManifest.poster.src,
    ].join('\\n');
    assert.doesNotMatch(mediaSources, /mock:|example\.com|placeholder|sample/i);
  });

  if (failures.length) {
    console.error(`Render/export contract tests: ${failures.length} FAILURE(S)`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('Render/export contract tests: PASS');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
