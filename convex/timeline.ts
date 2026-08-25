import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMember } from "./authorization";
import { now } from "./_shared";

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export const createVersion = mutation({
  args: { productionId: v.id("productions"), manifestId: v.id("manifests"), outputPreset: v.optional(v.string()), idempotencyKey: v.optional(v.string()), metadata: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest || manifest.productionId !== args.productionId) throw new Error("Manifest not found.");
    const member = await requireMember(ctx, manifest.studioExternalId);
    const payload = object(manifest.manifest);
    const idempotencyKey = args.idempotencyKey?.trim() || `timeline:${args.manifestId}`;
    const existing = (await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).collect()).find((timeline) => object(timeline.tracks).idempotencyKey === idempotencyKey);
    if (existing) return existing;
    const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
    if (!items.length) throw new Error("Cannot create a timeline without manifest items.");
    const previous = await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).collect();
    const timestamp = now();
    const durationSeconds = typeof payload.totalDurationSeconds === "number" ? payload.totalDurationSeconds : items.reduce((sum, item) => sum + (typeof item.durationSeconds === "number" ? item.durationSeconds : 0), 0);
    const timelineId = await ctx.db.insert("timelines", { studioExternalId: member.studio.externalId, studioId: member.studio._id, productionId: args.productionId, versionNumber: Math.max(0, ...previous.map((timeline) => timeline.versionNumber)) + 1, durationSeconds, tracks: { idempotencyKey, manifestId: args.manifestId.toString(), metadata: args.metadata ?? {}, items }, outputPreset: args.outputPreset ?? String(payload.outputPreset ?? "SOCIAL_VERTICAL"), status: "DRAFT", createdByUserId: member.user._id, createdAt: timestamp, updatedAt: timestamp });
    const trackId = await ctx.db.insert("timelineTracks", { studioExternalId: member.studio.externalId, studioId: member.studio._id, timelineId, kind: "VIDEO", name: "Ordered takes", orderIndex: 0, metadata: { manifestId: args.manifestId.toString() } });
    let startSeconds = 0;
    for (const [index, item] of items.entries()) {
      const assetId = item.assetId as Id<"assets">;
      const shotVersionId = item.shotVersionId as Id<"shotVersions">;
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.studioExternalId !== member.studio.externalId) throw new Error("Timeline contains media outside this studio.");
      const duration = typeof item.durationSeconds === "number" ? item.durationSeconds : 0;
      await ctx.db.insert("timelineClips", { studioExternalId: member.studio.externalId, studioId: member.studio._id, timelineId, trackId, assetId, shotVersionId, startSeconds, durationSeconds: duration, metadata: { orderIndex: index } });
      startSeconds += duration;
    }
    return await ctx.db.get(timelineId);
  },
});

export const get = query({
  args: { timelineId: v.id("timelines") },
  handler: async (ctx, args) => {
    const timeline = await ctx.db.get(args.timelineId);
    if (!timeline) throw new Error("Timeline not found.");
    await requireMember(ctx, timeline.studioExternalId);
    const tracks = await ctx.db.query("timelineTracks").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).collect();
    const clips = await ctx.db.query("timelineClips").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).collect();
    return { timeline, tracks, clips: clips.sort((a, b) => a.startSeconds - b.startSeconds) };
  },
});

export const list = query({
  args: { productionId: v.id("productions") },
  handler: async (ctx, args) => {
    const production = await ctx.db.get(args.productionId);
    if (!production) throw new Error("Production not found.");
    await requireMember(ctx, production.studioExternalId);
    return await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).order("desc").collect();
  },
});

