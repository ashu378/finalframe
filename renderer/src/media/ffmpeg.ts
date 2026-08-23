import { ChildProcessCommandRunner, type CommandResult, type CommandRunner } from './command-runner.js';

export interface FFmpegAdapter {
  readonly command: string;
  execute(args: readonly string[], options?: { cwd?: string; timeoutMs?: number }): Promise<CommandResult>;
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
}

export class InjectableFFmpegAdapter implements FFmpegAdapter {
  readonly command: string;
  private readonly runner: CommandRunner;

  constructor(options: MediaAdapterOptions = {}) {
    this.command = options.ffmpegCommand ?? 'ffmpeg';
    this.runner = options.runner ?? new ChildProcessCommandRunner();
  }

  execute(args: readonly string[], options: { cwd?: string; timeoutMs?: number } = {}) {
    return this.runner.run(this.command, args, options);
  }
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
