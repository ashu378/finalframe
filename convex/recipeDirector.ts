import {query,mutation} from './_generated/server';
import type {QueryCtx,MutationCtx} from './_generated/server';
import type {Id} from './_generated/dataModel';
import {v} from 'convex/values';
import {requireProjectAccess,requireProjectRole} from './authorization';
import {recipeRunScope,assertRecipeSourcesCurrent,recipeObject as object} from './recipeAuthority';
import {recipeHash} from '../src/lib/production/recipes/compiler';
import {getEffectiveResourceState} from './resourceStates';
import {transitionResourceState} from './approvals';
import {sha256Equal} from '../renderer/src/media/sha256';

type ReadCtx=QueryCtx|MutationCtx;
async function cut(ctx:ReadCtx,runId:Id<'recipeRuns'>){
  const run=await ctx.db.get(runId);if(!run)throw new Error('DIRECTOR_CUT_UNAVAILABLE');
  const access=await requireProjectAccess(ctx,run.projectId);
  await recipeRunScope(ctx,runId);await assertRecipeSourcesCurrent(ctx,run);
  const nodes=await ctx.db.query('recipeRunNodes').withIndex('by_run_order',q=>q.eq('runId',runId)).take(193);if(nodes.length>192)throw new Error('DIRECTOR_CUT_LIMIT');
  const recipe=object(run.boundRecipe),fps=Number(recipe.fps),order=recipe.visualOrder;
  if(![24,25,30,50,60].includes(fps)||!Array.isArray(order)||order.length>64)throw new Error('DIRECTOR_CUT_INVALID');
  const blocked:Array<{nodeId:string;code:string}>=[],clips:any[]=[],audio:any[]=[],proofs:any[]=[],pendingAudio:Array<{nodeId:Id<'recipeRunNodes'>;assetId:Id<'assets'>}>=[],targets:Array<{type:'asset'|'shotVersion';id:string;productionId?:Id<'productions'>}>=[];
  let elapsed=0;
  async function media(raw:unknown){
    const id=typeof raw==='string'?ctx.db.normalizeId('assets',raw):null,asset=id?await ctx.db.get(id):null,storage=asset?.storageId?await ctx.db.system.get('_storage',asset.storageId):null;
    const denied=(value:unknown)=>{const item=object(value);return item.approved===false||item.consent===false||['DENIED','REVOKED','RESTRICTED','BLOCKED','QUARANTINED','EXPIRED'].includes(String(typeof value==='string'?value:item.status??item.state??'').toUpperCase());};
    if(!asset||asset.projectId!==run!.projectId||asset.scope!=='PROJECT'||asset.deletedAt||!asset.storageId||!storage||!sha256Equal(asset.checksum,storage.sha256)||asset.mimeType!==storage.contentType||[asset.rights,asset.moderation,asset.provenance].some(denied))throw new Error('DIRECTOR_CUT_SOURCE_CHANGED');
    const url=await ctx.storage.getUrl(asset.storageId);if(!url)throw new Error('DIRECTOR_CUT_SOURCE_UNAVAILABLE');
    proofs.push({assetId:asset._id,storageId:asset.storageId,checksum:storage.sha256,byteSize:storage.size,mimeType:asset.mimeType});
    targets.push({type:'asset',id:asset._id});return{asset,url,storage};
  }
  const byKey=new Map(nodes.map(node=>[node.nodeId,node]));
  for(const key of order){
    const node=byKey.get(key),request=object(node?.request),shotInput=object(request.shot);
    const durationSeconds=Number(node?.operation==='GENERATION'?shotInput.durationFrames:request.durationFrames)/fps;
    if(!Number.isFinite(durationSeconds)||durationSeconds<=0){blocked.push({nodeId:String(key),code:'PICTURE_TIMING_UNAVAILABLE'});continue;}
    const startSeconds=elapsed;elapsed+=durationSeconds;
    if(!node||node.status!=='COMPLETED'||!node.resultId){blocked.push({nodeId:String(key),code:'PICTURE_NOT_READY'});continue;}
    if(node.operation==='GRAPHIC'){blocked.push({nodeId:String(key),code:'GRAPHIC_PREVIEW_REQUIRES_TIMELINE'});continue;}
    if(node.operation==='GENERATION'){
      const takeId=ctx.db.normalizeId('shotVersions',node.resultId),take=takeId?await ctx.db.get(takeId):null;
      const job=node.linkedGenerationJobId?await ctx.db.get(node.linkedGenerationJobId):null;
      if(!take||!job||job.operation!=='SHOT_GENERATION'||job.status!=='COMPLETED'||job.projectId!==run.projectId||job.productionId!==run.productionId||job.productionVersionId!==run.productionVersionId||job.shotId!==take.shotId||object(job.response).assetId!==take.assetId||job.shotVersionId!==take._id||take.shotId!==shotInput.id||take.projectId!==run.projectId||take.productionId!==run.productionId||take.productionVersionId!==run.productionVersionId||take.status!=='COMPLETED'||!take.assetId)throw new Error('DIRECTOR_CUT_BINDING_CHANGED');
      const source=await media(take.assetId);
      if(!source.asset.mimeType?.startsWith('video/')||object(source.asset.provenance).generationJobId!==job._id)throw new Error('DIRECTOR_CUT_BINDING_CHANGED');
      const nativePolicy=object(job.request).audioPolicy;
      if(shotInput.nativeAudioPolicy!==undefined&&shotInput.nativeAudioPolicy!==nativePolicy)throw new Error('DIRECTOR_CUT_BINDING_CHANGED');
      if(['GENERATE','KEEP_SOURCE'].includes(String(nativePolicy))&&object(object(job.response).technicalProbe).hasAudio!==true){blocked.push({nodeId:node.nodeId,code:'NATIVE_AUDIO_REVIEW_REQUIRED'});continue;}
      proofs.push({nodeId:node.nodeId,requestHash:node.requestHash,resolvedRequestHash:node.resolvedRequestHash,takeId:take._id,contextSnapshot:take.contextSnapshot,jobId:job._id});
      targets.push({type:'shotVersion',id:take._id,productionId:run.productionId});
      clips.push({nodeId:node.nodeId,shotId:take.shotId,shotVersionId:take._id,assetId:take.assetId,url:source.url,mimeType:source.asset.mimeType,startSeconds,trimStartSeconds:0,durationSeconds,audioPolicy:['GENERATE','KEEP_SOURCE'].includes(String(nativePolicy))?'KEEP_SOURCE':'MUTE'});
    }else if(node.operation==='SOURCE_RANGE'){
      if(node.resultId!==request.sourceAssetId)throw new Error('DIRECTOR_CUT_BINDING_CHANGED');
      const source=await media(request.sourceAssetId);
      clips.push({nodeId:node.nodeId,assetId:source.asset._id,url:source.url,mimeType:source.asset.mimeType,startSeconds,trimStartSeconds:Number(request.startFrame)/fps,durationSeconds,audioPolicy:request.audioPolicy==='KEEP_SOURCE'?'KEEP_SOURCE':'MUTE'});
    }else blocked.push({nodeId:node.nodeId,code:'PICTURE_PREVIEW_REQUIRES_TIMELINE'});
  }
  const timeline=object(byKey.get('timeline')?.request),dialogue=Array.isArray(timeline.dialogueTracks)?timeline.dialogueTracks:[];
  const audioSlots=dialogue.map((track:any)=>({key:track.stepKey,startSeconds:Number(track.startSeconds),durationSeconds:Number(track.durationSeconds),kind:'DIALOGUE'}));
  if(typeof recipe.narrationStepKey==='string')audioSlots.push({key:recipe.narrationStepKey,startSeconds:0,durationSeconds:elapsed,kind:'NARRATION'});
  if(typeof recipe.musicStepKey==='string')audioSlots.push({key:recipe.musicStepKey,startSeconds:0,durationSeconds:elapsed,kind:'MUSIC'});
  for(const slot of audioSlots){
    const node=byKey.get(slot.key),request=object(node?.request);
    if(!node||node.status!=='COMPLETED'||!node.resultId){blocked.push({nodeId:String(slot.key),code:'AUDIO_NOT_READY'});continue;}
    if(node.operation==='NARRATION'){
      if(request.mode==='RECORDING'&&node.resultId!==request.sourceAssetId)throw new Error('DIRECTOR_CUT_BINDING_CHANGED');
      if(request.mode==='GENERATE'){
        const job=node.linkedGenerationJobId?await ctx.db.get(node.linkedGenerationJobId):null;
        const sourceId=typeof object(job?.request).recipeRunNodeId==='string'?ctx.db.normalizeId('recipeRunNodes',String(object(job?.request).recipeRunNodeId)):null;
        const origin=sourceId?await ctx.db.get(sourceId):null;
        if(!job||job.status!=='COMPLETED'||job.operation!=='PREPARATION'||job.projectId!==run.projectId||job.productionId!==run.productionId||object(job.request).preparationKind!=='NARRATION'||object(job.response).assetId!==node.resultId||object(job.request).text!==request.text||object(job.request).voiceVersionId!==request.voiceVersionId||!origin||origin.projectId!==run.projectId||origin.productionVersionId!==run.productionVersionId||origin.linkedGenerationJobId!==job._id)throw new Error('DIRECTOR_CUT_BINDING_CHANGED');
      }
    }
    const source=await media(node.operation==='MUSIC_ANALYSIS'?request.sourceAssetId:node.resultId);
    if(!source.asset.mimeType?.startsWith('audio/'))throw new Error('DIRECTOR_CUT_AUDIO_INVALID');
    if(node.operation==='NARRATION'&&request.mode==='GENERATE'&&object(source.asset.provenance).generationJobId!==node.linkedGenerationJobId)throw new Error('DIRECTOR_CUT_BINDING_CHANGED');
    const measured=await ctx.db.query('verifiedAudioProbes').withIndex('by_asset',q=>q.eq('assetId',source.asset._id)).unique();
    const trusted=measured&&measured.projectId===run.projectId&&measured.storageId===source.asset.storageId&&measured.byteSize===source.storage.size&&sha256Equal(measured.checksum,source.asset.checksum)?measured:null;
    const actual=Number(trusted?.durationSeconds);
    if(!trusted)pendingAudio.push({nodeId:node._id,assetId:source.asset._id});
    const trimStartSeconds=Number(node.operation==='MUSIC_ANALYSIS'?request.trimStartFrame??0:request.startFrame??0)/fps;
    const durationSeconds=slot.kind==='MUSIC'?slot.durationSeconds:node.operation==='NARRATION'&&request.mode==='RECORDING'?Number(request.durationFrames)/fps:actual;
    if(!Number.isFinite(actual)||!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>slot.durationSeconds+.001||trimStartSeconds+durationSeconds>actual+.001||slot.startSeconds+durationSeconds>elapsed+.001){blocked.push({nodeId:slot.key,code:'AUDIO_TIMING_REVIEW_REQUIRED'});continue;}
    proofs.push({nodeId:node.nodeId,requestHash:node.requestHash,resultId:node.resultId});
    audio.push({nodeId:node.nodeId,assetId:source.asset._id,url:source.url,mimeType:source.asset.mimeType,startSeconds:slot.startSeconds,trimStartSeconds,durationSeconds,gain:1,kind:slot.kind});
  }
  const unique=[...new Map(targets.map(target=>[target.type+':'+target.id,target])).values()];
  const states=await Promise.all(unique.map(target=>getEffectiveResourceState(ctx,run.projectId,target.type,target.id,target.productionId)));
  const ready=blocked.length===0&&clips.length===order.length&&elapsed>0&&elapsed<=60;
  const contentHash=await recipeHash({runId,productionVersionId:run.productionVersionId,compiledPlanHash:run.compiledPlanHash,proofs,clips:clips.map(({url,...clip})=>clip),audio:audio.map(({url,...track})=>track)});
  return{run,targets:unique,states,result:{runId,productionId:run.productionId,productionVersionId:run.productionVersionId,compiledPlanHash:run.compiledPlanHash,contentHash,ready,canApprove:ready&&['OWNER','EDITOR'].includes(access.projectRole),alreadyApproved:ready&&states.every(state=>['APPROVED','LOCKED'].includes(state.currentState)),fps,durationSeconds:elapsed,clips,audio,blocked,pendingAudio}};
}

export const previewCut=query({args:{runId:v.id('recipeRuns')},returns:v.any(),handler:async(ctx,args)=>(await cut(ctx,args.runId)).result});

export const approveCutMedia=mutation({args:{runId:v.id('recipeRuns'),contentHash:v.string(),confirmReviewed:v.literal(true)},returns:v.any(),handler:async(ctx,args)=>{
  const current=await cut(ctx,args.runId);const{run,result}=current;
  await requireProjectRole(ctx,run.projectId,['OWNER','EDITOR']);
  if(run.cancelRequestedAt||!result.ready||!result.canApprove||result.contentHash!==args.contentHash)throw new Error('DIRECTOR_CUT_REVIEW_CHANGED');
  if(current.states.some(state=>!['DRAFT','IN_REVIEW','APPROVED','LOCKED'].includes(state.currentState)))throw new Error('DIRECTOR_CUT_REVISION_REQUIRED');
  for(const [index,target]of current.targets.entries()){
    const args={projectId:run.projectId,productionId:target.productionId,resourceType:target.type,resourceId:target.id,roles:['OWNER','EDITOR'] as const,note:`Explicit human first-cut review ${result.contentHash}; exact saved media only, no timeline/export or spending authority.`};
    if(current.states[index].currentState==='DRAFT')await transitionResourceState(ctx,{...args,targetState:'IN_REVIEW',decision:'DIRECTOR_CUT_REVIEW_REQUESTED'});
    if(!['APPROVED','LOCKED'].includes(current.states[index].currentState))await transitionResourceState(ctx,{...args,targetState:'APPROVED',decision:'DIRECTOR_CUT_MEDIA_APPROVED'});
  }
  return{approved:true,contentHash:result.contentHash,resourceCount:current.targets.length,providerPurchases:0};
}});
