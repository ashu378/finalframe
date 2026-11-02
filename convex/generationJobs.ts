import { internal } from './_generated/api';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { SchedulableFunctionReference, FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { requireProjectAccess, requireProjectRole } from './authorization';
import { ensureResourceState, getEffectiveResourceState } from './resourceStates';
import { reserveGenerationCreditsInTransaction, settleGenerationCreditsInTransaction, estimateGenerationCredits } from './financial';
import { reserveProviderBudget, settleProviderBudget } from './providerBudget';
import { resolveUpscaleSourceCertificate, validateReviewedVideoJob } from './videoRouting';
import { resolveGenerationContinuity } from './generationContinuity';
import { resolveVoiceSynthesisInput } from './voices';
import { preparationModel, type PreparationKind } from '../src/lib/ai/preparation';
import { validateVideoOperationRequirements, videoTaskForOperation, type ShotOperationControls } from '../src/lib/production/workspace-controls';
import { canClaim, GENERATION_LEASE_MS, GENERATION_POLL_MS, GENERATION_TERMINAL, object, publicJob, recoveryStage, videoBudgetReservationUsd, workerEnabled } from './generationWorkerContracts';

type ReadCtx = QueryCtx | MutationCtx;
type Job = Doc<'generationJobs'>;
const jobArgs = { jobId: v.id('generationJobs') };
const leaseArgs = { ...jobArgs, leaseId: v.string() };
function ref(module: string, name: string) {
  return (internal as unknown as Record<string, Record<string, SchedulableFunctionReference>>)[module][name];
}
async function schedule(ctx: MutationCtx, jobId: Id<'generationJobs'>, delayMs = 0) {
  if (workerEnabled()) await ctx.scheduler.runAfter(Math.max(0, delayMs), ref('generationWorker', 'run'), { jobId });
}
async function load(ctx: ReadCtx, jobId: Id<'generationJobs'>) {
  const job = await ctx.db.get(jobId);
  if (!job) throw new Error('Generation job not found.');
  return job;
}
async function productionAccess(ctx: ReadCtx, productionId: Id<'productions'>, write = false) {
  const production = await ctx.db.get(productionId);
  if (!production?.projectId) throw new Error('This production must belong to a project.');
  const access = write ? await requireProjectRole(ctx, production.projectId, ['OWNER', 'EDITOR']) : await requireProjectAccess(ctx, production.projectId);
  if (production.studioExternalId !== access.project.studioExternalId) throw new Error('Production is not owned by this project.');
  if (write && (access.project.archivedAt || access.project.status === 'ARCHIVED')) throw new Error('Restore this project before generating.');
  return { production, access };
}
async function authorizedJob(ctx: ReadCtx, jobId: Id<'generationJobs'>, write = false) {
  const job = await load(ctx, jobId);
  const result = await productionAccess(ctx, job.productionId, write);
  if (job.projectId && job.projectId !== result.production.projectId) throw new Error('Generation job does not belong to this project.');
  return { job, ...result };
}
function assertLease(job: Job, leaseId: string) {
  if (job.leaseId !== leaseId || !job.leaseExpiresAt || job.leaseExpiresAt <= Date.now()) throw new Error('Worker lease is no longer valid.');
}
async function currentAttempt(ctx: ReadCtx, job: Job) {
  return await ctx.db.query('attempts').withIndex('by_job_attempt', (q) => q.eq('generationJobId', job._id).eq('attemptNumber', job.attemptCount)).unique();
}
async function settle(ctx: MutationCtx, job: Job, accepted: boolean, cost?: number) {
  await settleGenerationCreditsInTransaction(ctx, { jobId: job._id, outcome: accepted ? 'COMMIT' : 'RELEASE' });
  if (job.providerBudgetReservationId) await settleProviderBudget(ctx, { reservationId: job.providerBudgetReservationId, accepted, actualCostUsd: cost });
}
async function requireUnlockedGraph(ctx: ReadCtx, projectId: Id<'projects'>, shot: Doc<'shots'>, scene: Doc<'scenes'>) {
  for (const [resourceType, resourceId] of [['sequence', scene.sequenceId], ['scene', scene._id], ['shot', shot._id]]) {
    const state = await ctx.db.query('resourceStates').withIndex('by_project_resource', (q) => q.eq('projectId', projectId).eq('resourceType', resourceType).eq('resourceId', resourceId)).unique();
    if (state?.state === 'LOCKED') throw new Error(`Unlock the ${resourceType} before making a new take.`);
  }
}
/** Read by provider identity, then verify every canonical relationship. Reused
 * at creation and the submission fence so withdrawn approval cannot purchase
 * a continuation after it was queued. */
async function requireContinuationSource(ctx: ReadCtx, args: { projectId: Id<'projects'>; productionId: Id<'productions'>; model: string; previousJobId: string }) {
  if (!/^gen-vid-\d+-[0-9A-Za-z]{20}$/.test(args.previousJobId)) throw new Error('Choose an approved completed clip from this production to extend.');
  const previous = await ctx.db.query('generationJobs').withIndex('by_provider_job', q => q.eq('provider', 'openrouter').eq('providerJobId', args.previousJobId)).unique();
  if (!previous || previous.projectId !== args.projectId || previous.productionId !== args.productionId || previous.provider !== 'openrouter' || previous.model !== args.model || previous.status !== 'COMPLETED' || previous.operation !== 'SHOT_GENERATION' || previous.modality !== 'VIDEO' || !previous.shotVersionId) throw new Error('Continuation must use an approved compatible source job in this production.');
  const take = await ctx.db.get(previous.shotVersionId);
  const assetId = object(previous.response).assetId;
  if (!take || take.projectId !== args.projectId || take.productionId !== args.productionId || take.shotId !== previous.shotId || take.status !== 'COMPLETED' || take.model !== previous.model || take.provider !== previous.provider || !take.assetId || take.assetId !== assetId) throw new Error('The completed continuation take is unavailable.');
  const asset = await ctx.db.get(take.assetId);
  if (!asset || asset.projectId !== args.projectId || asset.productionId !== args.productionId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !asset.mimeType?.startsWith('video/')) throw new Error('The continuation source media is unavailable.');
  const approval = await getEffectiveResourceState(ctx, args.projectId, 'shotVersion', take._id, args.productionId);
  if (!['APPROVED', 'LOCKED'].includes(approval.currentState)) throw new Error('Approve the completed source take before extending it.');
  return previous;
}

function key(value: string) {
  const result = value.trim();
  if (result.length < 8 || result.length > 200) throw new Error('Idempotency key must be between 8 and 200 characters.');
  return result;
}
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stable(row[key])}`).join(',')}}`;
}

/** Creation, both reservations and the scheduled handoff share one transaction. */
export const create = mutation({
  args: { productionId: v.id('productions'), shotId: v.id('shots'), provider: v.string(), model: v.string(), request: v.any(), estimatedCost: v.number(), estimatedProviderCostUsd: v.optional(v.number()), idempotencyKey: v.string(), modality: v.optional(v.string()), capability: v.optional(v.string()), modelVersion: v.optional(v.string()), correlationId: v.optional(v.string()), reservationId: v.optional(v.id('creditReservations')), canonicalReservationId: v.optional(v.id('reservations')) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { production, access } = await productionAccess(ctx, args.productionId, true);
    if (access.project.moderationStatus === 'RESTRICTED') throw new Error('This project is restricted from new generation.');
    const shot = await ctx.db.get(args.shotId);
    const scene = shot ? await ctx.db.get(shot.sceneId) : null;
    if (!shot || !scene || shot.productionId !== production._id || scene.productionId !== production._id) throw new Error('Shot does not belong to this production.');
    if (!production.currentVersionId || shot.productionVersionId !== production.currentVersionId) throw new Error('Generate from the current production version.');
    const version = await ctx.db.get(production.currentVersionId);
    if (!version || version.productionId !== production._id || version.status !== 'APPROVED') throw new Error('Approve the canonical production plan before generating.');
    const shotState = await getEffectiveResourceState(ctx, access.project._id, 'shot', shot._id, production._id);
    if (shotState.currentState === 'LOCKED') throw new Error('Unlock the shot before making a new take.');
    await requireUnlockedGraph(ctx, access.project._id, shot, scene);
    const idempotencyKey = key(args.idempotencyKey);
    const requested = object(args.request);
    const metadata = object(shot.metadata);
    const continuity = await resolveGenerationContinuity(ctx, { projectId: access.project._id, productionId: production._id, snapshot: version.planningContextSnapshot, explicitResourceVersionIds: metadata.resourceVersionIds, referenceAssetIds: shot.requiredAssetIds || [] });
    const qualityTier = requested.qualityTier === 'ECONOMY' || requested.qualityTier === 'PREMIUM' ? requested.qualityTier : 'STANDARD';
    const request = { ...requested, prompt: shot.prompt, duration: shot.durationSeconds, qualityTier, firstFrameAssetId: metadata.firstFrameAssetId, lastFrameAssetId: metadata.lastFrameAssetId, referenceAssetIds: continuity.referenceAssetIds };
    const requestHash = stable({ productionId: production._id, versionId: version._id, shotId: shot._id, model: args.model, provider: args.provider, request, shotMetadata: metadata });
    const existing = await ctx.db.query('generationJobs').withIndex('by_idempotency', (q) => q.eq('idempotencyKey', idempotencyKey)).unique();
    if (existing) {
      if (existing.productionId !== production._id || existing.requestHash !== requestHash) throw new Error('Idempotency key is already used for another request.');
      return publicJob(existing as unknown as Record<string, unknown>);
    }
    if (!workerEnabled()) throw new Error('Video generation is not configured yet.');
    if (args.provider !== 'openrouter') throw new Error('This provider is not enabled.');
    // Derive reference requirements from canonical project assets, not browser flags.
    const sourceAssets = [];
    for (const rawId of continuity.referenceAssetIds) {
      const assetId = ctx.db.normalizeId('assets', rawId);
      const asset = assetId ? await ctx.db.get(assetId) : null;
      if (!asset || asset.projectId !== access.project._id || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId) throw new Error('Import every reference into this project before generating.');
      sourceAssets.push(asset);
    }
    const firstFrame = typeof metadata.firstFrameAssetId === 'string' ? metadata.firstFrameAssetId : undefined;
    const lastFrame = typeof metadata.lastFrameAssetId === 'string' ? metadata.lastFrameAssetId : undefined;
    const inputFrameIds = new Set([firstFrame, lastFrame].filter(Boolean));
    for (const frameId of inputFrameIds) if (!sourceAssets.some((asset) => asset._id === frameId && asset.mimeType?.startsWith('image/'))) throw new Error('Required frames must be stored images in this project.');
    const operation = (typeof metadata.operation === 'string' ? metadata.operation : typeof metadata.videoTask === 'string' ? metadata.videoTask : 'GENERATE') as ShotOperationControls['operation'];
    const normalizedRequest: Record<string, unknown> = {
      ...requested, ...object(requested.constraints), prompt: continuity.promptContext ? `${shot.prompt}\nApproved project continuity: ${JSON.stringify(continuity.promptContext)}` : shot.prompt, duration: shot.durationSeconds,
      planningContextSnapshot: continuity.planningContextSnapshot, selectedResourceVersionIds: continuity.selectedResourceVersionIds, voiceIds: continuity.voiceIds,
      durationSeconds: shot.durationSeconds, qualityTier,
      ratio: String(requested.ratio || '16:9'), aspectRatio: String(requested.ratio || '16:9'),
      operation, task: videoTaskForOperation(operation),
      previousJobId: operation === 'EXTEND' && typeof metadata.previousJobId === 'string' ? metadata.previousJobId : undefined,
      previousModelId: undefined,
      audioPolicy: typeof metadata.audioPolicy === 'string' ? metadata.audioPolicy : 'SILENT',
      requiresSourceAudioPreservation: metadata.audioPolicy === 'KEEP_SOURCE' || metadata.requiresSourceAudioPreservation === true,
      requiresAudio: metadata.audioPolicy === 'GENERATE' || metadata.generateAudio === true,
      requiresMask: metadata.requiresMask === true,
      upscaleFactor: operation === 'UPSCALE' && typeof metadata.upscaleFactor === 'number' ? metadata.upscaleFactor : undefined,
      creativity: operation === 'UPSCALE' && typeof metadata.creativity === 'number' ? metadata.creativity : undefined,
      firstFrameAssetId: firstFrame, lastFrameAssetId: lastFrame,
      referenceAssetIds: continuity.referenceAssetIds,
      hasImageReferences: sourceAssets.some((asset) => asset.mimeType?.startsWith('image/') && !inputFrameIds.has(asset._id)),
      imageReferenceCount: sourceAssets.filter((asset) => asset.mimeType?.startsWith('image/')).length,
      hasVideoReference: sourceAssets.some((asset) => asset.mimeType?.startsWith('video/')),
      hasAudioReference: sourceAssets.some((asset) => asset.mimeType?.startsWith('audio/')),
      requiresFirstFrame: Boolean(firstFrame) || metadata.requiresFirstFrame === true,
      requiresLastFrame: Boolean(lastFrame) || metadata.requiresLastFrame === true,
      upscaleSource: undefined, upscaleQuote: undefined, constraints: undefined,
    };
    if (operation === 'EXTEND') {
      const previous = await requireContinuationSource(ctx, { projectId: access.project._id, productionId: production._id, model: args.model, previousJobId: String(normalizedRequest.previousJobId || '') });
      normalizedRequest.previousModelId = previous.model;
    }
    if (operation === 'UPSCALE') {
      if (typeof metadata.resolution === 'string' && metadata.resolution || typeof normalizedRequest.resolution === 'string' && normalizedRequest.resolution) throw new Error('Upscale output dimensions come from the source and factor; remove the resolution constraint.');
      const source = await resolveUpscaleSourceCertificate(ctx, { projectId: access.project._id, referenceAssetIds: continuity.referenceAssetIds });
      normalizedRequest.upscaleSource = source;
      normalizedRequest.duration = source.durationSeconds;
      normalizedRequest.durationSeconds = source.durationSeconds;
      normalizedRequest.ratio = `${source.width}:${source.height}`;
      normalizedRequest.aspectRatio = normalizedRequest.ratio;
      normalizedRequest.resolution = undefined;
    }
    validateVideoOperationRequirements({ ...normalizedRequest, operation, audioPolicy: normalizedRequest.audioPolicy as ShotOperationControls['audioPolicy'], hasVideoReference: normalizedRequest.hasVideoReference === true, hasImageReferences: normalizedRequest.hasImageReferences === true, hasAudioReference: normalizedRequest.hasAudioReference === true, firstFrameAssetId: firstFrame, previousJobId: normalizedRequest.previousJobId as string | undefined, previousModelId: normalizedRequest.previousModelId as string | undefined, upscaleFactor: normalizedRequest.upscaleFactor as number | undefined, upscaleMode: normalizedRequest.creativity === 0 ? 'PRECISE' : normalizedRequest.creativity === 1 ? 'CREATIVE' : undefined });
    const validated = await validateReviewedVideoJob(ctx, { studioExternalId: production.studioExternalId, modelId: args.model, request: normalizedRequest, estimatedCostUsd: args.estimatedProviderCostUsd });
    if (operation === 'UPSCALE') {
      if (!validated.selection.upscaleQuote) throw new Error('Upscale pricing certification is unavailable.');
      normalizedRequest.upscaleQuote = validated.selection.upscaleQuote;
    }
    normalizedRequest.routeReason = validated.selection.routeReason;
    normalizedRequest.path = validated.selection.path;
    normalizedRequest.policyVersion = validated.selection.policyVersion;
    normalizedRequest.resolution = validated.selection.resolution ?? normalizedRequest.resolution;
    const estimatedProviderCostUsd = validated.estimatedCostUsd;
    if (!Number.isFinite(estimatedProviderCostUsd) || estimatedProviderCostUsd <= 0) throw new Error('A verified provider cost estimate is required.');
    const estimatedCost = estimateGenerationCredits({ durationSeconds: operation === 'UPSCALE' ? Number(normalizedRequest.durationSeconds) : shot.durationSeconds, qualityTier });
    const latestTake = await ctx.db.query('shotVersions').withIndex('by_shot_version', (q) => q.eq('shotId', shot._id)).order('desc').first();
    const timestamp = Date.now();
    const shotVersionId = await ctx.db.insert('shotVersions', { studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: access.project._id, productionId: production._id, productionVersionId: version._id, shotId: shot._id, versionNumber: (latestTake?.versionNumber ?? 0) + 1, status: 'QUEUED', promptSnapshot: shot.prompt, contextSnapshot: { request: normalizedRequest, productionVersionId: version._id }, provider: args.provider, model: args.model, createdAt: timestamp });
    await ensureResourceState(ctx, { projectId: access.project._id, productionId: production._id, resourceType: 'shotVersion', resourceId: shotVersionId });
    const jobId = await ctx.db.insert('generationJobs', { studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: access.project._id, productionId: production._id, productionVersionId: version._id, shotId: shot._id, shotVersionId, createdByUserId: access.user._id, operation: 'SHOT_GENERATION', capability: args.capability, modality: 'VIDEO', provider: args.provider, model: args.model, modelVersion: args.modelVersion, request: normalizedRequest, status: 'QUEUED', executionStage: 'QUEUED', progress: 0, estimatedCost, estimatedProviderCostUsd, idempotencyKey, requestHash, correlationId: args.correlationId, attemptCount: 0, createdAt: timestamp, updatedAt: timestamp });
    const reservation = await reserveGenerationCreditsInTransaction(ctx, { studioExternalId: production.studioExternalId, amount: estimatedCost, idempotencyKey: `generation:${jobId}`, generationJobId: jobId });
    const providerBudgetReservationId = await reserveProviderBudget(ctx, { jobId, studioExternalId: production.studioExternalId, estimatedCostUsd: videoBudgetReservationUsd(estimatedProviderCostUsd), idempotencyKey: `generation:${jobId}` });
    await ctx.db.patch(jobId, { canonicalReservationId: reservation.reservationId, providerBudgetReservationId });
    await schedule(ctx, jobId);
    return publicJob((await load(ctx, jobId)) as unknown as Record<string, unknown>);
  },
});

export const get = query({ args: jobArgs, returns: v.any(), handler: async (ctx, args) => {
  const { job } = await authorizedJob(ctx, args.jobId);
  return { job: publicJob(job as unknown as Record<string, unknown>) };
} });
export const list = query({ args: { productionId: v.id('productions'), status: v.optional(v.string()) }, returns: v.any(), handler: async (ctx, args) => {
  await productionAccess(ctx, args.productionId);
  const jobs = await ctx.db.query('generationJobs').withIndex('by_production', (q) => q.eq('productionId', args.productionId)).order('desc').take(200);
  return jobs.filter((job) => !args.status || job.status === args.status).map((job) => publicJob(job as unknown as Record<string, unknown>));
} });
export const enqueue = mutation({ args: jobArgs, returns: v.any(), handler: async (ctx, args) => {
  const { job } = await authorizedJob(ctx, args.jobId, true);
  if (!GENERATION_TERMINAL.has(job.status)) await schedule(ctx, job._id);
  return { jobId: job._id, status: job.status, executionStage: job.executionStage, progress: job.progress };
} });
export const retry = mutation({ args: { ...jobArgs, retryAfterMs: v.optional(v.number()) }, returns: v.any(), handler: async (ctx, args) => {
  const { job } = await authorizedJob(ctx, args.jobId, true);
  if (job.leaseExpiresAt && job.leaseExpiresAt > Date.now()) throw new Error('This take is already being processed.');
  if (job.executionStage === 'RECONCILIATION_REQUIRED') throw new Error('An administrator must reconcile this submission first.');
  // Accepted outputs may resume polling/ingestion, never another paid POST.
  if (!job.providerJobId || job.status === 'COMPLETED' || job.status === 'CANCELED') throw new Error('Create a new take for a fresh generation.');
  await ctx.db.patch(job._id, { status: 'PENDING', executionStage: 'POLL', leaseId: undefined, leaseExpiresAt: undefined, nextAttemptAt: undefined, errorCode: undefined, errorMessage: undefined, updatedAt: Date.now() });
  await schedule(ctx, job._id, Math.min(Math.max(args.retryAfterMs ?? 0, 0), 60_000));
  return { jobId: job._id, status: 'PENDING' };
} });
export const cancel = mutation({ args: { ...jobArgs, reason: v.optional(v.string()), leaseId: v.optional(v.string()) }, returns: v.any(), handler: async (ctx, args) => {
  const { job } = await authorizedJob(ctx, args.jobId, true);
  if (GENERATION_TERMINAL.has(job.status)) return publicJob(job as unknown as Record<string, unknown>);
  if (job.submissionStartedAt || job.providerJobId) throw new Error('This take has already been submitted. It will finish without another charge.');
  await ctx.db.patch(job._id, { status: 'CANCELED', executionStage: 'CANCELED', leaseId: undefined, leaseExpiresAt: undefined, completedAt: Date.now(), updatedAt: Date.now() });
  job.shotVersionId && await ctx.db.patch(job.shotVersionId, { status: 'CANCELED' });
  await settle(ctx, job, false);
  return { jobId: job._id, status: 'CANCELED' };
} });

/** No browser-visible function can claim leases or submit completion evidence. */
export async function claimGenerationJob(ctx: MutationCtx, args: { jobId: Id<'generationJobs'> }, fixtureKey?: string) {
  const job = await load(ctx, args.jobId);
  const timestamp = Date.now();
  const fixtureMode = fixtureKey !== undefined;
  if (fixtureMode) {
    if (workerEnabled() || process.env.FINALFRAME_DEV_FIXTURES !== 'true' || process.env.FINALFRAME_DEV_FIXTURE_ENV !== 'development' || !process.env.FINALFRAME_DEV_FIXTURE_KEY || fixtureKey !== process.env.FINALFRAME_DEV_FIXTURE_KEY || job.provider !== 'fixture' || object(job.request).fixtureMarker !== 'finalframe-worker-online-verification-v1') throw new Error('Online worker verification is not enabled for this isolated fixture.');
  } else if (!workerEnabled() || job.provider !== 'openrouter') return { claimed: false };
  if (!canClaim(job, timestamp)) return { claimed: false };
  if (!job.providerBudgetReservationId || !job.canonicalReservationId || !job.projectId) return { claimed: false };
  const stage = recoveryStage(job);
  if (stage === 'RECONCILIATION_REQUIRED') {
    await ctx.db.patch(job._id, { executionStage: stage, errorCode: stage, leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
    await settle(ctx, job, true);
    return { claimed: false };
  }
  const attemptNumber = job.providerJobId ? Math.max(job.attemptCount, 1) : job.attemptCount + 1;
  const leaseId = `${job._id}:${timestamp}:${Math.random().toString(36).slice(2)}`;
  await ctx.db.patch(job._id, { status: stage === 'POLL' ? 'PENDING' : 'PROCESSING', executionStage: stage, attemptCount: attemptNumber, leaseId, leaseExpiresAt: timestamp + GENERATION_LEASE_MS, startedAt: job.startedAt ?? timestamp, nextPollAt: undefined, updatedAt: timestamp });
  if (!job.providerJobId) await ctx.db.insert('attempts', { studioExternalId: job.studioExternalId, studioId: job.studioId, generationJobId: job._id, attemptNumber, status: 'PROCESSING', provider: job.provider, model: job.model, requestHash: job.requestHash, startedAt: timestamp, createdAt: timestamp });
  await ctx.scheduler.runAfter(GENERATION_LEASE_MS + 1000, ref('generationJobs', 'expireLease'), { jobId: job._id, leaseId });
  return { claimed: true, jobId: job._id, leaseId };
}
export const claim = internalMutation({ args: jobArgs, returns: v.any(), handler: async (ctx, args) => claimGenerationJob(ctx, args) });
export const getWorkerInput = internalQuery({ args: leaseArgs, returns: v.any(), handler: async (ctx, args) => {
  const job = await load(ctx, args.jobId); assertLease(job, args.leaseId);
  const production = await ctx.db.get(job.productionId);
  const project = job.projectId ? await ctx.db.get(job.projectId) : null;
  if (!production || !project || production.projectId !== project._id) throw new Error('Generation ownership is invalid.');
  // Once accepted, retain and ingest the paid result even if a later draft becomes current.
  if (!job.providerJobId && (project.deletedAt || project.archivedAt || project.moderationStatus === 'RESTRICTED' || (job.operation !== 'PREPARATION' && production.currentVersionId !== job.productionVersionId))) throw new Error('This project or production version is no longer available for generation.');
  const request = object(job.request);
  const references: Array<{ assetId: string; url: string; kind: 'image' | 'video' | 'audio'; mimeType?: string }> = [];
  for (const rawId of Array.isArray(request.referenceAssetIds) ? request.referenceAssetIds : []) {
    const id = ctx.db.normalizeId('assets', String(rawId));
    const asset = id ? await ctx.db.get(id) : null;
    if (!asset || asset.projectId !== project._id || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId) throw new Error('Generation reference is not owned by this project.');
    const url = await ctx.storage.getUrl(asset.storageId);
    const kind = asset.mimeType?.split('/')[0];
    if (!url || (kind !== 'image' && kind !== 'video' && kind !== 'audio')) throw new Error('Unsupported generation reference.');
    references.push({ assetId: asset._id, url, kind, mimeType: asset.mimeType });
  }
  const outputAssetId = object(job.response).assetId;
  const output = typeof outputAssetId === 'string' ? await ctx.db.get(outputAssetId as Id<'assets'>) : null;
  const outputUrl = output?.projectId === project._id && output.storageId ? await ctx.storage.getUrl(output.storageId) : null;
  return { job, request, references, outputAssetId: output?._id, outputUrl };
} });
export const fenceSubmission = internalMutation({ args: { ...leaseArgs, liveCatalogFingerprint: v.optional(v.string()), liveCatalogCheckedAt: v.optional(v.number()) }, returns: v.any(), handler: async (ctx, args) => {
  const job = await load(ctx, args.jobId); assertLease(job, args.leaseId);
  if (job.providerJobId || job.submissionStartedAt) return { allowed: false };
  const project = job.projectId ? await ctx.db.get(job.projectId) : null;
  if (!project || project.deletedAt || project.archivedAt || project.moderationStatus === 'RESTRICTED') throw new Error('Project is unavailable or restricted for generation.');
  const production = await ctx.db.get(job.productionId);
  if (!production || (job.operation !== 'PREPARATION' && production.currentVersionId !== job.productionVersionId)) throw new Error('Production version has changed.');
  const actor = job.createdByUserId ? await ctx.db.get(job.createdByUserId) : null;
  const membership = actor ? await ctx.db.query('projectMembers').withIndex('by_project_user', (q) => q.eq('projectId', project._id).eq('userId', actor._id)).unique() : null;
  const actorOwnsProject = actor && (project.ownerUserId === actor._id || project.createdByUserId === actor._id);
  if (!actor || actor.status === 'disabled' || (membership ? membership.status !== 'ACTIVE' || !['OWNER', 'EDITOR'].includes(membership.role) : !actorOwnsProject)) throw new Error('Generation permission has changed.');
  const shot = job.shotId ? await ctx.db.get(job.shotId) : null;
  const scene = shot ? await ctx.db.get(shot.sceneId) : null;
  if (job.operation !== 'PREPARATION') {
    if (!shot || !scene) throw new Error('Generation graph is unavailable.');
    await requireUnlockedGraph(ctx, project._id, shot, scene);
  }
  const request = object(job.request);
  if (job.operation !== 'PREPARATION') await resolveGenerationContinuity(ctx, { projectId: project._id, productionId: job.productionId, snapshot: request.planningContextSnapshot, explicitResourceVersionIds: request.selectedResourceVersionIds, referenceAssetIds: Array.isArray(request.referenceAssetIds) ? request.referenceAssetIds.map(String) : [] });
  if (request.targetVoiceId) await resolveVoiceSynthesisInput(ctx, { projectId: project._id, voiceId: request.targetVoiceId as Id<'voices'>, use: 'SYNTHESIZE' });
  const reserved = job.providerBudgetReservationId ? await ctx.db.get(job.providerBudgetReservationId) : null;
  const budget = reserved ? await ctx.db.get(reserved.budgetId) : null;
  if (!reserved || reserved.jobId !== job._id || reserved.status !== 'RESERVED' || !budget || budget.status !== 'ACTIVE') throw new Error('Paid testing is paused.');
  if (!budget.allowedStudioExternalIds.includes(job.studioExternalId)) throw new Error('This studio is not enabled for paid testing.');
  let dispatchValidation: Record<string, unknown>;
  if (job.provider === 'fixture') {
    if (workerEnabled() || process.env.FINALFRAME_DEV_FIXTURES !== 'true' || process.env.FINALFRAME_DEV_FIXTURE_ENV !== 'development' || request.fixtureMarker !== 'finalframe-worker-online-verification-v1' || object(project.metadata).fixtureMarker !== 'finalframe-worker-online-verification-v1' || !job.studioExternalId.startsWith('creator-worker-verification-')) throw new Error('Fixture dispatch verification is not enabled.');
    dispatchValidation = { fixtureOnly: true };
  } else if (job.operation === 'PREPARATION') {
    if (process.env.FINALFRAME_PREPARATION_ENABLED !== 'true') throw new Error('Preparation is not enabled.');
    const selected = preparationModel(request.preparationKind as PreparationKind, request.clone === true);
    if (selected.id !== job.model) throw new Error('Preparation model configuration changed.');
    dispatchValidation = { model: job.model, estimatedCostUsd: job.estimatedProviderCostUsd };
  } else {
    try {
      if (request.operation === 'EXTEND') await requireContinuationSource(ctx, { projectId: project._id, productionId: job.productionId, model: job.model, previousJobId: String(request.previousJobId || '') });
      if (request.operation === 'UPSCALE') {
        const source = await resolveUpscaleSourceCertificate(ctx, { projectId: project._id, referenceAssetIds: Array.isArray(request.referenceAssetIds) ? request.referenceAssetIds.map(String) : [] });
        const frozen = object(request.upscaleQuote);
        if (stable(source) !== stable(request.upscaleSource) || args.liveCatalogFingerprint !== frozen.catalogFingerprint || typeof args.liveCatalogCheckedAt !== 'number' || Date.now() - args.liveCatalogCheckedAt > 30_000 || args.liveCatalogCheckedAt > Date.now() + 1000) throw new Error('Upscale input or current catalog certification changed.');
      }
      const current = await validateReviewedVideoJob(ctx, { studioExternalId: job.studioExternalId, modelId: job.model, request });
      if (request.operation === 'UPSCALE' && stable(current.selection.upscaleQuote) !== stable(request.upscaleQuote)) throw new Error('The frozen upscale pricing certificate changed.');
      const estimatedMicros = Math.ceil(current.estimatedCostUsd * 1_000_000);
      if (!Number.isFinite(estimatedMicros) || estimatedMicros <= 0 || estimatedMicros > reserved.estimatedMicros || (typeof request.path === 'string' && current.selection.path !== request.path) || (typeof request.resolution === 'string' && current.selection.resolution !== request.resolution)) throw new Error('The frozen route or provider quote has changed.');
      dispatchValidation = { estimatedCostUsd: current.estimatedCostUsd, policyVersion: current.selection.policyVersion ?? null, resolution: current.selection.resolution ?? null, model: current.selection.modelId };
    } catch {
      throw Object.assign(new Error('The reviewed route or provider quote has changed. Create a new estimate.'), { code: 'ROUTE_CHANGED' });
    }
  }
  await ctx.db.patch(job._id, { submissionStartedAt: Date.now(), executionStage: 'SUBMITTING', progress: 5, response: { ...object(job.response), dispatchValidation: { ...dispatchValidation, checkedAt: Date.now() } }, updatedAt: Date.now() });
  return { allowed: true };
} });
export const submit = internalMutation({ args: { ...leaseArgs, providerJobId: v.string(), providerRequestId: v.optional(v.string()), actualModel: v.string() }, returns: v.any(), handler: async (ctx, args) => {
  const job = await load(ctx, args.jobId); assertLease(job, args.leaseId);
  if (job.providerJobId && job.providerJobId !== args.providerJobId) throw new Error('Provider job is already bound.');
  if (args.actualModel !== job.model) throw new Error('Provider returned a different model.');
  const bound = await ctx.db.query('generationJobs').withIndex('by_provider_job', (q) => q.eq('provider', job.provider).eq('providerJobId', args.providerJobId)).unique();
  if (bound && bound._id !== job._id) throw new Error('This provider result is already bound to another generation job.');
  await ctx.db.patch(job._id, { status: 'SUBMITTED', executionStage: 'POLL', providerJobId: args.providerJobId, providerRequestId: args.providerRequestId, progress: 10, updatedAt: Date.now() });
  const attempt = await currentAttempt(ctx, job);
  if (attempt) await ctx.db.patch(attempt._id, { status: 'SUBMITTED', providerJobId: args.providerJobId, providerRequestId: args.providerRequestId });
  return null;
} });
export const poll = internalMutation({ args: { ...leaseArgs, done: v.boolean(), providerRequestId: v.optional(v.string()), providerCostUsd: v.optional(v.number()), usage: v.optional(v.any()) }, returns: v.null(), handler: async (ctx, args) => {
  const job = await load(ctx, args.jobId); assertLease(job, args.leaseId);
  if (!job.providerJobId) throw new Error('Provider job was not accepted.');
  await ctx.db.patch(job._id, { status: 'PENDING', executionStage: args.done ? 'INGEST' : 'POLL', progress: args.done ? 70 : 25, providerRequestId: args.providerRequestId ?? job.providerRequestId, providerCostUsd: args.providerCostUsd ?? job.providerCostUsd, response: { ...object(job.response), pollCount: Number(object(job.response).pollCount || 0) + 1, ...(args.usage ? { usage: args.usage } : {}) }, nextPollAt: args.done ? undefined : Date.now() + GENERATION_POLL_MS, ...(args.done ? {} : { leaseId: undefined, leaseExpiresAt: undefined }), updatedAt: Date.now() });
  if (!args.done) await schedule(ctx, job._id, GENERATION_POLL_MS);
  return null;
} });
export const recordOutput = internalMutation({ args: { ...leaseArgs, storageId: v.id('_storage'), contentType: v.string(), byteSize: v.number() }, returns: v.any(), handler: async (ctx, args) => {
  const job = await load(ctx, args.jobId); assertLease(job, args.leaseId);
  const existingId = object(job.response).assetId;
  if (typeof existingId === 'string') return { assetId: existingId };
  const storage = await ctx.db.system.get('_storage', args.storageId);
  if (!storage || !job.projectId || !job.providerJobId) throw new Error('Canonical generated media is missing.');
  const assetId = await ctx.db.insert('assets', { studioExternalId: job.studioExternalId, studioId: job.studioId, projectId: job.projectId, productionId: job.productionId, scope: 'PROJECT', source: 'AI_GENERATED', roles: ['GENERATED_VIDEO'], storageId: args.storageId, mimeType: args.contentType, byteSize: storage.size, checksum: storage.sha256, metadata: { technicalStatus: 'PENDING', generationJobId: job._id, shotVersionId: job.shotVersionId }, provenance: { provider: job.provider, model: job.model, providerTaskId: job.providerJobId, generationJobId: job._id }, createdAt: Date.now(), updatedAt: Date.now() });
  await ctx.db.patch(job._id, { executionStage: 'TECHNICAL_QC', progress: 85, response: { ...object(job.response), assetId }, updatedAt: Date.now() });
  return { assetId };
} });
export const succeed = internalMutation({ args: { ...leaseArgs, assetId: v.id('assets'), technicalProbe: v.any() }, returns: v.any(), handler: async (ctx, args) => {
  const job = await load(ctx, args.jobId);
  if (job.status === 'COMPLETED') return { jobId: job._id, assetId: object(job.response).assetId };
  assertLease(job, args.leaseId);
  const asset = await ctx.db.get(args.assetId);
  if (!asset?.storageId || asset.projectId !== job.projectId || asset.productionId !== job.productionId || object(job.response).assetId !== asset._id) throw new Error('Output asset is not owned by this production.');
  const shotVersionId = job.shotVersionId;
  if (!shotVersionId) throw new Error('A video take is required.');
  const takeState = await ctx.db.query('resourceStates').withIndex('by_project_resource', (q) => q.eq('projectId', job.projectId!).eq('resourceType', 'shotVersion').eq('resourceId', shotVersionId)).unique();
  if (takeState?.state === 'LOCKED' || takeState?.state === 'APPROVED') throw new Error('Approved takes cannot be overwritten.');
  const timestamp = Date.now();
  await ctx.db.patch(asset._id, { width: Number(object(args.technicalProbe).width), height: Number(object(args.technicalProbe).height), durationSeconds: Number(object(args.technicalProbe).durationSeconds), metadata: { ...object(asset.metadata), kind: 'VIDEO', durationSeconds: Number(object(args.technicalProbe).durationSeconds), technicalStatus: 'PASS', technicalProbe: args.technicalProbe, visualApproval: 'REQUIRES_HUMAN_REVIEW' }, updatedAt: timestamp });
  job.shotVersionId && await ctx.db.patch(job.shotVersionId, { status: 'COMPLETED', assetId: args.assetId, actualCost: job.estimatedCost });
  // Do not overwrite approved/locked shot state or select a take on the user's behalf.
  const attempt = await currentAttempt(ctx, job);
  if (attempt) await ctx.db.patch(attempt._id, { status: 'COMPLETED', completedAt: timestamp });
  await ctx.db.patch(job._id, { status: 'COMPLETED', executionStage: 'REVIEW_READY', progress: 100, response: { ...object(job.response), assetId: args.assetId, technicalProbe: args.technicalProbe, visualApproval: 'REQUIRES_HUMAN_REVIEW' }, actualCost: job.estimatedCost, latencyMs: timestamp - (job.startedAt ?? job.createdAt), leaseId: undefined, leaseExpiresAt: undefined, completedAt: timestamp, updatedAt: timestamp });
  await settle(ctx, job, true, job.providerCostUsd);
  return { jobId: job._id, assetId: args.assetId };
} });
export const fail = internalMutation({ args: { ...leaseArgs, errorCode: v.string(), retryable: v.optional(v.boolean()), ambiguous: v.optional(v.boolean()), rejected: v.optional(v.boolean()) }, returns: v.null(), handler: async (ctx, args) => {
  const job = await load(ctx, args.jobId);
  if (GENERATION_TERMINAL.has(job.status)) return null;
  assertLease(job, args.leaseId);
  const timestamp = Date.now();
  const accepted = Boolean(job.providerJobId || args.ambiguous || (job.submissionStartedAt && !args.rejected));
  if (!job.providerJobId && accepted) {
    await ctx.db.patch(job._id, { status: 'PROCESSING', executionStage: 'RECONCILIATION_REQUIRED', errorCode: 'RECONCILIATION_REQUIRED', leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
    await settle(ctx, job, true);
    return null;
  }
  const retryable = args.retryable === true && job.providerJobId && Date.now() - (job.startedAt ?? job.createdAt) < 30 * 60 * 1000;
  const attempt = await currentAttempt(ctx, job);
  if (attempt) await ctx.db.patch(attempt._id, { status: retryable ? 'RETRYING' : 'FAILED', errorCode: args.errorCode, retryable: Boolean(retryable), completedAt: timestamp });
  await ctx.db.patch(job._id, { status: retryable ? 'RETRYING' : 'FAILED', executionStage: retryable ? 'POLL' : 'FAILED', errorCode: args.errorCode, leaseId: undefined, leaseExpiresAt: undefined, nextAttemptAt: retryable ? timestamp + GENERATION_POLL_MS : undefined, updatedAt: timestamp, ...(retryable ? {} : { completedAt: timestamp }) });
  if (retryable) await schedule(ctx, job._id, GENERATION_POLL_MS);
  else { job.shotVersionId && await ctx.db.patch(job.shotVersionId, { status: 'FAILED' }); await settle(ctx, job, accepted, job.providerCostUsd); }
  return null;
} });
export const wake = internalMutation({ args: jobArgs, returns: v.null(), handler: async (ctx, args) => { await schedule(ctx, args.jobId); return null; } });
export const expireLease = internalMutation({ args: leaseArgs, returns: v.null(), handler: async (ctx, args) => {
  const job = await load(ctx, args.jobId);
  if (job.leaseId !== args.leaseId || !job.leaseExpiresAt || job.leaseExpiresAt > Date.now() || GENERATION_TERMINAL.has(job.status)) return null;
  if (recoveryStage(job) === 'RECONCILIATION_REQUIRED') {
    await ctx.db.patch(job._id, { executionStage: 'RECONCILIATION_REQUIRED', errorCode: 'RECONCILIATION_REQUIRED', leaseId: undefined, leaseExpiresAt: undefined, updatedAt: Date.now() });
    await settle(ctx, job, true);
  } else {
    await ctx.db.patch(job._id, { status: job.providerJobId ? 'PENDING' : 'QUEUED', executionStage: job.providerJobId ? 'POLL' : 'QUEUED', leaseId: undefined, leaseExpiresAt: undefined, updatedAt: Date.now() });
    await schedule(ctx, job._id);
  }
  return null;
} });
export const sweepExpiredLeases = internalMutation({ args: { studioExternalId: v.optional(v.string()) }, returns: v.any(), handler: async (ctx, args) => {
  let scheduled = 0;
  for (const status of ['PROCESSING', 'SUBMITTED', 'PENDING', 'QUEUED', 'RETRYING'] as const) {
    const jobs = await ctx.db.query('generationJobs').withIndex('by_status', (q) => q.eq('status', status)).order('asc').take(100);
    for (const job of jobs) {
      if (args.studioExternalId && job.studioExternalId !== args.studioExternalId) continue;
      if (job.leaseId && job.leaseExpiresAt && job.leaseExpiresAt <= Date.now()) await ctx.scheduler.runAfter(0, ref('generationJobs', 'expireLease'), { jobId: job._id, leaseId: job.leaseId });
      else if (!job.leaseId) await schedule(ctx, job._id);
      scheduled += 1;
    }
  }
  return { scheduled };
} });

/** Deployment administrators may attach a verified accepted ID after an
 * interrupted acknowledgement. This never purchases a replacement job. */
export const reconcileAcceptedSubmission = internalMutation({
  args: { ...jobArgs, providerJobId: v.string(), providerRequestId: v.optional(v.string()), reason: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const job = await load(ctx, args.jobId);
    if (job.executionStage !== 'RECONCILIATION_REQUIRED' || job.providerJobId) throw new Error('This submission does not require accepted-job reconciliation.');
    if (!/^gen-vid-\d+-[0-9A-Za-z]{20}$/.test(args.providerJobId) || args.reason.trim().length < 12 || args.reason.length > 2000) throw new Error('A verified provider job ID and reconciliation reason are required.');
    const existing = await ctx.db.query('generationJobs').withIndex('by_provider_job', (q) => q.eq('provider', job.provider).eq('providerJobId', args.providerJobId)).unique();
    if (existing) throw new Error('This provider result already belongs to a generation job.');
    await ctx.db.patch(job._id, { status: 'PENDING', executionStage: 'POLL', providerJobId: args.providerJobId, providerRequestId: args.providerRequestId, nextAttemptAt: undefined, nextPollAt: undefined, errorCode: undefined, errorMessage: undefined, updatedAt: Date.now() });
    await ctx.db.insert('audit', { studioExternalId: job.studioExternalId, studioId: job.studioId, actorExternalId: 'deployment-administrator', action: 'GENERATION_SUBMISSION_RECONCILED', entityType: 'generationJob', entityId: job._id, metadata: { providerJobId: args.providerJobId, reason: args.reason.trim(), operation: 'RESUME_ACCEPTED_ONLY' }, createdAt: Date.now() });
    await schedule(ctx, job._id);
    return { jobId: job._id, status: 'PENDING', providerJobId: args.providerJobId };
  },
});


const preparationKindValidator = v.union(v.literal('CHARACTER_REFERENCE'), v.literal('NARRATION'), v.literal('VOICE_PREVIEW'), v.literal('TRANSCRIPT'));
export const preparationContext = internalQuery({
  args: { productionId: v.id('productions'), voiceId: v.optional(v.id('voices')), sourceAssetId: v.optional(v.id('assets')) }, returns: v.any(),
  handler: async (ctx, args) => {
    const { production, access } = await productionAccess(ctx, args.productionId, true);
    const voice = args.voiceId ? await resolveVoiceSynthesisInput(ctx, { projectId: access.project._id, voiceId: args.voiceId, use: 'SYNTHESIZE' }) : null;
    const asset = args.sourceAssetId ? await ctx.db.get(args.sourceAssetId) : null;
    if (args.sourceAssetId && (!asset || asset.projectId !== access.project._id || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !asset.mimeType?.startsWith('audio/'))) throw new Error('Select a project-owned recording.');
    const stored = asset?.storageId ? await ctx.db.system.get('_storage', asset.storageId) : null;
    if (stored && (stored.size < 1 || stored.size > 15 * 1024 * 1024)) throw new Error('Recording must not exceed 15 MiB.');
    return { productionId: production._id, projectId: access.project._id, voice, source: asset?.storageId ? { assetId: asset._id, mimeType: asset.mimeType, url: await ctx.storage.getUrl(asset.storageId) } : null };
  },
});
export const createPreparation = internalMutation({
  args: { productionId: v.id('productions'), kind: preparationKindValidator, text: v.string(), targetVoiceId: v.optional(v.id('voices')), sourceAssetId: v.optional(v.id('assets')), durationSeconds: v.optional(v.number()), clone: v.boolean(), model: v.string(), capability: v.string(), estimatedProviderCostUsd: v.number(), quote: v.any(), idempotencyKey: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    const { production, access } = await productionAccess(ctx, args.productionId, true);
    if (access.project.moderationStatus === 'RESTRICTED') throw new Error('This project is restricted from new preparation.');
    if (!workerEnabled() || process.env.FINALFRAME_PREPARATION_ENABLED !== 'true') throw new Error('Preparation is not enabled.');
    if (args.text.length > 4000 || (args.kind !== 'TRANSCRIPT' && !args.text.trim())) throw new Error('Use between one and 4000 characters.');
    if ((args.kind === 'NARRATION' || args.kind === 'VOICE_PREVIEW') && !args.targetVoiceId) throw new Error('Select an approved project voice.');
    if (args.targetVoiceId) await resolveVoiceSynthesisInput(ctx, { projectId: access.project._id, voiceId: args.targetVoiceId, use: 'SYNTHESIZE' });
    const config = preparationModel(args.kind, args.clone);
    if (args.model !== config.id || args.capability !== config.capability || !Number.isFinite(args.estimatedProviderCostUsd) || args.estimatedProviderCostUsd <= 0 || args.estimatedProviderCostUsd > 2) throw new Error('A verified preparation quote is required.');
    if (args.kind === 'TRANSCRIPT') {
      const source = args.sourceAssetId ? await ctx.db.get(args.sourceAssetId) : null;
      if (!source || source.projectId !== access.project._id || source.scope !== 'PROJECT' || source.deletedAt || !source.storageId || !source.mimeType?.startsWith('audio/')) throw new Error('Recording is unavailable.');
    }
    const request = { preparationKind: args.kind, text: args.text.trim(), targetVoiceId: args.targetVoiceId, sourceAssetId: args.sourceAssetId, clone: args.clone, durationSeconds: args.durationSeconds, quote: args.quote, referenceAssetIds: args.sourceAssetId ? [args.sourceAssetId] : [] };
    const requestHash = stable({ productionId: production._id, model: args.model, kind: args.kind, text: args.text.trim(), targetVoiceId: args.targetVoiceId, sourceAssetId: args.sourceAssetId });
    const idempotencyKey = key(args.idempotencyKey);
    const existing = await ctx.db.query('generationJobs').withIndex('by_idempotency', q => q.eq('idempotencyKey', idempotencyKey)).unique();
    if (existing) { if (existing.requestHash !== requestHash || existing.projectId !== access.project._id) throw new Error('Idempotency key conflict.'); return publicJob(existing as unknown as Record<string, unknown>); }
    const timestamp = Date.now();
    const jobId = await ctx.db.insert('generationJobs', { studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: access.project._id, productionId: production._id, createdByUserId: access.user._id, operation: 'PREPARATION', capability: args.capability, modality: args.kind === 'CHARACTER_REFERENCE' ? 'IMAGE' : args.kind === 'TRANSCRIPT' ? 'TEXT' : 'AUDIO', provider: 'openrouter', model: args.model, request, requestHash, status: 'QUEUED', executionStage: 'QUEUED', progress: 0, estimatedCost: 1, estimatedProviderCostUsd: args.estimatedProviderCostUsd, idempotencyKey, attemptCount: 0, createdAt: timestamp, updatedAt: timestamp });
    const reservation = await reserveGenerationCreditsInTransaction(ctx, { studioExternalId: production.studioExternalId, amount: 1, idempotencyKey: `generation:${jobId}`, generationJobId: jobId });
    const providerBudgetReservationId = await reserveProviderBudget(ctx, { jobId, studioExternalId: production.studioExternalId, estimatedCostUsd: args.estimatedProviderCostUsd, idempotencyKey: `generation:${jobId}` });
    await ctx.db.patch(jobId, { canonicalReservationId: reservation.reservationId, providerBudgetReservationId });
    await schedule(ctx, jobId);
    return publicJob((await load(ctx, jobId)) as unknown as Record<string, unknown>);
  },
});
export const completePreparation = internalMutation({
  args: { ...leaseArgs, storageId: v.optional(v.id('_storage')), contentType: v.optional(v.string()), text: v.optional(v.string()), segments: v.optional(v.any()), providerRequestId: v.optional(v.string()), providerCostUsd: v.optional(v.number()), actualModel: v.string(), usage: v.optional(v.any()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await load(ctx, args.jobId);
    if (job.status === 'COMPLETED') return null;
    assertLease(job, args.leaseId);
    if (job.operation !== 'PREPARATION' || !job.submissionStartedAt || job.model !== args.actualModel || !job.projectId) throw new Error('Preparation completion is invalid.');
    const request = object(job.request);
    let assetId: Id<'assets'> | undefined;
    if (args.storageId) {
      const stored = await ctx.db.system.get('_storage', args.storageId);
      const expected = job.modality === 'IMAGE' ? 'image/' : 'audio/';
      if (!stored || !args.contentType?.startsWith(expected) || !stored.contentType?.startsWith(expected) || stored.size <= 0 || stored.size > 15 * 1024 * 1024) throw new Error('Preparation output is invalid.');
      assetId = await ctx.db.insert('assets', { studioExternalId: job.studioExternalId, studioId: job.studioId, projectId: job.projectId, productionId: job.productionId, scope: 'PROJECT', source: 'AI_GENERATED', roles: [job.modality === 'IMAGE' ? 'CHARACTER_REFERENCE' : 'NARRATION'], name: job.modality === 'AUDIO' ? `${request.preparationKind === 'VOICE_PREVIEW' ? 'Voice preview' : 'Narration'} · ${String(request.text || '').slice(0, 60)}` : undefined, storageId: args.storageId, mimeType: args.contentType, byteSize: stored.size, checksum: stored.sha256, metadata: { generationJobId: job._id, technicalStatus: 'REQUIRES_REVIEW', visualApproval: 'REQUIRES_HUMAN_REVIEW', targetVoiceId: request.targetVoiceId }, provenance: { provider: job.provider, model: job.model, generationJobId: job._id, providerRequestId: args.providerRequestId }, createdAt: Date.now() });
    } else if (request.preparationKind === 'TRANSCRIPT') {
      if (typeof args.text !== 'string' || args.text.length > 100_000 || typeof request.sourceAssetId !== 'string') throw new Error('Transcript output is invalid.');
      const source = await ctx.db.get(request.sourceAssetId as Id<'assets'>);
      if (!source || source.projectId !== job.projectId) throw new Error('Transcript source is unavailable.');
      let audio = await ctx.db.query('audio').withIndex('by_asset', q => q.eq('assetId', source._id)).first();
      if (!audio) { const id = await ctx.db.insert('audio', { studioExternalId: job.studioExternalId, studioId: job.studioId, projectId: job.projectId, productionId: job.productionId, assetId: source._id, kind: 'RECORDING', metadata: {}, createdAt: Date.now() }); audio = await ctx.db.get(id); }
      await ctx.db.insert('transcripts', { studioExternalId: job.studioExternalId, studioId: job.studioId, audioId: audio!._id, productionId: job.productionId, language: 'und', provider: job.provider, model: job.model, status: 'COMPLETED', segments: { text: args.text, segments: args.segments ?? [], generationJobId: job._id }, createdAt: Date.now() });
    } else throw new Error('Preparation output is missing.');
    const timestamp = Date.now();
    const attempt = await currentAttempt(ctx, job);
    if (attempt) await ctx.db.patch(attempt._id, { status: 'COMPLETED', providerRequestId: args.providerRequestId, completedAt: timestamp, latencyMs: timestamp - (job.startedAt ?? job.createdAt) });
    await ctx.db.patch(job._id, { status: 'COMPLETED', executionStage: 'REVIEW_READY', progress: 100, providerRequestId: args.providerRequestId, providerCostUsd: args.providerCostUsd, actualCost: job.estimatedCost, response: { assetId, text: args.text, usage: args.usage, reviewStatus: 'REQUIRES_HUMAN_REVIEW' }, latencyMs: timestamp - (job.startedAt ?? job.createdAt), leaseId: undefined, leaseExpiresAt: undefined, completedAt: timestamp, updatedAt: timestamp });
    await settle(ctx, job, true, args.providerCostUsd);
    if (job.modality === 'AUDIO' && args.providerCostUsd === undefined && /^gen-tts-\d+-[A-Za-z0-9]+$/.test(args.providerRequestId ?? '')) {
      const receipts = (internal as unknown as { providerReceipts: Record<string, FunctionReference<any, 'internal', any, any>> }).providerReceipts;
      await ctx.scheduler.runAfter(0, receipts.reconcile, { jobId: job._id });
    }
    return null;
  },
});
