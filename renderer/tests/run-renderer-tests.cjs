const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  const candidates = [request, request.endsWith('.js') ? request.slice(0, -3) + '.ts' : request];
  for (const candidate of candidates) {
    try { return originalResolve.call(this, candidate, parent, isMain, options); } catch {}
  }
  throw new Error(`Cannot resolve ${request}`);
};
Module._extensions['.ts'] = function compile(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename }).outputText;
  module._compile(output, filename);
};

const manifest = require(path.join(root, 'src', 'manifest.ts'));
const plan = require(path.join(root, 'src', 'assembly', 'plan.ts'));
const renderer = require(path.join(root, 'src', 'renderer.ts'));
const ffmpeg = require(path.join(root, 'src', 'media', 'ffmpeg.ts'));
const probe = require(path.join(root, 'src', 'media', 'probe.ts'));
const callback = require(path.join(root, 'src', 'contracts', 'callback.ts'));
const sourcePolicy = require(path.join(root, 'src', 'media', 'source-policy.ts'));

async function main() {
  const fixture = JSON.parse(await fsp.readFile(path.join(root, 'fixtures', 'kinetic-title.json'), 'utf8'));
  const imageManifest = {
    ...fixture,
    manifestId: 'renderer-test',
    output: { ...fixture.output, width: 640, height: 360, fps: 24, durationInFrames: 48 },
    items: [
      { id: 'image', kind: 'image', src: 'https://media.finalframe.app/image.png', startFrame: 0, durationInFrames: 48, orderIndex: 1, fit: 'contain' },
      { id: 'title', kind: 'motion-graphics', templateId: 'kinetic-title', props: { title: 'Test' }, startFrame: 0, durationInFrames: 48, orderIndex: 0 },
    ],
    audioTracks: [{ id: 'voice', src: 'file:///tmp/voice.wav', startFrame: 0, durationInFrames: 48, volume: 1, fadeInFrames: 4, fadeOutFrames: 4 }],
    captionTracks: [{ id: 'en', language: 'en', cues: [{ id: 'cue-1', startFrame: 0, durationInFrames: 24, text: 'Hello' }] }],
  };
  assert.equal(manifest.validateManifest(imageManifest).ok, true);
  const ordered = plan.createAssemblyPlan(imageManifest);
  assert.deepEqual(ordered.items.map((item) => item.id), ['title', 'image']);
  assert.equal(ordered.audioTracks.length, 1);

  const args = ffmpeg.buildNormalizeArgs('/tmp/input.mp4', '/tmp/output.mp4', { output: imageManifest.output, requireAudio: true });
  assert.ok(args.includes('-map') && args.includes('0:a:0?'));
  assert.ok(args.includes('-frames:v') && args.includes('48'));
  assert.throws(() => ffmpeg.buildNormalizeArgs('https://example.test/input.mp4', '/tmp/output.mp4', { output: imageManifest.output }), /local worker path/);

  const validProbe = { streams: [{ codec_type: 'video', width: 640, height: 360, avg_frame_rate: '24/1', codec_name: 'h264' }, { codec_type: 'audio', codec_name: 'aac' }], format: { duration: '2' } };
  assert.equal(probe.validateOutputProbe(validProbe, imageManifest.output, { requireAudio: true }).ok, true);
  assert.equal(probe.validateOutputProbe({ ...validProbe, streams: [{ ...validProbe.streams[0], codec_name: 'vp9' }] }, imageManifest.output).ok, false);
  assert.equal(probe.validateOutputProbe({ streams: [] }, imageManifest.output).ok, false);
  assert.equal(sourcePolicy.validateWorkerMediaSource('http://127.0.0.1/private.mp4', { mode: 'production' }).ok, false);
  assert.equal(sourcePolicy.validateWorkerMediaSource('https://media.finalframe.app/video.mp4', { mode: 'production' }).ok, true);

  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'finalframe-renderer-'));
  const outputPath = path.join(tmp, 'final.mp4');
  let calls = 0;
  const fakeRuntime = { render: async (assemblyPlan, request) => { calls += 1; await fsp.writeFile(request.outputPath, Buffer.from('deterministic-output')); return { outputPath: request.outputPath, durationInFrames: assemblyPlan.durationInFrames }; } };
  const bounded = new renderer.BoundedDeterministicRenderer(fakeRuntime);
  const request = { jobId: 'job-1', idempotencyKey: 'same-request', manifest: imageManifest, outputPath, mode: 'fixture' };
  const first = await bounded.render(request);
  const second = await bounded.render(request);
  assert.equal(calls, 1);
  assert.equal(first.outputPath, outputPath);
  assert.equal(second.outputPath, outputPath);
  assert.equal(await fsp.readFile(outputPath, 'utf8'), 'deterministic-output');

  const lockedManifest = {
    ...imageManifest,
    audioTracks: [{ ...imageManifest.audioTracks[0], src: 'https://media.finalframe.app/voice.wav' }],
    metadata: { lockState: 'LOCKED', lockId: 'lock-1', lockedAt: '2026-08-25T09:00:00.000Z', lockedBy: 'user-1' },
  };
  const verifiedBody = Buffer.from('verified-production-output');
  const verifiedRuntime = { render: async (assemblyPlan, request) => {
    await fsp.writeFile(request.outputPath, verifiedBody);
    return {
      outputPath: request.outputPath,
      durationInFrames: assemblyPlan.durationInFrames,
      verification: {
        checkedBy: 'ffprobe', checkedAt: new Date().toISOString(), fileSizeBytes: verifiedBody.length,
        width: 640, height: 360, fps: 24, durationSeconds: 2, videoCodec: 'h264', audioCodec: 'aac', hasAudio: true,
        orderedItemIds: ['title', 'image'], captionTrackCount: 1, captionMode: 'burned-in',
      },
    };
  } };
  await assert.rejects(
    () => new renderer.BoundedDeterministicRenderer(verifiedRuntime).render({ jobId: 'unlocked', manifest: imageManifest, outputPath: path.join(tmp, 'unlocked.mp4') }),
    /not locked for production/,
  );
  const productionResult = await new renderer.BoundedDeterministicRenderer(verifiedRuntime).render({ jobId: 'locked', manifest: lockedManifest, outputPath: path.join(tmp, 'locked.mp4') });
  assert.equal(productionResult.verification.checkedBy, 'ffprobe');
  await assert.rejects(
    () => new renderer.BoundedDeterministicRenderer(fakeRuntime).render({ jobId: 'unverified', manifest: lockedManifest, outputPath: path.join(tmp, 'unverified.mp4') }),
    /must be verified by ffprobe/,
  );

  const raw = callback.createCallbackBody({ eventId: 'event-1', idempotencyKey: 'same-request', jobId: 'job-1', rendererVersion: 'test', attempt: 1, eventType: 'render.completed', payload: { outputPath } });
  const signature = callback.signCallbackBody(raw, 'secret');
  const receipts = new Map();
  const store = { get: async (id) => receipts.get(id) || null, claim: async (receipt) => { if (receipts.has(receipt.eventId)) return 'duplicate'; receipts.set(receipt.eventId, receipt); return 'claimed'; } };
  assert.equal((await callback.handleRendererCallback(raw, signature, 'secret', store)).result.duplicate, false);
  assert.equal((await callback.handleRendererCallback(raw, signature, 'secret', store)).result.duplicate, true);
  let sent;
  await callback.sendRendererCallback('https://renderer.example.test/callback', raw, 'secret', { fetch: async (url, init) => { sent = { url, init }; return new Response(null, { status: 202 }); } });
  assert.equal(sent.init.headers['x-finalframe-renderer-signature'], signature);

  await fsp.rm(tmp, { recursive: true, force: true });
  console.log('FinalFrame renderer tests: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
