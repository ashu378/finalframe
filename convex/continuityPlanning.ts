import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireProjectAccess } from "./authorization";
import { requireApprovedResource } from "./resourceStates";
import { validateBibleBindings } from "./continuityContracts";

type ReadCtx = QueryCtx | MutationCtx;

export async function planningSelection(ctx: ReadCtx, projectId: Id<"projects">, productionId?: Id<"productions">) {
  const { project } = await requireProjectAccess(ctx, projectId);
  const rows = productionId ? [] : await ctx.db.query("productions").withIndex("by_project", (q) => q.eq("externalProjectId", project.externalId)).take(2);
  if (!productionId && rows.length > 1) throw new Error("Select an episode to open this project.");
  const production = productionId ? await ctx.db.get(productionId) : rows[0] ?? null;
  if (production && (production.externalProjectId !== project.externalId || production.studioExternalId !== project.studioExternalId || (production.projectId && production.projectId !== projectId))) throw new Error("Production does not belong to this project.");
  const episode = production ? await ctx.db.query("episodes").withIndex("by_production", (q) => q.eq("productionId", production._id)).unique() : null;
  if (episode && episode.projectId !== projectId) throw new Error("Episode does not belong to this project.");
  return { production, episode };
}

/** Canonical planning reads exact project-owned snapshots, never global defaults. */
export async function resolvePlanningContinuity(ctx: ReadCtx, projectId: Id<"projects">, productionId?: Id<"productions">, bibleId?: Id<"continuityBibles">) {
  const { production, episode } = await planningSelection(ctx, projectId, productionId);
  if (episode && !bibleId) throw new Error("Choose an approved project continuity bible or explicitly create a blank bible before planning this episode.");
  if (!bibleId) return null;
  const bible = await ctx.db.get(bibleId);
  if (!bible || bible.projectId !== projectId || bible.state !== "APPROVED") throw new Error("Choose an approved continuity bible from this project.");
  await requireApprovedResource(ctx, projectId, "continuityBible", bibleId.toString());
  await validateBibleBindings(ctx, projectId, bible.snapshot, true);
  const predecessor = episode?.predecessorEpisodeId ? await ctx.db.get(episode.predecessorEpisodeId) : null;
  if (episode && episode.continuityStatus !== "CURRENT") throw new Error("Refresh and review this episode's continuity before creating its plan.");
  if (predecessor && (predecessor.projectId !== projectId || predecessor.continuityStatus !== "CURRENT" || !predecessor.acceptedStoryStateId || episode?.inputStoryStateId !== predecessor.acceptedStoryStateId)) throw new Error("Approve the preceding episode and explicitly refresh continuity before planning the next episode.");
  const inputStory = episode?.inputStoryStateId ? await ctx.db.get(episode.inputStoryStateId) : null;
  if (inputStory && (inputStory.projectId !== projectId || (predecessor && inputStory.episodeId !== predecessor._id))) throw new Error("The accepted story state does not belong to this episode's predecessor.");
  const bindings = (bible.snapshot as { resourceBindings: Array<{ resourceId: Id<"projectResources">; resourceVersionId: Id<"projectResourceVersions"> }> }).resourceBindings;
  const resources = await Promise.all(bindings.map(async (binding) => {
    const resource = await ctx.db.get(binding.resourceId);
    const version = await ctx.db.get(binding.resourceVersionId);
    // validateBibleBindings checked ownership, but keep null guards explicit.
    if (!resource || !version) throw new Error("A continuity reference is no longer available.");
    const voice = version.voiceId ? await ctx.db.get(version.voiceId) : null;
    return {
      resourceId: resource._id, resourceVersionId: version._id, kind: resource.kind,
      name: resource.name, profile: version.profile, assetIds: version.assetIds,
      voice: voice ? { voiceId: voice._id, kind: voice.kind, language: voice.language ?? null } : null,
    };
  }));
  return {
    projectId, productionId: production?._id ?? null, episodeId: episode?._id ?? null,
    continuityBibleId: bible._id, continuityBibleVersion: bible.versionNumber,
    inputStoryStateId: inputStory?._id ?? null, acceptedPredecessorStory: inputStory?.snapshot ?? null,
    bible: bible.snapshot, resources,
  };
}
