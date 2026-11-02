import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { RemotionRenderRuntime } from '../dist/remotion/runtime.js';
import { createAssemblyPlan } from '../dist/assembly/plan.js';
import { createMediaAdapters } from '../dist/media/ffmpeg.js';

// Actual runtime -> local Chromium -> Remotion PCM -> final FFmpeg. Original
// synthetic media only; no providers, database, private URLs or paid calls.
const rendererRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = process.env.FINALFRAME_RUNTIME_ONSET_ARTIFACT_DIR ? resolve(process.env.FINALFRAME_RUNTIME_ONSET_ARTIFACT_DIR) : await mkdtemp(join(tmpdir(), 'finalframe-runtime-onsets-'));
await mkdir(artifacts, { recursive: true });
const ffmpeg = process.env.FINALFRAME_TEST_FFMPEG ?? 'ffmpeg';
const ffprobe = process.env.FINALFRAME_TEST_FFPROBE ?? 'ffprobe';
function run(executable, args) {
  const result = spawnSync(executable, args, { maxBuffer: 32 * 1024 * 1024, timeout: 90_000 });
  if (result.status !== 0) throw new Error(`${executable}: ${result.stderr?.toString().slice(-1800)}`);
  return result.stdout;
}
function ff(args) { return run(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args]); }
function writeClicks(name, channel, times) {
  const rate = 48000; const samples = Buffer.alloc(rate * 4 * 4);
  for (const time of times) for (let i = 0; i < 240; i++) {
    samples.writeInt16LE(Math.round(22000 * Math.exp(-i / 22) * Math.cos(i * 0.7)), (Math.round(time * rate) + i) * 4 + channel * 2);
  }
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + samples.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(samples.length, 40);
  return writeFile(join(artifacts, name), Buffer.concat([header, samples]));
}
await writeClicks('native.wav', 0, [0.5, 1, 1.5, 2, 2.5, 3]);
await writeClicks('music.wav', 1, [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25]);
ff(['-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=30:d=4', '-i', join(artifacts, 'native.wav'), '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', join(artifacts, 'native.mov')]);
ff(['-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x90', '-frames:v', '1', '-threads', '1', join(artifacts, 'black.png')]);
const entryPoint = join(rendererRoot, 'dist/remotion/entry.js');
const serveUrl = await bundle({ entryPoint, publicDir: artifacts });
const runtime = new RemotionRenderRuntime({ entryPoint, bundleCache: new Map([[entryPoint, serveUrl]]), ...createMediaAdapters({ ffmpegCommand: ffmpeg, ffprobeCommand: ffprobe }), maxConcurrency: 1, commandTimeoutMs: 90_000 });
const base = {
  kind: 'finalframe.render-manifest', version: 5, manifestId: 'local-runtime-onsets', projectId: 'original-local-onsets', rendererVersion: 'local-test',
  selection: { scope: 'TIMELINE', ids: [] }, export: { scope: 'TIMELINE', format: 'MP4' },
  output: { width: 160, height: 90, fps: 30, durationInFrames: 120, codec: 'h264', audio: { sampleRate: 48000, channels: 2 } },
  tracks: [{ id: 'picture', kind: 'VIDEO', orderIndex: 0 }],
  // Absolute browser paths resolve against the local bundle's publicDir; no
  // network hostname/private-host exception is added to the runtime policy.
  items: [{ id: 'native', kind: 'video', trackId: 'picture', src: '/public/native.mov', startFrame: 15, durationInFrames: 90, trimStartInFrames: 6, volume: 0.7, orderIndex: 0 }],
  audioTracks: [{ id: 'music', src: '/public/music.wav', startFrame: 9, durationInFrames: 96, trimStartInFrames: 3, volume: 0.5, fadeInFrames: 24, fadeOutFrames: 24 }],
};
const checks = [];
async function render(manifest, label) {
  manifest.manifestId = label;
  const outputPath = join(artifacts, `${label}.${manifest.output.codec === 'vp9' ? 'webm' : manifest.output.codec === 'prores' ? 'mov' : 'mp4'}`);
  const result = await runtime.render(createAssemblyPlan(manifest), { jobId: label, outputPath, manifest, mode: 'fixture' });
  assert.equal(result.verification?.videoCodec, manifest.output.codec);
  const probe = JSON.parse(run(ffprobe, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', outputPath]));
  assert.equal(Number(probe.streams.find(s => s.codec_type === 'video').nb_read_frames), manifest.output.durationInFrames);
  return { outputPath, probe, result };
}
function pcm(path) {
  const bytes = ff(['-i', path, '-vn', '-ac', '2', '-ar', '48000', '-f', 'f32le', 'pipe:1']);
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
function impulse(samples, channel, time) {
  const center = Math.round(time * 48000); let peak = center - 4800;
  for (let index = peak + 1; index < center + 4800; index++) if (Math.abs(samples[index * 2 + channel]) > Math.abs(samples[peak * 2 + channel])) peak = index;
  assert.ok(Math.abs(samples[peak * 2 + channel]) > 0.005, `audible impulse at ${time}s channel ${channel}`);
  assert.ok(Math.abs(peak - center) <= 96, `impulse at ${time}s channel ${channel} shifted ${(peak - center) / 48}ms`);
  return Math.abs(samples[peak * 2 + channel]);
}
const selected = process.env.FINALFRAME_RUNTIME_ONSET_CASES?.split(',') ?? ['native-music', 'optional-native', 'silent', 'h264', 'vp9', 'prores'];
for (const label of selected) {
  const manifest = structuredClone(base);
  if (label === 'native-music') {
    const { outputPath } = await render(manifest, label);
    const samples = pcm(outputPath); assert.equal(samples.length / 2, 4 * 48000);
    for (const time of [0.8, 1.3, 1.8, 2.3, 2.8, 3.3]) impulse(samples, 0, time);
    const early = impulse(samples, 1, 0.45); const middle = impulse(samples, 1, 1.45); const late = impulse(samples, 1, 3.45);
    for (const time of [0.95, 1.95, 2.45, 2.95]) impulse(samples, 1, time);
    assert.ok(early < middle * 0.4 && late < middle * 0.4, 'soundtrack fade-in/out preserved');
  } else if (label === 'optional-native') {
    delete manifest.output.audio; manifest.audioTracks = [];
    const { outputPath, result } = await render(manifest, label);
    assert.equal(result.verification.hasAudio, true, 'native audio survives an undeclared soundtrack');
    impulse(pcm(outputPath), 0, 0.8); impulse(pcm(outputPath), 0, 3.3);
  } else if (label === 'silent') {
    delete manifest.output.audio; manifest.audioTracks = []; manifest.output.durationInFrames = 30;
    manifest.items = [{ ...manifest.items[0], kind: 'image', src: '/public/black.png', startFrame: 0, durationInFrames: 30 }];
    delete manifest.items[0].trimStartInFrames;
    const { probe } = await render(manifest, label);
    assert.equal(probe.streams.some(s => s.codec_type === 'audio'), false, 'no fabricated track in a silent composition');
  } else {
    assert.ok(['h264', 'vp9', 'prores'].includes(label));
    manifest.export.format = { h264: 'MP4', vp9: 'WEBM', prores: 'MOV' }[label];
    manifest.output.codec = label; manifest.output.durationInFrames = 30; manifest.audioTracks = [];
    manifest.items[0].startFrame = 0; manifest.items[0].durationInFrames = 30; manifest.items[0].trimStartInFrames = 0;
    const { outputPath, result } = await render(manifest, `preset-${label}`);
    assert.equal(result.verification.hasAudio, true);
    assert.equal(result.verification.audioCodec, { h264: 'aac', vp9: 'opus', prores: 'pcm_s16le' }[label], 'audio codec matches the export container');
    impulse(pcm(outputPath), 0, 0.5);
  }
  assert.equal((await readdir(artifacts)).some(name => name.startsWith(`.${label}.`) || name.startsWith(`.preset-${label}.`)), false, 'intermediates cleaned');
  checks.push(label); console.log(`PASS ${label}`);
}
await writeFile(join(artifacts, 'results.json'), JSON.stringify({ fixtureOnly: true, databaseCalls: 0, paidCalls: 0, checks }, null, 2));
console.log(`Runtime audio onset tests: ${checks.length} PASS. Artifacts: ${artifacts}`);
