import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireProjectAccess, requireProjectRole } from "./authorization";
import { boundedText } from "./continuityContracts";

const MAX_EPISODES = 500;
const episodeFields = {
  _id: v.id("episodes"), _creationTime: v.number(), projectId: v.id("projects"), productionId: v.id("productions"),
  episodeNumber: v.number(), title: v.string(), predecessorEpisodeId: v.optional(v.id("episodes")),
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
    outputPreset: v.union(v.literal("SOCIAL_VERTICAL"), v.literal("LANDSCAPE"), v.literal("SQUARE")),
  },
  returns: v.object({ episodeId: v.id("episodes"), productionId: v.id("productions"), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    const title = boundedText(args.title, "Episode title", 160);
    if (!Number.isInteger(args.episodeNumber) || args.episodeNumber < 1 || args.episodeNumber > MAX_EPISODES) throw new Error(`Episode number must be between 1 and ${MAX_EPISODES}.`);
    if (!Number.isFinite(args.durationSeconds) || args.durationSeconds < 4 || args.durationSeconds > 60) throw new Error("Episodes must be between 4 and 60 seconds.");
    const existing = await ctx.db.query("episodes").withIndex("by_project_and_number", (q) => q.eq("projectId", args.projectId).eq("episodeNumber", args.episodeNumber)).unique();
    if (existing) {
      const current = await ctx.db.get(existing.productionId);
      if (existing.title !== title || !current || current.requestedDurationSeconds !== args.durationSeconds || current.workflow !== args.workflow || current.inputMode !== args.inputMode || current.language !== args.language || current.outputPreset !== args.outputPreset) throw new Error("This episode number is already used by another production.");
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
      predecessorEpisodeId: predecessor?._id, inputStoryStateId: predecessor?.acceptedStoryStateId,
      continuityStatus: predecessor && (predecessor.continuityStatus === "STALE" || !predecessor.acceptedStoryStateId) ? "STALE" : "CURRENT",
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
