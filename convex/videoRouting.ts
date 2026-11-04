import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { FunctionReference } from 'convex/server';
import { object } from './generationWorkerContracts';
import { resolveGenerationContinuity } from './generationContinuity';
import { requireAdmin, requireMember, requireProjectRole } from "./authorization";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { discoverOpenRouterVideoModels } from '../src/lib/ai/model-discovery';
import { videoCatalogFingerprint, videoCatalogQuoteFingerprint, validUpscaleSource, validVideoEditSource, isSourceVideoEdit, VIDEO_CATALOG_MAX_AGE_MS, VIDEO_OPERATIONS, normalizeVideoType, selectVideoRoute, type VideoOperation, type VideoModelCapabilities, type VideoRoutingRequest, type UpscaleSourceCertificate, type VideoEditSourceCertificate } from "../src/lib/ai/video-routing";

function catalogFingerprint(model: Parameters<typeof videoCatalogFingerprint>[0]) {
  return videoCatalogFingerprint(model);
}


const videoType = v.union(
  v.literal("ANIMATED_COMEDY_2D"), v.literal("REALISTIC_SKIT_UGC"), v.literal("PRODUCT_SAAS_LAUNCH"),
  v.literal("MOTION_GRAPHICS"), v.literal("EXPLAINER_STORY"), v.literal("CINEMATIC_FILM"),
  v.literal("MUSIC_VIDEO"), v.literal("SOCIAL_CUTDOWN"),
);
const qualityTier = v.union(v.literal("ECONOMY"), v.literal("STANDARD"), v.literal("PREMIUM"));
const path = v.union(v.literal("AI_VIDEO"), v.literal("MOTION_GRAPHICS"), v.literal("COMPOSITED"));

const catalogInput = v.object({
  provider: v.string(), modelId: v.string(), canonicalSlug: v.optional(v.string()), name: v.optional(v.string()),
  supportedDurations: v.array(v.number()), supportedResolutions: v.array(v.string()),
  supportedAspectRatios: v.array(v.string()), supportedSizes: v.optional(v.array(v.string())), supportedParameters: v.array(v.string()),
  upscaleFactor: v.optional(v.object({ min: v.number(), max: v.number() })), creativityLevels: v.optional(v.array(v.number())),
  estimatedCostPerSecond: v.optional(v.number()), pricingSkus: v.optional(v.record(v.string(), v.number())),
});

function validateCatalogInput(item: { upscaleFactor?: { min: number; max: number }; creativityLevels?: number[]; provider: string; modelId: string; supportedDurations: number[]; supportedResolutions: string[]; supportedAspectRatios: string[]; supportedSizes?: string[]; supportedParameters: string[]; estimatedCostPerSecond?: number; pricingSkus?: Record<string, number> }) {
  if (item.provider !== "openrouter") throw new Error("Only models discovered through the configured provider can be saved.");
  if (!item.modelId.trim() || item.modelId.length > 200) throw new Error("Invalid model identifier.");
    if (item.supportedDurations.length > 32 || item.supportedResolutions.length > 32 || item.supportedAspectRatios.length > 32 || (item.supportedSizes?.length ?? 0) > 64 || item.supportedParameters.length > 100) throw new Error("Model capability data exceeds the allowed size.");
  if (item.upscaleFactor && (!Number.isFinite(item.upscaleFactor.min) || !Number.isFinite(item.upscaleFactor.max) || item.upscaleFactor.min <= 0 || item.upscaleFactor.max < item.upscaleFactor.min)) throw new Error('Invalid upscale factor range.');
  if (item.creativityLevels && (item.creativityLevels.length > 10 || item.creativityLevels.some(value => !Number.isInteger(value) || value < 0) || new Set(item.creativityLevels).size !== item.creativityLevels.length)) throw new Error('Invalid upscale creativity levels.');
  if (item.estimatedCostPerSecond !== undefined && (!Number.isFinite(item.estimatedCostPerSecond) || item.estimatedCostPerSecond < 0)) throw new Error("Invalid model cost.");
  if (item.pricingSkus && (Object.keys(item.pricingSkus).length > 64 || Object.values(item.pricingSkus).some((value) => !Number.isFinite(value) || value < 0))) throw new Error("Invalid model pricing data.");
}

export const listForAdmin = query({
  args: { studioExternalId: v.string() },
  returns: v.object({ catalog: v.array(v.any()), policies: v.array(v.any()) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.studioExternalId);
    const [catalog, policies] = await Promise.all([
      ctx.db.query("videoModelCatalog").withIndex("by_studio", (q) => q.eq("studioExternalId", args.studioExternalId)).take(200),
      ctx.db.query("videoRoutePolicies").withIndex("by_studio", (q) => q.eq("studioExternalId", args.studioExternalId)).take(100),
    ]);
    return { catalog, policies };
  },
});

export const refreshCatalog = mutation({
  args: { studioExternalId: v.string(), models: v.array(catalogInput) },
  returns: v.object({ count: v.number(), refreshedAt: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.studioExternalId);
    if (args.models.length > 200) throw new Error("The video model catalog is too large to refresh at once.");
    const timestamp = Date.now();
    for (const model of args.models) {
      validateCatalogInput(model);
      const existing = await ctx.db.query("videoModelCatalog")
        .withIndex("by_studio_model", (q) => q.eq("studioExternalId", args.studioExternalId).eq("modelId", model.modelId)).unique();
      const discovered = {
        provider: model.provider, modelId: model.modelId, canonicalSlug: model.canonicalSlug, name: model.name,
        supportedDurations: model.supportedDurations, supportedResolutions: model.supportedResolutions,
        supportedAspectRatios: model.supportedAspectRatios, supportedSizes: model.supportedSizes, supportedParameters: model.supportedParameters,
        upscaleFactor: model.upscaleFactor, creativityLevels: model.creativityLevels,
        estimatedCostPerSecond: model.estimatedCostPerSecond, pricingSkus: model.pricingSkus, available: true, lastSeenAt: timestamp,
        catalogFingerprint: catalogFingerprint(model),
      };
      if (existing) {
        const changed = catalogFingerprint(existing) !== discovered.catalogFingerprint;
        await ctx.db.patch(existing._id, { ...discovered,
          ...(changed ? { reviewedAt: undefined, reviewedCatalogFingerprint: undefined, reviewedOperations: [],
            supportsTextToVideo: false, supportsImageReferences: false, supportsVideoReferences: false,
            supportsFirstFrame: false, supportsLastFrame: false, supportsVideoEdit: false, supportsVideoExtension: false,
            supportsAudio: false, supportsAudioReferences: false, supportsPerformanceTransfer: false,
            supportsLipSync: false, supportsUpscale: false, supportsSourceAudioPreservation: false,
            supportsCombinedFrameReferences: false } : {}),
        });
      }
      else await ctx.db.insert("videoModelCatalog", {
        studioExternalId: args.studioExternalId, ...discovered,
        supportsTextToVideo: true, supportsImageReferences: false, supportsVideoReferences: false,
        supportsFirstFrame: false, supportsLastFrame: false, supportsVideoEdit: false,
        supportsVideoExtension: false, supportsAudio: false,
      });
    }
    const seen = new Set(args.models.map((model) => model.modelId));
    const known = await ctx.db.query("videoModelCatalog").withIndex("by_studio", (q) => q.eq("studioExternalId", args.studioExternalId)).take(200);
    for (const model of known) if (!seen.has(model.modelId)) await ctx.db.patch(model._id, { available: false });
    return { count: args.models.length, refreshedAt: timestamp };
  },
});

export const reviewModelCapabilities = mutation({
  args: {
    studioExternalId: v.string(), modelId: v.string(), available: v.boolean(), supportsTextToVideo: v.boolean(),
    supportsImageReferences: v.boolean(), supportsFirstFrame: v.boolean(),
    supportsLastFrame: v.boolean(), supportsAudio: v.boolean(),
    supportsVideoReferences: v.optional(v.boolean()), supportsVideoEdit: v.optional(v.boolean()),
    supportsVideoExtension: v.optional(v.boolean()), supportsAudioReferences: v.optional(v.boolean()),
    supportsPerformanceTransfer: v.optional(v.boolean()), supportsLipSync: v.optional(v.boolean()),
    supportsUpscale: v.optional(v.boolean()), supportsSourceAudioPreservation: v.optional(v.boolean()),
    supportsCombinedFrameReferences: v.optional(v.boolean()), reviewedOperations: v.optional(v.array(v.string())),
  },
  returns: v.object({ reviewedAt: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.studioExternalId);
    const model = await ctx.db.query("videoModelCatalog")
      .withIndex("by_studio_model", (q) => q.eq("studioExternalId", args.studioExternalId).eq("modelId", args.modelId)).unique();
    if (!model) throw new Error("Refresh the model catalog before reviewing its capabilities.");
    const reviewedAt = Date.now();
    const operations = args.reviewedOperations || [];
    for (const operation of operations) {
      if (!(VIDEO_OPERATIONS as readonly string[]).includes(operation)) throw new Error("Unknown reviewed operation.");
      if (["EDIT", "APPEARANCE_EDIT", "OBJECT_REPLACE"].includes(operation) && (!args.supportsVideoEdit || !args.supportsVideoReferences)) throw new Error("Editing requires reviewed source video support.");
      if (operation === "PERFORMANCE_TRANSFER" && (!args.supportsPerformanceTransfer || !args.supportsVideoReferences || !args.supportsImageReferences)) throw new Error("Performance transfer requires reviewed image and video references.");
      if (operation === "EXTEND" && !args.supportsVideoExtension) throw new Error("Continuation must be reviewed separately.");
      if (operation === "LIP_SYNC" && (!args.supportsLipSync || !args.supportsAudioReferences)) throw new Error("Lip sync requires reviewed audio reference support.");
      if (operation === "UPSCALE" && (!args.supportsUpscale || !args.supportsVideoReferences)) throw new Error("Upscaling requires reviewed source video support.");
    }
    await ctx.db.patch(model._id, {
      available: args.available, supportsTextToVideo: args.supportsTextToVideo,
      supportsImageReferences: args.supportsImageReferences, supportsVideoReferences: args.supportsVideoReferences ?? false,
      supportsFirstFrame: args.supportsFirstFrame, supportsLastFrame: args.supportsLastFrame,
      supportsVideoEdit: args.supportsVideoEdit ?? false, supportsVideoExtension: args.supportsVideoExtension ?? false,
      supportsAudio: args.supportsAudio, supportsAudioReferences: args.supportsAudioReferences ?? false,
      supportsPerformanceTransfer: args.supportsPerformanceTransfer ?? false, supportsLipSync: args.supportsLipSync ?? false,
      supportsUpscale: args.supportsUpscale ?? false, supportsSourceAudioPreservation: args.supportsSourceAudioPreservation ?? false,
      supportsCombinedFrameReferences: args.supportsCombinedFrameReferences ?? false,
      reviewedOperations: operations, catalogFingerprint: catalogFingerprint(model), reviewedCatalogFingerprint: catalogFingerprint(model), reviewedAt,
    });
    return { reviewedAt };
  },
});

export const savePolicy = mutation({
  args: {
    studioExternalId: v.string(), videoType, qualityTier, path,
    preferredModelIds: v.array(v.string()), maxCostUsd: v.optional(v.number()),
  },
  returns: v.object({ policyId: v.id("videoRoutePolicies"), updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.studioExternalId);
    if (args.preferredModelIds.length > 8) throw new Error("A route can contain at most eight preferred models.");
    if (new Set(args.preferredModelIds).size !== args.preferredModelIds.length) throw new Error("Preferred models must be unique.");
    if (args.qualityTier === "PREMIUM" && (args.preferredModelIds.length === 0 || args.maxCostUsd === undefined)) throw new Error("Premium routing requires at least one reviewed model and an administrator-set spending cap.");
    if (args.maxCostUsd !== undefined && (!Number.isFinite(args.maxCostUsd) || args.maxCostUsd <= 0)) throw new Error("The maximum route cost must be positive.");
    for (const modelId of args.preferredModelIds) {
      const model = await ctx.db.query("videoModelCatalog")
        .withIndex("by_studio_model", (q) => q.eq("studioExternalId", args.studioExternalId).eq("modelId", modelId)).unique();
      if (!model || model.platformQuarantinedAt !== undefined || !model.available || !model.reviewedAt || model.lastSeenAt < Date.now() - VIDEO_CATALOG_MAX_AGE_MS) throw new Error(`Model ${modelId} must be refreshed from the live catalog and capability-reviewed before activation.`);
      if (args.path !== "MOTION_GRAPHICS" && !model.supportsTextToVideo && !model.reviewedOperations?.length) throw new Error(`Model ${modelId} is not reviewed for any supported video operation.`);
    }
    const updatedAt = Date.now();
    const current = await ctx.db.query("videoRoutePolicies").withIndex("by_studio_type_quality", (q) => q
      .eq("studioExternalId", args.studioExternalId).eq("videoType", args.videoType).eq("qualityTier", args.qualityTier)).unique();
    const fields = { path: args.path, preferredModelIds: args.preferredModelIds, maxCostUsd: args.maxCostUsd, updatedByUserId: admin.user._id, updatedAt };
    if (current) {
      await ctx.db.patch(current._id, fields);
      return { policyId: current._id, updatedAt };
    }
    const policyId = await ctx.db.insert("videoRoutePolicies", { studioExternalId: args.studioExternalId, videoType: args.videoType, qualityTier: args.qualityTier, ...fields });
    return { policyId, updatedAt };
  },
});

export const forGeneration = query({
  args: { studioExternalId: v.string(), videoType, qualityTier },
  returns: v.object({ catalog: v.array(v.any()), policy: v.optional(v.any()) }),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.studioExternalId);
    const [catalog, policy] = await Promise.all([
      ctx.db.query("videoModelCatalog").withIndex("by_studio", (q) => q.eq("studioExternalId", args.studioExternalId)).take(200),
      ctx.db.query("videoRoutePolicies").withIndex("by_studio_type_quality", (q) => q
        .eq("studioExternalId", args.studioExternalId).eq("videoType", args.videoType).eq("qualityTier", args.qualityTier)).unique(),
    ]);
    return { catalog: catalog.map(model => ({ ...model, available: model.available && model.platformQuarantinedAt === undefined })), policy: policy ?? undefined };
  },
});

const refreshQuoteArgs = { projectId: v.id('projects') };

async function staleReviewedQuoteModels(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>, now: number) {
  const { project } = await requireProjectRole(ctx, projectId, ['OWNER', 'EDITOR']);
  if (project.moderationStatus === 'RESTRICTED') throw new Error('The project is unavailable for generation.');
  const catalog = await ctx.db.query('videoModelCatalog').withIndex('by_studio', q => q.eq('studioExternalId', project.studioExternalId)).take(200);
  return catalog.filter(model => model.provider === 'openrouter' && model.available && model.platformQuarantinedAt === undefined && model.reviewedAt
    && model.reviewedCatalogFingerprint === catalogFingerprint(model) && model.lastSeenAt < now - VIDEO_CATALOG_MAX_AGE_MS);
}

export const needsReviewedQuoteRefresh = internalQuery({
  args: { ...refreshQuoteArgs, now: v.number() }, returns: v.boolean(),
  handler: async (ctx, { projectId, now }) => (await staleReviewedQuoteModels(ctx, projectId, now)).length > 0,
});

export const recordReviewedQuoteRefresh = internalMutation({
  args: { ...refreshQuoteArgs, fingerprints: v.record(v.string(), v.string()), checkedAt: v.number() }, returns: v.null(),
  handler: async (ctx, { projectId, fingerprints, checkedAt }) => {
    const now = Date.now();
    if (Object.keys(fingerprints).length > 200 || !Number.isFinite(checkedAt) || checkedAt > now + 1000 || checkedAt < now - 30_000) throw new Error('The catalog check expired.');
    for (const model of await staleReviewedQuoteModels(ctx, projectId, now)) {
      if (Object.prototype.hasOwnProperty.call(fingerprints, model.modelId) && fingerprints[model.modelId] === videoCatalogQuoteFingerprint(model)) {
        await ctx.db.patch(model._id, { lastSeenAt: checkedAt });
      }
    }
    return null;
  },
});

/** Refresh matching reviewed rows only. The caller supplies a project ID and
 * cannot attest to catalog data, reactivate a model or edit its review. */
export async function refreshReviewedVideoCatalog(ctx: ActionCtx, projectId: Id<'projects'>) {
  const refs = (internal as unknown as { videoRouting: Record<string, FunctionReference<any, 'internal', any, any>> }).videoRouting;
  if (!await ctx.runQuery(refs.needsReviewedQuoteRefresh, { projectId, now: Date.now() })) return null;
  const live = await discoverOpenRouterVideoModels({
    staleIfError: false, ttlMs: 60_000,
    fetch: (url, init) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) }),
  });
  if (live.length > 200 || new Set(live.map(model => model.id)).size !== live.length) throw new Error('The live video catalog exceeds its expected bounds.');
  const fingerprints = Object.fromEntries(live.map(model => [model.id, videoCatalogQuoteFingerprint({ ...model, provider: 'openrouter', modelId: model.id, supportedParameters: model.allowedPassthroughParameters })]));
  if (JSON.stringify(fingerprints).length > 256 * 1024) throw new Error('The live video catalog exceeds its expected bounds.');
  await ctx.runMutation(refs.recordReviewedQuoteRefresh, { projectId, fingerprints, checkedAt: Date.now() });
  return null;
}

export const refreshReviewedForQuote = action({
  args: refreshQuoteArgs, returns: v.null(),
  handler: (ctx, { projectId }) => refreshReviewedVideoCatalog(ctx, projectId),
});


/** Called from job creation inside its transaction. Never accept the caller's
 * provider estimate as a budget authority. Asset authorization must happen in
 * the caller before handing this helper resolved reference requirements. */
export async function validateReviewedVideoJob(ctx: QueryCtx | MutationCtx, args: {
  studioExternalId: string; modelId: string; request: Record<string, unknown>; estimatedCostUsd?: number;
}) {
  const nested = args.request.constraints && typeof args.request.constraints === "object" ? args.request.constraints as Record<string, unknown> : {};
  const raw = { ...args.request, ...nested };
  const task = raw.task === "EDIT" || raw.task === "EXTEND" || raw.task === "FRAME_TO_VIDEO" ? raw.task : "GENERATE";
  if (raw.operation !== undefined && !(VIDEO_OPERATIONS as readonly unknown[]).includes(raw.operation)) throw new Error("Unsupported video operation.");
  const qualityTier = raw.qualityTier === "PREMIUM" || raw.qualityTier === "ECONOMY" ? raw.qualityTier : "STANDARD";
  const videoType = normalizeVideoType(raw.videoType);
  const policy = await ctx.db.query("videoRoutePolicies").withIndex("by_studio_type_quality", (q) => q.eq("studioExternalId", args.studioExternalId).eq("videoType", videoType).eq("qualityTier", qualityTier)).unique();
  const catalog = await ctx.db.query("videoModelCatalog").withIndex("by_studio", (q) => q.eq("studioExternalId", args.studioExternalId)).take(200);
  const request: VideoRoutingRequest = {
    videoType, task, qualityTier, operation: raw.operation as VideoOperation | undefined,
    durationSeconds: Number(raw.durationSeconds ?? raw.duration), aspectRatio: String(raw.aspectRatio ?? raw.ratio ?? ""),
    resolution: typeof raw.resolution === "string" ? raw.resolution : undefined,
    hasImageReferences: raw.hasImageReferences === true, hasVideoReference: raw.hasVideoReference === true,
    hasAudioReference: raw.hasAudioReference === true, requiresFirstFrame: raw.requiresFirstFrame === true,
    requiresLastFrame: raw.requiresLastFrame === true, requiresAudio: raw.requiresAudio === true,
    imageReferenceCount: typeof raw.imageReferenceCount === "number" ? raw.imageReferenceCount : undefined,
    previousJobId: typeof raw.previousJobId === "string" ? raw.previousJobId : undefined,
    previousModelId: typeof raw.previousModelId === "string" ? raw.previousModelId : undefined,
    requiresMask: raw.requiresMask === true, requiresSourceAudioPreservation: raw.requiresSourceAudioPreservation === true,
    upscaleFactor: typeof raw.upscaleFactor === 'number' ? raw.upscaleFactor : undefined, creativity: typeof raw.creativity === 'number' ? raw.creativity : undefined,
    upscaleSource: raw.upscaleSource as UpscaleSourceCertificate | undefined,
    editSource: raw.editSource as VideoEditSourceCertificate | undefined,
    lipSyncSource: raw.lipSyncSource as VideoRoutingRequest['lipSyncSource'],
    lipSyncPortrait: raw.lipSyncPortrait as VideoRoutingRequest['lipSyncPortrait'],
    audioPolicy: raw.audioPolicy as VideoRoutingRequest['audioPolicy'],
    maximumCostUsd: typeof raw.maximumCostUsd === "number" ? raw.maximumCostUsd : undefined,
  };
  const models: VideoModelCapabilities[] = catalog.map((model) => ({ ...model,
    reviewedOperations: model.reviewedOperations as VideoOperation[] | undefined,
    available: model.available && model.platformQuarantinedAt === undefined && Boolean(model.reviewedAt) && model.lastSeenAt >= Date.now() - VIDEO_CATALOG_MAX_AGE_MS
      && (!model.reviewedCatalogFingerprint || model.reviewedCatalogFingerprint === catalogFingerprint(model)),
  }));
  const selection = selectVideoRoute(request, models, policy ? { ...policy, updatedAt: policy.updatedAt } : undefined);
  if (selection.provider !== "openrouter" || selection.modelId !== args.modelId || selection.estimatedCostUsd === undefined) throw new Error("Refresh the reviewed video route before submitting this job.");
  return { estimatedCostUsd: selection.estimatedCostUsd, selection, request };
}


const upscaleShotArgs = { productionId: v.id('productions'), shotId: v.id('shots') };
type ReadCtx = QueryCtx | MutationCtx;

/** Resolve the exact immutable input bytes. Uploaded metadata/checksums are not
 * probe authority; storage system metadata is. */
export async function resolveUpscaleSourceCertificate(ctx: ReadCtx, args: { projectId: Id<'projects'>; referenceAssetIds: string[] }): Promise<UpscaleSourceCertificate> {
  if (args.referenceAssetIds.length !== 1) throw new Error('Upscaling requires exactly one project video source.');
  const assetId = ctx.db.normalizeId('assets', args.referenceAssetIds[0]);
  const asset = assetId ? await ctx.db.get(assetId) : null;
  if (!asset || asset.projectId !== args.projectId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !asset.mimeType?.startsWith('video/')) throw new Error('The upscale source is unavailable in this project.');
  const storage = await ctx.db.system.get('_storage', asset.storageId);
  const probe = await ctx.db.query('verifiedMediaProbes').withIndex('by_asset', q => q.eq('assetId', asset._id)).unique();
  if (!storage || !probe || probe.projectId !== args.projectId || probe.storageId !== asset.storageId || probe.checksum !== storage.sha256 || probe.byteSize !== storage.size || !storage.contentType?.startsWith('video/')) throw new Error('Measure the current stored video before requesting an upscale.');
  const source = { assetId: asset._id, storageId: asset.storageId, checksum: storage.sha256, byteSize: storage.size, width: probe.width, height: probe.height, durationSeconds: probe.durationSeconds };
  if (!validUpscaleSource(source) || !probe.videoCodec) throw new Error('Upscale source exceeds the certified duration, size or dimension limits.');
  return source;
}

export async function resolveVideoEditSourceCertificate(ctx: ReadCtx, args: { projectId: Id<'projects'>; referenceAssetIds: string[] }): Promise<VideoEditSourceCertificate> {
  if (args.referenceAssetIds.length !== 1) throw new Error('Editing requires exactly one project video source.');
  const assetId = ctx.db.normalizeId('assets', args.referenceAssetIds[0]);
  const asset = assetId ? await ctx.db.get(assetId) : null;
  if (!asset || asset.projectId !== args.projectId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !asset.mimeType?.startsWith('video/')) throw new Error('The edit source is unavailable in this project.');
  const storage = await ctx.db.system.get('_storage', asset.storageId);
  const probe = await ctx.db.query('verifiedMediaProbes').withIndex('by_asset', q => q.eq('assetId', asset._id)).unique();
  if (!storage || !probe || probe.projectId !== args.projectId || probe.storageId !== asset.storageId || probe.checksum !== storage.sha256 || probe.byteSize !== storage.size || !storage.contentType?.startsWith('video/')) throw new Error('Measure the current stored video before editing.');
  const source = { assetId: asset._id, storageId: asset.storageId, checksum: storage.sha256, byteSize: storage.size, width: probe.width, height: probe.height, durationSeconds: probe.durationSeconds, hasAudio: probe.hasAudio };
  if (!validVideoEditSource(source) || !probe.videoCodec) throw new Error('Edit source exceeds the documented15-second/50MiB limits.');
  return source;
}

async function upscaleProbeContext(ctx: ReadCtx, args: { productionId: Id<'productions'>; shotId: Id<'shots'> }, edit = false) {
  const production = await ctx.db.get(args.productionId);
  const shot = await ctx.db.get(args.shotId);
  if (!production?.projectId || !shot || shot.productionId !== production._id || shot.projectId !== production.projectId || shot.productionVersionId !== production.currentVersionId || (edit ? !isSourceVideoEdit(object(shot.metadata).operation) : object(shot.metadata).operation !== 'UPSCALE')) throw new Error('Choose a supported source-video shot in the current project production.');
  const access = await requireProjectRole(ctx, production.projectId, ['OWNER', 'EDITOR']);
  if (access.project.archivedAt || access.project.deletedAt || access.project.moderationStatus === 'RESTRICTED') throw new Error('Restore access to the project before measuring its media.');
  const version = production.currentVersionId ? await ctx.db.get(production.currentVersionId) : null;
  if (!version || version.productionId !== production._id || version.status !== 'APPROVED') throw new Error('Approve the current production before measuring its source video.');
  const continuity = await resolveGenerationContinuity(ctx, { projectId: access.project._id, productionId: production._id, snapshot: version.planningContextSnapshot, explicitResourceVersionIds: object(shot.metadata).resourceVersionIds, referenceAssetIds: shot.requiredAssetIds || [] });
  if (continuity.referenceAssetIds.length !== 1) throw new Error('Upscaling requires exactly one project video source.');
  const assetId = ctx.db.normalizeId('assets', continuity.referenceAssetIds[0]);
  const asset = assetId ? await ctx.db.get(assetId) : null;
  if (!asset || asset.projectId !== access.project._id || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !asset.mimeType?.startsWith('video/')) throw new Error('Choose a stored project video for upscaling.');
  const storage = await ctx.db.system.get('_storage', asset.storageId);
  if (!storage || storage.size <= 0 || storage.size > (edit ? 50 * 1024 * 1024 : 50_000_000) || !storage.contentType?.startsWith('video/')) throw new Error('The source video exceeds its documented size limit.');
  const cached = await ctx.db.query('verifiedMediaProbes').withIndex('by_asset', q => q.eq('assetId', asset._id)).unique();
  return { production, project: access.project, asset, storage, cached };
}

export const upscaleSourceContext = internalQuery({ args: upscaleShotArgs, returns: v.any(), handler: async (ctx, args) => {
  const context = await upscaleProbeContext(ctx, args);
  const url = await ctx.storage.getUrl(context.asset.storageId!);
  if (!url) throw new Error('The source video is unavailable.');
  const cached = context.cached && context.cached.storageId === context.asset.storageId && context.cached.checksum === context.storage.sha256 && context.cached.byteSize === context.storage.size;
  return { projectId: context.project._id, assetId: context.asset._id, storageId: context.asset.storageId, checksum: context.storage.sha256, byteSize: context.storage.size, url, ...(cached ? { source: await resolveUpscaleSourceCertificate(ctx, { projectId: context.project._id, referenceAssetIds: [context.asset._id] }) } : {}) };
} });

export const recordUpscaleSourceProbe = internalMutation({
  args: { ...upscaleShotArgs, assetId: v.id('assets'), storageId: v.id('_storage'), checksum: v.string(), byteSize: v.number(), probe: v.any() }, returns: v.any(),
  handler: async (ctx, args) => {
    const context = await upscaleProbeContext(ctx, args);
    if (context.asset._id !== args.assetId || context.asset.storageId !== args.storageId || context.storage.sha256 !== args.checksum || context.storage.size !== args.byteSize) throw new Error('The source storage changed while it was measured.');
    const probe = object(args.probe);
    const source = { assetId: args.assetId, storageId: args.storageId, checksum: args.checksum, byteSize: args.byteSize, width: Number(probe.width), height: Number(probe.height), durationSeconds: Number(probe.durationSeconds) };
    if (!validUpscaleSource(source) || typeof probe.videoCodec !== 'string' || !probe.videoCodec || probe.byteSize !== args.byteSize) throw new Error('Upscale source exceeds the certified duration, size or dimension limits.');
    const value = { projectId: context.project._id, ...source, videoCodec: probe.videoCodec, hasAudio: probe.hasAudio === true, ...(typeof probe.audioCodec === 'string' ? { audioCodec: probe.audioCodec } : {}), probedAt: Date.now() };
    if (context.cached) await ctx.db.patch(context.cached._id, value); else await ctx.db.insert('verifiedMediaProbes', value);
    return source;
  },
});

/** Authenticated, no inference: probe a canonical storage URL through the
 * existing renderer. Only the internal mutation can write the certificate. */
export const prepareUpscaleSource = action({ args: upscaleShotArgs, returns: v.any(), handler: async (ctx, args): Promise<UpscaleSourceCertificate> => {
  const refs = (internal as unknown as { videoRouting: Record<string, FunctionReference<any, 'internal', any, any>> }).videoRouting;
  const context = await ctx.runQuery(refs.upscaleSourceContext, args);
  if (context.source) return context.source;
  const base = process.env.RENDER_WORKER_URL?.trim();
  const secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim();
  if (!base || !secret) throw new Error('Source video measurement is not configured.');
  const response = await fetch(base.replace(/\/$/, '') + '/media/probe', { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret }, body: JSON.stringify({ url: context.url, kind: 'video' }), redirect: 'error', signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error('The source video could not be measured.');
  return ctx.runMutation(refs.recordUpscaleSourceProbe, { ...args, assetId: context.assetId, storageId: context.storageId, checksum: context.checksum, byteSize: context.byteSize, probe: await response.json() });
} });

export const editSourceContext = internalQuery({ args: upscaleShotArgs, returns: v.any(), handler: async (ctx, args) => {
  const context = await upscaleProbeContext(ctx, args, true);
  const url = await ctx.storage.getUrl(context.asset.storageId!);
  if (!url) throw new Error('The source video is unavailable.');
  const cached = context.cached && context.cached.storageId === context.asset.storageId && context.cached.checksum === context.storage.sha256 && context.cached.byteSize === context.storage.size;
  return { projectId: context.project._id, assetId: context.asset._id, storageId: context.asset.storageId, checksum: context.storage.sha256, byteSize: context.storage.size, url, ...(cached ? { source: await resolveVideoEditSourceCertificate(ctx, { projectId: context.project._id, referenceAssetIds: [context.asset._id] }) } : {}) };
} });
export const recordEditSourceProbe = internalMutation({
  args: { ...upscaleShotArgs, assetId: v.id('assets'), storageId: v.id('_storage'), checksum: v.string(), byteSize: v.number(), probe: v.any() }, returns: v.any(),
  handler: async (ctx, args) => {
    const context = await upscaleProbeContext(ctx, args, true);
    if (context.asset._id !== args.assetId || context.asset.storageId !== args.storageId || context.storage.sha256 !== args.checksum || context.storage.size !== args.byteSize) throw new Error('The source storage changed while it was measured.');
    const probe = object(args.probe);
    const source = { assetId: args.assetId, storageId: args.storageId, checksum: args.checksum, byteSize: args.byteSize, width: Number(probe.width), height: Number(probe.height), durationSeconds: Number(probe.durationSeconds), hasAudio: probe.hasAudio === true };
    if (!validVideoEditSource(source) || typeof probe.videoCodec !== 'string' || !probe.videoCodec || typeof probe.hasAudio !== 'boolean' || probe.byteSize !== args.byteSize) throw new Error('Edit source exceeds the documented 15-second/50MiB limits.');
    const value = { projectId: context.project._id, ...source, videoCodec: probe.videoCodec, ...(typeof probe.audioCodec === 'string' ? { audioCodec: probe.audioCodec } : {}), probedAt: Date.now() };
    if (context.cached) await ctx.db.patch(context.cached._id, value); else await ctx.db.insert('verifiedMediaProbes', value);
    return source;
  },
});
export const prepareEditSource = action({ args: upscaleShotArgs, returns: v.any(), handler: async (ctx, args): Promise<VideoEditSourceCertificate> => {
  const refs = (internal as unknown as { videoRouting: Record<string, FunctionReference<any, 'internal', any, any>> }).videoRouting;
  const context = await ctx.runQuery(refs.editSourceContext, args);
  if (context.source) return context.source;
  const base = process.env.RENDER_WORKER_URL?.trim(); const secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim();
  if (!base || !secret) throw new Error('Source video measurement is not configured.');
  const response = await fetch(base.replace(/\/$/, '') + '/media/probe', { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret }, body: JSON.stringify({ url: context.url, kind: 'video' }), redirect: 'error', signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error('The source video could not be measured.');
  return ctx.runMutation(refs.recordEditSourceProbe, { ...args, assetId: context.assetId, storageId: context.storageId, checksum: context.checksum, byteSize: context.byteSize, probe: await response.json() });
} });
