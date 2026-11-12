import { mutation, query } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import { requireProjectAccess, requireProjectRole } from './authorization';
import { parseCreatorIntent } from '../src/lib/production/creator-intent';
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export const get=query({args:{projectId:v.id('projects')},returns:v.any(),handler:async(ctx,{projectId})=>{
    const {project}=await requireProjectAccess(ctx,projectId),saved=record(record(project.metadata).creatorPreferences);
    return {creatorIntent:parseCreatorIntent(saved.creatorIntent)??null,updatedAt:typeof saved.updatedAt==='number'?saved.updatedAt:null};
}});
/** A project preference only. Never approves a plan, resource, job or cost. */
export const set=mutation({args:{projectId:v.id('projects'),creatorIntent:v.any(),expectedUpdatedAt:v.optional(v.number())},returns:v.any(),handler:async(ctx,args)=>{
    const access=await requireProjectRole(ctx,args.projectId,['OWNER','EDITOR']),intent=parseCreatorIntent(args.creatorIntent);
    if(!intent)throw new ConvexError({code:'CREATOR_PREFERENCE_INVALID'});
    const metadata=record(access.project.metadata),previous=record(metadata.creatorPreferences);
    if(typeof previous.updatedAt==='number'?args.expectedUpdatedAt!==previous.updatedAt:args.expectedUpdatedAt!==undefined)throw new ConvexError({code:'CREATOR_PREFERENCE_CHANGED'});
    if(JSON.stringify(previous.creatorIntent)===JSON.stringify(intent))return {creatorIntent:intent,updatedAt:previous.updatedAt};
    const timestamp=Math.max(Date.now(),typeof previous.updatedAt==='number'?previous.updatedAt+1:0);
    await ctx.db.patch(args.projectId,{metadata:{...metadata,creatorPreferences:{version:1,creatorIntent:intent,updatedAt:timestamp,updatedByUserId:access.user._id}},updatedAt:timestamp});
    await ctx.db.insert('audit',{studioExternalId:access.project.studioExternalId,studioId:access.project.studioId,actorUserId:access.user._id,action:'PROJECT_CREATOR_PREFERENCE_CHANGED',entityType:'project',entityId:args.projectId,metadata:{projectId:args.projectId,previousCreatorIntent:previous.creatorIntent??null,creatorIntent:intent,approvalGranted:false,spendingGranted:false},createdAt:timestamp});
    return {creatorIntent:intent,updatedAt:timestamp};
}});
