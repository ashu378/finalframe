import { mutation, query } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireProjectRole } from './authorization';
import { getEffectiveResourceState } from './resourceStates';
import { parseStoryActions, validateStoryActionObservations } from '../src/lib/production/story-actions';

type ReadCtx = QueryCtx | MutationCtx;
export async function reviewContext(ctx: ReadCtx, takeId: Id<'shotVersions'>) {
    const take = await ctx.db.get(takeId);
    if (!take?.projectId || !take.productionId || !take.assetId || take.status !== 'COMPLETED') throw new Error('Choose a completed project take.');
    const [shot, asset] = await Promise.all([ctx.db.get(take.shotId), ctx.db.get(take.assetId)]);
    if (!shot || shot.projectId !== take.projectId || shot.productionId !== take.productionId || shot.productionVersionId !== take.productionVersionId || !asset || asset.projectId !== take.projectId || asset.deletedAt || !asset.checksum) throw new Error('The exact take and project media are unavailable.');
    const actions = parseStoryActions(shot.metadata?.storyActions, shot.durationSeconds);
    const requirementKey = JSON.stringify([take._id, take.assetId, asset.checksum, shot.prompt, actions]);
    const latest = await ctx.db.query('storyActionReviews').withIndex('by_take', q => q.eq('takeId', takeId)).order('desc').first();
    const check = await ctx.db.query('storyActionChecks').withIndex('by_take',q=>q.eq('takeId',takeId)).order('desc').first();
    const unresolvedCheck = check?.requirementKey===requirementKey && check.completedAt && check.observations?.some(o=>o.result!=='PASS') && (!latest||latest.createdAt<check.completedAt);
    const passed = !actions.length || Boolean(latest?.requirementKey === requirementKey && latest.passed && !unresolvedCheck);
    return { take, shot, asset, actions, requirementKey, latest, passed };
}
/** Used by both approval and assembly; a prompt or completed file is not evidence. */
export async function requireStoryActionsPassed(ctx: ReadCtx, takeId: Id<'shotVersions'>) {
    const take = await ctx.db.get(takeId);
    const shot = take ? await ctx.db.get(take.shotId) : null;
    if (shot && !parseStoryActions(shot.metadata?.storyActions, shot.durationSeconds).length) return;
    const result = await reviewContext(ctx, takeId);
    if (!result.passed) throw new ConvexError({code:'STORY_ACTION_REVIEW_REQUIRED',message:'Check the visible story actions in Video clips before approving this take. Missing or late actions need a revised take.'});
}
export const get = query({
    args:{takeId:v.id('shotVersions')},returns:v.any(),
    handler:async(ctx,args)=>{
        const take=await ctx.db.get(args.takeId);if(!take?.projectId)throw new Error('Take unavailable.');
        await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR','REVIEWER','VIEWER']);
        if(take.status!=='COMPLETED'||!take.assetId)return null;
        const data=await reviewContext(ctx,args.takeId);
        return {actions:data.actions,requirementKey:data.requirementKey,passed:data.passed,latest:data.latest};
    },
});
const nullableNumber=v.union(v.number(),v.null());
export const record = mutation({
    args:{takeId:v.id('shotVersions'),requirementKey:v.string(),observations:v.array(v.object({actionId:v.string(),result:v.union(v.literal('PASS'),v.literal('FAIL')),observedStartSeconds:nullableNumber,observedEndSeconds:nullableNumber,evidence:v.string()}))},returns:v.any(),
    handler:async(ctx,args)=>{
        const data=await reviewContext(ctx,args.takeId),access=await requireProjectRole(ctx,data.take.projectId!,['OWNER','EDITOR','REVIEWER']);
        const state=await getEffectiveResourceState(ctx,data.take.projectId!,'shotVersion',args.takeId,data.take.productionId);
        if(!['DRAFT','IN_REVIEW','REVISION_REQUESTED'].includes(state.currentState))throw new Error('Request a revision before changing an approved take review.');
        if(!data.actions.length||data.requirementKey!==args.requirementKey)throw new Error('The take or required actions changed. Reload the review.');
        const passed=validateStoryActionObservations(data.actions,args.observations);
        // Re-confirming the same observations after a newer AI concern is a
        // fresh human decision, not a duplicate of the superseded approval.
        if(data.latest?.requirementKey===args.requirementKey&&JSON.stringify(data.latest.observations)===JSON.stringify(args.observations)&&(!passed||data.passed))return {passed,replayed:true};
        await ctx.db.insert('storyActionReviews',{projectId:data.take.projectId!,productionId:data.take.productionId!,takeId:args.takeId,assetId:data.take.assetId!,requirementKey:data.requirementKey,observations:args.observations,passed,reviewerUserId:access.user._id,createdAt:Date.now()});
        return {passed,replayed:false};
    },
});
