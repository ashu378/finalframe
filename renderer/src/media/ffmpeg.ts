import { ChildProcessCommandRunner, type CommandResult, type CommandRunner } from './command-runner.js';
import type { RenderOutputSpec, RenderResourceLimits, ValidationResult } from '../types.js';
import { validateOutputProbe } from './probe.js';

export interface FFmpegAdapter {
  readonly command: string;
  execute(args: readonly string[], options?: { cwd?: string; timeoutMs?: number; maxOutputBytes?: number }): Promise<CommandResult>;
}

export interface FFprobeAdapter {
  readonly command: string;
  probe(input: string, options?: { cwd?: string; timeoutMs?: number }): Promise<FFprobeResult>;
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

function assertLocalMediaPath(value: string, label: string): void {
  if (!value || value.includes('\u0000') || /^(https?|data|javascript):/i.test(value)) throw new Error(`${label} must be a local worker path`);
}

/** Builds an argv-only normalization command; no shell interpolation is used. */
export function buildNormalizeArgs(inputPath: string, outputPath: string, options: FFmpegAssemblyOptions): string[] {
  assertLocalMediaPath(inputPath, 'FFmpeg input');
  assertLocalMediaPath(outputPath, 'FFmpeg output');
  const audioExpected = options.requireAudio || Boolean(options.output.audio);
  return [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
    '-map', '0:v:0', ...(audioExpected ? ['-map', '0:a:0?'] : []),
    ...codecArgs(options.output.codec), '-pix_fmt', options.output.codec === 'prores' ? 'yuv422p10le' : 'yuv420p',
    '-r', String(options.output.fps), '-frames:v', String(options.output.durationInFrames),
    ...(audioExpected ? ['-c:a', 'aac', '-ar', String(options.output.audio?.sampleRate ?? 48000), '-ac', String(options.output.audio?.channels ?? 2), '-b:a', '192k'] : ['-an']),
    ...(options.output.codec === 'h264' ? ['-movflags', '+faststart'] : []), outputPath,
  ];
}

export async function normalizeWithFFmpeg(ffmpeg: FFmpegAdapter, inputPath: string, outputPath: string, options: FFmpegAssemblyOptions): Promise<CommandResult> {
  return ffmpeg.execute(buildNormalizeArgs(inputPath, outputPath, options), { timeoutMs: options.timeoutMs, maxOutputBytes: options.maxOutputBytes });
}

export async function probeAndValidateOutput(ffprobe: FFprobeAdapter, outputPath: string, expected: RenderOutputSpec, options: { requireAudio?: boolean; durationToleranceSeconds?: number; timeoutMs?: number } = {}): Promise<ValidationResult> {
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

  async probe(input: string, options: { cwd?: string; timeoutMs?: number } = {}): Promise<FFprobeResult> {
    const result = await this.runner.run(this.command, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input], options);
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
