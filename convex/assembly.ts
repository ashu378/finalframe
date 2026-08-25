import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireMember } from "./authorization";
import { getProduction, now } from "./_shared";

type ReadCtx = QueryCtx | MutationCtx;
type Production = Doc<"productions">;
type Timeline = Doc<"timelines">;

type RenderPreset = { name: string; width: number; height: number; fps: number; codec: "h264" };

type SourceItem = {
  orderIndex: number;
  timelineClipId: string;
  trackId: string;
  trackKind: string;
  startSeconds: number;
  durationSeconds: number;
  assetId?: string;
  assetChecksum?: string;
  shotId?: string;
  shotVersionId?: string;
  shotVersionNumber?: number;
  captionId?: string;
  captionUpdatedAt?: number;
  audioId?: string;
  audioVersion?: number;
  sourceUrl?: string;
  sourceKind: "MEDIA" | "GRAPHIC" | "TEXT";
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stableHash(value: unknown) {
  const text = JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.keys(item).sort().reduce((out, key) => ({ ...out, [key]: item[key] }), {})
    : item);
  let hash = 2166136261;
  for (const character of text) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}

function timelineMetadata(timeline: Timeline) {
  return record(record(timeline.tracks).metadata);
}

function isApprovedOrLocked(timeline: Timeline) {
  const status = timeline.status as string;
  const metadata = timelineMetadata(timeline);
  return status === "APPROVED" || status === "LOCKED" || metadata.lockState === "LOCKED" || metadata.approvalStatus === "APPROVED";
}

function outputPreset(name: string, metadata: Record<string, unknown>): RenderPreset {
  const normalized = name.trim().toLowerCase();
  const dimensions = normalized.includes("1080x1920") || normalized.includes("9:16") || normalized.includes("vertical") || normalized.includes("tiktok") || normalized.includes("reel")
    ? { width: 1080, height: 1920 }
    : normalized.includes("1080x1080") || normalized.includes("1:1") || normalized.includes("square")
      ? { width: 1080, height: 1080 }
      : normalized.includes("1920x1080") || normalized.includes("16:9") || normalized.includes("landscape") || normalized.includes("youtube") || ["hd", "full_hd", "full-hd", "social"].includes(normalized)
        ? { width: 1920, height: 1080 }
        : null;
  if (!dimensions) throw new Error(`Render preset “${name}” is not supported yet.`);
  const fps = numberValue(metadata.fps) ?? 30;
  if (![24, 25, 30, 50, 60].includes(fps)) throw new Error(`Frame rate ${fps} is not supported for this export.`);
  return { name, ...dimensions, fps, codec: "h264" };
}

function hasDeniedRights(value: unknown) {
  const rights = record(value);
  const state = String(rights.status ?? rights.state ?? "").toUpperCase();
  return rights.approved === false || rights.consent === false || ["DENIED", "REJECTED", "EXPIRED", "REVOKED"].includes(state);
}

function hasReviewedTake(version: Doc<"shotVersions">, approvedTakeIds: Set<string>) {
  if (approvedTakeIds.has(version._id.toString())) return true;
  const context = record(version.contextSnapshot);
  const quality = String(context.qualityGateStatus ?? context.qualityStatus ?? "").toUpperCase();
  return context.reviewed === true || String(context.reviewStatus ?? "").toUpperCase() === "APPROVED" || ["PASS", "PASS_WITH_WARNINGS"].includes(quality);
}

async function authorizedTimeline(ctx: ReadCtx, production: Production, requestedId?: Id<"timelines">) {
  const candidates = requestedId
    ? [await ctx.db.get(requestedId)]
    : await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", production._id)).order("desc").collect();
  const timeline = candidates.find((candidate) => candidate !== null && candidate.productionId === production._id && candidate.studioExternalId === production.studioExternalId);
  if (!timeline) throw new Error("Create a timeline version before assembling this video.");
  await requireMember(ctx, timeline.studioExternalId);
  if (!isApprovedOrLocked(timeline)) throw new Error("Approve or lock the timeline before assembling the video.");
  return timeline;
}

async function assertDependenciesAreCurrent(ctx: ReadCtx, production: Production, timeline: Timeline, sourceIds: Set<string>) {
  const dependencies = await ctx.db.query("productionDependencies").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
  const stale = dependencies.find((dependency) => dependency.state !== "ACTIVE" && (
    sourceIds.has(dependency.sourceId) || sourceIds.has(dependency.targetId) || sourceIds.has(String(dependency.sourceVersionId ?? "")) || sourceIds.has(String(dependency.targetVersionId ?? "")) || dependency.sourceId === timeline._id.toString() || dependency.targetId === timeline._id.toString()
  ));
  if (stale) throw new Error(`Assembly is blocked because a production dependency is ${stale.state.toLowerCase()}. Refresh the affected take first.`);
}

async function buildSourceItems(ctx: ReadCtx, production: Production, timeline: Timeline, preset: RenderPreset) {
  const tracks = await ctx.db.query("timelineTracks").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).collect();
  const clips = (await ctx.db.query("timelineClips").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).collect()).sort((a, b) => a.startSeconds - b.startSeconds);
  if (!clips.length) throw new Error("The approved timeline has no clips to assemble.");

  const timelineMeta = timelineMetadata(timeline);
  const approvedTakeIds = new Set((Array.isArray(timelineMeta.approvedShotVersionIds) ? timelineMeta.approvedShotVersionIds : []).map(String));
  const sourceIds = new Set<string>([timeline._id.toString(), production.currentVersionId?.toString() ?? ""]);
  const sources: SourceItem[] = [];
  const trackEnds = new Map<string, number>();

  for (const [orderIndex, clip] of clips.entries()) {
    const track = tracks.find((candidate) => candidate._id === clip.trackId);
    if (!track) throw new Error("Assembly is blocked because a timeline track is missing.");
    const start = numberValue(clip.startSeconds);
    const duration = numberValue(clip.durationSeconds);
    if (start === undefined || duration === undefined || start < 0 || duration <= 0) throw new Error("Assembly is blocked by an invalid clip duration or start time.");
    const previousEnd = trackEnds.get(clip.trackId.toString()) ?? 0;
    if (start < previousEnd) throw new Error("Assembly is blocked because timeline clips overlap.");
    trackEnds.set(clip.trackId.toString(), start + duration);
    sourceIds.add(clip._id.toString());

    const clipMeta = record(clip.metadata);
    const source: SourceItem = {
      orderIndex,
      timelineClipId: clip._id.toString(),
      trackId: clip.trackId.toString(),
      trackKind: track.kind,
      startSeconds: start,
      durationSeconds: duration,
      sourceKind: track.kind.toUpperCase() === "GRAPHIC" ? "GRAPHIC" : track.kind.toUpperCase() === "TEXT" ? "TEXT" : "MEDIA",
    };

    if (clip.assetId) {
      const asset = await ctx.db.get(clip.assetId);
      if (!asset || asset.studioExternalId !== production.studioExternalId || asset.productionId !== production._id || asset.deletedAt || !asset.storageId) throw new Error("Assembly is blocked because a timeline media source is missing or unauthorized.");
      if (!asset.checksum) throw new Error(`Media “${asset.name ?? asset._id}” has no checksum and cannot be exported safely.`);
      if (hasDeniedRights(asset.rights) || hasDeniedRights(asset.provenance)) throw new Error(`Media “${asset.name ?? asset._id}” is missing rights or consent approval.`);
      const sourceUrl = await ctx.storage.getUrl(asset.storageId);
      if (!sourceUrl) throw new Error(`Media “${asset.name ?? asset._id}” is no longer available in canonical storage.`);
      source.assetId = asset._id.toString();
      source.assetChecksum = asset.checksum;
      source.sourceUrl = sourceUrl;
      sourceIds.add(asset._id.toString());
    } else if (source.sourceKind === "MEDIA") {
      throw new Error("Assembly is blocked because a media clip has no source asset.");
    }

    if (clip.shotVersionId) {
      const shotVersion = await ctx.db.get(clip.shotVersionId);
      if (!shotVersion || shotVersion.productionId !== production._id || shotVersion.studioExternalId !== production.studioExternalId || shotVersion.status !== "COMPLETED") throw new Error("Assembly is blocked because a take failed or is incomplete.");
      const shot = await ctx.db.get(shotVersion.shotId);
      const scene = shot ? await ctx.db.get(shot.sceneId) : null;
      const sequence = scene ? await ctx.db.get(scene.sequenceId) : null;
      if (!shot || !scene || !sequence || sequence.productionVersionId !== production.currentVersionId) throw new Error("Assembly is blocked because a take belongs to an outdated production version.");
      const approvals = await ctx.db.query("approvals").withIndex("by_resource", (q) => q.eq("resourceType", "shotVersion").eq("resourceId", shotVersion._id.toString())).collect();
      if (!hasReviewedTake(shotVersion, approvedTakeIds) && !approvals.some((approval) => approval.productionId === production._id && String(approval.decision).toUpperCase() === "APPROVED")) throw new Error("Assembly is blocked until every selected take has been reviewed and approved.");
      source.shotId = shot._id.toString();
      source.shotVersionId = shotVersion._id.toString();
      source.shotVersionNumber = shotVersion.versionNumber;
      sourceIds.add(shot._id.toString());
      sourceIds.add(shotVersion._id.toString());
    }

    const captionId = stringValue(clipMeta.captionId ?? clipMeta.captionTrackId ?? clipMeta.captionsId);
    if (captionId) {
      const caption = await ctx.db.get(captionId as Id<"captions">);
      if (!caption || caption.studioExternalId !== production.studioExternalId || caption.productionId !== production._id || ["FAILED", "REJECTED"].includes(String(caption.status))) throw new Error("Assembly is blocked because the selected caption version is unavailable.");
      source.captionId = caption._id.toString();
      source.captionUpdatedAt = caption.updatedAt ?? caption.createdAt;
      sourceIds.add(caption._id.toString());
    }

    const audioId = stringValue(clipMeta.audioId ?? clipMeta.audioTrackId);
    if (audioId) {
      const audio = await ctx.db.get(audioId as Id<"audio">);
      if (!audio || audio.studioExternalId !== production.studioExternalId || audio.productionId !== production._id || !audio.assetId) throw new Error("Assembly is blocked because the selected audio version is unavailable.");
      const audioAsset = await ctx.db.get(audio.assetId);
      if (!audioAsset || audioAsset.studioExternalId !== production.studioExternalId || !audioAsset.storageId || !audioAsset.checksum || hasDeniedRights(audioAsset.rights)) throw new Error("Assembly is blocked because the selected audio has missing rights or canonical media.");
      source.audioId = audio._id.toString();
      source.audioVersion = audio.updatedAt ?? audio.createdAt;
      sourceIds.add(audio._id.toString());
      sourceIds.add(audio.assetId.toString());
    }
    sources.push(source);
  }

  await assertDependenciesAreCurrent(ctx, production, timeline, sourceIds);
  const durationInFrames = Math.max(1, Math.ceil(Math.max(...sources.map((source) => source.startSeconds + source.durationSeconds)) * preset.fps));
  return { sources, sourceIds, durationInFrames };
}

export const createJob = mutation({
  args: { productionId: v.id("productions"), timelineId: v.optional(v.id("timelines")), idempotencyKey: v.optional(v.string()), shotVersionIds: v.optional(v.array(v.id("shotVersions"))), confirmOlderVersions: v.optional(v.boolean()), correlationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const production = await getProduction(ctx, args.productionId.toString());
    await requireMember(ctx, production.studioExternalId);
    const timeline = await authorizedTimeline(ctx, production, args.timelineId);
    const preset = outputPreset(timeline.outputPreset || production.outputPreset, timelineMetadata(timeline));
    const idempotencyKey = args.idempotencyKey?.trim() || `assembly:${production._id}:${timeline._id}`;
    const existingManifest = (await ctx.db.query("manifests").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).find((manifest) => {
      const manifestData = record(manifest.manifest);
      return manifestData.idempotencyKey === idempotencyKey && manifestData.timelineId === timeline._id.toString();
    });
    if (existingManifest) {
      const legacy = (await ctx.db.query("assemblyJobs").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).find((job) => record(job.manifest).manifestId === existingManifest._id.toString());
      return { jobId: legacy?._id, manifestId: existingManifest._id, manifest: existingManifest.manifest };
    }

    const built = await buildSourceItems(ctx, production, timeline, preset);
    const olderSources: string[] = [];
    for (const source of built.sources) {
      if (!source.shotId || !source.shotVersionId) continue;
      const versions = await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", source.shotId as Id<"shots">)).collect();
      const latest = versions.reduce((current, candidate) => !current || candidate.versionNumber > current.versionNumber ? candidate : current, null as Doc<"shotVersions"> | null);
      if (latest && latest._id.toString() !== source.shotVersionId && latest.versionNumber > (source.shotVersionNumber ?? 0)) olderSources.push(source.shotVersionId);
    }
    if (olderSources.length > 0 && args.confirmOlderVersions !== true) {
      throw new Error("This timeline keeps an older take. Confirm older version use before assembling the video.");
    }
    const timestamp = now();
    const previous = await ctx.db.query("manifests").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    const manifestPayload = {
      kind: "finalframe.render-manifest",
      version: 3,
      manifestId: `assembly:${production._id.toString()}:${previous.length + 1}`,
      projectId: production.externalProjectId,
      productionId: production._id.toString(),
      productionVersionId: production.currentVersionId?.toString(),
      timelineId: timeline._id.toString(),
      timelineVersionNumber: timeline.versionNumber,
      rendererVersion: "finalframe-renderer-v1",
      idempotencyKey,
      correlationId: args.correlationId,
      preset,
      output: { width: preset.width, height: preset.height, fps: preset.fps, durationInFrames: built.durationInFrames, codec: preset.codec },
      sourceIds: [...built.sourceIds],
      sourceChecksums: built.sources.flatMap((source) => source.assetChecksum ? [source.assetChecksum] : []),
      sources: built.sources,
      createdAt: timestamp,
    };
    const manifestId = await ctx.db.insert("manifests", { studioExternalId: production.studioExternalId, studioId: production.studioId, productionId: production._id, timelineId: timeline._id, versionNumber: previous.length + 1, manifest: manifestPayload, sourceHashes: [stableHash({ timelineId: timeline._id, sources: built.sources, preset })], rendererVersion: "finalframe-renderer-v1", createdAt: timestamp });
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
