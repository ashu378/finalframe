import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireMember, requireProjectRole } from "./authorization";
import { now } from "./_shared";
import { validateLockedManifest } from "../renderer/src/manifest";
import { dispatchCanRun, publicRenderJob, RENDER_DISPATCH_LEASE_MS, RENDER_FIXTURE_MARKER, RENDER_LEASE_MS, RENDER_MAX_ATTEMPTS, RENDER_RETRY_MS, RENDER_TERMINAL, renderWorkerEnabled, safeRenderError } from "./renderWorkerContracts";

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

async function authorizedJob(ctx: MutationCtx | QueryCtx, jobId: Id<"renderJobs">, write = false) {
  const job = await ctx.db.get(jobId);
  if (!job) throw new Error("Render job not found.");
  const member = await requireMember(ctx, job.studioExternalId);
  if (!job.projectId) throw new Error("Render job must belong to a project.");
  await requireProjectRole(ctx, job.projectId, write ? ["OWNER", "EDITOR"] : ["OWNER", "EDITOR", "REVIEWER", "VIEWER"]);
  return { job, member };
}

type RenderJob = Doc<"renderJobs">;
type ReadCtx = MutationCtx | QueryCtx;

async function requireLegacyFixtureLease(ctx: ReadCtx, job: RenderJob) {
  const project = job.projectId ? await ctx.db.get(job.projectId) : null;
  if (renderWorkerEnabled() || process.env.FINALFRAME_DEV_FIXTURES !== "true" || process.env.FINALFRAME_DEV_FIXTURE_ENV !== "development" || !project || object(project.metadata).fixtureMarker !== "finalframe-dev-fixture-v1") throw new Error("Renderer leases are managed internally.");
}

async function updateExports(ctx: MutationCtx, jobId: Id<"renderJobs">, status: "QUEUED" | "PROCESSING" | "FAILED" | "CANCELED", progress: number) {
  const job = await ctx.db.get(jobId);
  if (!job) return;
  const rows = await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", jobId)).take(20);
  if (!rows.length) {
    await ctx.db.insert("exports", { studioExternalId: job.studioExternalId, studioId: job.studioId, projectId: job.projectId, productionId: job.productionId, renderJobId: job._id, manifestId: job.manifestId, selectionScope: job.selectionScope, exportScope: job.exportScope, preset: job.preset, status, progress, createdAt: now() });
  } else for (const row of rows) if (row.status !== "COMPLETED") await ctx.db.patch(row._id, { status, progress, errorMessage: undefined });
}

async function internalProject(ctx: ReadCtx, job: RenderJob) {
  const [project, production] = await Promise.all([job.projectId ? ctx.db.get(job.projectId) : null, ctx.db.get(job.productionId)]);
  if (!project || project.deletedAt || project.archivedAt || !production || production.projectId !== project._id || project.studioExternalId !== job.studioExternalId) throw new Error("Render project ownership is unavailable.");
  const actor = job.createdByUserId ? await ctx.db.get(job.createdByUserId) : null;
  const membership = actor ? await ctx.db.query("projectMembers").withIndex("by_project_user", (q) => q.eq("projectId", project._id).eq("userId", actor._id)).unique() : null;
  const ownsProject = actor && (project.ownerUserId === actor._id || project.createdByUserId === actor._id);
  if (!actor || actor.status === "disabled" || (membership ? membership.status !== "ACTIVE" || !["OWNER", "EDITOR"].includes(membership.role) : !ownsProject)) throw new Error("Render permission has changed.");
  return { project, production };
}

async function approvedState(ctx: ReadCtx, projectId: Id<"projects">, resourceType: string, resourceId: string) {
  const state = await ctx.db.query("resourceStates").withIndex("by_project_resource", (q) => q.eq("projectId", projectId).eq("resourceType", resourceType).eq("resourceId", resourceId)).unique();
  if (!state || (state.state !== "APPROVED" && state.state !== "LOCKED")) throw new Error("An export source needs approval.");
}

/** Refresh only project-owned canonical media. URL strings in a persisted
 * manifest are never accepted as authority to fetch arbitrary network media. */
async function authorizedManifest(ctx: MutationCtx, job: RenderJob) {
  const { project } = await internalProject(ctx, job);
  const stored = job.manifestId ? await ctx.db.get(job.manifestId) : null;
  if (!stored || stored.productionId !== job.productionId || stored.projectId !== project._id || stored.contractVersion !== 4) throw new Error("Canonical render manifest is unavailable.");
  const raw = object(stored.manifest);
  if (raw.version !== 4 || raw.projectId !== project._id || raw.productionId !== job.productionId || raw.manifestId !== stored._id) throw new Error("Render manifest ownership is invalid.");
  const timelineId = typeof raw.timelineId === "string" ? ctx.db.normalizeId("timelines", raw.timelineId) : null;
  const timeline = timelineId ? await ctx.db.get(timelineId) : null;
  if (!timeline || timeline.productionId !== job.productionId || (timeline.projectId && timeline.projectId !== project._id)) throw new Error("Render timeline ownership is invalid.");
  await approvedState(ctx, project._id, "timeline", timeline._id);
  const sourceRows = Array.isArray(raw.sources) ? raw.sources.map(object) : [];
  if (sourceRows.length > 200 || !Array.isArray(raw.items) || raw.items.length > 200) throw new Error("This render exceeds the configured source limit.");
  const urls = new Map<string, string>();
  const oldUrls = new Map<string, string>();
  const sourceByItem = new Map<string, Record<string, unknown>>();
  for (const source of sourceRows) {
    if (typeof source.timelineClipId === "string") sourceByItem.set(source.timelineClipId, source);
    if (typeof source.audioId === "string") sourceByItem.set(source.audioId, source);
    if (typeof source.assetId !== "string") continue;
    const assetId = ctx.db.normalizeId("assets", source.assetId);
    const asset = assetId ? await ctx.db.get(assetId) : null;
    if (!asset || asset.projectId !== project._id || asset.scope !== "PROJECT" || asset.deletedAt || !asset.storageId || !asset.checksum || source.assetChecksum !== asset.checksum) throw new Error("A render asset is missing or has changed.");
    await approvedState(ctx, project._id, "asset", asset._id);
    if (typeof source.shotVersionId === "string") {
      const takeId = ctx.db.normalizeId("shotVersions", source.shotVersionId);
      const take = takeId ? await ctx.db.get(takeId) : null;
      if (!take || take.assetId !== asset._id || take.productionId !== job.productionId || (take.projectId && take.projectId !== project._id)) throw new Error("A render take is outside this production.");
      await approvedState(ctx, project._id, "shotVersion", take._id);
    }
    const url = await ctx.storage.getUrl(asset.storageId);
    if (!url) throw new Error("A render asset is no longer stored.");
    urls.set(asset._id, url);
    if (typeof source.sourceUrl === "string") oldUrls.set(source.sourceUrl, url);
  }
  function assetUrl(assetId: unknown) {
    const url = typeof assetId === "string" ? urls.get(assetId) : undefined;
    if (!url) throw new Error("Render media must resolve to a selected project asset.");
    return url;
  }
  function refreshLinks(value: unknown, depth = 0): unknown {
    if (depth > 12) throw new Error("Render properties are too deeply nested.");
    if (Array.isArray(value)) return value.map((item) => refreshLinks(item, depth + 1));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
      if ((key === "src" || key === "sourceUrl" || /Url$/.test(key)) && typeof nested === "string") {
        const url = oldUrls.get(nested);
        if (!url) throw new Error("Render properties contain an unauthorized media URL.");
        return [key, url];
      }
      return [key, refreshLinks(nested, depth + 1)];
    }));
    return value;
  }
  const items = raw.items.map((value) => {
    const item = object(value);
    const source = sourceByItem.get(String(item.id));
    const assetId = typeof item.assetId === "string" ? item.assetId : source?.assetId;
    if (item.kind === "video" || item.kind === "image") return { ...item, src: assetUrl(assetId) };
    const props = object(item.props);
    // The currently supported templates have one optional media asset: logoUrl.
    const refreshedProps = { ...props, ...(typeof props.logoUrl === "string" ? { logoUrl: assetUrl(assetId) } : {}) };
    return { ...item, props: refreshLinks(refreshedProps) };
  });
  const audioTracks = (Array.isArray(raw.audioTracks) ? raw.audioTracks : []).map((value) => {
    const track = object(value); const source = sourceByItem.get(String(track.id));
    return { ...track, src: assetUrl(source?.assetId) };
  });
  const shots = (Array.isArray(raw.shots) ? raw.shots : []).map((value) => { const shot = object(value); return { ...shot, src: assetUrl(shot.assetId) }; });
  const manifest: Record<string, unknown> = { ...raw, items, audioTracks, shots, ...(raw.poster ? { poster: refreshLinks(raw.poster) } : {}) };
  // Sources are diagnostic input metadata too; refresh their URLs before handoff.
  manifest.sources = sourceRows.map((source) => typeof source.assetId === "string" ? { ...source, sourceUrl: assetUrl(source.assetId) } : source);
  if (!validateLockedManifest(manifest).ok) throw new Error("Render manifest does not satisfy the renderer contract.");
  return manifest;
}

/** Shared transaction used by the internal worker and a private, explicitly
 * guarded no-network fixture verifier. Normal jobs never bypass the flag. */
export async function prepareRenderDispatch(ctx: MutationCtx, args: { jobId: Id<"renderJobs"> }, fixtureKey?: string) {
  const job = await ctx.db.get(args.jobId);
  if (!job || RENDER_TERMINAL.has(job.status)) return null;
  const project = job.projectId ? await ctx.db.get(job.projectId) : null;
  if (fixtureKey !== undefined) {
    if (renderWorkerEnabled() || process.env.FINALFRAME_DEV_FIXTURES !== "true" || process.env.FINALFRAME_DEV_FIXTURE_ENV !== "development" || !process.env.FINALFRAME_DEV_FIXTURE_KEY || fixtureKey !== process.env.FINALFRAME_DEV_FIXTURE_KEY || object(project?.metadata).fixtureMarker !== RENDER_FIXTURE_MARKER) throw new Error("Private renderer dispatch verification is not enabled.");
  } else if (!renderWorkerEnabled()) return null;
  const timestamp = now();
  if (!dispatchCanRun(job, timestamp)) return null;
  if (!job.dispatchPayload) {
    // A single active render protects the shared host. Expired owners are
    // scheduled for recovery and release the slot before another job starts.
    for (const status of ["PROCESSING", "SUBMITTED"] as const) {
      const active = await ctx.db.query("renderJobs").withIndex("by_status", (q) => q.eq("status", status)).take(101);
      if (active.length > 100) throw new Error("Renderer recovery requires an administrator check.");
      const other = active.find((candidate) => candidate._id !== job._id && !RENDER_TERMINAL.has(candidate.status) && candidate.leaseId && (candidate.leaseExpiresAt ?? 0) > timestamp);
      if (other) { if (fixtureKey === undefined) await schedule(ctx, "dispatch", RENDER_RETRY_MS, { jobId: job._id }); return null; }
      for (const stale of active.filter((candidate) => candidate._id !== job._id && candidate.leaseId && (candidate.leaseExpiresAt ?? 0) <= timestamp)) await schedule(ctx, "expireLease", 0, { jobId: stale._id, leaseId: stale.leaseId });
    }
  }
  const manifest = await authorizedManifest(ctx, job);
  const attempt = job.dispatchPayload ? job.dispatchAttempt ?? 1 : (job.dispatchAttempt ?? 0) + 1;
  if (attempt > RENDER_MAX_ATTEMPTS) {
    await ctx.db.patch(job._id, { status: "FAILED", executionStage: "FAILED", errorCode: "RENDER_MAX_ATTEMPTS", updatedAt: timestamp });
    await updateExports(ctx, job._id, "FAILED", job.progress);
    return null;
  }
  const leaseId = job.dispatchPayload && job.leaseId ? job.leaseId : `${job._id}:${timestamp}:${Math.random().toString(36).slice(2)}`;
  const dispatchLeaseId = `${leaseId}:http:${timestamp}:${Math.random().toString(36).slice(2)}`;
  const callbackIdempotencyKey = job.dispatchPayload ? job.callbackIdempotencyKey ?? job.idempotencyKey : `${job.idempotencyKey}:attempt:${attempt}`;
  const callbackBase = process.env.CONVEX_SITE_URL?.trim();
  if (!callbackBase) throw new Error("Renderer callback site is not configured.");
  const payload = job.dispatchPayload ?? { jobId: job._id, idempotencyKey: callbackIdempotencyKey, manifest, storageUploadUrl: await ctx.storage.generateUploadUrl(), callbackUrl: `${callbackBase.replace(/\/$/, "")}/renderer/callback`, leaseId, attempt, mode: "production" };
  const leaseExpiresAt = job.dispatchPayload ? job.leaseExpiresAt ?? timestamp + RENDER_LEASE_MS : timestamp + RENDER_LEASE_MS;
  if (leaseExpiresAt <= timestamp) { await schedule(ctx, "expireLease", 0, { jobId: job._id, leaseId }); return null; }
  await ctx.db.patch(job._id, { status: "PROCESSING", executionStage: "DISPATCHING", leaseId, leaseExpiresAt, dispatchLeaseId, dispatchLeaseExpiresAt: timestamp + RENDER_DISPATCH_LEASE_MS, dispatchAttempt: attempt, dispatchPayload: payload, callbackIdempotencyKey, dispatchStartedAt: job.dispatchStartedAt ?? timestamp, nextDispatchAt: undefined, startedAt: job.startedAt ?? timestamp, progress: Math.max(job.progress, 5), updatedAt: timestamp });
  await updateExports(ctx, job._id, "PROCESSING", Math.max(job.progress, 5));
  await schedule(ctx, "expireLease", leaseExpiresAt - timestamp + 1000, { jobId: job._id, leaseId });
  if (fixtureKey === undefined) await schedule(ctx, "dispatch", RENDER_DISPATCH_LEASE_MS + 1000, { jobId: job._id });
  return { jobId: job._id, leaseId, dispatchLeaseId, attempt, payload, uploadUrl: object(payload).storageUploadUrl, manifest: object(payload).manifest, idempotencyKey: callbackIdempotencyKey };
}

export const recordAcceptance = internalMutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.string(), dispatchLeaseId: v.string(), rendererJobId: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || RENDER_TERMINAL.has(job.status)) return null;
    if (job.leaseId !== args.leaseId || job.dispatchLeaseId !== args.dispatchLeaseId) return null;
    assertLease(job, args.leaseId);
    await ctx.db.patch(job._id, { status: "SUBMITTED", executionStage: "AWAITING_CALLBACK", providerJobId: args.rendererJobId, acceptedAt: now(), progress: Math.max(job.progress, 10), dispatchLeaseId: undefined, dispatchLeaseExpiresAt: undefined, updatedAt: now() });
    await updateExports(ctx, job._id, "PROCESSING", Math.max(job.progress, 10));
    return null;
  },
});
export const recordDispatchFailure = internalMutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.optional(v.string()), dispatchLeaseId: v.optional(v.string()), errorCode: v.string(), retryable: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || RENDER_TERMINAL.has(job.status) || job.acceptedAt) return null;
    if (args.leaseId && (job.leaseId !== args.leaseId || job.dispatchLeaseId !== args.dispatchLeaseId)) return null;
    if (!args.leaseId && job.leaseId) return null;
    const retryCount = (job.dispatchRetryCount ?? 0) + 1;
    const retryable = args.retryable && Boolean(job.leaseId && job.dispatchPayload && (job.leaseExpiresAt ?? 0) > now());
    const waitForCallback = retryable && retryCount >= 10;
    await ctx.db.patch(job._id, { status: retryable ? "PROCESSING" : "FAILED", executionStage: retryable ? waitForCallback ? "AWAITING_CALLBACK" : "DISPATCHING" : "FAILED", errorCode: args.errorCode, errorMessage: undefined, dispatchRetryCount: retryCount, dispatchLeaseId: undefined, dispatchLeaseExpiresAt: undefined, nextDispatchAt: retryable && !waitForCallback ? now() + Math.min(RENDER_RETRY_MS * retryCount, 60_000) : undefined, ...(retryable ? {} : { leaseId: undefined, leaseExpiresAt: undefined, dispatchPayload: undefined }), updatedAt: now() });
    await updateExports(ctx, job._id, retryable ? "PROCESSING" : "FAILED", job.progress);
    if (retryable && !waitForCallback) await schedule(ctx, "dispatch", Math.min(RENDER_RETRY_MS * retryCount, 60_000), { jobId: job._id });
    return null;
  },
});

export const create = mutation({
  args: { productionId: v.id("productions"), manifestId: v.id("manifests"), timelineId: v.optional(v.id("timelines")), operation: v.optional(v.string()), preset: v.string(), idempotencyKey: v.string(), estimatedCost: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const production = await ctx.db.get(args.productionId);
    if (!production) throw new Error("Production not found.");
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest || manifest.productionId !== args.productionId) throw new Error("Manifest not found.");
    const member = await requireMember(ctx, manifest.studioExternalId);
    if (production.projectId) await requireProjectRole(ctx, production.projectId, ["OWNER", "EDITOR"]);
    const manifestData = object(manifest.manifest);
    if (manifestData.version !== 4 || manifest.contractVersion !== 4) throw new Error("Only canonical manifest v4 can create new render jobs.");
    if (!production.projectId || !manifest.projectId || manifest.projectId !== production.projectId || manifestData.projectId !== production.projectId.toString()) throw new Error("Manifest and production belong to different projects.");
    if (args.timelineId) {
      const timeline = await ctx.db.get(args.timelineId);
      if (!timeline || timeline.productionId !== args.productionId || timeline.studioExternalId !== member.studio.externalId) throw new Error("Timeline not found.");
    }
    const idempotencyKey = args.idempotencyKey.trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) throw new Error("Idempotency key must be between 8 and 200 characters.");
    const selection = object(manifestData.selection);
    const selectionScope = typeof selection.scope === "string" ? selection.scope : manifest.selectionScope;
    const requestHash = hash({ productionId: args.productionId, manifestId: args.manifestId, timelineId: args.timelineId, operation: args.operation ?? "RENDER", preset: args.preset, selectionScope, selectionIds: selection.ids });
    const existing = await ctx.db.query("renderJobs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey)).unique();
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.requestHash !== requestHash) throw new Error("Idempotency key is already used for a different render request.");
      return publicRenderJob(existing);
    }
    const timestamp = now();
    const jobId = await ctx.db.insert("renderJobs", { studioExternalId: member.studio.externalId, studioId: member.studio._id, projectId: production.projectId, productionId: args.productionId, timelineId: args.timelineId ?? (typeof manifestData.timelineId === "string" ? manifestData.timelineId as Id<"timelines"> : undefined), manifestId: args.manifestId, selectionScope, exportScope: typeof manifestData.export === "object" && manifestData.export !== null ? String(object(manifestData.export).scope ?? selectionScope ?? "FULL_PROJECT") : selectionScope, operation: args.operation ?? "RENDER", preset: args.preset, createdByUserId: member.user._id, executionStage: "QUEUED", status: "QUEUED", idempotencyKey, requestHash, progress: 0, estimatedCost: args.estimatedCost, createdAt: timestamp, updatedAt: timestamp });
    await schedule(ctx, "dispatch", 0, { jobId });
    return publicRenderJob((await ctx.db.get(jobId))!);
  },
});

export const get = query({
  args: { jobId: v.id("renderJobs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    const exportsForJob = await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", job._id)).take(100);
    return { job: publicRenderJob(job), exports: exportsForJob };
  },
});

export const getStatus = query({
  args: { jobId: v.id("renderJobs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId);
    const exportRecord = (await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", job._id)).take(100)).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    const downloadUrl = exportRecord?.storageId && exportRecord.status === "COMPLETED" ? await ctx.storage.getUrl(exportRecord.storageId) : undefined;
    return { job: { _id: job._id, status: job.status, progress: job.progress, errorCode: job.errorCode, errorMessage: safeRenderError(job.errorCode), completedAt: job.completedAt, projectId: job.projectId, selectionScope: job.selectionScope, exportScope: job.exportScope }, export: exportRecord ? { ...exportRecord, downloadUrl } : null };
  },
});

export const list = query({
  args: { productionId: v.id("productions"), status: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const production = await ctx.db.get(args.productionId);
    if (!production) throw new Error("Production not found.");
    await requireMember(ctx, production.studioExternalId);
    if (!production.projectId) throw new Error("Render jobs must belong to a project.");
    await requireProjectRole(ctx, production.projectId, ["OWNER", "EDITOR", "REVIEWER", "VIEWER"]);
    const jobs = await ctx.db.query("renderJobs").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).take(100);
    const visible = jobs.filter((job) => !args.status || job.status === args.status).sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(visible.map(async (job) => {
      const exportRecord = (await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", job._id)).take(100)).find((record) => record.status === "COMPLETED" && record.storageId);
      return { ...publicRenderJob(job), exportUrl: exportRecord?.storageId ? await ctx.storage.getUrl(exportRecord.storageId) : undefined };
    }));
  },
});

export const claim = mutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.optional(v.string()), leaseDurationMs: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId, true);
    await requireLegacyFixtureLease(ctx, job);
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
  returns: v.any(),
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId, true);
    await requireLegacyFixtureLease(ctx, job);
    assertLease(job, args.leaseId);
    if (job.status !== "PROCESSING" && job.status !== "SUBMITTED") throw new Error("Render job is not actively leased.");
    const duration = Math.min(Math.max(args.leaseDurationMs ?? 5 * 60 * 1000, 30_000), 30 * 60 * 1000);
    await ctx.db.patch(job._id, { leaseExpiresAt: now() + duration, updatedAt: now() });
    await schedule(ctx, "expireLease", duration, { jobId: job._id, leaseId: args.leaseId });
    return await ctx.db.get(job._id);
  },
});

// Renderer callbacks must arrive through the signed HTTP endpoint. Keep this
// compatibility mutation internal so a browser cannot forge job completion.
export const callback = internalMutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.optional(v.string()), event: v.union(v.literal("SUBMITTED"), v.literal("PROGRESS"), v.literal("COMPLETED"), v.literal("FAILED")), rendererJobId: v.optional(v.string()), progress: v.optional(v.number()), storageId: v.optional(v.id("_storage")), checksum: v.optional(v.string()), mimeType: v.optional(v.string()), errorCode: v.optional(v.string()), errorMessage: v.optional(v.string()), retryable: v.optional(v.boolean()), actualCost: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { job, member } = await authorizedJob(ctx, args.jobId);
    await requireLegacyFixtureLease(ctx, job);
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
        const failedExports = await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", job._id)).take(100);
        for (const exportRecord of failedExports) await ctx.db.patch(exportRecord._id, { status: "PROCESSING", progress: job.progress, errorMessage: args.errorMessage ?? "Renderer failed and will retry." });
        await schedule(ctx, "wake", 15_000, { jobId: job._id });
      } else {
        await ctx.db.patch(job._id, { status: "FAILED", errorCode: args.errorCode ?? "RENDER_FAILED", errorMessage: args.errorMessage ?? "Renderer failed.", leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
        const failedExports = await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", job._id)).take(100);
        for (const exportRecord of failedExports) await ctx.db.patch(exportRecord._id, { status: "FAILED", progress: job.progress, errorMessage: args.errorMessage ?? "Renderer failed." });
      }
    } else {
      if (job.status !== "PROCESSING" && job.status !== "SUBMITTED") throw new Error(`Render completion is invalid from ${job.status}.`);
      if (!args.storageId) throw new Error("A canonical Convex Storage export is required.");
      const storage = await ctx.db.system.get("_storage", args.storageId);
      if (!storage) throw new Error("Export storage object not found.");
      const existing = await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", job._id)).take(100);
      if (!existing.length) await ctx.db.insert("exports", { studioExternalId: member.studio.externalId, studioId: member.studio._id, projectId: job.projectId, productionId: job.productionId, renderJobId: job._id, manifestId: job.manifestId, selectionScope: job.selectionScope, exportScope: job.exportScope, preset: job.preset, status: "COMPLETED", progress: 100, storageId: args.storageId, checksum: args.checksum ?? storage.sha256, mimeType: args.mimeType ?? storage.contentType, createdAt: timestamp, completedAt: timestamp, downloadReadyAt: timestamp });
      else for (const exportRecord of existing) await ctx.db.patch(exportRecord._id, { status: "COMPLETED", progress: 100, storageId: args.storageId, checksum: args.checksum ?? storage.sha256, mimeType: args.mimeType ?? storage.contentType, completedAt: timestamp, downloadReadyAt: timestamp, errorMessage: undefined });
      await ctx.db.patch(job._id, { status: "COMPLETED", progress: 100, providerJobId: args.rendererJobId ?? job.providerJobId, actualCost: args.actualCost, executionStage: "COMPLETED", dispatchPayload: undefined, dispatchLeaseId: undefined, dispatchLeaseExpiresAt: undefined, leaseId: undefined, leaseExpiresAt: undefined, completedAt: timestamp, updatedAt: timestamp });
    }
    return await ctx.db.get(job._id);
  },
});

export const retry = mutation({
  args: { jobId: v.id("renderJobs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { job, member } = await authorizedJob(ctx, args.jobId, true);
    if (job.status !== "FAILED" && job.status !== "RETRYING") throw new Error(`Render job cannot be retried from ${job.status}.`);
    if ((job.dispatchAttempt ?? 0) >= RENDER_MAX_ATTEMPTS) throw new Error("This export needs an administrator check before another render attempt.");
    await ctx.db.patch(job._id, { status: "QUEUED", createdByUserId: member.user._id, executionStage: "QUEUED", acceptedAt: undefined, dispatchPayload: undefined, dispatchLeaseId: undefined, dispatchLeaseExpiresAt: undefined, nextDispatchAt: undefined, progress: 0, errorCode: undefined, errorMessage: undefined, leaseId: undefined, leaseExpiresAt: undefined, updatedAt: now() });
    await schedule(ctx, "dispatch", 0, { jobId: job._id });
    return await ctx.db.get(job._id);
  },
});

export const cancel = mutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.optional(v.string()), reason: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { job } = await authorizedJob(ctx, args.jobId, true);
    if (job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELED") return job;
    if (job.dispatchStartedAt || job.status === "SUBMITTED" || job.status === "PROCESSING") throw new Error("This export has already been sent to the renderer.");
    await ctx.db.patch(job._id, { status: "CANCELED", errorCode: "CANCELED", errorMessage: args.reason ?? "Canceled by the user.", leaseId: undefined, leaseExpiresAt: undefined, updatedAt: now() });
    await updateExports(ctx, job._id, "CANCELED", job.progress);
    return await ctx.db.get(job._id);
  },
});

export const wake = internalMutation({
  args: { jobId: v.id("renderJobs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "RETRYING") return job;
    await ctx.db.patch(job._id, { status: "QUEUED", updatedAt: now() });
    await schedule(ctx, "dispatch", 0, { jobId: job._id });
    return await ctx.db.get(job._id);
  },
});

export const prepareForRenderer = internalMutation({
  args: { jobId: v.id("renderJobs") }, returns: v.any(),
  handler: async (ctx, args) => prepareRenderDispatch(ctx, args),
});

export const applyRendererCallback = internalMutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.optional(v.string()), event: v.union(v.literal("COMPLETED"), v.literal("FAILED")), eventId: v.string(), idempotencyKey: v.string(), projectId: v.string(), eventType: v.union(v.literal("render.completed"), v.literal("render.failed")), occurredAt: v.number(), attempt: v.number(), payloadHash: v.string(), signature: v.optional(v.string()), rendererJobId: v.optional(v.string()), storageId: v.optional(v.id("_storage")), mimeType: v.optional(v.string()), checksum: v.optional(v.string()), errorCode: v.optional(v.string()), errorMessage: v.optional(v.string()), retryable: v.optional(v.boolean()), actualCost: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Render job not found.");
    const timestamp = now();
    if (!job.projectId || args.projectId !== job.projectId.toString()) throw new Error("Renderer callback project does not match the render job.");
    if (args.idempotencyKey !== (job.callbackIdempotencyKey ?? job.idempotencyKey)) throw new Error("Renderer callback idempotency key does not match the render job.");
    if (args.attempt !== (job.dispatchAttempt ?? 1) || !Number.isInteger(args.attempt)) throw new Error("Renderer callback attempt is invalid.");
    if (!Number.isFinite(args.occurredAt) || Math.abs(timestamp - args.occurredAt) > 10 * 60 * 1000) throw new Error("Renderer callback timestamp is invalid.");
    if ((args.event === "COMPLETED" && args.eventType !== "render.completed") || (args.event === "FAILED" && args.eventType !== "render.failed")) throw new Error("Renderer callback event type does not match the event.");
    const existingEvent = await ctx.db.query("renderCallbackReceipts").withIndex("by_event_id", (q) => q.eq("eventId", args.eventId)).unique();
    if (existingEvent) {
      if (existingEvent.jobId !== job._id || existingEvent.idempotencyKey !== args.idempotencyKey || existingEvent.payloadHash !== args.payloadHash) throw new Error("Renderer callback event ID was already used for another job.");
      return { job, duplicate: true };
    }
    const existingKey = await ctx.db.query("renderCallbackReceipts").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).take(100);
    if (existingKey.some((receipt) => receipt.eventId !== args.eventId)) throw new Error("A different renderer callback already claimed this idempotency key.");
    if (!job.leaseId || !args.leaseId || job.leaseId !== args.leaseId || job.leaseExpiresAt !== undefined && job.leaseExpiresAt <= timestamp) throw new Error("Renderer callback lease is invalid or expired.");
    const receiptId = await ctx.db.insert("renderCallbackReceipts", { jobId: job._id, projectId: job.projectId, eventId: args.eventId, idempotencyKey: args.idempotencyKey, eventType: args.eventType, attempt: args.attempt, occurredAt: args.occurredAt, receivedAt: timestamp, payloadHash: args.payloadHash, signature: args.signature, status: "CLAIMED" });
    if (RENDER_TERMINAL.has(job.status)) throw new Error("A terminal render cannot accept a new callback event.");
    assertLease(job, args.leaseId);
    if (args.event === "FAILED") {
      const retryable = args.retryable === true && (job.dispatchAttempt ?? 1) < RENDER_MAX_ATTEMPTS;
      await ctx.db.patch(job._id, { status: retryable ? "RETRYING" : "FAILED", executionStage: retryable ? "QUEUED" : "FAILED", errorCode: args.errorCode ?? "RENDER_FAILED", errorMessage: undefined, acceptedAt: undefined, dispatchPayload: undefined, dispatchLeaseId: undefined, dispatchLeaseExpiresAt: undefined, dispatchRetryCount: 0, nextDispatchAt: retryable ? timestamp + RENDER_RETRY_MS : undefined, leaseId: undefined, leaseExpiresAt: undefined, updatedAt: timestamp });
      await updateExports(ctx, job._id, retryable ? "PROCESSING" : "FAILED", job.progress);
      if (retryable) await schedule(ctx, "wake", RENDER_RETRY_MS, { jobId: job._id });
      await ctx.db.patch(receiptId, { status: "APPLIED" });
      return { job: await ctx.db.get(job._id), duplicate: false };
    }
    if (!args.storageId) throw new Error("Renderer completion is missing storageId.");
    const storage = await ctx.db.system.get("_storage", args.storageId);
    if (!storage || storage.size <= 0 || !["video/mp4", "video/webm", "video/quicktime"].includes(storage.contentType ?? "") || (args.mimeType && args.mimeType !== storage.contentType)) throw new Error("A stored video export with matching media type is required.");
    const existing = await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", job._id)).take(100);
    if (!existing.length) await ctx.db.insert("exports", { studioExternalId: job.studioExternalId, studioId: job.studioId, projectId: job.projectId, productionId: job.productionId, renderJobId: job._id, manifestId: job.manifestId, selectionScope: job.selectionScope, exportScope: job.exportScope, preset: job.preset, status: "COMPLETED", progress: 100, storageId: args.storageId, checksum: args.checksum ?? storage.sha256, mimeType: args.mimeType ?? storage.contentType, createdAt: timestamp, completedAt: timestamp, downloadReadyAt: timestamp });
    else for (const exportRecord of existing) await ctx.db.patch(exportRecord._id, { status: "COMPLETED", progress: 100, storageId: args.storageId, checksum: args.checksum ?? storage.sha256, mimeType: args.mimeType ?? storage.contentType, completedAt: timestamp, downloadReadyAt: timestamp, errorMessage: undefined });
    await ctx.db.patch(job._id, { status: "COMPLETED", progress: 100, providerJobId: args.rendererJobId ?? job.providerJobId, actualCost: args.actualCost, executionStage: "COMPLETED", dispatchPayload: undefined, dispatchLeaseId: undefined, dispatchLeaseExpiresAt: undefined, leaseId: undefined, leaseExpiresAt: undefined, completedAt: timestamp, updatedAt: timestamp });
    await ctx.db.patch(receiptId, { status: "APPLIED" });
    return { job: await ctx.db.get(job._id), duplicate: false };
  },
});

export const dispatch = internalAction({
  args: { jobId: v.id("renderJobs") }, returns: v.null(),
  handler: async (ctx, args) => {
    if (!renderWorkerEnabled()) return null;
    await ctx.runAction((internal as unknown as { renderWorker: { run: import("convex/server").FunctionReference<"action", "internal", { jobId: Id<"renderJobs"> }, null> } }).renderWorker.run, args);
    return null;
  },
});

export const expireLease = internalMutation({
  args: { jobId: v.id("renderJobs"), leaseId: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || RENDER_TERMINAL.has(job.status) || job.leaseId !== args.leaseId || !job.leaseExpiresAt || job.leaseExpiresAt > now()) return null;
    const exhausted = (job.dispatchAttempt ?? 0) >= RENDER_MAX_ATTEMPTS;
    await ctx.db.patch(job._id, { status: exhausted ? "FAILED" : "RETRYING", executionStage: exhausted ? "FAILED" : "QUEUED", acceptedAt: undefined, dispatchPayload: undefined, dispatchLeaseId: undefined, dispatchLeaseExpiresAt: undefined, dispatchRetryCount: 0, errorCode: exhausted ? "RENDER_MAX_ATTEMPTS" : "RENDER_LEASE_EXPIRED", errorMessage: undefined, leaseId: undefined, leaseExpiresAt: undefined, nextDispatchAt: exhausted ? undefined : now() + RENDER_RETRY_MS, updatedAt: now() });
    await updateExports(ctx, job._id, exhausted ? "FAILED" : "PROCESSING", job.progress);
    if (!exhausted) await schedule(ctx, "wake", RENDER_RETRY_MS, { jobId: job._id });
    return null;
  },
});
