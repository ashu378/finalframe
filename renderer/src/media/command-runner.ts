import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export interface CommandResult {
  command: string;
  args: readonly string[];
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type SpawnLike = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export interface CommandRunner {
  run(command: string, args: readonly string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxOutputBytes?: number }): Promise<CommandResult>;
}

export class MediaCommandError extends Error {
  constructor(
    message: string,
    readonly details: { command: string; args: readonly string[]; exitCode?: number; stderr?: string; timedOut?: boolean } ,
  ) {
    super(message);
    this.name = 'MediaCommandError';
  }
}

export class ChildProcessCommandRunner implements CommandRunner {
  constructor(private readonly spawn: SpawnLike = nodeSpawn) {}

  run(command: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxOutputBytes?: number } = {}): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = this.spawn(command, args, { cwd: options.cwd, env: options.env, shell: false });
      } catch (error) {
        reject(this.missingBinaryError(command, args, error));
        return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;
      const maxOutputBytes = options.maxOutputBytes ?? 1_048_576;
      const timeout = options.timeoutMs ? setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, options.timeoutMs) : undefined;
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => { if (Buffer.byteLength(stdout) < maxOutputBytes) stdout += chunk.slice(0, maxOutputBytes - Buffer.byteLength(stdout)); });
      child.stderr?.on('data', (chunk: string) => { if (Buffer.byteLength(stderr) < maxOutputBytes) stderr += chunk.slice(0, maxOutputBytes - Buffer.byteLength(stderr)); });
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        reject(this.missingBinaryError(command, args, error));
      });
      child.once('close', (exitCode) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        const result = { command, args, exitCode: exitCode ?? -1, stdout, stderr };
        if (result.exitCode !== 0) {
          reject(new MediaCommandError(timedOut ? `Media command timed out (${command}) after ${options.timeoutMs}ms` : `Media command failed (${command}) with exit code ${result.exitCode}: ${stderr.trim() || 'no stderr output'}`, { command, args, exitCode: result.exitCode, stderr, timedOut }));
        } else {
          resolve(result);
        }
      });
    });
  }

  private missingBinaryError(command: string, args: readonly string[], cause: unknown): MediaCommandError {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return new MediaCommandError(`Unable to start ${command}. FFmpeg/ffprobe binaries are runtime dependencies; install them on the worker or inject a CommandRunner. Original error: ${reason}`, { command, args });
  }
}
