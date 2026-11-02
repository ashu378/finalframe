import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const projectResourceKind = v.union(
  v.literal("CHARACTER"), v.literal("LOCATION"), v.literal("COSTUME"), v.literal("PROP"),
  v.literal("PRODUCT"), v.literal("BRAND"), v.literal("STYLE"),
);

export const bibleSnapshot = v.object({
  resourceBindings: v.array(v.object({ resourceId: v.id("projectResources"), resourceVersionId: v.id("projectResourceVersions") })),
  rules: v.array(v.string()),
  story: v.string(),
  visualStyle: v.string(),
});

export const storySnapshot = v.object({
  summary: v.string(), facts: v.array(v.string()), unresolvedThreads: v.array(v.string()),
  cliffhanger: v.string(), nextEpisodePayoff: v.string(),
  characterStates: v.array(v.object({ resourceId: v.id("projectResources"), knowledge: v.string(), relationships: v.string() })),
});

export function boundedText(value: string, label: string, maxLength = 4000) {
  const text = value.trim();
  if (!text || text.length > maxLength) throw new Error(`${label} must contain 1–${maxLength} characters.`);
  return text;
}

export function boundedSnapshot(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 100_000) throw new Error("Continuity snapshot exceeds the 100 KB limit.");
}

type ReadCtx = QueryCtx | MutationCtx;

export async function validateProjectResourceReferences(
  ctx: ReadCtx,
  projectId: Id<"projects">,
  value: { assetIds: Id<"assets">[]; voiceId?: Id<"voices"> },
) {
  if (value.assetIds.length > 50 || new Set(value.assetIds).size !== value.assetIds.length) throw new Error("Use at most 50 distinct project reference assets.");
  for (const assetId of value.assetIds) {
    const asset = await ctx.db.get(assetId);
    if (!asset || asset.deletedAt || asset.scope !== "PROJECT" || asset.projectId !== projectId) {
      throw new Error("Every continuity asset must be explicitly owned by this project.");
    }
  }
  if (value.voiceId) {
    const voice = await ctx.db.get(value.voiceId);
    if (!voice || voice.projectId !== projectId || voice.deletedAt || voice.revokedAt || voice.status === "REVOKED") {
      throw new Error("Continuity voice must be active and owned by this project.");
    }
  }
}

/** Validate exact immutable resource versions; never substitute a studio default. */
export async function validateBibleBindings(ctx: ReadCtx, projectId: Id<"projects">, snapshot: unknown, approvedOnly: boolean) {
  boundedSnapshot(snapshot);
  const value = snapshot as { resourceBindings?: Array<{ resourceId: Id<"projectResources">; resourceVersionId: Id<"projectResourceVersions"> }>; rules?: string[] };
  if (!Array.isArray(value.resourceBindings) || !Array.isArray(value.rules)) throw new Error("The continuity bible has no valid resource bindings or rules.");
  if (value.resourceBindings.length > 100 || value.rules.length > 100) throw new Error("A continuity bible supports at most 100 resources and 100 rules.");
  const seen = new Set<string>();
  for (const binding of value.resourceBindings) {
    if (seen.has(binding.resourceId)) throw new Error("A resource can appear only once in a continuity bible.");
    seen.add(binding.resourceId);
    const [resource, version] = await Promise.all([ctx.db.get(binding.resourceId), ctx.db.get(binding.resourceVersionId)]);
    if (!resource || resource.projectId !== projectId || resource.archivedAt || !version || version.projectId !== projectId || version.resourceId !== resource._id) {
      throw new Error("Continuity resource versions must belong to this project.");
    }
    await validateProjectResourceReferences(ctx, projectId, version);
    if (approvedOnly) {
      const state = await ctx.db.query("resourceStates").withIndex("by_project_resource", (q) => q.eq("projectId", projectId).eq("resourceType", "projectResourceVersion").eq("resourceId", version._id.toString())).unique();
      if (!state || (state.state !== "APPROVED" && state.state !== "LOCKED")) throw new Error("Approve every bound resource version before approving the continuity bible.");
    }
  }
}
