import assert from 'node:assert/strict';
import { validateOutputProbe } from '../dist/media/probe.js';

const expected = { width: 1080, height: 1080, fps: 30, durationInFrames: 105, codec: 'h264', audio: { sampleRate: 48000, channels: 2 } };
const canonical = () => ({ streams: [
  { codec_type: 'video', width: 1080, height: 1080, codec_name: 'h264', avg_frame_rate: '30/1', time_base: '1/15360', start_time: '0.000000', start_pts: 0, duration: '3.500000', duration_ts: 53760, nb_frames: '105' },
  { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, time_base: '1/48000', start_time: '0.000000', start_pts: 0, duration: '3.500000', duration_ts: 168000, nb_frames: '166' },
], format: { duration: '3.500000' } });
let checks = 0; function check(name, run) { run(); checks++; console.log('PASS ' + name); }
function rejects(probe, path, options) { const result = validateOutputProbe(probe, expected, options); assert.equal(result.ok, false); assert.ok(result.issues.some(issue => issue.path === path), JSON.stringify(result.issues)); }

check('canonical MP4 timing and exact video frame count pass', () => { assert.equal(validateOutputProbe(canonical(), expected).ok, true); });
check('actual downloaded62ms AAC overrun fails even when aggregate tolerance would accept it', () => {
  // Timing excerpt from the coordinator's original fixture-only online output:
  // 105 video frames/3.5s; AAC170976 ticks at48kHz/3.562s.
  const padded = canonical(); padded.streams[1].duration = '3.562000'; padded.streams[1].duration_ts = 170976; padded.streams[1].nb_frames = '168'; padded.format.duration = '3.562000';
  rejects(padded, 'audio.duration'); padded.format.duration = '3.500000'; rejects(padded, 'audio.duration', { durationToleranceSeconds: 1 });
});
check('known audio/video start offsets fail from seconds or timestamp ticks', () => {
  for (const [index, kind] of [[0,'video'],[1,'audio']]) for (const sign of [-1,1]) {
    const shifted = canonical(); shifted.streams[index].start_time = String(sign * .033333); rejects(shifted, kind + '.start_time');
    const ticks = canonical(); delete ticks.streams[index].start_time; ticks.streams[index].start_pts = sign * (index ? 1600 : 512); rejects(ticks, kind + '.start_time');
  }
});
check('known per-stream duration drift is checked independently of format duration', () => {
  for (const [index, kind] of [[0,'video'],[1,'audio']]) {
    const drift = canonical(); drift.streams[index].duration = '3.530000'; rejects(drift, kind + '.duration');
    const ticks = canonical(); delete ticks.streams[index].duration; ticks.streams[index].duration_ts += index ? 1440 : 512; rejects(ticks, kind + '.duration');
  }
});
check('reported video frame counts are exact and audio packet counts are separate', () => {
  for (const field of ['nb_frames','nb_read_frames']) for (const count of [104,106,105.5]) { const wrong = canonical(); wrong.streams[0][field] = String(count); rejects(wrong, 'video.' + field); }
  const valid = canonical(); valid.streams[1].nb_frames = '999'; assert.equal(validateOutputProbe(valid, expected).ok, true);
});
check('unknown WebM and legacy optional stream timing stays compatible', () => {
  const webm = canonical(); webm.streams[0].codec_name = 'vp9'; webm.streams[1].codec_name = 'opus';
  for (const stream of webm.streams) for (const field of ['duration','duration_ts','start_time','start_pts','nb_frames','nb_read_frames']) stream[field] = 'N/A';
  assert.equal(validateOutputProbe(webm, { ...expected, codec: 'vp9' }).ok, true);
  for (const stream of webm.streams) for (const field of ['duration','duration_ts','start_time','start_pts','nb_frames','nb_read_frames','time_base','sample_rate','channels']) delete stream[field];
  assert.equal(validateOutputProbe(webm, { ...expected, codec: 'vp9' }, { requireAudio: true }).ok, true);
});
check('fractional frame duration allows timestamp/sample quantization without masking drift', () => {
  const fractional = canonical(); fractional.format.duration = '1.566667'; fractional.streams[0].duration = '1.566667'; fractional.streams[0].duration_ts = 24064; fractional.streams[0].nb_frames = '47'; fractional.streams[1].duration = '1.566667'; fractional.streams[1].duration_ts = 75200;
  assert.equal(validateOutputProbe(fractional, { ...expected, durationInFrames: 47 }).ok, true);
  const fallback = canonical(); fallback.format.duration = 'N/A'; assert.equal(validateOutputProbe(fallback, expected).ok, true);
});
console.log(`Probe stream timing: ${checks} PASS; pure original probe fixtures; no database/network/provider calls.`);
