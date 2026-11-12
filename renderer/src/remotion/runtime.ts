import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import os from 'node:os';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, openBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import { withRenderDeadline } from './render-deadline.js';
import { normalizeWithFFmpeg, probeAndValidateOutput, type FFmpegAdapter, type FFprobeAdapter } from '../media/ffmpeg.js';
import { assertLockedManifest, assertValidManifest } from '../manifest.js';
import { assertManifestMediaSources } from '../media/source-policy.js';
import type { WorkerMediaPolicy } from '../media/source-policy.js';
import type { AssemblyPlan } from '../assembly/plan.js';
import type { RenderRequest, RenderRuntime } from '../renderer.js';
import type { RenderArtifactVerification } from '../types.js';
import { outputFormatForManifest } from '../output-format.js';

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
  private readonly bundleCache: Map<string, string>;
  private pendingBundle?: Promise<string>;
  constructor(private readonly options: RemotionRuntimeOptions) { this.bundleCache = options.bundleCache ?? new Map(); }

  private async bundledEntryPoint(): Promise<string> {
    const cached = this.bundleCache.get(this.options.entryPoint);
    if (cached) return cached;
    if (this.pendingBundle) return this.pendingBundle;
    this.pendingBundle = bundle({ entryPoint: this.options.entryPoint }).then(serveUrl => {
      this.bundleCache.set(this.options.entryPoint, serveUrl);
      return serveUrl;
    });
    try { return await this.pendingBundle; } finally { this.pendingBundle = undefined; }
  }

  async render(plan: AssemblyPlan, request: RenderRequest): Promise<{ outputPath: string; durationInFrames: number; verification?: RenderArtifactVerification }> {
    const production = (request.mode ?? 'production') === 'production';
    const manifest = production ? assertLockedManifest(request.manifest) : assertValidManifest(request.manifest);
    const outputFormat = outputFormatForManifest(manifest);
    assertManifestMediaSources(manifest, { mode: production ? 'production' : 'fixture', ...this.options.mediaPolicy });
    if (production && (this.options.requireMediaTools ?? true) && (!this.options.ffmpeg || !this.options.ffprobe)) {
      throw new Error('Renderer unavailable: production rendering requires both FFmpeg normalization and ffprobe verification. Configure the worker binaries before accepting a render.');
    }
    const outputPath = safeOutputPath(request.outputPath);
    await mkdir(dirname(outputPath), { recursive: true });
    // Remotion's compressed AAC intermediate is ADTS, which cannot preserve
    // encoder skip-sample metadata. Copying it into MP4 shifts content before
    // normalization. Keep the mix as PCM in a supported container until the
    // final encoder; this also preserves optional/native audio without adding
    // a synthetic audio track to silent compositions.
    const losslessIntermediate = Boolean(this.options.ffmpeg);
    const intermediateExtension = losslessIntermediate ? (plan.outputCodec === 'prores' ? 'mov' : 'mkv') : outputFormat.extension;
    const normalizedExtension = outputFormat.extension;
    const remotionPath = join(dirname(outputPath), `.${request.jobId}.${request.attempt ?? 1}.remotion.${intermediateExtension}`);
    const normalizedPath = join(dirname(outputPath), `.${request.jobId}.${request.attempt ?? 1}.normalized.${normalizedExtension}`);
    try {
      await withRenderDeadline(this.options.commandTimeoutMs ?? 900_000, async scope => {
        const serveUrl = await this.bundledEntryPoint();
        scope.check();
        const browser = await openBrowser('chrome', { logLevel: 'error' });
        scope.cleanup(() => browser.close({ silent: true }));
        scope.check();
        const { cancelSignal, cancel } = makeCancelSignal();
        scope.cleanup(cancel);
        const composition = await selectComposition({
          serveUrl, id: plan.compositionId, inputProps: { manifest },
          puppeteerInstance: browser, timeoutInMilliseconds: 30_000,
        });
        scope.check();
        await renderMedia({
        composition: { ...composition, durationInFrames: plan.durationInFrames, fps: plan.fps, width: plan.width, height: plan.height },
        serveUrl,
        puppeteerInstance: browser,
        cancelSignal,
        timeoutInMilliseconds: 30_000,
        codec: plan.outputCodec ?? 'h264',
        outputLocation: remotionPath,
        inputProps: { manifest },
        concurrency: Math.max(1, Math.min(this.options.maxConcurrency ?? Math.max(1, Math.floor(os.cpus().length / 2)), 8)),
        // Bound native frame extraction on the shared 2 GiB worker. Remotion's
        // default cache otherwise follows host memory, not this app's budget.
        offthreadVideoCacheSizeInBytes: 64 * 1024 * 1024,
        offthreadVideoThreads: 1,
        ...(losslessIntermediate ? { preferLossless: true } : {}),
        // Remotion may collect still-image assets while deciding whether an
        // audio mix exists. Known-silent visual plans need no synthetic mix;
        // video plans must keep their potentially undeclared native audio.
        ...(plan.audioTracks.length === 0 && !plan.items.some(item => item.kind === 'video') ? { muted: true } : {}),
        });
        scope.check();
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
