import { requireCastReadiness } from './castReadiness';
import { action, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { FunctionReference } from 'convex/server';
import {v} from 'convex/values';
import { requireProjectRole } from './authorization';
import {recipeErrorCode} from './recipeErrors';
import {recipeHash} from '../src/lib/production/recipes/compiler';
import {quotePreparation} from '../src/lib/ai/preparation';
import {discoverOpenRouterVideoModels} from '../src/lib/ai/model-discovery';
import {videoCatalogQuoteFingerprint} from '../src/lib/ai/video-routing';
import {refreshReviewedVideoCatalog} from './videoRouting';
import {resolveVoiceSynthesisInput,freezeVoiceVersion} from './voices';
import {assertRecipeSourcesCurrent,boundedRecipeJson,recipeObject,recipeRunScope,requireRecipeEnabled} from './recipeAuthority';
import {assertResolvedRecipeNode} from './recipeAdmissions';
import {resolvePaidRecipeInput,reusableRecipeJob} from './recipePlanning';
const refs:Record<string,FunctionReference<any,'internal',any,any>>=(internal as unknown as {recipeEstimates:Record<string,FunctionReference<any,'internal',any,any>>}).recipeEstimates;
export const pendingVideoQuoteProject = internalQuery({
 args: {runId: v.id('recipeRuns')}, returns: v.union(v.id('projects'), v.null()),
 handler: async (ctx, {runId}) => {
  requireRecipeEnabled();
  const run = await ctx.db.get(runId);
  if (!run || run.cancelRequestedAt || run.initializedNodeCount !== run.nodeCount) throw new Error('RECIPE_NOT_ESTIMABLE');
  await requireProjectRole(ctx, run.projectId, ['OWNER', 'EDITOR']);
  const nodes = await ctx.db.query('recipeRunNodes').withIndex('by_run_order', q => q.eq('runId', runId)).take(193);
  if (nodes.length > 192) throw new Error('RECIPE_NODE_LIMIT');
  return nodes.some(node => node.operation === 'GENERATION' && node.effect === 'PAID' && !node.linkedGenerationJobId && !['COMPLETED', 'CANCELED'].includes(node.status)) ? run.projectId : null;
 },
});
export const resolveStage=internalMutation({args:{runId:v.id('recipeRuns')},returns:v.any(),handler:async(ctx,args)=>{
 requireRecipeEnabled();const {run}=await recipeRunScope(ctx,args.runId);await requireProjectRole(ctx,run.projectId,['OWNER','EDITOR']);if(run.cancelRequestedAt||run.initializedNodeCount!==run.nodeCount)throw new Error('RECIPE_NOT_ESTIMABLE');await assertRecipeSourcesCurrent(ctx,run);const nodes=await ctx.db.query('recipeRunNodes').withIndex('by_run_order',q=>q.eq('runId',run._id)).take(193);if(nodes.length>192)throw new Error('RECIPE_NODE_LIMIT');const inputs=[];const blocked=[];
 for(const node of nodes){if(node.effect!=='PAID'||node.linkedGenerationJobId||node.status==='COMPLETED'||node.status==='CANCELED')continue;try{
  if(node.operation==='NARRATION'&&!node.voiceVersionId){const request=recipeObject(node.request);const voiceId=ctx.db.normalizeId('voices',request.voiceId);if(!voiceId||request.voiceVersionId&&!ctx.db.normalizeId('voiceVersions',request.voiceVersionId))throw new Error('RECIPE_VOICE_UNAVAILABLE');const voice=await resolveVoiceSynthesisInput(ctx,{projectId:run.projectId,voiceId,voiceVersionId:request.voiceVersionId?ctx.db.normalizeId('voiceVersions',request.voiceVersionId)??undefined:undefined,use:'SYNTHESIZE',primaryVoiceSampleAssetId:request.primaryVoiceSampleAssetId});node.voiceVersionId=await freezeVoiceVersion(ctx,voice,run.createdByUserId);await ctx.db.patch(node._id,{voiceVersionId:node.voiceVersionId});}
  const resolved=await resolvePaidRecipeInput(ctx,node,run);if(node.resolvedRequestHash&&node.resolvedRequestHash!==resolved.resolvedRequestHash)throw new Error('RECIPE_RESOLVED_INPUT_CHANGED');const intent=recipeObject(recipeObject(run.canonicalContext).executionIntent);let reusable;try{reusable=await reusableRecipeJob(ctx,node,resolved.bindings);}catch(error){if(!(error instanceof Error)||error.message!=='RECIPE_REGENERATION_REVIEW_REQUIRED'||!Array.isArray(intent.regenerateNodeIds)||!intent.regenerateNodeIds.includes(node.nodeId))throw error;}
  const fresh=Array.isArray(intent.regenerateNodeIds)&&intent.regenerateNodeIds.includes(node.nodeId);if(reusable&&(!fresh||reusable.job.status!=='COMPLETED')){await ctx.db.patch(node._id,{resolvedBindings:resolved.bindings,resolvedRequestHash:resolved.resolvedRequestHash,linkedGenerationJobId:reusable.job._id,status:'QUEUED',updatedAt:Date.now()});continue;}
  if(node.operation==='GENERATION'){const version=await ctx.db.get(run.productionVersionId);if(!version)throw new Error('RECIPE_CAST_BINDING_CHANGED');await requireCastReadiness(ctx,run.projectId,version.snapshot,version.planningContextSnapshot);}
  await ctx.db.patch(node._id,{resolvedBindings:resolved.bindings,resolvedRequestHash:resolved.resolvedRequestHash,errorCode:undefined,updatedAt:Date.now()});inputs.push({nodeId:node._id,key:node.nodeId,operation:node.operation,requestHash:node.requestHash,...resolved});
 }catch(error){const code=recipeErrorCode(error);blocked.push({nodeId:node.nodeId,reason:code});}}
 return {runId:run._id,compiledPlanHash:run.compiledPlanHash,inputs,blocked};
}});
/** Catalog GETs only. This action cannot dispatch a provider purchase. */
export const preview=action({args:{runId:v.id('recipeRuns')},returns:v.any(),handler:async(ctx,args):Promise<any>=>{
 const projectId = await ctx.runQuery(refs.pendingVideoQuoteProject,args);
 if(projectId) await refreshReviewedVideoCatalog(ctx,projectId).catch(() => null);
 const stage=await ctx.runMutation(refs.resolveStage,args);const quotes:Record<string,any>={};let live:Awaited<ReturnType<typeof discoverOpenRouterVideoModels>>|undefined;
 for(const input of stage.inputs){const create=input.bindings.createArgs;try{let baseProviderUsd:number;let fingerprint=input.catalogFingerprint;let preparationQuote;if(input.operation==='GENERATION'){live??=await discoverOpenRouterVideoModels({force:true,staleIfError:false});const model=live.find(m=>m.id===create.model);if(!model||videoCatalogQuoteFingerprint({provider:'openrouter',modelId:model.id,...model,supportedParameters:model.allowedPassthroughParameters})!==input.catalogQuoteFingerprint)throw new Error('RECIPE_LIVE_ROUTE_CHANGED');baseProviderUsd=create.estimatedProviderCostUsd;}else{preparationQuote=await quotePreparation({kind:create.kind,text:create.text,clone:create.clone,durationSeconds:create.durationSeconds,durationMeasurement:create.durationMeasurement});if(preparationQuote.model!==create.model)throw new Error('RECIPE_MODEL_CHANGED');baseProviderUsd=preparationQuote.estimatedProviderCostUsd;fingerprint=await recipeHash({...preparationQuote,checkedAt:0});}
  quotes[input.key]={requestHash:input.requestHash,resolvedRequestHash:input.resolvedRequestHash,model:create.model,catalogFingerprint:fingerprint,baseProviderUsd,providerCeilingMicros:input.operation==='GENERATION'?input.providerCeilingMicros:Math.ceil(baseProviderUsd*1e6),creditCeiling:input.credits,checkedAt:Date.now(),...(preparationQuote?{preparationQuote}:{})};
 }catch(error){stage.blocked.push({nodeId:input.key,reason:recipeErrorCode(error)});}}
 return ctx.runMutation(refs.record,{runId:args.runId,quotes,blocked:stage.blocked});
}});
export const record=internalMutation({args:{runId:v.id('recipeRuns'),quotes:v.any(),blocked:v.any()},returns:v.any(),handler:async(ctx,args)=>{
 const {run,access}=await recipeRunScope(ctx,args.runId);await requireProjectRole(ctx,run.projectId,['OWNER','EDITOR']);if(run.cancelRequestedAt)throw new Error('RECIPE_CANCELED');await assertRecipeSourcesCurrent(ctx,run);const blockedInput=Array.isArray(args.blocked)?args.blocked.map((value:any)=>({nodeId:String(value.nodeId).slice(0,64),reason:recipeErrorCode(value.reason)})):[];const quotes=recipeObject(boundedRecipeJson(args.quotes,128*1024));const keys=Object.keys(quotes);if(keys.length>64||!Array.isArray(args.blocked)||args.blocked.length>64)throw new Error('RECIPE_ESTIMATE_SIZE');let sum=0,credits=0;for(const key of keys){const node=await ctx.db.query('recipeRunNodes').withIndex('by_run_node',q=>q.eq('runId',run._id).eq('nodeId',key)).unique();const q=recipeObject(quotes[key]);if(!node||node.effect!=='PAID'||node.linkedGenerationJobId||node.requestHash!==q.requestHash||node.resolvedRequestHash!==q.resolvedRequestHash||recipeObject(recipeObject(node.resolvedBindings).createArgs).model!==q.model||typeof q.checkedAt!=='number'||Date.now()-q.checkedAt>30000||q.checkedAt>Date.now()+1000||!Number.isSafeInteger(q.providerCeilingMicros)||q.providerCeilingMicros<=0||!Number.isSafeInteger(q.creditCeiling)||q.creditCeiling<=0)throw new Error('RECIPE_QUOTE_CHANGED');await assertResolvedRecipeNode(ctx,node);sum+=q.providerCeilingMicros;credits+=q.creditCeiling;}
 if(!Number.isSafeInteger(sum)||!Number.isSafeInteger(credits)||sum>1e9||credits>1e9)throw new Error('RECIPE_ESTIMATE_CAP');const latest=await ctx.db.query('recipeEstimates').withIndex('by_run_revision',q=>q.eq('runId',run._id)).order('desc').first();const now=Date.now();const expiresAt=keys.length?Math.min(...keys.map(k=>quotes[k].checkedAt+30000)):now+30000;const quoteHash=await recipeHash({runId:run._id,compiledPlanHash:run.compiledPlanHash,quotes,blocked:blockedInput});const estimateId=await ctx.db.insert('recipeEstimates',{runId:run._id,projectId:run.projectId,revision:(latest?.revision??0)+1,compiledPlanHash:run.compiledPlanHash,stageNodeIds:keys,quoteHash,quotes,providerCeilingMicros:(run.admittedMicros??0)+sum,creditCeiling:(run.admittedCredits??0)+credits,complete:true,blockedNodeIds:args.blocked.map((v:any)=>String(v.nodeId)),createdByUserId:access.user._id,createdAt:now,expiresAt});return {estimateId,quoteHash,stageNodeIds:keys,stageProviderCeilingMicros:sum,stageCreditCeiling:credits,cumulativeCreditCeiling:(run.admittedCredits??0)+credits,cumulativeProviderCeilingMicros:(run.admittedMicros??0)+sum,blocked:blockedInput,wholeRunComplete:args.blocked.length===0,scope:'READY_STAGE_ONLY',expiresAt};
}});
