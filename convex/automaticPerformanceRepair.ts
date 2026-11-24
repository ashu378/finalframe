import { action, query, internalAction, internalMutation, internalQuery, type ActionCtx, type QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { ConvexError, v } from 'convex/values';
import { allowedMedia, repairAccess, currentCutaway, cutawayMedia, existingCorrection, type Binding } from './performanceCutaways';
import { reviewContext } from './storyActionReviews';
import { requireProjectRole } from './authorization';
import { getEffectiveResourceState, isResourceApproved, isResourceEditable, requireApprovedResource } from './resourceStates';
import { recipeHash } from '../src/lib/production/recipes/compiler';
import { sha256Equal } from '../renderer/src/media/sha256';
import { EXACT_REPAIR_ALIGNMENT_VERSION } from '../src/lib/production/exact-repair-alignment';
import { REPAIR_DISCOVERY_VERSION } from '../src/lib/production/repair-source-vision';
import { selectCutawayFrames, type CutawayRange } from '../renderer/src/media/performance-cutaway-contract';

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
async function castSignature(ctx:QueryCtx,take:Doc<'shotVersions'>,shot:Doc<'shots'>,actorId?:Id<'users'>) {
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
    const state=await getEffectiveResourceState(ctx,take.projectId,'projectResourceVersion',version._id,undefined,actorId);
    if (!isResourceApproved(state.currentState)) return null;
    if (owner.kind==='CHARACTER') hasCharacter=true;
  }
  return hasCharacter?JSON.stringify(signature(frozen)):null;
}

async function inspectedTakes(ctx:QueryCtx,c:Cutaway) {
  const takes=await ctx.db.query('shotVersions').withIndex('by_project',q=>q.eq('projectId',c.projectId)).order('desc').take(128);
  const blocked=new Set<string>([c.data.asset._id,c.audioAssetId]);
  const checked=[];
  const blockedChecksums=new Set<string>();
  const rejectedEdits:{donorChecksum:string;range:CutawayRange}[]=[];
  // The project-wide search is bounded for cost, but no rejected edit on this shot
  // can age out. A shot is limited to 200 takes by the compositor.
  const sameShot=await ctx.db.query('shotVersions').withIndex('by_shot',q=>q.eq('shotId',c.data.shot._id)).take(200);
  const unique=new Map([...takes,...sameShot].map(t=>[t._id,t]));
  for(const take of unique.values()) {
    if(!take.assetId || take.status!=='COMPLETED')continue;
    const [human,automated]=await Promise.all([
      ctx.db.query('storyActionReviews').withIndex('by_take',q=>q.eq('takeId',take._id)).order('desc').first(),
      ctx.db.query('storyActionChecks').withIndex('by_take',q=>q.eq('takeId',take._id)).order('desc').first(),
    ]);
    if(human?.passed===false || automated?.completedAt && automated.observations?.some(o=>o.result!=='PASS') && (!human || human.createdAt<automated.completedAt))
      {
        blocked.add(take.assetId);
        const receipt=take.contextSnapshot;
        if(take.projectId===c.projectId && take.productionVersionId===c.version._id && take.shotId===c.data.shot._id &&
            receipt?.source==='PERFORMANCE_CUTAWAY' && receipt.failedTakeId===c.data.take._id && receipt.donor?.assetId){
          if(receipt.range && typeof receipt.donor.checksum==='string')rejectedEdits.push({donorChecksum:receipt.donor.checksum,range:receipt.range});
          // Unversioned automatic drafts used discovery v1. A published change in
          // the visual test permits one new observation; manual rejections remain excluded.
          const method=receipt.discoveryVersion??(receipt.discoveryContextHash?'REPAIR_DISCOVERY_V1':null);
          if(!method || method===EXACT_REPAIR_ALIGNMENT_VERSION || method===REPAIR_DISCOVERY_VERSION&&process.env.FINALFRAME_EXACT_REPAIR_ALIGNMENT_ENABLED!=='true'){
            blocked.add(receipt.donor.assetId);
            if(receipt.donor.checksum)blockedChecksums.add(receipt.donor.checksum);
          }
        }
      }
    else if(human?.passed&&human.projectId===c.projectId&&human.assetId===take.assetId) checked.push(take);
  }
  return {blocked,checked,blockedChecksums,rejectedEdits};
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
        cast??=await castSignature(ctx,c.data.take,c.data.shot,c.actorId);
        if(!cast||cast!==await castSignature(ctx,take,prior.shot,c.actorId)) continue;
      }
      const v=await ctx.db.get(take.productionVersionId),prod=await ctx.db.get(take.productionId);
      if (!prod||prod.projectId!==c.projectId||v?.productionId!==take.productionId||v.status!=='APPROVED') continue;
      await requireApprovedResource(ctx,c.projectId,'shotVersion',take._id,take.productionId,c.actorId);
      const pic=await cutawayMedia(ctx,c.projectId,take.assetId,true,c.actorId);
      let donor=pic,donorStartFrame=Math.floor(obs.observedStartSeconds*24+1e-7),donorEndFrame=Math.ceil(obs.observedEndSeconds*24-1e-7);
      if (take.contextSnapshot?.source==='PERFORMANCE_CUTAWAY') {
        const proof=prior.asset.metadata?.proof, saved=take.contextSnapshot.donor, r=take.contextSnapshot.range;
        if(!saved?.assetId || proof?.version!=='PERFORMANCE_CUTAWAY_V1'||!sha256Equal(proof.checksum,pic.checksum)||
           !r || donorStartFrame<r.targetStartFrame || donorEndFrame>r.targetEndFrame || !sha256Equal(proof.donorChecksum,saved.checksum)) continue;
        donor=await cutawayMedia(ctx,c.projectId,saved.assetId,true,c.actorId);
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

function sameRejectedEdit(edits:{donorChecksum:string;range:CutawayRange}[],checksum:string,range:CutawayRange) {
  return edits.some(edit=>sha256Equal(edit.donorChecksum,checksum) &&
    edit.range.targetStartFrame===range.targetStartFrame && edit.range.targetEndFrame===range.targetEndFrame &&
    edit.range.donorStartFrame===range.donorStartFrame && edit.range.donorEndFrame===range.donorEndFrame);
}

/** Open a rejected automatic draft or its original failed take. Rebuild the same
 * failed cue from its original media, even if the draft was never approved. */
export const repairOrigin=internalQuery({
  args:takeArgs,returns:v.id('shotVersions'),handler:async(ctx,{takeId})=>{
    const c=await currentCutaway(ctx,takeId), t=c.data.take, receipt=t.contextSnapshot;
    if(receipt?.source!=='PERFORMANCE_CUTAWAY' || !receipt.discoveryContextHash)return takeId;
    const related=c.deadlines.some(w=>receipt.failedActionIds?.includes(w.actionId));
    if(!related)return takeId; // A new requirement on an edited shot has its own lineage.
    const previous=ctx.db.normalizeId('shotVersions',String(receipt.failedTakeId));
    if(!previous || previous===takeId)throw new ConvexError('The earlier failed shot could not be verified.');
    const origin=await currentCutaway(ctx,previous), media=c.data.asset;
    if(origin.projectId!==c.projectId || origin.version._id!==c.version._id || origin.data.shot._id!==t.shotId ||
      origin.data.asset._id!==receipt.sourcePicture?.assetId || origin.audioAssetId!==receipt.originalRecording?.assetId ||
      origin.proof.reviewId!==receipt.reviewId || origin.proof.checkId!==receipt.checkId ||
      !origin.deadlines.some(w=>c.deadlines.some(a=>a.actionId===w.actionId)) ||
      media.source!=='EDITED' || media.originAssetId!==origin.data.asset._id || media.metadata?.failedTakeId!==previous ||
      media.metadata.discoveryContextHash!==receipt.discoveryContextHash || !sha256Equal(media.metadata.proof?.checksum,media.checksum))
      throw new ConvexError('The original shot or action review changed. Open its current version to repair it.');
    const source=await cutawayMedia(ctx,c.projectId,origin.data.asset._id);
    if(receipt.sourcePicture.storageId!==source.storageId || !sha256Equal(receipt.sourcePicture.checksum,source.checksum))
      throw new ConvexError('The approved original footage has changed.');
    return previous;
  },
});

export const context=internalQuery({
  args:{...takeArgs,actorId:v.optional(v.id('users'))},returns:v.any(),handler:async(ctx,{takeId,actorId})=>{
    const c=await currentCutaway(ctx,takeId,actorId);
    const access=await repairAccess(ctx,c.projectId,actorId);
    const saved=await existingCorrection(ctx,c,true);
    if(saved){
      const take=await ctx.db.get(saved.shotVersionId);
      return {saved:{status:'SAVED',shotId:c.data.shot._id,shotVersionId:saved.shotVersionId,assetId:take!.assetId!}};
    }
    for(const [type,id] of [['shot',c.data.shot._id],['scene',c.scene._id]] as const) {
      if(!isResourceEditable((await getEffectiveResourceState(ctx,c.projectId,type,id,undefined,c.actorId)).currentState))
        throw new ConvexError('Create a revision of this locked shot or scene before repairing it.');
    }
    const baseBinding=await cutawayMedia(ctx,c.projectId,c.data.asset._id,true,c.actorId);
    const original=await cutawayMedia(ctx,c.projectId,c.audioAssetId,true,c.actorId);
    const {blocked,checked,blockedChecksums,rejectedEdits}=await inspectedTakes(ctx,c);
    const reviewed=await reviewedSource(ctx,c,checked,blocked);
    const records=await ctx.db.query('assets').withIndex('by_project',q=>q.eq('projectId',c.projectId)).order('desc').take(160);
    const reviewedAssets=new Set(checked.map(t=>t.assetId));
    const ranked=records.filter(a=>allowedMedia(a)&&!blocked.has(a._id)&&!a.metadata?.proof && a.source!=='EDITED' &&
      (!a.metadata?.generationJobId || reviewedAssets.has(a._id)));
    ranked.sort((a,b)=>Number(b.productionId===c.production._id)-Number(a.productionId===c.production._id));
    const bindings:Binding[]=reviewed&&!blockedChecksums.has(reviewed.donor.checksum)?[reviewed.donor]:[];
    const seen=new Set([baseBinding.checksum,original.checksum,...blockedChecksums,...bindings.map(b=>b.checksum)]);
    for(const a of ranked) {
      if(bindings.length>=8)break;
      try{
        const b=await cutawayMedia(ctx,c.projectId,a._id,true,c.actorId);
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
    const verified=reviewed && !blockedChecksums.has(reviewed.donor.checksum) && !sameRejectedEdit(rejectedEdits,reviewed.donor.checksum,reviewed.range) && ready.some(x=>x.assetId===reviewed.donor.assetId&&x.frameCount>=reviewed.range.donorEndFrame)?reviewed:null;
    const authority={discoveryVersion:REPAIR_DISCOVERY_VERSION,...(process.env.FINALFRAME_EXACT_REPAIR_ALIGNMENT_ENABLED==='true'?{alignmentMode:EXACT_REPAIR_ALIGNMENT_VERSION}:{}),rejectedEdits,projectId:c.projectId,actorUserId:access.user._id,takeId,shotId:c.data.shot._id,productionVersionId:c.version._id,requirementKey:c.data.requirementKey,
      reviewId:c.proof.reviewId,checkId:c.proof.checkId,action:rawAction,base,recording,scene,targetStartFrame:target.start,targetEndFrame:target.end,candidates:ready,reviewed:verified};
    let message:string|undefined;
    if(overlaps)message='Two required actions overlap here. Review their timing before replacing this part of the shot.';
    else if(!base || !recording)message='Use a 24 fps MP4, up to 15 seconds and 1280 × 720 or 720 × 1280, for the shot and its original recording.';
    else if(!supported)message='Check that the original recording contains AAC audio, matches the shot length, and covers the required action.';
    else if(!ready.length)message='Add and approve a different clip from this project showing the action. Use the same picture size and 24 fps as this shot.';
    return {...authority,...(message?{message}:{}),needsMeasurement,contextHash:await recipeHash(authority),fps:24,width:base?.width??0,height:base?.height??0};
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

const noMatch='The footage check could not confidently match this action and character in the approved clips it searched (up to three). Add and approve a clip showing the performance, then try again.';
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
    takeId=await ctx.runQuery(refs.repairOrigin,{takeId});
    const data=await measureInputs(ctx,takeId);
    const {pricing:_pricing,...result}=await quoteFor(ctx,takeId,data,Math.floor(Date.now()/60000));
    return result;
  },
});
type RepairResult = {status:'SAVED';shotId:Id<'shots'>;shotVersionId:Id<'shotVersions'>;assetId:Id<'assets'>}|{status:'NO_MATCH';message:string};
async function executeRepair(ctx:ActionCtx,takeId:Id<'shotVersions'>,data:any,q:{pricing:VisionQuote|null},actor:{actorId?:Id<'users'>}={}):Promise<RepairResult>{
    let exitDiscontinuity=false,exactSource=false;
    let choice=data.reviewed ? {donorAssetId:data.reviewed.donor.assetId,...data.reviewed.range}:null;
    for(let i=0;!choice&&q.pricing&&i<data.candidates.length;i++){
      const m=await ctx.runAction(vision.inspect,{takeId,contextHash:data.contextHash,...actor,...q.pricing,candidateIndex:i});
      if(m.status!=='MATCH'){exitDiscontinuity ||= m.reason==='EXIT_DISCONTINUITY';continue;}
      const range={targetStartFrame:data.targetStartFrame,targetEndFrame:m.targetEndFrame,donorStartFrame:m.donorStartFrame,donorEndFrame:m.donorEndFrame};
      if(!Number.isSafeInteger(m.targetEndFrame) || m.targetEndFrame!==data.targetEndFrame || m.donorEndFrame>data.candidates[i].frameCount ||
          sameRejectedEdit(data.rejectedEdits,data.candidates[i].checksum,range))continue;
      try{selectCutawayFrames(range);}catch{continue;}
      choice={donorAssetId:data.candidates[i].assetId,...range};
      exactSource=m.method===EXACT_REPAIR_ALIGNMENT_VERSION;
    }
    if(!choice)return {status:'NO_MATCH',message:data.message??(exitDiscontinuity?'We found the gesture, but cutting back would make the movement jump. Add an approved clip showing the character finishing the movement, then try again.':noMatch)};
    const next=await ctx.runQuery(refs.context,{takeId,...actor});
    if(next.saved)return next.saved;
    if(next.contextHash!==data.contextHash)throw new ConvexError('The source or action review changed. Check it again.');
    const saved=await ctx.runAction((internal as any).performanceCutaways.saveDiscovered,{...actor,...(exactSource?{alignmentMode:EXACT_REPAIR_ALIGNMENT_VERSION}:{}),discoveryContextHash:data.contextHash,shotVersionId:takeId,shotId:data.shotId,baseAssetId:data.base.assetId,...choice});
    return {status:'SAVED',shotId:data.shotId,...saved};
}
async function validatePurchase(ctx:ActionCtx,takeId:Id<'shotVersions'>,data:any,quoteKey:string) {
  const period=Number(quoteKey.split('.')[0]),minute=Math.floor(Date.now()/60000);
  if(!Number.isSafeInteger(period)||period>minute||minute-period>4)throw new ConvexError('This estimate expired. Check the current repair estimate.');
  const q=await quoteFor(ctx,takeId,data,period);
  if(q.quoteKey!==quoteKey)throw new ConvexError('The footage, review or price changed. Get a fresh estimate.');
  return q;
}
type RunDoc=Doc<'automaticRepairRuns'>;
const publicResult=(r:RunDoc)=>({status:r.status,updatedAt:r.updatedAt,...(r.message?{message:r.message}:{}),
  ...(r.status==='SAVED'?{shotId:r.shotId,shotVersionId:r.shotVersionId,assetId:r.assetId}:{})});
const runArgs={runId:v.id('automaticRepairRuns')};
const active=(s:RunDoc['status'])=>s==='QUEUED'||s==='RUNNING';

export const status=query({
  args:takeArgs,returns:v.any(),handler:async(ctx,{takeId}):Promise<any>=>{
    const take=await ctx.db.get(takeId);
    if(!take?.projectId)return null;
    await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR']);
    let origin:Id<'shotVersions'>;
    try{origin=await ctx.runQuery(refs.repairOrigin,{takeId});}catch{return null;}
    const row=await ctx.db.query('automaticRepairRuns').withIndex('by_take',q=>q.eq('takeId',origin)).order('desc').first();
    if(row && row.projectId!==take.projectId)return null;
    // An adoption can predate durable runs, or finish just before the action
    // loses its connection. The exact, still-eligible result is authoritative.
    const c=await currentCutaway(ctx,origin),saved=await existingCorrection(ctx,c,true);
    if(saved){
      const repaired=await ctx.db.get(saved.shotVersionId);
      if(repaired?.assetId)return {status:'SAVED',shotId:c.data.shot._id,shotVersionId:saved.shotVersionId,assetId:repaired.assetId,updatedAt:repaired.createdAt};
    }
    return !row||row.status==='SAVED'?null:publicResult(row);
  },
});

export const enqueue=internalMutation({
  args:{...takeArgs,quoteKey:v.string(),contextHash:v.string(),maximumCostUsd:v.number(),pricing:v.any()},returns:v.any(),
  handler:async(ctx,{takeId,quoteKey,contextHash,maximumCostUsd,pricing}):Promise<any>=>{
    const c=await currentCutaway(ctx,takeId),{user}=await requireProjectRole(ctx,c.projectId,['OWNER','EDITOR']);
    const data=await ctx.runQuery(refs.context,{takeId});
    if(data.saved)return {...data.saved,updatedAt:Date.now()};
    if(data.contextHash!==contextHash || !Number.isFinite(maximumCostUsd) || maximumCostUsd<0 ||
        (pricing?Math.ceil(pricing.maximumCostUsd*1e6)*data.candidates.length/1e6:0)!==maximumCostUsd)
      throw new ConvexError('The footage or estimate changed. Check it again.');
    const current=await ctx.db.query('automaticRepairRuns').withIndex('by_take',q=>q.eq('takeId',takeId)).order('desc').first();
    if(current && active(current.status))return publicResult(current);
    const same=await ctx.db.query('automaticRepairRuns').withIndex('by_take_quote',q=>q.eq('takeId',takeId).eq('quoteKey',quoteKey)).unique();
    if(same?.status==='SAVED')throw new ConvexError('The earlier correction is no longer available. Review a fresh estimate.');
    if(same)return publicResult(same);
    const now=Date.now();
    const runId=await ctx.db.insert('automaticRepairRuns',{projectId:c.projectId,takeId,actorId:user._id,
      quoteKey,contextHash,maximumCostUsd,pricing,status:'QUEUED',createdAt:now,updatedAt:now});
    await ctx.scheduler.runAfter(0,refs.work,{runId});
    await ctx.scheduler.runAfter(12*60_000,refs.expire,{runId});
    return {status:'QUEUED',updatedAt:now};
  },
});
async function launchConfirmed(ctx:ActionCtx,takeId:Id<'shotVersions'>,quoteKey:string):Promise<{origin:Id<'shotVersions'>;result:any}>{
  const origin:Id<'shotVersions'>=await ctx.runQuery(refs.repairOrigin,{takeId});
  const data=await ctx.runQuery(refs.context,{takeId:origin});
  if(data.saved)return {origin,result:{...data.saved,updatedAt:Date.now()}};
  const q=await validatePurchase(ctx,origin,data,quoteKey);
  const result=await ctx.runMutation(refs.enqueue,{takeId:origin,quoteKey,contextHash:data.contextHash,maximumCostUsd:q.maximumCostUsd,pricing:q.pricing});
  return {origin,result};
}
export const launch=action({
  args:{...takeArgs,quoteKey:v.string()},returns:v.any(),handler:async(ctx,{takeId,quoteKey}):Promise<any>=>
    (await launchConfirmed(ctx,takeId,quoteKey)).result,
});
export const readRun=internalQuery({
  args:{...takeArgs,quoteKey:v.string()},returns:v.any(),handler:async(ctx,{takeId,quoteKey})=>{
    const take=await ctx.db.get(takeId);if(!take?.projectId)return null;
    await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR']);
    const exact=await ctx.db.query('automaticRepairRuns').withIndex('by_take_quote',q=>q.eq('takeId',takeId).eq('quoteKey',quoteKey)).unique();
    const row=exact??await ctx.db.query('automaticRepairRuns').withIndex('by_take',q=>q.eq('takeId',takeId)).order('desc').first();
    return row&&row.projectId===take.projectId?{runId:row._id,result:publicResult(row)}:null;
  },
});
/** Historical direct callers can wait for the same queued work as the browser.
 * Losing the caller has no impact on the scheduled action or its saved outcome. */
export const run=action({
  args:{...takeArgs,quoteKey:v.string()},returns:v.any(),handler:async(ctx,{takeId,quoteKey}):Promise<any>=>{
    const {origin,result}=await launchConfirmed(ctx,takeId,quoteKey);
    let state=result;
    if(active(state.status)){
      let entry=await ctx.runQuery(refs.readRun,{takeId:origin,quoteKey});
      if(!entry)throw new ConvexError('The repair status is unavailable. Reopen this shot.');
      await ctx.runAction(refs.work,{runId:entry.runId}); // Atomic claim; racing the scheduler cannot resubmit.
      for(let i=0;i<90;i++){
        entry=await ctx.runQuery(refs.readRun,{takeId:origin,quoteKey});
        if(!entry)throw new ConvexError('The repair status is unavailable. Reopen this shot.');
        state=entry.result;
        if(!active(state.status))break;
        await new Promise(resolve=>setTimeout(resolve,2000));
      }
    }
    if(state.status==='FAILED')throw new ConvexError(state.message);
    if(active(state.status))throw new ConvexError('The repair is running. Reopen this shot to see its saved progress.');
    const {updatedAt:_time,...completed}=state;
    return completed;
  },
});
export const claim=internalMutation({
  args:runArgs,returns:v.any(),handler:async(ctx,{runId})=>{
    const row=await ctx.db.get(runId);
    if(!row||row.status!=='QUEUED')return null;
    await ctx.db.patch(runId,{status:'RUNNING',updatedAt:Date.now()});
    return row;
  },
});
const resultArgs={status:v.union(v.literal('SAVED'),v.literal('FAILED'),v.literal('NO_MATCH')),message:v.optional(v.string()),
  shotId:v.optional(v.id('shots')),shotVersionId:v.optional(v.id('shotVersions')),assetId:v.optional(v.id('assets'))};
export const finish=internalMutation({
  args:{...runArgs,...resultArgs},returns:v.null(),handler:async(ctx,{runId,...result})=>{
    const row=await ctx.db.get(runId);
    if(row?.status==='RUNNING')await ctx.db.patch(runId,{...result,updatedAt:Date.now()});
    return null;
  },
});
export const expire=internalMutation({
  args:runArgs,returns:v.null(),handler:async(ctx,{runId})=>{
    const row=await ctx.db.get(runId);
    if(row&&active(row.status)&&Date.now()-row.createdAt>=12*60_000){
      // A worker may have adopted a take just before it lost its connection.
      let saved:Extract<RepairResult,{status:'SAVED'}>|undefined;
      try{saved=(await ctx.runQuery(refs.context,{takeId:row.takeId,actorId:row.actorId})).saved;}catch{ /* Access or reference changed. */ }
      await ctx.db.patch(runId,{...(saved??{status:'FAILED' as const,message:'The repair worker stopped before reporting a result. Its provider receipts are saved. Check your takes and request a fresh estimate to resume.'}),updatedAt:Date.now()});
    }
    return null;
  },
});
export const work=internalAction({
  args:runArgs,returns:v.null(),handler:async(ctx,{runId}):Promise<null>=>{
    const row:RunDoc|null=await ctx.runMutation(refs.claim,{runId});
    if(!row)return null;
    try{
      const actor={actorId:row.actorId};
      const data=await ctx.runQuery(refs.context,{takeId:row.takeId,...actor});
      if(!data.saved&&(data.contextHash!==row.contextHash||Date.now()-row.createdAt>5*60_000))
        throw new ConvexError('The source or estimate changed while this search was queued. Check a fresh estimate.');
      const result:RepairResult=data.saved??await executeRepair(ctx,row.takeId,data,{pricing:row.pricing},actor);
      await ctx.runMutation(refs.finish,{runId,...result});
    }catch(error){
      const message=error instanceof ConvexError && typeof error.data==='string'?error.data.slice(0,450):
        'The repair could not finish. Its receipts are saved. Check your project access and request a fresh estimate to resume.';
      await ctx.runMutation(refs.finish,{runId,status:'FAILED',message});
    }
    return null;
  },
});
