import { validateBeatVersionForApproval } from './beatAnalysis';
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {sha256Equal} from '../renderer/src/media/sha256';
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireProjectAccess, requireProjectRole, resolveProjectAccessForActor, type ProjectRole } from "./authorization";
import { validateBibleBindings, validateProjectResourceReferences } from "./continuityContracts";
import { validateVoiceForApproval } from "./voices";
import {
  assertResourceStateTransition,
  ensureResourceState,
  getEffectiveResourceState,
  isResourceApproved,
  isResourceLocked,
  type ResourceState,
} from "./resourceStates";

type ReadCtx = QueryCtx | MutationCtx;
const resourceTypeValidator = v.string();

function publicResource(resourceType: string, resource: unknown) {
  if (resourceType !== "voice" || typeof resource !== "object" || resource === null) return resource;
  const voice = resource as Doc<"voices">;
  return {
    _id: voice._id,
    projectId: voice.projectId,
    productionId: voice.productionId,
    characterId: voice.characterId,
    kind: voice.kind,
    name: voice.name,
    description: voice.description,
    language: voice.language,
    status: voice.status,
    currentConsentId: voice.currentConsentId,
    createdAt: voice.createdAt,
    updatedAt: voice.updatedAt,
  };
}

function note(value: string | undefined) {
  const normalized = value?.trim();
  if (normalized && normalized.length > 10_000) throw new Error("Approval note is too long.");
  return normalized || undefined;
}

async function appendApprovalEvent(
  ctx: MutationCtx,
  args: {
    projectId: Id<"projects">;
    productionId?: Id<"productions">;
    resourceType: string;
    resourceId: string;
    decision: string;
    actorUserId: Id<"users">;
    studioExternalId: string;
    studioId?: Id<"studios">;
    note?: string;
  },
) {
  return await ctx.db.insert("approvals", {
    studioExternalId: args.studioExternalId,
    studioId: args.studioId,
    projectId: args.projectId,
    productionId: args.productionId,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    decision: args.decision,
    actorUserId: args.actorUserId,
    note: args.note,
    createdAt: Date.now(),
  });
}

export async function transitionResourceState(
  ctx: MutationCtx,
  args: {
    projectId: Id<"projects">;
    productionId?: Id<"productions">;
    resourceType: string;
    resourceId: string;
    targetState: ResourceState;
    roles: readonly ProjectRole[];
    decision: string;
    note?: string;
    unlockReason?: string;
  },
  actorId?: Id<"users">,
) {
  if(actorId&&args.targetState!=="IN_REVIEW")throw new Error("Stored automation actors may request review only.");
  if (args.resourceType === "production" || args.resourceType === "productionVersion") {
    throw new Error("Production planning and approval must use the canonical productions.ts path.");
  }
  if (['movieVersion','movieReview','movieExport'].includes(args.resourceType) && process.env.FINALFRAME_MOVIE_ENABLED !== 'true') throw new Error('Movie approvals are not enabled yet.');
  const access = actorId?await resolveProjectAccessForActor(ctx,args.projectId,actorId,args.roles):await requireProjectRole(ctx, args.projectId, args.roles);
  const effective = await getEffectiveResourceState(ctx, args.projectId, args.resourceType, args.resourceId, args.productionId,actorId);
  if (args.resourceType === "voice" && ["APPROVED", "LOCKED"].includes(args.targetState)) await validateVoiceForApproval(ctx, args.projectId, (effective.resource as Doc<"voices">)._id);
  if(args.resourceType==='beatAnalysisVersion'&&['APPROVED','LOCKED'].includes(args.targetState))await validateBeatVersionForApproval(ctx,args.projectId,(effective.resource as Doc<'beatAnalysisVersions'>)._id);
  const productionId = args.productionId ?? effective.productionId;
  if (!productionId && !["asset", "voice", "projectResourceVersion", "continuityBible", "movieVersion", "movieReview", "movieExport", "beatAnalysisVersion"].includes(args.resourceType)) throw new Error("Approval requires a production-owned or supported project-owned resource.");
  if (['APPROVED','LOCKED'].includes(args.targetState) && args.resourceType === 'movieVersion') {
    const version = effective.resource as Doc<'movieVersions'>;
    if (version.state !== 'READY' || !version.contentHash || !version.durationInFrames || version.validatedComponentCount !== version.componentCount) throw new Error('Validate the exact movie composition before approval or locking.');
  }
  if (['APPROVED','LOCKED'].includes(args.targetState) && ['movieReview','movieExport'].includes(args.resourceType)) {
    const resource = effective.resource as Doc<'movieReviews'> | Doc<'movieExports'>;
    const output = args.resourceType === 'movieReview' ? await ctx.db.get((resource as Doc<'movieReviews'>).movieExportId) : resource as Doc<'movieExports'>;
    if (!output || output.projectId !== args.projectId || output.movieVersionId !== resource.movieVersionId || output.status !== 'COMPLETED' || !output.storageId || !output.checksum || !await ctx.db.system.get('_storage',output.storageId)) throw new Error('Movie approval requires the exact completed stored export.');
    const versionState = await getEffectiveResourceState(ctx,args.projectId,'movieVersion',resource.movieVersionId);
    if (versionState.currentState !== 'LOCKED') throw new Error('Lock the validated movie version first.');
  }
  if (args.targetState === "APPROVED" && args.resourceType === "continuityBible") {
    await validateBibleBindings(ctx, args.projectId, (effective.resource as Doc<"continuityBibles">).snapshot, true);
  }
  if (args.targetState === "APPROVED" && args.resourceType === "projectResourceVersion") {
    const version = effective.resource as Doc<"projectResourceVersions">;
    const resource = await ctx.db.get(version.resourceId);
    if (!resource || resource.projectId !== args.projectId || resource.archivedAt) throw new Error("Active project resource not found.");
    await validateProjectResourceReferences(ctx, args.projectId, version);
  }
  if (effective.currentState === args.targetState) return { state: effective.state, currentState: effective.currentState, resource: publicResource(args.resourceType, effective.resource), productionId, replayed: true };
  assertResourceStateTransition(effective.currentState, args.targetState);
  const state = effective.state ?? await ensureResourceState(ctx, {
    projectId: args.projectId,
    productionId,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    initialState: effective.currentState,
  },actorId);
  if (!state) throw new Error("Unable to initialize resource state.");
  const timestamp = Date.now();
  const patch: Record<string, unknown> = { state: args.targetState, updatedAt: timestamp };
  if (args.targetState === "APPROVED") {
    patch.approvedByUserId = access.user._id;
    patch.approvedAt = timestamp;
    patch.unlockReason = undefined;
  }
  if (args.targetState === "LOCKED") {
    patch.lockedByUserId = access.user._id;
    patch.lockedAt = timestamp;
  }
  if (args.targetState === "REVISION_REQUESTED") {
    patch.unlockReason = args.unlockReason ?? args.note;
    patch.lockedByUserId = undefined;
    patch.lockedAt = undefined;
  }
  await ctx.db.patch(state._id, patch as never);
  if (args.resourceType === "continuityBible" && args.targetState === "APPROVED") {
    const bible = effective.resource as Doc<"continuityBibles">;
    if (bible.state !== "APPROVED") await ctx.db.patch(bible._id, { state: "APPROVED", approvedByUserId: access.user._id, approvedAt: timestamp, updatedAt: timestamp });
  }
  await appendApprovalEvent(ctx, {
    projectId: args.projectId,
    productionId,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    decision: args.decision,
    actorUserId: access.user._id,
    studioExternalId: access.studio.externalId,
    studioId: access.studio._id,
    note: note(args.note ?? args.unlockReason),
  });
  return { state: await ctx.db.get(state._id), currentState: args.targetState, resource: publicResource(args.resourceType, effective.resource), productionId, replayed: false };
}

async function authorizedState(ctx: ReadCtx, args: { projectId: Id<"projects">; resourceType: string; resourceId: string; productionId?: Id<"productions"> }) {
  await requireProjectAccess(ctx, args.projectId);
  return await getEffectiveResourceState(ctx, args.projectId, args.resourceType, args.resourceId, args.productionId);
}

export const get = query({
  args: { projectId: v.id("projects"), productionId: v.optional(v.id("productions")), resourceType: resourceTypeValidator, resourceId: v.string() },
  handler: async (ctx, args) => {
    const result = await authorizedState(ctx, args);
    return { ...result, resource: publicResource(args.resourceType, result.resource), approved: isResourceApproved(result.currentState), locked: isResourceLocked(result.currentState) };
  },
});

export const history = query({
  args: { projectId: v.id("projects"), productionId: v.optional(v.id("productions")), resourceType: resourceTypeValidator, resourceId: v.string() },
  handler: async (ctx, args) => {
    const result = await authorizedState(ctx, args);
    const events = await ctx.db.query("approvals").withIndex("by_resource", (q) => q.eq("resourceType", args.resourceType).eq("resourceId", args.resourceId)).order("desc").take(100);
    return events.filter((event) => event.productionId === result.productionId && (!event.projectId || event.projectId === args.projectId));
  },
});

export const submitForReview = mutation({
  args: { projectId: v.id("projects"), productionId: v.optional(v.id("productions")), resourceType: resourceTypeValidator, resourceId: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, args) => transitionResourceState(ctx, { ...args, targetState: "IN_REVIEW", roles: ["OWNER", "EDITOR"], decision: "SUBMITTED", note: note(args.note) }),
});

export const approve = mutation({
  args: { projectId: v.id("projects"), productionId: v.optional(v.id("productions")), resourceType: resourceTypeValidator, resourceId: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const current = await getEffectiveResourceState(ctx, args.projectId, args.resourceType, args.resourceId, args.productionId);
    if (args.resourceType === "voice") await validateVoiceForApproval(ctx, args.projectId, (current.resource as Doc<"voices">)._id);
    if (isResourceApproved(current.currentState)) return { state: current.state, currentState: current.currentState, resource: publicResource(args.resourceType, current.resource), productionId: current.productionId, replayed: true };
    return transitionResourceState(ctx, { ...args, targetState: "APPROVED", roles: ["OWNER", "EDITOR", "REVIEWER"], decision: "APPROVED", note: note(args.note) });
  },
});

export const lock = mutation({
  args: { projectId: v.id("projects"), productionId: v.optional(v.id("productions")), resourceType: resourceTypeValidator, resourceId: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const current = await getEffectiveResourceState(ctx, args.projectId, args.resourceType, args.resourceId, args.productionId);
    if (args.resourceType === "voice") await validateVoiceForApproval(ctx, args.projectId, (current.resource as Doc<"voices">)._id);
    if (isResourceLocked(current.currentState)) return { state: current.state, currentState: current.currentState, resource: publicResource(args.resourceType, current.resource), productionId: current.productionId, replayed: true };
    if (!isResourceApproved(current.currentState)) throw new Error("Only an approved resource can be locked.");
    return transitionResourceState(ctx, { ...args, targetState: "LOCKED", roles: ["OWNER", "EDITOR"], decision: "LOCKED", note: note(args.note) });
  },
});

export const requestRevision = mutation({
  args: { projectId: v.id("projects"), productionId: v.optional(v.id("productions")), resourceType: resourceTypeValidator, resourceId: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    const revisionNote = note(args.note);
    if (!revisionNote) throw new Error("A revision request must include a reason.");
    return transitionResourceState(ctx, { ...args, targetState: "REVISION_REQUESTED", roles: ["OWNER", "EDITOR", "REVIEWER"], decision: "REVISION_REQUESTED", note: revisionNote });
  },
});

export const unlock = mutation({
  args: { projectId: v.id("projects"), productionId: v.optional(v.id("productions")), resourceType: resourceTypeValidator, resourceId: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const unlockReason = note(args.reason);
    if (!unlockReason) throw new Error("Unlocking a resource requires a reason.");
    const current = await getEffectiveResourceState(ctx, args.projectId, args.resourceType, args.resourceId, args.productionId);
    if (current.currentState !== "LOCKED") throw new Error("Only a locked resource can be unlocked.");
    return transitionResourceState(ctx, { ...args, targetState: "REVISION_REQUESTED", roles: ["OWNER"], decision: "UNLOCKED", note: unlockReason, unlockReason });
  },
});

/** Capability-scoped client authority: only a currently active hashed link can
 * decide its exact review. This never approves a plan, timeline, take or asset. */
export async function applyClientReviewDecision(ctx: MutationCtx, args: {
  linkId: Id<'reviewLinks'>; tokenHash: string; decision: 'APPROVED' | 'CHANGES_REQUESTED'; authorName: string; note?: string;
}) {
  const link = await ctx.db.get(args.linkId);
  if (!link || link.tokenHash !== args.tokenHash || link.revokedAt !== undefined || link.expiresAt <= Date.now()) throw new Error('This review link is unavailable.');
  const review = await ctx.db.get(link.reviewId);
  const project = await ctx.db.get(link.projectId);
  if (!project || project.deletedAt || project.archivedAt || !review || review.projectId !== link.projectId || review.productionId !== link.productionId || review.timelineId !== link.timelineId || review.manifestId !== link.manifestId || review.exportId !== link.exportId || review.timelineVersionNumber !== link.timelineVersionNumber) throw new Error('This review version is unavailable.');
  const timeline = await ctx.db.get(link.timelineId);
  const exportRecord = link.exportId ? await ctx.db.get(link.exportId) : null;
  if (!timeline || timeline.projectId !== link.projectId || timeline.productionId !== link.productionId || timeline.versionNumber !== link.timelineVersionNumber || !exportRecord || exportRecord.projectId !== link.projectId || exportRecord.productionId !== link.productionId || exportRecord.manifestId !== link.manifestId || exportRecord.status !== 'COMPLETED' || !exportRecord.storageId) throw new Error('This exact export version is unavailable.');
  if (review.status === args.decision) return { replayed: true };
  if (review.status !== 'REQUESTED') throw new Error('This version already received a decision. Request a new review for another revision.');
  const state = await ctx.db.query('resourceStates').withIndex('by_project_resource', q => q.eq('projectId', link.projectId).eq('resourceType', 'review').eq('resourceId', review._id)).unique();
  const targetState = args.decision === 'APPROVED' ? 'APPROVED' : 'REVISION_REQUESTED';
  if (!state) throw new Error('This review state is unavailable.');
  assertResourceStateTransition(state.state, targetState);
  const timestamp = Date.now();
  await ctx.db.patch(state._id, { state: targetState, updatedAt: timestamp, ...(targetState === 'APPROVED' ? { approvedAt: timestamp } : { unlockReason: args.note }) });
  await ctx.db.patch(review._id, { status: args.decision, updatedAt: timestamp });
  await ctx.db.insert('approvals', { projectId: link.projectId, productionId: link.productionId, studioExternalId: review.studioExternalId, studioId: review.studioId, reviewId: review._id, resourceType: 'review', resourceId: review._id, decision: args.decision === 'APPROVED' ? 'CLIENT_APPROVED' : 'CLIENT_REVISION_REQUESTED', note: `Client ${args.authorName}; review link ${link._id}; timeline version ${link.timelineVersionNumber}${args.note ? `; ${args.note}` : ''}`, createdAt: timestamp });
  return { replayed: false };
}

/** A movie capability can decide only its exact movie review resource. It
 * cannot approve the movie assembly, source production or any source asset. */
export async function applyMovieClientReviewDecision(ctx:MutationCtx,args:{linkId:Id<'movieReviewLinks'>;tokenHash:string;decision:'APPROVED'|'CHANGES_REQUESTED';authorName:string;note?:string}){
  const link=await ctx.db.get(args.linkId);if(!link||link.tokenHash!==args.tokenHash||link.revokedAt!==undefined||link.expiresAt<=Date.now())throw new Error('Movie review link unavailable.');
  const [project,review,output,version]=await Promise.all([ctx.db.get(link.projectId),ctx.db.get(link.reviewId),ctx.db.get(link.movieExportId),ctx.db.get(link.movieVersionId)]);
  if(!project||project.deletedAt||project.archivedAt||project.moderationStatus==='RESTRICTED'||!review||review.projectId!==project._id||review.movieVersionId!==link.movieVersionId||review.movieExportId!==link.movieExportId||review.planHash!==link.planHash||!version||version.projectId!==project._id||version.state!=='READY'||!output||output.projectId!==project._id||output.movieVersionId!==version._id||output.planHash!==link.planHash||output.status!=='COMPLETED'||!output.storageId||!output.checksum)throw new Error('Exact movie review version unavailable.');
  const storage=await ctx.db.system.get('_storage',output.storageId);if(!storage||!sha256Equal(storage.sha256,output.checksum)||storage.size!==output.byteSize)throw new Error('Movie review storage changed.');
  const state=await ctx.db.query('resourceStates').withIndex('by_project_resource',q=>q.eq('projectId',project._id).eq('resourceType','movieReview').eq('resourceId',review._id)).unique();const versionState=await ctx.db.query('resourceStates').withIndex('by_project_resource',q=>q.eq('projectId',project._id).eq('resourceType','movieVersion').eq('resourceId',version._id)).unique();if(!state||versionState?.state!=='LOCKED')throw new Error('Canonical movie review authority is unavailable.');const target=args.decision==='APPROVED'?'APPROVED':'REVISION_REQUESTED';if(state.state===target)return {replayed:true};if(state.state!=='IN_REVIEW')throw new Error('Request a new movie review before another decision.');assertResourceStateTransition(state.state,target);const timestamp=Date.now();await ctx.db.patch(state._id,{state:target,updatedAt:timestamp,...(target==='APPROVED'?{approvedAt:timestamp}:{unlockReason:args.note})});await ctx.db.patch(review._id,{updatedAt:timestamp});await ctx.db.insert('approvals',{projectId:project._id,studioExternalId:project.studioExternalId,studioId:project.studioId,resourceType:'movieReview',resourceId:review._id,decision:args.decision==='APPROVED'?'CLIENT_APPROVED':'CLIENT_REVISION_REQUESTED',note:`Client ${args.authorName}; movie review link ${link._id}${args.note?'; '+args.note:''}`,createdAt:timestamp});return {replayed:false};
}
