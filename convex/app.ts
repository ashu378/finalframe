import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireMember, requireUser } from "./authorization";

const now = () => Date.now();

async function accessibleStudio(ctx: QueryCtx | MutationCtx) {
  const authorized = await requireUser(ctx);
  const memberships = await ctx.db.query("members")
    .withIndex("by_user", q => q.eq("userId", authorized.user._id))
    .collect();
  const activeMembership = memberships.find((membership) => membership.status === "active");
  const legacyMembership = !activeMembership
    ? await ctx.db.query("studioMembers")
      .withIndex("by_user", q => q.eq("userExternalId", authorized.identity.externalId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first()
    : null;
  const studio = activeMembership
    ? await ctx.db.get(activeMembership.studioId)
    : legacyMembership?.studioExternalId
      ? await ctx.db.query("studios").withIndex("by_external_id", q => q.eq("externalId", legacyMembership.studioExternalId)).first()
    : await ctx.db.query("studios").withIndex("by_owner_user", q => q.eq("ownerUserId", authorized.user._id)).first();
  if (!studio) throw new Error("Create your studio before continuing.");
  await requireMember(ctx, studio.externalId);
  return { identity: authorized.identity, user: authorized.user, studio };
}

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const { studio } = await accessibleStudio(ctx);
    const [projects, assets, productions, jobs] = await Promise.all([
      ctx.db.query("projects").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").take(20),
      ctx.db.query("assets").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).collect(),
      ctx.db.query("productions").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).collect(),
      ctx.db.query("generationJobs").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).collect(),
    ]);
    const activeJobs = jobs.filter(job => ["QUEUED", "PROCESSING", "RETRYING", "SUBMITTED", "POLLING"].includes(job.status)).length;
    return { studio, projects, productions, stats: { totalProjects: projects.length, activeJobs, totalAssets: assets.length, creditsRemaining: studio.credits }, assets: assets.slice(0, 12) };
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
  args: {},
  handler: async (ctx) => {
    const { studio } = await accessibleStudio(ctx);
    return await ctx.db.query("assets").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").collect();
  },
});

export const updateAsset = mutation({
  args: { assetId: v.id("assets"), name: v.optional(v.string()), metadata: v.optional(v.any()), deleted: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Media not found.");
    await requireMember(ctx, asset.studioExternalId);
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
  handler: async (ctx) => {
    const { studio } = await accessibleStudio(ctx);
    await requireMember(ctx, studio.externalId);
    return await ctx.db.query("studioMembers").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).collect();
  },
});

export const inviteTeamMember = mutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("member")) },
  handler: async (ctx, args) => {
    const { identity, studio } = await accessibleStudio(ctx);
    await requireAdmin(ctx, studio.externalId);
    const existing = await ctx.db.query("studioMembers").withIndex("by_studio_user", q => q.eq("studioExternalId", studio.externalId).eq("userExternalId", args.email)).unique();
    if (existing) return { ok: true, id: existing._id };
    const id = await ctx.db.insert("studioMembers", { studioExternalId: studio.externalId, userExternalId: args.email, role: args.role, status: "invited", invitedByExternalId: identity.externalId, invitedAt: now(), createdAt: now(), updatedAt: now() });
    return { ok: true, id };
  },
});

export const updateTeamMember = mutation({
  args: { memberId: v.id("studioMembers"), role: v.union(v.literal("admin"), v.literal("member"), v.literal("owner")) },
  handler: async (ctx, args) => {
    const { studio } = await accessibleStudio(ctx);
    await requireAdmin(ctx, studio.externalId);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.studioExternalId !== studio.externalId) throw new Error("Team member not found.");
    await ctx.db.patch(member._id, { role: args.role, updatedAt: now() });
    return { ok: true };
  },
});

export const removeTeamMember = mutation({
  args: { memberId: v.id("studioMembers") },
  handler: async (ctx, args) => {
    const { studio } = await accessibleStudio(ctx);
    await requireAdmin(ctx, studio.externalId);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.studioExternalId !== studio.externalId) throw new Error("Team member not found.");
    await ctx.db.patch(member._id, { status: "suspended", updatedAt: now() });
    return { ok: true };
  },
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
  handler: async (ctx) => {
    const { studio } = await accessibleStudio(ctx);
    await requireAdmin(ctx, studio.externalId);
    const members = await ctx.db.query("studioMembers").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).order("desc").take(100);
    const profiles = await Promise.all(members.map(async (member) => {
      const user = member.userId ? await ctx.db.get(member.userId) : null;
      return user ? { ...user, role: member.role, membershipStatus: member.status } : { _id: member._id, name: undefined, email: member.userExternalId, role: member.role, membershipStatus: member.status };
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
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        errorMessage: job.errorMessage,
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
