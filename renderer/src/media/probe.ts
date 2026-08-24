import type { FFprobeResult } from './ffmpeg.js';
import type { RenderOutputSpec, PosterSpec, ValidationIssue, ValidationResult } from '../types.js';

export interface ValidatedMediaProbe {
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  hasVideo: boolean;
  hasAudio: boolean;
}

function numeric(value: unknown): number | undefined {
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(result) ? result : undefined;
}

function frameRate(value: unknown): number | undefined {
  if (typeof value !== 'string') return numeric(value);
  const [numerator, denominator] = value.split('/').map(Number);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : numeric(value);
}

export function normalizeProbe(probe: FFprobeResult): ValidatedMediaProbe {
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  return {
    width: numeric(video?.width),
    height: numeric(video?.height),
    durationSeconds: numeric(probe.format?.duration ?? video?.duration ?? audio?.duration),
    fps: frameRate(video?.avg_frame_rate ?? video?.r_frame_rate),
    videoCodec: typeof video?.codec_name === 'string' ? video.codec_name : undefined,
    audioCodec: typeof audio?.codec_name === 'string' ? audio.codec_name : undefined,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
  };
}

export function validateOutputProbe(
  probe: FFprobeResult,
  expected: RenderOutputSpec,
  options: { durationToleranceSeconds?: number; requireAudio?: boolean } = {},
): ValidationResult & { value?: ValidatedMediaProbe } {
  const value = normalizeProbe(probe);
  const issues: ValidationIssue[] = [];
  const tolerance = options.durationToleranceSeconds ?? Math.max(0.1, 1 / expected.fps);
  if (!value.hasVideo) issues.push({ path: 'streams', message: 'rendered output must contain a video stream' });
  if (value.width !== undefined && value.width !== expected.width) issues.push({ path: 'video.width', message: `expected ${expected.width}, received ${value.width}` });
  if (value.height !== undefined && value.height !== expected.height) issues.push({ path: 'video.height', message: `expected ${expected.height}, received ${value.height}` });
  if (value.fps !== undefined && Math.abs(value.fps - expected.fps) > 0.01) issues.push({ path: 'video.fps', message: `expected ${expected.fps}, received ${value.fps}` });
  const expectedDuration = expected.durationInFrames / expected.fps;
  if (value.durationSeconds !== undefined && Math.abs(value.durationSeconds - expectedDuration) > tolerance) issues.push({ path: 'format.duration', message: `expected approximately ${expectedDuration.toFixed(3)} seconds, received ${value.durationSeconds.toFixed(3)}` });
  if (options.requireAudio || expected.audio) {
    if (!value.hasAudio) issues.push({ path: 'streams', message: 'rendered output must contain an audio stream' });
  }
  return issues.length ? { ok: false, issues } : { ok: true, issues, value };
}

export function validatePosterSpec(poster: PosterSpec, expected: Pick<RenderOutputSpec, 'width' | 'height'>): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (poster.width !== expected.width || poster.height !== expected.height) issues.push({ path: 'poster', message: `poster dimensions must match output dimensions ${expected.width}x${expected.height}` });
  if (!poster.src.trim()) issues.push({ path: 'poster.src', message: 'poster source is required' });
  return { ok: issues.length === 0, issues };
}

