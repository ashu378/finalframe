import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireMember } from "./authorization";
import { now } from "./_shared";

type RenderStatus = "QUEUED" | "PROCESSING" | "SUBMITTED" | "COMPLETED" | "RETRYING" | "FAILED" | "CANCELED";

const callbackArgs = {
  jobId: v.id("renderJobs"),
  leaseId: v.optional(v.string()),
  event: v.union(v.literal("SUBMITTED"), v.literal("PROGRESS"), v.literal("COMPLETED"), v.literal("FAILED")),
  rendererJobId: v.optional(v.string()),
  progress: v.optional(v.number()),
  storageId: v.optional(v.id("_storage")),
  checksum: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  errorCode: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  retryable: v.optional(v.boolean()),
  actualCost: v.optional(v.number()),
};

type CallbackInput = {
  jobId: Id<"renderJobs">;
  leaseId?: string;
  event: "SUBMITTED" | "PROGRESS" | "COMPLETED" | "FAILED";
  rendererJobId?: string;
  progress?: number;
  storageId?: Id<"_storage">;
  checksum?: string;
  mimeType?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  actualCost?: number;
};

function internalRef(name: string): any {
  return (internal as unknown as Record<string, Record<string, import("convex/server").SchedulableFunctionReference>>).renderJobs[name];
}

function hash(value: unknown) {
  const text = JSON.stringify(value);
  let result = 2166136261;
  for (const character of text) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619); }
  return (result >>> 0).toString(16);
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function assertLease(job: { leaseId?: string; leaseExpiresAt?: number }, leaseId?: string) {
  if (!job.leaseId) return;
  if (!leaseId || leaseId !== job.leaseId) throw new Error("This renderer lease is no longer valid.");
  if (job.leaseExpiresAt !== undefined && job.leaseExpiresAt <= now()) throw new Error("This renderer lease has expired.");
}

async function schedule(ctx: MutationCtx, name: string, delayMs: number, args: Record<string, unknown>) {
  await ctx.scheduler.runAfter(Math.max(0, delayMs), internalRef(name), args);
}

async function authorizedJob(ctx: Parameters<typeof mutation>[0] extends never ? never : any, jobId: Id<"renderJobs">) {
  const job = await ctx.db.get(jobId);
  if (!job) throw new Error("Render job not found.");
  const member = await requireMember(ctx, job.studioExternalId);
  return { job, member };
}

export const create = mutation({
  args: { productionId: v.id("productions"), manifestId: v.id("manifests"), timelineId: v.optional(v.id("timelines")), operation: v.optional(v.string()), preset: v.string(), idempotencyKey: v.string(), estimatedCost: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest || manifest.productionId !== args.productionId) throw new Error("Manifest not found.");
    const member = await requireMember(ctx, manifest.studioExternalId);
    if (args.timelineId) {
      const timeline = await ctx.db.get(args.timelineId);
      if (!timeline || timeline.productionId !== args.productionId || timeline.studioExternalId !== member.studio.externalId) throw new Error("Timeline not found.");
    }
    const idempotencyKey = args.idempotencyKey.trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) throw new Error("Idempotency key must be between 8 and 200 characters.");
    const requestHash = hash({ productionId: args.productionId, manifestId: args.manifestId, timelineId: args.timelineId, operation: args.operation ?? "RENDER", preset: args.preset });
    const existing = await ctx.db.query("renderJobs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey)).unique();
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.requestHash !== requestHash) throw new Error("Idempotency key is already used for a different render request.");
      return existing;
    }
    const timestamp = now();
    const jobId = await ctx.db.insert("renderJobs", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: args.productionId, timelineId: args.timelineId, manifestId: args.manifestId, operation: args.operation ?? "RENDER", preset: args.preset, status: "QUEUED", idempotencyKey, requestHash, progress: 0, estimatedCost: args.estimatedCost, createdAt: timestamp, updatedAt: timestamp });
    await schedule(ctx, "dispatch", 0, { jobId });
    return await ctx.db.get(jobId);
  },
});

export const get = query({
  args: { jobId: v.id("renderJobs") },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    const exportsForJob = await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", job._id)).collect();
    return { job, exports: exportsForJob };
  },
});

export const list = query({
  args: { productionId: v.id("productions"), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const production = await ctx.db.get(args.productionId);
    if (!production) throw new Error("Production not found.");
    await requireMember(ctx, production.studioExternalId);
    const jobs = await ctx.db.query("renderJobs").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).collect();
    const visible = jobs.filter((job) => !args.status || job.status === args.status).sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(visible.map(async (job) => {
      const exportRecord = (await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", job._id)).collect()).find((record) => record.status === "COMPLETED" && record.storageId);
      return { ...job, exportUrl: exportRecord?.storageId ? await ctx.storage.getUrl(exportRecord.storageId) : undefined };
    }));
  },
});

export const claim = mutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.optional(v.string()), leaseDurationMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    if (job.status !== "QUEUED" && job.status !== "RETRYING") throw new Error(`Render job cannot be claimed from ${job.status}.`);
    const leaseId = args.leaseId?.trim() || `${job._id}:${now()}`;
    const duration = Math.min(Math.max(args.leaseDurationMs ?? 5 * 60 * 1000, 30_000), 30 * 60 * 1000);
    const timestamp = now();
    await ctx.db.patch(job._id, { status: "PROCESSING", progress: Math.max(job.progress, 5), leaseId, leaseExpiresAt: timestamp + duration, startedAt: job.startedAt ?? timestamp, updatedAt: timestamp, errorCode: undefined, errorMessage: undefined });
    await schedule(ctx, "expireLease", duration, { jobId: job._id, leaseId });
    return { job: await ctx.db.get(job._id), leaseId };
  },
});

export const renewLease = mutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.string(), leaseDurationMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    assertLease(job, args.leaseId);
    if (job.status !== "PROCESSING" && job.status !== "SUBMITTED") throw new Error("Render job is not actively leased.");
    const duration = Math.min(Math.max(args.leaseDurationMs ?? 5 * 60 * 1000, 30_000), 30 * 60 * 1000);
    await ctx.db.patch(job._id, { leaseExpiresAt: now() + duration, updatedAt: now() });
    await schedule(ctx, "expireLease", duration, { jobId: job._id, leaseId: args.leaseId });
    return await ctx.db.get(job._id);
  },
});

export const callback = mutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.optional(v.string()), event: v.union(v.literal("SUBMITTED"), v.literal("PROGRESS"), v.literal("COMPLETED"), v.literal("FAILED")), rendererJobId: v.optional(v.string()), progress: v.optional(v.number()), storageId: v.optional(v.id("_storage")), checksum: v.optional(v.string()), mimeType: v.optional(v.string()), errorCode: v.optional(v.string()), errorMessage: v.optional(v.string()), retryable: v.optional(v.boolean()), actualCost: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { job, member } = await authorizedJob(ctx, args.jobId);
    if (job.status === "COMPLETED") return job;
    assertLease(job, args.leaseId);
    const timestamp = now();
    if (args.event === "SUBMITTED") {
      if (job.status !== "PROCESSING") throw new Error(`Render job cannot be submitted from ${job.status}.`);
      await ctx.db.patch(job._id, { status: "SUBMITTED", providerJobId: args.rendererJobId, progress: Math.max(job.progress, args.progress ?? 10), updatedAt: timestamp });
    } else if (args.event === "PROGRESS") {
      if (job.status !== "PROCESSING" && job.status !== "SUBMITTED") throw new Error(`Render progress is invalid from ${job.status}.`);
      await ctx.db.patch(job._id, { status: "PROCESSING", providerJobId: args.rendererJobId ?? job.providerJobId, progress: Math.min(99, Math.max(job.progress, args.progress ?? job.progress)), updatedAt: timestamp });
    } else if (args.event === "FAILED") {
      if (job.status !== "PROCESSING" && job.status !== "SUBMITTED" && job.status !== "RETRYING") throw new Error(`Render failure is invalid from ${job.status}.`);
      if (args.retryable) {
        await ctx.db.patch(job._id, { status: "RETRYING", errorCode: args.errorCode ?? "RENDER_RETRYABLE_FAILURE", errorMessage: args.errorMessage ?? "Renderer failed and will retry.", leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
        await schedule(ctx, "wake", 15_000, { jobId: job._id });
      } else {
        await ctx.db.patch(job._id, { status: "FAILED", errorCode: args.errorCode ?? "RENDER_FAILED", errorMessage: args.errorMessage ?? "Renderer failed.", leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
      }
    } else {
      if (job.status !== "PROCESSING" && job.status !== "SUBMITTED") throw new Error(`Render completion is invalid from ${job.status}.`);
      if (!args.storageId) throw new Error("A canonical Convex Storage export is required.");
      const storage = await ctx.db.system.get("_storage", args.storageId);
      if (!storage) throw new Error("Export storage object not found.");
      const existing = await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", job._id)).collect();
      if (!existing.length) await ctx.db.insert("exports", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: job.productionId, renderJobId: job._id, manifestId: job.manifestId, preset: job.preset, status: "COMPLETED", storageId: args.storageId, checksum: args.checksum ?? storage.sha256, mimeType: args.mimeType ?? storage.contentType, createdAt: timestamp, completedAt: timestamp });
      await ctx.db.patch(job._id, { status: "COMPLETED", progress: 100, providerJobId: args.rendererJobId ?? job.providerJobId, actualCost: args.actualCost, leaseId: undefined, leaseExpiresAt: undefined, completedAt: timestamp, updatedAt: timestamp });
    }
    return await ctx.db.get(job._id);
  },
});

export const retry = mutation({
  args: { jobId: v.id("renderJobs") },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    if (job.status !== "FAILED" && job.status !== "RETRYING") throw new Error(`Render job cannot be retried from ${job.status}.`);
    await ctx.db.patch(job._id, { status: "QUEUED", progress: 0, errorCode: undefined, errorMessage: undefined, leaseId: undefined, leaseExpiresAt: undefined, updatedAt: now() });
    await schedule(ctx, "dispatch", 0, { jobId: job._id });
    return await ctx.db.get(job._id);
  },
});

export const cancel = mutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.optional(v.string()), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    if (job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELED") return job;
    assertLease(job, args.leaseId);
    await ctx.db.patch(job._id, { status: "CANCELED", errorCode: "CANCELED", errorMessage: args.reason ?? "Canceled by the user.", leaseId: undefined, leaseExpiresAt: undefined, updatedAt: now() });
    return await ctx.db.get(job._id);
  },
});

export const wake = internalMutation({
  args: { jobId: v.id("renderJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "RETRYING") return job;
    await ctx.db.patch(job._id, { status: "QUEUED", updatedAt: now() });
    await schedule(ctx, "dispatch", 0, { jobId: job._id });
    return await ctx.db.get(job._id);
  },
});

export const prepareForRenderer = internalMutation({
  args: { jobId: v.id("renderJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || (job.status !== "QUEUED" && job.status !== "RETRYING")) return null;
    if (!job.manifestId) throw new Error("Render job has no manifest.");
    const manifest = await ctx.db.get(job.manifestId);
    if (!manifest) throw new Error("Render manifest not found.");
    const leaseId = `${job._id}:${now()}`;
    const timestamp = now();
    await ctx.db.patch(job._id, { status: "PROCESSING", progress: Math.max(job.progress, 5), leaseId, leaseExpiresAt: timestamp + 10 * 60 * 1000, startedAt: job.startedAt ?? timestamp, updatedAt: timestamp });
    await schedule(ctx, "expireLease", 10 * 60 * 1000, { jobId: job._id, leaseId });
    return { jobId: job._id, leaseId, idempotencyKey: job.idempotencyKey, manifest: manifest.manifest, uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const applyRendererCallback = internalMutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.optional(v.string()), event: v.union(v.literal("COMPLETED"), v.literal("FAILED")), rendererJobId: v.optional(v.string()), storageId: v.optional(v.id("_storage")), mimeType: v.optional(v.string()), checksum: v.optional(v.string()), errorCode: v.optional(v.string()), errorMessage: v.optional(v.string()), retryable: v.optional(v.boolean()), actualCost: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Render job not found.");
    if (job.status === "COMPLETED") return job;
    assertLease(job, args.leaseId);
    const timestamp = now();
    if (args.event === "FAILED") {
      if (args.retryable) {
        await ctx.db.patch(job._id, { status: "RETRYING", errorCode: args.errorCode ?? "RENDER_RETRYABLE_FAILURE", errorMessage: args.errorMessage ?? "Renderer failed and will retry.", leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
        await schedule(ctx, "wake", 15_000, { jobId: job._id });
      } else await ctx.db.patch(job._id, { status: "FAILED", errorCode: args.errorCode ?? "RENDER_FAILED", errorMessage: args.errorMessage ?? "Renderer failed.", leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
      return await ctx.db.get(job._id);
    }
    if (!args.storageId) throw new Error("Renderer completion is missing storageId.");
    const storage = await ctx.db.system.get("_storage", args.storageId);
    if (!storage) throw new Error("Export storage object not found.");
    const existing = await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", job._id)).collect();
    if (!existing.length) await ctx.db.insert("exports", { studioExternalId: job.studioExternalId, studioId: job.studioId, productionId: job.productionId, renderJobId: job._id, manifestId: job.manifestId, preset: job.preset, status: "COMPLETED", storageId: args.storageId, checksum: args.checksum ?? storage.sha256, mimeType: args.mimeType ?? storage.contentType, createdAt: timestamp, completedAt: timestamp });
    await ctx.db.patch(job._id, { status: "COMPLETED", progress: 100, providerJobId: args.rendererJobId ?? job.providerJobId, actualCost: args.actualCost, leaseId: undefined, leaseExpiresAt: undefined, completedAt: timestamp, updatedAt: timestamp });
    return await ctx.db.get(job._id);
  },
});

export const dispatch = internalAction({
  args: { jobId: v.id("renderJobs") },
  handler: async (ctx, args): Promise<unknown> => {
    const prepared = await ctx.runMutation(internalRef("prepareForRenderer"), { jobId: args.jobId });
    if (!prepared) return null;
    const rendererUrl = process.env.RENDER_WORKER_URL;
    const secret = process.env.RENDER_WORKER_SHARED_SECRET;
    if (!rendererUrl || !secret) throw new Error("Renderer URL and shared secret are not configured.");
    const callbackUrl = `${process.env.CONVEX_SITE_URL ?? ""}/renderer/callback`;
    const response = await fetch(`${rendererUrl.replace(/\/$/, "")}/render`, { method: "POST", headers: { "content-type": "application/json", "x-finalframe-worker-secret": secret }, body: JSON.stringify({ jobId: prepared.jobId, idempotencyKey: prepared.idempotencyKey, manifest: prepared.manifest, storageUploadUrl: prepared.uploadUrl, callbackUrl, leaseId: prepared.leaseId, attempt: 1 }) });
    if (!response.ok) throw new Error(`Renderer submission failed with HTTP ${response.status}.`);
    return { jobId: prepared.jobId };
  },
});

export const expireLease = internalMutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "PROCESSING" && job.status !== "SUBMITTED" || job.leaseId !== args.leaseId || !job.leaseExpiresAt || job.leaseExpiresAt > now()) return job;
    await ctx.db.patch(job._id, { status: "RETRYING", errorCode: "RENDER_LEASE_EXPIRED", errorMessage: "Renderer lease expired; retry scheduled.", leaseId: undefined, leaseExpiresAt: undefined, updatedAt: now() });
    await schedule(ctx, "wake", 15_000, { jobId: job._id });
    return await ctx.db.get(job._id);
  },
});
