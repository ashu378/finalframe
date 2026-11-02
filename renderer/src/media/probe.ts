import type { FFprobeResult } from './ffmpeg.js';
import type { RenderOutputSpec, PosterSpec, ValidationIssue, ValidationResult } from '../types.js';

export interface ValidatedMediaProbe {
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  subtitleStreamCount: number;
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

function streamTime(stream: Record<string, unknown> | undefined, secondsKey: string, ticksKey: string): number | undefined {
  const ticks = numeric(stream?.[ticksKey]); const timeBase = frameRate(stream?.time_base);
  return ticks !== undefined && timeBase !== undefined && timeBase > 0 ? ticks * timeBase : numeric(stream?.[secondsKey]);
}

function streamTolerance(stream: Record<string, unknown> | undefined): number {
  const timeBase = frameRate(stream?.time_base); const sampleRate = numeric(stream?.sample_rate);
  // Optional timing fields are often absent in WebM and old fixtures. Known
  // values get a tight quantization allowance rather than container tolerance.
  return Math.max(0.002, timeBase && timeBase > 0 ? Math.min(timeBase, 0.01) : 0, sampleRate && sampleRate > 0 ? 2 / sampleRate : 0);
}

export function normalizeProbe(probe: FFprobeResult): ValidatedMediaProbe {
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  const subtitleStreamCount = probe.streams.filter((stream) => stream.codec_type === 'subtitle').length;
  return {
    width: numeric(video?.width),
    height: numeric(video?.height),
    durationSeconds: numeric(probe.format?.duration) ?? streamTime(video, 'duration', 'duration_ts') ?? streamTime(audio, 'duration', 'duration_ts'),
    fps: frameRate(video?.avg_frame_rate ?? video?.r_frame_rate),
    videoCodec: typeof video?.codec_name === 'string' ? video.codec_name : undefined,
    audioCodec: typeof audio?.codec_name === 'string' ? audio.codec_name : undefined,
    audioSampleRate: numeric(audio?.sample_rate),
    audioChannels: numeric(audio?.channels),
    subtitleStreamCount,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
  };
}

export function validateOutputProbe(
  probe: FFprobeResult,
  expected: RenderOutputSpec,
  options: {
    durationToleranceSeconds?: number;
    requireAudio?: boolean;
    expectedCaptionTrackCount?: number;
    captionMode?: 'none' | 'burned-in' | 'subtitle';
  } = {},
): ValidationResult & { value?: ValidatedMediaProbe } {
  const value = normalizeProbe(probe);
  const issues: ValidationIssue[] = [];
  const tolerance = options.durationToleranceSeconds ?? Math.max(0.1, 1 / expected.fps);
  if (!value.hasVideo) issues.push({ path: 'streams', message: 'rendered output must contain a video stream' });
  if (value.width === undefined) issues.push({ path: 'video.width', message: 'ffprobe did not report video width' });
  else if (value.width !== expected.width) issues.push({ path: 'video.width', message: `expected ${expected.width}, received ${value.width}` });
  if (value.height === undefined) issues.push({ path: 'video.height', message: 'ffprobe did not report video height' });
  else if (value.height !== expected.height) issues.push({ path: 'video.height', message: `expected ${expected.height}, received ${value.height}` });
  if (value.fps === undefined) issues.push({ path: 'video.fps', message: 'ffprobe did not report video frame rate' });
  else if (Math.abs(value.fps - expected.fps) > 0.01) issues.push({ path: 'video.fps', message: `expected ${expected.fps}, received ${value.fps}` });
  const expectedCodec = expected.codec === 'h264' ? ['h264', 'avc1'] : expected.codec === 'vp9' ? ['vp9'] : ['prores', 'prores_ks'];
  if (!value.videoCodec) issues.push({ path: 'video.codec', message: 'ffprobe did not report video codec' });
  else if (!expectedCodec.includes(value.videoCodec)) issues.push({ path: 'video.codec', message: `expected ${expected.codec}, received ${value.videoCodec}` });
  if (value.durationSeconds === undefined) issues.push({ path: 'format.duration', message: 'ffprobe did not report output duration' });
  const expectedDuration = expected.durationInFrames / expected.fps;
  if (value.durationSeconds !== undefined && Math.abs(value.durationSeconds - expectedDuration) > tolerance) issues.push({ path: 'format.duration', message: `expected approximately ${expectedDuration.toFixed(3)} seconds, received ${value.durationSeconds.toFixed(3)}` });
  for (const kind of ['video', 'audio'] as const) {
    const stream = probe.streams.find(candidate => candidate.codec_type === kind);
    if (!stream) continue;
    const timingTolerance = streamTolerance(stream);
    const duration = streamTime(stream, 'duration', 'duration_ts'); const reportedDuration = numeric(stream.duration);
    if ([duration, reportedDuration].some(seconds => seconds !== undefined && Math.abs(seconds - expectedDuration) > timingTolerance)) issues.push({ path: `${kind}.duration`, message: `known stream duration must match ${expectedDuration.toFixed(6)} seconds within timestamp quantization` });
    const start = streamTime(stream, 'start_time', 'start_pts'); const reportedStart = numeric(stream.start_time);
    if ([start, reportedStart].some(seconds => seconds !== undefined && Math.abs(seconds) > timingTolerance)) issues.push({ path: `${kind}.start_time`, message: 'known output stream start must be zero within timestamp quantization' });
    if (kind === 'video') for (const field of ['nb_frames', 'nb_read_frames']) {
      const count = numeric(stream[field]);
      if (count !== undefined && (!Number.isInteger(count) || count !== expected.durationInFrames)) issues.push({ path: `video.${field}`, message: `expected exactly ${expected.durationInFrames} video frames, received ${count}` });
    }
  }
  if (options.requireAudio || expected.audio) {
    if (!value.hasAudio) issues.push({ path: 'streams', message: 'rendered output must contain an audio stream' });
    if (expected.audio && value.audioSampleRate !== undefined && value.audioSampleRate !== expected.audio.sampleRate) issues.push({ path: 'audio.sample_rate', message: `expected ${expected.audio.sampleRate}, received ${value.audioSampleRate}` });
    if (expected.audio && value.audioChannels !== undefined && value.audioChannels !== expected.audio.channels) issues.push({ path: 'audio.channels', message: `expected ${expected.audio.channels}, received ${value.audioChannels}` });
  }
  if (value.hasAudio) {
    const expectedAudioCodec = expected.codec === 'vp9' ? 'opus' : expected.codec === 'prores' ? 'pcm_s16le' : 'aac';
    if (value.audioCodec !== expectedAudioCodec) issues.push({ path: 'audio.codec', message: `expected ${expectedAudioCodec} for ${expected.codec} output` });
  }
  const expectedCaptions = options.expectedCaptionTrackCount ?? 0;
  if (options.captionMode === 'subtitle' && value.subtitleStreamCount < expectedCaptions) {
    issues.push({ path: 'streams.subtitle', message: `expected at least ${expectedCaptions} subtitle stream(s), received ${value.subtitleStreamCount}` });
  }
  if (options.captionMode === 'burned-in' && expectedCaptions < 1) issues.push({ path: 'captions', message: 'burned-in caption verification requires at least one manifest caption track' });
  return issues.length ? { ok: false, issues } : { ok: true, issues, value };
}

export function validatePosterSpec(poster: PosterSpec, expected: Pick<RenderOutputSpec, 'width' | 'height'>): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (poster.width !== expected.width || poster.height !== expected.height) issues.push({ path: 'poster', message: `poster dimensions must match output dimensions ${expected.width}x${expected.height}` });
  if (!poster.src.trim()) issues.push({ path: 'poster.src', message: 'poster source is required' });
  return { ok: issues.length === 0, issues };
}
