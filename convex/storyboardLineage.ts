import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { synchronizeTimelineDependencies } from './productionDependencies';
import { storyboardObject as object } from '../src/lib/production/storyboard-contract';

/** New storyboard-aware takes create exact durable clip lineage. Historical
 * edits without a frozen authored proof retain their compatibility behavior. */
export async function synchronizeStoryboardTimeline(ctx:MutationCtx,timelineId:Id<'timelines'>,actorId?:Id<'users'>){
  const clips=await ctx.db.query('timelineClips').withIndex('by_timeline',q=>q.eq('timelineId',timelineId)).take(1001);
  if(clips.length>1000)throw new Error('DEPENDENCY_CLIP_LIMIT');
  let usesStoryboard=false;
  for(const clip of clips){if(!clip.shotVersionId)continue;const take=await ctx.db.get(clip.shotVersionId);if(object(take?.contextSnapshot).sourceShotDependency){usesStoryboard=true;break;}}
  if(!usesStoryboard)return;
  const timeline=await ctx.db.get(timelineId);if(!timeline)throw new Error('DEPENDENCY_TIMELINE_UNAVAILABLE');
  const tracks=object(timeline.tracks),metadata=object(tracks.metadata),raw=tracks.productionVersionId??metadata.productionVersionId;
  const versionId=typeof raw==='string'?ctx.db.normalizeId('productionVersions',raw):null;
  if(!versionId)throw new Error('DEPENDENCY_VERSION_UNAVAILABLE');
  await synchronizeTimelineDependencies(ctx,{timelineId,expectedVersionId:versionId},actorId);
}
