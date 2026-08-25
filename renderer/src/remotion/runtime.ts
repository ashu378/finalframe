import { mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import os from 'node:os';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { normalizeWithFFmpeg, probeAndValidateOutput, type FFmpegAdapter, type FFprobeAdapter } from '../media/ffmpeg.js';
import type { AssemblyPlan } from '../assembly/plan.js';
import type { RenderRequest, RenderRuntime } from '../renderer.js';

export interface RemotionRuntimeOptions {
  entryPoint: string;
  ffmpeg?: FFmpegAdapter;
  ffprobe?: FFprobeAdapter;
  maxConcurrency?: number;
  commandTimeoutMs?: number;
  maxOutputBytes?: number;
  bundleCache?: Map<string, string>;
}

function safeOutputPath(value: string): string {
  if (!isAbsolute(value) || value.includes('\u0000')) throw new Error('Renderer outputPath must be an absolute safe path.');
  return value;
}

/** Real Remotion runtime. FFmpeg normalization and ffprobe verification are mandatory when adapters are supplied. */
export class RemotionRenderRuntime implements RenderRuntime {
  constructor(private readonly options: RemotionRuntimeOptions) {}

  async render(plan: AssemblyPlan, request: RenderRequest): Promise<{ outputPath: string; durationInFrames: number }> {
    const outputPath = safeOutputPath(request.outputPath);
    await mkdir(dirname(outputPath), { recursive: true });
    const cacheKey = this.options.entryPoint;
    const serveUrl = this.options.bundleCache?.get(cacheKey) ?? await bundle({ entryPoint: this.options.entryPoint });
    this.options.bundleCache?.set(cacheKey, serveUrl);
    const composition = await selectComposition({
      serveUrl,
      id: plan.compositionId,
      inputProps: { manifest: request.manifest },
    });
    const remotionPath = join(dirname(outputPath), `.${request.jobId}.${request.attempt ?? 1}.remotion.mp4`);
    const normalizedPath = join(dirname(outputPath), `.${request.jobId}.${request.attempt ?? 1}.normalized.mp4`);
    try {
      await renderMedia({
        composition: { ...composition, durationInFrames: plan.durationInFrames, fps: plan.fps, width: plan.width, height: plan.height },
        serveUrl,
        codec: plan.outputCodec ?? 'h264',
        outputLocation: remotionPath,
        inputProps: { manifest: request.manifest },
        concurrency: Math.max(1, Math.min(this.options.maxConcurrency ?? Math.max(1, Math.floor(os.cpus().length / 2)), 8)),
      });
      if (this.options.ffmpeg) {
        await normalizeWithFFmpeg(this.options.ffmpeg, remotionPath, normalizedPath, { output: request.manifest.output, requireAudio: Boolean(request.manifest.output.audio), timeoutMs: this.options.commandTimeoutMs, maxOutputBytes: this.options.maxOutputBytes });
        await rm(outputPath, { force: true });
        await (await import('node:fs/promises')).rename(normalizedPath, outputPath);
      } else {
        await rm(outputPath, { force: true });
        await (await import('node:fs/promises')).rename(remotionPath, outputPath);
      }
      if (this.options.ffprobe) {
        const validation = await probeAndValidateOutput(this.options.ffprobe, outputPath, request.manifest.output, { requireAudio: Boolean(request.manifest.output.audio), timeoutMs: this.options.commandTimeoutMs });
        if (!validation.ok) throw new Error(`Rendered output failed ffprobe validation: ${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
      }
      return { outputPath, durationInFrames: plan.durationInFrames };
    } finally {
      await rm(remotionPath, { force: true });
      await rm(normalizedPath, { force: true });
    }
  }
}
