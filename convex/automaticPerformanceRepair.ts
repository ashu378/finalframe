import { action, internalQuery, type ActionCtx, type QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { ConvexError, v } from 'convex/values';
import { allowedMedia, currentCutaway, cutawayMedia, existingCorrection, type Binding } from './performanceCutaways';
import { reviewContext } from './storyActionReviews';
import { requireProjectRole } from './authorization';
import { getEffectiveResourceState, isResourceApproved, isResourceEditable, requireApprovedResource } from './resourceStates';
import { recipeHash } from '../src/lib/production/recipes/compiler';
import { sha256Equal } from '../renderer/src/media/sha256';
import { selectCutawayFrames } from '../renderer/src/media/performance-cutaway-contract';

const refs=(internal as any).automaticPerformanceRepair;
const vision=(internal as any).automaticRepairVision;
const MAX_CANDIDATES=3;
const takeArgs={takeId:v.id('shotVersions')};
type Cutaway=Awaited<ReturnType<typeof currentCutaway>>;
type Measured=Binding & {frameCount:number;width:number;height:number;hasAudio:boolean;audioCodec:string|null};
const normalized=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();

async function measurement(ctx:QueryCtx, projectId:Id<'projects'>,binding:Binding) {
  const probe=await ctx.db.query('verifiedMediaProbes').withIndex('by_asset',q=>q.eq('assetId',binding.assetId)).unique();
  const timing=probe?.videoTiming;
  if (!probe||!timing||probe.projectId!==projectId||probe.storageId!==binding.storageId||
      !sha256Equal(binding.checksum,probe.checksum)||probe.byteSize!==binding.byteSize||
      probe.videoTimingSourceStorageId!==binding.storageId||!sha256Equal(binding.checksum,probe.videoTimingSourceChecksum)) return null;
  if(timing.version!=='DECODED_VIDEO_FRAMES_V1'||timing.firstFrameSeconds!==0||timing.fpsNumerator/timing.fpsDenominator!==24||
      !Number.isSafeInteger(timing.frameCount)||timing.frameCount<1||timing.frameCount>360||
      [probe.width,probe.height].some(n=>!Number.isSafeInteger(n)||n<16||n%2||n>1280)||Math.min(probe.width,probe.height)>720) return false;
  return {...binding,frameCount:timing.frameCount,width:probe.width,height:probe.height,hasAudio:probe.hasAudio,audioCodec:probe.audioCodec??null};
}

/** Across shots only a matching frozen, still-approved cast can attest identity.
 * Identical character names and action labels carry no project access. */
async function castSignature(ctx:QueryCtx,take:Doc<'shotVersions'>,shot:Doc<'shots'>) {
  const frozen=take.contextSnapshot?.request?.resourceBindings;
  const authored=shot.metadata?.resourceBindings;
  if (!take.projectId || !Array.isArray(frozen)||!frozen.length||frozen.length>32||!Array.isArray(authored)) return null;
  const signature=(rows:any[])=>rows.map(row=>[row.role,row.resourceVersionId,row.characterResourceVersionId??null,row.voiceVersionId??null]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (JSON.stringify(signature(frozen))!==JSON.stringify(signature(authored))) return null;
  let hasCharacter=false;
  for (const row of frozen) {
    const id=ctx.db.normalizeId('projectResourceVersions',String(row.resourceVersionId));
    const version=id?await ctx.db.get(id):null,owner=version?await ctx.db.get(version.resourceId):null;
    if(!version||!owner||owner.archivedAt||owner.projectId!==take.projectId||version.projectId!==take.projectId)return null;
    const state=await getEffectiveResourceState(ctx,take.projectId,'projectResourceVersion',version._id);
    if (!isResourceApproved(state.currentState)) return null;
    if (owner.kind==='CHARACTER') hasCharacter=true;
  }
  return hasCharacter?JSON.stringify(signature(frozen)):null;
}

async function inspectedTakes(ctx:QueryCtx,c:Cutaway) {
  const takes=await ctx.db.query('shotVersions').withIndex('by_project',q=>q.eq('projectId',c.projectId)).order('desc').take(128);
  const blocked=new Set<string>([c.data.asset._id,c.audioAssetId]);
  const checked=[];
  for(const take of takes) {
    if(!take.assetId || take.status!=='COMPLETED')continue;
    const [human,automated]=await Promise.all([
      ctx.db.query('storyActionReviews').withIndex('by_take',q=>q.eq('takeId',take._id)).order('desc').first(),
      ctx.db.query('storyActionChecks').withIndex('by_take',q=>q.eq('takeId',take._id)).order('desc').first(),
    ]);
    if(human?.passed===false || automated?.completedAt && automated.observations?.some(o=>o.result!=='PASS') && (!human || human.createdAt<automated.completedAt))
      {
        blocked.add(take.assetId);
        if(take.contextSnapshot?.source==='PERFORMANCE_CUTAWAY' && take.contextSnapshot.failedTakeId===c.data.take._id &&
            take.contextSnapshot.donor?.assetId)blocked.add(take.contextSnapshot.donor.assetId);
      }
    else if(human?.passed&&human.projectId===c.projectId&&human.assetId===take.assetId) checked.push(take);
  }
  return {blocked,checked};
}

async function reviewedSource(ctx:QueryCtx,c:Cutaway,checked:Doc<'shotVersions'>[],blocked:Set<string>) {
  const action=c.data.actions.find(a=>a.id===c.deadlines[0].actionId)!;
  const target=c.deadlines[0];
  let cast:string|null|undefined;
  for(const take of checked) {
    if(!take.assetId||blocked.has(take.assetId)||!take.productionId||!take.productionVersionId) continue;
    try {
      const prior=await reviewContext(ctx,take._id);
      if (!prior.passed || !prior.latest?.passed || prior.latest.takeId!==take._id || prior.latest.requirementKey!==prior.requirementKey) continue;
      const matching=prior.actions.find(a=>normalized(a.subject)===normalized(action.subject)&&normalized(a.action)===normalized(action.action));
      const obs=matching&&prior.latest.observations.find(o=>o.actionId===matching.id&&o.result==='PASS');
      if(!obs || obs.observedStartSeconds==null || obs.observedEndSeconds==null) continue;
      const sameShot=take.shotId===c.data.shot._id&&take.productionVersionId===c.version._id;
      if(!sameShot){
        cast??=await castSignature(ctx,c.data.take,c.data.shot);
        if(!cast||cast!==await castSignature(ctx,take,prior.shot)) continue;
      }
      const v=await ctx.db.get(take.productionVersionId),prod=await ctx.db.get(take.productionId);
      if (!prod||prod.projectId!==c.projectId||v?.productionId!==take.productionId||v.status!=='APPROVED') continue;
      await requireApprovedResource(ctx,c.projectId,'shotVersion',take._id,take.productionId);
      const pic=await cutawayMedia(ctx,c.projectId,take.assetId);
      let donor=pic,donorStartFrame=Math.floor(obs.observedStartSeconds*24+1e-7),donorEndFrame=Math.ceil(obs.observedEndSeconds*24-1e-7);
      if (take.contextSnapshot?.source==='PERFORMANCE_CUTAWAY') {
        const proof=prior.asset.metadata?.proof, saved=take.contextSnapshot.donor, r=take.contextSnapshot.range;
        if(!saved?.assetId || proof?.version!=='PERFORMANCE_CUTAWAY_V1'||!sha256Equal(proof.checksum,pic.checksum)||
           !r || donorStartFrame<r.targetStartFrame || donorEndFrame>r.targetEndFrame || !sha256Equal(proof.donorChecksum,saved.checksum)) continue;
        donor=await cutawayMedia(ctx,c.projectId,saved.assetId);
        if(donor.storageId!==saved.storageId||!sha256Equal(donor.checksum,saved.checksum)||donor.byteSize!==saved.byteSize) continue;
        // Use the actual independent performed footage, never a previous delivery as the donor.
        donorStartFrame=r.donorStartFrame;donorEndFrame=r.donorEndFrame;
      }
      if(blocked.has(donor.assetId))continue;
      const targetEndFrame=Math.min(target.end,target.start+donorEndFrame-donorStartFrame);
      const range={targetStartFrame:target.start,targetEndFrame,donorStartFrame,donorEndFrame};
      selectCutawayFrames(range);
      return {donor,range,reviewId:prior.latest._id,approvedTakeId:take._id};
    } catch { continue; }
  }
  return null;
}

export const context=internalQuery({
  args:takeArgs,returns:v.any(),handler:async(ctx,{takeId})=>{
    const c=await currentCutaway(ctx,takeId);
    const access=await requireProjectRole(ctx,c.projectId,['OWNER','EDITOR']);
    const saved=await existingCorrection(ctx,c,true);
    if(saved){
      const take=await ctx.db.get(saved.shotVersionId);
      return {saved:{status:'SAVED',shotId:c.data.shot._id,shotVersionId:saved.shotVersionId,assetId:take!.assetId!}};
    }
    for(const [type,id] of [['shot',c.data.shot._id],['scene',c.scene._id]] as const) {
      if(!isResourceEditable((await getEffectiveResourceState(ctx,c.projectId,type,id)).currentState))
        throw new ConvexError('Create a revision of this locked shot or scene before repairing it.');
    }
    const baseBinding=await cutawayMedia(ctx,c.projectId,c.data.asset._id);
    const original=await cutawayMedia(ctx,c.projectId,c.audioAssetId);
    const {blocked,checked}=await inspectedTakes(ctx,c);
    const reviewed=await reviewedSource(ctx,c,checked,blocked);
    const records=await ctx.db.query('assets').withIndex('by_project',q=>q.eq('projectId',c.projectId)).order('desc').take(160);
    const reviewedAssets=new Set(checked.map(t=>t.assetId));
    const ranked=records.filter(a=>allowedMedia(a)&&!blocked.has(a._id)&&!a.metadata?.proof && a.source!=='EDITED' &&
      (!a.metadata?.generationJobId || reviewedAssets.has(a._id)));
    ranked.sort((a,b)=>Number(b.productionId===c.production._id)-Number(a.productionId===c.production._id));
    const bindings:Binding[]=reviewed?[reviewed.donor]:[];
    const seen=new Set([baseBinding.checksum,original.checksum,...bindings.map(b=>b.checksum)]);
    for(const a of ranked) {
      if(bindings.length>=8)break;
      try{
        const b=await cutawayMedia(ctx,c.projectId,a._id);
        if(!seen.has(b.checksum)){bindings.push(b);seen.add(b.checksum);}
      }catch{continue;}
    }
    const needsMeasurement:Binding[]=[];
    const read=async(b:Binding)=>{
      const m=await measurement(ctx,c.projectId,b);if(m===null&&!needsMeasurement.some(p=>p.storageId===b.storageId))needsMeasurement.push(b);
      return m||null;
    };
    const base=await read(baseBinding), recording=await read(original);
    const candidates:Measured[]=[];
    for(const b of bindings) {
      const m=await read(b);
      if(m&&base&&m.width===base.width&&m.height===base.height&&candidates.length<MAX_CANDIDATES)candidates.push(m);
    }
    const rawAction=c.data.actions.find(a=>a.id===c.deadlines[0].actionId)!;
    const target=c.deadlines[0], scene=c.scene.title??'';
    const overlaps=c.data.actions.some(a=>a.id!==rawAction.id && Math.floor(a.startSeconds*24)<target.end &&
      Math.ceil(a.endSeconds*24)>target.start);
    const supported=!overlaps&&base&&recording&&recording.hasAudio&&recording.audioCodec==='aac'&&Math.abs(base.frameCount-recording.frameCount)<=1&&target.end<=base.frameCount;
    const ready=supported?candidates:[];
    const verified=reviewed && ready.some(x=>x.assetId===reviewed.donor.assetId&&x.frameCount>=reviewed.range.donorEndFrame)?reviewed:null;
    const authority={projectId:c.projectId,actorUserId:access.user._id,takeId,shotId:c.data.shot._id,productionVersionId:c.version._id,requirementKey:c.data.requirementKey,
      reviewId:c.proof.reviewId,checkId:c.proof.checkId,action:rawAction,base,recording,scene,targetStartFrame:target.start,targetEndFrame:target.end,candidates:ready,reviewed:verified};
    return {...authority,...(overlaps?{message:'Two required actions overlap here. Review their timing before replacing this part of the shot.'}:{}),needsMeasurement,contextHash:await recipeHash(authority),fps:24,width:base?.width??0,height:base?.height??0};
  },
});

async function measureInputs(ctx:ActionCtx,takeId:Id<'shotVersions'>) {
  let data=await ctx.runQuery(refs.context,{takeId});
  if (data.saved||!data.needsMeasurement.length)return data;
  const worker=process.env.RENDER_WORKER_URL?.trim(),secret=process.env.RENDER_WORKER_SHARED_SECRET?.trim();
  if(!worker||!secret)throw new ConvexError('The video measurement worker is unavailable.');
  for(const b of data.needsMeasurement as Binding[]){
    const url=await ctx.storage.getUrl(b.storageId);
    if(!url)continue;
    const response=await fetch(worker.replace(/\/$/,'')+'/media/probe',{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),
      headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify({kind:'video',url,checksum:b.checksum,byteSize:b.byteSize,verifyVideoTiming:true})});
    if(response.status===422){await response.body?.cancel();continue;}
    if(!response.ok)throw new ConvexError('The video measurement worker is busy. Check again shortly.');
    const raw=await response.text();
    if(raw.length>20000)throw new ConvexError('The video measurement exceeded its limit.');
    const probe=JSON.parse(raw);
    if (probe.durationSeconds>15 || !probe.videoTiming) continue;
    await ctx.runMutation(internal.storyActionRepairs.recordProbe,{projectId:data.projectId,...b,probe});
  }
  data=await ctx.runQuery(refs.context,{takeId});return data;
}

const noMatch='The footage check could not confidently match this action and character in the approved clips it searched (up to three).';
type VisionQuote={model:string;maximumCostUsd:number;priceCeiling:{prompt:number;completion:number}};
async function quoteFor(ctx:ActionCtx,takeId:Id<'shotVersions'>,data:any,period:number) {
  let pricing:VisionQuote|null=null;
  if (!data.saved && !data.reviewed && data.candidates.length) pricing=await ctx.runAction(vision.estimate,{takeId,contextHash:data.contextHash});
  const count=data.saved?0:data.reviewed?1:data.candidates.length;
  const maximumCostUsd=pricing?Math.ceil(pricing.maximumCostUsd*1e6)*count/1e6:0;
  const signature=await recipeHash(['automatic-performance-v1',takeId,data.saved??data.contextHash,period,pricing,count]);
  return {quoteKey:period+'.'+signature,maximumCostUsd,candidateCount:count,pricing};
}
export const estimate=action({
  args:takeArgs,returns:v.any(),handler:async(ctx,{takeId}):Promise<any>=>{
    const data=await measureInputs(ctx,takeId);
    const {pricing:_pricing,...result}=await quoteFor(ctx,takeId,data,Math.floor(Date.now()/60000));
    return result;
  },
});
export const run=action({
  args:{...takeArgs,quoteKey:v.string()},returns:v.any(),handler:async(ctx,{takeId,quoteKey}):Promise<any>=>{
    const data=await ctx.runQuery(refs.context,{takeId});
    if(data.saved)return data.saved;
    const period=Number(quoteKey.split('.')[0]), minute=Math.floor(Date.now()/60000);
    if(!Number.isSafeInteger(period)||period>minute||minute-period>4)throw new ConvexError('This estimate expired. Check the current repair estimate.');
    const q=await quoteFor(ctx,takeId,data,period);
    if(q.quoteKey!==quoteKey)throw new ConvexError('The footage, review or price changed. Get a fresh estimate.');
    let choice=data.reviewed ? {donorAssetId:data.reviewed.donor.assetId,...data.reviewed.range}:null;
    for(let i=0;!choice&&q.pricing&&i<data.candidates.length;i++){
      const m=await ctx.runAction(vision.inspect,{takeId,contextHash:data.contextHash,...q.pricing,candidateIndex:i});
      if(m.status!=='MATCH')continue;
      const length=m.donorEndFrame-m.donorStartFrame;
      const range={targetStartFrame:data.targetStartFrame,targetEndFrame:Math.min(data.targetEndFrame,data.targetStartFrame+length),donorStartFrame:m.donorStartFrame,donorEndFrame:m.donorEndFrame};
      if(m.donorEndFrame>data.candidates[i].frameCount)continue;
      try{selectCutawayFrames(range);}catch{continue;}
      choice={donorAssetId:data.candidates[i].assetId,...range};
    }
    if(!choice)return {status:'NO_MATCH',message:data.message??noMatch};
    const next=await ctx.runQuery(refs.context,{takeId});
    if(next.saved)return next.saved;
    if(next.contextHash!==data.contextHash)throw new ConvexError('The source or action review changed. Check it again.');
    const saved=await ctx.runAction((internal as any).performanceCutaways.saveDiscovered,{discoveryContextHash:data.contextHash,shotVersionId:takeId,shotId:data.shotId,baseAssetId:data.base.assetId,...choice});
    return {status:'SAVED',shotId:data.shotId,...saved};
  },
});
