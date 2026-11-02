import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { validateManifest } from '../dist/manifest.js';

// Actual local Chromium/Remotion/FFmpeg fixtures. No database, provider, remote
// source media or deployment is used. Keep artifacts for visual inspection.
const rendererRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = process.env.FINALFRAME_V5_ARTIFACT_DIR ? resolve(process.env.FINALFRAME_V5_ARTIFACT_DIR) : await mkdtemp(join(tmpdir(), 'finalframe-v5-render-'));
await mkdir(artifactRoot, { recursive: true });
function command(args, maxBuffer = 16 * 1024 * 1024) {
  const result = spawnSync('ffmpeg', args, { maxBuffer, timeout: 60_000 });
  if (result.status !== 0) throw new Error(`Local FFmpeg fixture failed: ${result.stderr?.toString().slice(-1500)}`);
  return result.stdout;
}
for (const [name, color, frequency] of [['red', 'red', 440], ['blue', 'blue', 880]]) {
  command(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=320x180:r=10:d=3`, '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=3`, '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', join(artifactRoot, `${name}.mp4`)]);
  command(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=320x180`, '-frames:v', '1', '-threads', '1', join(artifactRoot, `${name}.png`)]);
}
command(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=4', join(artifactRoot, 'music.wav')]);
const media = new Map([['/red.png', 'image/png'], ['/blue.png', 'image/png'], ['/red.mp4', 'video/mp4'], ['/blue.mp4', 'video/mp4'], ['/music.wav', 'audio/wav']]);
const server = createServer(async (request, response) => {
  if (!media.has(request.url)) { response.writeHead(404); response.end(); return; }
  const content = await readFile(join(artifactRoot, request.url.slice(1)));
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range) {
    const start = Number(range[1]); const end = range[2] ? Number(range[2]) : content.length - 1;
    response.writeHead(206, { 'content-type': media.get(request.url), 'content-range': `bytes ${start}-${end}/${content.length}`, 'content-length': end - start + 1, 'accept-ranges': 'bytes' });
    response.end(content.subarray(start, end + 1)); return;
  }
  response.writeHead(200, { 'content-type': media.get(request.url), 'content-length': content.length, 'accept-ranges': 'bytes' }); response.end(content);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const source = `http://127.0.0.1:${server.address().port}`;
const browserExecutable = process.env.FINALFRAME_TEST_CHROMIUM ?? '/usr/bin/chromium';
const browser = await openBrowser('chrome', { browserExecutable, logLevel: 'error' });
const serveUrl = await bundle({ entryPoint: join(rendererRoot, 'dist/remotion/entry.js') });
const base = {
  kind: 'finalframe.render-manifest', version: 5, manifestId: 'v5-actual', projectId: 'local-original-fixtures', rendererVersion: 'local-test',
  selection: { scope: 'TIMELINE', ids: [] }, export: { scope: 'TIMELINE', format: 'MP4' },
  output: { width: 320, height: 180, fps: 10, durationInFrames: 30, codec: 'h264' },
  tracks: [{ id: 'picture', kind: 'VIDEO', orderIndex: 0 }],
  items: [
    { id: 'red', kind: 'image', trackId: 'picture', src: `${source}/red.png`, startFrame: 0, durationInFrames: 20, orderIndex: 0 },
    { id: 'blue', kind: 'image', trackId: 'picture', src: `${source}/blue.png`, startFrame: 10, durationInFrames: 20, orderIndex: 1 },
  ],
  transitions: [{ id: 'join', fromItemId: 'red', toItemId: 'blue', kind: 'DISSOLVE', durationInFrames: 10, audioPolicy: 'PRESERVE' }],
};
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
async function composition(manifest) {
  const validation = validateManifest(manifest); assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  return selectComposition({ serveUrl, id: 'FinalFrameAssembly', inputProps: { manifest }, puppeteerInstance: browser, logLevel: 'error' });
}
async function still(manifest, frame, label) {
  const output = join(artifactRoot, `${label}.png`);
  await renderStill({ composition: await composition(manifest), serveUrl, inputProps: { manifest }, puppeteerInstance: browser, frame, imageFormat: 'png', output, logLevel: 'error', timeoutInMilliseconds: 20_000 });
  return command(['-hide_banner', '-loglevel', 'error', '-i', output, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-threads', '1', 'pipe:1']);
}
const pixel = (image, x, y) => [...image.subarray((y * 320 + x) * 3, (y * 320 + x) * 3 + 3)];
const red = value => value[0] > 235 && value[1] < 15 && value[2] < 15;
const blue = value => value[2] > 235 && value[0] < 15 && value[1] < 15;
function greenBounds(image) {
  const points = [];
  for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
    const p = pixel(image, x, y);
    if (p[1] > 160 && p[0] < 70 && p[2] < 70) points.push([x, y]);
  }
  assert.ok(points.length > 10, 'caption foreground is visibly rendered');
  return { top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) };
}
try {
  await check('actual frames show four distinct transitions and preserved boundary colors', async () => {
    for (const kind of ['DISSOLVE', 'FADE', 'WIPE', 'SLIDE']) {
      const manifest = structuredClone(base); manifest.manifestId = `actual-${kind}`; manifest.transitions[0].kind = kind;
      const middle = await still(manifest, 15, `${kind.toLowerCase()}-middle`);
      const left = pixel(middle, 80, 90); const right = pixel(middle, 240, 90);
      if (kind === 'DISSOLVE') assert.ok(left[0] > 110 && left[0] < 145 && left[2] > 110 && left[2] < 145, `dissolve actual color ${left}`);
      if (kind === 'FADE') assert.ok(left.every(channel => channel < 10), `fade midpoint ${left}`);
      if (kind === 'WIPE') { assert.ok(blue(left)); assert.ok(red(right)); }
      if (kind === 'SLIDE') { assert.ok(red(left)); assert.ok(blue(right)); }
    }
    assert.ok(red(pixel(await still(base, 5, 'before-transition'), 80, 90)));
    assert.ok(blue(pixel(await still(base, 25, 'after-transition'), 80, 90)));
  });
  await check('CUT has no overlap and changes on its exact output frame', async () => {
    const cut = structuredClone(base); cut.manifestId = 'actual-cut'; cut.transitions = []; cut.items[1].startFrame = 20; cut.output.durationInFrames = 40;
    assert.ok(red(pixel(await still(cut, 19, 'cut-before'), 80, 90)));
    assert.ok(blue(pixel(await still(cut, 20, 'cut-after'), 80, 90)));
  });
  await check('legacy v4 still ignores new transition metadata instead of reinterpreting saved exports', async () => {
    const old = structuredClone(base); old.version = 4; old.manifestId = 'legacy-v4-visual';
    assert.ok(blue(pixel(await still(old, 15, 'legacy-v4-overlap'), 80, 90)), 'legacy overlap retains the later opaque picture');
  });
  const caption = structuredClone(base); caption.manifestId = 'actual-captions'; caption.transitions = []; caption.items[1].startFrame = 20; caption.output.durationInFrames = 40;
  caption.captionTracks = [{ id: 'en', language: 'en', style: { fontSize: 24, color: '#00ff00', backgroundColor: '#000000ff', position: 'TOP', maxLines: 2 }, cues: [{ id: 'words', startFrame: 5, durationInFrames: 5, text: 'Readable caption' }] }];
  await check('caption style, placement and exact cue start/end are visible in real frames', async () => {
    assert.ok(red(pixel(await still(caption, 4, 'caption-before'), 30, 20)));
    const top = greenBounds(await still(caption, 5, 'caption-top'));
    assert.ok(top.top >= 14 && top.bottom < 60);
    for (const [position, expectedMinimum, expectedMaximum] of [['CENTER', 65, 115], ['BOTTOM', 115, 166]]) {
      const moved = structuredClone(caption); moved.manifestId = `caption-${position}`; moved.captionTracks[0].style.position = position;
      const bounds = greenBounds(await still(moved, 5, `caption-${position.toLowerCase()}`));
      assert.ok(bounds.top >= expectedMinimum && bounds.bottom <= expectedMaximum, `${position} caption bounds ${JSON.stringify(bounds)}`);
    }
    assert.ok(red(pixel(await still(caption, 10, 'caption-after'), 30, 20)));
    const large = structuredClone(caption); large.manifestId = 'caption-large'; large.captionTracks[0].style.fontSize = 48; large.captionTracks[0].cues[0].text = 'Caption';
    const bounds = greenBounds(await still(large, 5, 'caption-large'));
    assert.ok(bounds.bottom - bounds.top > (top.bottom - top.top) * 1.4, 'font-size style affects actual glyph size');
  });
  await check('complete readable wrapping succeeds and impossible maxLines fails the render', async () => {
    const fitted = structuredClone(caption); fitted.manifestId = 'caption-fit'; fitted.captionTracks[0].style.fontSize = 48;
    fitted.captionTracks[0].cues[0].text = 'All complete words remain in the final caption export.';
    greenBounds(await still(fitted, 5, 'caption-complete-fit'));
    const impossible = structuredClone(caption); impossible.manifestId = 'caption-impossible'; impossible.captionTracks[0].style.maxLines = 1;
    impossible.captionTracks[0].cues[0].text = 'Every complete word must remain visible. '.repeat(20);
    await assert.rejects(still(impossible, 5, 'caption-impossible'), /caption cannot fit readably/i);
  });
  const audioResults = {};
  await check('actual native audio crossfades only when explicit; independent music is preserved', async () => {
    for (const policy of ['PRESERVE', 'CROSSFADE']) {
      const native = structuredClone(base); native.manifestId = `native-${policy}`; native.transitions[0].audioPolicy = policy;
      native.items = native.items.map((item, index) => ({ ...item, kind: 'video', src: `${source}/${index ? 'blue' : 'red'}.mp4`, trimStartInFrames: index ? 4 : 5, volume: 0.8 }));
      native.audioTracks = [{ id: 'independent-music', src: `${source}/music.wav`, startFrame: 0, durationInFrames: 30, volume: 0.2 }];
      const output = join(artifactRoot, `native-${policy.toLowerCase()}.mp4`);
      await renderMedia({ composition: await composition(native), serveUrl, inputProps: { manifest: native }, puppeteerInstance: browser, codec: 'h264', concurrency: 1, outputLocation: output, logLevel: 'error', timeoutInMilliseconds: 20_000 });
      const pcm = command(['-hide_banner', '-loglevel', 'error', '-i', output, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1']);
      const samples = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
      assert.ok(samples.length / 48000 >= 2.9 && samples.length / 48000 <= 3.15);
      function amplitude(frequency, center) {
        const start = Math.round((center - 0.05) * 48000); const count = 4800;
        let real = 0; let imaginary = 0;
        for (let index = 0; index < count; index++) { const angle = 2 * Math.PI * frequency * index / 48000; real += samples[start + index] * Math.cos(angle); imaginary += samples[start + index] * Math.sin(angle); }
        return 2 * Math.hypot(real, imaginary) / count;
      }
      audioResults[policy] = { firstMid: amplitude(440, 1.55), secondMid: amplitude(880, 1.55), musicMid: amplitude(220, 1.55), firstBefore: amplitude(440, 0.55), secondAfter: amplitude(880, 2.55) };
    }
    const p = audioResults.PRESERVE; const c = audioResults.CROSSFADE;
    assert.ok(p.firstMid > 0.03 && p.secondMid > 0.03 && p.musicMid > 0.01, 'both original voices and independent music are audible');
    assert.ok(c.firstMid / p.firstMid > 0.32 && c.firstMid / p.firstMid < 0.64, JSON.stringify(audioResults));
    assert.ok(c.secondMid / p.secondMid > 0.36 && c.secondMid / p.secondMid < 0.68, JSON.stringify(audioResults));
    assert.ok(Math.abs(c.musicMid / p.musicMid - 1) < 0.1, 'native crossfade does not change independent music');
    assert.ok(Math.abs(c.firstBefore / p.firstBefore - 1) < 0.1 && Math.abs(c.secondAfter / p.secondAfter - 1) < 0.1);
  });
  await writeFile(join(artifactRoot, 'local-v5-results.json'), JSON.stringify({ checks, fixtureOnly: true, databaseCalls: 0, paidCalls: 0, audioResults }, null, 2));
  console.log(`Renderer v5 actual visual/audio tests: ${checks} PASS. Artifacts: ${artifactRoot}`);
} finally {
  await browser.close({ silent: true });
  await new Promise(done => server.close(done));
}
