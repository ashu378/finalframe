import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireCurrentMember, requireMember, requireProjectAccess, requireProjectRole } from "./authorization";
import { ConvexAuthorizationError } from "./auth";
import { publicJob } from "./generationWorkerContracts";

const STUDIO_JOB_ERROR_CODES = new Set([
  'MISSING_API_KEY','WORKER_DISABLED','PROVIDER_RATE_LIMIT','PROVIDER_PAYMENT_REQUIRED','PROVIDER_GENERATION_FAILED',
  'REQUEST_TIMEOUT','NETWORK_ERROR','INVALID_REQUEST','UNSUPPORTED_MODEL','UNSUPPORTED_CAPABILITY','GENERATION_WORKER_ERROR',
  'RECONCILIATION_REQUIRED','MEDIA_VALIDATION_FAILED','MEDIA_PROBE_BUSY','MEDIA_PROBE_UNAVAILABLE',
  'RECIPE_CAST_REFERENCES_REQUIRED','RECIPE_CAST_BINDING_CHANGED','RECIPE_CAST_RESOURCE_UNAVAILABLE',
  'SFX_OUTPUT_INVALID','SFX_OUTPUT_CHANGED','SFX_QC_INVALID_RESPONSE','SFX_QC_AUTHORITY_DENIED','SFX_OUTPUT_REVIEW_REQUIRED','SFX_QC_PENDING','SFX_QC_UNAVAILABLE',
  'MUSIC_OUTPUT_INVALID','MUSIC_OUTPUT_CHANGED','MUSIC_DURATION_REVIEW_REQUIRED','MUSIC_QC_INVALID_RESPONSE','MUSIC_QC_AUTHORITY_DENIED','MUSIC_OUTPUT_REVIEW_REQUIRED','MUSIC_QC_PENDING','MUSIC_QC_UNAVAILABLE',
  'IMAGE_FINALIZE_PENDING','IMAGE_OUTPUT_CHANGED','IMAGE_OUTPUT_INVALID',
]);
function studioJobDiagnostic(job: Record<string, unknown>) {
  const recorded = typeof job.errorCode === 'string' && STUDIO_JOB_ERROR_CODES.has(job.errorCode) ? job.errorCode : undefined;
  const needsFallback = Boolean(job.errorCode || job.errorMessage || job.status === 'FAILED');
  const code = job.status === 'COMPLETED'
    ? undefined
    : recorded ?? (job.executionStage === 'RECONCILIATION_REQUIRED'
      ? 'RECONCILIATION_REQUIRED'
      : needsFallback ? 'GENERATION_FAILED' : undefined);
  // Legacy error strings may contain provider payloads. Reuse the public worker
  // guidance, but only after replacing any unrecognized recorded code.
  const projected = publicJob({ ...job, errorCode: code });
  return { errorCode: code, errorMessage: projected.errorMessage };
}
function studioRouteReason(request: unknown) {
  const path = request && typeof request === 'object' && !Array.isArray(request)
    ? (request as Record<string, unknown>).path
    : undefined;
  if (path === 'AI_VIDEO') return 'A compatible video-model route was selected under the reviewed studio policy.';
  if (path === 'COMPOSITED') return 'A reviewed composition route combines approved project media.';
  if (path === 'MOTION_GRAPHICS') return 'Deterministic graphics use the project composition route.';
  return undefined;
}

const now = () => Date.now();

async function accessibleStudio(ctx: QueryCtx | MutationCtx) {
  // Keep dashboard resolution aligned with the authorization helper used by
  // project operations. It also handles legacy ownerExternalId records while
  // account.ensureAccount backfills canonical owner and membership fields.
  const member = await requireCurrentMember(ctx);
  return { identity: member.identity, user: member.user, studio: member.studio };
}

export const dashboard = query({
  args: {},
  returns: v.object({ studio: v.any(), projects: v.array(v.any()), productions: v.array(v.any()), assets: v.array(v.any()), stats: v.object({ totalProjects: v.number(), activeJobs: v.number(), totalAssets: v.number(), creditsRemaining: v.number(), summaryLimited: v.boolean() }) }),
  handler: async (ctx) => {
    const { studio } = await accessibleStudio(ctx);
    // Bound the overview, then authorize before returning names, media or counts.
    // Studio membership alone never grants visibility into another project.
    const limit = 500;
    const [projectRows, assetRows, productionRows, jobRows] = await Promise.all([
      ctx.db.query("projects").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").take(limit + 1),
      ctx.db.query("assets").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").take(limit + 1),
      ctx.db.query("productions").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").take(limit + 1),
      ctx.db.query("generationJobs").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").take(limit + 1),
    ]);
    const authorized = await Promise.all(projectRows.slice(0, limit).map(async project => {
      if (project.deletedAt !== undefined || project.archivedAt !== undefined || ["DELETED", "ARCHIVED"].includes(project.status ?? "")) return null;
      try {
        await requireProjectAccess(ctx, project._id);
        return project;
      } catch (error) {
        if (error instanceof ConvexAuthorizationError) return null;
        throw error;
      }
    }));
    const projects = authorized.filter(project => project !== null);
    const projectIds = new Set(projects.map(project => project._id));
    const externalIds = new Set(projects.map(project => project.externalId));
    const productions = productionRows.slice(0, limit).filter(production => production.projectId ? projectIds.has(production.projectId) : externalIds.has(production.externalProjectId));
    const productionIds = new Set(productions.map(production => production._id));
    const assets = assetRows.slice(0, limit).filter(asset => asset.deletedAt === undefined && (asset.projectId ? projectIds.has(asset.projectId) : asset.productionId ? productionIds.has(asset.productionId) : asset.scope !== "PROJECT"));
    const jobs = jobRows.slice(0, limit).filter(job => job.projectId ? projectIds.has(job.projectId) : productionIds.has(job.productionId));
    const activeJobs = jobs.filter(job => ["QUEUED", "PROCESSING", "RETRYING", "SUBMITTED", "POLLING", "PENDING"].includes(job.status)).length;
    const summaryLimited = [projectRows, assetRows, productionRows, jobRows].some(rows => rows.length > limit);
    return { studio, projects: projects.slice(0, 20), productions, stats: { totalProjects: projects.length, activeJobs, totalAssets: assets.length, creditsRemaining: studio.credits, summaryLimited }, assets: assets.slice(0, 12) };
  },
});

export const onboarding = query({
  args: {},
  handler: async (ctx) => {
    const { studio } = await accessibleStudio(ctx);
    return studio.metadata ?? {};
  },
});

export const saveOnboarding = mutation({
  args: { data: v.any() },
  handler: async (ctx, args) => {
    const { studio } = await accessibleStudio(ctx);
    const current = (studio.metadata && typeof studio.metadata === "object" ? studio.metadata : {}) as Record<string, unknown>;
    await ctx.db.patch(studio._id, { metadata: { ...current, ...(args.data as Record<string, unknown>), updatedAt: now() }, updatedAt: now() });
    return { ok: true };
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const { studio } = await accessibleStudio(ctx);
    const current = (studio.metadata && typeof studio.metadata === "object" ? studio.metadata : {}) as Record<string, unknown>;
    await ctx.db.patch(studio._id, { metadata: { ...current, onboardingCompleted: true, updatedAt: now() }, updatedAt: now() });
    return { ok: true };
  },
});

export const saveFriendlyOnboarding = mutation({
  args: {
    studioName: v.optional(v.string()),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const { studio } = await accessibleStudio(ctx);
    const current = (studio.metadata && typeof studio.metadata === "object" ? studio.metadata : {}) as Record<string, unknown>;
    const studioName = args.studioName?.trim();
    await ctx.db.patch(studio._id, {
      ...(studioName ? { name: studioName } : {}),
      metadata: { ...current, ...(args.data as Record<string, unknown>), onboardingCompleted: true, updatedAt: now() },
      updatedAt: now(),
    });
    return { ok: true, studioId: studio._id };
  },
});

export const listAssets = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const { studio } = await accessibleStudio(ctx);
    if (args.projectId) {
      await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR", "REVIEWER", "VIEWER"]);
      return await ctx.db.query("assets").withIndex("by_project", q => q.eq("projectId", args.projectId)).order("desc").collect();
    }
    const assets = await ctx.db.query("assets").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").collect();
    return assets.filter((asset) => asset.scope !== "PROJECT" && !asset.projectId && !asset.deletedAt);
  },
});

export const updateAsset = mutation({
  args: { assetId: v.id("assets"), name: v.optional(v.string()), metadata: v.optional(v.any()), deleted: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Media not found.");
    if (asset.projectId) {
      await requireProjectRole(ctx, asset.projectId, ["OWNER", "EDITOR"]);
    } else {
      await requireMember(ctx, asset.studioExternalId);
    }
    const patch: Record<string, unknown> = { updatedAt: now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.metadata !== undefined) patch.metadata = args.metadata;
    if (args.deleted) patch.deletedAt = now();
    await ctx.db.patch(asset._id, patch as never);
    return { ok: true };
  },
});

export const team = query({
  args: {},
  handler: async () => { throw new Error("The legacy team directory is retired. Use the authorized paginated team roster."); },
});

export const inviteTeamMember = mutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("member")) },
  handler: async () => { throw new Error("Legacy team mutations are retired. Use canonical recipient-ID invitations and audited workspace controls."); },
});

export const updateTeamMember = mutation({
  args: { memberId: v.id("studioMembers"), role: v.union(v.literal("admin"), v.literal("member"), v.literal("owner")) },
  handler: async () => { throw new Error("Legacy team mutations are retired. Use canonical recipient-ID invitations and audited workspace controls."); },
});

export const removeTeamMember = mutation({
  args: { memberId: v.id("studioMembers") },
  handler: async () => { throw new Error("Legacy team mutations are retired. Use canonical recipient-ID invitations and audited workspace controls."); },
});

export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    const { studio } = await accessibleStudio(ctx);
    await requireAdmin(ctx, studio.externalId);
    const [members, projects, jobs] = await Promise.all([
      ctx.db.query("studioMembers").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).collect(),
      ctx.db.query("projects").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).collect(),
      ctx.db.query("generationJobs").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).collect(),
    ]);
    return { counts: { users: members.filter((member) => member.status === "active").length, studios: 1, projects: projects.length, jobs: jobs.length, failedJobs: jobs.filter((job) => job.status === "FAILED").length } };
  },
});

export const adminUsers = query({
  args: {},
  returns: v.array(v.object({ _id: v.string(), name: v.string(), role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')), membershipStatus: v.string() })),
  handler: async (ctx) => {
    const { studio } = await accessibleStudio(ctx);
    await requireAdmin(ctx, studio.externalId);
    const members = await ctx.db.query("studioMembers").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").take(100);
    const profiles = await Promise.all(members.map(async (member) => {
      const user = member.userId ? await ctx.db.get(member.userId) : null;
      const canonical = user ? await ctx.db.query('members').withIndex('by_studio_user', q => q.eq('studioId', studio._id).eq('userId', user._id)).unique() : null;
      return { _id: user?._id ?? member._id, name: user?.displayName || user?.name || 'Legacy membership without an available canonical account', role: canonical?.role ?? member.role, membershipStatus: canonical?.status ?? member.status };
    }));
    return profiles;
  },
});

export const adminOperations = query({
  args: {},
  handler: async (ctx) => {
    const { studio } = await accessibleStudio(ctx);
    await requireAdmin(ctx, studio.externalId);
    const [jobs, payments, reservations, audit] = await Promise.all([
      ctx.db.query("generationJobs").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").take(100),
      ctx.db.query("paymentPurchases").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").take(100),
      ctx.db.query("creditReservations").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").take(100),
      ctx.db.query("auditEvents").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").take(100),
    ]);
    return {
      jobs: jobs.map((job) => ({
        id: job._id,
        status: job.status,
        provider: job.provider,
        model: job.model,
        estimatedProviderCostUsd: job.estimatedProviderCostUsd,
        providerCostUsd: job.providerCostUsd,
        routeReason: studioRouteReason(job.request),
        correlationId:job.correlationId,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        ...studioJobDiagnostic(job),
      })),
      payments: payments.map((payment) => ({
        id: payment._id,
        status: payment.status,
        provider: payment.provider,
        amount: payment.amount,
        currency: payment.currency,
        credits: payment.credits,
        createdAt: payment.createdAt,
      })),
      reservations: reservations.map((reservation) => ({
        id: reservation._id,
        status: reservation.status,
        amount: reservation.amount,
        createdAt: reservation.createdAt,
        expiresAt: reservation.expiresAt,
      })),
      audit: audit.map((event) => ({
        id: event._id,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        createdAt: event.createdAt,
      })),
    };
  },
});
