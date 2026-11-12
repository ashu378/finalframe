import { resolveShotDependencyProof } from './productionDependencies';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireProjectRole, resolveProjectAccessForActor } from './authorization';
import { getEffectiveResourceState, isResourceEditable } from './resourceStates';
import { resolveStoryboardFrame, resolveStoryboardImage } from './storyboard';
import { normalizeShotDirecting, stableStoryboardValue, storyboardObject as object } from '../src/lib/production/storyboard-contract';

/** Canonical byte and version checks shared by quote, admission and POST fence. */
export async function validateStoryboardImageInput(ctx: QueryCtx | MutationCtx, productionId: Id<'productions'>, value: unknown, actorUserId?: Id<'users'>) {
  const request = object(value), production = await ctx.db.get(productionId);
  if (!production?.projectId) throw new Error('STORYBOARD_IMAGE_UNAVAILABLE');
  if (actorUserId) { const access = await resolveProjectAccessForActor(ctx, production.projectId, actorUserId); if (!['OWNER','EDITOR'].includes(access.projectRole)) throw new Error('STORYBOARD_IMAGE_DENIED'); }
  else await requireProjectRole(ctx, production.projectId, ['OWNER', 'EDITOR']);
  const shotId = ctx.db.normalizeId('shots', String(request.shotId)), shot = shotId ? await ctx.db.get(shotId) : null;
  const version = shot?.productionVersionId ? await ctx.db.get(shot.productionVersionId) : null;
  if (!shot || shot.projectId !== production.projectId || shot.productionId !== productionId || !version || version.sourcePlanId !== production.currentPlanId || version.status !== 'DRAFT' || request.productionVersionId !== version._id || !['STORYBOARD_FRAME','ANGLE','IMAGE_EDIT'].includes(String(request.purpose))) throw new Error('STORYBOARD_IMAGE_VERSION_CHANGED');
  for (const [type,id] of [['shot',shot._id],['scene',shot.sceneId],...(shot.sequenceId?[['sequence',shot.sequenceId]]:[])] as Array<[string,string]>) { const state = await getEffectiveResourceState(ctx,production.projectId,type,id,productionId,actorUserId); if (!isResourceEditable(state.currentState)) throw new Error('STORYBOARD_IMAGE_RESOURCE_LOCKED'); }
  const sources = request.sourceAssetIds;
  if (!Array.isArray(sources) || sources.length > 4 || sources.some(id => typeof id !== 'string') || new Set(sources).size !== sources.length) throw new Error('STORYBOARD_IMAGE_SOURCE_INVALID');
  const proofs = [];
  for (const raw of sources) {
    const assetId = ctx.db.normalizeId('assets',raw); if (!assetId) throw new Error('STORYBOARD_IMAGE_SOURCE_INVALID');
    const media = await resolveStoryboardImage(ctx,production.projectId,assetId,actorUserId);
    if (media.proof.byteSize > 15*1024*1024) throw new Error('STORYBOARD_IMAGE_SOURCE_INVALID');
    proofs.push(media.proof);
  }
  let sourceFrameId: Id<'storyboardFrames'> | undefined;
  if (request.sourceFrameId !== undefined) {
    const id = ctx.db.normalizeId('storyboardFrames',String(request.sourceFrameId)); if (!id) throw new Error('STORYBOARD_IMAGE_SOURCE_INVALID');
    const frame = await resolveStoryboardFrame(ctx,{projectId:production.projectId,productionId,productionVersionId:version._id,shotId:shot._id,frameId:id,actorUserId});
    if (!sources.includes(frame.row.assetId)) throw new Error('STORYBOARD_IMAGE_SOURCE_INVALID');
    sourceFrameId = id;
  }
  if (request.purpose !== 'STORYBOARD_FRAME' && !sourceFrameId) throw new Error('STORYBOARD_IMAGE_FRAME_REQUIRED');
  const sourceShotDependency=await resolveShotDependencyProof(ctx,{shotId:shot._id,expectedVersionId:version._id},actorUserId);
  if(request.sourceShotDependency!==undefined&&stableStoryboardValue(request.sourceShotDependency)!==stableStoryboardValue(sourceShotDependency))throw new Error('STORYBOARD_IMAGE_SHOT_CHANGED');
  const result = {sourceShotDependency,version:1,purpose:String(request.purpose),shotId:shot._id,productionVersionId:version._id,...(sourceFrameId?{sourceFrameId}:{}),sourceAssetIds:sources,direction:normalizeShotDirecting(request.direction),sourceProofs:proofs};
  if (request.sourceProofs !== undefined && stableStoryboardValue(request.sourceProofs) !== stableStoryboardValue(proofs)) throw new Error('STORYBOARD_IMAGE_SOURCE_CHANGED');
  return {production,shot,version,request:result};
}
