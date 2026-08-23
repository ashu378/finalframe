import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMember } from "./authorization";

const timestamp = () => Date.now();

function getReservationId(request: unknown): Id<"creditReservations"> | null {
  if (!request || typeof request !== "object") return null;
  const marker = (request as { finalframe?: { reservationId?: unknown } }).finalframe?.reservationId;
  return typeof marker === "string" ? marker as Id<"creditReservations"> : null;
}

async function reserveInTransaction(ctx: Parameters<typeof mutation>[0] extends never ? never : any, studioExternalId: string, amount: number, idempotencyKey: string, generationJobId: Id<"generationJobs">) {
  const existing = await ctx.db.query("creditReservations").withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey)).unique();
  if (existing) return existing;
  const studio = await ctx.db.query("studios").withIndex("by_external_id", (q: any) => q.eq("externalId", studioExternalId)).unique();
  if (!studio || studio.credits < amount) throw new Error("Insufficient credits");
  const reservationId = await ctx.db.insert("creditReservations", { studioExternalId, generationJobId, amount, idempotencyKey, status: "RESERVED", expiresAt: timestamp() + 30 * 60 * 1000, createdAt: timestamp() });
  await ctx.db.patch(studio._id, { credits: studio.credits - amount, updatedAt: timestamp() });
  await ctx.db.insert("creditTransactions", { studioExternalId, delta: -amount, transactionType: "RESERVATION", source: "GENERATION", referenceId: reservationId.toString(), metadata: {}, createdAt: timestamp() });
  return await ctx.db.get(reservationId);
}

export const create = mutation({
  args: {
    productionId: v.id("productions"),
    shotId: v.id("shots"),
    provider: v.string(),
    model: v.string(),
    request: v.any(),
    estimatedCost: v.number(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const production = await ctx.db.get(args.productionId);
    if (!production) throw new Error("Production not found");
    await requireMember(ctx, production.studioExternalId);
    if (!Number.isInteger(args.estimatedCost) || args.estimatedCost <= 0) throw new Error("Estimated cost must be a positive integer");
    const existing = await ctx.db.query("generationJobs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) return existing;
    const shot = await ctx.db.get(args.shotId);
    if (!shot || shot.sceneId === undefined) throw new Error("Shot not found");
    const versions = await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", shot._id)).collect();
    const shotVersionId = await ctx.db.insert("shotVersions", { shotId: shot._id, versionNumber: versions.length + 1, status: "QUEUED", promptSnapshot: shot.prompt, contextSnapshot: { outputPreset: production.outputPreset, correlationId: args.correlationId } });
    const jobId = await ctx.db.insert("generationJobs", { productionId: production._id, shotId: shot._id, shotVersionId, studioExternalId: production.studioExternalId, modality: "VIDEO", provider: args.provider, model: args.model, request: args.request, status: "QUEUED", progress: 0, estimatedCost: args.estimatedCost, idempotencyKey: args.idempotencyKey, attemptCount: 0, createdAt: timestamp(), updatedAt: timestamp() });
    const reservation = await reserveInTransaction(ctx, production.studioExternalId, args.estimatedCost, `generation:${jobId.toString()}`, jobId);
    if (!reservation) throw new Error("Unable to reserve credits");
    await ctx.db.patch(jobId, { request: { ...((args.request && typeof args.request === "object") ? args.request : {}), finalframe: { reservationId: reservation._id.toString(), correlationId: args.correlationId } } });
    return await ctx.db.get(jobId);
  },
});

export const get = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Generation job not found");
    await requireMember(ctx, job.studioExternalId);
    return { job, shot: await ctx.db.get(job.shotId), production: await ctx.db.get(job.productionId) };
  },
});

export const claim = mutation({
  args: { jobId: v.id("generationJobs"), claimToken: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Generation job not found");
    await requireMember(ctx, job.studioExternalId);
    if (job.status !== "QUEUED") return job;
    await ctx.db.patch(job._id, { status: "PROCESSING", progress: 5, attemptCount: job.attemptCount + 1, startedAt: timestamp(), updatedAt: timestamp(), request: { ...(job.request as Record<string, unknown>), finalframe: { ...((job.request as Record<string, any>).finalframe || {}), claimToken: args.claimToken } } });
    return await ctx.db.get(job._id);
  },
});

export const complete = mutation({
  args: { jobId: v.id("generationJobs"), assetUrl: v.string(), response: v.any(), providerJobId: v.optional(v.string()), actualCost: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Generation job not found");
    await requireMember(ctx, job.studioExternalId);
    if (job.status === "COMPLETED") return { jobId: job._id, assetId: (job.response as { assetId?: string } | undefined)?.assetId };
    const assetId = await ctx.db.insert("assets", { productionId: job.productionId, studioExternalId: job.studioExternalId, source: "AI_GENERATED", roles: ["GENERATED_VIDEO"], storageUrl: args.assetUrl, metadata: { ...args.response, providerJobId: args.providerJobId, actualCost: args.actualCost }, provenance: { provider: job.provider, model: job.model, jobId: args.providerJobId }, createdAt: timestamp() });
    await ctx.db.patch(job.shotVersionId, { status: "COMPLETED", assetId });
    await ctx.db.patch(job.shotId, { status: "COMPLETED" });
    await ctx.db.patch(job._id, { status: "COMPLETED", progress: 100, providerJobId: args.providerJobId, response: { ...args.response, assetId: assetId.toString(), actualCost: args.actualCost }, completedAt: timestamp(), updatedAt: timestamp() });
    const reservationId = getReservationId(job.request);
    if (reservationId) await finalizeReservation(ctx, reservationId, job.studioExternalId, "COMMIT", args.actualCost);
    return { jobId: job._id, assetId };
  },
});

export const fail = mutation({
  args: { jobId: v.id("generationJobs"), errorCode: v.string(), errorMessage: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Generation job not found");
    await requireMember(ctx, job.studioExternalId);
    if (job.status === "FAILED" || job.status === "CANCELED") return job;
    await ctx.db.patch(job._id, { status: "FAILED", errorCode: args.errorCode, errorMessage: args.errorMessage, updatedAt: timestamp() });
    await ctx.db.patch(job.shotVersionId, { status: "FAILED" });
    const reservationId = getReservationId(job.request);
    if (reservationId) await finalizeReservation(ctx, reservationId, job.studioExternalId, "RELEASE");
    return await ctx.db.get(job._id);
  },
});

async function finalizeReservation(ctx: any, reservationId: Id<"creditReservations">, studioExternalId: string, outcome: "COMMIT" | "RELEASE", actualAmount?: number) {
  const reservation = await ctx.db.get(reservationId);
  if (!reservation || reservation.status !== "RESERVED") return;
  if (outcome === "RELEASE") {
    const studio = await ctx.db.query("studios").withIndex("by_external_id", (q: any) => q.eq("externalId", studioExternalId)).unique();
    if (studio) {
      await ctx.db.patch(studio._id, { credits: studio.credits + reservation.amount, updatedAt: timestamp() });
      await ctx.db.insert("creditTransactions", { studioExternalId, delta: reservation.amount, transactionType: "RELEASE", source: "GENERATION", referenceId: reservation._id.toString(), metadata: {}, createdAt: timestamp() });
    }
    await ctx.db.patch(reservation._id, { status: "RELEASED", releasedAt: timestamp() });
    return;
  }
  await ctx.db.patch(reservation._id, { status: "COMMITTED", committedAt: timestamp(), actualAmount });
}
