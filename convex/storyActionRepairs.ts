import { ACTION_MOTION_REPAIR_VERSION,motionRepairKey } from '../src/lib/production/action-motion-repair';
export { ACTION_MOTION_REPAIR_VERSION,motionRepairKey } from '../src/lib/production/action-motion-repair';
import { normalizeVideoType } from '../src/lib/ai/video-routing';
import { assertFrameToRegion } from '../renderer/src/media/frame-to-region-contract';
export { requireStoryRepairRecovery } from './storyRepairRecovery';
import { canRecoverUnsubmittedRegion, latestStoryRepairJob, storyRepairKey } from './storyRepairRecovery';
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
import { assertActionRegion, ACTION_REGION_REPAIR_VERSION } from '../renderer/src/media/action-region-contract';
import { getActionRepairModel, getActionMotionRepairModel } from '../src/lib/ai/model-registry';
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
export async function resolveStoryRepair(ctx:QueryCtx|MutationCtx,takeId:Id<'shotVersions'>,shotId:Id<'shots'>,allowUnmeasured=false,motion=false){
 if(motion&&process.env.FINALFRAME_FRAME_TO_REGION_REPAIR_ENABLED!=='true')throw new Error('FRAME_TO_REGION_NOT_ENABLED');
 const data=await reviewContext(ctx,takeId);
 if(motion){const production=await ctx.db.get(data.take.productionId!),version=await ctx.db.get(data.take.productionVersionId!),plan=version?.sourcePlanId?await ctx.db.get(version.sourcePlanId):null;const type=object(plan?.input).videoType??production?.projectType;const transform=object(object(plan?.input).canonicalPlanSettings).workflow==='FOOTAGE_TRANSFORM'&&object(version?.snapshot).workflow==='FOOTAGE_TRANSFORM';if((!type||normalizeVideoType(type)!=='ANIMATED_COMEDY_2D')&&!transform)throw new Error('FRAME_TO_REGION_CARTOON_SOURCE_REQUIRED');}
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
 const regionReview=isolated&&process.env.FINALFRAME_ACTION_REGION_REPAIR_ENABLED==='true'?human?.repairRegion:undefined;
 const region=regionReview?assertActionRegion(regionReview.selection):undefined;
 if(regionReview&&!sha256Equal(regionReview.sourceChecksum,data.asset.checksum))throw new Error('ACTION_WINDOW_SOURCE_CHANGED');
 // Only a known superseded approach may progress once to the enabled v3
 // temporal strategy. Current/unknown versions cannot buy a retry chain.
 if(!motion&&(object(priorRepair).approachVersion===ACTION_REGION_REPAIR_VERSION||!region&&object(priorRepair).approachVersion===ACTION_WINDOW_REPAIR_VERSION))throw new Error('ACTION_REPAIR_NEEDS_NEW_APPROACH');
 if(motion&&(!region||priorRepair&&![ACTION_REPAIR_VERSION,ACTION_WINDOW_REPAIR_VERSION,ACTION_REGION_REPAIR_VERSION].includes(object(priorRepair).approachVersion)))throw new Error('ACTION_REPAIR_NEEDS_NEW_APPROACH');
 if(!motion&&priorRepair&&object(priorRepair).approachVersion!==undefined&&!(isolated&&object(priorRepair).approachVersion===ACTION_REPAIR_VERSION)&&!(region&&object(priorRepair).approachVersion===ACTION_WINDOW_REPAIR_VERSION)&&missing.some(a=>object(priorRepair).failedActionIds?.includes(a.id)))throw new Error('ACTION_REPAIR_NEEDS_NEW_APPROACH: This repair still missed the action. Change the shot direction or use a separately verified route before another paid attempt.');
 let asset=data.asset;let baselineTakeId=data.take._id;
 if(isolated&&!region){
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
  if((request.audioPolicy==='KEEP_SOURCE'||object(request.storyRepair).approachVersion===ACTION_MOTION_REPAIR_VERSION)&&JSON.stringify(request.editSource)===JSON.stringify(frozen.editSource)&&JSON.stringify(request.storyRepair)===JSON.stringify(frozen.storyRepair))audioAssetId=object(request.storyRepair).audioSource?.assetId??object(request.editSource).assetId??asset._id;
 }
 let window:ReturnType<typeof planActionWindow>|undefined;
 if(isolated){const probe=await ctx.db.query('verifiedMediaProbes').withIndex('by_asset',q=>q.eq('assetId',asset._id)).unique();if(probe?.storageId===asset.storageId&&probe.videoTimingSourceStorageId===asset.storageId&&sha256Equal(probe.videoTimingSourceChecksum,asset.checksum)&&sha256Equal(probe.checksum,asset.checksum)){window=planActionWindow(missing,probe);}else if(!allowUnmeasured)throw new Error('ACTION_WINDOW_MEASUREMENT_REQUIRED');}
 if(region&&(!window||JSON.stringify(region.window)!==JSON.stringify(window)))throw new Error('ACTION_WINDOW_BINDING_CHANGED');
 const frameToRegion=motion&&region?assertFrameToRegion({version:'FRAME_TO_REGION_V1',region,providerOutput:{width:640,height:640,fps:24,frames:96},anchorPreparation:{method:'LANCZOS',width:640,height:640},normalization:{method:'UNIFORM_FRAME_SELECTION_LANCZOS',targetWidth:region.width,targetHeight:region.height,targetFrames:region.window.endFrame-region.window.startFrame,targetFps:24}}):undefined;
 const repairActions=window?missing.map(a=>({...a,startSeconds:a.startSeconds-window!.startSeconds,endSeconds:a.endSeconds-window!.startSeconds,...(a.beforeSeconds!==null?{beforeSeconds:a.beforeSeconds-window!.startSeconds}:{})})):missing;
 const motionPrompt=motion&&window?`Animate only this stationary cropped subject for FOUR seconds between the supplied first and last source frames. Keep identity, costume, lighting, camera and crop borders fixed. Create the missing physical motion visibly, not speech mouth movement. Return smoothly to the supplied last pose. This silent picture will be uniformly retimed to ${(window.endFrame-window.startFrame)/24} seconds and composited into the original shot; its original voices remain unchanged. Timings below refer to the FOUR-second generated clip, not the final full scene. `+actionRepairPrompt(repairActions.map(a=>({...a,startSeconds:a.startSeconds*96/(window.endFrame-window.startFrame),endSeconds:a.endSeconds*96/(window.endFrame-window.startFrame),beforeSeconds:a.beforeSeconds===null?null:a.beforeSeconds*96/(window.endFrame-window.startFrame)}))):undefined;
 return {data,assetId:asset._id,audioAssetId:audioAssetId as Id<'assets'>,prompt:motionPrompt??(region?'This input is a close crop of the selected stationary subject. Keep the crop boundaries and exact dimensions unchanged. Correct the visible action inside this crop; do not add the rest of the scene. ':'')+actionRepairPrompt(repairActions),proof:{approachVersion:motion?ACTION_MOTION_REPAIR_VERSION:region?ACTION_REGION_REPAIR_VERSION:isolated?ACTION_WINDOW_REPAIR_VERSION:ACTION_REPAIR_VERSION,...(region?{region,regionReviewId:human!._id}:{}),...(frameToRegion?{frameToRegion}:{}),...(window?{window}:{}),...(isolated?{baselineTakeId}:{}),sourceTakeId:takeId,sourceAssetId:asset._id,requirementKey:data.requirementKey,failedActionIds:missing.map(a=>a.id),reviewId:human?._id??null,checkId:ai?._id??null}};
}
export const regionContext=internalQuery({args:{takeId:v.id('shotVersions')},returns:v.any(),handler:async(ctx,args)=>{
 if(process.env.FINALFRAME_ACTION_REGION_REPAIR_ENABLED!=='true'||process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED!=='true')throw new Error('ACTION_REGION_NOT_ENABLED');
 const data=await reviewContext(ctx,args.takeId);await requireProjectRole(ctx,data.take.projectId!,['OWNER','EDITOR']);
 const stored=data.asset.storageId?await ctx.db.system.get('_storage',data.asset.storageId):null;
 if(!stored||stored.size>50_000_000||!sha256Equal(stored.sha256,data.asset.checksum))throw new Error('REPAIR_SOURCE_UNAVAILABLE');
 return {projectId:data.take.projectId!,assetId:data.asset._id,storageId:data.asset.storageId!,checksum:stored.sha256,byteSize:stored.size,url:await ctx.storage.getUrl(data.asset.storageId!)};
}});
export const measureRegion=action({args:{takeId:v.id('shotVersions')},returns:v.null(),handler:async(ctx,args)=>{
 const source=await ctx.runQuery(internal.storyActionRepairs.regionContext,args);
 const base=process.env.RENDER_WORKER_URL?.trim(),secret=process.env.RENDER_WORKER_SHARED_SECRET?.trim();if(!base||!secret)throw new Error('ACTION_WINDOW_WORKER_UNAVAILABLE');
 const health=await fetch(base.replace(/\/$/,'')+'/health',{redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!health.ok||(await health.json()).actionRegionVersion!=='ACTION_REGION_V1')throw new Error('ACTION_WINDOW_WORKER_UNAVAILABLE');
 const response=await fetch(base.replace(/\/$/,'')+'/media/probe',{method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify({url:source.url,kind:'video',checksum:source.checksum,byteSize:source.byteSize,verifyVideoTiming:true}),redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error('ACTION_WINDOW_MEASUREMENT_REQUIRED');const text=await response.text();if(text.length>20000)throw new Error('ACTION_WINDOW_MEASUREMENT_REQUIRED');
 const {url:_url,...binding}=source;await ctx.runMutation(internal.storyActionRepairs.recordProbe,{...binding,probe:JSON.parse(text)});return null;
}});
export const context=internalQuery({args:{takeId:v.id('shotVersions'),motion:v.optional(v.boolean())},returns:v.any(),handler:async(ctx,args)=>{
 const take=await ctx.db.get(args.takeId);if(!take?.projectId)throw new Error('REPAIR_SOURCE_UNAVAILABLE');await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR']);
 const resolved=await resolveStoryRepair(ctx,args.takeId,take.shotId,true,args.motion===true);
 const production=await ctx.db.get(take.productionId!);if(production?.currentVersionId!==take.productionVersionId)throw new Error('Open the current production to repair a shot.');
 const assets=[];
 for(const assetId of [...new Set([resolved.assetId,resolved.audioAssetId])]){
  const asset=await ctx.db.get(assetId),stored=asset?.storageId?await ctx.db.system.get('_storage',asset.storageId):null;
  if(!asset||asset.projectId!==take.projectId||asset.deletedAt||!stored||stored.size>50_000_000)throw new Error('REPAIR_SOURCE_UNAVAILABLE');
  assets.push({assetId,storageId:asset.storageId!,checksum:stored.sha256,byteSize:stored.size,url:await ctx.storage.getUrl(asset.storageId!)});
 }
 return {projectId:take.projectId,productionId:take.productionId!,shotId:take.shotId,assets,region:Boolean(resolved.proof.region)};
}});
export const recordProbe=internalMutation({args:{projectId:v.id('projects'),assetId:v.id('assets'),storageId:v.id('_storage'),checksum:v.string(),byteSize:v.number(),probe:v.any()},returns:v.null(),handler:async(ctx,args)=>{
 await requireProjectRole(ctx,args.projectId,['OWNER','EDITOR']);const asset=await ctx.db.get(args.assetId),stored=await ctx.db.system.get('_storage',args.storageId),p=object(args.probe);
 if(asset?.projectId!==args.projectId||asset.storageId!==args.storageId||!stored||stored.sha256!==args.checksum||stored.size!==args.byteSize||p.byteSize!==args.byteSize||typeof p.hasAudio!=='boolean'||!p.hasVideo||!p.videoCodec||!Number.isFinite(p.durationSeconds)||p.durationSeconds<=0||p.durationSeconds>15||!Number.isInteger(p.width)||!Number.isInteger(p.height))throw new Error('REPAIR_PROBE_INVALID');
 const row={projectId:args.projectId,assetId:args.assetId,storageId:args.storageId,checksum:args.checksum,byteSize:args.byteSize,width:p.width,height:p.height,durationSeconds:p.durationSeconds,videoCodec:p.videoCodec,hasAudio:p.hasAudio,...(p.videoTiming?{videoTiming:p.videoTiming,videoTimingSourceChecksum:stored.sha256,videoTimingSourceStorageId:args.storageId}:{}),...(p.audioCodec?{audioCodec:p.audioCodec}:{}),probedAt:Date.now()};
 const old=await ctx.db.query('verifiedMediaProbes').withIndex('by_asset',q=>q.eq('assetId',args.assetId)).unique();if(old)await ctx.db.patch(old._id,row);else await ctx.db.insert('verifiedMediaProbes',row);return null;
}});
export const estimate=action({args:{takeId:v.id('shotVersions'),retryOfJobId:v.optional(v.id('generationJobs')),mode:v.optional(v.literal('ANIMATE_MOTION')),cartoonSourceConfirmed:v.optional(v.literal(true))},returns:v.any(),handler:async(ctx,args):Promise<any>=>{
 if(args.mode&&!args.cartoonSourceConfirmed)throw new Error('FRAME_TO_REGION_CARTOON_SOURCE_REQUIRED');
 const data=await ctx.runQuery(internal.storyActionRepairs.context,{takeId:args.takeId,...(args.mode?{motion:true}:{})});
 const base=process.env.RENDER_WORKER_URL?.trim(),secret=process.env.RENDER_WORKER_SHARED_SECRET?.trim();if(!base||!secret)throw new Error('Source measurement is not configured.');
 if(process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED==='true'){const health=await fetch(base.replace(/\/$/,'')+'/health',{redirect:'error',signal:AbortSignal.timeout(10000)});if(!health.ok)throw new Error('ACTION_WINDOW_WORKER_UNAVAILABLE');const capabilities=await health.json();if(capabilities.actionWindowVersion!=='ACTION_WINDOW_V1'||data.region&&capabilities.actionRegionVersion!=='ACTION_REGION_V1')throw new Error('ACTION_WINDOW_WORKER_UNAVAILABLE');}
 for(const asset of data.assets){
  const response=await fetch(base.replace(/\/$/,'')+'/media/probe',{method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify({url:asset.url,kind:'video',checksum:asset.checksum,byteSize:asset.byteSize,verifyVideoTiming:process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED==='true'}),redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error('The source video could not be measured.');
  const text=await response.text();if(text.length>20000)throw new Error('Source measurement was invalid.');
  const {url:_url,...binding}=asset;await ctx.runMutation(internal.storyActionRepairs.recordProbe,{projectId:data.projectId,...binding,probe:JSON.parse(text)});
 }
 if(args.mode){if(args.retryOfJobId)throw new Error('ACTION_REPAIR_NEEDS_NEW_APPROACH');await ctx.runAction((internal as any).frameRegionRepairs.prepare,{takeId:args.takeId,cartoonSourceConfirmed:true});}
 await ctx.runAction(api.videoRouting.refreshReviewedForQuote,{projectId:data.projectId});
 return ctx.runMutation(api.generationJobs.previewShotEstimate,{productionId:data.productionId,shotId:data.shotId,provider:'openrouter',model:args.mode?getActionMotionRepairModel():getActionRepairModel(),request:{storyRepairTakeId:args.takeId,...(args.mode?{storyRepairMode:args.mode}:{}),...(args.retryOfJobId?{storyRepairRetryOfJobId:args.retryOfJobId}:{}),qualityTier:'STANDARD'},estimatedCost:1,capability:'VIDEO_FINAL',idempotencyKey:args.mode?motionRepairKey(args.takeId):storyRepairKey(args.takeId,args.retryOfJobId)});
}});
export async function repairAudioCertificate(ctx:QueryCtx|MutationCtx,projectId:Id<'projects'>,assetId:Id<'assets'>,actorId?:Id<'users'>){
 await requireApprovedResource(ctx,projectId,'asset',assetId,undefined,actorId);
 const certificate=await resolveVideoEditSourceCertificate(ctx,{projectId,referenceAssetIds:[assetId]});
 if(!certificate.hasAudio)throw new Error('Choose a take with its original recording before repairing.');
 return certificate;
}

export const get=query({args:{takeId:v.id('shotVersions')},returns:v.any(),handler:async(ctx,args)=>{
 const take=await ctx.db.get(args.takeId);if(!take?.projectId)throw new Error('Take unavailable.');await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR','REVIEWER','VIEWER']);
 const job=await latestStoryRepairJob(ctx,args.takeId);
 if(!job||job.projectId!==take.projectId)return null;
 const response=object(job.response),composed=object(response.actionWindowComposed);
 return {id:job._id,status:job.status,canRequestFreshEstimate:await canRecoverUnsubmittedRegion(ctx,job,args.takeId),stage:job.executionStage,takeId:job.shotVersionId??null,canResumeSavedOutput:job.status==='FAILED'&&Boolean(job.providerJobId&&object(response.actionWindowRaw).storageId),trimmedTrailingFrames:Number(object(composed.proof).trimmedTrailingFrames??0)};
}});

/** An alternate route is an explicit new decision, never a failed-edit retry. */
export const motionOption=query({args:{takeId:v.id('shotVersions')},returns:v.any(),handler:async(ctx,args)=>{
 const take=await ctx.db.get(args.takeId);if(!take?.projectId)throw new Error('Take unavailable.');await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR','REVIEWER','VIEWER']);
 if(process.env.FINALFRAME_FRAME_TO_REGION_REPAIR_ENABLED!=='true')return null;
 const job=await ctx.db.query('generationJobs').withIndex('by_idempotency',q=>q.eq('idempotencyKey',motionRepairKey(args.takeId))).unique();
 if(job&&job.projectId!==take.projectId)throw new Error('REPAIR_SOURCE_UNAVAILABLE');
 if(job)return {job:{id:job._id,status:job.status,canResumeSavedOutput:job.status==='FAILED'&&Boolean(job.providerJobId&&object(object(job.response).actionWindowRaw).storageId)},eligible:false};
 try{const repair=await resolveStoryRepair(ctx,args.takeId,take.shotId,false,true),state=await getEffectiveResourceState(ctx,take.projectId,'asset',repair.assetId);return {job:null,eligible:true,assetId:repair.assetId,projectId:take.projectId,sourceState:state.currentState,seconds:(repair.proof.window!.endFrame-repair.proof.window!.startFrame)/24};}catch{return {job:null,eligible:false};}
}});
