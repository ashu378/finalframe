import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireProjectAccess, requireProjectRole } from "./authorization";
import { ensureResourceState, requireApprovedResource } from "./resourceStates";
import { applyClientReviewDecision, transitionResourceState } from "./approvals";
import { assertReviewToken, isReviewLinkActive, REVIEW_COMMENT_LIMIT, REVIEW_LINK_DEFAULT_AGE_MS, REVIEW_LINK_MAX_AGE_MS, validateReviewComment } from "./reviewLinkContracts";
import { publicRenderJob } from "./renderWorkerContracts";
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
  const { member } = await authorizedProduction(ctx, review.productionId);
  if (member.studio.externalId !== review.studioExternalId) throw new Error("Review not found.");
  return { review, member };
}

async function authorizedProduction(ctx: ReadCtx, productionId: Id<"productions">) {
  const production = await ctx.db.get(productionId);
  if (!production) throw new Error("Production not found.");
  if (!production.projectId) throw new Error("Production project ownership must be migrated first.");
  const member = await requireProjectAccess(ctx, production.projectId);
  if (member.project.studioExternalId !== production.studioExternalId) throw new Error("Production not found.");
  return { production, member };
}

export const getState = query({
  args: { productionId: v.id("productions") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { production, member } = await authorizedProduction(ctx, args.productionId);
    const reviews = await ctx.db.query("reviews").withIndex("by_production", (q) => q.eq("productionId", production._id)).order("desc").take(200);
    const review = reviews.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    const comments = review ? await ctx.db.query("comments").withIndex("by_review", (q) => q.eq("reviewId", review._id)).take(200) : [];
    const approvals = await ctx.db.query("approvals").withIndex("by_production", (q) => q.eq("productionId", production._id)).order("desc").take(200);
    const exports = await ctx.db.query("exports").withIndex("by_production", (q) => q.eq("productionId", production._id)).order("desc").take(200);
    const manifests = await ctx.db.query("manifests").withIndex("by_production", q => q.eq("productionId", production._id)).order("desc").take(100);
    return { production, projectExternalId: member.project.externalId, projectRole: member.projectRole, manifests, reviews, review, comments: comments.sort((a, b) => a.createdAt - b.createdAt), approvals: approvals.sort((a, b) => b.createdAt - a.createdAt), exports: exports.sort((a, b) => b.createdAt - a.createdAt) };
  },
});

export const requestReview = mutation({
  args: { productionId: v.id("productions"), manifestId: v.id("manifests"), idempotencyKey: v.string(), correlationId: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { production, member } = await authorizedProduction(ctx, args.productionId);
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest || manifest.productionId !== production._id || manifest.studioExternalId !== member.studio.externalId) throw new Error("Assembly manifest not found.");
    const manifestData = record(manifest.manifest);
    if (manifestData.version !== 4 || manifest.contractVersion !== 4 || !production.projectId || manifest.projectId !== production.projectId || manifestData.projectId !== production.projectId.toString() || !manifestData.timelineId || !Array.isArray(manifestData.items)) throw new Error("This assembly manifest is not ready for review.");
    const timeline = await ctx.db.get(String(manifestData.timelineId) as Id<"timelines">);
    if (!timeline || timeline.projectId !== production.projectId || timeline.productionId !== production._id) throw new Error("This timeline is outside this production.");
    await requireApprovedResource(ctx, production.projectId, "timeline", timeline._id, production._id);
    const key = requiredKey(args.idempotencyKey, "Review request key");
    if (production.projectId) await requireProjectRole(ctx, production.projectId, ["OWNER", "EDITOR"]);
    const existingMarker = (await ctx.db.query("approvals").withIndex("by_resource", (q) => q.eq("resourceType", "reviewRequest").eq("resourceId", key)).take(200)).find((approval) => approval.productionId === production._id);
    if (existingMarker?.note?.startsWith("reviewId:")) {
      const existing = await ctx.db.get(existingMarker.note.slice("reviewId:".length) as Id<"reviews">);
      if (existing) { if (existing.manifestId !== manifest._id || existing.timelineId !== timeline._id || existing.timelineVersionNumber !== timeline.versionNumber) throw new Error("Review key belongs to a different assembly version."); return existing; }
    }
    const timestamp = now();
    const reviewId = await ctx.db.insert("reviews", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: production._id, projectId: production.projectId, manifestId: manifest._id, timelineId: String(manifestData.timelineId) as Id<"timelines">, timelineVersionNumber: timeline.versionNumber, status: "REQUESTED", requestedByUserId: member.user._id, createdAt: timestamp, updatedAt: timestamp });
    if (production.projectId) {
      await ensureResourceState(ctx, {
        projectId: production.projectId,
        productionId: production._id,
        resourceType: "review",
        resourceId: reviewId.toString(),
        initialState: "IN_REVIEW",
      });
    }
    await ctx.db.insert("approvals", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: production._id, reviewId, resourceType: "reviewRequest", resourceId: key, decision: "REQUESTED", actorUserId: member.user._id, note: `reviewId:${reviewId.toString()}`, createdAt: timestamp });
    return await ctx.db.get(reviewId);
  },
});

export const addComment = mutation({
  args: { reviewId: v.id("reviews"), body: v.string(), timeSeconds: v.optional(v.number()), shotId: v.optional(v.id("shots")) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { review, member } = await authorizedReview(ctx, args.reviewId);
    const production = await ctx.db.get(review.productionId);
    if (!production?.projectId) throw new Error("Review project ownership is unavailable.");
    await requireProjectRole(ctx, production.projectId, ["OWNER", "EDITOR", "REVIEWER"]);
    const timeline = review.timelineId ? await ctx.db.get(review.timelineId) : null;
    if (args.timeSeconds !== undefined && timeline && args.timeSeconds > timeline.durationSeconds) throw new Error("Comment time must be inside this video.");
    if (review.status === "APPROVED") throw new Error("Approved reviews cannot receive new comments. Request a new revision instead.");
    if (args.timeSeconds !== undefined && (!Number.isFinite(args.timeSeconds) || args.timeSeconds < 0)) throw new Error("Comment time must be a valid positive timestamp.");
    if (args.shotId) { const shot = await ctx.db.get(args.shotId); if (!shot || shot.productionId !== review.productionId || shot.projectId !== review.projectId) throw new Error("Review shot is outside this project."); }
    const commentId = await ctx.db.insert("comments", { studioExternalId: member.studio.externalId, studioId: member.studio._id, reviewId: review._id, authorExternalId: member.identity.externalId, authorUserId: member.user._id, body: requiredBody(args.body), timeSeconds: args.timeSeconds, shotId: args.shotId, createdAt: now() });
    return await ctx.db.get(commentId);
  },
});

export const approve = mutation({
  args: { reviewId: v.id("reviews"), note: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { review, member } = await authorizedReview(ctx, args.reviewId);
    if (review.status === "APPROVED") return review;
    if (review.status !== "REQUESTED" && review.status !== "CHANGES_REQUESTED") throw new Error("This review is not awaiting approval.");
    const production = await ctx.db.get(review.productionId);
    const canonicalProject = production?.projectId;
    if (canonicalProject) {
        await transitionResourceState(ctx, {
          projectId: canonicalProject,
          productionId: review.productionId,
          resourceType: "review",
          resourceId: review._id.toString(),
          targetState: "APPROVED",
          roles: ["OWNER", "EDITOR", "REVIEWER"],
          decision: "APPROVED",
          note: args.note,
        });
    }
    const timestamp = now();
    await ctx.db.patch(review._id, { status: "APPROVED", updatedAt: timestamp });
    if (!canonicalProject) await ctx.db.insert("approvals", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: review.productionId, reviewId: review._id, resourceType: "review", resourceId: review._id.toString(), decision: "APPROVED", actorUserId: member.user._id, note: args.note?.trim(), createdAt: timestamp });
    return await ctx.db.get(review._id);
  },
});

export const requestRevision = mutation({
  args: { reviewId: v.id("reviews"), note: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { review, member } = await authorizedReview(ctx, args.reviewId);
    const note = requiredBody(args.note);
    if (review.status === "APPROVED") throw new Error("This review is approved. Create a new review for another revision.");
    const production = await ctx.db.get(review.productionId);
    const canonicalProject = production?.projectId;
    if (canonicalProject) {
        await transitionResourceState(ctx, {
          projectId: canonicalProject,
          productionId: review.productionId,
          resourceType: "review",
          resourceId: review._id.toString(),
          targetState: "REVISION_REQUESTED",
          roles: ["OWNER", "EDITOR", "REVIEWER"],
          decision: "REVISION_REQUESTED",
          note,
        });
    }
    const timestamp = now();
    await ctx.db.patch(review._id, { status: "CHANGES_REQUESTED", updatedAt: timestamp });
    if (!canonicalProject) await ctx.db.insert("approvals", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: review.productionId, reviewId: review._id, resourceType: "review", resourceId: review._id.toString(), decision: "CHANGES_REQUESTED", actorUserId: member.user._id, note, createdAt: timestamp });
    return await ctx.db.get(review._id);
  },
});

export const requestExport = mutation({
  args: { productionId: v.id("productions"), manifestId: v.id("manifests"), reviewId: v.id("reviews"), preset: v.optional(v.string()), idempotencyKey: v.string(), correlationId: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { production, member } = await authorizedProduction(ctx, args.productionId);
    const manifest = await ctx.db.get(args.manifestId);
    const review = await ctx.db.get(args.reviewId);
    if (!manifest || manifest.productionId !== production._id || manifest.studioExternalId !== member.studio.externalId) throw new Error("Assembly manifest not found.");
    if (!review || review.productionId !== production._id || review.studioExternalId !== member.studio.externalId || review.status !== "APPROVED") throw new Error("Approve the review before requesting an export.");
    if (production.projectId) await requireApprovedResource(ctx, production.projectId, "review", review._id.toString(), production._id);
    const manifestData = record(manifest.manifest);
    if (manifestData.version !== 4 || manifest.contractVersion !== 4 || !manifest.projectId || !production.projectId || manifest.projectId !== production.projectId || manifestData.projectId !== production.projectId.toString()) throw new Error("Only canonical manifest v4 for this project can be exported.");
    if (!review.manifestId || review.manifestId !== manifest._id || review.timelineId !== manifestData.timelineId) throw new Error("This approval belongs to a different assembly version. Request a review of this exact manifest.");
    await requireProjectRole(ctx, production.projectId, ["OWNER", "EDITOR"]);
    const reviewedTimeline = review.timelineId ? await ctx.db.get(review.timelineId) : null;
    if (!reviewedTimeline || reviewedTimeline.projectId !== production.projectId || reviewedTimeline.productionId !== production._id || reviewedTimeline.versionNumber !== review.timelineVersionNumber) throw new Error("The approved timeline version is unavailable.");
    await requireApprovedResource(ctx, production.projectId, "timeline", reviewedTimeline._id, production._id);
    const manifestPreset = record(manifestData.preset);
    const canonicalPreset = String(manifestPreset.name ?? production.outputPreset);
    const exportPreset = args.preset?.trim() || canonicalPreset;
    if (exportPreset !== canonicalPreset) throw new Error("The export preset must match the approved assembly manifest.");
    const key = requiredKey(args.idempotencyKey, "Export key");
    const expectedRequestHash = `${args.productionId}:${args.manifestId}:${args.reviewId}:${exportPreset}`;
    const existingJob = await ctx.db.query("renderJobs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key)).unique();
    if (existingJob) { if (existingJob.productionId !== production._id || existingJob.manifestId !== manifest._id || existingJob.projectId !== production.projectId || existingJob.requestHash !== expectedRequestHash) throw new Error("Export key belongs to a different project or version."); return { job: publicRenderJob(existingJob), export: (await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", existingJob._id)).take(200))[0] ?? null, replayed: true }; }
    const timelineId = String(manifestData.timelineId ?? "") as Id<"timelines">;
    const timestamp = now();
    const requestHash = expectedRequestHash;
    const selection = record(manifestData.selection);
    const selectionScope = String(selection.scope ?? manifest.selectionScope ?? "FULL_PROJECT");
    const jobId = await ctx.db.insert("renderJobs", { studioExternalId: member.studio.externalId, studioId: member.studio._id, projectId: production.projectId, productionId: production._id, timelineId, manifestId: manifest._id, selectionScope, exportScope: String(record(manifestData.export).scope ?? selectionScope), operation: "EXPORT", preset: exportPreset, status: "QUEUED", createdByUserId: member.user._id, executionStage: "QUEUED", idempotencyKey: key, requestHash, progress: 0, createdAt: timestamp, updatedAt: timestamp });
    const exportId = await ctx.db.insert("exports", { studioExternalId: member.studio.externalId, studioId: member.studio._id, projectId: production.projectId, productionId: production._id, renderJobId: jobId, manifestId: manifest._id, selectionScope, exportScope: String(record(manifestData.export).scope ?? selectionScope), preset: exportPreset, status: "QUEUED", progress: 0, createdAt: timestamp });
    await ctx.scheduler.runAfter(0, internal.renderJobs.dispatch, { jobId });
    return { job: publicRenderJob((await ctx.db.get(jobId))!), export: await ctx.db.get(exportId), replayed: false };
  },
});

export const getExport = query({
  args: { exportId: v.id("exports") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const exportRecord = await ctx.db.get(args.exportId);
    if (!exportRecord) throw new Error("Export not found.");
    const { production } = await authorizedProduction(ctx, exportRecord.productionId);
    if (exportRecord.projectId && exportRecord.projectId !== production.projectId) throw new Error("Export not found.");
    const url = exportRecord.storageId && exportRecord.status === "COMPLETED" ? await ctx.storage.getUrl(exportRecord.storageId) : undefined;
    const job = exportRecord.renderJobId ? await ctx.db.get(exportRecord.renderJobId) : null;
    return { ...exportRecord, progress: exportRecord.progress ?? job?.progress ?? 0, jobStatus: job?.status, downloadUrl: url };
  },
});

async function hashToken(token: string) {
  assertReviewToken(token);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function exactReviewScope(ctx: ReadCtx, link: Doc<'reviewLinks'>) {
  if (!isReviewLinkActive(link)) throw new Error('This review link is unavailable.');
  const [project, production, review, timeline, manifest, exportRecord] = await Promise.all([
    ctx.db.get(link.projectId), ctx.db.get(link.productionId), ctx.db.get(link.reviewId), ctx.db.get(link.timelineId), ctx.db.get(link.manifestId), link.exportId ? ctx.db.get(link.exportId) : null,
  ]);
  if (!project || project.deletedAt || project.archivedAt || !production || production.projectId !== project._id || !review || review.projectId !== project._id || review.productionId !== production._id || review.timelineId !== link.timelineId || review.manifestId !== link.manifestId || review.exportId !== link.exportId || review.timelineVersionNumber !== link.timelineVersionNumber || !timeline || timeline.projectId !== project._id || timeline.productionId !== production._id || timeline.versionNumber !== link.timelineVersionNumber || !manifest || manifest.projectId !== project._id || manifest.productionId !== production._id || !exportRecord || exportRecord.projectId !== project._id || exportRecord.productionId !== production._id || exportRecord.manifestId !== manifest._id || exportRecord.status !== 'COMPLETED' || !exportRecord.storageId) throw new Error('This review version is unavailable.');
  const manifestData = record(manifest.manifest);
  if (manifestData.timelineId !== timeline._id || manifestData.version !== 4) throw new Error('This review version is unavailable.');
  return { project, production, review, timeline, manifest, exportRecord };
}
async function sharedReview(ctx: ReadCtx, token: string) {
  const tokenHash = await hashToken(token);
  const link = await ctx.db.query('reviewLinks').withIndex('by_token_hash', q => q.eq('tokenHash', tokenHash)).unique();
  if (!link) throw new Error('This review link is unavailable.');
  return { link, tokenHash, ...await exactReviewScope(ctx, link) };
}

/** Owner-only creation accepts a SHA-256 hash; the application generates a
 * cryptographically random one-time token server-side and stores only its hash. */
export const createShareLink = mutation({
  args: { projectId: v.id('projects'), exportId: v.id('exports'), tokenHash: v.string(), label: v.optional(v.string()), expiresAt: v.optional(v.number()) }, returns: v.any(),
  handler: async (ctx, args) => {
    const access = await requireProjectAccess(ctx, args.projectId, ['OWNER', 'EDITOR']);
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash)) throw new Error('A secure review token hash is required.');
    const expiresAt = args.expiresAt ?? now() + REVIEW_LINK_DEFAULT_AGE_MS;
    if (!Number.isFinite(expiresAt) || expiresAt <= now() || expiresAt > now() + REVIEW_LINK_MAX_AGE_MS) throw new Error('Review expiry must be within the next 30 days.');
    const exportRecord = await ctx.db.get(args.exportId);
    const manifest = exportRecord?.manifestId ? await ctx.db.get(exportRecord.manifestId) : null;
    const timelineId = typeof record(manifest?.manifest).timelineId === 'string' ? ctx.db.normalizeId('timelines', record(manifest?.manifest).timelineId as string) : null;
    const timeline = timelineId ? await ctx.db.get(timelineId) : null;
    if (!exportRecord || exportRecord.projectId !== args.projectId || exportRecord.status !== 'COMPLETED' || !exportRecord.storageId || !manifest || manifest.projectId !== args.projectId || manifest.productionId !== exportRecord.productionId || manifest.contractVersion !== 4 || !timeline || timeline.projectId !== args.projectId || timeline.productionId !== exportRecord.productionId) throw new Error('Choose a completed export from this project.');
    const production = await ctx.db.get(exportRecord.productionId);
    if (!production || production.projectId !== args.projectId) throw new Error('This production is outside this project.');
    const storage = await ctx.db.system.get('_storage', exportRecord.storageId);
    if (!storage || !storage.contentType?.startsWith('video/') || storage.size <= 0) throw new Error('This export has no stored video.');
    const previous = await ctx.db.query('reviewLinks').withIndex('by_token_hash', q => q.eq('tokenHash', args.tokenHash)).unique();
    if (previous) throw new Error('Create a new review token.');
    const timestamp = now();
    const reviewId = await ctx.db.insert('reviews', { projectId: args.projectId, productionId: exportRecord.productionId, manifestId: manifest._id, timelineId: timeline._id, timelineVersionNumber: timeline.versionNumber, exportId: exportRecord._id, studioExternalId: access.project.studioExternalId, studioId: access.project.studioId, status: 'REQUESTED', requestedByUserId: access.user._id, createdAt: timestamp, updatedAt: timestamp });
    await ensureResourceState(ctx, { projectId: args.projectId, productionId: exportRecord.productionId, resourceType: 'review', resourceId: reviewId, initialState: 'IN_REVIEW' });
    const id = await ctx.db.insert('reviewLinks', { projectId: args.projectId, productionId: exportRecord.productionId, reviewId, timelineId: timeline._id, timelineVersionNumber: timeline.versionNumber, manifestId: manifest._id, exportId: exportRecord._id, label: args.label?.trim().slice(0, 100) || 'Client review', tokenHash: args.tokenHash, expiresAt, createdByUserId: access.user._id, createdAt: timestamp });
    return { id, projectId: args.projectId, exportId: exportRecord._id, label: args.label?.trim().slice(0, 100) || 'Client review', expiresAt, createdAt: timestamp };
  },
});
export const listShareLinks = query({
  args: { projectId: v.id('projects') }, returns: v.any(),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, ['OWNER', 'EDITOR']);
    const rows = await ctx.db.query('reviewLinks').withIndex('by_project', q => q.eq('projectId', args.projectId)).order('desc').take(100);
    return rows.map(row => ({ id: row._id, projectId: row.projectId, exportId: row.exportId, timelineId: row.timelineId, timelineVersionNumber: row.timelineVersionNumber, label: row.label, expiresAt: row.expiresAt, createdAt: row.createdAt, revokedAt: row.revokedAt ?? null, active: isReviewLinkActive(row) }));
  },
});
export const revokeShareLink = mutation({
  args: { projectId: v.id('projects'), linkId: v.id('reviewLinks') }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, ['OWNER', 'EDITOR']);
    const link = await ctx.db.get(args.linkId);
    if (!link || link.projectId !== args.projectId) throw new Error('Review link not found.');
    if (!link.revokedAt) await ctx.db.patch(link._id, { revokedAt: now() });
    return null;
  },
});
export const shareCandidates = query({
  args: { projectId: v.id('projects') }, returns: v.any(),
  handler: async (ctx, args) => {
    const access = await requireProjectAccess(ctx, args.projectId, ['OWNER', 'EDITOR']);
    const productions = await ctx.db.query('productions').withIndex('by_project', q => q.eq('externalProjectId', access.project.externalId)).take(100);
    const rows = [];
    for (const production of productions) {
      const exports = await ctx.db.query('exports').withIndex('by_production', q => q.eq('productionId', production._id)).order('desc').take(20);
      for (const item of exports) if (item.projectId === args.projectId && item.status === 'COMPLETED' && item.storageId && item.manifestId) {
        const manifest = await ctx.db.get(item.manifestId); const raw = record(manifest?.manifest);
        const timelineId = typeof raw.timelineId === 'string' ? ctx.db.normalizeId('timelines', raw.timelineId) : null;
        const timeline = timelineId ? await ctx.db.get(timelineId) : null;
        if (timeline && manifest?.contractVersion === 4 && timeline.projectId === args.projectId) rows.push({ id: item._id, label: `Timeline v${timeline.versionNumber} · ${production.workflow}`, created_at: new Date(item.createdAt).toISOString() });
        if (rows.length >= 100) return rows;
      }
    }
    return rows;
  },
});
export const getSharedReview = query({
  args: { token: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    try {
      const scope = await sharedReview(ctx, args.token);
      const comments = await ctx.db.query('comments').withIndex('by_review', q => q.eq('reviewId', scope.review._id)).take(REVIEW_COMMENT_LIMIT);
      return { projectName: scope.project.name, label: scope.link.label, timelineVersionNumber: scope.link.timelineVersionNumber, durationSeconds: scope.timeline.durationSeconds, status: scope.review.status, expiresAt: scope.link.expiresAt, videoUrl: await ctx.storage.getUrl(scope.exportRecord.storageId!), comments: comments.map(row => ({ id: row._id, authorName: row.authorName || 'Project reviewer', body: row.body, timeSeconds: row.timeSeconds ?? 0, createdAt: row.createdAt, resolved: Boolean(row.resolvedAt) })) };
    } catch { return null; }
  },
});
export const addSharedComment = mutation({
  args: { token: v.string(), authorName: v.string(), body: v.string(), timeSeconds: v.optional(v.number()), requestId: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    const scope = await sharedReview(ctx, args.token);
    if (scope.review.status === 'APPROVED') throw new Error('This version is approved. Request a new review for another revision.');
    const validated = validateReviewComment({ ...args, durationSeconds: scope.timeline.durationSeconds });
    const previous = await ctx.db.query('comments').withIndex('by_review_link_request', q => q.eq('reviewLinkId', scope.link._id).eq('clientRequestId', args.requestId)).unique();
    if (previous) {
      if (previous.body !== validated.body || previous.authorName !== validated.authorName || previous.timeSeconds !== args.timeSeconds) throw new Error('Comment request ID is already used.');
      return { id: previous._id, replayed: true };
    }
    const comments = await ctx.db.query('comments').withIndex('by_review', q => q.eq('reviewId', scope.review._id)).take(REVIEW_COMMENT_LIMIT);
    if (comments.length >= REVIEW_COMMENT_LIMIT) throw new Error('This review has reached its comment limit.');
    const id = await ctx.db.insert('comments', { studioExternalId: scope.review.studioExternalId, studioId: scope.review.studioId, reviewId: scope.review._id, reviewLinkId: scope.link._id, authorName: validated.authorName, body: validated.body, timeSeconds: args.timeSeconds, clientRequestId: args.requestId, createdAt: now() });
    return { id, replayed: false };
  },
});
export const decideSharedReview = mutation({
  args: { token: v.string(), authorName: v.string(), decision: v.union(v.literal('APPROVED'), v.literal('CHANGES_REQUESTED')), note: v.optional(v.string()) }, returns: v.any(),
  handler: async (ctx, args) => {
    const scope = await sharedReview(ctx, args.token);
    const authorName = args.authorName.trim(); const note = args.note?.trim();
    if (!authorName || authorName.length > 100 || (note?.length ?? 0) > 10_000 || args.decision === 'CHANGES_REQUESTED' && !note) throw new Error('Enter your name and a reason when requesting changes.');
    return await applyClientReviewDecision(ctx, { linkId: scope.link._id, tokenHash: scope.tokenHash, decision: args.decision, authorName, note });
  },
});
export const resolveSharedComment = mutation({
  args: { projectId: v.id('projects'), commentId: v.id('comments'), resolved: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, ['OWNER', 'EDITOR']);
    const comment = await ctx.db.get(args.commentId); const review = comment ? await ctx.db.get(comment.reviewId) : null;
    if (!comment || !review || review.projectId !== args.projectId) throw new Error('Review comment not found.');
    await ctx.db.patch(comment._id, { resolvedAt: args.resolved ? now() : undefined });
    return null;
  },
});
