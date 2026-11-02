import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import { buildNormalizeArgs } from '../dist/media/ffmpeg.js';
import { validateManifest } from '../dist/manifest.js';

// Local original impulses only. No database, provider, private URL or paid call.
// Keeps each intermediate so encoder/mux timing can be inspected independently.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = process.env.FINALFRAME_ONSET_ARTIFACT_DIR ? resolve(process.env.FINALFRAME_ONSET_ARTIFACT_DIR) : await mkdtemp(join(tmpdir(), 'finalframe-audio-onset-'));
await mkdir(artifacts, { recursive: true });
const ffmpeg = process.env.FINALFRAME_TEST_FFMPEG ?? 'ffmpeg';
function command(executable, args) {
  const result = spawnSync(executable, args, { maxBuffer: 32 * 1024 * 1024, timeout: 90_000 });
  if (result.status !== 0) throw new Error(`${executable} failed: ${result.stderr?.toString().slice(-1200)}`);
  return result.stdout;
}
function ff(args) { return command(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args]); }
const wav = join(artifacts, 'clicks.wav');
if (process.env.FINALFRAME_ONSET_SOURCE_WAV) await copyFile(resolve(process.env.FINALFRAME_ONSET_SOURCE_WAV), wav);
else {
  const rate = 16000; const count = rate * 12; const samples = Buffer.alloc(count * 2);
  for (let beat = 1; beat < 24; beat++) for (let i = 0; i < 160; i++) samples.writeInt16LE(Math.round(28000 * Math.exp(-i / 18) * Math.cos(i * 0.6)), (beat * rate / 2 + i) * 2);
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + samples.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(samples.length, 40);
  await writeFile(wav, Buffer.concat([header, samples]));
}
ff(['-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180', '-frames:v', '1', '-threads', '1', join(artifacts, 'black.png')]);
const media = new Map([['/clicks.wav', 'audio/wav'], ['/black.png', 'image/png']]);
const server = createServer(async (request, response) => {
  if (!media.has(request.url)) { response.writeHead(404); response.end(); return; }
  const bytes = await readFile(join(artifacts, request.url.slice(1)));
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  const start = range ? Number(range[1]) : 0; const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
  response.writeHead(range ? 206 : 200, { 'content-type': media.get(request.url), 'content-length': end - start + 1, 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${bytes.length}` } : {}) });
  response.end(bytes.subarray(start, end + 1));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const source = `http://127.0.0.1:${server.address().port}`;
const manifest = {
  kind: 'finalframe.render-manifest', version: 5, manifestId: 'original-local-clicks', projectId: 'local-onset-diagnostic', rendererVersion: 'local-test',
  selection: { scope: 'TIMELINE', ids: [] }, export: { scope: 'TIMELINE', format: 'MP4' },
  output: { width: 320, height: 180, fps: 30, durationInFrames: 360, codec: 'h264', audio: { sampleRate: 48000, channels: 2 } },
  tracks: [{ id: 'picture', kind: 'VIDEO', orderIndex: 0 }],
  items: [{ id: 'black', kind: 'image', trackId: 'picture', src: `${source}/black.png`, startFrame: 0, durationInFrames: 360, orderIndex: 0 }],
  audioTracks: [{ id: 'original-clicks', src: `${source}/clicks.wav`, startFrame: 0, durationInFrames: 360, trimStartInFrames: 0, volume: 0.6, fadeInFrames: 0, fadeOutFrames: 0 }],
};
assert.equal(validateManifest(manifest).ok, true);
function measure(path) {
  const bytes = ff(['-i', path, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1']);
  const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const peakSamples = [];
  for (let beat = 1; beat < 24; beat++) {
    const center = beat * 24000; let peak = center - 7200;
    for (let i = peak + 1; i < Math.min(center + 7200, samples.length); i++) if (Math.abs(samples[i]) > Math.abs(samples[peak])) peak = i;
    assert.ok(Math.abs(samples[peak]) > 0.01, `missing impulse ${beat} in ${path}`);
    peakSamples.push(peak);
  }
  return { samples: samples.length, peakSamples };
}
const measurements = { source: measure(wav) };
const browser = await openBrowser('chrome', { browserExecutable: process.env.FINALFRAME_TEST_CHROMIUM ?? '/usr/bin/chromium', logLevel: 'error' });
try {
  const serveUrl = await bundle({ entryPoint: join(root, 'dist/remotion/entry.js') });
  const composition = await selectComposition({ serveUrl, id: 'FinalFrameAssembly', inputProps: { manifest }, puppeteerInstance: browser, logLevel: 'error' });
  const variants = process.env.FINALFRAME_ONSET_VARIANTS?.split(',') ?? ['default-aac', 'separate-aac', 'separate-pcm', 'pcm-mkv'];
  for (const variant of variants) {
    assert.ok(['default-aac', 'separate-aac', 'separate-pcm', 'pcm-mkv'].includes(variant));
    const outputLocation = join(artifacts, `${variant}.${variant === 'pcm-mkv' ? 'mkv' : 'mp4'}`);
    const sidecar = variant.startsWith('separate-') ? join(artifacts, variant === 'separate-pcm' ? 'mix.wav' : 'mix.aac') : null;
    await renderMedia({ composition, serveUrl, inputProps: { manifest }, puppeteerInstance: browser, codec: 'h264', concurrency: 1, outputLocation, logLevel: 'error', timeoutInMilliseconds: 30_000, ...(sidecar ? { separateAudioTo: sidecar } : {}), ...(['separate-pcm', 'pcm-mkv'].includes(variant) ? { preferLossless: true } : {}) });
    const rawAudio = sidecar ?? outputLocation;
    measurements[`${variant}-raw`] = measure(rawAudio);
    const normalized = join(artifacts, `${variant}-normalized.mp4`);
    const args = buildNormalizeArgs(outputLocation, normalized, { output: manifest.output, requireAudio: true });
    if (sidecar) {
      // Diagnostic equivalent of the current normalizer with the lossless mix
      // as a separate explicit input. No hardcoded delay/trim compensation.
      args.splice(args.indexOf('-map'), 0, '-i', sidecar);
      args[args.indexOf('0:a:0?')] = '1:a:0';
    }
    command(ffmpeg, args);
    measurements[`${variant}-normalized`] = measure(normalized);
    console.log(`Measured ${variant}`);
  }
  const sourcePeaks = measurements.source.peakSamples;
  const summary = Object.fromEntries(Object.entries(measurements).map(([name, value]) => {
    const errorsMs = value.peakSamples.map((sample, i) => (sample - sourcePeaks[i]) / 48);
    return [name, { samples: value.samples, firstErrorMs: errorsMs[0], medianErrorMs: [...errorsMs].sort((a, b) => a - b)[Math.floor(errorsMs.length / 2)], maximumAbsoluteErrorMs: Math.max(...errorsMs.map(Math.abs)), errorsMs }];
  }));
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ fixtureOnly: true, databaseCalls: 0, paidCalls: 0, summary }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Artifacts: ${artifacts}`);
  // This tests a zero-compensation PCM intermediate, rather than accepting the
  // known compressed intermediate's timing defect as the desired behavior.
  for (const variant of variants.filter(value => ['separate-pcm', 'pcm-mkv'].includes(value))) {
    assert.ok(summary[`${variant}-normalized`].maximumAbsoluteErrorMs < 2, 'lossless mix preserves every original impulse within 2ms');
    assert.equal(summary[`${variant}-normalized`].samples, 12 * 48000, 'exact decoded canonical sample count');
  }
} finally {
  await browser.close({ silent: true });
  await new Promise(done => server.close(done));
}
