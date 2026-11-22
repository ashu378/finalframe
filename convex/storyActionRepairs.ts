import { action, internalQuery, internalMutation, query } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { api, internal } from './_generated/api';
import { v } from 'convex/values';
import { reviewContext } from './storyActionReviews';
import { requireProjectRole } from './authorization';
import { getEffectiveResourceState, requireApprovedResource } from './resourceStates';
import { resolveVideoEditSourceCertificate } from './videoRouting';
import { actionRepairPrompt, ACTION_REPAIR_VERSION } from '../src/lib/production/story-action-check';
import { planActionWindow, ACTION_WINDOW_REPAIR_VERSION } from '../renderer/src/media/action-window-contract';
import { sha256Equal } from '../renderer/src/media/sha256';
import { getActionRepairModel } from '../src/lib/ai/model-registry';
const object=(value:unknown):Record<string,any>=>value&&typeof value==='object'?value as Record<string,any>:{};

/** A failed picture may be approved as a reference without approving its take.
 * Reuse the ordinary resource approval log; never auto-approve during a quote. */
export const sourceApproval=query({args:{takeId:v.id('shotVersions')},returns:v.any(),handler:async(ctx,args)=>{
 const data=await reviewContext(ctx,args.takeId);
 const projectId=data.take.projectId;if(!projectId)throw new Error('REPAIR_SOURCE_UNAVAILABLE');
 await requireProjectRole(ctx,projectId,['OWNER','EDITOR']);
 let reference:Awaited<ReturnType<typeof resolveStoryRepair>>|null=null;let repairUnavailable=false;
 if(process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED==='true'){try{reference=await resolveStoryRepair(ctx,args.takeId,data.shot._id,true);}catch{repairUnavailable=true;}}
 const assetId=reference?.assetId??data.asset._id;
 const state=await getEffectiveResourceState(ctx,projectId,'asset',assetId);
 return {projectId,assetId,state:state.currentState,repairUnavailable};
}});

/** Server-derived repair instructions. Never mutate the approved plan or take. */
export async function resolveStoryRepair(ctx:QueryCtx|MutationCtx,takeId:Id<'shotVersions'>,shotId:Id<'shots'>,allowUnmeasured=false){
 const data=await reviewContext(ctx,takeId);
 if(data.shot._id!==shotId)throw new Error('REPAIR_WRONG_SHOT');
 const check=await ctx.db.query('storyActionChecks').withIndex('by_take',q=>q.eq('takeId',takeId)).order('desc').first();
 const human=data.latest?.requirementKey===data.requirementKey?data.latest:null;
 const ai=check?.requirementKey===data.requirementKey&&check.completedAt?check:null;
 // An advisory AI pass must not erase a creator's observed failure. A newer
 // human review can clear it; a newer AI failure can add a concern for review.
 // Otherwise approval remains blocked while repair incorrectly finds nothing.
 const missing=data.actions.filter(action=>{
  const humanObservation=human?.observations.find(o=>o.actionId===action.id);
  if(humanObservation?.result==='FAIL')return true;
  if(human&&human.createdAt>=(ai?.completedAt??0))return false;
  return ai?.observations?.some(o=>o.actionId===action.id&&o.result==='FAIL')??false;
 });
 if(!missing.length)throw new Error('Review and identify the missing action before repairing.');
 const priorRepair=object(object(data.take.contextSnapshot).request).storyRepair;
 const isolated=process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED==='true';
 // Only a known superseded approach may progress once to the enabled v3
 // temporal strategy. Current/unknown versions cannot buy a retry chain.
 if(object(priorRepair).approachVersion===ACTION_WINDOW_REPAIR_VERSION)throw new Error('ACTION_REPAIR_NEEDS_NEW_APPROACH');
 if(priorRepair&&object(priorRepair).approachVersion!==undefined&&!(isolated&&object(priorRepair).approachVersion===ACTION_REPAIR_VERSION)&&missing.some(a=>object(priorRepair).failedActionIds?.includes(a.id)))throw new Error('ACTION_REPAIR_NEEDS_NEW_APPROACH: This repair still missed the action. Change the shot direction or use a separately verified route before another paid attempt.');
 let asset=data.asset;let baselineTakeId=data.take._id;
 if(isolated){
  let ancestor=data.take;const seen=new Set<string>();
  for(let i=0;i<8;i++){const prior=object(object(ancestor.contextSnapshot).request).storyRepair;if(!prior)break;const ancestorAsset=ancestor.assetId?await ctx.db.get(ancestor.assetId):null;const receiptId=ctx.db.normalizeId('generationJobs',String(object(ancestorAsset?.metadata).generationJobId??'')),receipt=receiptId?await ctx.db.get(receiptId):null;if(!receipt||receipt.status!=='COMPLETED'||receipt.projectId!==data.take.projectId||receipt.productionId!==data.take.productionId||receipt.productionVersionId!==data.take.productionVersionId||receipt.shotId!==data.take.shotId||receipt.shotVersionId!==ancestor._id||object(receipt.response).assetId!==ancestor.assetId||JSON.stringify(object(receipt.request).storyRepair)!==JSON.stringify(prior))throw new Error('REPAIR_SOURCE_UNAVAILABLE');const id=ctx.db.normalizeId('shotVersions',String(object(prior).sourceTakeId??''));if(!id||seen.has(id)||i===7)throw new Error('REPAIR_SOURCE_UNAVAILABLE');seen.add(id);const root=await ctx.db.get(id);if(!root||root.projectId!==data.take.projectId||root.productionId!==data.take.productionId||root.productionVersionId!==data.take.productionVersionId||root.shotId!==data.take.shotId||root.status!=='COMPLETED'||!root.assetId||object(prior).sourceAssetId!==root.assetId)throw new Error('REPAIR_SOURCE_UNAVAILABLE');ancestor=root;}
  const baseline=ancestor.assetId?await ctx.db.get(ancestor.assetId):null;if(!baseline||baseline.projectId!==data.take.projectId||baseline.deletedAt)throw new Error('REPAIR_SOURCE_UNAVAILABLE');asset=baseline;baselineTakeId=ancestor._id;
 }
 if(!asset.storageId||asset.scope!=='PROJECT'||!asset.mimeType?.startsWith('video/'))throw new Error('REPAIR_SOURCE_UNAVAILABLE');
 // The original recording may predate this take (e.g. cartoon conversion).
 // Follow only a completed, server-owned generation receipt, not loose metadata.
 let audioAssetId=asset._id;
 const jobId=ctx.db.normalizeId('generationJobs',String(object(data.asset.metadata).generationJobId??''));
 const job=jobId?await ctx.db.get(jobId):null;
 if(job&&job.status==='COMPLETED'&&job.shotVersionId===data.take._id&&job.projectId===data.take.projectId&&object(job.response).assetId===data.asset._id){
  const request=object(job.request),frozen=object(object(data.take.contextSnapshot).request);
  if(request.audioPolicy==='KEEP_SOURCE'&&JSON.stringify(request.editSource)===JSON.stringify(frozen.editSource)&&JSON.stringify(request.storyRepair)===JSON.stringify(frozen.storyRepair))audioAssetId=object(request.storyRepair).audioSource?.assetId??object(request.editSource).assetId??asset._id;
 }
 let window:ReturnType<typeof planActionWindow>|undefined;
 if(isolated){const probe=await ctx.db.query('verifiedMediaProbes').withIndex('by_asset',q=>q.eq('assetId',asset._id)).unique();if(probe?.storageId===asset.storageId&&probe.videoTimingSourceStorageId===asset.storageId&&sha256Equal(probe.videoTimingSourceChecksum,asset.checksum)&&sha256Equal(probe.checksum,asset.checksum)){window=planActionWindow(missing,probe);}else if(!allowUnmeasured)throw new Error('ACTION_WINDOW_MEASUREMENT_REQUIRED');}
 const repairActions=window?missing.map(a=>({...a,startSeconds:a.startSeconds-window!.startSeconds,endSeconds:a.endSeconds-window!.startSeconds,...(a.beforeSeconds!==null?{beforeSeconds:a.beforeSeconds-window!.startSeconds}:{})})):missing;
 return {data,assetId:asset._id,audioAssetId:audioAssetId as Id<'assets'>,prompt:actionRepairPrompt(repairActions),proof:{approachVersion:isolated?ACTION_WINDOW_REPAIR_VERSION:ACTION_REPAIR_VERSION,...(window?{window}:{}),...(isolated?{baselineTakeId}:{}),sourceTakeId:takeId,sourceAssetId:asset._id,requirementKey:data.requirementKey,failedActionIds:missing.map(a=>a.id),reviewId:human?._id??null,checkId:ai?._id??null}};
}
export const context=internalQuery({args:{takeId:v.id('shotVersions')},returns:v.any(),handler:async(ctx,args)=>{
 const take=await ctx.db.get(args.takeId);if(!take?.projectId)throw new Error('REPAIR_SOURCE_UNAVAILABLE');await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR']);
 const resolved=await resolveStoryRepair(ctx,args.takeId,take.shotId,true);
 const production=await ctx.db.get(take.productionId!);if(production?.currentVersionId!==take.productionVersionId)throw new Error('Open the current production to repair a shot.');
 const assets=[];
 for(const assetId of [...new Set([resolved.assetId,resolved.audioAssetId])]){
  const asset=await ctx.db.get(assetId),stored=asset?.storageId?await ctx.db.system.get('_storage',asset.storageId):null;
  if(!asset||asset.projectId!==take.projectId||asset.deletedAt||!stored||stored.size>50_000_000)throw new Error('REPAIR_SOURCE_UNAVAILABLE');
  assets.push({assetId,storageId:asset.storageId!,checksum:stored.sha256,byteSize:stored.size,url:await ctx.storage.getUrl(asset.storageId!)});
 }
 return {projectId:take.projectId,productionId:take.productionId!,shotId:take.shotId,assets};
}});
export const recordProbe=internalMutation({args:{projectId:v.id('projects'),assetId:v.id('assets'),storageId:v.id('_storage'),checksum:v.string(),byteSize:v.number(),probe:v.any()},returns:v.null(),handler:async(ctx,args)=>{
 await requireProjectRole(ctx,args.projectId,['OWNER','EDITOR']);const asset=await ctx.db.get(args.assetId),stored=await ctx.db.system.get('_storage',args.storageId),p=object(args.probe);
 if(asset?.projectId!==args.projectId||asset.storageId!==args.storageId||!stored||stored.sha256!==args.checksum||stored.size!==args.byteSize||p.byteSize!==args.byteSize||typeof p.hasAudio!=='boolean'||!p.hasVideo||!p.videoCodec||!Number.isFinite(p.durationSeconds)||p.durationSeconds<=0||p.durationSeconds>15||!Number.isInteger(p.width)||!Number.isInteger(p.height))throw new Error('REPAIR_PROBE_INVALID');
 const row={projectId:args.projectId,assetId:args.assetId,storageId:args.storageId,checksum:args.checksum,byteSize:args.byteSize,width:p.width,height:p.height,durationSeconds:p.durationSeconds,videoCodec:p.videoCodec,hasAudio:p.hasAudio,...(p.videoTiming?{videoTiming:p.videoTiming,videoTimingSourceChecksum:stored.sha256,videoTimingSourceStorageId:args.storageId}:{}),...(p.audioCodec?{audioCodec:p.audioCodec}:{}),probedAt:Date.now()};
 const old=await ctx.db.query('verifiedMediaProbes').withIndex('by_asset',q=>q.eq('assetId',args.assetId)).unique();if(old)await ctx.db.patch(old._id,row);else await ctx.db.insert('verifiedMediaProbes',row);return null;
}});
export const estimate=action({args:{takeId:v.id('shotVersions')},returns:v.any(),handler:async(ctx,args):Promise<any>=>{
 const data=await ctx.runQuery(internal.storyActionRepairs.context,args);
 const base=process.env.RENDER_WORKER_URL?.trim(),secret=process.env.RENDER_WORKER_SHARED_SECRET?.trim();if(!base||!secret)throw new Error('Source measurement is not configured.');
 if(process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED==='true'){const health=await fetch(base.replace(/\/$/,'')+'/health',{redirect:'error',signal:AbortSignal.timeout(10000)});if(!health.ok||(await health.json()).actionWindowVersion!=='ACTION_WINDOW_V1')throw new Error('ACTION_WINDOW_WORKER_UNAVAILABLE');}
 for(const asset of data.assets){
  const response=await fetch(base.replace(/\/$/,'')+'/media/probe',{method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify({url:asset.url,kind:'video',checksum:asset.checksum,byteSize:asset.byteSize,verifyVideoTiming:process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED==='true'}),redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error('The source video could not be measured.');
  const text=await response.text();if(text.length>20000)throw new Error('Source measurement was invalid.');
  const {url:_url,...binding}=asset;await ctx.runMutation(internal.storyActionRepairs.recordProbe,{projectId:data.projectId,...binding,probe:JSON.parse(text)});
 }
 await ctx.runAction(api.videoRouting.refreshReviewedForQuote,{projectId:data.projectId});
 return ctx.runMutation(api.generationJobs.previewShotEstimate,{productionId:data.productionId,shotId:data.shotId,provider:'openrouter',model:getActionRepairModel(),request:{storyRepairTakeId:args.takeId,qualityTier:'STANDARD'},estimatedCost:1,capability:'VIDEO_FINAL',idempotencyKey:`story-repair:${args.takeId}`});
}});
export async function repairAudioCertificate(ctx:QueryCtx|MutationCtx,projectId:Id<'projects'>,assetId:Id<'assets'>,actorId?:Id<'users'>){
 await requireApprovedResource(ctx,projectId,'asset',assetId,undefined,actorId);
 const certificate=await resolveVideoEditSourceCertificate(ctx,{projectId,referenceAssetIds:[assetId]});
 if(!certificate.hasAudio)throw new Error('Choose a take with its original recording before repairing.');
 return certificate;
}

export const get=query({args:{takeId:v.id('shotVersions')},returns:v.any(),handler:async(ctx,args)=>{
 const take=await ctx.db.get(args.takeId);if(!take?.projectId)throw new Error('Take unavailable.');await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR','REVIEWER','VIEWER']);
 const job=await ctx.db.query('generationJobs').withIndex('by_idempotency',q=>q.eq('idempotencyKey',`story-repair:${args.takeId}`)).unique();
 if(!job||job.projectId!==take.projectId)return null;
 const response=object(job.response),composed=object(response.actionWindowComposed);
 return {id:job._id,status:job.status,stage:job.executionStage,takeId:job.shotVersionId??null,canResumeSavedOutput:job.status==='FAILED'&&Boolean(job.providerJobId&&object(response.actionWindowRaw).storageId),trimmedTrailingFrames:Number(object(composed.proof).trimmedTrailingFrames??0)};
}});
