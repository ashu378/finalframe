import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireIdentity } from "./identity";

function now() { return Date.now(); }

export const ensureAccount = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const timestamp = now();
    let user = await ctx.db.query("users").withIndex("by_auth_subject", q => q.eq("authSubject", identity.subject)).unique();
    if (!user) {
      const existing = identity.email
        ? await ctx.db.query("users").withIndex("by_email", q => q.eq("email", identity.email)).unique()
        : null;
      if (existing) {
        await ctx.db.patch(existing._id, { authSubject: identity.subject, externalId: identity.externalId, name: args.name || existing.name, updatedAt: timestamp });
        user = await ctx.db.get(existing._id);
      } else {
        const id = await ctx.db.insert("users", { authSubject: identity.subject, externalId: identity.externalId, email: identity.email, name: args.name || identity.name, createdAt: timestamp, updatedAt: timestamp });
        user = await ctx.db.get(id);
      }
    }
    if (!user) throw new Error("Unable to provision account");
    if (user.status === "disabled") throw new Error("This account is disabled.");

    let studio = await ctx.db.query("studios").withIndex("by_owner_user", q => q.eq("ownerUserId", user!._id)).first();
    if (!studio) {
      studio = await ctx.db.query("studios").withIndex("by_owner", q => q.eq("ownerExternalId", identity.externalId)).first();
    }
    if (!studio) {
      const externalId = `studio_${identity.subject.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const studioId = await ctx.db.insert("studios", {
        externalId,
        ownerExternalId: identity.externalId,
        ownerId: user._id,
        ownerUserId: user._id,
        name: `${args.name || identity.name || "My"} Studio`,
        credits: 0,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      studio = await ctx.db.get(studioId);
    }

    if (studio) {
      // Backfill canonical ownership/membership for accounts created before
      // the internal-ID membership table was introduced.
      if (!studio.ownerId || !studio.ownerUserId) {
        await ctx.db.patch(studio._id, { ownerId: user._id, ownerUserId: user._id, updatedAt: timestamp });
      }

      const canonicalMembership = await ctx.db.query("members")
        .withIndex("by_studio_user", q => q.eq("studioId", studio!._id).eq("userId", user!._id))
        .unique();
      if (!canonicalMembership) {
        await ctx.db.insert("members", {
          studioId: studio._id,
          userId: user._id,
          role: "owner",
          status: "active",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } else if (canonicalMembership.status !== "active" || canonicalMembership.role !== "owner") {
        await ctx.db.patch(canonicalMembership._id, { role: "owner", status: "active", updatedAt: timestamp });
      }

      const legacyMembership = await ctx.db.query("studioMembers")
        .withIndex("by_studio_user", q => q.eq("studioExternalId", studio!.externalId).eq("userExternalId", identity.externalId))
        .unique();
      if (!legacyMembership) {
        await ctx.db.insert("studioMembers", {
          studioExternalId: studio.externalId,
          studioId: studio._id,
          userExternalId: identity.externalId,
          userId: user._id,
          role: "owner",
          status: "active",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
    return { userId: user._id, studioId: studio?._id, studioExternalId: studio?.externalId };
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const user = await ctx.db.query("users").withIndex("by_auth_subject", q => q.eq("authSubject", identity.subject)).unique();
    const studio = user
      ? await ctx.db.query("studios").withIndex("by_owner_user", q => q.eq("ownerUserId", user._id)).first()
        ?? await ctx.db.query("studios").withIndex("by_owner", q => q.eq("ownerExternalId", identity.externalId)).first()
      : null;
    return { user, studio };
  },
});
