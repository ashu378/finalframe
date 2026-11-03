import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireProjectAccess } from './authorization';
import { selectProjectProduction } from './projectProductions';
import { safeRenderError } from './renderWorkerContracts';
import { finishingRetryEligibility } from '../src/lib/render/recovery';

/** Read-only recovery projection. No URLs, lease authority or raw worker errors. */
export const list = query({
  args:{projectExternalId:v.string(),productionId:v.optional(v.id('productions')),jobId:v.optional(v.id('renderJobs'))},
  returns:v.object({jobs:v.array(v.object({id:v.id('renderJobs'),status:v.string(),stage:v.union(v.string(),v.null()),progress:v.number(),createdAt:v.number(),preset:v.string(),error:v.union(v.string(),v.null()),canRetry:v.boolean(),retryReason:v.union(v.string(),v.null())})),hasMore:v.boolean()}),
  handler:async(ctx,args)=>{
    const project=await ctx.db.query('projects').withIndex('by_external_id',q=>q.eq('externalId',args.projectExternalId)).unique();
    if(!project)throw new Error('Project not found.');
    const access=await requireProjectAccess(ctx,project._id);
    const selected=args.jobId?await ctx.db.get(args.jobId):null;
    if(args.jobId&&(!selected||selected.projectId!==project._id||selected.studioExternalId!==project.studioExternalId))throw new Error('Finishing job not found in this project.');
    if(selected&&args.productionId&&selected.productionId!==args.productionId)throw new Error('Finishing job not found in this video.');
    const production=await selectProjectProduction(ctx,project,args.productionId??selected?.productionId);
    if(!production)return{jobs:[],hasMore:false};
    const rows=selected?[selected]:await ctx.db.query('renderJobs').withIndex('by_production',q=>q.eq('productionId',production._id)).order('desc').take(101);
    const jobs=rows.slice(0,100).filter(job=>job.projectId===project._id&&job.studioExternalId===project.studioExternalId).map(job=>{
      const eligibility=finishingRetryEligibility(job,{canWrite:['OWNER','EDITOR'].includes(access.projectRole),archived:Boolean(project.archivedAt||project.status==='ARCHIVED')});
      return{id:job._id,status:job.status,stage:job.executionStage??null,progress:Math.max(0,Math.min(100,job.progress)),createdAt:job.createdAt,preset:job.preset,error:safeRenderError(job.errorCode)??null,canRetry:eligibility.eligible,retryReason:eligibility.reason};
    });
    return{jobs,hasMore:rows.length>100};
  },
});
