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
        ? await ctx.db.query("users").withIndex("email", q => q.eq("email", identity.email)).unique()
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
    let studio = await ctx.db.query("studios").withIndex("by_owner", q => q.eq("ownerExternalId", identity.externalId)).first();
    if (!studio) {
      const externalId = `studio_${identity.subject.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const studioId = await ctx.db.insert("studios", { externalId, ownerExternalId: identity.externalId, name: `${args.name || identity.name || "My"} Studio`, credits: 0, createdAt: timestamp, updatedAt: timestamp });
      studio = await ctx.db.get(studioId);
      if (studio) await ctx.db.insert("studioMembers", { studioExternalId: studio.externalId, userExternalId: identity.externalId, role: "owner", status: "active", createdAt: timestamp, updatedAt: timestamp });
    }
    return { userId: user._id, studioId: studio?._id, studioExternalId: studio?.externalId };
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const user = await ctx.db.query("users").withIndex("by_auth_subject", q => q.eq("authSubject", identity.subject)).unique();
    const studio = await ctx.db.query("studios").withIndex("by_owner", q => q.eq("ownerExternalId", identity.externalId)).first();
    return { user, studio };
  },
});
