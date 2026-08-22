import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getProduction, now } from "./_shared";

export const createJob = mutation({
  args: { ownerExternalId: v.string(), productionId: v.id("productions") },
  handler: async (ctx, args) => {
    const production = await getProduction(ctx, args.productionId.toString(), args.ownerExternalId);
    if (!production.currentVersionId) throw new Error("Production has no approved version");
    const sequences = await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", production.currentVersionId!)).collect();
    const items: any[] = [];
    for (const sequence of sequences.sort((a, b) => a.orderIndex - b.orderIndex)) {
      const scenes = await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect();
      for (const scene of scenes.sort((a, b) => a.orderIndex - b.orderIndex)) {
        const shots = await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect();
        for (const shot of shots.sort((a, b) => a.orderIndex - b.orderIndex)) {
          const versions = (await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", shot._id)).collect()).filter((item) => item.status === "COMPLETED").sort((a, b) => b.versionNumber - a.versionNumber);
          if (!versions[0]?.assetId) throw new Error(`Complete ${shot.title} before assembling`);
          const asset = await ctx.db.get(versions[0].assetId);
          items.push({ shotId: shot._id, shotTitle: shot.title, shotVersionId: versions[0]._id, assetId: versions[0].assetId, url: asset?.storageUrl, durationSeconds: shot.durationSeconds });
        }
      }
    }
    const manifest = { version: 1, outputPreset: production.outputPreset, items, totalDurationSeconds: items.reduce((sum, item) => sum + item.durationSeconds, 0) };
    const jobId = await ctx.db.insert("assemblyJobs", { productionId: production._id, status: "QUEUED", manifest, createdAt: now(), updatedAt: now() });
    return { jobId, manifest };
  },
});
