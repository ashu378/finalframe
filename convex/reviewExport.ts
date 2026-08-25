import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireMember } from "./authorization";
import { now } from "./_shared";

type ReadCtx = QueryCtx | MutationCtx;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredKey(value: string, label: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 200) throw new Error(`${label} must be between 8 and 200 characters.`);
  return key;
}

function requiredBody(value: string) {
  const body = value.trim();
  if (!body) throw new Error("A review comment cannot be empty.");
  if (body.length > 10_000) throw new Error("That review comment is too long.");
  return body;
}

async function authorizedReview(ctx: ReadCtx, reviewId: Id<"reviews">) {
  const review = await ctx.db.get(reviewId);
  if (!review) throw new Error("Review not found.");
  const member = await requireMember(ctx, review.studioExternalId);
  return { review, member };
}

async function authorizedProduction(ctx: ReadCtx, productionId: Id<"productions">) {
  const production = await ctx.db.get(productionId);
  if (!production) throw new Error("Production not found.");
  const member = await requireMember(ctx, production.studioExternalId);
  return { production, member };
}

export const getState = query({
  args: { productionId: v.id("productions") },
  handler: async (ctx, args) => {
    const { production } = await authorizedProduction(ctx, args.productionId);
    const reviews = await ctx.db.query("reviews").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    const review = reviews.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    const comments = review ? await ctx.db.query("comments").withIndex("by_review", (q) => q.eq("reviewId", review._id)).collect() : [];
    const approvals = await ctx.db.query("approvals").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    const exports = await ctx.db.query("exports").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    return { production, review, comments: comments.sort((a, b) => a.createdAt - b.createdAt), approvals: approvals.sort((a, b) => b.createdAt - a.createdAt), exports: exports.sort((a, b) => b.createdAt - a.createdAt) };
  },
});

export const requestReview = mutation({
  args: { productionId: v.id("productions"), manifestId: v.id("manifests"), idempotencyKey: v.string(), correlationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { production, member } = await authorizedProduction(ctx, args.productionId);
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest || manifest.productionId !== production._id || manifest.studioExternalId !== member.studio.externalId) throw new Error("Assembly manifest not found.");
    const manifestData = record(manifest.manifest);
    if (manifestData.version !== 3 || !manifestData.timelineId || !Array.isArray(manifestData.sourceIds)) throw new Error("This assembly manifest is not ready for review.");
    const key = requiredKey(args.idempotencyKey, "Review request key");
    const existingMarker = (await ctx.db.query("approvals").withIndex("by_resource", (q) => q.eq("resourceType", "reviewRequest").eq("resourceId", key)).collect()).find((approval) => approval.productionId === production._id);
    if (existingMarker?.note?.startsWith("reviewId:")) {
      const existing = await ctx.db.get(existingMarker.note.slice("reviewId:".length) as Id<"reviews">);
      if (existing) return existing;
    }
    const timestamp = now();
    const reviewId = await ctx.db.insert("reviews", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: production._id, status: "REQUESTED", requestedByUserId: member.user._id, createdAt: timestamp, updatedAt: timestamp });
    await ctx.db.insert("approvals", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: production._id, reviewId, resourceType: "reviewRequest", resourceId: key, decision: "REQUESTED", actorUserId: member.user._id, note: `reviewId:${reviewId.toString()}`, createdAt: timestamp });
    return await ctx.db.get(reviewId);
  },
});

export const addComment = mutation({
  args: { reviewId: v.id("reviews"), body: v.string(), timeSeconds: v.optional(v.number()), shotId: v.optional(v.id("shots")) },
  handler: async (ctx, args) => {
    const { review, member } = await authorizedReview(ctx, args.reviewId);
    if (review.status === "APPROVED") throw new Error("Approved reviews cannot receive new comments. Request a new revision instead.");
    if (args.timeSeconds !== undefined && (!Number.isFinite(args.timeSeconds) || args.timeSeconds < 0)) throw new Error("Comment time must be a valid positive timestamp.");
    const commentId = await ctx.db.insert("comments", { studioExternalId: member.studio.externalId, studioId: member.studio._id, reviewId: review._id, authorExternalId: member.identity.externalId, authorUserId: member.user._id, body: requiredBody(args.body), timeSeconds: args.timeSeconds, shotId: args.shotId, createdAt: now() });
    return await ctx.db.get(commentId);
  },
});

export const approve = mutation({
  args: { reviewId: v.id("reviews"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { review, member } = await authorizedReview(ctx, args.reviewId);
    if (review.status === "APPROVED") return review;
    if (review.status !== "REQUESTED" && review.status !== "CHANGES_REQUESTED") throw new Error("This review is not awaiting approval.");
    const timestamp = now();
    await ctx.db.patch(review._id, { status: "APPROVED", updatedAt: timestamp });
    await ctx.db.insert("approvals", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: review.productionId, reviewId: review._id, resourceType: "review", resourceId: review._id.toString(), decision: "APPROVED", actorUserId: member.user._id, note: args.note?.trim(), createdAt: timestamp });
    return await ctx.db.get(review._id);
  },
});

export const requestRevision = mutation({
  args: { reviewId: v.id("reviews"), note: v.string() },
  handler: async (ctx, args) => {
    const { review, member } = await authorizedReview(ctx, args.reviewId);
    const note = requiredBody(args.note);
    if (review.status === "APPROVED") throw new Error("This review is approved. Create a new review for another revision.");
    const timestamp = now();
    await ctx.db.patch(review._id, { status: "CHANGES_REQUESTED", updatedAt: timestamp });
    await ctx.db.insert("approvals", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: review.productionId, reviewId: review._id, resourceType: "review", resourceId: review._id.toString(), decision: "CHANGES_REQUESTED", actorUserId: member.user._id, note, createdAt: timestamp });
    return await ctx.db.get(review._id);
  },
});

export const requestExport = mutation({
  args: { productionId: v.id("productions"), manifestId: v.id("manifests"), reviewId: v.id("reviews"), preset: v.optional(v.string()), idempotencyKey: v.string(), correlationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { production, member } = await authorizedProduction(ctx, args.productionId);
    const manifest = await ctx.db.get(args.manifestId);
    const review = await ctx.db.get(args.reviewId);
    if (!manifest || manifest.productionId !== production._id || manifest.studioExternalId !== member.studio.externalId) throw new Error("Assembly manifest not found.");
    if (!review || review.productionId !== production._id || review.studioExternalId !== member.studio.externalId || review.status !== "APPROVED") throw new Error("Approve the review before requesting an export.");
    const manifestData = record(manifest.manifest);
    const manifestPreset = record(manifestData.preset);
    const exportPreset = args.preset?.trim() || String(manifestPreset.name ?? production.outputPreset);
    if (exportPreset !== String(manifestPreset.name ?? exportPreset)) throw new Error("The export preset must match the approved assembly manifest.");
    const key = requiredKey(args.idempotencyKey, "Export key");
    const existingJob = await ctx.db.query("renderJobs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key)).unique();
    if (existingJob) return { job: existingJob, export: (await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", existingJob._id)).collect())[0] ?? null, replayed: true };
    const timelineId = String(manifestData.timelineId ?? "") as Id<"timelines">;
    const timestamp = now();
    const requestHash = `${args.productionId}:${args.manifestId}:${args.reviewId}:${exportPreset}`;
    const jobId = await ctx.db.insert("renderJobs", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: production._id, timelineId, manifestId: manifest._id, operation: "EXPORT", preset: exportPreset, status: "QUEUED", idempotencyKey: key, requestHash, progress: 0, createdAt: timestamp, updatedAt: timestamp });
    const exportId = await ctx.db.insert("exports", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: production._id, renderJobId: jobId, manifestId: manifest._id, preset: exportPreset, status: "QUEUED", createdAt: timestamp });
    return { job: await ctx.db.get(jobId), export: await ctx.db.get(exportId), replayed: false };
  },
});

export const getExport = query({
  args: { exportId: v.id("exports") },
  handler: async (ctx, args) => {
    const exportRecord = await ctx.db.get(args.exportId);
    if (!exportRecord) throw new Error("Export not found.");
    await requireMember(ctx, exportRecord.studioExternalId);
    const url = exportRecord.storageId && exportRecord.status === "COMPLETED" ? await ctx.storage.getUrl(exportRecord.storageId) : undefined;
    return { ...exportRecord, downloadUrl: url };
  },
});
