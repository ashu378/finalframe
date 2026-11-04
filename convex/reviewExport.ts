import { internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v, type Infer } from "convex/values";
import { requireProjectAccess, requireProjectRole, resolveProjectAccessForActor } from "./authorization";
import { ensureResourceState, requireApprovedResource } from "./resourceStates";
import { applyClientReviewDecision, transitionResourceState } from "./approvals";
import { assertReviewToken, isReviewLinkActive, REVIEW_COMMENT_LIMIT, REVIEW_LINK_DEFAULT_AGE_MS, REVIEW_LINK_MAX_AGE_MS, validateReviewComment } from "./reviewLinkContracts";
import { publicRenderJob } from "./renderWorkerContracts";
import { now } from "./_shared";
import { assertStoredRenderMediaType } from '../renderer/src/output-format';
import { reviewMediaPath } from './reviewMediaContract';

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

async function authorizedProduction(ctx: ReadCtx, productionId: Id<"productions">,actorId?:Id<"users">) {
  const production = await ctx.db.get(productionId);
  if (!production) throw new Error("Production not found.");
  if (!production.projectId) throw new Error("Production project ownership must be migrated first.");
  const member = actorId?await resolveProjectAccessForActor(ctx,production.projectId,actorId,["OWNER","EDITOR"]):await requireProjectAccess(ctx, production.projectId);
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

const requestReviewArgs={ productionId: v.id("productions"), manifestId: v.id("manifests"), idempotencyKey: v.string(), correlationId: v.optional(v.string()) };
const requestReviewValidator=v.object(requestReviewArgs);
export const requestReview=mutation({args:requestReviewArgs,returns:v.any(),handler:(ctx,args)=>requestCanonicalReview(ctx,args)});
export async function requestCanonicalReview(ctx:MutationCtx,args:Infer<typeof requestReviewValidator>,actorId?:Id<'users'>){
    const { production, member } = await authorizedProduction(ctx, args.productionId,actorId);
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest || manifest.productionId !== production._id || manifest.studioExternalId !== member.studio.externalId) throw new Error("Assembly manifest not found.");
    const manifestData = record(manifest.manifest);
    if ((manifestData.version !== 4 && manifestData.version !== 5) || manifestData.version !== manifest.contractVersion || !production.projectId || manifest.projectId !== production.projectId || manifestData.projectId !== production.projectId.toString() || !manifestData.timelineId || !Array.isArray(manifestData.items)) throw new Error("This assembly manifest is not ready for review.");
    const timeline = await ctx.db.get(String(manifestData.timelineId) as Id<"timelines">);
    if (!timeline || timeline.projectId !== production.projectId || timeline.productionId !== production._id) throw new Error("This timeline is outside this production.");
    await requireApprovedResource(ctx, production.projectId, "timeline", timeline._id, production._id,actorId);
    const key = requiredKey(args.idempotencyKey, "Review request key");
    if (production.projectId) actorId?await resolveProjectAccessForActor(ctx,production.projectId,actorId,["OWNER","EDITOR"]):await requireProjectRole(ctx, production.projectId, ["OWNER", "EDITOR"]);
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
      },actorId);
    }
    await ctx.db.insert("approvals", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: production._id, reviewId, resourceType: "reviewRequest", resourceId: key, decision: "REQUESTED", actorUserId: member.user._id, note: `reviewId:${reviewId.toString()}`, createdAt: timestamp });
    return await ctx.db.get(reviewId);
}

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
    if(!("identity" in member))throw new Error("Verified session is required for comments.");
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

const requestExportArgs={ productionId: v.id("productions"), manifestId: v.id("manifests"), reviewId: v.id("reviews"), preset: v.optional(v.string()), idempotencyKey: v.string(), correlationId: v.optional(v.string()) };
const requestExportValidator=v.object(requestExportArgs);
export const requestExport=mutation({args:requestExportArgs,returns:v.any(),handler:(ctx,args)=>requestCanonicalExport(ctx,args)});
export async function requestCanonicalExport(ctx:MutationCtx,args:Infer<typeof requestExportValidator>,actorId?:Id<'users'>){
    const { production, member } = await authorizedProduction(ctx, args.productionId,actorId);
    const manifest = await ctx.db.get(args.manifestId);
    const review = await ctx.db.get(args.reviewId);
    if (!manifest || manifest.productionId !== production._id || manifest.studioExternalId !== member.studio.externalId) throw new Error("Assembly manifest not found.");
    if (!review || review.productionId !== production._id || review.studioExternalId !== member.studio.externalId || review.status !== "APPROVED") throw new Error("Approve the review before requesting an export.");
    if (production.projectId) await requireApprovedResource(ctx, production.projectId, "review", review._id.toString(), production._id,actorId);
    const manifestData = record(manifest.manifest);
    if ((manifestData.version !== 4 && manifestData.version !== 5) || manifestData.version !== manifest.contractVersion || !manifest.projectId || !production.projectId || manifest.projectId !== production.projectId || manifestData.projectId !== production.projectId.toString()) throw new Error("Only canonical manifest v4/v5 for this project can be exported.");
    if (!review.manifestId || review.manifestId !== manifest._id || review.timelineId !== manifestData.timelineId) throw new Error("This approval belongs to a different assembly version. Request a review of this exact manifest.");
    actorId?await resolveProjectAccessForActor(ctx,production.projectId,actorId,["OWNER","EDITOR"]):await requireProjectRole(ctx, production.projectId, ["OWNER", "EDITOR"]);
    const reviewedTimeline = review.timelineId ? await ctx.db.get(review.timelineId) : null;
    if (!reviewedTimeline || reviewedTimeline.projectId !== production.projectId || reviewedTimeline.productionId !== production._id || reviewedTimeline.versionNumber !== review.timelineVersionNumber) throw new Error("The approved timeline version is unavailable.");
    await requireApprovedResource(ctx, production.projectId, "timeline", reviewedTimeline._id, production._id,actorId);
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
}

export const getExport = query({
  args: { exportId: v.id("exports") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const exportRecord = await ctx.db.get(args.exportId);
    if (!exportRecord) throw new Error("Export not found.");
    const { production } = await authorizedProduction(ctx, exportRecord.productionId);
    if (exportRecord.projectId && exportRecord.projectId !== production.projectId) throw new Error("Export not found.");
    const job = exportRecord.renderJobId ? await ctx.db.get(exportRecord.renderJobId) : null;
    let url: string | null | undefined;
    if (exportRecord.storageId && exportRecord.status === 'COMPLETED') {
      const manifestId = exportRecord.manifestId ?? job?.manifestId;
      const [manifest, storage] = await Promise.all([manifestId ? ctx.db.get(manifestId) : null, ctx.db.system.get('_storage', exportRecord.storageId)]);
      if (manifestId && (!manifest || manifest.productionId !== production._id || manifest.projectId && manifest.projectId !== production.projectId)) throw new Error('Export manifest ownership is unavailable.');
      if (!storage || storage.size < 1) throw new Error('Export media is unavailable.');
      assertStoredRenderMediaType(manifest?.manifest, manifest?.contractVersion, storage.contentType, exportRecord.mimeType);
      url = await ctx.storage.getUrl(exportRecord.storageId);
    }
    return { ...exportRecord, progress: exportRecord.progress ?? job?.progress ?? 0, jobStatus: job?.status, downloadUrl: url };
  },
});

async function hashToken(token: string) {
  assertReviewToken(token);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function shareableExport(ctx: ReadCtx, exportRecord: Doc<'exports'>, projectId: Id<'projects'>, productionId: Id<'productions'>) {
  if (exportRecord.projectId !== projectId || exportRecord.productionId !== productionId || exportRecord.status !== 'COMPLETED' || !exportRecord.storageId || !exportRecord.manifestId) return null;
  const manifest = await ctx.db.get(exportRecord.manifestId);
  if (!manifest || manifest.projectId !== projectId || manifest.productionId !== productionId || (manifest.contractVersion !== 4 && manifest.contractVersion !== 5)) return null;
  const data = record(manifest.manifest);
  if (data.version !== manifest.contractVersion || typeof data.timelineId !== 'string') return null;
  const timelineId = ctx.db.normalizeId('timelines', data.timelineId);
  if (!timelineId) return null;
  const [timeline, storage] = await Promise.all([ctx.db.get(timelineId), ctx.db.system.get('_storage', exportRecord.storageId)]);
  if (!timeline || timeline.projectId !== projectId || timeline.productionId !== productionId || (data.timelineVersionNumber !== undefined && timeline.versionNumber !== data.timelineVersionNumber) || !storage || storage.size <= 0) return null;
  const { durationInFrames, fps } = record(data.output);
  if (typeof durationInFrames !== 'number' || !Number.isSafeInteger(durationInFrames) || durationInFrames < 1 || typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) return null;
  return { manifest, timeline, storage, durationSeconds: durationInFrames / fps };
}

function exactLinkedReview(review: Doc<'reviews'> | null, link: Doc<'reviewLinks'>): review is Doc<'reviews'> {
  return Boolean(review && review.projectId === link.projectId && review.productionId === link.productionId && review.timelineId === link.timelineId && review.manifestId === link.manifestId && review.exportId === link.exportId && review.timelineVersionNumber === link.timelineVersionNumber);
}

async function exactReviewScope(ctx: ReadCtx, link: Doc<'reviewLinks'>) {
  if (!isReviewLinkActive(link)) throw new Error('This review link is unavailable.');
  const [project, production, review, exportRecord] = await Promise.all([
    ctx.db.get(link.projectId), ctx.db.get(link.productionId), ctx.db.get(link.reviewId), link.exportId ? ctx.db.get(link.exportId) : null,
  ]);
  if (!project || project.deletedAt || project.archivedAt || ['ARCHIVED', 'DELETED'].includes(String(project.status).toUpperCase()) || project.moderationStatus === 'RESTRICTED' || !production || production.projectId !== project._id || !exactLinkedReview(review, link) || !exportRecord) throw new Error('This review version is unavailable.');
  const output = await shareableExport(ctx, exportRecord, project._id, production._id);
  if (!output || output.manifest._id !== link.manifestId || output.timeline._id !== link.timelineId || output.timeline.versionNumber !== link.timelineVersionNumber) throw new Error('This review version is unavailable.');
  assertStoredRenderMediaType(output.manifest.manifest, output.manifest.contractVersion, output.storage.contentType, exportRecord.mimeType);
  return { project, production, review, ...output, exportRecord };
}
async function sharedReview(ctx: ReadCtx, token: string) {
  const tokenHash = await hashToken(token);
  const link = await ctx.db.query('reviewLinks').withIndex('by_token_hash', q => q.eq('tokenHash', tokenHash)).unique();
  if (!link) throw new Error('This review link is unavailable.');
  return { link, tokenHash, ...await exactReviewScope(ctx, link) };
}

/** Owner/editor creation accepts a SHA-256 hash. The application generates a
 * cryptographically random one-time token server-side and stores only its hash. */
export const createShareLink = mutation({
  args: { projectId: v.id('projects'), exportId: v.id('exports'), tokenHash: v.string(), label: v.optional(v.string()), expiresAt: v.optional(v.number()) }, returns: v.any(),
  handler: async (ctx, args) => {
    const access = await requireProjectAccess(ctx, args.projectId, ['OWNER', 'EDITOR']);
    if (access.project.archivedAt) throw new Error('Restore the project before sharing an export.');
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash)) throw new Error('A secure review token hash is required.');
    const expiresAt = args.expiresAt ?? now() + REVIEW_LINK_DEFAULT_AGE_MS;
    if (!Number.isFinite(expiresAt) || expiresAt <= now() || expiresAt > now() + REVIEW_LINK_MAX_AGE_MS) throw new Error('Review expiry must be within the next 30 days.');
    const exportRecord = await ctx.db.get(args.exportId);
    const output = exportRecord ? await shareableExport(ctx, exportRecord, args.projectId, exportRecord.productionId) : null;
    if (!exportRecord || !output) throw new Error('Choose a completed export from this project.');
    const { manifest, timeline } = output;
    const production = await ctx.db.get(exportRecord.productionId);
    if (!production || production.projectId !== args.projectId) throw new Error('This production is outside this project.');
    assertStoredRenderMediaType(manifest.manifest, manifest.contractVersion, output.storage.contentType, exportRecord.mimeType);
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

export const getShareFeedback = query({
  args: { projectId: v.id('projects'), linkId: v.id('reviewLinks') },
  returns: v.object({
    timelineVersionNumber: v.number(), status: v.string(), decisionNote: v.union(v.string(), v.null()),
    comments: v.array(v.object({ id: v.id('comments'), authorName: v.string(), body: v.string(), timeSeconds: v.union(v.number(), v.null()), resolved: v.boolean() })),
  }),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, ['OWNER', 'EDITOR']);
    const link = await ctx.db.get(args.linkId);
    if (!link || link.projectId !== args.projectId) throw new Error('Review link not found.');
    const review = await ctx.db.get(link.reviewId);
    if (!exactLinkedReview(review, link) || !link.exportId) throw new Error('This review version is unavailable.');
    const [comments, decisions] = await Promise.all([
      ctx.db.query('comments').withIndex('by_review_link_request', q => q.eq('reviewLinkId', link._id)).take(REVIEW_COMMENT_LIMIT),
      ctx.db.query('approvals').withIndex('by_resource', q => q.eq('resourceType', 'review').eq('resourceId', review._id)).order('desc').take(100),
    ]);
    const decision = decisions.find(row => row.projectId === args.projectId && row.productionId === link.productionId && row.reviewId === review._id && ['CLIENT_APPROVED', 'CLIENT_REVISION_REQUESTED'].includes(row.decision));
    return {
      timelineVersionNumber: link.timelineVersionNumber, status: review.status, decisionNote: decision?.note ?? null,
      comments: comments.filter(row => row.reviewId === review._id).map(row => ({ id: row._id, authorName: row.authorName || 'Project reviewer', body: row.body, timeSeconds: row.timeSeconds ?? null, resolved: Boolean(row.resolvedAt) })),
    };
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
    if (access.project.archivedAt) return [];
    const productions = await ctx.db.query('productions').withIndex('by_project_id', q => q.eq('projectId', args.projectId)).take(100);
    const rows = [];
    for (const production of productions) {
      const exports = await ctx.db.query('exports').withIndex('by_production', q => q.eq('productionId', production._id)).order('desc').take(20);
      for (const item of exports) {
        const output = await shareableExport(ctx, item, args.projectId, production._id);
        if (output) {
          try { assertStoredRenderMediaType(output.manifest.manifest, output.manifest.contractVersion, output.storage.contentType, item.mimeType); }
          catch { continue; }
          const scope = record(record(output.manifest.manifest).selection).scope;
          const selection = scope === 'SHOTS' ? 'Selected shots' : scope === 'SCENES' ? 'Selected scenes' : scope === 'TIMELINE' ? 'Timeline cut' : 'Full project';
          rows.push({ id: item._id, label: `Timeline v${output.timeline.versionNumber} · ${production.workflow} · ${selection}`, created_at: new Date(item.createdAt).toISOString() });
        }
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
      return { projectName: scope.project.name, label: scope.link.label, timelineVersionNumber: scope.link.timelineVersionNumber, durationSeconds: scope.durationSeconds, status: scope.review.status, expiresAt: scope.link.expiresAt, videoUrl: reviewMediaPath('export', args.token), comments: comments.map(row => ({ id: row._id, authorName: row.authorName || 'Project reviewer', body: row.body, timeSeconds: row.timeSeconds ?? 0, createdAt: row.createdAt, resolved: Boolean(row.resolvedAt) })) };
    } catch { return null; }
  },
});
export const resolveSharedMedia = internalQuery({
  args: { token: v.string() },
  returns: v.union(v.null(), v.object({ url: v.string(), size: v.number(), contentType: v.string() })),
  handler: async (ctx, args) => {
    try {
      const scope = await sharedReview(ctx, args.token);
      const url = await ctx.storage.getUrl(scope.exportRecord.storageId!);
      return url && scope.storage.contentType ? { url, size: scope.storage.size, contentType: scope.storage.contentType } : null;
    } catch { return null; }
  },
});
export const addSharedComment = mutation({
  args: { token: v.string(), authorName: v.string(), body: v.string(), timeSeconds: v.optional(v.number()), requestId: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    const scope = await sharedReview(ctx, args.token);
    if (scope.review.status === 'APPROVED') throw new Error('This version is approved. Request a new review for another revision.');
    const validated = validateReviewComment({ ...args, durationSeconds: scope.durationSeconds });
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
