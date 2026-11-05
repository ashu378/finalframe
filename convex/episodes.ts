import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireProjectAccess, requireProjectRole } from "./authorization";
import { boundedText } from "./continuityContracts";
import { outputPresetValidator } from "./outputPresets";

const MAX_EPISODES = 500;
const continuityMode = v.union(v.literal('STORY_CONTINUATION'), v.literal('PROJECT_IDENTITY'));
const episodeFields = {
  _id: v.id("episodes"), _creationTime: v.number(), projectId: v.id("projects"), productionId: v.id("productions"),
  episodeNumber: v.number(), title: v.string(), predecessorEpisodeId: v.optional(v.id("episodes")),
  continuityMode: v.optional(continuityMode),
  inputStoryStateId: v.optional(v.id("episodeStoryStates")), acceptedStoryStateId: v.optional(v.id("episodeStoryStates")),
  continuityStatus: v.union(v.literal("CURRENT"), v.literal("STALE")), createdByUserId: v.id("users"),
  createdAt: v.number(), updatedAt: v.number(),
};
const episode = v.object(episodeFields);
type ReadCtx = QueryCtx | MutationCtx;

export async function requireEpisode(ctx: ReadCtx, projectId: Id<"projects">, episodeId: Id<"episodes">) {
  await requireProjectAccess(ctx, projectId);
  const value = await ctx.db.get(episodeId);
  if (!value || value.projectId !== projectId) throw new Error("Episode not found in this project.");
  const production = await ctx.db.get(value.productionId);
  if (!production || production.projectId !== projectId) throw new Error("Episode production does not belong to this project.");
  return { episode: value, production };
}

/** Each episode owns a distinct production; selection never relies on a project-wide unique production. */
export const create = mutation({
  args: {
    projectId: v.id("projects"), episodeNumber: v.number(), title: v.string(),
    durationSeconds: v.number(), workflow: v.string(), inputMode: v.string(), language: v.string(),
    outputPreset: outputPresetValidator,
    continuityMode: v.optional(continuityMode),
  },
  returns: v.object({ episodeId: v.id("episodes"), productionId: v.id("productions"), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    const title = boundedText(args.title, "Episode title", 160);
    const relationship = args.continuityMode ?? 'STORY_CONTINUATION';
    if (!Number.isInteger(args.episodeNumber) || args.episodeNumber < 1 || args.episodeNumber > MAX_EPISODES) throw new Error(`Episode number must be between 1 and ${MAX_EPISODES}.`);
    if (!Number.isFinite(args.durationSeconds) || args.durationSeconds < 4 || args.durationSeconds > 60) throw new Error("Episodes must be between 4 and 60 seconds.");
    const existing = await ctx.db.query("episodes").withIndex("by_project_and_number", (q) => q.eq("projectId", args.projectId).eq("episodeNumber", args.episodeNumber)).unique();
    if (existing) {
      const current = await ctx.db.get(existing.productionId);
      if (existing.title !== title || (existing.continuityMode ?? 'STORY_CONTINUATION') !== relationship || !current || current.requestedDurationSeconds !== args.durationSeconds || current.workflow !== args.workflow || current.inputMode !== args.inputMode || current.language !== args.language || current.outputPreset !== args.outputPreset) throw new Error("This episode number is already used by another production.");
      return { episodeId: existing._id, productionId: existing.productionId, replayed: true };
    }
    const predecessor = args.episodeNumber > 1
      ? await ctx.db.query("episodes").withIndex("by_project_and_number", (q) => q.eq("projectId", args.projectId).eq("episodeNumber", args.episodeNumber - 1)).unique()
      : null;
    if (args.episodeNumber > 1 && !predecessor) throw new Error("Create the preceding episode before adding this episode.");
    const timestamp = Date.now();
    const productionId = await ctx.db.insert("productions", {
      projectId: args.projectId, externalProjectId: access.project.externalId, projectType: access.project.projectType,
      studioExternalId: access.project.studioExternalId, studioId: access.project.studioId,
      plannedDurationSeconds: args.durationSeconds, requestedDurationSeconds: args.durationSeconds,
      workflow: boundedText(args.workflow, "Workflow", 100), inputMode: boundedText(args.inputMode, "Input mode", 100),
      language: boundedText(args.language, "Language", 80), outputPreset: args.outputPreset,
      status: "DRAFT", currentStage: "BRIEF", createdByUserId: access.user._id,
      createdByExternalId: access.identity.externalId, metadata: { episodeNumber: args.episodeNumber }, createdAt: timestamp, updatedAt: timestamp,
    });
    const episodeId = await ctx.db.insert("episodes", {
      projectId: args.projectId, productionId, episodeNumber: args.episodeNumber, title,
      continuityMode: relationship,
      predecessorEpisodeId: relationship === 'STORY_CONTINUATION' ? predecessor?._id : undefined,
      inputStoryStateId: relationship === 'STORY_CONTINUATION' ? predecessor?.acceptedStoryStateId : undefined,
      continuityStatus: relationship === 'STORY_CONTINUATION' && predecessor && (predecessor.continuityStatus === "STALE" || !predecessor.acceptedStoryStateId) ? "STALE" : "CURRENT",
      createdByUserId: access.user._id, createdAt: timestamp, updatedAt: timestamp,
    });
    return { episodeId, productionId, replayed: false };
  },
});

export const list = query({
  args: { projectId: v.id("projects"), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(episode), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    if (args.paginationOpts.numItems > 100) throw new Error("Request at most 100 episodes per page.");
    const page = await ctx.db.query("episodes").withIndex("by_project_and_number", (q) => q.eq("projectId", args.projectId)).paginate(args.paginationOpts);
    return { page: page.page, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const get = query({
  args: { projectId: v.id("projects"), episodeId: v.id("episodes") },
  returns: episode,
  handler: async (ctx, args) => (await requireEpisode(ctx, args.projectId, args.episodeId)).episode,
});

/** Idempotent opt-in migration. Existing production data and versions are retained. */
export const adoptLegacyProduction = mutation({
  args: { projectId: v.id("projects"), productionId: v.id("productions"), title: v.string() },
  returns: v.object({ episodeId: v.id("episodes"), productionId: v.id("productions"), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    const production = await ctx.db.get(args.productionId);
    if (!production || production.externalProjectId !== access.project.externalId || production.studioExternalId !== access.project.studioExternalId || (production.projectId && production.projectId !== args.projectId)) throw new Error("Production does not belong to this project.");
    const existing = await ctx.db.query("episodes").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).unique();
    if (existing) {
      if (existing.projectId !== args.projectId) throw new Error("Production is already attached to a different project.");
      return { episodeId: existing._id, productionId: args.productionId, replayed: true };
    }
    const first = await ctx.db.query("episodes").withIndex("by_project_and_number", (q) => q.eq("projectId", args.projectId)).first();
    if (first) throw new Error("This project already has episodes; migrate ambiguous legacy productions separately.");
    const timestamp = Date.now();
    const episodeId = await ctx.db.insert("episodes", {
      projectId: args.projectId, productionId: args.productionId, episodeNumber: 1,
      title: boundedText(args.title, "Episode title", 160), continuityStatus: "CURRENT",
      createdByUserId: access.user._id, createdAt: timestamp, updatedAt: timestamp,
    });
    await ctx.db.patch(production._id, { projectId: args.projectId, updatedAt: timestamp });
    return { episodeId, productionId: args.productionId, replayed: false };
  },
});

/** Refresh explicitly before replanning; the accepted story snapshot itself is never changed. */
export const refreshContinuity = mutation({
  args: { projectId: v.id("projects"), episodeId: v.id("episodes") },
  returns: v.object({ inputStoryStateId: v.union(v.id("episodeStoryStates"), v.null()) }),
  handler: async (ctx, args) => {
    await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    const { episode } = await requireEpisode(ctx, args.projectId, args.episodeId);
    if (episode.continuityMode === 'PROJECT_IDENTITY') return { inputStoryStateId: null };
    const predecessor = episode.predecessorEpisodeId ? await ctx.db.get(episode.predecessorEpisodeId) : null;
    if (predecessor && (predecessor.projectId !== args.projectId || predecessor.continuityStatus !== "CURRENT" || !predecessor.acceptedStoryStateId)) throw new Error("Approve the preceding episode's current story state before refreshing continuity.");
    await ctx.db.patch(episode._id, {
      inputStoryStateId: predecessor?.acceptedStoryStateId,
      // An accepted episode must be reviewed again before it can become current.
      continuityStatus: episode.acceptedStoryStateId
        ? (episode.inputStoryStateId !== predecessor?.acceptedStoryStateId ? "STALE" : episode.continuityStatus)
        : "CURRENT",
      updatedAt: Date.now(),
    });
    return { inputStoryStateId: predecessor?.acceptedStoryStateId ?? null };
  },
});

/** A deliberate change before approved work exists. Old drafts are retained
 * as superseded records so no plan can approve stale relationship context. */
export const changeContinuityMode = mutation({
  args: { projectId: v.id('projects'), episodeId: v.id('episodes'), continuityMode, expectedUpdatedAt: v.number() },
  returns: v.object({ replayed: v.boolean(), requiresNewPlan: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireProjectRole(ctx, args.projectId, ['OWNER', 'EDITOR']);
    const { episode, production } = await requireEpisode(ctx, args.projectId, args.episodeId);
    if ((episode.continuityMode ?? 'STORY_CONTINUATION') === args.continuityMode) return { replayed: true, requiresNewPlan: false };
    if (episode.updatedAt !== args.expectedUpdatedAt) throw new Error('This episode changed. Reload before changing its relationship.');
    const versions = await ctx.db.query('productionVersions').withIndex('by_production_version', q => q.eq('productionId', production._id)).take(201);
    const timelines = await ctx.db.query('timelines').withIndex('by_production', q => q.eq('productionId', production._id)).take(1);
    const currentVersion = production.currentVersionId ? await ctx.db.get(production.currentVersionId) : null;
    if (versions.length > 200 || production.currentVersionId && (!currentVersion || currentVersion.productionId !== production._id || !['DRAFT', 'SUPERSEDED'].includes(currentVersion.status)) || versions.some(version => version.status === 'APPROVED' || version.approvedAt !== undefined) || timelines.length || episode.acceptedStoryStateId) throw new Error('Approved or assembled episodes keep their relationship. Create a new episode instead.');
    const plan = production.currentPlanId ? await ctx.db.get(production.currentPlanId) : null;
    if (plan && (plan.productionId !== production._id || !['READY', 'DRAFT'].includes(plan.status))) throw new Error('The current plan cannot change relationship. Create a new episode instead.');
    const previous = episode.episodeNumber > 1 ? await ctx.db.query('episodes').withIndex('by_project_and_number', q => q.eq('projectId', args.projectId).eq('episodeNumber', episode.episodeNumber - 1)).unique() : null;
    if (episode.episodeNumber > 1 && !previous) throw new Error('The preceding episode is missing. Restore it before changing this relationship.');
    const timestamp = Math.max(Date.now(), episode.updatedAt + 1);
    if (plan) await ctx.db.patch(plan._id, { status: 'SUPERSEDED', updatedAt: timestamp });
    for (const version of versions) if (version.status === 'DRAFT') await ctx.db.patch(version._id, { status: 'SUPERSEDED' });
    await ctx.db.patch(production._id, { currentPlanId: undefined, currentVersionId: undefined, status: 'DRAFT', currentStage: 'BRIEF', updatedAt: timestamp });
    const followsStory = args.continuityMode === 'STORY_CONTINUATION';
    await ctx.db.patch(episode._id, { continuityMode: args.continuityMode, predecessorEpisodeId: followsStory ? previous?._id : undefined, inputStoryStateId: followsStory ? previous?.acceptedStoryStateId : undefined, continuityStatus: followsStory && previous && (previous.continuityStatus !== 'CURRENT' || !previous.acceptedStoryStateId) ? 'STALE' : 'CURRENT', updatedAt: timestamp });
    await ctx.db.insert('audit', { studioExternalId: access.project.studioExternalId, studioId: access.project.studioId, actorUserId: access.user._id, action: 'EPISODE_RELATIONSHIP_CHANGED', entityType: 'episode', entityId: episode._id, metadata: { projectId: args.projectId, productionId: production._id, previousMode: episode.continuityMode ?? 'STORY_CONTINUATION', continuityMode: args.continuityMode, previousPredecessorEpisodeId: episode.predecessorEpisodeId ?? null, previousInputStoryStateId: episode.inputStoryStateId ?? null, supersededPlanId: plan?._id ?? null, previousVersionId: production.currentVersionId ?? null, requiresNewPlan: true }, createdAt: timestamp });
    return { replayed: false, requiresNewPlan: true };
  },
});
