import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireProjectAccess, requireProjectRole, resolveProjectAccessForActor } from "./authorization";

export const RESOURCE_STATES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "LOCKED",
  "REVISION_REQUESTED",
] as const;

export type ResourceState = (typeof RESOURCE_STATES)[number];
export type ResourceStateCtx = QueryCtx | MutationCtx;
export type ResourceStateDoc = Doc<"resourceStates">;
export const RESOURCE_TYPES = [
  "production", "productionVersion", "productionBible", "character", "location", "product", "referencePack",
  "asset", "sequence", "scene", "shot", "shotVersion", "audio", "transcript", "caption", "timeline", "review", "export", "voice",
  "projectResourceVersion", "continuityBible", "episodeStoryState", "movieVersion", "movieReview", "movieExport", "beatAnalysisVersion",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const resourceStateValidator = v.union(
  v.literal("DRAFT"),
  v.literal("IN_REVIEW"),
  v.literal("APPROVED"),
  v.literal("LOCKED"),
  v.literal("REVISION_REQUESTED"),
);

const transitions: Record<ResourceState, readonly ResourceState[]> = {
  DRAFT: ["DRAFT", "IN_REVIEW"],
  IN_REVIEW: ["IN_REVIEW", "DRAFT", "APPROVED", "REVISION_REQUESTED"],
  APPROVED: ["APPROVED", "LOCKED", "REVISION_REQUESTED"],
  LOCKED: ["LOCKED", "REVISION_REQUESTED"],
  REVISION_REQUESTED: ["REVISION_REQUESTED", "DRAFT", "IN_REVIEW"],
};

export function isResourceState(value: string): value is ResourceState {
  return (RESOURCE_STATES as readonly string[]).includes(value);
}

export function canTransitionResourceState(from: ResourceState, to: ResourceState): boolean {
  return transitions[from].includes(to);
}

export function assertResourceStateTransition(from: ResourceState, to: ResourceState): void {
  if (!canTransitionResourceState(from, to)) {
    throw new Error(`Invalid resource state transition: ${from} -> ${to}.`);
  }
}

export function isResourceEditable(state: ResourceState): boolean {
  return state === "DRAFT" || state === "REVISION_REQUESTED";
}

export function isResourceApproved(state: ResourceState): boolean {
  return state === "APPROVED" || state === "LOCKED";
}

export function isResourceLocked(state: ResourceState): boolean {
  return state === "LOCKED";
}

function requireResourceIdentity(resourceType: string, resourceId: string) {
  const type = resourceType.trim();
  const id = resourceId.trim();
  if (!type || type.length > 100) throw new Error("Resource type is required and must be at most 100 characters.");
  if (!id || id.length > 300) throw new Error("Resource ID is required and must be at most 300 characters.");
  return { resourceType: type, resourceId: id };
}

async function findState(
  ctx: ResourceStateCtx,
  projectId: Id<"projects">,
  resourceType: string,
  resourceId: string,
) {
  const identity = requireResourceIdentity(resourceType, resourceId);
  return await ctx.db
    .query("resourceStates")
    .withIndex("by_project_resource", (q) => q.eq("projectId", projectId).eq("resourceType", identity.resourceType).eq("resourceId", identity.resourceId))
    .unique();
}

async function requireProductionProject(ctx: ResourceStateCtx, projectId: Id<"projects">, productionId?: Id<"productions">) {
  if (!productionId) return;
  const production = await ctx.db.get(productionId);
  if (!production || production.projectId !== projectId) throw new Error("Production does not belong to this project.");
}

function requireResourceType(value: string): ResourceType {
  const normalized = value.trim();
  if (!(RESOURCE_TYPES as readonly string[]).includes(normalized)) throw new Error(`Unsupported resource type: ${normalized || "(empty)"}.`);
  return normalized as ResourceType;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type ResolvedResource = {
  projectId: Id<"projects">;
  productionId?: Id<"productions">;
  resource: Doc<"projects"> | Doc<"productions"> | Doc<"productionVersions"> | Doc<"productionBibles"> | Doc<"characters"> | Doc<"locations"> | Doc<"products"> | Doc<"referencePacks"> | Doc<"assets"> | Doc<"sequences"> | Doc<"scenes"> | Doc<"shots"> | Doc<"shotVersions"> | Doc<"audio"> | Doc<"transcripts"> | Doc<"captions"> | Doc<"timelines"> | Doc<"reviews"> | Doc<"exports"> | Doc<"voices"> | Doc<"projectResourceVersions"> | Doc<"continuityBibles"> | Doc<"episodeStoryStates"> | Doc<"movieVersions"> | Doc<"movieReviews"> | Doc<"movieExports"> | Doc<"beatAnalysisVersions">;
};

/** Resolve a resource through its canonical project/production ownership. */
export async function resolveProjectResource(
  ctx: ResourceStateCtx,
  projectId: Id<"projects">,
  resourceType: string,
  resourceId: string,
  expectedProductionId?: Id<"productions">,
  actorId?: Id<"users">,
): Promise<ResolvedResource> {
  const type = requireResourceType(resourceType);
  const identity = requireResourceIdentity(type, resourceId);
  const access = actorId ? await resolveProjectAccessForActor(ctx,projectId,actorId) : await requireProjectAccess(ctx, projectId);
  void access;
  let resource: ResolvedResource["resource"] | null = null;
  let productionId: Id<"productions"> | undefined;
  try {
    switch (type) {
      case "production": resource = await ctx.db.get(identity.resourceId as Id<"productions">); productionId = resource?._id as Id<"productions"> | undefined; break;
      case "productionVersion": resource = await ctx.db.get(identity.resourceId as Id<"productionVersions">); productionId = resource?.productionId; break;
      case "productionBible": resource = await ctx.db.get(identity.resourceId as Id<"productionBibles">); productionId = resource?.productionId; break;
      case "character": resource = await ctx.db.get(identity.resourceId as Id<"characters">); productionId = resource?.productionId; break;
      case "location": resource = await ctx.db.get(identity.resourceId as Id<"locations">); productionId = resource?.productionId; break;
      case "product": resource = await ctx.db.get(identity.resourceId as Id<"products">); productionId = resource?.productionId; break;
      case "referencePack": resource = await ctx.db.get(identity.resourceId as Id<"referencePacks">); productionId = resource?.productionId; break;
      case "asset": resource = await ctx.db.get(identity.resourceId as Id<"assets">); productionId = resource?.productionId; break;
      case "sequence": resource = await ctx.db.get(identity.resourceId as Id<"sequences">); productionId = resource?.productionId; break;
      case "scene": resource = await ctx.db.get(identity.resourceId as Id<"scenes">); productionId = resource?.productionId; break;
      case "shot": resource = await ctx.db.get(identity.resourceId as Id<"shots">); productionId = resource?.productionId; break;
      case "shotVersion": resource = await ctx.db.get(identity.resourceId as Id<"shotVersions">); productionId = resource?.productionId; break;
      case "audio": resource = await ctx.db.get(identity.resourceId as Id<"audio">); productionId = resource?.productionId; break;
      case "transcript": resource = await ctx.db.get(identity.resourceId as Id<"transcripts">); productionId = resource?.productionId; break;
      case "caption": resource = await ctx.db.get(identity.resourceId as Id<"captions">); productionId = resource?.productionId; break;
      case "timeline": resource = await ctx.db.get(identity.resourceId as Id<"timelines">); productionId = resource?.productionId; break;
      case "review": resource = await ctx.db.get(identity.resourceId as Id<"reviews">); productionId = resource?.productionId; break;
      case "export": resource = await ctx.db.get(identity.resourceId as Id<"exports">); productionId = resource?.productionId; break;
      case "voice": resource = await ctx.db.get(identity.resourceId as Id<"voices">); productionId = resource?.productionId; break;
      case "projectResourceVersion": resource = await ctx.db.get(identity.resourceId as Id<"projectResourceVersions">); break;
      case "beatAnalysisVersion": resource = await ctx.db.get(identity.resourceId as Id<"beatAnalysisVersions">); break;
      case "continuityBible": resource = await ctx.db.get(identity.resourceId as Id<"continuityBibles">); break;
      case "movieVersion": {
        resource = await ctx.db.get(identity.resourceId as Id<'movieVersions'>);
        const movie = resource ? await ctx.db.get(resource.movieId) : null;
        if (!movie || movie.projectId !== projectId || movie.archivedAt || resource?.projectId !== movie.projectId) resource = null;
        break;
      }
      case "movieReview":
      case "movieExport": {
        resource = type === 'movieReview' ? await ctx.db.get(identity.resourceId as Id<'movieReviews'>) : await ctx.db.get(identity.resourceId as Id<'movieExports'>);
        const version = resource ? await ctx.db.get(resource.movieVersionId) : null;
        const movie = version ? await ctx.db.get(version.movieId) : null;
        if (!version || !movie || movie.archivedAt || version.projectId !== projectId || movie.projectId !== projectId || resource?.projectId !== projectId) resource = null;
        break;
      }
      case "episodeStoryState": {
        resource = await ctx.db.get(identity.resourceId as Id<"episodeStoryStates">);
        const episode = resource ? await ctx.db.get(resource.episodeId) : null;
        productionId = episode?.productionId;
        break;
      }
    }
  } catch {
    resource = null;
  }
  if (!resource) throw new Error(`${type} resource not found.`);
  // Asset productionId records origin, not permission to use the project's
  // library. Takes/scenes remain production-owned; assets remain project-owned.
  if (type === "asset") {
    const asset = resource as Doc<"assets">;
    if (asset.scope === "GLOBAL" || asset.deletedAt) throw new Error("Import an active project asset before using it.");
    if (expectedProductionId) await requireProductionProject(ctx, projectId, expectedProductionId);
  } else if (expectedProductionId && productionId !== expectedProductionId) throw new Error("Resource does not belong to this production.");

  let resolvedProjectId: Id<"projects"> | undefined = "projectId" in resource ? resource.projectId : undefined;
  if (!resolvedProjectId && productionId) {
    const production = await ctx.db.get(productionId);
    resolvedProjectId = production?.projectId;
  }
  if (!resolvedProjectId || resolvedProjectId !== projectId) throw new Error("Resource does not belong to this project.");
  return { projectId: resolvedProjectId, productionId, resource };
}

function legacyState(resource: ResolvedResource["resource"], resourceType: ResourceType): ResourceState {
  const status = String("status" in resource ? resource.status ?? "" : "").toUpperCase();
  if (status === "LOCKED") return "LOCKED";
  if (status === "APPROVED") return "APPROVED";
  if (resourceType === "timeline") {
    const metadata = record(record((resource as Doc<"timelines">).tracks).metadata);
    if (metadata.lockState === "LOCKED") return "LOCKED";
    if (metadata.approvalStatus === "APPROVED") return "APPROVED";
  }
  return "DRAFT";
}

export async function getResourceState(
  ctx: ResourceStateCtx,
  projectId: Id<"projects">,
  resourceType: string,
  resourceId: string,
) {
  requireResourceIdentity(resourceType, resourceId);
  await requireProjectAccess(ctx, projectId);
  return await findState(ctx, projectId, resourceType, resourceId);
}

export async function ensureResourceState(
  ctx: MutationCtx,
  args: {
    projectId: Id<"projects">;
    productionId?: Id<"productions">;
    resourceType: string;
    resourceId: string;
    initialState?: ResourceState;
  },
  actorId?: Id<"users">,
) {
  requireResourceIdentity(args.resourceType, args.resourceId);
  if(actorId&&args.initialState&&!["DRAFT","IN_REVIEW"].includes(args.initialState))throw new Error("Automation cannot approve a resource.");
  if(actorId)await resolveProjectAccessForActor(ctx,args.projectId,actorId,["OWNER","EDITOR"]);else await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
  await requireProductionProject(ctx, args.projectId, args.productionId);
  const existing = await findState(ctx, args.projectId, args.resourceType, args.resourceId);
  if (existing) return existing;
  const timestamp = Date.now();
  const stateId = await ctx.db.insert("resourceStates", {
    projectId: args.projectId,
    productionId: args.productionId,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    state: "DRAFT",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (args.initialState && args.initialState !== "DRAFT") {
    await ctx.db.patch(stateId, { state: args.initialState, updatedAt: timestamp });
  }
  return await ctx.db.get(stateId);
}

export async function getEffectiveResourceState(
  ctx: ResourceStateCtx,
  projectId: Id<"projects">,
  resourceType: string,
  resourceId: string,
  productionId?: Id<"productions">,
  actorId?: Id<"users">,
) {
  const resolved = await resolveProjectResource(ctx, projectId, resourceType, resourceId, productionId, actorId);
  const state = await findState(ctx, projectId, resourceType, resourceId);
  const currentState = state?.state ?? legacyState(resolved.resource, requireResourceType(resourceType));
  return { ...resolved, state, currentState };
}

export async function requireApprovedResource(
  ctx: ResourceStateCtx,
  projectId: Id<"projects">,
  resourceType: string,
  resourceId: string,
  productionId?: Id<"productions">,
  actorId?: Id<"users">,
) {
  const result = await getEffectiveResourceState(ctx, projectId, resourceType, resourceId, productionId, actorId);
  if (!isResourceApproved(result.currentState)) throw new Error(`Resource must be approved before assembly; current state is ${result.currentState}.`);
  return result;
}

export async function requireEditable(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  resourceType: string,
  resourceId: string,
) {
  requireResourceIdentity(resourceType, resourceId);
  const access = await requireProjectRole(ctx, projectId, ["OWNER", "EDITOR"]);
  const state = await findState(ctx, projectId, resourceType, resourceId);
  const currentState = state?.state ?? "DRAFT";
  if (!isResourceEditable(currentState)) throw new Error(`Resource is ${currentState.toLowerCase()} and cannot be edited.`);
  return { access, state, currentState };
}

export async function requireApproved(
  ctx: ResourceStateCtx,
  projectId: Id<"projects">,
  resourceType: string,
  resourceId: string,
) {
  requireResourceIdentity(resourceType, resourceId);
  const access = await requireProjectAccess(ctx, projectId);
  const state = await findState(ctx, projectId, resourceType, resourceId);
  const currentState = state?.state ?? "DRAFT";
  if (!isResourceApproved(currentState)) throw new Error(`Resource must be approved before use; current state is ${currentState}.`);
  return { access, state, currentState };
}

export async function requireLocked(
  ctx: ResourceStateCtx,
  projectId: Id<"projects">,
  resourceType: string,
  resourceId: string,
) {
  requireResourceIdentity(resourceType, resourceId);
  const access = await requireProjectAccess(ctx, projectId);
  const state = await findState(ctx, projectId, resourceType, resourceId);
  const currentState = state?.state ?? "DRAFT";
  if (!isResourceLocked(currentState)) throw new Error(`Resource must be locked before use; current state is ${currentState}.`);
  return { access, state, currentState };
}

export const get = query({
  args: { projectId: v.id("projects"), resourceType: v.string(), resourceId: v.string() },
  handler: async (ctx, args) => {
    const state = await getResourceState(ctx, args.projectId, args.resourceType, args.resourceId);
    return { state: state?.state ?? "DRAFT", resourceState: state };
  },
});

/**
 * This is a narrow infrastructure mutation for callers that need a state row
 * before resource CRUD exists. State transitions themselves are intentionally
 * reserved for the P0-6 approval/locking mutations.
 */
export const ensure = mutation({
  args: {
    projectId: v.id("projects"), productionId: v.optional(v.id("productions")),
    resourceType: v.string(), resourceId: v.string(),
  },
  handler: async (ctx, args) => ensureResourceState(ctx, args),
});
