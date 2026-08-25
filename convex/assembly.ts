import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMember } from "./authorization";
import { getProduction, now } from "./_shared";

type ManifestItem = {
  orderIndex: number;
  sequenceId: Id<"sequences">;
  sceneId: Id<"scenes">;
  shotId: Id<"shots">;
  shotVersionId: Id<"shotVersions">;
  assetId: Id<"assets">;
  durationSeconds: number;
  src: string;
};

function outputDimensions(preset: string): { width: number; height: number } {
  const normalized = preset.toLowerCase();
  if (normalized.includes("1080x1920") || normalized.includes("9:16") || normalized.includes("vertical")) return { width: 1080, height: 1920 };
  if (normalized.includes("1080x1080") || normalized.includes("1:1") || normalized.includes("square")) return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

function stableHash(value: unknown) {
  const text = JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.keys(item).sort().reduce((out, key) => ({ ...out, [key]: item[key] }), {}) : item);
  let hash = 2166136261;
  for (const character of text) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}

function metadata(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function orderedItems(ctx: Parameters<typeof mutation>[0] extends never ? never : any, production: any, requested?: Id<"shotVersions">[]) {
  if (!production.currentVersionId) throw new Error("Production has no approved version.");
  const sequences = (await ctx.db.query("sequences").withIndex("by_version", (q: any) => q.eq("productionVersionId", production.currentVersionId)).collect()).sort((a: any, b: any) => a.orderIndex - b.orderIndex);
  const requestedByShot = new Map<string, Id<"shotVersions">>();
  for (const versionId of requested ?? []) {
    const version = await ctx.db.get(versionId);
    if (!version || version.productionId !== production._id) throw new Error("Selected take is not part of this production.");
    requestedByShot.set(version.shotId.toString(), versionId);
  }
  const items: ManifestItem[] = [];
  let orderIndex = 0;
  for (const sequence of sequences) {
    const scenes = (await ctx.db.query("scenes").withIndex("by_sequence", (q: any) => q.eq("sequenceId", sequence._id)).collect()).sort((a: any, b: any) => a.orderIndex - b.orderIndex);
    for (const scene of scenes) {
      const shots = (await ctx.db.query("shots").withIndex("by_scene", (q: any) => q.eq("sceneId", scene._id)).collect()).sort((a: any, b: any) => a.orderIndex - b.orderIndex);
      for (const shot of shots) {
        const versions = (await ctx.db.query("shotVersions").withIndex("by_shot", (q: any) => q.eq("shotId", shot._id)).collect()).filter((version: any) => version.status === "COMPLETED").sort((a: any, b: any) => b.versionNumber - a.versionNumber);
        const versionId = requestedByShot.get(shot._id.toString()) ?? versions[0]?._id;
        const version = versionId ? await ctx.db.get(versionId) : null;
        if (!version || version.status !== "COMPLETED" || !version.assetId) throw new Error(`Complete ${shot.title} before assembling.`);
        const asset = await ctx.db.get(version.assetId);
        if (!asset || asset.studioExternalId !== production.studioExternalId || asset.productionId !== production._id || !asset.storageId) throw new Error(`Take ${shot.title} has no authorized canonical media.`);
        const src = await ctx.storage.getUrl(asset.storageId);
        if (!src) throw new Error(`Take ${shot.title} is no longer available in canonical storage.`);
        items.push({ orderIndex: orderIndex++, sequenceId: sequence._id, sceneId: scene._id, shotId: shot._id, shotVersionId: version._id, assetId: version.assetId, durationSeconds: shot.durationSeconds, src });
      }
    }
  }
  if (!items.length) throw new Error("The production has no shots to assemble.");
  return items;
}

export const createJob = mutation({
  args: { productionId: v.id("productions"), idempotencyKey: v.optional(v.string()), shotVersionIds: v.optional(v.array(v.id("shotVersions"))), correlationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const production = await getProduction(ctx, args.productionId.toString());
    await requireMember(ctx, production.studioExternalId);
    const idempotencyKey = args.idempotencyKey?.trim() || `assembly:${production._id}:${production.currentVersionId?.toString() ?? "none"}`;
    const existingManifest = (await ctx.db.query("manifests").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).find((manifest) => metadata(manifest.manifest).idempotencyKey === idempotencyKey);
    if (existingManifest) {
      const legacy = (await ctx.db.query("assemblyJobs").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).find((job) => metadata(job.manifest).manifestId === existingManifest._id.toString());
      return { jobId: legacy?._id, manifestId: existingManifest._id, manifest: existingManifest.manifest };
    }
    const items = await orderedItems(ctx, production, args.shotVersionIds);
    const timestamp = now();
    const previous = await ctx.db.query("manifests").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    const fps = 30;
    const totalDurationSeconds = items.reduce((sum, item) => sum + item.durationSeconds, 0);
    const dimensions = outputDimensions(production.outputPreset);
    let cursorFrame = 0;
    const renderItems = items.map((item) => {
      const durationInFrames = Math.max(1, Math.round(item.durationSeconds * fps));
      const renderItem = { id: `take-${item.shotId.toString()}`, kind: "video", src: item.src, orderIndex: item.orderIndex, shotId: item.shotId.toString(), shotVersionId: item.shotVersionId.toString(), assetId: item.assetId.toString(), startFrame: cursorFrame, durationInFrames };
      cursorFrame += durationInFrames;
      return renderItem;
    });
    const manifestPayload = {
      kind: "finalframe.render-manifest",
      version: 2,
      manifestId: `assembly:${production._id.toString()}:${previous.length + 1}`,
      projectId: production.externalProjectId,
      rendererVersion: "finalframe-renderer-v1",
      idempotencyKey,
      outputPreset: production.outputPreset,
      output: { width: dimensions.width, height: dimensions.height, fps, durationInFrames: cursorFrame, codec: "h264" },
      items: renderItems,
      shots: items.map((item, index) => ({ shotId: item.shotId.toString(), shotVersionId: item.shotVersionId.toString(), assetId: item.assetId.toString(), orderIndex: item.orderIndex, itemId: renderItems[index].id, startFrame: renderItems[index].startFrame, durationInFrames: renderItems[index].durationInFrames, src: item.src })),
      sourceItems: items,
      totalDurationSeconds,
      correlationId: args.correlationId,
    };
    const manifestId = await ctx.db.insert("manifests", { studioExternalId: production.studioExternalId, studioId: production.studioId, productionId: production._id, versionNumber: previous.length + 1, manifest: manifestPayload, sourceHashes: [stableHash(items)], createdAt: timestamp });
    const persistedPayload = { ...manifestPayload, manifestId: manifestId.toString() };
    await ctx.db.patch(manifestId, { manifest: persistedPayload });
    const jobId = await ctx.db.insert("assemblyJobs", { productionId: production._id, status: "QUEUED", manifest: persistedPayload, correlationId: args.correlationId, createdAt: timestamp, updatedAt: timestamp });
    return { jobId, manifestId, manifest: persistedPayload };
  },
});

export const getManifest = query({
  args: { manifestId: v.id("manifests") },
  handler: async (ctx, args) => {
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest) throw new Error("Assembly manifest not found.");
    await requireMember(ctx, manifest.studioExternalId);
    return manifest;
  },
});
