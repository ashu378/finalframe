import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { SchedulableFunctionReference } from "convex/server";
import { v } from "convex/values";
import { requireMember } from "./authorization";
import { getProduction, now } from "./_shared";

type ReadCtx = QueryCtx | MutationCtx;
type JobStatus = "QUEUED" | "PROCESSING" | "SUBMITTED" | "PENDING" | "RETRYING" | "COMPLETED" | "FAILED" | "CANCELED";
const MAX_ATTEMPTS = 5;
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_MS = 15 * 1000;

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function serialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  const valueObject = value as Record<string, unknown>;
  return `{${Object.keys(valueObject).sort().map((key) => `${JSON.stringify(key)}:${serialize(valueObject[key])}`).join(",")}}`;
}

function hash(value: unknown) {
  let result = 2166136261;
  for (const character of serialize(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

function key(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 200) throw new Error("Idempotency key must be between 8 and 200 characters.");
  return trimmed;
}

function transition(from: string, to: JobStatus) {
  const transitions: Record<string, JobStatus[]> = {
    QUEUED: ["PROCESSING", "CANCELED"],
    RETRYING: ["QUEUED", "PROCESSING", "CANCELED"],
    PROCESSING: ["SUBMITTED", "PENDING", "COMPLETED", "RETRYING", "FAILED", "CANCELED"],
    SUBMITTED: ["PENDING", "COMPLETED", "RETRYING", "FAILED", "CANCELED"],
    PENDING: ["PENDING", "COMPLETED", "RETRYING", "FAILED", "CANCELED"],
  };
  if (!transitions[from]?.includes(to)) throw new Error(`Invalid generation job transition: ${from} -> ${to}`);
}

function internalRef(name: string) {
  return (internal as unknown as Record<string, Record<string, SchedulableFunctionReference>>).generationJobs[name];
}

async function scheduleWake(ctx: MutationCtx, jobId: Id<"generationJobs">, delayMs: number) {
  await ctx.scheduler.runAfter(Math.max(delayMs, 0), internalRef("wake"), { jobId });
}

async function leaseExpiry(ctx: MutationCtx, jobId: Id<"generationJobs">, leaseId: string, delayMs: number) {
  await ctx.scheduler.runAfter(Math.max(delayMs, 0), internalRef("expireLease"), { jobId, leaseId });
}

async function authorizedJob(ctx: ReadCtx, jobId: Id<"generationJobs">) {
  const job = await ctx.db.get(jobId);
  if (!job) throw new Error("Generation job not found.");
  const member = await requireMember(ctx, job.studioExternalId);
  return { job, member };
}

async function authorizedShot(ctx: ReadCtx, productionId: Id<"productions">, shotId: Id<"shots">) {
  const production = await getProduction(ctx, productionId.toString());
  const shot = await ctx.db.get(shotId);
  if (!shot || (shot.productionId !== undefined && shot.productionId !== production._id)) throw new Error("Shot not found.");
  const scene = await ctx.db.get(shot.sceneId);
  if (!scene || (scene.productionId !== undefined && scene.productionId !== production._id)) throw new Error("Shot not found.");
  if (shot.studioExternalId && shot.studioExternalId !== production.studioExternalId) throw new Error("Shot is not owned by this studio.");
  if (scene.studioExternalId && scene.studioExternalId !== production.studioExternalId) throw new Error("Scene is not owned by this studio.");
  return { production, shot };
}

async function attempt(ctx: ReadCtx, jobId: Id<"generationJobs">, attemptNumber: number) {
  return await ctx.db.query("attempts").withIndex("by_job_attempt", (q) => q.eq("generationJobId", jobId).eq("attemptNumber", attemptNumber)).unique();
}

function assertLease(job: { leaseId?: string; leaseExpiresAt?: number }, leaseId?: string) {
  if (!job.leaseId) return;
  if (!leaseId || leaseId !== job.leaseId) throw new Error("This worker lease is no longer valid.");
  if (job.leaseExpiresAt !== undefined && job.leaseExpiresAt <= now()) throw new Error("This worker lease has expired.");
}

export const create = mutation({
  args: {
    productionId: v.id("productions"), shotId: v.id("shots"), provider: v.string(), model: v.string(), request: v.any(), estimatedCost: v.number(), idempotencyKey: v.string(),
    modality: v.optional(v.string()), capability: v.optional(v.string()), modelVersion: v.optional(v.string()), correlationId: v.optional(v.string()),
    reservationId: v.optional(v.id("creditReservations")), canonicalReservationId: v.optional(v.id("reservations")),
  },
  handler: async (ctx, args) => {
    const idempotencyKey = key(args.idempotencyKey);
    if (!Number.isFinite(args.estimatedCost) || args.estimatedCost < 0) throw new Error("Estimated cost must be zero or greater.");
    const { production, shot } = await authorizedShot(ctx, args.productionId, args.shotId);
    const requestHash = hash({ productionId: args.productionId, shotId: args.shotId, provider: args.provider, model: args.model, request: args.request, estimatedCost: args.estimatedCost });
    const existing = await ctx.db.query("generationJobs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey)).unique();
    if (existing) {
      if (existing.studioExternalId !== production.studioExternalId || existing.requestHash !== requestHash) throw new Error("Idempotency key is already used for a different generation request.");
      return existing;
    }
    const versions = await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", shot._id)).collect();
    const timestamp = now();
    const shotVersionId = await ctx.db.insert("shotVersions", { studioExternalId: production.studioExternalId, studioId: production.studioId, productionId: production._id, shotId: shot._id, versionNumber: Math.max(0, ...versions.map((version) => version.versionNumber)) + 1, status: "QUEUED", promptSnapshot: shot.prompt, contextSnapshot: { outputPreset: production.outputPreset, requestHash }, provider: args.provider, model: args.model, createdAt: timestamp });
    const jobId = await ctx.db.insert("generationJobs", { studioExternalId: production.studioExternalId, studioId: production.studioId, productionId: production._id, shotId: shot._id, shotVersionId, operation: "SHOT_GENERATION", capability: args.capability, modality: args.modality ?? "VIDEO", provider: args.provider, model: args.model, modelVersion: args.modelVersion, request: args.request, status: "QUEUED", progress: 0, estimatedCost: args.estimatedCost, idempotencyKey, requestHash, reservationId: args.reservationId, canonicalReservationId: args.canonicalReservationId, correlationId: args.correlationId, attemptCount: 0, createdAt: timestamp, updatedAt: timestamp });
    await ctx.db.patch(shot._id, { status: "QUEUED" });
    await scheduleWake(ctx, jobId, 0);
    return await ctx.db.get(jobId);
  },
});

export const get = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    const [shot, production, attempts] = await Promise.all([ctx.db.get(job.shotId), ctx.db.get(job.productionId), ctx.db.query("attempts").withIndex("by_job", (q) => q.eq("generationJobId", job._id)).collect()]);
    return { job, shot, production, attempts: attempts.sort((left, right) => left.attemptNumber - right.attemptNumber) };
  },
});

export const list = query({
  args: { productionId: v.id("productions"), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const production = await ctx.db.get(args.productionId);
    if (!production) throw new Error("Production not found.");
    await requireMember(ctx, production.studioExternalId);
    const jobs = await ctx.db.query("generationJobs").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).collect();
    return jobs.filter((job) => !args.status || job.status === args.status).sort((left, right) => right.createdAt - left.createdAt);
  },
});

export const claim = mutation({
  args: { jobId: v.id("generationJobs"), leaseId: v.optional(v.string()), leaseDurationMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    const timestamp = now();
    if (job.status === "PROCESSING" && job.leaseExpiresAt && job.leaseExpiresAt > timestamp) return job;
    if (job.status !== "QUEUED" && job.status !== "RETRYING") throw new Error(`Job cannot be claimed from ${job.status}.`);
    if (job.nextAttemptAt !== undefined && job.nextAttemptAt > timestamp) throw new Error("Retry backoff is still active.");
    const leaseId = args.leaseId?.trim() || `${job._id}:${job.attemptCount + 1}:${timestamp}`;
    const leaseDurationMs = Math.min(Math.max(args.leaseDurationMs ?? DEFAULT_LEASE_MS, 30_000), 30 * 60 * 1000);
    const attemptNumber = job.attemptCount + 1;
    transition(job.status, "PROCESSING");
    const attemptId = await ctx.db.insert("attempts", { studioExternalId: job.studioExternalId, studioId: job.studioId, generationJobId: job._id, attemptNumber, status: "PROCESSING", provider: job.provider, requestHash: job.requestHash, startedAt: timestamp, createdAt: timestamp });
    await ctx.db.patch(job._id, { status: "PROCESSING", progress: Math.max(job.progress, 5), attemptCount: attemptNumber, leaseId, leaseExpiresAt: timestamp + leaseDurationMs, startedAt: timestamp, updatedAt: timestamp, errorCode: undefined, errorMessage: undefined, nextAttemptAt: undefined });
    await ctx.db.patch(job.shotVersionId, { status: "PROCESSING" });
    await ctx.db.patch(job.shotId, { status: "PROCESSING" });
    await leaseExpiry(ctx, job._id, leaseId, leaseDurationMs);
    return { job: await ctx.db.get(job._id), attempt: await ctx.db.get(attemptId), leaseId };
  },
});

export const renewLease = mutation({
  args: { jobId: v.id("generationJobs"), leaseId: v.string(), leaseDurationMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    assertLease(job, args.leaseId);
    if (job.status !== "PROCESSING" && job.status !== "SUBMITTED" && job.status !== "PENDING") throw new Error("Job is not actively leased.");
    const duration = Math.min(Math.max(args.leaseDurationMs ?? DEFAULT_LEASE_MS, 30_000), 30 * 60 * 1000);
    await ctx.db.patch(job._id, { leaseExpiresAt: now() + duration, updatedAt: now() });
    await leaseExpiry(ctx, job._id, args.leaseId, duration);
    return await ctx.db.get(job._id);
  },
});

export const submit = mutation({
  args: { jobId: v.id("generationJobs"), leaseId: v.string(), providerJobId: v.string(), response: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    assertLease(job, args.leaseId);
    if (job.status !== "PROCESSING") throw new Error(`Job cannot be submitted from ${job.status}.`);
    transition(job.status, "SUBMITTED");
    const current = await attempt(ctx, job._id, job.attemptCount);
    const timestamp = now();
    if (current) await ctx.db.patch(current._id, { status: "SUBMITTED", providerJobId: args.providerJobId, response: args.response });
    await ctx.db.patch(job._id, { status: "SUBMITTED", providerJobId: args.providerJobId, response: args.response, progress: Math.max(job.progress, 10), updatedAt: timestamp });
    return await ctx.db.get(job._id);
  },
});

export const poll = mutation({
  args: { jobId: v.id("generationJobs"), leaseId: v.string(), progress: v.optional(v.number()), response: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    assertLease(job, args.leaseId);
    if (job.status !== "SUBMITTED" && job.status !== "PENDING") throw new Error(`Job cannot be polled from ${job.status}.`);
    const current = await attempt(ctx, job._id, job.attemptCount);
    const timestamp = now();
    if (current) await ctx.db.patch(current._id, { status: "PENDING", response: args.response });
    await ctx.db.patch(job._id, { status: "PENDING", progress: Math.min(95, Math.max(job.progress, args.progress ?? job.progress)), response: args.response ?? job.response, updatedAt: timestamp });
    return await ctx.db.get(job._id);
  },
});

export const succeed = mutation({
  args: { jobId: v.id("generationJobs"), leaseId: v.optional(v.string()), assetId: v.optional(v.id("assets")), assetUrl: v.optional(v.string()), providerJobId: v.optional(v.string()), response: v.optional(v.any()), actualCost: v.optional(v.number()), qc: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    if (job.status === "COMPLETED") return { jobId: job._id, assetId: object(job.response).assetId };
    assertLease(job, args.leaseId);
    if (job.status !== "PROCESSING" && job.status !== "SUBMITTED" && job.status !== "PENDING") throw new Error(`Job cannot complete from ${job.status}.`);
    if (!args.assetId) throw new Error("A canonical Convex Storage asset is required before a job can succeed.");
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.studioExternalId !== job.studioExternalId || asset.productionId !== job.productionId) throw new Error("Output asset is not owned by this production.");
    if (!asset.storageId) throw new Error("The output asset is not backed by canonical Convex Storage.");
    const qc = object(args.qc);
    if (qc.status !== "PASS" && qc.status !== "PASS_WITH_WARNINGS") throw new Error("Quality checks must pass before this take can be marked complete.");
    const current = await attempt(ctx, job._id, job.attemptCount);
    const timestamp = now();
    const response = { ...object(args.response), assetId: args.assetId.toString(), providerJobId: args.providerJobId ?? job.providerJobId, actualCost: args.actualCost, qc };
    if (current) await ctx.db.patch(current._id, { status: "COMPLETED", providerJobId: args.providerJobId ?? job.providerJobId, response, completedAt: timestamp });
    await ctx.db.patch(job.shotVersionId, { status: "COMPLETED", assetId: args.assetId, actualCost: args.actualCost });
    await ctx.db.patch(job.shotId, { status: "COMPLETED" });
    await ctx.db.patch(job._id, { status: "COMPLETED", progress: 100, providerJobId: args.providerJobId ?? job.providerJobId, response, actualCost: args.actualCost, completedAt: timestamp, leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
    return { jobId: job._id, assetId: args.assetId };
  },
});

export const fail = mutation({
  args: { jobId: v.id("generationJobs"), errorCode: v.optional(v.string()), errorMessage: v.string(), retryable: v.optional(v.boolean()), retryAfterMs: v.optional(v.number()), leaseId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    if (job.status === "FAILED" || job.status === "CANCELED" || job.status === "COMPLETED") return job;
    assertLease(job, args.leaseId);
    if (job.status !== "PROCESSING" && job.status !== "SUBMITTED" && job.status !== "PENDING" && job.status !== "RETRYING") throw new Error(`Job cannot fail from ${job.status}.`);
    const retryable = args.retryable === true && job.attemptCount < MAX_ATTEMPTS;
    const timestamp = now();
    const current = await attempt(ctx, job._id, job.attemptCount);
    if (current) await ctx.db.patch(current._id, { status: retryable ? "RETRYING" : "FAILED", errorCode: args.errorCode ?? "PROVIDER_ERROR", errorMessage: args.errorMessage, retryable, completedAt: timestamp });
    if (retryable) {
      const delay = Math.min(Math.max(args.retryAfterMs ?? DEFAULT_RETRY_MS, 1_000), 60 * 60 * 1000);
      await ctx.db.patch(job._id, { status: "RETRYING", progress: 0, errorCode: args.errorCode ?? "RETRYABLE_PROVIDER_ERROR", errorMessage: args.errorMessage, nextAttemptAt: timestamp + delay, leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
      await ctx.db.patch(job.shotVersionId, { status: "RETRYING" });
      await ctx.db.patch(job.shotId, { status: "RETRYING" });
      await scheduleWake(ctx, job._id, delay);
    } else {
      await ctx.db.patch(job._id, { status: "FAILED", errorCode: args.errorCode ?? "PROVIDER_ERROR", errorMessage: args.errorMessage, leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
      await ctx.db.patch(job.shotVersionId, { status: "FAILED" });
      await ctx.db.patch(job.shotId, { status: "FAILED" });
    }
    return await ctx.db.get(job._id);
  },
});

export const cancel = mutation({
  args: { jobId: v.id("generationJobs"), leaseId: v.optional(v.string()), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    if (job.status === "CANCELED" || job.status === "FAILED" || job.status === "COMPLETED") return job;
    assertLease(job, args.leaseId);
    if (!["QUEUED", "RETRYING", "PROCESSING", "SUBMITTED", "PENDING"].includes(job.status)) throw new Error(`Job cannot be canceled from ${job.status}.`);
    const current = await attempt(ctx, job._id, job.attemptCount);
    const timestamp = now();
    if (current && current.status !== "COMPLETED" && current.status !== "FAILED") await ctx.db.patch(current._id, { status: "CANCELED", errorCode: "CANCELED", errorMessage: args.reason ?? "Canceled by the user.", completedAt: timestamp, retryable: false });
    await ctx.db.patch(job._id, { status: "CANCELED", errorCode: "CANCELED", errorMessage: args.reason ?? "Canceled by the user.", leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
    await ctx.db.patch(job.shotVersionId, { status: "CANCELED" });
    await ctx.db.patch(job.shotId, { status: "CANCELED" });
    return await ctx.db.get(job._id);
  },
});

export const retry = mutation({
  args: { jobId: v.id("generationJobs"), retryAfterMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    if (job.status === "COMPLETED" || job.status === "CANCELED") throw new Error(`Job cannot be retried from ${job.status}.`);
    if (job.attemptCount >= MAX_ATTEMPTS) throw new Error("Maximum generation attempts reached.");
    const current = await attempt(ctx, job._id, job.attemptCount);
    if (job.status === "FAILED" && current?.retryable !== true) throw new Error("This failure is not marked retryable.");
    const delay = Math.min(Math.max(args.retryAfterMs ?? 0, 0), 60 * 60 * 1000);
    const timestamp = now();
    await ctx.db.patch(job._id, { status: delay ? "RETRYING" : "QUEUED", progress: 0, nextAttemptAt: delay ? timestamp + delay : undefined, leaseId: undefined, leaseExpiresAt: undefined, errorCode: undefined, errorMessage: undefined, updatedAt: timestamp });
    await ctx.db.patch(job.shotVersionId, { status: delay ? "RETRYING" : "QUEUED" });
    await ctx.db.patch(job.shotId, { status: delay ? "RETRYING" : "QUEUED" });
    await scheduleWake(ctx, job._id, delay);
    return await ctx.db.get(job._id);
  },
});

export const scheduleSweep = mutation({
  args: { studioExternalId: v.string(), delayMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.studioExternalId);
    const delay = Math.min(Math.max(args.delayMs ?? 0, 0), 60 * 60 * 1000);
    await ctx.scheduler.runAfter(delay, internalRef("sweepExpiredLeases"), { studioExternalId: args.studioExternalId });
    return { scheduled: true, delayMs: delay };
  },
});

export const wake = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "RETRYING" || (job.nextAttemptAt !== undefined && job.nextAttemptAt > now())) return job;
    const timestamp = now();
    await ctx.db.patch(job._id, { status: "QUEUED", nextAttemptAt: undefined, updatedAt: timestamp });
    await ctx.db.patch(job.shotVersionId, { status: "QUEUED" });
    await ctx.db.patch(job.shotId, { status: "QUEUED" });
    return await ctx.db.get(job._id);
  },
});

export const expireLease = internalMutation({
  args: { jobId: v.id("generationJobs"), leaseId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.leaseId !== args.leaseId || job.status !== "PROCESSING" || !job.leaseExpiresAt || job.leaseExpiresAt > now()) return job;
    const current = await attempt(ctx, job._id, job.attemptCount);
    const timestamp = now();
    const retryable = job.attemptCount < MAX_ATTEMPTS;
    if (current) await ctx.db.patch(current._id, { status: retryable ? "RETRYING" : "FAILED", errorCode: "LEASE_EXPIRED", errorMessage: "The worker lease expired before completion.", retryable, completedAt: timestamp });
    if (retryable) {
      await ctx.db.patch(job._id, { status: "RETRYING", progress: 0, errorCode: "LEASE_EXPIRED", errorMessage: "The worker lease expired before completion.", nextAttemptAt: timestamp + DEFAULT_RETRY_MS, leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
      await ctx.db.patch(job.shotVersionId, { status: "RETRYING" });
      await ctx.db.patch(job.shotId, { status: "RETRYING" });
      await scheduleWake(ctx, job._id, DEFAULT_RETRY_MS);
    } else {
      await ctx.db.patch(job._id, { status: "FAILED", errorCode: "LEASE_EXPIRED_MAX_ATTEMPTS", errorMessage: "The worker lease expired after the maximum number of attempts.", leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
      await ctx.db.patch(job.shotVersionId, { status: "FAILED" });
      await ctx.db.patch(job.shotId, { status: "FAILED" });
    }
    return await ctx.db.get(job._id);
  },
});

export const sweepExpiredLeases = internalMutation({
  args: { studioExternalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const jobs = await ctx.db.query("generationJobs").withIndex("by_status", (q) => q.eq("status", "PROCESSING")).collect();
    const expired = jobs.filter((job) => (!args.studioExternalId || job.studioExternalId === args.studioExternalId) && job.leaseId && job.leaseExpiresAt !== undefined && job.leaseExpiresAt <= now());
    for (const job of expired) await ctx.scheduler.runAfter(0, internalRef("expireLease"), { jobId: job._id, leaseId: job.leaseId! });
    return { scheduled: expired.length };
  },
});
