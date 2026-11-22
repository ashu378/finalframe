import { internalMutation, internalQuery, query } from './_generated/server';
import { v } from 'convex/values';
import { requireProjectRole } from './authorization';
import { reviewContext } from './storyActionReviews';
import { validateActionCheck, ACTION_CHECK_MAX_BYTES } from '../src/lib/production/story-action-check';

export const context = internalQuery({args:{takeId:v.id('shotVersions')},returns:v.any(),handler:async(ctx,args)=>{
 const take=await ctx.db.get(args.takeId);if(!take?.projectId)throw new Error('ACTION_CHECK_UNAVAILABLE');
 const access=await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR']);
 if(access.project.deletedAt||access.project.archivedAt||access.project.moderationStatus==='RESTRICTED')throw new Error('ACTION_CHECK_PROJECT_UNAVAILABLE');
 const data=await reviewContext(ctx,args.takeId),stored=data.asset.storageId?await ctx.db.system.get('_storage',data.asset.storageId):null;
 if(!data.actions.length||!stored||stored.size>ACTION_CHECK_MAX_BYTES||stored.size<1||stored.contentType!=='video/mp4'||data.shot.durationSeconds>60)throw new Error('ACTION_CHECK_MEDIA_UNAVAILABLE');
 return {projectId:take.projectId,actorUserId:access.user._id,takeId:take._id,requirementKey:data.requirementKey,actions:data.actions,storageId:data.asset.storageId!,checksum:stored.sha256,byteSize:stored.size};
}});
export const saveQuote=internalMutation({args:{projectId:v.id('projects'),takeId:v.id('shotVersions'),requirementKey:v.string(),requestKey:v.string(),model:v.string(),maximumCostUsd:v.number(),priceCeiling:v.object({prompt:v.number(),completion:v.number()})},returns:v.id('storyActionChecks'),handler:async(ctx,args)=>{
 const access=await requireProjectRole(ctx,args.projectId,['OWNER','EDITOR']),data=await reviewContext(ctx,args.takeId);
 if(data.take.projectId!==args.projectId||data.requirementKey!==args.requirementKey)throw new Error('ACTION_CHECK_CHANGED');
 const existing=await ctx.db.query('storyActionChecks').withIndex('by_request_key',q=>q.eq('requestKey',args.requestKey)).unique();
 if(existing){if(existing.actorUserId!==access.user._id)throw new Error('ACTION_CHECK_ACCESS');if(!existing.receiptId&&!existing.completedAt)await ctx.db.patch(existing._id,{expiresAt:Date.now()+300000});return existing._id;}
 return await ctx.db.insert('storyActionChecks',{...args,actorUserId:access.user._id,createdAt:Date.now(),expiresAt:Date.now()+300000});
}});
export const quoteContext=internalQuery({args:{checkId:v.id('storyActionChecks')},returns:v.any(),handler:async(ctx,args)=>{
 const check=await ctx.db.get(args.checkId);if(!check)throw new Error('ACTION_CHECK_UNAVAILABLE');
 const access=await requireProjectRole(ctx,check.projectId,['OWNER','EDITOR']);if(check.actorUserId!==access.user._id)throw new Error('ACTION_CHECK_ACCESS');
 const data=await reviewContext(ctx,check.takeId);if(data.requirementKey!==check.requirementKey)throw new Error('ACTION_CHECK_CHANGED');
 return check;
}});
export const bindReceipt=internalMutation({args:{checkId:v.id('storyActionChecks'),receiptId:v.id('providerTextRequests')},returns:v.null(),handler:async(ctx,args)=>{
 const check=await ctx.db.get(args.checkId),receipt=await ctx.db.get(args.receiptId);if(!check||!receipt||receipt.projectId!==check.projectId||receipt.requestKey!==check.requestKey)throw new Error('ACTION_CHECK_RECEIPT');
 const access=await requireProjectRole(ctx,check.projectId,['OWNER','EDITOR']);if(access.user._id!==check.actorUserId)throw new Error('ACTION_CHECK_ACCESS');
 await ctx.db.patch(check._id,{receiptId:receipt._id});return null;
}});
export const complete=internalMutation({args:{checkId:v.id('storyActionChecks')},returns:v.null(),handler:async(ctx,args)=>{
 const check=await ctx.db.get(args.checkId);if(!check)throw new Error('ACTION_CHECK_UNAVAILABLE');
 await requireProjectRole(ctx,check.projectId,['OWNER','EDITOR']);if(check.completedAt)return null;
 const data=await reviewContext(ctx,check.takeId),receipt=check.receiptId?await ctx.db.get(check.receiptId):null;
 if(data.requirementKey!==check.requirementKey||!receipt||receipt.requestKey!==check.requestKey||receipt.status!=='COMPLETED'||!receipt.content)throw new Error('ACTION_CHECK_NOT_COMPLETE');
 const observations=validateActionCheck(data.actions,JSON.parse(receipt.content),data.shot.durationSeconds);
 await ctx.db.patch(check._id,{observations,completedAt:Date.now()});return null;
}});
export const get=query({args:{takeId:v.id('shotVersions')},returns:v.any(),handler:async(ctx,args)=>{
 const take=await ctx.db.get(args.takeId);if(!take?.projectId)throw new Error('ACTION_CHECK_UNAVAILABLE');await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR','REVIEWER','VIEWER']);
 const check=await ctx.db.query('storyActionChecks').withIndex('by_take',q=>q.eq('takeId',args.takeId)).order('desc').first();if(!check)return null;
 const data=await reviewContext(ctx,args.takeId),receipt=check.receiptId?await ctx.db.get(check.receiptId):null;
 return {id:check._id,stale:check.requirementKey!==data.requirementKey,observations:check.observations??null,status:check.completedAt?'COMPLETED':receipt?.status??'QUOTED',maximumCostUsd:check.maximumCostUsd,costUsd:receipt?.actualCostUsd??null,model:check.model};
}});
