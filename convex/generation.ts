import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getProduction, now } from "./_shared";
import { requireMember } from "./authorization";

export const createJob = mutation({
  args: { productionId: v.id("productions"), shotId: v.id("shots"), provider: v.string(), model: v.string(), request: v.any(), estimatedCost: v.number(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const production = await getProduction(ctx, args.productionId.toString());
    const existing = await ctx.db.query("generationJobs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) return existing;
    const shot = await ctx.db.get(args.shotId);
    if (!shot) throw new Error("Shot not found");
    const shotVersionId = await ctx.db.insert("shotVersions", { shotId: shot._id, versionNumber: 1, status: "QUEUED", promptSnapshot: shot.prompt, contextSnapshot: { outputPreset: production.outputPreset } });
    const jobId = await ctx.db.insert("generationJobs", { productionId: production._id, shotId: shot._id, shotVersionId, studioExternalId: production.studioExternalId, modality: "VIDEO", provider: args.provider, model: args.model, request: args.request, status: "QUEUED", progress: 0, estimatedCost: args.estimatedCost, idempotencyKey: args.idempotencyKey, attemptCount: 0, createdAt: now(), updatedAt: now() });
    return await ctx.db.get(jobId);
  },
});

export const getShot = query({
  args: { productionId: v.id("productions"), shotId: v.id("shots") },
  handler: async (ctx, args) => {
    const production = await getProduction(ctx, args.productionId.toString());
    const shot = await ctx.db.get(args.shotId);
    if (!shot || shot.sceneId === undefined) throw new Error("Shot not found");
    return { production, shot };
  },
});

export const getJob = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Generation job not found");
    await requireMember(ctx, job.studioExternalId);
    const shot = await ctx.db.get(job.shotId);
    const production = await ctx.db.get(job.productionId);
    return { ...job, shot, production };
  },
});

export const markProcessing = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Generation job not found");
    await requireMember(ctx, job.studioExternalId);
    if (job.status !== "QUEUED") return job;
    await ctx.db.patch(job._id, { status: "PROCESSING", progress: 5, attemptCount: job.attemptCount + 1, startedAt: now(), updatedAt: now() });
    return await ctx.db.get(job._id);
  },
});

export const completeJob = mutation({
  args: { jobId: v.id("generationJobs"), assetUrl: v.string(), providerJobId: v.optional(v.string()), response: v.any() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Generation job not found");
    await requireMember(ctx, job.studioExternalId);
    const assetId = await ctx.db.insert("assets", { productionId: job.productionId, studioExternalId: job.studioExternalId, source: "AI_GENERATED", roles: ["GENERATED_VIDEO"], storageUrl: args.assetUrl, metadata: args.response, createdAt: now() });
    await ctx.db.patch(job.shotVersionId, { status: "COMPLETED", assetId });
    await ctx.db.patch(job.shotId, { status: "COMPLETED" });
    await ctx.db.patch(job._id, { status: "COMPLETED", progress: 100, providerJobId: args.providerJobId, response: args.response, completedAt: now(), updatedAt: now() });
    return { assetId, jobId: job._id };
  },
});

export const failJob = mutation({
  args: { jobId: v.id("generationJobs"), errorMessage: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Generation job not found");
    await requireMember(ctx, job.studioExternalId);
    await ctx.db.patch(job._id, { status: "FAILED", errorCode: "PROVIDER_ERROR", errorMessage: args.errorMessage, updatedAt: now() });
    await ctx.db.patch(job.shotVersionId, { status: "FAILED" });
    return true;
  },
});
