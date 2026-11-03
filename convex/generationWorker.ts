import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { buildVideoGenerationRequest, generateVideo, pollVideo, downloadVideo } from '../src/lib/adapters/openrouter-adapter';
import { discoverOpenRouterVideoModels } from '../src/lib/ai/model-discovery';
import { videoCatalogFingerprint, isSourceVideoEdit, certifyAvatarEndpointCatalog } from '../src/lib/ai/video-routing';
import { runPreparation } from './preparationWorker';
import { GENERATION_MAX_MEDIA_BYTES, object, validateMediaProbe, workerEnabled } from './generationWorkerContracts';
import { sanitizeSubmissionDiagnostic } from '../src/lib/ai/submission-diagnostic';

type InternalMutation = FunctionReference<'mutation', 'internal', any, any>;
type InternalQuery = FunctionReference<'query', 'internal', any, any>;
const jobs = (internal as unknown as { generationJobs: Record<string, InternalMutation> }).generationJobs;
const inputRef = (internal as unknown as { generationJobs: { getWorkerInput: InternalQuery } }).generationJobs.getWorkerInput;

/** One bounded scheduler step; polling and ingestion never depend on a browser. */
export const run = internalAction({
  args: { jobId: v.id('generationJobs') },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!workerEnabled()) return null;
    const claim = await ctx.runMutation(jobs.claim, args);
    if (!claim.claimed) return null;
    const lease = { jobId: args.jobId, leaseId: claim.leaseId };
    let submissionAttempted = false;
    try {
      const input = await ctx.runQuery(inputRef, lease);
      const job = input.job;
      const request = object(input.request);
      const constraints = { ...request, ...object(request.constraints) };
      const options = { maxRetries: 0, fallbackModels: [], idempotencyKey: job.idempotencyKey, allowDiscoveredModel: true, timeoutMs: 60_000, maxResponseBytes: GENERATION_MAX_MEDIA_BYTES };
      if (job.operation === 'PREPARATION') {
        await runPreparation(ctx, input, lease, async livePreparationQuote => {
          const fenced = await ctx.runMutation(jobs.fenceSubmission, { ...lease, livePreparationQuote });
          if (!fenced.allowed) throw Object.assign(new Error('Submission already fenced.'), { code: 'SUBMISSION_FENCED' });
          submissionAttempted = true;
        });
        return null;
      }
      let providerJobId = job.providerJobId as string | undefined;
      if (!providerJobId) {
        if (!process.env.OPENROUTER_API_KEY?.trim()) throw Object.assign(new Error('MISSING_API_KEY'), { code: 'MISSING_API_KEY' });
        const references = input.references as Array<{ assetId: string; url: string; kind: 'image' | 'video' | 'audio' }>;
        const frameIds = [request.firstFrameAssetId, request.lastFrameAssetId];
        const frameImages: Array<{ url: string; frameType: 'first_frame' | 'last_frame' }> = [];
        for (const [index, id] of frameIds.entries()) {
          if (!id) continue;
          const frame = references.find((asset) => asset.assetId === id && asset.kind === 'image');
          if (!frame) throw new Error('A required frame is missing from this project.');
          frameImages.push({ url: frame.url, frameType: index === 0 ? 'first_frame' : 'last_frame' });
        }
        const videoRequest = {
          model: job.model,
          prompt: String(request.prompt),
          ...(request.operation === 'LIP_SYNC' ? { aspectRatio: String(request.ratio || '16:9'), resolution: typeof constraints.resolution === 'string' ? constraints.resolution : undefined } : request.operation === 'UPSCALE' || isSourceVideoEdit(request.operation) ? {} : { duration: Number(request.duration), aspectRatio: String(request.ratio || '16:9'), resolution: typeof constraints.resolution === 'string' ? constraints.resolution : undefined }),
          ...(request.operation === 'LIP_SYNC' ? {} : { generateAudio: constraints.requiresAudio === true }),
          ...(request.operation === 'LIP_SYNC' || request.operation === 'UPSCALE' || isSourceVideoEdit(request.operation) ? {} : { frameImages }),
          inputReferences: references.filter((asset) => !frameIds.includes(asset.assetId)).map((asset) => ({ url: asset.url, kind: asset.kind })),
          ...(typeof request.upscaleFactor === 'number' ? { upscaleFactor: request.upscaleFactor } : {}),
          ...(typeof request.creativity === 'number' ? { creativity: request.creativity } : {}),
          ...(typeof request.previousJobId === 'string' ? { previousJobId: request.previousJobId } : {}),
        };
        let liveCatalog: { liveCatalogFingerprint: string; liveCatalogCheckedAt: number; liveEndpointFingerprint?: string } | undefined;
        if (request.operation === 'LIP_SYNC' || request.operation === 'UPSCALE' || isSourceVideoEdit(request.operation) || request.operation === 'EXTEND') {
          const current = (await discoverOpenRouterVideoModels({ force: true, staleIfError: false, fetch: (url, init) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) }) })).find(model => model.id === job.model);
          if (!current) throw Object.assign(new Error('The upscale model is no longer available.'), { code: 'ROUTE_CHANGED' });
          liveCatalog = { liveCatalogFingerprint: videoCatalogFingerprint({ provider: 'openrouter', modelId: current.id, ...current, supportedParameters: current.allowedPassthroughParameters }), liveCatalogCheckedAt: Date.now() };
        }
        if (request.operation === 'LIP_SYNC') {
          const response = await fetch(`https://openrouter.ai/api/v1/models/${job.model}/endpoints`, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
          if (!response.ok || !liveCatalog) throw new Error('Avatar endpoint certification unavailable.');
          liveCatalog.liveEndpointFingerprint = certifyAvatarEndpointCatalog(await response.json());
          liveCatalog.liveCatalogCheckedAt = Date.now();
        }
        buildVideoGenerationRequest(videoRequest, { allowDiscoveredModel: true });
        const submitted = await generateVideo(videoRequest, { ...options, beforeMediaSubmit: async () => {
          const fenced = await ctx.runMutation(jobs.fenceSubmission, { ...lease, ...liveCatalog });
          if (!fenced.allowed) throw Object.assign(new Error('This submission is already fenced.'), { code: 'SUBMISSION_FENCED' });
          submissionAttempted = true;
        } });
        providerJobId = submitted.id;
        await ctx.runMutation(jobs.submit, { ...lease, providerJobId, providerRequestId: submitted.requestId, actualModel: submitted.modelUsed });
      }
      let assetId = input.outputAssetId as string | undefined;
      let outputUrl = input.outputUrl as string | undefined;
      if (!assetId || !outputUrl) {
        if (Date.now() - Number(job.startedAt || job.createdAt) > 30 * 60 * 1000) throw Object.assign(new Error('Provider polling needs review.'), { code: 'PROVIDER_POLL_TIMEOUT' });
        const current = await pollVideo(providerJobId!, options);
        const status = String(current.status || '').toLowerCase();
        if (['failed', 'error', 'canceled', 'cancelled', 'expired'].includes(status)) {
          await ctx.runMutation(jobs.fail, { ...lease, errorCode: 'PROVIDER_GENERATION_FAILED', retryable: false });
          return null;
        }
        const done = ['completed', 'succeeded', 'success'].includes(status);
        await ctx.runMutation(jobs.poll, { ...lease, done, providerRequestId: current.requestId, providerCostUsd: current.costUsd, usage: current.usage });
        if (!done) return null;
        const media = await downloadVideo(providerJobId!, options);
        if (!media.body.byteLength || media.body.byteLength > GENERATION_MAX_MEDIA_BYTES || !media.contentType.toLowerCase().startsWith('video/')) throw Object.assign(new Error('MEDIA_VALIDATION_FAILED'), { code: 'MEDIA_VALIDATION_FAILED' });
        const storageId = await ctx.storage.store(new Blob([media.body], { type: media.contentType }));
        const output = await ctx.runMutation(jobs.recordOutput, { ...lease, storageId, contentType: media.contentType, byteSize: media.body.byteLength });
        assetId = output.assetId;
        outputUrl = await ctx.storage.getUrl(storageId) || undefined;
      }
      if (!assetId || !outputUrl) throw new Error('Canonical stored output is missing.');
      const rendererUrl = process.env.RENDER_WORKER_URL?.trim();
      const secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim();
      if (!rendererUrl || !secret) throw Object.assign(new Error('Media validation service is unavailable.'), { code: 'MEDIA_PROBE_UNAVAILABLE' });
      const probeResponse = await fetch(`${rendererUrl.replace(/\/$/, '')}/media/probe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret },
        body: JSON.stringify({ url: outputUrl }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!probeResponse.ok) throw Object.assign(new Error('Media validation service failed.'), { code: 'MEDIA_PROBE_UNAVAILABLE' });
      let technicalProbe;
      try { technicalProbe = validateMediaProbe(await probeResponse.json(), request); }
      catch { throw Object.assign(new Error('MEDIA_VALIDATION_FAILED'), { code: 'MEDIA_VALIDATION_FAILED' }); }
      await ctx.runMutation(jobs.succeed, { ...lease, assetId, technicalProbe });
    } catch (error) {
      const details = error as { code?: string; status?: number; retryable?: boolean; details?: unknown };
      const code = details.code || 'GENERATION_WORKER_ERROR';
      const rejected = !submissionAttempted || (typeof details.status === 'number' && details.status >= 400 && details.status < 500 && details.status !== 408);
      const submissionDiagnostic = sanitizeSubmissionDiagnostic(object(details.details).submissionDiagnostic);
      await ctx.runMutation(jobs.fail, { ...lease, errorCode: code, retryable: code !== 'MEDIA_VALIDATION_FAILED', ambiguous: submissionAttempted && !rejected, rejected, ...(submissionDiagnostic ? { submissionDiagnostic } : {}) }).catch(() => {
        // A stale action cannot mutate a newer lease. The scheduled expiry
        // recovers accepted jobs or holds an ambiguous submission for review.
      });
    }
    return null;
  },
});
