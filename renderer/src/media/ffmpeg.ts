import { ChildProcessCommandRunner, type CommandResult, type CommandRunner } from './command-runner.js';
import type { RenderOutputSpec, RenderResourceLimits, ValidationResult } from '../types.js';
import { validateOutputProbe } from './probe.js';

export interface FFmpegAdapter {
  readonly command: string;
  execute(args: readonly string[], options?: { cwd?: string; timeoutMs?: number; maxOutputBytes?: number }): Promise<CommandResult>;
}

export interface FFprobeAdapter {
  readonly command: string;
  probe(input: string, options?: { cwd?: string; timeoutMs?: number; countFrames?: boolean }): Promise<FFprobeResult>;
}

export interface FFprobeResult {
  streams: Array<Record<string, unknown>>;
  format?: Record<string, unknown>;
}

export interface MediaAdapterOptions {
  ffmpegCommand?: string;
  ffprobeCommand?: string;
  runner?: CommandRunner;
  limits?: Pick<RenderResourceLimits, 'commandTimeoutMs'>;
}

export class InjectableFFmpegAdapter implements FFmpegAdapter {
  readonly command: string;
  private readonly runner: CommandRunner;

  constructor(options: MediaAdapterOptions = {}) {
    this.command = options.ffmpegCommand ?? 'ffmpeg';
    this.runner = options.runner ?? new ChildProcessCommandRunner();
  }

  execute(args: readonly string[], options: { cwd?: string; timeoutMs?: number; maxOutputBytes?: number } = {}) {
    return this.runner.run(this.command, args, options);
  }
}

export interface FFmpegAssemblyOptions {
  output: RenderOutputSpec;
  requireAudio?: boolean;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

function codecArgs(codec: RenderOutputSpec['codec']): string[] {
  if (codec === 'vp9') return ['-c:v', 'libvpx-vp9', '-deadline', 'good', '-cpu-used', '2'];
  if (codec === 'prores') return ['-c:v', 'prores_ks', '-profile:v', '3'];
  return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18'];
}

function audioCodecArgs(codec: RenderOutputSpec['codec']): string[] {
  if (codec === 'vp9') return ['-c:a', 'libopus', '-b:a', '192k'];
  if (codec === 'prores') return ['-c:a', 'pcm_s16le'];
  return ['-c:a', 'aac', '-b:a', '192k'];
}

function assertLocalMediaPath(value: string, label: string): void {
  if (!value || value.includes('\u0000') || /^(https?|data|javascript):/i.test(value)) throw new Error(`${label} must be a local worker path`);
}

/** Builds an argv-only normalization command; no shell interpolation is used. */
export function buildNormalizeArgs(inputPath: string, outputPath: string, options: FFmpegAssemblyOptions): string[] {
  assertLocalMediaPath(inputPath, 'FFmpeg input');
  assertLocalMediaPath(outputPath, 'FFmpeg output');
  const durationSeconds = options.output.durationInFrames / options.output.fps;
  const sampleRate = options.output.audio?.sampleRate ?? 48000;
  const audioSamples = Math.round(durationSeconds * sampleRate);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isSafeInteger(audioSamples) || audioSamples <= 0) throw new Error('Normalization requires a bounded positive output duration.');
  return [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
    // Preserve any mixed/native audio even when an older manifest did not
    // declare a separate soundtrack. The optional map still permits silence.
    '-map', '0:v:0', '-map', '0:a:0?',
    ...codecArgs(options.output.codec), '-pix_fmt', options.output.codec === 'prores' ? 'yuv422p10le' : 'yuv420p',
    // A video frame limit can stop the whole mux before AAC drains on FFmpeg
    // 5.1 (the production image). The frame-derived -t below bounds every
    // stream; ffprobe still requires the exact canonical video frame count.
    '-r', String(options.output.fps),
    // Remotion/AAC packet padding can outlive the final picture. Normalize the
    // decoded audio to the canonical sample count and bound the mux duration,
    // so independent chunks do not accumulate encoder padding when joined.
    ...audioCodecArgs(options.output.codec), '-ar', String(sampleRate), '-ac', String(options.output.audio?.channels ?? 2),
    '-af', `aresample=${sampleRate},apad,atrim=end_sample=${audioSamples},asetpts=PTS-STARTPTS`,
    '-t', String(durationSeconds),
    ...(options.output.codec === 'h264' ? ['-movflags', '+faststart'] : []), outputPath,
  ];
}

export async function normalizeWithFFmpeg(ffmpeg: FFmpegAdapter, inputPath: string, outputPath: string, options: FFmpegAssemblyOptions): Promise<CommandResult> {
  return ffmpeg.execute(buildNormalizeArgs(inputPath, outputPath, options), { timeoutMs: options.timeoutMs, maxOutputBytes: options.maxOutputBytes });
}

export async function probeAndValidateOutput(
  ffprobe: FFprobeAdapter,
  outputPath: string,
  expected: RenderOutputSpec,
  options: { requireAudio?: boolean; durationToleranceSeconds?: number; timeoutMs?: number; expectedCaptionTrackCount?: number; captionMode?: 'none' | 'burned-in' | 'subtitle' } = {},
): Promise<ValidationResult & { value?: ReturnType<typeof validateOutputProbe>['value'] }> {
  const probe = await ffprobe.probe(outputPath, { timeoutMs: options.timeoutMs });
  return validateOutputProbe(probe, expected, options);
}

export class InjectableFFprobeAdapter implements FFprobeAdapter {
  readonly command: string;
  private readonly runner: CommandRunner;

  constructor(options: MediaAdapterOptions = {}) {
    this.command = options.ffprobeCommand ?? 'ffprobe';
    this.runner = options.runner ?? new ChildProcessCommandRunner();
  }

  async probe(input: string, options: { cwd?: string; timeoutMs?: number; countFrames?: boolean } = {}): Promise<FFprobeResult> {
    const result = await this.runner.run(this.command, ['-v', 'error', '-protocol_whitelist', 'file,pipe', ...(options.countFrames ? ['-count_frames'] : []), '-print_format', 'json', '-show_format', '-show_streams', input], options);
    try {
      const parsed = JSON.parse(result.stdout) as Partial<FFprobeResult>;
      return { streams: Array.isArray(parsed.streams) ? parsed.streams : [], format: parsed.format };
    } catch (error) {
      throw new Error(`ffprobe returned invalid JSON for ${input}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function createMediaAdapters(options: MediaAdapterOptions = {}): { ffmpeg: FFmpegAdapter; ffprobe: FFprobeAdapter } {
  const runner = options.runner ?? new ChildProcessCommandRunner();
  return {
    ffmpeg: new InjectableFFmpegAdapter({ ...options, runner }),
    ffprobe: new InjectableFFprobeAdapter({ ...options, runner }),
  };
}
