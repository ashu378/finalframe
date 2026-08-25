import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import os from 'node:os';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { normalizeWithFFmpeg, probeAndValidateOutput, type FFmpegAdapter, type FFprobeAdapter } from '../media/ffmpeg.js';
import { assertLockedManifest, assertValidManifest } from '../manifest.js';
import { assertManifestMediaSources } from '../media/source-policy.js';
import type { WorkerMediaPolicy } from '../media/source-policy.js';
import type { AssemblyPlan } from '../assembly/plan.js';
import type { RenderRequest, RenderRuntime } from '../renderer.js';
import type { RenderArtifactVerification } from '../types.js';

export interface RemotionRuntimeOptions {
  entryPoint: string;
  ffmpeg?: FFmpegAdapter;
  ffprobe?: FFprobeAdapter;
  maxConcurrency?: number;
  commandTimeoutMs?: number;
  maxOutputBytes?: number;
  bundleCache?: Map<string, string>;
  requireMediaTools?: boolean;
  mediaPolicy?: Pick<WorkerMediaPolicy, 'allowedRemoteHosts' | 'allowedLocalRoots'>;
}

function safeOutputPath(value: string): string {
  if (!isAbsolute(value) || value.includes('\u0000')) throw new Error('Renderer outputPath must be an absolute safe path.');
  return value;
}

/** Real Remotion runtime. FFmpeg normalization and ffprobe verification are mandatory when adapters are supplied. */
export class RemotionRenderRuntime implements RenderRuntime {
  constructor(private readonly options: RemotionRuntimeOptions) {}

  async render(plan: AssemblyPlan, request: RenderRequest): Promise<{ outputPath: string; durationInFrames: number; verification?: RenderArtifactVerification }> {
    const production = (request.mode ?? 'production') === 'production';
    const manifest = production ? assertLockedManifest(request.manifest) : assertValidManifest(request.manifest);
    assertManifestMediaSources(manifest, { mode: production ? 'production' : 'fixture', ...this.options.mediaPolicy });
    if (production && (this.options.requireMediaTools ?? true) && (!this.options.ffmpeg || !this.options.ffprobe)) {
      throw new Error('Renderer unavailable: production rendering requires both FFmpeg normalization and ffprobe verification. Configure the worker binaries before accepting a render.');
    }
    const outputPath = safeOutputPath(request.outputPath);
    await mkdir(dirname(outputPath), { recursive: true });
    const cacheKey = this.options.entryPoint;
    const serveUrl = this.options.bundleCache?.get(cacheKey) ?? await bundle({ entryPoint: this.options.entryPoint });
    this.options.bundleCache?.set(cacheKey, serveUrl);
    const composition = await selectComposition({
      serveUrl,
      id: plan.compositionId,
      inputProps: { manifest },
    });
    const remotionPath = join(dirname(outputPath), `.${request.jobId}.${request.attempt ?? 1}.remotion.mp4`);
    const normalizedPath = join(dirname(outputPath), `.${request.jobId}.${request.attempt ?? 1}.normalized.mp4`);
    try {
      await renderMedia({
        composition: { ...composition, durationInFrames: plan.durationInFrames, fps: plan.fps, width: plan.width, height: plan.height },
        serveUrl,
        codec: plan.outputCodec ?? 'h264',
        outputLocation: remotionPath,
        inputProps: { manifest },
        concurrency: Math.max(1, Math.min(this.options.maxConcurrency ?? Math.max(1, Math.floor(os.cpus().length / 2)), 8)),
      });
      if (this.options.ffmpeg) {
        await normalizeWithFFmpeg(this.options.ffmpeg, remotionPath, normalizedPath, { output: manifest.output, requireAudio: Boolean(manifest.output.audio) || plan.audioTracks.length > 0, timeoutMs: this.options.commandTimeoutMs, maxOutputBytes: this.options.maxOutputBytes });
        await rm(outputPath, { force: true });
        await (await import('node:fs/promises')).rename(normalizedPath, outputPath);
      } else {
        await rm(outputPath, { force: true });
        await (await import('node:fs/promises')).rename(remotionPath, outputPath);
      }
      let verification: RenderArtifactVerification | undefined;
      if (this.options.ffprobe) {
        const validation = await probeAndValidateOutput(this.options.ffprobe, outputPath, manifest.output, {
          requireAudio: Boolean(manifest.output.audio) || plan.audioTracks.length > 0,
          expectedCaptionTrackCount: plan.captionTracks.length,
          captionMode: plan.captionTracks.length > 0 ? 'burned-in' : 'none',
          timeoutMs: this.options.commandTimeoutMs,
        });
        if (!validation.ok || !validation.value) throw new Error(`Rendered output failed ffprobe validation: ${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
        const outputStats = await stat(outputPath);
        verification = {
          checkedBy: 'ffprobe',
          checkedAt: new Date().toISOString(),
          fileSizeBytes: outputStats.size,
          width: validation.value.width ?? 0,
          height: validation.value.height ?? 0,
          fps: validation.value.fps ?? 0,
          durationSeconds: validation.value.durationSeconds ?? 0,
          videoCodec: validation.value.videoCodec ?? '',
          audioCodec: validation.value.audioCodec,
          hasAudio: validation.value.hasAudio,
          orderedItemIds: plan.items.map((item) => item.id),
          captionTrackCount: plan.captionTracks.length,
          captionMode: plan.captionTracks.length > 0 ? 'burned-in' : 'none',
        };
      }
      return { outputPath, durationInFrames: plan.durationInFrames, verification };
    } finally {
      await rm(remotionPath, { force: true });
      await rm(normalizedPath, { force: true });
    }
  }
}
