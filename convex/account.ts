import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireIdentity } from "./identity";
import { currentStudioForUser, ownedStudioCandidates, recordedStudioOwner } from "./studioMemberships";

function now() { return Date.now(); }

export const ensureAccount = mutation({
  args: { name: v.optional(v.string()) },
  returns: v.object({ userId: v.id('users'), studioId: v.optional(v.id('studios')), studioExternalId: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const timestamp = now();
    let user = await ctx.db.query("users").withIndex("by_auth_subject", q => q.eq("authSubject", identity.externalId)).unique()
      ?? await ctx.db.query("users").withIndex("by_auth_subject", q => q.eq("authSubject", identity.subject)).unique()
      ?? await ctx.db.query("users").withIndex("by_external_id", q => q.eq("externalId", identity.externalId)).unique();
    if (!user) {
      const existing = identity.email
        ? await ctx.db.query("users").withIndex("by_email", q => q.eq("email", identity.email)).unique()
        : null;
      if (existing) {
        await ctx.db.patch(existing._id, { authSubject: identity.externalId, externalId: identity.externalId, name: args.name || existing.name, updatedAt: timestamp });
        user = await ctx.db.get(existing._id);
      } else {
        const id = await ctx.db.insert("users", { authSubject: identity.externalId, externalId: identity.externalId, email: identity.email, name: args.name || identity.name, createdAt: timestamp, updatedAt: timestamp });
        user = await ctx.db.get(id);
      }
    }
    if (!user) throw new Error("Unable to provision account");
    if (user.status === "disabled") throw new Error("This account is disabled.");

    const selected = await currentStudioForUser(ctx, user, identity.externalId);
    let studio = selected?.studio ?? null;
    let role = selected?.role ?? 'owner';
    if (!studio) {
      if ((await ownedStudioCandidates(ctx, user, identity.externalId)).length) throw new Error("Workspace access was explicitly suspended or removed. Account provisioning cannot restore it.");
      const base = `studio_${identity.externalId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const previous = await ctx.db.query("studios").withIndex("by_external_id", q => q.eq("externalId", base)).unique();
      const externalId = previous ? `${base}_${timestamp}` : base;
      const studioId = await ctx.db.insert("studios", { externalId, ownerExternalId: identity.externalId, ownerId: user._id, ownerUserId: user._id, name: `${args.name || identity.name || "My"} Studio`, credits: 0, status: "active", createdAt: timestamp, updatedAt: timestamp });
      studio = await ctx.db.get(studioId);
      role = 'owner';
    }
    if (studio) {
      const canonical = await ctx.db.query("members").withIndex("by_studio_user", q => q.eq("studioId", studio!._id).eq("userId", user!._id)).unique();
      if (canonical && canonical.status !== 'active') throw new Error("Account provisioning cannot restore an inactive workspace membership.");
      if (!canonical) await ctx.db.insert("members", { studioId: studio._id, userId: user._id, role, status: "active", createdAt: timestamp, updatedAt: timestamp });
      const legacy = await ctx.db.query("studioMembers").withIndex("by_studio_user", q => q.eq("studioExternalId", studio!.externalId).eq("userExternalId", identity.externalId)).unique();
      if (!legacy) await ctx.db.insert("studioMembers", { studioExternalId: studio.externalId, studioId: studio._id, userExternalId: identity.externalId, userId: user._id, role, status: "active", createdAt: timestamp, updatedAt: timestamp });
      if (recordedStudioOwner(studio, user, identity.externalId) && (!studio.ownerId || !studio.ownerUserId)) await ctx.db.patch(studio._id, { ownerId: user._id, ownerUserId: user._id, updatedAt: timestamp });
      if (!user.currentStudioId) await ctx.db.patch(user._id, { currentStudioId: studio._id, updatedAt: timestamp });
    }
    return { userId: user._id, studioId: studio?._id, studioExternalId: studio?.externalId };
  },
});

export const current = query({
  args: {},
  returns: v.object({ user: v.any(), studio: v.any(), role: v.union(v.null(), v.literal('owner'), v.literal('admin'), v.literal('member')) }),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const user = await ctx.db.query("users").withIndex("by_auth_subject", q => q.eq("authSubject", identity.externalId)).unique()
      ?? await ctx.db.query("users").withIndex("by_auth_subject", q => q.eq("authSubject", identity.subject)).unique();
    if (user?.status === "disabled") throw new Error("This account is disabled.");
    const selected = user ? await currentStudioForUser(ctx, user, identity.externalId) : null;
    return { user, studio: selected?.studio ?? null, role: selected?.role ?? null };
  },
});
