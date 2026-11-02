/** Pure worker policy shared by Convex mutations and executable contract tests. */
export const GENERATION_TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELED']);
export const GENERATION_MAX_ATTEMPTS = 3;
export const GENERATION_LEASE_MS = 5 * 60 * 1000;
export const GENERATION_POLL_MS = 10_000;
export const GENERATION_MAX_MEDIA_BYTES = 64 * 1024 * 1024;

/** Catalog prices can exclude small prompt/token charges. Hold a margin before
 * submission; settlement still records the exact provider receipt. */
export function videoBudgetReservationUsd(estimate: number): number {
  if (!Number.isFinite(estimate) || estimate <= 0) throw new Error('A positive provider estimate is required.');
  return Math.ceil((estimate * 1.05 + 0.01) * 1_000_000) / 1_000_000;
}

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function workerEnabled() {
  return process.env.FINALFRAME_GENERATION_WORKER_ENABLED === 'true';
}

/** A submission fence without an accepted ID is deliberately not replayable. */
export function recoveryStage(job: { providerJobId?: string; submissionStartedAt?: number; executionStage?: string }): 'POLL' | 'SUBMIT' | 'RECONCILIATION_REQUIRED' {
  if (job.providerJobId) return 'POLL';
  return job.submissionStartedAt ? 'RECONCILIATION_REQUIRED' : 'SUBMIT';
}

export function canClaim(job: { status: string; executionStage?: string; leaseExpiresAt?: number; nextAttemptAt?: number; nextPollAt?: number }, timestamp: number) {
  if (GENERATION_TERMINAL.has(job.status) || job.executionStage === 'RECONCILIATION_REQUIRED') return false;
  if (job.nextAttemptAt && job.nextAttemptAt > timestamp) return false;
  if (job.nextPollAt && job.nextPollAt > timestamp) return false;
  return !job.leaseExpiresAt || job.leaseExpiresAt <= timestamp;
}

export function safeGenerationError(code: string, preparation = false): string {
  if (preparation) {
    if (code === 'RECONCILIATION_REQUIRED') return 'This preparation needs an administrator check. It will not be purchased again automatically.';
    if (code === 'MISSING_API_KEY' || code === 'WORKER_DISABLED') return 'Media preparation is not configured yet.';
    return 'This preparation could not finish. Your project and existing media are safe.';
  }
  if (code === 'MISSING_API_KEY' || code === 'WORKER_DISABLED') return 'Video generation is not configured yet.';
  if (code === 'PROVIDER_RATE_LIMIT') return 'The video provider is busy. FinalFrame will check again shortly.';
  if (code === 'PROVIDER_PAYMENT_REQUIRED') return 'Video generation is temporarily unavailable.';
  if (code === 'RECONCILIATION_REQUIRED') return 'This submission needs an administrator check before it can continue. It will not be submitted again automatically.';
  if (code === 'MEDIA_VALIDATION_FAILED') return 'The generated video did not pass its technical checks. Your other takes are unchanged.';
  return 'This take could not finish. Your project and approved takes are safe.';
}

export function validateMediaProbe(value: unknown, request: Record<string, unknown>) {
  const probe = object(value);
  const duration = Number(probe.durationSeconds);
  const width = Number(probe.width);
  const height = Number(probe.height);
  const expectedDuration = Number(request.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || typeof probe.videoCodec !== 'string' || !probe.videoCodec) throw new Error('MEDIA_VALIDATION_FAILED');
  if (Number.isFinite(expectedDuration) && Math.abs(duration - expectedDuration) > Math.max(1, expectedDuration * 0.2)) throw new Error('MEDIA_VALIDATION_FAILED');
  const [x, y] = String(request.ratio || '16:9').split(':').map(Number);
  if (!x || !y || Math.abs(width / height - x / y) > 0.08) throw new Error('MEDIA_VALIDATION_FAILED');
  const constraints = { ...request, ...object(request.constraints) };
  if (request.operation === 'LIP_SYNC') {
    const source = object(request.lipSyncSource); const quote = object(request.lipSyncQuote);
    if (quote.version !== 'AVATAR_SUPPLIED_AUDIO_SOURCE_SECONDS_V1' || !Number.isFinite(Number(source.durationSeconds)) || Math.abs(duration - Number(source.durationSeconds)) > .1 || probe.hasAudio !== true) throw new Error('MEDIA_VALIDATION_FAILED');
  }
  const resolution = typeof constraints.resolution === 'string' ? constraints.resolution.toLowerCase() : '';
  const dimensions = /^(\d+)x(\d+)$/.exec(resolution);
  const expectedShortEdge = dimensions ? Math.min(Number(dimensions[1]), Number(dimensions[2])) : ({ '4k': 2160, '2k': 1440 } as Record<string, number>)[resolution] || (/^\d+p$/.test(resolution) ? Number.parseInt(resolution, 10) : 0);
  if (expectedShortEdge && Math.abs(Math.min(width, height) - expectedShortEdge) > Math.max(8, expectedShortEdge * 0.05)) throw new Error('MEDIA_VALIDATION_FAILED');
  if (request.operation === 'UPSCALE') {
    const source = object(request.upscaleSource);
    const quote = object(request.upscaleQuote);
    const sourceWidth = Number(source.width); const sourceHeight = Number(source.height); const factor = Number(request.upscaleFactor);
    const maximumPixels = Number(quote.maximumOutputPixels);
    if (!Number.isFinite(factor) || factor < 1.5 || factor > 3 || !Number.isFinite(maximumPixels) || maximumPixels !== 13_750_000 || width * height > maximumPixels || !sourceWidth || !sourceHeight) throw new Error('MEDIA_VALIDATION_FAILED');
    const expectedFactor = Math.min(factor, Math.sqrt(maximumPixels / (sourceWidth * sourceHeight)));
    // This technical tolerance accommodates encoded dimension grids; it is
    // not a provider promise of exact pixel rounding. Cost uses the hard cap.
    const expectedWidth = sourceWidth * expectedFactor; const expectedHeight = sourceHeight * expectedFactor;
    if (Math.abs(width - expectedWidth) > Math.max(16, expectedWidth * .03) || Math.abs(height - expectedHeight) > Math.max(16, expectedHeight * .03) || width <= sourceWidth || height <= sourceHeight || Math.abs(duration - Number(source.durationSeconds)) > Math.max(.25, Number(source.durationSeconds) * .02)) throw new Error('MEDIA_VALIDATION_FAILED');
  }
  if (object(request.editQuote).version === 'FLUX_SOURCE_VIDEO_EDIT_V1') {
    const source = object(request.editSource);
    const sourceWidth = Number(source.width); const sourceHeight = Number(source.height); const sourceDuration = Number(source.durationSeconds);
    // Source aspect ratio/duration are preserved. 720p is an output ceiling,
    // not an exact dimension promise for already smaller source media.
    if (!sourceWidth || !sourceHeight || !Number.isFinite(sourceDuration) || Math.min(width, height) > 736 || width > sourceWidth + 16 || height > sourceHeight + 16 || Math.abs(width / height - sourceWidth / sourceHeight) > .03 || Math.abs(duration - sourceDuration) > Math.max(.25, sourceDuration * .02) || (source.hasAudio === true && probe.hasAudio !== true)) throw new Error('MEDIA_VALIDATION_FAILED');
  }
  if ((constraints.requiresAudio === true || constraints.requiresSourceAudioPreservation === true) && probe.hasAudio !== true) throw new Error('MEDIA_VALIDATION_FAILED');
  return { durationSeconds: duration, width, height, videoCodec: probe.videoCodec, hasAudio: probe.hasAudio === true, ...(typeof probe.audioCodec === 'string' ? { audioCodec: probe.audioCodec } : {}) };
}

export function publicJob(job: Record<string, unknown>) {
  const request = object(job.request);
  const keys = ['_id', 'shotId', 'shotVersionId', 'productionId', 'projectId', 'status', 'executionStage', 'progress', 'provider', 'model', 'modelVersion', 'estimatedCost', 'estimatedProviderCostUsd', 'providerCostUsd', 'attemptCount', 'createdAt', 'updatedAt', 'completedAt', 'correlationId', 'providerJobId', 'providerRequestId', 'latencyMs', 'operation', 'capability', 'modality'];
  return {
    _id: job._id,
    shotId: job.shotId,
    ...Object.fromEntries(keys.filter((key) => job[key] !== undefined).map((key) => [key, job[key]])),
    ...(typeof job.estimatedProviderCostUsd === 'number' ? { estimatedProviderCostUsd: job.estimatedProviderCostUsd } : {}),
    ...(typeof job.providerCostUsd === 'number' ? { providerCostUsd: job.providerCostUsd } : {}),
    status: String(job.status || 'QUEUED'),
    progress: typeof job.progress === 'number' ? job.progress : 0,
    model: typeof job.model === 'string' ? job.model : '',
    errorCode: typeof job.errorCode === 'string' ? job.errorCode : undefined,
    errorMessage: typeof job.errorCode === 'string' ? safeGenerationError(job.errorCode, job.operation === 'PREPARATION') : undefined,
    assetId: typeof object(job.response).assetId === 'string' ? String(object(job.response).assetId) : undefined,
    transcriptText: job.operation === 'PREPARATION' && request.preparationKind === 'TRANSCRIPT' && typeof object(job.response).text === 'string' ? String(object(job.response).text) : undefined,
    request: { operation: request.operation, preparationKind: request.preparationKind, videoType: request.videoType, task: request.task, qualityTier: request.qualityTier, routeReason: request.routeReason, path: request.path },
  };
}

export function hasStoredMusicOutput(job:{operation?:string;request?:unknown;response?:unknown;model?:string;submissionStartedAt?:number;providerRequestId?:string}){const output=object(object(job.response).audioOutput);return job.operation==='PREPARATION'&&object(job.request).preparationKind==='MUSIC'&&Boolean(job.submissionStartedAt)&&output.streamCompleted===true&&typeof output.storageId==='string'&&typeof output.checksum==='string'&&Number.isSafeInteger(output.byteSize)&&Number(output.byteSize)>0&&Number(output.byteSize)<=3*1024*1024&&output.contentType==='audio/mpeg'&&output.model===job.model&&typeof output.providerRequestId==='string'&&output.providerRequestId===job.providerRequestId;}
