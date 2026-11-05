import { v, type Infer } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { requireProjectAccess, requireProjectRole } from "./authorization";
import { ensureResourceState, requireApprovedResource } from "./resourceStates";
import { transitionResourceState } from "./approvals";
import { requireEpisode } from "./episodes";
import {
  bibleSnapshot, storySnapshot, projectResourceKind, boundedText, boundedSnapshot,
  validateProjectResourceReferences, validateBibleBindings,
} from "./continuityContracts";
import { planningSelection, resolvePlanningContinuity } from "./continuityPlanning";
import {materializeAcceptedMemory} from './projectMemory';
import {freezeVoiceVersion,resolveVoiceSynthesisInput} from './voices';

function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

const createResourceArgs = { projectId: v.id("projects"), kind: projectResourceKind, name: v.string(), profile: v.any(), assetIds: v.array(v.id("assets")), voiceId: v.optional(v.id("voices")), voiceVersionId: v.optional(v.id('voiceVersions')) };
export async function createProjectResource(ctx: MutationCtx, args: Infer<ReturnType<typeof createResourceValidator>>) {
    const access = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    const name = boundedText(args.name, "Resource name", 160);
    boundedSnapshot(args.profile);
    await validateProjectResourceReferences(ctx, args.projectId, args);
    if (args.voiceId && args.kind !== "CHARACTER") throw new Error("Only a character resource can bind a voice.");
    const voiceVersionId = args.voiceVersionId ?? (args.voiceId ? await freezeVoiceVersion(ctx,await resolveVoiceSynthesisInput(ctx,{projectId:args.projectId,voiceId:args.voiceId,use:'SYNTHESIZE'}),access.user._id) : undefined);
    const timestamp = Date.now();
    const resourceId = await ctx.db.insert("projectResources", { projectId: args.projectId, kind: args.kind, name, createdByUserId: access.user._id, createdAt: timestamp, updatedAt: timestamp });
    const resourceVersionId = await ctx.db.insert("projectResourceVersions", { projectId: args.projectId, resourceId, versionNumber: 1, profile: args.profile, assetIds: args.assetIds, voiceId: args.voiceId, voiceVersionId, createdByUserId: access.user._id, createdAt: timestamp });
    await ensureResourceState(ctx, { projectId: args.projectId, resourceType: "projectResourceVersion", resourceId: resourceVersionId.toString() });
    return { resourceId, resourceVersionId, versionNumber: 1 };
}
function createResourceValidator() { return v.object(createResourceArgs); }
export const createResource = mutation({
  args: createResourceArgs,
  returns: v.object({ resourceId: v.id("projectResources"), resourceVersionId: v.id("projectResourceVersions"), versionNumber: v.number() }),
  handler: createProjectResource,
});

/** Revising creates a separate snapshot even if a previous version is approved or locked. */
export const reviseResource = mutation({
  args: { projectId: v.id("projects"), resourceId: v.id("projectResources"), expectedVersionNumber: v.number(), profile: v.any(), assetIds: v.array(v.id("assets")), voiceId: v.optional(v.id("voices")), voiceVersionId: v.optional(v.id('voiceVersions')) },
  returns: v.object({ resourceId: v.id("projectResources"), resourceVersionId: v.id("projectResourceVersions"), versionNumber: v.number() }),
  handler: async (ctx, args) => {
    const access = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    const resource = await ctx.db.get(args.resourceId);
    if (!resource || resource.projectId !== args.projectId || resource.archivedAt) throw new Error("Active project resource not found.");
    boundedSnapshot(args.profile);
    await validateProjectResourceReferences(ctx, args.projectId, args);
    if (args.voiceId && resource.kind !== "CHARACTER") throw new Error("Only a character resource can bind a voice.");
    const voiceVersionId = args.voiceVersionId ?? (args.voiceId ? await freezeVoiceVersion(ctx,await resolveVoiceSynthesisInput(ctx,{projectId:args.projectId,voiceId:args.voiceId,use:'SYNTHESIZE'}),access.user._id) : undefined);
    const latest = await ctx.db.query("projectResourceVersions").withIndex("by_resource_and_version", (q) => q.eq("resourceId", args.resourceId)).order("desc").first();
    if (!latest || latest.versionNumber !== args.expectedVersionNumber) throw new Error("This resource changed. Reload its current version before saving.");
    const timestamp = Date.now();
    const resourceVersionId = await ctx.db.insert("projectResourceVersions", { projectId: args.projectId, resourceId: resource._id, versionNumber: latest.versionNumber + 1, profile: args.profile, assetIds: args.assetIds, voiceId: args.voiceId, voiceVersionId, createdByUserId: access.user._id, createdAt: timestamp });
    await ensureResourceState(ctx, { projectId: args.projectId, resourceType: "projectResourceVersion", resourceId: resourceVersionId.toString() });
    await ctx.db.patch(resource._id, { updatedAt: timestamp });
    return { resourceId: resource._id, resourceVersionId, versionNumber: latest.versionNumber + 1 };
  },
});

export const listResources = query({
  args: { projectId: v.id("projects"), kind: v.optional(projectResourceKind), limit: v.optional(v.number()) },
  returns: v.array(v.object({ resourceId: v.id("projectResources"), name: v.string(), kind: projectResourceKind, resourceVersionId: v.union(v.id("projectResourceVersions"), v.null()), versionNumber: v.number(), profile: v.any(), assetIds: v.array(v.id("assets")), voiceId: v.union(v.id("voices"), v.null()), voiceVersionId: v.union(v.id("voiceVersions"), v.null()) })),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const resources = args.kind
      ? await ctx.db.query("projectResources").withIndex("by_project_and_kind", (q) => q.eq("projectId", args.projectId).eq("kind", args.kind!)).order("desc").take(limit)
      : await ctx.db.query("projectResources").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(limit);
    return Promise.all(resources.filter((resource) => !resource.archivedAt).map(async (resource) => {
      const latest = await ctx.db.query("projectResourceVersions").withIndex("by_resource_and_version", (q) => q.eq("resourceId", resource._id)).order("desc").first();
      return { resourceId: resource._id, name: resource.name, kind: resource.kind, resourceVersionId: latest?._id ?? null, versionNumber: latest?.versionNumber ?? 0, profile: latest?.profile ?? {}, assetIds: latest?.assetIds ?? [], voiceId: latest?.voiceId ?? null, voiceVersionId: latest?.voiceVersionId ?? null };
    }));
  },
});

/** Bounded management view: approved historical versions stay selectable. */
export const resourceVersionPage = query({
  args: { projectId: v.id("projects"), paginationOpts: paginationOptsValidator },
  returns: v.any(),
  handler: async (ctx, args) => {
    const access = await requireProjectAccess(ctx, args.projectId);
    if (args.paginationOpts.numItems > 50) throw new Error("Request at most 50 resource versions per page.");
    const page = await ctx.db.query("projectResourceVersions").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").paginate(args.paginationOpts);
    const rows = await Promise.all(page.page.map(async (version) => {
      const [resource, latest, state] = await Promise.all([
        ctx.db.get(version.resourceId),
        ctx.db.query("projectResourceVersions").withIndex("by_resource_and_version", (q) => q.eq("resourceId", version.resourceId)).order("desc").first(),
        ctx.db.query("resourceStates").withIndex("by_project_resource", (q) => q.eq("projectId", args.projectId).eq("resourceType", "projectResourceVersion").eq("resourceId", version._id.toString())).unique(),
      ]);
      if (!resource || resource.projectId !== args.projectId) throw new Error("Resource version does not belong to this project.");
      return { resourceId: resource._id, resourceVersionId: version._id, name: resource.name, kind: resource.kind,
        versionNumber: version.versionNumber, latestVersionNumber: latest?.versionNumber ?? version.versionNumber,
        profile: version.profile, assetIds: version.assetIds, voiceId: version.voiceId ?? null, voiceVersionId: version.voiceVersionId ?? null,
        archived: Boolean(resource.archivedAt), state: state?.state ?? "DRAFT", createdAt: version.createdAt };
    }));
    return { page: rows, isDone: page.isDone, continueCursor: page.continueCursor, projectRole: access.projectRole };
  },
});

const createBibleArgs = { projectId: v.id("projects"), sourceBibleId: v.optional(v.id("continuityBibles")), snapshot: bibleSnapshot, idempotencyKey: v.optional(v.string()) };
export async function createContinuityBible(ctx: MutationCtx, args: Infer<ReturnType<typeof createBibleValidator>>) {
    const access = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    const idempotencyKey = args.idempotencyKey?.trim();
    if (idempotencyKey && idempotencyKey.length > 200) throw new Error("Continuity request key is too long.");
    if (idempotencyKey) {
      const existing = await ctx.db.query("continuityBibles").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey)).unique();
      if (existing) {
        if (existing.projectId !== args.projectId || existing.sourceBibleId !== args.sourceBibleId || stable(existing.snapshot) !== stable(args.snapshot)) throw new Error("Continuity request key is already used for a different bible.");
        return { bibleId: existing._id, versionNumber: existing.versionNumber };
      }
    }
    await validateBibleBindings(ctx, args.projectId, args.snapshot, false);
    if (args.sourceBibleId) {
      const source = await ctx.db.get(args.sourceBibleId);
      if (!source || source.projectId !== args.projectId) throw new Error("Source continuity bible does not belong to this project.");
    }
    const latest = await ctx.db.query("continuityBibles").withIndex("by_project_and_version", (q) => q.eq("projectId", args.projectId)).order("desc").first();
    const timestamp = Date.now();
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const bibleId = await ctx.db.insert("continuityBibles", { projectId: args.projectId, versionNumber, snapshot: args.snapshot, state: "DRAFT", sourceBibleId: args.sourceBibleId, idempotencyKey, createdByUserId: access.user._id, createdAt: timestamp, updatedAt: timestamp });
    await ensureResourceState(ctx, { projectId: args.projectId, resourceType: "continuityBible", resourceId: bibleId.toString() });
    return { bibleId, versionNumber };
}
function createBibleValidator() { return v.object(createBibleArgs); }
export const createBible = mutation({
  args: createBibleArgs,
  returns: v.object({ bibleId: v.id("continuityBibles"), versionNumber: v.number() }),
  handler: createContinuityBible,
});

export const planningRequirements = query({
  args: { projectId: v.id("projects"), productionId: v.optional(v.id("productions")) },
  returns: v.object({ productionId: v.union(v.id("productions"), v.null()), episodeId: v.union(v.id("episodes"), v.null()), requiresBible: v.boolean() }),
  handler: async (ctx, args) => {
    const selected = await planningSelection(ctx, args.projectId, args.productionId);
    return { productionId: selected.production?._id ?? null, episodeId: selected.episode?._id ?? null, requiresBible: Boolean(selected.episode) };
  },
});

export const productionPlanningContext = query({
  args: { projectId: v.id("projects"), productionId: v.optional(v.id("productions")), continuityBibleId: v.optional(v.id("continuityBibles")), memoryQuery: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => resolvePlanningContinuity(ctx, args.projectId, args.productionId, args.continuityBibleId,args.memoryQuery),
});

export const listBibles = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  returns: v.array(v.object({ bibleId: v.id("continuityBibles"), versionNumber: v.number(), state: v.union(v.literal("DRAFT"), v.literal("APPROVED")), snapshot: bibleSnapshot, sourceBibleId: v.union(v.id("continuityBibles"), v.null()), approvedAt: v.union(v.number(), v.null()), createdAt: v.number() })),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const rows = await ctx.db.query("continuityBibles").withIndex("by_project_and_version", (q) => q.eq("projectId", args.projectId)).order("desc").take(Math.max(1, Math.min(100, Math.floor(args.limit ?? 30))));
    return rows.map((value) => ({ bibleId: value._id, versionNumber: value.versionNumber, state: value.state, snapshot: value.snapshot, sourceBibleId: value.sourceBibleId ?? null, approvedAt: value.approvedAt ?? null, createdAt: value.createdAt }));
  },
});

/** Draft proposals are not historical facts. Facts commit only against an approved final timeline. */
export const acceptStoryState = mutation({
  args: { projectId: v.id("projects"), episodeId: v.id("episodes"), productionVersionId: v.id("productionVersions"), timelineId: v.id("timelines"), continuityBibleId: v.optional(v.id("continuityBibles")), previousAcceptedStateId: v.optional(v.id("episodeStoryStates")), snapshot: storySnapshot },
  returns: v.object({ storyStateId: v.id("episodeStoryStates"), invalidatedEpisodeCount: v.number(), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    const { episode, production } = await requireEpisode(ctx, args.projectId, args.episodeId);
    boundedSnapshot(args.snapshot);
    const version = await ctx.db.get(args.productionVersionId);
    if (!version || version.productionId !== production._id || version.status !== "APPROVED" || production.currentVersionId !== version._id) throw new Error("Accept story state only for the current approved production version.");
    const plannedBible = version.planningContextSnapshot && typeof version.planningContextSnapshot === "object" ? (version.planningContextSnapshot as { continuityBibleId?: string }).continuityBibleId : undefined;
    if (plannedBible && plannedBible !== args.continuityBibleId) throw new Error("Accept story state against the continuity bible used by this approved production version.");
    const timeline = await ctx.db.get(args.timelineId);
    if (!timeline || timeline.projectId !== args.projectId || timeline.productionId !== production._id) throw new Error("Final timeline does not belong to this episode.");
    await requireApprovedResource(ctx, args.projectId, "timeline", timeline._id.toString(), production._id);
    const manifest = timeline.manifestId ? await ctx.db.get(timeline.manifestId) : await ctx.db.query("manifests").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).order("desc").first();
    if (!manifest || manifest.productionId !== production._id || (manifest.manifest as { productionVersionId?: string })?.productionVersionId !== version._id.toString()) throw new Error("Final timeline must reference a manifest from this approved production version.");
    if (args.continuityBibleId) {
      const bible = await ctx.db.get(args.continuityBibleId);
      if (!bible || bible.projectId !== args.projectId || bible.state !== "APPROVED") throw new Error("Choose an approved continuity bible from this project.");
      await requireApprovedResource(ctx, args.projectId, "continuityBible", bible._id.toString());
      await validateBibleBindings(ctx, args.projectId, bible.snapshot, true);
      const bound = new Set((bible.snapshot as { resourceBindings: Array<{ resourceId: string }> }).resourceBindings.map((entry) => entry.resourceId));
      for (const character of args.snapshot.characterStates) {
        const resource = await ctx.db.get(character.resourceId);
        if (!resource || resource.projectId !== args.projectId || resource.kind !== "CHARACTER" || !bound.has(resource._id)) throw new Error("Story characters must be bound to this project's selected continuity bible.");
      }
    } else if (args.snapshot.characterStates.length) throw new Error("Character story state requires an approved continuity bible.");
    const predecessor = episode.predecessorEpisodeId ? await ctx.db.get(episode.predecessorEpisodeId) : null;
    if (predecessor && (predecessor.projectId !== args.projectId || predecessor.continuityStatus !== "CURRENT" || !predecessor.acceptedStoryStateId || episode.inputStoryStateId !== predecessor.acceptedStoryStateId)) throw new Error("Refresh continuity from the accepted preceding episode before accepting this episode.");
    const previous = episode.acceptedStoryStateId ? await ctx.db.get(episode.acceptedStoryStateId) : null;
    if (previous && previous.productionVersionId === version._id && previous.continuityBibleId === args.continuityBibleId && previous.predecessorStoryStateId === predecessor?.acceptedStoryStateId && stable(previous.snapshot) === stable(args.snapshot)) {
      await materializeAcceptedMemory(ctx,args.projectId,previous._id);
      return { storyStateId: previous._id, invalidatedEpisodeCount: 0, replayed: true };
    }
    if (episode.acceptedStoryStateId !== args.previousAcceptedStateId) throw new Error("Accepted story state changed. Reload before accepting a revision.");
    const timestamp = Date.now();
    const storyStateId = await ctx.db.insert("episodeStoryStates", { projectId: args.projectId, episodeId: episode._id, productionVersionId: version._id, timelineId: timeline._id, continuityBibleId: args.continuityBibleId, predecessorStoryStateId: predecessor?.acceptedStoryStateId, snapshot: args.snapshot, createdByUserId: access.user._id, createdAt: timestamp });
    for (const targetState of ["IN_REVIEW", "APPROVED", "LOCKED"] as const) await transitionResourceState(ctx, { projectId: args.projectId, productionId: production._id, resourceType: "episodeStoryState", resourceId: storyStateId.toString(), targetState, roles: ["OWNER", "EDITOR"], decision: `STORY_${targetState}`, note: `Accepted final timeline ${timeline._id.toString()}` });
    await ctx.db.patch(episode._id, { acceptedStoryStateId: storyStateId, continuityStatus: "CURRENT", updatedAt: timestamp });
    await materializeAcceptedMemory(ctx,args.projectId,storyStateId);
    const downstream = await ctx.db.query("episodes").withIndex("by_project_and_number", (q) => q.eq("projectId", args.projectId).gt("episodeNumber", episode.episodeNumber)).take(500);
    const storyDependents = downstream.filter(dependent => dependent.continuityMode !== 'PROJECT_IDENTITY');
    for (const dependent of storyDependents) await ctx.db.patch(dependent._id, { continuityStatus: "STALE", updatedAt: timestamp });
    return { storyStateId, invalidatedEpisodeCount: storyDependents.length, replayed: false };
  },
});

/** Explicit paginated backfill retains every source and never replaces facts. */
export const syncMemory = mutation({
  args:{projectId:v.id('projects'),paginationOpts:paginationOptsValidator},
  returns:v.object({isDone:v.boolean(),continueCursor:v.string(),sources:v.number(),insertedFacts:v.number()}),
  handler:async(ctx,args)=>{
    await requireProjectRole(ctx,args.projectId,['OWNER','EDITOR']);
    if(args.paginationOpts.numItems>20)throw new Error('Sync at most20 episodes per request.');
    const page=await ctx.db.query('episodes').withIndex('by_project_and_number',q=>q.eq('projectId',args.projectId)).paginate(args.paginationOpts);
    let insertedFacts=0,sources=0;
    for(const episode of page.page){if(episode.continuityStatus==='CURRENT'&&episode.acceptedStoryStateId){insertedFacts+=await materializeAcceptedMemory(ctx,args.projectId,episode.acceptedStoryStateId);sources++;}}
    return {isDone:page.isDone,continueCursor:page.continueCursor,sources,insertedFacts};
  },
});

export const planningContext = query({
  args: { projectId: v.id("projects"), episodeId: v.id("episodes"), continuityBibleId: v.optional(v.id("continuityBibles")) },
  returns: v.object({ productionId: v.id("productions"), continuityStatus: v.union(v.literal("CURRENT"), v.literal("STALE")), storyState: v.union(storySnapshot, v.null()), bible: v.union(bibleSnapshot, v.null()) }),
  handler: async (ctx, args) => {
    const { episode } = await requireEpisode(ctx, args.projectId, args.episodeId);
    const input = episode.inputStoryStateId ? await ctx.db.get(episode.inputStoryStateId) : null;
    if (input && input.projectId !== args.projectId) throw new Error("Story state does not belong to this project.");
    const bible = args.continuityBibleId ? await ctx.db.get(args.continuityBibleId) : null;
    if (args.continuityBibleId && (!bible || bible.projectId !== args.projectId || bible.state !== "APPROVED")) throw new Error("Approved continuity bible not found in this project.");
    if (bible) await requireApprovedResource(ctx, args.projectId, "continuityBible", bible._id.toString());
    return { productionId: episode.productionId, continuityStatus: episode.continuityStatus, storyState: input?.snapshot ?? null, bible: bible?.snapshot ?? null };
  },
});
