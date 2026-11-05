import { internal } from './_generated/api';
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { SchedulableFunctionReference, FunctionReference } from 'convex/server';
import { v, type Infer } from 'convex/values';
import { recipeExecutionScope, resolveRecipeSlotGrants, assertRecipeAdmission, bindRecipeGenerationJob, assertRecipeGenerationFence } from './recipeAdmissions';
import { requireProjectAccess, requireProjectRole, resolveProjectAccessForActor } from './authorization';
import { ensureResourceState, getEffectiveResourceState } from './resourceStates';
import { reserveGenerationCreditsInTransaction, settleGenerationCreditsInTransaction, estimateGenerationCredits } from './financial';
import { reserveProviderBudget, settleProviderBudget } from './providerBudget';
import { resolveUpscaleSourceCertificate, resolveVideoEditSourceCertificate, validateReviewedVideoJob } from './videoRouting';
import { isSourceVideoEdit, videoCatalogFingerprint, normalizeVideoType } from '../src/lib/ai/video-routing';
import { discoverOpenRouterVideoModels } from '../src/lib/ai/model-discovery';
import { SHOT_ESTIMATE_VERSION, SHOT_ESTIMATE_TTL_MS, shotEstimateHash, stableShotEstimate, assertShotEstimateTime } from '../src/lib/generation/shot-estimate';
import { resolveGenerationContinuity } from './generationContinuity';
import { resolveVoiceSynthesisInput, resolveFrozenVoiceSynthesisInput, freezeVoiceVersion } from './voices';
import { preparationModel, assertReferenceVoiceQuote, type PreparationKind } from '../src/lib/ai/preparation';
import { TRANSCRIPT_SEGMENT_REQUEST, transcriptRequestOptions, normalizeTranscriptSegments } from '../src/lib/ai/transcription';
import { resolveAudioSourceCertificate, resolveTranscriptSourceCertificate, transcriptFormat, validReferenceVoiceSource } from './audioCertificates';
import {freshSfxQuote,assertSfxQuote,sameSfxQuote,assertSfxConsent,validateSfxPrompt,SFX_LIMITS,assertSfxOutputProbe,retryableSfxQc,safeSfxQcCode,sfxError} from '../src/lib/ai/sfx';
import {REVIEWED_OPERATION_CONTRACTS} from '../src/lib/ai/model-registry';
import { sanitizeSubmissionDiagnostic } from '../src/lib/ai/submission-diagnostic';
import {freshMusicQuote,sameMusicQuote,MUSIC_LIMITS,assertMusicOutputProbe,MUSIC_OUTPUT_POLICY,retryableMusicQc,safeMusicQcCode} from '../src/lib/ai/music';
import {normalizeSha256,sha256Equal} from '../renderer/src/media/sha256';
import { resolvePortraitSourceCertificate } from './imageCertificates';
import { studioRoleForUser, userExternalKey } from './studioMemberships';
import { validateVideoOperationRequirements, videoTaskForOperation, resolveShotReferencePrompt, type ShotOperationControls } from '../src/lib/production/workspace-controls';
import { canClaim, GENERATION_LEASE_MS, GENERATION_POLL_MS, GENERATION_TERMINAL, object, publicJob, recoveryStage, hasStoredSfxOutput, hasStoredMusicOutput, hasStoredImageOutput, boundedProviderUsage, videoBudgetReservationUsd, workerEnabled } from './generationWorkerContracts';
import {getOutputPreset,OUTPUT_PRESETS} from '../renderer/src/output-presets';

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
type RecipeExecution = { nodeId: Id<'recipeRunNodes'>; leaseId: string };
async function productionAccess(ctx: ReadCtx, productionId: Id<'productions'>, write = false, execution?: RecipeExecution) {
  const production = await ctx.db.get(productionId);
  if (!production?.projectId) throw new Error('This production must belong to a project.');
  const scope = execution ? await recipeExecutionScope(ctx, execution) : null;
  if (scope && scope.production._id !== productionId) throw new Error('RECIPE_PRODUCTION_MISMATCH');
  const access = scope?.access ?? (write ? await requireProjectRole(ctx, production.projectId, ['OWNER', 'EDITOR']) : await requireProjectAccess(ctx, production.projectId));
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
async function requireContinuationSource(ctx: ReadCtx, args: { projectId: Id<'projects'>; productionId: Id<'productions'>; model: string; previousJobId: string }, actorId?:Id<'users'>) {
  if (!/^gen-vid-\d+-[0-9A-Za-z]{20}$/.test(args.previousJobId)) throw new Error('Choose an approved completed clip from this production to extend.');
  const previous = await ctx.db.query('generationJobs').withIndex('by_provider_job', q => q.eq('provider', 'openrouter').eq('providerJobId', args.previousJobId)).unique();
  if (!previous || previous.projectId !== args.projectId || previous.productionId !== args.productionId || previous.provider !== 'openrouter' || previous.model !== args.model || previous.status !== 'COMPLETED' || previous.operation !== 'SHOT_GENERATION' || previous.modality !== 'VIDEO' || !previous.shotVersionId) throw new Error('Continuation must use an approved compatible source job in this production.');
  const take = await ctx.db.get(previous.shotVersionId);
  const assetId = object(previous.response).assetId;
  if (!take || take.projectId !== args.projectId || take.productionId !== args.productionId || take.shotId !== previous.shotId || take.status !== 'COMPLETED' || take.model !== previous.model || take.provider !== previous.provider || !take.assetId || take.assetId !== assetId) throw new Error('The completed continuation take is unavailable.');
  const asset = await ctx.db.get(take.assetId);
  if (!asset || asset.projectId !== args.projectId || asset.productionId !== args.productionId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !asset.mimeType?.startsWith('video/')) throw new Error('The continuation source media is unavailable.');
  // Only private callers pass the actor already validated against the saved
  // job/run. Public request fields never supply this authority.
  if(actorId)await resolveProjectAccessForActor(ctx,args.projectId,actorId,['OWNER','EDITOR']);
  const approval = await getEffectiveResourceState(ctx, args.projectId, 'shotVersion', take._id, args.productionId,actorId);
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
const generationCreateArgs = { productionId: v.id('productions'), shotId: v.id('shots'), provider: v.string(), model: v.string(), request: v.any(), estimatedCost: v.number(), estimatedProviderCostUsd: v.optional(v.number()), idempotencyKey: v.string(), modality: v.optional(v.string()), capability: v.optional(v.string()), modelVersion: v.optional(v.string()), correlationId: v.optional(v.string()), reservationId: v.optional(v.id('creditReservations')), canonicalReservationId: v.optional(v.id('reservations')), estimateConsent: v.optional(v.object({estimateId:v.id('estimates'),quoteHash:v.string()})) };
const generationCreateValidator = v.object(generationCreateArgs);
type GenerationCreateArgs = Infer<typeof generationCreateValidator>;
export const previewShotEstimate = mutation({
    args: generationCreateArgs,
    returns: v.object({
        estimateId: v.id('estimates'), quoteHash: v.string(), model: v.string(), operation: v.string(),
        baseProviderUsd: v.number(), providerHoldMicros: v.number(), totalCredits: v.number(), expiresAt: v.number(),
    }),
    handler: async (ctx, args) => {
        const intent = await resolveGenerationIntent(ctx, args);
        const quote = await resolveCanonicalShotQuote(ctx, args, intent);
        const createdAt = Date.now();
        const expiresAt = createdAt + SHOT_ESTIMATE_TTL_MS;
        const { estimateConsent: _consent, ...createArgs } = args;
        const quoteHash = await shotEstimateHash({ canonicalHash: quote.canonicalHash, createdAt, expiresAt });
        const estimateId = await ctx.db.insert('estimates', {
            studioExternalId: intent.production.studioExternalId,
            studioId: intent.production.studioId,
            projectId: intent.access.project._id,
            productionId: intent.production._id,
            version: SHOT_ESTIMATE_VERSION,
            totalCredits: quote.estimatedCost,
            lineItems: [{ operation: quote.operation, credits: quote.estimatedCost }],
            policySnapshot: {
                createArgs: JSON.parse(stableShotEstimate(createArgs)),
                actorUserId: intent.access.user._id,
                idempotencyKey: intent.idempotencyKey,
                canonicalHash: quote.canonicalHash,
                providerHoldMicros: quote.providerHoldMicros,
                quoteHash,
            },
            createdAt,
            expiresAt,
        });
        return {
            estimateId, quoteHash, model: args.model, operation: quote.operation,
            baseProviderUsd: quote.estimatedProviderCostUsd, providerHoldMicros: quote.providerHoldMicros,
            totalCredits: quote.estimatedCost, expiresAt,
        };
    },
});

export const createReviewedTake = mutation({
    args: { estimateId: v.id('estimates'), quoteHash: v.string() },
    returns: v.any(),
    handler: async (ctx, consent) => {
        const estimate = await ctx.db.get(consent.estimateId);
        const saved = object(estimate?.policySnapshot);
        if (!estimate?.productionId || estimate.version !== SHOT_ESTIMATE_VERSION || saved.quoteHash !== consent.quoteHash) {
            throw new Error('SHOT_ESTIMATE_CHANGED');
        }
        const { access } = await productionAccess(ctx, estimate.productionId, true);
        if (saved.actorUserId !== access.user._id || estimate.projectId !== access.project._id) {
            throw new Error('SHOT_ESTIMATE_CHANGED');
        }
        return createCanonicalGenerationJob(ctx, { ...saved.createArgs as GenerationCreateArgs, estimateConsent: consent });
    },
});

export const create = mutation({ args: generationCreateArgs, returns: v.any(), handler: (ctx,args) => createCanonicalGenerationJob(ctx,args) });
async function resolveGenerationIntent(ctx: ReadCtx, args: GenerationCreateArgs, execution?: RecipeExecution) {
    const { production, access } = await productionAccess(ctx, args.productionId, true, execution);
    if (access.project.moderationStatus === 'RESTRICTED') throw new Error('This project is restricted from new generation.');
    const shot = await ctx.db.get(args.shotId);
    const scene = shot ? await ctx.db.get(shot.sceneId) : null;
    if (!shot || !scene || shot.productionId !== production._id || scene.productionId !== production._id) throw new Error('Shot does not belong to this production.');
    if (!production.currentVersionId || shot.productionVersionId !== production.currentVersionId) throw new Error('Generate from the current production version.');
    const version = await ctx.db.get(production.currentVersionId);
    if (!version || version.productionId !== production._id || version.status !== 'APPROVED') throw new Error('Approve the canonical production plan before generating.');
    const shotState = await getEffectiveResourceState(ctx, access.project._id, 'shot', shot._id, production._id, execution?access.user._id:undefined);
    if (shotState.currentState === 'LOCKED') throw new Error('Unlock the shot before making a new take.');
    await requireUnlockedGraph(ctx, access.project._id, shot, scene);
    const idempotencyKey = key(args.idempotencyKey);
    const requested = object(args.request);
    if (!execution && (requested.recipeRunNodeId !== undefined || requested.recipeResolvedRequestHash !== undefined)) throw new Error('RECIPE_PRIVATE_AUTHORITY_REQUIRED');
    const recipeNode = execution ? (await recipeExecutionScope(ctx,execution)).node : null;
    const grants = recipeNode ? await resolveRecipeSlotGrants(ctx,recipeNode) : [];
    const recipeMarkers = recipeNode ? {recipeRunNodeId:recipeNode._id,recipeResolvedRequestHash:recipeNode.resolvedRequestHash} : {};
    const metadata = object(shot.metadata);
    const continuity = await resolveGenerationContinuity(ctx, { projectId: access.project._id, productionId: production._id, snapshot: version.planningContextSnapshot, explicitResourceVersionIds: metadata.resourceVersionIds, referenceAssetIds: [...(shot.requiredAssetIds || []),...grants.map(grant=>grant.preparedAssetId)],shotMetadata:metadata,durationSeconds:shot.durationSeconds });
    const qualityTier: 'ECONOMY' | 'STANDARD' | 'PREMIUM' = requested.qualityTier === 'ECONOMY' || requested.qualityTier === 'PREMIUM' ? requested.qualityTier : 'STANDARD';
    const request = { ...requested, ...recipeMarkers, prompt: shot.prompt, duration: shot.durationSeconds, qualityTier, firstFrameAssetId: metadata.firstFrameAssetId, lastFrameAssetId: metadata.lastFrameAssetId, referenceAssetIds: continuity.referenceAssetIds };
    const requestHash = stable({ productionId: production._id, versionId: version._id, shotId: shot._id, model: args.model, provider: args.provider, request, shotMetadata: metadata });
    return {production,access,shot,scene,version,requested,metadata,continuity,qualityTier,recipeMarkers,idempotencyKey,requestHash};
}
type GenerationIntent = Awaited<ReturnType<typeof resolveGenerationIntent>>;
async function resolveCanonicalShotQuote(ctx: ReadCtx, args: GenerationCreateArgs, intent: GenerationIntent, execution?: RecipeExecution) {
    const {production,access,shot,version,requested,metadata,continuity,qualityTier,recipeMarkers}=intent;
    if (!workerEnabled()) throw new Error('Video generation is not configured yet.');
    if (args.provider !== 'openrouter') throw new Error('This provider is not enabled.');
    const sourcePlan=version.sourcePlanId?await ctx.db.get(version.sourcePlanId):null;
    if(version.sourcePlanId&&(!sourcePlan||sourcePlan.productionId!==production._id))throw new Error('The approved production plan is unavailable.');
    const videoType=normalizeVideoType(object(sourcePlan?.input).videoType??production.projectType??access.project.projectType);
    // Derive reference requirements from canonical project assets, not browser flags.
    const sourceAssets = [];
    const mediaProofs = [];
    for (const rawId of continuity.referenceAssetIds) {
      const assetId = ctx.db.normalizeId('assets', rawId);
      const asset = assetId ? await ctx.db.get(assetId) : null;
      if (!asset || asset.projectId !== access.project._id || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId) throw new Error('Import every reference into this project before generating.');
      const storage = await ctx.db.system.get('_storage', asset.storageId);
      if (!storage) throw new Error('SHOT_ESTIMATE_SOURCE_UNAVAILABLE');
      mediaProofs.push({assetId:asset._id,storageId:asset.storageId,checksum:storage.sha256,byteSize:storage.size,mimeType:asset.mimeType});
      sourceAssets.push(asset);
    }
    const firstFrame = typeof metadata.firstFrameAssetId === 'string' ? metadata.firstFrameAssetId : undefined;
    const lastFrame = typeof metadata.lastFrameAssetId === 'string' ? metadata.lastFrameAssetId : undefined;
    const inputFrameIds = new Set([firstFrame, lastFrame].filter(Boolean));
    for (const frameId of inputFrameIds) if (!sourceAssets.some((asset) => asset._id === frameId && asset.mimeType?.startsWith('image/'))) throw new Error('Required frames must be stored images in this project.');
  const references = resolveShotReferencePrompt({ prompt: shot.prompt, referenceBindings: metadata.referenceBindings, editInstructions: metadata.editInstructions,
    referenceAssetIds: continuity.referenceAssetIds, assets: sourceAssets.map(asset=>({id:asset._id,mimeType:asset.mimeType??''})),
    firstFrameAssetId:firstFrame,lastFrameAssetId:lastFrame });
    const operation = (typeof metadata.operation === 'string' ? metadata.operation : typeof metadata.videoTask === 'string' ? metadata.videoTask : 'GENERATE') as ShotOperationControls['operation'];
  const ratio=typeof metadata.aspectRatio==='string'?metadata.aspectRatio:getOutputPreset(production.outputPreset).aspectRatio;
  if(!OUTPUT_PRESETS.some(preset=>preset.aspectRatio===ratio))throw new Error('OUTPUT_ASPECT_RATIO_UNSUPPORTED');
    const normalizedRequest: Record<string, unknown> = {
      ...requested, ...object(requested.constraints), ...recipeMarkers, referenceBindings: references.referenceBindings, editInstructions: references.editInstructions,
      prompt: continuity.promptContext ? `${references.prompt}\nApproved project continuity: ${JSON.stringify(continuity.promptContext)}` : references.prompt, duration: shot.durationSeconds,
      planningContextSnapshot: continuity.planningContextSnapshot, selectedResourceVersionIds: continuity.selectedResourceVersionIds, voiceIds: continuity.voiceIds,voiceVersionIds:continuity.voiceVersionIds,
      resourceBindings:continuity.resourceBindings,dialogueSegments:continuity.dialogueSegments,
      durationSeconds: shot.durationSeconds, qualityTier, videoType,
      ratio, aspectRatio:ratio,
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
      upscaleSource: undefined, upscaleQuote: undefined, editSource: undefined, editQuote: undefined, continuationQuote: undefined, lipSyncSource: undefined, lipSyncPortrait: undefined, lipSyncQuote: undefined, constraints: undefined,
    };
    if (operation === 'LIP_SYNC') {
      const recordings = sourceAssets.filter(asset => asset.mimeType?.startsWith('audio/'));
      const portraits = sourceAssets.filter(asset => asset.mimeType?.startsWith('image/'));
      if (sourceAssets.length !== 2 || recordings.length !== 1 || portraits.length !== 1) throw new Error('Choose exactly one approved portrait and one supplied recording.');
      const source = await resolveAudioSourceCertificate(ctx, { projectId: access.project._id, assetId: recordings[0]._id });
      const stored = await ctx.db.system.get('_storage', recordings[0].storageId!);
      if (!stored || !['audio/wav','audio/x-wav','audio/mpeg','audio/mp3'].includes(stored.contentType ?? '') || recordings[0].mimeType !== stored.contentType) throw new Error('Avatar lip sync requires canonical WAV or MP3 audio.');
      normalizedRequest.lipSyncSource = source;
      normalizedRequest.lipSyncPortrait = await resolvePortraitSourceCertificate(ctx, { projectId: access.project._id, assetId: portraits[0]._id });
      normalizedRequest.duration = source.durationSeconds; normalizedRequest.durationSeconds = source.durationSeconds;
    }
    if (operation === 'EXTEND') {
      const previous = await requireContinuationSource(ctx, { projectId: access.project._id, productionId: production._id, model: args.model, previousJobId: String(normalizedRequest.previousJobId || '') },execution?access.user._id:undefined);
      normalizedRequest.previousModelId = previous.model;
      const take = await ctx.db.get(previous.shotVersionId!);
      const asset = take?.assetId ? await ctx.db.get(take.assetId) : null;
      const storage = asset?.storageId ? await ctx.db.system.get('_storage',asset.storageId) : null;
      if (!asset || !storage) throw new Error('SHOT_ESTIMATE_SOURCE_UNAVAILABLE');
      mediaProofs.push({assetId:asset._id,storageId:asset.storageId,checksum:storage.sha256,byteSize:storage.size,mimeType:asset.mimeType});
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
    if (isSourceVideoEdit(operation)) {
      if (metadata.resolution || normalizedRequest.resolution) throw new Error('Video edit dimensions come from the source; remove the resolution constraint.');
      const source = await resolveVideoEditSourceCertificate(ctx, { projectId: access.project._id, referenceAssetIds: continuity.referenceAssetIds });
      normalizedRequest.editSource = source;
      normalizedRequest.duration = source.durationSeconds; normalizedRequest.durationSeconds = source.durationSeconds;
      normalizedRequest.ratio = `${source.width}:${source.height}`; normalizedRequest.aspectRatio = normalizedRequest.ratio;
      normalizedRequest.requiresSourceAudioPreservation = source.hasAudio;
      normalizedRequest.resolution = undefined;
    }
    validateVideoOperationRequirements({ ...normalizedRequest, operation, audioPolicy: normalizedRequest.audioPolicy as ShotOperationControls['audioPolicy'], hasVideoReference: normalizedRequest.hasVideoReference === true, hasImageReferences: normalizedRequest.hasImageReferences === true, hasAudioReference: normalizedRequest.hasAudioReference === true, firstFrameAssetId: firstFrame, previousJobId: normalizedRequest.previousJobId as string | undefined, previousModelId: normalizedRequest.previousModelId as string | undefined, upscaleFactor: normalizedRequest.upscaleFactor as number | undefined, upscaleMode: normalizedRequest.creativity === 0 ? 'PRECISE' : normalizedRequest.creativity === 1 ? 'CREATIVE' : undefined });
    const validated = await validateReviewedVideoJob(ctx, { studioExternalId: production.studioExternalId, modelId: args.model, request: normalizedRequest, estimatedCostUsd: args.estimatedProviderCostUsd });
    if (operation === 'UPSCALE') {
      if (!validated.selection.upscaleQuote) throw new Error('Upscale pricing certification is unavailable.');
      normalizedRequest.upscaleQuote = validated.selection.upscaleQuote;
    }
    if (isSourceVideoEdit(operation)) {
      if (!validated.selection.editQuote) throw new Error('Source video edit certification is unavailable.');
      normalizedRequest.editQuote = validated.selection.editQuote;
    }
    if (operation === 'LIP_SYNC') {
      if (!validated.selection.lipSyncQuote) throw new Error('Supplied recording duration certification is unavailable.');
      normalizedRequest.lipSyncQuote = validated.selection.lipSyncQuote;
    }
    if (operation === 'EXTEND') {
      if (!validated.selection.continuationQuote) throw new Error('Continuation pricing certification is unavailable.');
      normalizedRequest.continuationQuote = validated.selection.continuationQuote;
    }
    normalizedRequest.routeReason = validated.selection.routeReason;
    normalizedRequest.path = validated.selection.path;
    normalizedRequest.policyVersion = validated.selection.policyVersion;
    normalizedRequest.resolution = validated.selection.resolution ?? normalizedRequest.resolution;
    const estimatedProviderCostUsd = validated.estimatedCostUsd;
    if (!Number.isFinite(estimatedProviderCostUsd) || estimatedProviderCostUsd <= 0) throw new Error('A verified provider cost estimate is required.');
    const estimatedCost = estimateGenerationCredits({ durationSeconds: operation === 'LIP_SYNC' || operation === 'UPSCALE' || isSourceVideoEdit(operation) ? Number(normalizedRequest.durationSeconds) : shot.durationSeconds, qualityTier });
    const catalog = await ctx.db.query('videoModelCatalog').withIndex('by_studio_model', q=>q.eq('studioExternalId',production.studioExternalId).eq('modelId',args.model)).unique();
    if (!catalog || catalog.provider !== args.provider) throw new Error('SHOT_ESTIMATE_MODEL_UNAVAILABLE');
    const catalogFingerprint=videoCatalogFingerprint(catalog);
    const policy=await ctx.db.query('videoRoutePolicies').withIndex('by_studio_type_quality',q=>q.eq('studioExternalId',production.studioExternalId).eq('videoType',validated.request.videoType).eq('qualityTier',qualityTier)).unique();
    const providerHoldMicros=Math.ceil(videoBudgetReservationUsd(estimatedProviderCostUsd)*1e6);
    const canonicalHash=await shotEstimateHash({version:SHOT_ESTIMATE_VERSION,actorUserId:access.user._id,projectId:access.project._id,productionId:production._id,productionVersionId:version._id,shotId:shot._id,idempotencyKey:intent.idempotencyKey,requestHash:intent.requestHash,normalizedRequest,mediaProofs,model:args.model,modelVersion:args.modelVersion,catalogFingerprint,pricingSkus:catalog.pricingSkus,estimatedCostPerSecond:catalog.estimatedCostPerSecond,policy,estimatedProviderCostUsd,providerHoldMicros,totalCredits:estimatedCost});
    return {normalizedRequest,estimatedProviderCostUsd,estimatedCost,providerHoldMicros,catalogFingerprint,canonicalHash,operation};
}
async function requireStoredShotEstimate(ctx: ReadCtx,args:GenerationCreateArgs,intent:GenerationIntent,quote:Awaited<ReturnType<typeof resolveCanonicalShotQuote>>) {
    const consent=args.estimateConsent;
    if (!consent) throw new Error('SHOT_ESTIMATE_REVIEW_REQUIRED');
    const estimate=await ctx.db.get(consent.estimateId),saved=object(estimate?.policySnapshot);
    if (!estimate || estimate.version!==SHOT_ESTIMATE_VERSION || estimate.projectId!==intent.access.project._id || estimate.productionId!==intent.production._id || estimate.studioExternalId!==intent.production.studioExternalId || saved.actorUserId!==intent.access.user._id || saved.idempotencyKey!==intent.idempotencyKey || saved.canonicalHash!==quote.canonicalHash || saved.quoteHash!==consent.quoteHash || estimate.totalCredits!==quote.estimatedCost || saved.providerHoldMicros!==quote.providerHoldMicros) throw new Error('SHOT_ESTIMATE_CHANGED');
    assertShotEstimateTime(estimate.createdAt,estimate.expiresAt);
    return estimate._id;
}
export async function createCanonicalGenerationJob(ctx: MutationCtx, args: GenerationCreateArgs, execution?: RecipeExecution) {
    const intent=await resolveGenerationIntent(ctx,args,execution);
    const {production,access,shot,version,idempotencyKey,requestHash}=intent;
    const existing = await ctx.db.query('generationJobs').withIndex('by_idempotency', (q) => q.eq('idempotencyKey', idempotencyKey)).unique();
    if (existing) {
      if (existing.productionId !== production._id || existing.createdByUserId !== access.user._id || existing.requestHash !== requestHash) throw new Error('Idempotency key is already used for another request.');
      return publicJob(existing as unknown as Record<string, unknown>);
    }
    const quote=await resolveCanonicalShotQuote(ctx,args,intent,execution);
    const {normalizedRequest,estimatedProviderCostUsd,estimatedCost}=quote;
    const estimateId=execution?undefined:await requireStoredShotEstimate(ctx,args,intent,quote);
    const recipeAdmission = execution ? await assertRecipeAdmission(ctx,execution,{model:args.model,providerCeilingUsd:videoBudgetReservationUsd(estimatedProviderCostUsd),credits:estimatedCost}) : null;
    const latestTake = await ctx.db.query('shotVersions').withIndex('by_shot_version', (q) => q.eq('shotId', shot._id)).order('desc').first();
    const timestamp = Date.now();
    const shotVersionId = await ctx.db.insert('shotVersions', { studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: access.project._id, productionId: production._id, productionVersionId: version._id, shotId: shot._id, versionNumber: (latestTake?.versionNumber ?? 0) + 1, status: 'QUEUED', promptSnapshot: shot.prompt, contextSnapshot: { request: normalizedRequest, productionVersionId: version._id }, provider: args.provider, model: args.model, createdAt: timestamp });
    await ensureResourceState(ctx, { projectId: access.project._id, productionId: production._id, resourceType: 'shotVersion', resourceId: shotVersionId },execution?access.user._id:undefined);
    const jobId = await ctx.db.insert('generationJobs', { studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: access.project._id, productionId: production._id, productionVersionId: version._id, shotId: shot._id, shotVersionId, createdByUserId: access.user._id, operation: 'SHOT_GENERATION', capability: args.capability, modality: 'VIDEO', provider: args.provider, model: args.model, modelVersion: args.modelVersion, ...(estimateId?{estimateId}:{}), request: normalizedRequest, status: 'QUEUED', executionStage: 'QUEUED', progress: 0, estimatedCost, estimatedProviderCostUsd, idempotencyKey, requestHash, correlationId: args.correlationId, attemptCount: 0, createdAt: timestamp, updatedAt: timestamp });
    const reservation = await reserveGenerationCreditsInTransaction(ctx, { studioExternalId: production.studioExternalId, amount: estimatedCost, idempotencyKey: `generation:${jobId}`, generationJobId: jobId },execution?access.user._id:undefined);
    const providerBudgetReservationId = await reserveProviderBudget(ctx, { jobId, studioExternalId: production.studioExternalId, estimatedCostUsd: videoBudgetReservationUsd(estimatedProviderCostUsd), idempotencyKey: `generation:${jobId}` });
    await ctx.db.patch(jobId, { canonicalReservationId: reservation.reservationId, providerBudgetReservationId });
    if (recipeAdmission) await bindRecipeGenerationJob(ctx,recipeAdmission,jobId);
    await schedule(ctx, jobId);
    return publicJob((await load(ctx, jobId)) as unknown as Record<string, unknown>);
}

export const createForRecipe = internalMutation({ args: { nodeId:v.id('recipeRunNodes'),leaseId:v.string() }, returns:v.any(), handler:async(ctx,execution)=>{
  const {node,run}=await recipeExecutionScope(ctx,execution);if(node.operation!=='GENERATION')throw new Error('RECIPE_NODE_OPERATION_MISMATCH');const saved=object(object(node.resolvedBindings).createArgs);const shotId=ctx.db.normalizeId('shots',String(object(object(node.request).shot).id??''));if(!shotId)throw new Error('RECIPE_SHOT_UNAVAILABLE');
  return createCanonicalGenerationJob(ctx,{productionId:run.productionId,shotId,provider:'openrouter',model:String(saved.model??''),request:object(saved.request),estimatedCost:Number(saved.estimatedCost),estimatedProviderCostUsd:Number(saved.estimatedProviderCostUsd),idempotencyKey:node.idempotencyKey,capability:typeof saved.capability==='string'?saved.capability:undefined,modelVersion:typeof saved.modelVersion==='string'?saved.modelVersion:undefined},execution);
} });

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

async function mediaOutputBinding(ctx:ReadCtx,job:Job,storageId:Id<'_storage'>,checksum:unknown,byteSize:number) {
 const binding=await ctx.db.query('audit').withIndex('by_correlation',q=>q.eq('correlationId',`media-output:${storageId}`)).unique();const proof=object(binding?.metadata);
 if(!binding||binding.entityType!=='generationJob'||binding.entityId!==job._id||binding.studioExternalId!==job.studioExternalId||proof.projectId!==job.projectId||proof.attemptNumber!==job.attemptCount||proof.kind!==object(job.request).preparationKind||proof.byteSize!==byteSize||!sha256Equal(proof.checksum,checksum))throw new Error('PRIVATE_AUDIO_LINEAGE_REVIEW_REQUIRED');
 return binding;
}
async function recordMediaOutputBinding(ctx:MutationCtx,job:Job,storageId:Id<'_storage'>,checksum:string,byteSize:number) {
 const owner=await ctx.db.query('assets').withIndex('by_storage',q=>q.eq('storageId',storageId)).first();const binding=await ctx.db.query('audit').withIndex('by_correlation',q=>q.eq('correlationId',`media-output:${storageId}`)).unique();const image=await ctx.db.query('audit').withIndex('by_correlation',q=>q.eq('correlationId',`image-output:${storageId}`)).unique();
 if(owner||binding||image)throw new Error('PRIVATE_AUDIO_ALREADY_BOUND');
 await ctx.db.insert('audit',{studioExternalId:job.studioExternalId,studioId:job.studioId,actorUserId:job.createdByUserId,action:'AUDIO_OUTPUT_CHECKPOINTED',entityType:'generationJob',entityId:job._id,correlationId:`media-output:${storageId}`,metadata:{projectId:job.projectId,attemptNumber:job.attemptCount,kind:object(job.request).preparationKind,checksum:normalizeSha256(checksum),byteSize,operation:'RETAIN_COMPLETED_PRIVATE_BYTES'},createdAt:Date.now()});
}
async function sfxAcceptedJob(ctx:ReadCtx,args:{jobId:Id<'generationJobs'>;leaseId:string}) {
 const job=await load(ctx,args.jobId);assertLease(job,args.leaseId);const request=object(job.request);const contract=REVIEWED_OPERATION_CONTRACTS.sfx;
 if(job.operation!=='PREPARATION'||request.preparationKind!=='SFX'||job.capability!=='SFX_GENERATION'||job.provider!=='openrouter'||job.model!==contract.modelId||job.modelVersion!==contract.canonicalSlug||!job.submissionStartedAt||!job.projectId||!job.canonicalReservationId||!job.providerBudgetReservationId)throw sfxError('SFX_OUTPUT_INVALID');
 const production=await ctx.db.get(job.productionId);const project=await ctx.db.get(job.projectId);const hold=await ctx.db.get(job.providerBudgetReservationId);const quote=assertSfxQuote(object(request.quote).sfxQuote);
 if(!production||!project||production.projectId!==project._id||production.studioExternalId!==job.studioExternalId||project.studioExternalId!==job.studioExternalId||!hold||hold.jobId!==job._id||!['RESERVED','RECONCILIATION_REQUIRED'].includes(hold.status)||hold.estimatedMicros<Math.ceil(quote.reservedProviderUsd*1e6)||job.estimatedProviderCostUsd!==videoBudgetReservationUsd(quote.baseProviderCeilingUsd))throw sfxError('SFX_OUTPUT_INVALID');
 return job;
}
async function resumeSfxQc(ctx:MutationCtx,job:Job,retryable:boolean,code:string) {
 const response=object(job.response),count=Number(response.sfxQcRetries??0)+1,transient=retryable&&retryableSfxQc(code),retry=transient&&count<=SFX_LIMITS.maxQcRetries&&Date.now()-Number(object(response.sfxOutput).storedAt??job.startedAt??job.createdAt)<=2*60*60*1000;const delay=Math.min(count*10000,60000);
 await ctx.db.patch(job._id,{status:'PENDING',executionStage:retry?'AUDIO_QC':'RECONCILIATION_REQUIRED',response:{...response,sfxQcRetries:count,sfxQcFailureCode:transient?'SFX_QC_UNAVAILABLE':safeSfxQcCode(code)},errorCode:retry?'SFX_QC_PENDING':transient?'RECONCILIATION_REQUIRED':safeSfxQcCode(code),leaseId:undefined,leaseExpiresAt:undefined,nextAttemptAt:retry?Date.now()+delay:undefined,updatedAt:Date.now()});if(retry)await schedule(ctx,job._id,delay);
}
async function resumeMusicQc(ctx:MutationCtx,job:Job,retryable:boolean,errorCode:string){const response=object(job.response);const count=Number(response.musicQcRetries??0)+1;const transient=retryable&&retryableMusicQc(errorCode);const retry=transient&&count<=24;const delay=Math.min(count*10000,60000);await ctx.db.patch(job._id,{status:'PENDING',executionStage:retry?'AUDIO_QC':'RECONCILIATION_REQUIRED',response:{...response,musicQcRetries:count,musicQcFailureCode:transient?'MUSIC_QC_UNAVAILABLE':safeMusicQcCode(errorCode)},errorCode:retry?'MUSIC_QC_PENDING':transient?'RECONCILIATION_REQUIRED':safeMusicQcCode(errorCode),leaseId:undefined,leaseExpiresAt:undefined,nextAttemptAt:retry?Date.now()+delay:undefined,updatedAt:Date.now()});if(retry)await schedule(ctx,job._id,delay);}
async function musicReceipt(ctx:MutationCtx,job:Job){if(['MUSIC','SFX'].includes(String(object(job.request).preparationKind))&&/^gen-[A-Za-z0-9._-]{1,180}$/.test(job.providerRequestId??''))await ctx.scheduler.runAfter(0,ref('providerReceipts','reconcile'),{jobId:job._id});}
async function resumeImageCompletion(ctx:MutationCtx,job:Job) {
  const response=object(job.response), count=Number(response.imageCompletionRetries??0)+1, retry=count<=24;
  await ctx.db.patch(job._id,{status:'PENDING',executionStage:retry?'IMAGE_FINALIZE':'RECONCILIATION_REQUIRED',response:{...response,imageCompletionRetries:count},errorCode:retry?'IMAGE_FINALIZE_PENDING':'RECONCILIATION_REQUIRED',leaseId:undefined,leaseExpiresAt:undefined,nextAttemptAt:retry?Date.now()+10_000:undefined,updatedAt:Date.now()});
  if(retry)await schedule(ctx,job._id,10_000);
}
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
  const sfxOutput=hasStoredSfxOutput(job),musicOutput=hasStoredMusicOutput(job), imageOutput=hasStoredImageOutput(job), savedOutput=sfxOutput||musicOutput||imageOutput;const stage = sfxOutput||musicOutput?'AUDIO_QC':imageOutput?'IMAGE_FINALIZE':recoveryStage(job);
  if(sfxOutput&&timestamp-Number(object(object(job.response).sfxOutput).storedAt??0)>2*60*60*1000){await resumeSfxQc(ctx,job,false,'SFX_OUTPUT_REVIEW_REQUIRED');return {claimed:false};}
  if (stage === 'RECONCILIATION_REQUIRED') {
    await ctx.db.patch(job._id, { executionStage: stage, errorCode: stage, leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
    await settle(ctx, job, true);
    return { claimed: false };
  }
  const attemptNumber = job.providerJobId||savedOutput ? Math.max(job.attemptCount, 1) : job.attemptCount + 1;
  const leaseId = `${job._id}:${timestamp}:${Math.random().toString(36).slice(2)}`;
  await ctx.db.patch(job._id, { status: stage === 'POLL' ? 'PENDING' : 'PROCESSING', executionStage: stage, attemptCount: attemptNumber, leaseId, leaseExpiresAt: timestamp + GENERATION_LEASE_MS, startedAt: job.startedAt ?? timestamp, nextPollAt: undefined, updatedAt: timestamp });
  if (!job.providerJobId&&!savedOutput) await ctx.db.insert('attempts', { studioExternalId: job.studioExternalId, studioId: job.studioId, generationJobId: job._id, attemptNumber, status: 'PROCESSING', provider: job.provider, model: job.model, requestHash: job.requestHash, startedAt: timestamp, createdAt: timestamp });
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
  if (!job.providerJobId && !hasStoredMusicOutput(job) && !hasStoredSfxOutput(job) && !hasStoredImageOutput(job) && (project.deletedAt || project.archivedAt || project.moderationStatus === 'RESTRICTED' || (job.operation !== 'PREPARATION' && production.currentVersionId !== job.productionVersionId))) throw new Error('This project or production version is no longer available for generation.');
  const request = object(job.request);
  const references: Array<{ assetId: string; url: string; kind: 'image' | 'video' | 'audio'; mimeType?: string }> = [];
  for (const rawId of job.providerJobId ? [] : Array.isArray(request.referenceAssetIds) ? request.referenceAssetIds : []) {
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
  const imageOutput=hasStoredImageOutput(job)?object(object(job.response).imageOutput):null;
  if(imageOutput){const stored=await ctx.db.system.get('_storage',imageOutput.storageId as Id<'_storage'>);if(!stored||stored.size!==imageOutput.byteSize||stored.contentType!==imageOutput.contentType||!sha256Equal(stored.sha256,imageOutput.checksum))throw new Error('IMAGE_OUTPUT_CHANGED');}
  const sfxOutput=hasStoredSfxOutput(job)?object(object(job.response).sfxOutput):null;if(sfxOutput){const stored=await ctx.db.system.get('_storage',sfxOutput.storageId as Id<'_storage'>);if(!stored||stored.size!==sfxOutput.byteSize||stored.contentType!=='audio/mpeg'||!sha256Equal(stored.sha256,sfxOutput.checksum))throw sfxError('SFX_OUTPUT_CHANGED');await mediaOutputBinding(ctx,job,sfxOutput.storageId as Id<'_storage'>,sfxOutput.checksum,stored.size);}
  const musicOutput=hasStoredMusicOutput(job)?object(object(job.response).audioOutput):null;const musicStorage=musicOutput?await ctx.db.system.get('_storage',musicOutput.storageId as Id<'_storage'>):null;if(musicOutput&&(!musicStorage||musicStorage.size!==musicOutput.byteSize||!sha256Equal(musicStorage.sha256,musicOutput.checksum)))throw new Error('MUSIC_OUTPUT_CHANGED');if(musicOutput)await mediaOutputBinding(ctx,job,musicOutput.storageId as Id<'_storage'>,musicOutput.checksum,musicStorage!.size);return { job, request, references, outputAssetId: output?._id, outputUrl,...(sfxOutput?{sfxOutput:{...sfxOutput,url:await ctx.storage.getUrl(sfxOutput.storageId as Id<'_storage'>)}}:{}),...(imageOutput?{imageOutput}:{}),...(musicOutput?{musicOutput:{...musicOutput,url:await ctx.storage.getUrl(musicOutput.storageId as Id<'_storage'>)}}:{}) };
} });
export const fenceSubmission = internalMutation({ args: { ...leaseArgs, liveCatalogFingerprint: v.optional(v.string()), liveCatalogCheckedAt: v.optional(v.number()), livePreparationQuote: v.optional(v.any()), liveEndpointFingerprint: v.optional(v.string()) }, returns: v.any(), handler: async (ctx, args) => {
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
  const studio = project.studioId ? await ctx.db.get(project.studioId) : await ctx.db.query('studios').withIndex('by_external_id', q => q.eq('externalId', project.studioExternalId)).unique();
  if (!studio || studio.externalId !== job.studioExternalId || studio.externalId !== project.studioExternalId || ['DISABLED','SUSPENDED','REMOVED','ARCHIVED','DELETED'].includes(String(studio.status ?? '').toUpperCase()) || !await studioRoleForUser(ctx, studio, actor, userExternalKey(actor))) throw new Error('Generation workspace membership has changed.');
  const shot = job.shotId ? await ctx.db.get(job.shotId) : null;
  const scene = shot ? await ctx.db.get(shot.sceneId) : null;
  if (job.operation !== 'PREPARATION') {
    if (!shot || !scene) throw new Error('Generation graph is unavailable.');
    await requireUnlockedGraph(ctx, project._id, shot, scene);
  }
  const request = object(job.request);
  if (job.operation !== 'PREPARATION') await resolveGenerationContinuity(ctx, { projectId: project._id, productionId: job.productionId, snapshot: request.planningContextSnapshot, explicitResourceVersionIds: request.selectedResourceVersionIds, referenceAssetIds: Array.isArray(request.referenceAssetIds) ? request.referenceAssetIds.map(String) : [],shotMetadata:request,durationSeconds:Number(request.durationSeconds??request.duration) });
  if (request.targetVoiceId) {
    if (!request.voiceVersionId || !request.voiceConfigHash || !request.voiceConfigSnapshot) throw new Error('VOICE_FROZEN_CONFIG_REQUIRED');
    await resolveFrozenVoiceSynthesisInput(ctx, { projectId: project._id, voiceId: request.targetVoiceId as Id<'voices'>,
      voiceVersionId: request.voiceVersionId as Id<'voiceVersions'>, voiceConfigHash: String(request.voiceConfigHash), voiceConfigSnapshot: request.voiceConfigSnapshot,
      use: 'SYNTHESIZE', primaryVoiceSampleAssetId: request.primaryVoiceSampleAssetId as Id<'assets'> | undefined });
  }
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
    if(request.preparationKind==='SFX'){
      if(process.env.FINALFRAME_SFX_PREPARATION_ENABLED!=='true'||request.clone||request.targetVoiceId||request.primaryVoiceSampleAssetId||request.sourceAssetId||request.durationSeconds!==undefined||Array.isArray(request.referenceAssetIds)&&request.referenceAssetIds.length)throw sfxError('SFX_DISABLED_OR_INVALID');
      validateSfxPrompt(request.text);const current=freshSfxQuote(object(args.livePreparationQuote).sfxQuote);const frozen=assertSfxQuote(object(request.quote).sfxQuote);
      if(!sameSfxQuote(frozen,current)||current.model!==job.model||current.canonicalSlug!==job.modelVersion||job.capability!=='SFX_GENERATION'||current.reservedProviderUsd!==videoBudgetReservationUsd(current.baseProviderCeilingUsd)||current.reservedProviderUsd!==job.estimatedProviderCostUsd||object(args.livePreparationQuote).estimatedProviderCostUsd!==job.estimatedProviderCostUsd)throw sfxError('SFX_QUOTE_CHANGED');
      assertSfxConsent(object(request.quote).sfxEstimateConsent,String(job.productionId),request.text,current);
    }
    if(request.preparationKind==='MUSIC'){if(process.env.FINALFRAME_MUSIC_PREPARATION_ENABLED!=='true')throw new Error('MUSIC_DISABLED');const current=freshMusicQuote(object(args.livePreparationQuote).musicQuote);const frozen=freshMusicQuote({...object(object(request.quote).musicQuote),checkedAt:current.checkedAt});if(!sameMusicQuote(frozen,current)||current.model!==job.model||current.canonicalSlug!==job.modelVersion||current.reservedProviderUsd!==job.estimatedProviderCostUsd||object(args.livePreparationQuote).estimatedProviderCostUsd!==job.estimatedProviderCostUsd)throw new Error('MUSIC_QUOTE_CHANGED');}
    const bookedMicros=Math.ceil(Number(job.estimatedProviderCostUsd)*1_000_000);
    if(!Number.isFinite(bookedMicros)||bookedMicros<=0||bookedMicros>reserved.estimatedMicros)throw new Error('The preparation reservation no longer covers its provider quote.');
    const selected = preparationModel(request.preparationKind as PreparationKind, request.clone === true);
    if (selected.id !== job.model) throw new Error('Preparation model configuration changed.');
    if (request.preparationKind === 'TRANSCRIPT') {
      if (request.transcriptionOptions && stable(transcriptRequestOptions(request.transcriptionOptions)) !== stable(object(args.livePreparationQuote).transcriptionOptions)) throw new Error('TRANSCRIPT_REQUEST_CHANGED');
      const source=await resolveTranscriptSourceCertificate(ctx,{projectId:project._id,assetId:request.sourceAssetId as Id<'assets'>});
      const live=object(args.livePreparationQuote);const frozen=object(request.quote);
      if(stable(source)!==stable(request.transcriptSource)||request.transcriptFormat!==transcriptFormat(source)||typeof live.checkedAt!=='number'||Date.now()-live.checkedAt>30000||live.checkedAt>Date.now()+1000||live.model!==job.model||live.inputDurationSeconds!==source.durationSeconds||live.durationMeasurement!=='DECODED_PCM_SAMPLES_V1'||live.billableInputSeconds!==Math.ceil(source.durationSeconds+1/16000)||live.estimatedProviderCostUsd!==job.estimatedProviderCostUsd||frozen.billableInputSeconds!==live.billableInputSeconds)throw new Error('Transcript source or billing certificate changed.');
    }
    if (request.clone === true) {
      if (!request.primaryVoiceSampleAssetId) throw new Error('Choose an explicit primary voice recording.');
      const source = await resolveAudioSourceCertificate(ctx, { projectId: project._id, assetId: request.primaryVoiceSampleAssetId as Id<'assets'> });
      if (!validReferenceVoiceSource(source) || stable(source) !== stable(request.cloneSource)) throw new Error('The measured primary recording changed.');
      const frozen = assertReferenceVoiceQuote(object(request.quote).referenceVoiceQuote);
      const live = object(args.livePreparationQuote); const current = assertReferenceVoiceQuote(live.referenceVoiceQuote);
      if (stable(frozen) !== stable(current) || typeof live.checkedAt !== 'number' || Date.now() - live.checkedAt > 30_000 || live.checkedAt > Date.now() + 1000 || live.model !== job.model || live.estimatedProviderCostUsd !== job.estimatedProviderCostUsd) throw new Error('Reference voice billing certificate changed.');
    }
    dispatchValidation = { model: job.model, estimatedCostUsd: job.estimatedProviderCostUsd };
  } else {
    try {
      if (request.operation === 'LIP_SYNC') {
        const source = object(request.lipSyncSource); const portrait = object(request.lipSyncPortrait); const frozen = object(request.lipSyncQuote);
        const audio = await resolveAudioSourceCertificate(ctx, { projectId: project._id, assetId: source.assetId as Id<'assets'> });
        const image = await resolvePortraitSourceCertificate(ctx, { projectId: project._id, assetId: portrait.assetId as Id<'assets'> });
        if (stable(audio) !== stable(source) || stable(image) !== stable(portrait) || args.liveEndpointFingerprint !== frozen.endpointFingerprint || args.liveCatalogFingerprint !== frozen.catalogFingerprint || typeof args.liveCatalogCheckedAt !== 'number' || Date.now() - args.liveCatalogCheckedAt > 30_000 || args.liveCatalogCheckedAt > Date.now() + 1000) throw new Error('Supplied audio or portrait certificate changed.');
      }
      if (request.operation === 'EXTEND') {
        await requireContinuationSource(ctx, { projectId: project._id, productionId: job.productionId, model: job.model, previousJobId: String(request.previousJobId || '') },actor._id);
        const frozen = object(request.continuationQuote);
        if (args.liveCatalogFingerprint !== frozen.catalogFingerprint || typeof args.liveCatalogCheckedAt !== 'number' || Date.now() - args.liveCatalogCheckedAt > 30_000 || args.liveCatalogCheckedAt > Date.now() + 1000) throw new Error('Continuation catalog certification changed.');
      }
      if (request.operation === 'UPSCALE') {
        const source = await resolveUpscaleSourceCertificate(ctx, { projectId: project._id, referenceAssetIds: Array.isArray(request.referenceAssetIds) ? request.referenceAssetIds.map(String) : [] });
        const frozen = object(request.upscaleQuote);
        if (stable(source) !== stable(request.upscaleSource) || args.liveCatalogFingerprint !== frozen.catalogFingerprint || typeof args.liveCatalogCheckedAt !== 'number' || Date.now() - args.liveCatalogCheckedAt > 30_000 || args.liveCatalogCheckedAt > Date.now() + 1000) throw new Error('Upscale input or current catalog certification changed.');
      }
      if (isSourceVideoEdit(request.operation)) {
        const source = await resolveVideoEditSourceCertificate(ctx, { projectId: project._id, referenceAssetIds: Array.isArray(request.referenceAssetIds) ? request.referenceAssetIds.map(String) : [] });
        const frozen = object(request.editQuote);
        if (stable(source) !== stable(request.editSource) || args.liveCatalogFingerprint !== frozen.catalogFingerprint || typeof args.liveCatalogCheckedAt !== 'number' || Date.now() - args.liveCatalogCheckedAt > 30_000 || args.liveCatalogCheckedAt > Date.now() + 1000) throw new Error('Edit source or catalog certification changed.');
      }
      const current = await validateReviewedVideoJob(ctx, { studioExternalId: job.studioExternalId, modelId: job.model, request });
      if (request.operation === 'UPSCALE' && stable(current.selection.upscaleQuote) !== stable(request.upscaleQuote)) throw new Error('The frozen upscale pricing certificate changed.');
      if (isSourceVideoEdit(request.operation) && stable(current.selection.editQuote) !== stable(request.editQuote)) throw new Error('The frozen video edit pricing certificate changed.');
      if (request.operation === 'LIP_SYNC' && stable(current.selection.lipSyncQuote) !== stable(request.lipSyncQuote)) throw new Error('The frozen lip-sync pricing certificate changed.');
      if (request.operation === 'EXTEND' && stable(current.selection.continuationQuote) !== stable(request.continuationQuote)) throw new Error('The frozen continuation pricing certificate changed.');
      const estimatedMicros = Math.ceil(current.estimatedCostUsd * 1_000_000);
      if (!Number.isFinite(estimatedMicros) || estimatedMicros <= 0 || estimatedMicros > reserved.estimatedMicros || (typeof request.path === 'string' && current.selection.path !== request.path) || (typeof request.resolution === 'string' && current.selection.resolution !== request.resolution)) throw new Error('The frozen route or provider quote has changed.');
      dispatchValidation = { estimatedCostUsd: current.estimatedCostUsd, policyVersion: current.selection.policyVersion ?? null, resolution: current.selection.resolution ?? null, model: current.selection.modelId };
    } catch {
      throw Object.assign(new Error('The reviewed route or provider quote has changed. Create a new estimate.'), { code: 'ROUTE_CHANGED' });
    }
  }
  await assertRecipeGenerationFence(ctx,job,job.operation==='PREPARATION'?Number(dispatchValidation.estimatedCostUsd):videoBudgetReservationUsd(Number(dispatchValidation.estimatedCostUsd)));
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
  await ctx.db.patch(job._id, { status: 'PENDING', executionStage: args.done ? 'INGEST' : 'POLL', progress: args.done ? 70 : 25, providerRequestId: args.providerRequestId ?? job.providerRequestId, providerCostUsd: args.providerCostUsd ?? job.providerCostUsd, response: { ...object(job.response), pollCount: Number(object(job.response).pollCount || 0) + 1, ...(args.usage ? { usage: boundedProviderUsage(args.usage) } : {}) }, nextPollAt: args.done ? undefined : Date.now() + GENERATION_POLL_MS, ...(args.done ? {} : { leaseId: undefined, leaseExpiresAt: undefined }), updatedAt: Date.now() });
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
  if (attempt) await ctx.db.patch(attempt._id, { status: 'COMPLETED', errorCode: undefined, retryable: undefined, completedAt: timestamp });
  await ctx.db.patch(job._id, { status: 'COMPLETED', executionStage: 'REVIEW_READY', progress: 100, errorCode: undefined, errorMessage: undefined, nextAttemptAt: undefined, nextPollAt: undefined, response: { ...object(job.response), assetId: args.assetId, technicalProbe: args.technicalProbe, visualApproval: 'REQUIRES_HUMAN_REVIEW' }, actualCost: job.estimatedCost, latencyMs: timestamp - (job.startedAt ?? job.createdAt), leaseId: undefined, leaseExpiresAt: undefined, completedAt: timestamp, updatedAt: timestamp });
  await settle(ctx, job, true, job.providerCostUsd);
  return { jobId: job._id, assetId: args.assetId };
} });
export const fail = internalMutation({ args: { ...leaseArgs, errorCode: v.string(), retryable: v.optional(v.boolean()), ambiguous: v.optional(v.boolean()), rejected: v.optional(v.boolean()), submissionDiagnostic: v.optional(v.any()) }, returns: v.null(), handler: async (ctx, args) => {
  const job = await load(ctx, args.jobId);
  if (GENERATION_TERMINAL.has(job.status)) return null;
  assertLease(job, args.leaseId);
  const diagnostic = sanitizeSubmissionDiagnostic(args.submissionDiagnostic);
  if (diagnostic && job.operation === 'SHOT_GENERATION' && job.submissionStartedAt && !job.providerJobId) {
    await ctx.db.patch(job._id, { response: { ...object(job.response), submissionDiagnostic: diagnostic } });
  }
  const timestamp = Date.now();
  if(hasStoredSfxOutput(job)){await resumeSfxQc(ctx,job,args.retryable===true,args.errorCode);return null;}
  if(hasStoredMusicOutput(job)){await resumeMusicQc(ctx,job,args.retryable===true,args.errorCode);return null;}
  if(hasStoredImageOutput(job)){await resumeImageCompletion(ctx,job);return null;}
  const accepted = Boolean(job.providerJobId || args.ambiguous || (job.submissionStartedAt && !args.rejected));
  if (!job.providerJobId && accepted) {
    await ctx.db.patch(job._id, { status: 'PROCESSING', executionStage: 'RECONCILIATION_REQUIRED', errorCode: 'RECONCILIATION_REQUIRED', leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
    await settle(ctx, job, true);await musicReceipt(ctx,job);
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
  if(hasStoredSfxOutput(job)){await resumeSfxQc(ctx,job,true,'SFX_QC_LEASE_EXPIRED');return null;}
  if(hasStoredMusicOutput(job)){await resumeMusicQc(ctx,job,true,'MUSIC_QC_LEASE_EXPIRED');return null;}
  if(hasStoredImageOutput(job)){await resumeImageCompletion(ctx,job);return null;}
  if (recoveryStage(job) === 'RECONCILIATION_REQUIRED') {
    await ctx.db.patch(job._id, { executionStage: 'RECONCILIATION_REQUIRED', errorCode: 'RECONCILIATION_REQUIRED', leaseId: undefined, leaseExpiresAt: undefined, updatedAt: Date.now() });
    await settle(ctx, job, true);await musicReceipt(ctx,job);
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


const preparationKindValidator = v.union(v.literal('CHARACTER_REFERENCE'), v.literal('NARRATION'), v.literal('VOICE_PREVIEW'), v.literal('TRANSCRIPT'),v.literal('MUSIC'),v.literal('SFX'));
export const preparationContext = internalQuery({
  args: { productionId: v.id('productions'), voiceId: v.optional(v.id('voices')), voiceVersionId: v.optional(v.id('voiceVersions')), primaryVoiceSampleAssetId: v.optional(v.id('assets')), sourceAssetId: v.optional(v.id('assets')) }, returns: v.any(),
  handler: async (ctx, args) => {
    const { production, access } = await productionAccess(ctx, args.productionId, true);
    const voice = args.voiceId ? await resolveVoiceSynthesisInput(ctx, { projectId: access.project._id, voiceId: args.voiceId, voiceVersionId: args.voiceVersionId, use: 'SYNTHESIZE', primaryVoiceSampleAssetId: args.primaryVoiceSampleAssetId }) : null;
    const asset = args.sourceAssetId ? await ctx.db.get(args.sourceAssetId) : null;
    if (args.sourceAssetId && (!asset || asset.projectId !== access.project._id || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !asset.mimeType?.startsWith('audio/'))) throw new Error('Select a project-owned recording.');
    const stored = asset?.storageId ? await ctx.db.system.get('_storage', asset.storageId) : null;
    if (stored && (stored.size < 1 || stored.size > 15 * 1024 * 1024)) throw new Error('Recording must not exceed 15 MiB.');
    return { productionId: production._id, projectId: access.project._id, voice, source: asset?.storageId && stored ? { assetId: asset._id,storageId:asset.storageId,checksum:stored.sha256,byteSize:stored.size,mimeType:asset.mimeType,url:await ctx.storage.getUrl(asset.storageId) } : null };
  },
});
const preparationCreateArgs = { productionId: v.id('productions'), kind: preparationKindValidator, text: v.string(), targetVoiceId: v.optional(v.id('voices')), voiceVersionId: v.optional(v.id('voiceVersions')), voiceConfigSnapshot: v.optional(v.any()), voiceConfigHash: v.optional(v.string()), primaryVoiceSampleAssetId: v.optional(v.id('assets')), sourceAssetId: v.optional(v.id('assets')), durationSeconds: v.optional(v.number()), clone: v.boolean(), model: v.string(), capability: v.string(), estimatedProviderCostUsd: v.number(), quote: v.any(), idempotencyKey: v.string() };
type PreparationCreateArgs = Infer<ReturnType<typeof preparationArgsValidator>>;
function preparationArgsValidator(){return v.object(preparationCreateArgs);}
export const createPreparation=internalMutation({args:preparationCreateArgs,returns:v.any(),handler:(ctx,args)=>createCanonicalPreparationJob(ctx,args)});
export async function createCanonicalPreparationJob(ctx:MutationCtx,args:PreparationCreateArgs,execution?:RecipeExecution){
    const { production, access } = await productionAccess(ctx, args.productionId, true, execution);
    const previous=await ctx.db.query('generationJobs').withIndex('by_idempotency',q=>q.eq('idempotencyKey',key(args.idempotencyKey))).unique();
    if(args.targetVoiceId&&['NARRATION','VOICE_PREVIEW'].includes(args.kind)&&previous&&previous.operation==='PREPARATION'&&previous.projectId===access.project._id&&previous.productionId===production._id&&previous.createdByUserId===access.user._id
      &&!object(previous.request).voiceConfigHash&&(previous.status==='COMPLETED'||previous.providerJobId||previous.submissionStartedAt)){
      const saved=object(previous.request);
      if(previous.model!==args.model||saved.preparationKind!==args.kind||saved.text!==args.text.trim()||saved.targetVoiceId!==args.targetVoiceId||saved.primaryVoiceSampleAssetId!==args.primaryVoiceSampleAssetId||saved.sourceAssetId!==args.sourceAssetId||saved.clone!==args.clone)throw new Error('Idempotency key conflict.');
      return publicJob(previous as unknown as Record<string,unknown>);
    }
    if(args.kind==='SFX'&&(process.env.FINALFRAME_SFX_PREPARATION_ENABLED!=='true'||args.clone||args.targetVoiceId||args.primaryVoiceSampleAssetId||args.sourceAssetId||args.durationSeconds!==undefined))throw sfxError('SFX_DISABLED_OR_INVALID');
    if(args.kind==='MUSIC'&&(process.env.FINALFRAME_MUSIC_PREPARATION_ENABLED!=='true'||args.clone||args.durationSeconds!==undefined))throw new Error('MUSIC_DISABLED_OR_INVALID');
    if (access.project.moderationStatus === 'RESTRICTED') throw new Error('This project is restricted from new preparation.');
    if (!workerEnabled() || process.env.FINALFRAME_PREPARATION_ENABLED !== 'true') throw new Error('Preparation is not enabled.');
    if (!['NARRATION','VOICE_PREVIEW'].includes(args.kind) && (args.targetVoiceId || args.primaryVoiceSampleAssetId) || args.kind !== 'TRANSCRIPT' && args.sourceAssetId) throw new Error('Choose only the sources used by this preparation type.');
    if (args.text.length > 4000 || (args.kind !== 'TRANSCRIPT' && !args.text.trim())) throw new Error('Use between one and 4000 characters.');
    if ((args.kind === 'NARRATION' || args.kind === 'VOICE_PREVIEW') && !args.targetVoiceId) throw new Error('Select an approved project voice.');
    if(!args.targetVoiceId&&(args.voiceVersionId||args.voiceConfigHash||args.voiceConfigSnapshot))throw new Error('Select the project voice owning this version.');
    const voice = args.targetVoiceId ? await resolveVoiceSynthesisInput(ctx, { projectId: access.project._id, voiceId: args.targetVoiceId, voiceVersionId: args.voiceVersionId, use: 'SYNTHESIZE', primaryVoiceSampleAssetId: args.primaryVoiceSampleAssetId }) : null;
    if (voice && (!args.voiceConfigHash || !args.voiceConfigSnapshot || args.voiceConfigHash !== voice.voiceConfigHash || stable(args.voiceConfigSnapshot) !== stable(voice.voiceConfigSnapshot))) throw new Error('VOICE_QUOTE_CONFIG_CHANGED');
    let cloneSource;
    if (args.clone) {
      if (!['NARRATION','VOICE_PREVIEW'].includes(args.kind) || voice?.mode !== 'REFERENCE_CLONE' || !args.primaryVoiceSampleAssetId || voice.references.length !== 1 || voice.references[0].assetId !== args.primaryVoiceSampleAssetId || args.text.length > 3000) throw new Error('Select an approved primary recording for this cloned narration.');
      cloneSource = await resolveAudioSourceCertificate(ctx, { projectId: access.project._id, assetId: args.primaryVoiceSampleAssetId });
      if (!validReferenceVoiceSource(cloneSource)) throw new Error('The primary recording exceeds its reviewed format, 30-second or10MB limit.');
      const frozen = assertReferenceVoiceQuote(object(args.quote).referenceVoiceQuote);
      if (args.estimatedProviderCostUsd !== frozen.costUsd || object(args.quote).model !== args.model || typeof object(args.quote).checkedAt !== 'number' || Date.now() - Number(object(args.quote).checkedAt) > 30_000 || Number(object(args.quote).checkedAt) > Date.now() + 1000) throw new Error('Obtain a fresh reviewed reference voice quote.');
    } else if (args.primaryVoiceSampleAssetId || voice?.mode === 'REFERENCE_CLONE' || voice?.mode === 'RECORDED') throw new Error('Voice mode changed.');
    const config = preparationModel(args.kind, args.clone);
    if (args.model !== config.id || args.capability !== config.capability || !Number.isFinite(args.estimatedProviderCostUsd) || args.estimatedProviderCostUsd <= 0 || args.estimatedProviderCostUsd > 2) throw new Error('A verified preparation quote is required.');
    const sfxQuote=args.kind==='SFX'?freshSfxQuote(object(args.quote).sfxQuote):undefined;if(sfxQuote){validateSfxPrompt(args.text);assertSfxConsent(object(args.quote).sfxEstimateConsent,String(production._id),args.text,sfxQuote);if(sfxQuote.model!==args.model||args.capability!=='SFX_GENERATION'||sfxQuote.reservedProviderUsd!==videoBudgetReservationUsd(sfxQuote.baseProviderCeilingUsd)||sfxQuote.reservedProviderUsd!==args.estimatedProviderCostUsd||object(args.quote).estimatedProviderCostUsd!==args.estimatedProviderCostUsd)throw sfxError('SFX_QUOTE_INVALID');}
    const musicQuote=args.kind==='MUSIC'?freshMusicQuote(object(args.quote).musicQuote):undefined;if(musicQuote&&(musicQuote.model!==args.model||musicQuote.reservedProviderUsd!==args.estimatedProviderCostUsd||object(args.quote).estimatedProviderCostUsd!==args.estimatedProviderCostUsd))throw new Error('MUSIC_QUOTE_INVALID');
    let transcriptSource;
    let transcriptionOptions;
    if (args.kind === 'TRANSCRIPT') {
      const source = args.sourceAssetId ? await ctx.db.get(args.sourceAssetId) : null;
      if (!source || source.projectId !== access.project._id || source.scope !== 'PROJECT' || source.deletedAt || !source.storageId || !source.mimeType?.startsWith('audio/')) throw new Error('Recording is unavailable.');
      transcriptSource=await resolveTranscriptSourceCertificate(ctx,{projectId:access.project._id,assetId:source._id});
      const quoted=object(args.quote);
      // An old completed/uncertain key keeps its original text-only identity.
      // New keys always freeze the reviewed segment request in quote and hash.
      transcriptionOptions = previous ? transcriptRequestOptions(object(previous.request).transcriptionOptions) : transcriptRequestOptions(TRANSCRIPT_SEGMENT_REQUEST);
      if (transcriptionOptions && stable(quoted.transcriptionOptions) !== stable(transcriptionOptions)) throw new Error('TRANSCRIPT_REQUEST_CHANGED');
      if(args.durationSeconds!==transcriptSource.durationSeconds||quoted.inputDurationSeconds!==transcriptSource.durationSeconds||quoted.durationMeasurement!=='DECODED_PCM_SAMPLES_V1'||quoted.billableInputSeconds!==Math.ceil(transcriptSource.durationSeconds+1/16000)||quoted.estimatedProviderCostUsd!==args.estimatedProviderCostUsd||quoted.model!==args.model||typeof quoted.checkedAt!=='number'||Date.now()-quoted.checkedAt>30000||quoted.checkedAt>Date.now()+1000)throw new Error('Obtain a fresh decoded transcription quote.');
    }
    const recipeMarker=execution?{recipeRunNodeId:execution.nodeId,recipeResolvedRequestHash:(await recipeExecutionScope(ctx,execution)).node.resolvedRequestHash}:{};
    const voiceVersionId = voice ? await freezeVoiceVersion(ctx,voice,access.user._id) : undefined;
    const frozenVoice = voice ? {voiceVersionId,voiceConfigSnapshot:voice.voiceConfigSnapshot,voiceConfigHash:voice.voiceConfigHash} : {};
    const request = { ...recipeMarker, ...frozenVoice, preparationKind: args.kind, text: args.text.trim(), targetVoiceId: args.targetVoiceId, primaryVoiceSampleAssetId: args.primaryVoiceSampleAssetId, cloneSource, sourceAssetId: args.sourceAssetId,transcriptSource,...(transcriptionOptions?{transcriptionOptions}:{}),transcriptFormat:transcriptSource?transcriptFormat(transcriptSource):undefined, clone: args.clone, durationSeconds: args.durationSeconds, quote: args.quote, referenceAssetIds: args.sourceAssetId ? [args.sourceAssetId] : [] };
    const requestHash = stable({ ...recipeMarker, ...(voice?{voiceConfigHash:voice.voiceConfigHash}:{}), productionId: production._id, model: args.model, kind: args.kind, text: args.text.trim(), targetVoiceId: args.targetVoiceId, primaryVoiceSampleAssetId: args.primaryVoiceSampleAssetId, sourceAssetId: args.sourceAssetId, cloneSource, transcriptSource,...(transcriptionOptions?{transcriptionOptions}:{}),...(musicQuote?{musicQuote:{...musicQuote,checkedAt:0}}:{}),...(sfxQuote?{sfxQuote:{...sfxQuote,checkedAt:0},sfxEstimateConsent:object(args.quote).sfxEstimateConsent}:{}) });
    const idempotencyKey = key(args.idempotencyKey);
    const existing = await ctx.db.query('generationJobs').withIndex('by_idempotency', q => q.eq('idempotencyKey', idempotencyKey)).unique();
    if (existing) { if (existing.requestHash !== requestHash || existing.projectId !== access.project._id||(musicQuote||sfxQuote)&&existing.createdByUserId!==access.user._id) throw new Error('Idempotency key conflict.'); return publicJob(existing as unknown as Record<string, unknown>); }
    const admission=execution?await assertRecipeAdmission(ctx,execution,{model:args.model,providerCeilingUsd:args.estimatedProviderCostUsd,credits:1}):undefined;
    const timestamp = Date.now();
    const jobId = await ctx.db.insert('generationJobs', { studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: access.project._id, productionId: production._id, createdByUserId: access.user._id, operation: 'PREPARATION', capability: args.capability,...(musicQuote||sfxQuote?{modelVersion:(musicQuote||sfxQuote)!.canonicalSlug}:{}), modality: args.kind === 'CHARACTER_REFERENCE' ? 'IMAGE' : args.kind === 'TRANSCRIPT' ? 'TEXT' : 'AUDIO', provider: 'openrouter', model: args.model, request, requestHash, status: 'QUEUED', executionStage: 'QUEUED', progress: 0, estimatedCost: 1, estimatedProviderCostUsd: args.estimatedProviderCostUsd, idempotencyKey, attemptCount: 0, createdAt: timestamp, updatedAt: timestamp });
    const reservation = await reserveGenerationCreditsInTransaction(ctx, { studioExternalId: production.studioExternalId, amount: 1, idempotencyKey: `generation:${jobId}`, generationJobId: jobId },execution?access.user._id:undefined);
    const providerBudgetReservationId = await reserveProviderBudget(ctx, { jobId, studioExternalId: production.studioExternalId, estimatedCostUsd: args.estimatedProviderCostUsd, idempotencyKey: `generation:${jobId}` });
    await ctx.db.patch(jobId, { canonicalReservationId: reservation.reservationId, providerBudgetReservationId });
    if(admission)await bindRecipeGenerationJob(ctx,admission,jobId);
    await schedule(ctx, jobId);
    return publicJob((await load(ctx, jobId)) as unknown as Record<string, unknown>);
}
export const createPreparationForRecipe=internalMutation({args:{nodeId:v.id('recipeRunNodes'),leaseId:v.string()},returns:v.any(),handler:async(ctx,execution)=>{
  const {run,node}=await recipeExecutionScope(ctx,execution);if(!['PREPARATION','NARRATION'].includes(node.operation)||node.effect!=='PAID')throw new Error('RECIPE_PREPARATION_NODE_REQUIRED');
  const saved=object(object(node.resolvedBindings).createArgs);const estimate=run.reviewedEstimateId?await ctx.db.get(run.reviewedEstimateId):null;const quote=object(object(estimate?.quotes)[node.nodeId]);return createCanonicalPreparationJob(ctx,{...saved,quote:quote.preparationQuote,estimatedProviderCostUsd:Number(quote.baseProviderUsd),productionId:run.productionId,idempotencyKey:node.idempotencyKey} as PreparationCreateArgs,execution);
}});

export const completePreparation = internalMutation({
  args: { ...leaseArgs, storageId: v.optional(v.id('_storage')), contentType: v.optional(v.string()), text: v.optional(v.string()), segments: v.optional(v.any()), providerRequestId: v.optional(v.string()), providerCostUsd: v.optional(v.number()), actualModel: v.string(),musicProbe:v.optional(v.any()),sfxProbe:v.optional(v.any()), usage: v.optional(v.any()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await load(ctx, args.jobId);
    if (job.status === 'COMPLETED') {if(object(job.request).preparationKind==='SFX'){const saved=object(object(job.response).sfxOutput);if(!hasStoredSfxOutput(job)||saved.storageId!==args.storageId||args.contentType!=='audio/mpeg'||args.actualModel!==job.model||args.providerRequestId!==saved.providerRequestId||args.providerCostUsd!==undefined&&args.providerCostUsd!==job.providerCostUsd)throw sfxError('SFX_OUTPUT_CONFLICT');assertSfxOutputProbe(args.sfxProbe,saved);}return null;}
    assertLease(job, args.leaseId);
    if (job.operation !== 'PREPARATION' || !job.submissionStartedAt || job.model !== args.actualModel || !job.projectId) throw new Error('Preparation completion is invalid.');
    const request = object(job.request);const recordedCost=args.providerCostUsd??job.providerCostUsd;
    if(request.preparationKind==='SFX'&&args.providerCostUsd!==undefined&&args.providerCostUsd!==job.providerCostUsd)throw sfxError('SFX_RECEIPT_CONFLICT');
    if(request.preparationKind==='SFX'){
      await sfxAcceptedJob(ctx,args);const saved=object(object(job.response).sfxOutput);if(!hasStoredSfxOutput(job)||saved.storageId!==args.storageId||args.contentType!=='audio/mpeg'||saved.providerRequestId!==args.providerRequestId||Date.now()-Number(saved.storedAt??0)>2*60*60*1000)throw sfxError('SFX_OUTPUT_INVALID');assertSfxOutputProbe(args.sfxProbe,saved);
      if(!job.createdByUserId)throw sfxError('SFX_QC_AUTHORITY_DENIED');try{const access=await resolveProjectAccessForActor(ctx,job.projectId,job.createdByUserId,['OWNER','EDITOR']);if(access.project.archivedAt||access.project.status==='ARCHIVED')throw sfxError('SFX_QC_AUTHORITY_DENIED');}catch{throw sfxError('SFX_QC_AUTHORITY_DENIED');}
      const owner=await ctx.db.query('assets').withIndex('by_storage',q=>q.eq('storageId',args.storageId!)).first();if(owner)throw sfxError('SFX_OUTPUT_ALREADY_BOUND');await mediaOutputBinding(ctx,job,args.storageId!,saved.checksum,Number(saved.byteSize));
    }
    if(request.preparationKind==='CHARACTER_REFERENCE') {
      const saved=object(object(job.response).imageOutput);
      if(!hasStoredImageOutput(job)||saved.storageId!==args.storageId||saved.contentType!==args.contentType||saved.providerRequestId!==args.providerRequestId)throw new Error('IMAGE_OUTPUT_INVALID');
      const stored=await ctx.db.system.get('_storage',args.storageId!);
      if(!stored||stored.size!==saved.byteSize||stored.contentType!==saved.contentType||!sha256Equal(stored.sha256,saved.checksum))throw new Error('IMAGE_OUTPUT_CHANGED');
      const owner=await ctx.db.query('assets').withIndex('by_storage',q=>q.eq('storageId',args.storageId!)).first();
      if(owner)throw new Error('IMAGE_OUTPUT_ALREADY_BOUND');
    }
    let assetId: Id<'assets'> | undefined;let transcriptId:Id<'transcripts'>|undefined;
    let transcriptAlignment;
    if (args.storageId) {
      const sfx=request.preparationKind==='SFX';const music=request.preparationKind==='MUSIC';const proof=object(sfx?args.sfxProbe:args.musicProbe);const saved=object(object(job.response).audioOutput);if(music){if(!hasStoredMusicOutput(job)||saved.storageId!==args.storageId)throw new Error('MUSIC_OUTPUT_INVALID');assertMusicOutputProbe(proof,saved);await mediaOutputBinding(ctx,job,args.storageId,saved.checksum,Number(saved.byteSize));if(await ctx.db.query('assets').withIndex('by_storage',q=>q.eq('storageId',args.storageId!)).first())throw new Error('PRIVATE_AUDIO_ALREADY_BOUND');}
      const stored = await ctx.db.system.get('_storage', args.storageId);
      if(sfx){const output=object(object(job.response).sfxOutput);if(!stored||stored.size!==output.byteSize||stored.contentType!=='audio/mpeg'||!sha256Equal(stored.sha256,output.checksum))throw sfxError('SFX_OUTPUT_CHANGED');}
      const expected = job.modality === 'IMAGE' ? 'image/' : 'audio/';
      if(music&&(!stored||stored.size!==saved.byteSize||!sha256Equal(stored.sha256,saved.checksum)||stored.contentType!=='audio/mpeg'))throw new Error('MUSIC_OUTPUT_CHANGED');
      if (!stored || !args.contentType?.startsWith(expected) || !stored.contentType?.startsWith(expected) || stored.size <= 0 || stored.size > 15 * 1024 * 1024) throw new Error('Preparation output is invalid.');
      assetId = await ctx.db.insert('assets', { studioExternalId: job.studioExternalId, studioId: job.studioId, projectId: job.projectId, productionId: job.productionId, scope: 'PROJECT', source: 'AI_GENERATED', roles: [job.modality === 'IMAGE' ? 'CHARACTER_REFERENCE' : music?'MUSIC':sfx?'SFX':'NARRATION'], name: job.modality === 'AUDIO' ? `${music?'Music clip':sfx?'Sound effect':request.preparationKind === 'VOICE_PREVIEW' ? 'Voice preview' : 'Narration'} · ${String(request.text || '').slice(0, 60)}` : undefined, storageId: args.storageId, mimeType: args.contentType, byteSize: stored.size, checksum: stored.sha256, ...(music||sfx?{durationSeconds:Number(proof.durationSeconds)}:{}),metadata: { generationJobId: job._id,...(music?{audioProbe:proof,generatedText:saved.generatedText,musicOutputPolicy:MUSIC_OUTPUT_POLICY.version,nominalDurationSeconds:MUSIC_OUTPUT_POLICY.nominalSeconds,actualDurationSeconds:Number(proof.durationSeconds)}:{}), ...(sfx?{audioProbe:proof,actualDurationSeconds:Number(proof.durationSeconds),maximumOriginalSeconds:120,outputPolicy:'SEED_SFX_VARIABLE_SECONDS_V1'}:{}),technicalStatus: music||sfx?'PASS':'REQUIRES_REVIEW', visualApproval: 'REQUIRES_HUMAN_REVIEW', targetVoiceId: request.targetVoiceId }, provenance: { provider: job.provider, model: job.model, generationJobId: job._id, providerRequestId: args.providerRequestId }, createdAt: Date.now() });
      if(sfx)await ctx.db.insert('audio',{studioExternalId:job.studioExternalId,studioId:job.studioId,projectId:job.projectId,productionId:job.productionId,assetId,kind:'SFX',durationSeconds:Number(proof.durationSeconds),sampleRate:Number(proof.sampleRate),channels:Number(proof.channels),metadata:{generationJobId:job._id,maximumOriginalSeconds:120,requiresHumanReview:true},createdAt:Date.now()});
      if(music)await ctx.db.insert('audio',{studioExternalId:job.studioExternalId,studioId:job.studioId,projectId:job.projectId,productionId:job.productionId,assetId,kind:'MUSIC',durationSeconds:Number(proof.durationSeconds),sampleRate:Number(proof.sampleRate),channels:2,metadata:{generationJobId:job._id,nominalDurationSeconds:30,requiresHumanReview:true},createdAt:Date.now()});
    } else if (request.preparationKind === 'TRANSCRIPT') {
      if (typeof args.text !== 'string' || args.text.length > 100_000 || typeof request.sourceAssetId !== 'string') throw new Error('Transcript output is invalid.');
      const source = await ctx.db.get(request.sourceAssetId as Id<'assets'>);
      if (!source || source.projectId !== job.projectId) throw new Error('Transcript source is unavailable.');
      const certificate = await resolveTranscriptSourceCertificate(ctx, { projectId: job.projectId, assetId: source._id });
      if (stable(certificate) !== stable(request.transcriptSource)) throw new Error('Transcript source changed before completion.');
      const normalized = normalizeTranscriptSegments(args.text, args.segments, certificate.durationSeconds);
      transcriptAlignment = normalized.alignment;
      let audio = await ctx.db.query('audio').withIndex('by_asset', q => q.eq('assetId', source._id)).first();
      if (!audio) { const id = await ctx.db.insert('audio', { studioExternalId: job.studioExternalId, studioId: job.studioId, projectId: job.projectId, productionId: job.productionId, assetId: source._id, kind: 'RECORDING', metadata: {}, createdAt: Date.now() }); audio = await ctx.db.get(id); }
      transcriptId=await ctx.db.insert('transcripts', { studioExternalId: job.studioExternalId, studioId: job.studioId, audioId: audio!._id, productionId: job.productionId, language: 'und', provider: job.provider, model: job.model, checksum:certificate.checksum,status: 'COMPLETED', segments: { text: args.text, segments: normalized.segments, alignment:normalized.alignment,source:certificate,providerRequestId:args.providerRequestId??null,generationJobId: job._id }, createdAt: Date.now() });
    } else throw new Error('Preparation output is missing.');
    const timestamp = Date.now();
    const attempt = await currentAttempt(ctx, job);
    if (attempt) await ctx.db.patch(attempt._id, { status: 'COMPLETED', providerRequestId: args.providerRequestId, completedAt: timestamp, latencyMs: timestamp - (job.startedAt ?? job.createdAt) });
    await ctx.db.patch(job._id, { status: 'COMPLETED', executionStage: 'REVIEW_READY', progress: 100, errorCode:undefined,errorMessage:undefined,nextAttemptAt:undefined, providerRequestId: args.providerRequestId, providerCostUsd: recordedCost, actualCost: job.estimatedCost, response: {...object(job.response), assetId,transcriptId, text: args.text, ...(transcriptAlignment?{transcriptAlignment}:{}), usage: boundedProviderUsage(args.usage??(request.preparationKind==='SFX'?object(job.response).usage:undefined)),...(request.preparationKind==='SFX'?{actualDurationSeconds:Number(object(args.sfxProbe).durationSeconds),maximumOriginalSeconds:120,outputPolicy:'SEED_SFX_VARIABLE_SECONDS_V1'}:{}),...(request.preparationKind==='MUSIC'?{actualDurationSeconds:Number(object(args.musicProbe).durationSeconds),nominalDurationSeconds:MUSIC_OUTPUT_POLICY.nominalSeconds,musicOutputPolicy:MUSIC_OUTPUT_POLICY.version}:{}), reviewStatus: 'REQUIRES_HUMAN_REVIEW' }, latencyMs: timestamp - (job.startedAt ?? job.createdAt), leaseId: undefined, leaseExpiresAt: undefined, completedAt: timestamp, updatedAt: timestamp });
    await settle(ctx, job, true, recordedCost);
    if (job.modality === 'AUDIO' && recordedCost === undefined && (['MUSIC','SFX'].includes(String(request.preparationKind))?/^gen-[A-Za-z0-9._-]{1,180}$/:/^gen-tts-\d+-[A-Za-z0-9]+$/).test(args.providerRequestId ?? '')) {
      const receipts = (internal as unknown as { providerReceipts: Record<string, FunctionReference<any, 'internal', any, any>> }).providerReceipts;
      await ctx.scheduler.runAfter(0, receipts.reconcile, { jobId: job._id });
    }
    return null;
  },
});

/** Correlation only: these IDs must never become providerJobId or a video poll. */
export const recordImageReceipt=internalMutation({args:{...leaseArgs,providerRequestId:v.string(),kind:v.optional(v.union(v.literal('GENERATION'),v.literal('CORRELATION')))},returns:v.null(),handler:async(ctx,args)=>{
  const job=await load(ctx,args.jobId);assertLease(job,args.leaseId);
  if(args.kind==='CORRELATION'){if(job.operation!=='PREPARATION'||object(job.request).preparationKind!=='CHARACTER_REFERENCE'||!job.submissionStartedAt||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(args.providerRequestId)||object(job.response).imageCorrelationId&&object(job.response).imageCorrelationId!==args.providerRequestId)throw new Error('IMAGE_RECEIPT_INVALID');await ctx.db.patch(job._id,{response:{...object(job.response),imageCorrelationId:args.providerRequestId},updatedAt:Date.now()});return null;}
  if(job.operation!=='PREPARATION'||object(job.request).preparationKind!=='CHARACTER_REFERENCE'||!job.submissionStartedAt||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(args.providerRequestId)||job.providerRequestId&&job.providerRequestId!==args.providerRequestId)throw new Error('IMAGE_RECEIPT_INVALID');
  await ctx.db.patch(job._id,{providerRequestId:args.providerRequestId,updatedAt:Date.now()});return null;
}});
export const recordImageOutput=internalMutation({args:{...leaseArgs,storageId:v.id('_storage'),contentType:v.string(),actualModel:v.string(),providerRequestId:v.optional(v.string()),providerCostUsd:v.optional(v.number()),usage:v.optional(v.any())},returns:v.null(),handler:async(ctx,args)=>{
  const job=await load(ctx,args.jobId);assertLease(job,args.leaseId);
  if(job.operation!=='PREPARATION'||object(job.request).preparationKind!=='CHARACTER_REFERENCE'||!job.submissionStartedAt||job.model!==args.actualModel||job.providerRequestId!==args.providerRequestId||!['image/png','image/jpeg','image/webp'].includes(args.contentType)||args.providerCostUsd!==undefined&&(!Number.isFinite(args.providerCostUsd)||args.providerCostUsd<0))throw new Error('IMAGE_OUTPUT_INVALID');
  const stored=await ctx.db.system.get('_storage',args.storageId);
  if(!stored||stored.contentType!==args.contentType||stored.size<1||stored.size>15*1024*1024||!normalizeSha256(stored.sha256))throw new Error('IMAGE_OUTPUT_INVALID');
  const previous=object(object(job.response).imageOutput);
  if(previous.storageId){if(previous.storageId!==args.storageId||previous.contentType!==args.contentType||previous.providerRequestId!==args.providerRequestId)throw new Error('IMAGE_OUTPUT_CONFLICT');return null;}
  const correlationId=`image-output:${args.storageId}`;
  const binding=await ctx.db.query('audit').withIndex('by_correlation',q=>q.eq('correlationId',correlationId)).unique();
  const existingAsset=await ctx.db.query('assets').withIndex('by_storage',q=>q.eq('storageId',args.storageId)).first();
  if(binding||existingAsset)throw new Error('IMAGE_OUTPUT_ALREADY_BOUND');
  await ctx.db.patch(job._id,{executionStage:'IMAGE_FINALIZE',progress:80,...(args.providerCostUsd!==undefined?{providerCostUsd:args.providerCostUsd}:{}),response:{...object(job.response),imageOutput:{storageId:args.storageId,contentType:args.contentType,checksum:stored.sha256,byteSize:stored.size,model:job.model,...(args.providerRequestId?{providerRequestId:args.providerRequestId}:{}),completed:true,storedAt:Date.now()},...(args.usage!==undefined?{usage:boundedProviderUsage(args.usage)}:{})},updatedAt:Date.now()});
  await ctx.db.insert('audit',{studioExternalId:job.studioExternalId,studioId:job.studioId,actorUserId:job.createdByUserId,action:'IMAGE_OUTPUT_CHECKPOINTED',entityType:'generationJob',entityId:job._id,correlationId,metadata:{storageId:args.storageId,checksum:normalizeSha256(stored.sha256),byteSize:stored.size,operation:'RETAIN_COMPLETED_PRIVATE_BYTES'},createdAt:Date.now()});return null;
}});
export const recordMusicAcceptance=internalMutation({args:{...leaseArgs,providerRequestId:v.string()},returns:v.null(),handler:async(ctx,args)=>{const job=await load(ctx,args.jobId);assertLease(job,args.leaseId);if(job.operation!=='PREPARATION'||object(job.request).preparationKind!=='MUSIC'||!job.submissionStartedAt||!/^gen-[A-Za-z0-9._-]{1,180}$/.test(args.providerRequestId)||job.providerRequestId&&job.providerRequestId!==args.providerRequestId)throw new Error('MUSIC_ACCEPTANCE_INVALID');await ctx.db.patch(job._id,{providerRequestId:args.providerRequestId,updatedAt:Date.now()});return null;}});
export const recordMusicOutput=internalMutation({args:{...leaseArgs,storageId:v.id('_storage'),providerRequestId:v.string(),actualModel:v.string(),generatedText:v.string(),providerCostUsd:v.optional(v.number()),usage:v.optional(v.any())},returns:v.null(),handler:async(ctx,args)=>{const job=await load(ctx,args.jobId);assertLease(job,args.leaseId);if(job.operation!=='PREPARATION'||object(job.request).preparationKind!=='MUSIC'||!job.submissionStartedAt||job.providerRequestId!==args.providerRequestId||job.model!==args.actualModel||new TextEncoder().encode(args.generatedText).length>MUSIC_LIMITS.maxTextBytes||args.providerCostUsd!==undefined&&(!Number.isFinite(args.providerCostUsd)||args.providerCostUsd<.04))throw new Error('MUSIC_OUTPUT_INVALID');const stored=await ctx.db.system.get('_storage',args.storageId);if(!stored||stored.contentType!=='audio/mpeg'||stored.size<1||stored.size>MUSIC_LIMITS.maxDecodedBytes||!normalizeSha256(stored.sha256))throw new Error('MUSIC_OUTPUT_INVALID');const previous=object(object(job.response).audioOutput);if(previous.storageId){if(previous.storageId!==args.storageId||previous.providerRequestId!==args.providerRequestId||previous.generatedText!==args.generatedText)throw new Error('MUSIC_OUTPUT_CONFLICT');await mediaOutputBinding(ctx,job,args.storageId,stored.sha256,stored.size);return null;}await recordMediaOutputBinding(ctx,job,args.storageId,stored.sha256,stored.size);await ctx.db.patch(job._id,{executionStage:'AUDIO_QC',progress:75,...(args.providerCostUsd!==undefined?{providerCostUsd:args.providerCostUsd}:{}),response:{...object(job.response),audioOutput:{storageId:args.storageId,checksum:stored.sha256,byteSize:stored.size,contentType:'audio/mpeg',model:job.model,providerRequestId:args.providerRequestId,generatedText:args.generatedText,streamCompleted:true,storedAt:Date.now()},...(args.usage!==undefined?{usage:boundedProviderUsage(args.usage)}:{})},updatedAt:Date.now()});return null;}});

/** Cancel only an originating recipe job which has certainly not crossed the
 * provider fence. A linked/reused job belongs to its original run. */
export async function cancelUnsubmittedRecipeJob(ctx:MutationCtx,nodeId:Id<'recipeRunNodes'>){
 const node=await ctx.db.get(nodeId);const run=node?await ctx.db.get(node.runId):null;const job=node?.linkedGenerationJobId?await ctx.db.get(node.linkedGenerationJobId):null;
 if(!node||!run?.cancelRequestedAt||!job||job.projectId!==run.projectId||job.productionId!==run.productionId||object(job.request).recipeRunNodeId!==node._id)return;
 if(job.providerJobId||job.providerRequestId||job.submissionStartedAt||hasStoredMusicOutput(job)||['COMPLETED','CANCELED','FAILED'].includes(job.status))return;
 await ctx.db.patch(job._id,{status:'CANCELED',executionStage:'CANCELED',leaseId:undefined,leaseExpiresAt:undefined,completedAt:Date.now(),updatedAt:Date.now()});await settle(ctx,job,false);
}

export const recordSfxReceipt=internalMutation({args:{...leaseArgs,generationId:v.optional(v.string()),requestId:v.optional(v.string())},returns:v.null(),handler:async(ctx,args)=>{
 const job=await sfxAcceptedJob(ctx,args),response=object(job.response);
 if(args.generationId&&(!/^gen-[A-Za-z0-9._-]{1,180}$/.test(args.generationId)||job.providerRequestId&&job.providerRequestId!==args.generationId)||args.requestId&&(!/^[A-Za-z0-9._:-]{1,200}$/.test(args.requestId)||response.sfxCorrelationId&&response.sfxCorrelationId!==args.requestId))throw sfxError('SFX_RECEIPT_INVALID');
 await ctx.db.patch(job._id,{...(args.generationId?{providerRequestId:args.generationId}:{}),response:{...response,...(args.generationId?{sfxGenerationId:args.generationId}:{}),...(args.requestId?{sfxCorrelationId:args.requestId}:{})},updatedAt:Date.now()});return null;
}});
export const recordSfxOutput=internalMutation({args:{...leaseArgs,storageId:v.id('_storage'),actualModel:v.string(),providerRequestId:v.optional(v.string()),providerCostUsd:v.optional(v.number()),usage:v.optional(v.any())},returns:v.null(),handler:async(ctx,args)=>{
 const job=await sfxAcceptedJob(ctx,args);if(job.model!==args.actualModel||job.providerRequestId!==args.providerRequestId||args.providerRequestId!==undefined&&object(job.response).sfxGenerationId!==args.providerRequestId||args.providerCostUsd!==undefined&&(!Number.isFinite(args.providerCostUsd)||args.providerCostUsd<0))throw sfxError('SFX_OUTPUT_INVALID');
 const stored=await ctx.db.system.get('_storage',args.storageId);if(!stored||stored.contentType!=='audio/mpeg'||stored.size<1||stored.size>SFX_LIMITS.maxBytes||!normalizeSha256(stored.sha256))throw sfxError('SFX_OUTPUT_INVALID');const previous=object(object(job.response).sfxOutput);
 if(previous.storageId){if(previous.storageId!==args.storageId||previous.providerRequestId!==args.providerRequestId||previous.model!==args.actualModel||args.providerCostUsd!==undefined&&job.providerCostUsd!==args.providerCostUsd)throw sfxError('SFX_OUTPUT_CONFLICT');await mediaOutputBinding(ctx,job,args.storageId,stored.sha256,stored.size);return null;}
 await recordMediaOutputBinding(ctx,job,args.storageId,stored.sha256,stored.size);await ctx.db.patch(job._id,{executionStage:'AUDIO_QC',progress:75,...(args.providerCostUsd!==undefined?{providerCostUsd:args.providerCostUsd}:{}),response:{...object(job.response),sfxOutput:{storageId:args.storageId,checksum:stored.sha256,byteSize:stored.size,contentType:'audio/mpeg',model:job.model,...(args.providerRequestId?{providerRequestId:args.providerRequestId}:{}),completed:true,storedAt:Date.now()},...(args.usage!==undefined?{usage:boundedProviderUsage(args.usage)}:{})},updatedAt:Date.now()});return null;
}});
