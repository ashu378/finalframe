import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireMember } from "./authorization";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { VIDEO_OPERATIONS, normalizeVideoType, selectVideoRoute, type VideoOperation, type VideoModelCapabilities, type VideoRoutingRequest } from "../src/lib/ai/video-routing";

function catalogFingerprint(model: { provider: string; modelId: string; supportedDurations: number[]; supportedResolutions: string[]; supportedAspectRatios: string[]; supportedSizes?: string[]; supportedParameters: string[] }) {
  // This is an identity/version marker, not a security hash. Its full canonical
  // representation avoids collisions and does not contain provider credentials.
  return JSON.stringify([model.provider, model.modelId, [...model.supportedDurations].sort((a, b) => a - b), [...model.supportedResolutions].sort(), [...model.supportedAspectRatios].sort(), [...(model.supportedSizes || [])].sort(), [...model.supportedParameters].sort()]);
}


const videoType = v.union(
  v.literal("ANIMATED_COMEDY_2D"), v.literal("REALISTIC_SKIT_UGC"), v.literal("PRODUCT_SAAS_LAUNCH"),
  v.literal("MOTION_GRAPHICS"), v.literal("EXPLAINER_STORY"), v.literal("CINEMATIC_FILM"),
  v.literal("MUSIC_VIDEO"), v.literal("SOCIAL_CUTDOWN"),
);
const qualityTier = v.union(v.literal("ECONOMY"), v.literal("STANDARD"), v.literal("PREMIUM"));
const path = v.union(v.literal("AI_VIDEO"), v.literal("MOTION_GRAPHICS"), v.literal("COMPOSITED"));

const catalogInput = v.object({
  provider: v.string(), modelId: v.string(), name: v.optional(v.string()),
  supportedDurations: v.array(v.number()), supportedResolutions: v.array(v.string()),
  supportedAspectRatios: v.array(v.string()), supportedSizes: v.optional(v.array(v.string())), supportedParameters: v.array(v.string()),
  estimatedCostPerSecond: v.optional(v.number()), pricingSkus: v.optional(v.record(v.string(), v.number())),
});

function validateCatalogInput(item: { provider: string; modelId: string; supportedDurations: number[]; supportedResolutions: string[]; supportedAspectRatios: string[]; supportedSizes?: string[]; supportedParameters: string[]; estimatedCostPerSecond?: number; pricingSkus?: Record<string, number> }) {
  if (item.provider !== "openrouter") throw new Error("Only models discovered through the configured provider can be saved.");
  if (!item.modelId.trim() || item.modelId.length > 200) throw new Error("Invalid model identifier.");
    if (item.supportedDurations.length > 32 || item.supportedResolutions.length > 32 || item.supportedAspectRatios.length > 32 || (item.supportedSizes?.length ?? 0) > 64 || item.supportedParameters.length > 100) throw new Error("Model capability data exceeds the allowed size.");
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
        provider: model.provider, modelId: model.modelId, name: model.name,
        supportedDurations: model.supportedDurations, supportedResolutions: model.supportedResolutions,
        supportedAspectRatios: model.supportedAspectRatios, supportedSizes: model.supportedSizes, supportedParameters: model.supportedParameters,
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
      if (!model || !model.available || !model.reviewedAt || model.lastSeenAt < Date.now() - 24 * 60 * 60 * 1000) throw new Error(`Model ${modelId} must be refreshed from the live catalog and capability-reviewed before activation.`);
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
    return { catalog, policy: policy ?? undefined };
  },
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
    maximumCostUsd: typeof raw.maximumCostUsd === "number" ? raw.maximumCostUsd : undefined,
  };
  const models: VideoModelCapabilities[] = catalog.map((model) => ({ ...model,
    reviewedOperations: model.reviewedOperations as VideoOperation[] | undefined,
    available: model.available && Boolean(model.reviewedAt) && model.lastSeenAt >= Date.now() - 24 * 60 * 60 * 1000
      && (!model.reviewedCatalogFingerprint || model.reviewedCatalogFingerprint === catalogFingerprint(model)),
  }));
  const selection = selectVideoRoute(request, models, policy ? { ...policy, updatedAt: policy.updatedAt } : undefined);
  if (selection.provider !== "openrouter" || selection.modelId !== args.modelId || selection.estimatedCostUsd === undefined) throw new Error("Refresh the reviewed video route before submitting this job.");
  return { estimatedCostUsd: selection.estimatedCostUsd, selection, request };
}
