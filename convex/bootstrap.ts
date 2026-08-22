import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { now, requireStudio } from "./_shared";

export const ensureStudio = mutation({
  args: {
    ownerExternalId: v.string(),
    studioExternalId: v.string(),
    name: v.string(),
    initialCredits: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("studios")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.studioExternalId))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("studios", {
      externalId: args.studioExternalId,
      ownerExternalId: args.ownerExternalId,
      name: args.name,
      credits: args.initialCredits ?? 0,
      createdAt: now(),
      updatedAt: now(),
    });
  },
});

export const mirrorProject = mutation({
  args: {
    ownerExternalId: v.string(),
    studioExternalId: v.string(),
    projectExternalId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const studio = await ctx.db.query("studios").withIndex("by_external_id", (q) => q.eq("externalId", args.studioExternalId)).unique();
    if (!studio || studio.ownerExternalId !== args.ownerExternalId) throw new Error("Studio not found");
    const existing = await ctx.db.query("projects").withIndex("by_external_id", (q) => q.eq("externalId", args.projectExternalId)).unique();
    if (existing) return existing._id;
    return await ctx.db.insert("projects", { externalId: args.projectExternalId, studioExternalId: args.studioExternalId, name: args.name, description: args.description, createdAt: now(), updatedAt: now() });
  },
});

export const mirrorAsset = mutation({
  args: {
    ownerExternalId: v.string(),
    studioExternalId: v.string(),
    productionId: v.id("productions"),
    assetExternalId: v.string(),
    source: v.string(),
    roles: v.array(v.string()),
    name: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    storageUrl: v.optional(v.string()),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    await requireStudio(ctx, args.studioExternalId, args.ownerExternalId);
    const existing = await ctx.db.query("assets").withIndex("by_external_id", (q) => q.eq("externalId", args.assetExternalId)).unique();
    if (existing) return existing._id;
    return await ctx.db.insert("assets", { externalId: args.assetExternalId, productionId: args.productionId, studioExternalId: args.studioExternalId, source: args.source, roles: args.roles, name: args.name, mimeType: args.mimeType, storageUrl: args.storageUrl, metadata: args.metadata, createdAt: now() });
  },
});
