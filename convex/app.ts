import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireMember } from "./authorization";
import { requireIdentity } from "./identity";

const now = () => Date.now();

async function ownedStudio(ctx: QueryCtx | MutationCtx) {
  const identity = await requireIdentity(ctx);
  const studio = await ctx.db.query("studios").withIndex("by_owner", q => q.eq("ownerExternalId", identity.externalId)).first();
  if (!studio) throw new Error("Create your studio before continuing.");
  return { identity, studio };
}

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const { studio } = await ownedStudio(ctx);
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
    const { studio } = await ownedStudio(ctx);
    return studio.metadata ?? {};
  },
});

export const saveOnboarding = mutation({
  args: { data: v.any() },
  handler: async (ctx, args) => {
    const { studio } = await ownedStudio(ctx);
    const current = (studio.metadata && typeof studio.metadata === "object" ? studio.metadata : {}) as Record<string, unknown>;
    await ctx.db.patch(studio._id, { metadata: { ...current, ...(args.data as Record<string, unknown>), updatedAt: now() }, updatedAt: now() });
    return { ok: true };
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const { studio } = await ownedStudio(ctx);
    const current = (studio.metadata && typeof studio.metadata === "object" ? studio.metadata : {}) as Record<string, unknown>;
    await ctx.db.patch(studio._id, { metadata: { ...current, onboardingCompleted: true, updatedAt: now() }, updatedAt: now() });
    return { ok: true };
  },
});

export const listAssets = query({
  args: {},
  handler: async (ctx) => {
    const { studio } = await ownedStudio(ctx);
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
    const { studio } = await ownedStudio(ctx);
    await requireMember(ctx, studio.externalId);
    return await ctx.db.query("studioMembers").withIndex("by_studio", q => q.eq("studioExternalId", studio.externalId)).collect();
  },
});

export const inviteTeamMember = mutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("member")) },
  handler: async (ctx, args) => {
    const { identity, studio } = await ownedStudio(ctx);
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
    const { studio } = await ownedStudio(ctx);
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
    const { studio } = await ownedStudio(ctx);
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
    const { studio } = await ownedStudio(ctx);
    await requireAdmin(ctx, studio.externalId);
    const [users, studios, projects, jobs, failedJobs] = await Promise.all([
      ctx.db.query("users").collect(), ctx.db.query("studios").collect(), ctx.db.query("projects").collect(),
      ctx.db.query("generationJobs").collect(), ctx.db.query("generationJobs").filter(q => q.eq(q.field("status"), "FAILED")).collect(),
    ]);
    return { counts: { users: users.length, studios: studios.length, projects: projects.length, jobs: jobs.length, failedJobs: failedJobs.length } };
  },
});

export const adminUsers = query({
  args: {},
  handler: async (ctx) => {
    const { studio } = await ownedStudio(ctx);
    await requireAdmin(ctx, studio.externalId);
    return await ctx.db.query("users").order("desc").take(100);
  },
});
