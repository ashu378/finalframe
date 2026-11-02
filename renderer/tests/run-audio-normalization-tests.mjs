import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { InjectableFFmpegAdapter, InjectableFFprobeAdapter, normalizeWithFFmpeg } from '../dist/media/ffmpeg.js';
import { validateOutputProbe } from '../dist/media/probe.js';

// Original synthesized local WAV/video fixtures, actual FFmpeg and ffprobe.
// No browser, database, provider, downloaded media or network access is used.
const directory = process.env.FINALFRAME_AUDIO_ARTIFACT_DIR ? resolve(process.env.FINALFRAME_AUDIO_ARTIFACT_DIR) : await mkdtemp(join(tmpdir(), 'finalframe-audio-normalization-'));
await mkdir(directory, { recursive: true });
const ffmpeg = new InjectableFFmpegAdapter(); const ffprobe = new InjectableFFprobeAdapter();
const base = { width: 160, height: 90, fps: 30, durationInFrames: 60, codec: 'h264' };
const records = []; let checks = 0;
function command(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 8 * 1024 * 1024, timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr?.toString()); return result.stdout;
}
async function wav(name, duration, sampleAt) {
  const rate = 44100; const count = Math.round(duration * rate); const bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  for (let at = 0; at < count; at++) bytes.writeInt16LE(Math.round(sampleAt(at / rate) * 32767), 44 + at * 2);
  const file = join(directory, name + '.wav'); await writeFile(file, bytes); return file;
}
const silent = join(directory, 'silent-input.mp4');
command(['-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=2', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', silent]);
async function mux(name, duration, sampleAt) {
  const source = await wav(name, duration, sampleAt); const file = join(directory, name + '-input.mp4');
  command(['-i', silent, '-i', source, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-b:a', '192k', file]); return file;
}
function decode(file) {
  const bytes = command(['-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1']);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}
function amplitude(samples, frequency, center) {
  const count = 9600; const start = Math.round(center * 48000 - count / 2); let real = 0; let imaginary = 0;
  for (let at = 0; at < count; at++) { const angle = 2 * Math.PI * frequency * at / 48000; real += samples[start + at] * Math.cos(angle); imaginary += samples[start + at] * Math.sin(angle); }
  return 2 * Math.hypot(real, imaginary) / count;
}
async function normalize(name, input, expected = base) {
  const output = join(directory, name + '-normalized.mp4'); await normalizeWithFFmpeg(ffmpeg, input, output, { output: expected, timeoutMs: 60_000, maxOutputBytes: 8_192 });
  const probe = await ffprobe.probe(output); const result = validateOutputProbe(probe, expected); assert.equal(result.ok, true, JSON.stringify(result.issues));
  const duration = expected.durationInFrames / expected.fps; const video = probe.streams.find(stream => stream.codec_type === 'video'); const audio = probe.streams.find(stream => stream.codec_type === 'audio');
  assert.equal(Number(video.nb_frames), expected.durationInFrames); assert.ok(Math.abs(Number(video.duration) - duration) < .001); assert.ok(Math.abs(Number(probe.format.duration) - duration) < .001);
  if (audio) { assert.ok(Math.abs(Number(audio.duration) - duration) < .001, JSON.stringify(audio)); assert.equal(Number(audio.start_time), 0); assert.equal(Number(audio.sample_rate), expected.audio?.sampleRate ?? 48000); assert.equal(Number(audio.channels), expected.audio?.channels ?? 2); }
  records.push({ name, input, output, expectedDuration: duration, format: probe.format.duration, streams: probe.streams.map(stream => ({ kind: stream.codec_type, duration: stream.duration, start: stream.start_time, frames: stream.nb_frames, sampleRate: stream.sample_rate })) });
  return { output, probe };
}
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }

await check('long audio is trimmed to the exact picture duration despite AAC packet padding', async () => {
  const input = await mux('long', 3.25, time => .14 * Math.sin(2 * Math.PI * (time < 2 ? 440 : 880) * time));
  const before = await ffprobe.probe(input); assert.ok(Number(before.streams.find(stream => stream.codec_type === 'audio').duration) > 3.2);
  const { output } = await normalize('long', input); assert.ok(amplitude(decode(output), 440, 1) > .1);
});
await check('short audio is padded with silence without shortening or looping picture/audio', async () => {
  const input = await mux('short', .35, time => .14 * Math.sin(2 * Math.PI * 440 * time)); const { output } = await normalize('short', input); const samples = decode(output);
  assert.ok(amplitude(samples, 440, .15) > .1); const tail = samples.subarray(48000, 90000); const rms = Math.sqrt(tail.reduce((sum, sample) => sum + sample * sample, 0) / tail.length); assert.ok(rms < 1e-5, 'tail must be silent, not repeated sound: ' + rms);
});
await check('an input without audio remains silent and does not gain a fabricated track', async () => {
  const { probe } = await normalize('silent', silent); assert.equal(probe.streams.some(stream => stream.codec_type === 'audio'), false);
  assert.equal(validateOutputProbe(probe, base, { requireAudio: true }).ok, false);
});
await check('fractional-second frame duration keeps all picture frames and exact audio end', async () => {
  const input = records.find(record => record.name === 'long').input;
  await normalize('fractional', input, { ...base, durationInFrames: 47, audio: { sampleRate: 48000, channels: 2 } });
  await normalize('fractional-44100', input, { ...base, fps: 24, durationInFrames: 47, audio: { sampleRate: 44100, channels: 1 } });
  await normalize('single-frame', input, { ...base, fps: 60, durationInFrames: 1 });
});
await check('premixed native frequencies and independent music survive normalization and resampling', async () => {
  const input = await mux('native-and-music', 2, time => .12 * Math.sin(2 * Math.PI * (time < 1 ? 440 : 880) * time) + .06 * Math.sin(2 * Math.PI * 220 * time));
  const before = decode(input); const { output } = await normalize('native-and-music', input); const after = decode(output);
  for (const [frequency, center] of [[440,.5],[880,1.5],[220,.5],[220,1.5]]) { const original = amplitude(before, frequency, center); const normalized = amplitude(after, frequency, center); assert.ok(original > .04); assert.ok(normalized / original > .8 && normalized / original < 1.2, JSON.stringify({ frequency, center, original, normalized })); }
  assert.ok(amplitude(after, 880, .5) < .005); assert.ok(amplitude(after, 440, 1.5) < .005);
});

await writeFile(join(directory, 'normalization-verification.json'), JSON.stringify({ checks, records }, null, 2));
console.log(`Audio normalization: ${checks} PASS; actual local FFmpeg/probe; no database/network/provider calls. Artifacts: ${directory}`);
