import { ConvexError, v } from 'convex/values';
import type { Id, Doc } from './_generated/dataModel';
import { action, internalAction, internalMutation, internalQuery, query, type ActionCtx, type QueryCtx, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import { requireProjectRole } from './authorization';
import { requireApprovedResource, ensureResourceState, isResourceEditable, getEffectiveResourceState, requireEditable, isResourceApproved } from './resourceStates';
import { resolveStoryRepair } from './storyActionRepairs';
import { reviewContext } from './storyActionReviews';
import { deniedRepairMedia } from './performanceRetakeSupport';
import { sha256Equal } from '../renderer/src/media/sha256';
import { selectCutawayFrames, type CutawayRange as Range } from '../renderer/src/media/performance-cutaway-contract';
import { REPAIR_DISCOVERY_VERSION } from '../src/lib/production/repair-source-vision';
import { ACTION_WINDOW_MAX_BYTES } from '../renderer/src/media/action-window-contract';

const fail = (message: string): never => { throw new ConvexError(message); };
const functions = (internal as any).performanceCutaways;
const rangeArgs = {
  targetStartFrame: v.number(), targetEndFrame: v.number(),
  donorStartFrame: v.number(), donorEndFrame: v.number(),
};
const args = {
  shotVersionId: v.id('shotVersions'), shotId: v.id('shots'),
  baseAssetId: v.id('assets'), donorAssetId: v.id('assets'), ...rangeArgs,
};
type Context = QueryCtx | MutationCtx;
type Choice = Range & { shotVersionId: Id<'shotVersions'>; shotId: Id<'shots'>; baseAssetId: Id<'assets'>; donorAssetId: Id<'assets'> };
export type Binding = {assetId:Id<'assets'>; storageId:Id<'_storage'>; checksum:string; byteSize:number};
const rangeOf = ({targetStartFrame, targetEndFrame, donorStartFrame, donorEndFrame}:Range) => ({targetStartFrame, targetEndFrame, donorStartFrame, donorEndFrame});
export function allowedMedia(a:Doc<'assets'>) {
  return a.scope==='PROJECT' && !a.deletedAt && a.storageId && a.checksum && a.mimeType==='video/mp4' &&
    ![a.rights,a.provenance,a.moderation].some(deniedRepairMedia);
}
export async function cutawayMedia(ctx:Context, projectId:Id<'projects'>, id:Id<'assets'>, needsApproval=true):Promise<Binding> {
  const a=await ctx.db.get(id);
  if (!a || a.projectId!==projectId || !allowedMedia(a)) return fail('Choose an available MP4 from this project.');
  if (needsApproval) await requireApprovedResource(ctx, projectId, 'asset', id);
  const stored=await ctx.db.system.get('_storage',a.storageId!);
  if (!stored || stored.contentType!=='video/mp4' || stored.size<1 || stored.size>ACTION_WINDOW_MAX_BYTES || !sha256Equal(stored.sha256,a.checksum))
    return fail('The approved video has changed or exceeds the 50 MB editing limit.');
  return {assetId:id,storageId:a.storageId!,checksum:stored.sha256,byteSize:stored.size};
}

export async function currentCutaway(ctx:Context, id:Id<'shotVersions'>) {
  const take=await ctx.db.get(id);
  if (!take?.projectId || !take.productionId || !take.productionVersionId) return fail('Choose a completed project take.');
  const {project}=await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR']);
  if (process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED!=='true' || project.archivedAt || project.deletedAt)
    return fail('Saved performance editing is unavailable in this project.');
  const {data,proof,audioAssetId}=await resolveStoryRepair(ctx,id,take.shotId,true,false,'SAVED_PERFORMANCE');
  const [production,version,scene]=await Promise.all([ctx.db.get(take.productionId),ctx.db.get(take.productionVersionId),ctx.db.get(data.shot.sceneId)]);
  if (production?.projectId!==take.projectId || production.currentVersionId!==take.productionVersionId ||
      version?.productionId!==production._id || version.status!=='APPROVED' || !scene || scene.productionId!==production._id ||
      scene.productionVersionId!==version._id || (scene.projectId && scene.projectId!==take.projectId) ||
      [data.shot.status,scene.status].some(s=>s==='ARCHIVED'||s==='DELETED'))
    return fail('Open the current approved production and its active shot.');
  const deadlines=data.actions.filter(a=>proof.failedActionIds.includes(a.id)).map(a=>({
    actionId:a.id, start:Math.ceil(a.startSeconds*24-1e-7),
    end:Math.floor(Math.min(a.endSeconds,a.beforeSeconds??a.endSeconds)*24+1e-7),
  })).filter(a=>a.end>a.start);
  if (!deadlines.length) return fail('Review a missing action with a visible time window first.');
  return {projectId:take.projectId,production,version,scene,data,proof,audioAssetId,deadlines};
}

type FailedCutawayContext = Awaited<ReturnType<typeof currentCutaway>>;
function repairKey(c:FailedCutawayContext, source:Binding, donor:Binding, recording:Binding, range:Range) {
  return JSON.stringify([c.data.take._id,c.data.shot._id,c.data.requirementKey,c.proof.reviewId,c.proof.checkId,
    source,donor,recording,rangeOf(range)]);
}

/** A suggestion refers to an approved correction for this exact failed review.
 * Recheck both sides of the edit; a later review or revoked source invalidates it. */
export async function existingCorrection(ctx:QueryCtx,c:FailedCutawayContext,allowUnreviewed=false) {
  const takes=await ctx.db.query('shotVersions').withIndex('by_shot_version',q=>q.eq('shotId',c.data.shot._id)).order('desc').take(200);
  for (const take of takes) {
    const receipt=take.contextSnapshot;
    if (take.status!=='COMPLETED' || !take.assetId || take.projectId!==c.projectId || take.productionId!==c.production._id ||
        take.productionVersionId!==c.version._id || receipt?.source!=='PERFORMANCE_CUTAWAY' || typeof receipt.performanceCutawayKey!=='string' ||
        receipt.failedTakeId!==c.data.take._id || receipt.reviewId!==c.proof.reviewId || receipt.checkId!==c.proof.checkId ||
        receipt.originalRecording?.assetId!==c.audioAssetId) continue;
    try {
      const state=(await getEffectiveResourceState(ctx,c.projectId,'shotVersion',take._id,c.production._id)).currentState;
      const unreviewed=allowUnreviewed && (state==='DRAFT'||state==='IN_REVIEW');
      if (!unreviewed && !isResourceApproved(state)) continue;
      const review=await reviewContext(ctx,take._id);
      if (unreviewed && !review.passed && (review.latest || (await ctx.db.query('storyActionChecks').withIndex('by_take',q=>q.eq('takeId',take._id)).order('desc').first())?.completedAt)) continue;
      if (!unreviewed && (!review.passed || review.latest?.projectId!==c.projectId || review.latest.takeId!==take._id ||
          review.latest.assetId!==take.assetId || review.latest.productionId!==c.production._id)) continue;
      const [source,donor,recording,result]=await Promise.all([
        cutawayMedia(ctx,c.projectId,receipt.sourcePicture.assetId),cutawayMedia(ctx,c.projectId,receipt.donor.assetId),
        cutawayMedia(ctx,c.projectId,c.audioAssetId),cutawayMedia(ctx,c.projectId,take.assetId,!unreviewed),
      ]);
      if (receipt.performanceCutawayKey!==repairKey(c,source,donor,recording,receipt.range)) continue;
      const metadata=review.asset.metadata, proof=metadata?.proof;
      if (review.asset.source!=='EDITED' || review.asset.productionId!==c.production._id ||
          review.asset.originAssetId!==source.assetId || metadata?.failedTakeId!==c.data.take._id ||
          !sha256Equal(result.checksum,proof?.checksum) || result.byteSize!==proof?.byteSize) continue;
      const sameBinding=(binding:Binding|undefined,current:Binding)=>binding?.assetId===current.assetId &&
        binding.storageId===current.storageId && binding.byteSize===current.byteSize && sha256Equal(binding.checksum,current.checksum);
      const bindings=[['sourcePicture',source],['donor',donor],['originalRecording',recording]] as const;
      if (bindings.some(([field,binding])=>!sameBinding(receipt[field],binding)||!sameBinding(metadata[field],binding)) ||
          metadata.source!=='PERFORMANCE_CUTAWAY' || metadata.reviewId!==receipt.reviewId || metadata.checkId!==receipt.checkId) continue;
      validateProof(proof,rangeOf(receipt.range),source,donor,recording);
      return {shotVersionId:take._id,versionNumber:take.versionNumber};
    } catch {
      // A withdrawn, changed, or historical candidate is never offered.
      continue;
    }
  }
  return null;
}

export const options=query({
  args:{shotVersionId:v.id('shotVersions'),includeVideos:v.optional(v.boolean())},returns:v.any(),
  handler:async(ctx,{shotVersionId,includeVideos})=>{
    const take=await ctx.db.get(shotVersionId);
    if (!take?.projectId) return null;
    await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR']);
    let c:Awaited<ReturnType<typeof currentCutaway>>;
    try { c=await currentCutaway(ctx,shotVersionId); } catch { return null; }
    const approvedRepair=await existingCorrection(ctx,c);
    const assets=includeVideos===false ? [] : await ctx.db.query('assets').withIndex('by_project',q=>q.eq('projectId',c.projectId)).order('desc').take(200);
    const videos=[];
    for(const asset of assets.filter(allowedMedia)){
      const state=await ctx.db.query('resourceStates').withIndex('by_project_resource',q=>q.eq('projectId',c.projectId).eq('resourceType','asset').eq('resourceId',asset._id)).unique();
      if (!state || !isResourceApproved(state.state)) continue;
      const url=await ctx.storage.getUrl(asset.storageId!);
      if (url) videos.push({id:asset._id,title:asset.name??'Untitled video',url});
    }
    return {shotId:c.data.shot._id,approvedRepair,videos,targetStartFrame:c.deadlines[0].start,targetEndFrame:c.deadlines[0].end,fps:24};
  },
});

async function select(ctx:Context,input:Choice) {
  const c=await currentCutaway(ctx,input.shotVersionId);
  const range=rangeOf(input);
  try { selectCutawayFrames(range); } catch {
    return fail('Use whole frame numbers and a performed clip that fits the selected time at normal speed or up to three times faster.');
  }
  if (input.shotId!==c.data.shot._id || !c.deadlines.some(w=>range.targetStartFrame>=w.start && range.targetEndFrame<=w.end))
    return fail('Choose a replacement inside the missing action’s reviewed time window.');
  const [source,donor,recording]=await Promise.all([cutawayMedia(ctx,c.projectId,input.baseAssetId),cutawayMedia(ctx,c.projectId,input.donorAssetId),cutawayMedia(ctx,c.projectId,c.audioAssetId)]);
  if(sha256Equal(source.checksum,donor.checksum) && range.targetStartFrame===range.donorStartFrame && range.targetEndFrame===range.donorEndFrame)
    return fail('Choose a different performance or a different moment from the video.');
  const key=repairKey(c,source,donor,recording,range);
  const takes=await ctx.db.query('shotVersions').withIndex('by_shot',q=>q.eq('shotId',input.shotId)).take(201);
  const prior=takes.find(t=>t.contextSnapshot?.performanceCutawayKey===key);
  if (!prior && takes.length>=200) return fail('This shot has reached its take limit.');
  for(const [type,id] of [['shot',input.shotId],['scene',c.scene._id]] as const) {
    const state=await getEffectiveResourceState(ctx,c.projectId,type,id);
    if (!isResourceEditable(state.currentState)) return fail('Open a revision of the locked scene or shot before changing its picture.');
  }
  return {c,source,donor,recording,key,prior,range,nextNumber:Math.max(0,...takes.map(t=>t.versionNumber))+1};
}
type SavedTake = {shotVersionId:Id<'shotVersions'>;assetId:Id<'assets'>};
async function checkDiscovery(ctx:Context,input:Choice & {discoveryContextHash?:string},prior:Doc<'shotVersions'>|undefined):Promise<void>{
  if(!input.discoveryContextHash)return;
  const discovery:{saved?:SavedTake;contextHash?:string;base?:Binding;candidates?:Binding[]}=await ctx.runQuery((internal as any).automaticPerformanceRepair.context,{takeId:input.shotVersionId});
  if(prior?.assetId && discovery.saved?.shotVersionId===prior._id && discovery.saved.assetId===prior.assetId)return;
  if(prior || discovery.contextHash!==input.discoveryContextHash || discovery.base?.assetId!==input.baseAssetId ||
    !discovery.candidates?.some(clip=>clip.assetId===input.donorAssetId))
    return fail('The approved footage or action review changed while the video was being edited.');
}
export const prepare=internalQuery({
  args:{...args,discoveryContextHash:v.optional(v.string())},returns:v.any(),handler:async(ctx,input)=>{
    const {source,donor,recording,key,prior,range}=await select(ctx,input);
    await checkDiscovery(ctx,input,prior);
    if (prior?.assetId) return {saved:{shotVersionId:prior._id,assetId:prior.assetId}};
    const withUrl=async (b:Binding)=>({...b,url:await ctx.storage.getUrl(b.storageId)??fail('The selected video is unavailable.')});
    return {key,request:{operation:'PERFORMANCE_CUTAWAY',...range,source:await withUrl(source),donor:await withUrl(donor),recording:await withUrl(recording)}};
  },
});
function validateProof(p:any,r:Range,source:Binding,donor:Binding,recording:Binding) {
  const frames=selectCutawayFrames(r);
  if (!p || p.version!=='PERFORMANCE_CUTAWAY_V1' || p.fps!==24 || p.originalAudioCopied!==true ||
      !sha256Equal(p.sourceChecksum,source.checksum) || !sha256Equal(p.donorChecksum,donor.checksum) || !sha256Equal(p.recordingChecksum,recording.checksum) ||
      !Number.isSafeInteger(p.sourceFrames)||p.sourceFrames<r.targetEndFrame||p.sourceFrames>360||p.outputFrames!==p.sourceFrames||
      !Number.isSafeInteger(p.donorFrames)||p.donorFrames<r.donorEndFrame||p.donorFrames>360||
      [p.width,p.height].some(n=>!Number.isSafeInteger(n)||n<16||n%2||n>1280)||Math.min(p.width,p.height)>720||
      JSON.stringify(frames)!==JSON.stringify(p.selectedDonorFrames) || Object.entries(r).some(([key,n])=>p[key]!==n))
    return fail('The worker could not verify the selected frames and original recording.');
}
export const adopt=internalMutation({
  args:{...args,key:v.string(),storageId:v.id('_storage'),proof:v.any(),discoveryContextHash:v.optional(v.string())},returns:v.any(),
  handler:async(ctx,input):Promise<SavedTake>=>{
    const {c,source,donor,recording,key,prior,range,nextNumber}=await select(ctx,input);
    if (input.key!==key) return fail('The reviewed shot or its source files changed. Review them again.');
    await checkDiscovery(ctx,input,prior);
    if (prior?.assetId) return {shotVersionId:prior._id,assetId:prior.assetId};
    await requireEditable(ctx,c.projectId,'shot',c.data.shot._id);
    await requireEditable(ctx,c.projectId,'scene',c.scene._id);
    const proof=input.proof;
    validateProof(proof,range,source,donor,recording);
    const stored=await ctx.db.system.get('_storage',input.storageId);
    if (!stored || stored.size!==proof.byteSize || stored.size<1 || stored.size>ACTION_WINDOW_MAX_BYTES || stored.contentType!=='video/mp4' || !sha256Equal(stored.sha256,proof.checksum))
      return fail('The saved video differs from the verified edit.');
    const now=Date.now();
    const shared={projectId:c.projectId,productionId:c.production._id,studioId:c.production.studioId,studioExternalId:c.production.studioExternalId};
    const lineage={source:'PERFORMANCE_CUTAWAY',failedTakeId:input.shotVersionId,reviewId:c.proof.reviewId,checkId:c.proof.checkId,failedActionIds:c.proof.failedActionIds,sourcePicture:source,donor,originalRecording:recording,range,...(input.discoveryContextHash?{discoveryContextHash:input.discoveryContextHash,discoveryVersion:REPAIR_DISCOVERY_VERSION}:{})};
    const name=input.discoveryContextHash?`${c.data.shot.title?.trim() || 'Shot'} - take ${nextNumber}`:'Saved performance cutaway';
    const assetId:Id<'assets'>=await ctx.db.insert('assets',{...shared,scope:'PROJECT',source:'EDITED',name,originAssetId:source.assetId,
      roles:['FOOTAGE'],mimeType:'video/mp4',storageId:input.storageId,checksum:stored.sha256,byteSize:stored.size,width:proof.width,height:proof.height,
      durationSeconds:proof.outputFrames/24,frameRate:24,provenance:{kind:'PERFORMANCE_CUTAWAY',...lineage},metadata:{...lineage,proof},createdAt:now});
    const shotVersionId:Id<'shotVersions'>=await ctx.db.insert('shotVersions',{...shared,productionVersionId:c.version._id,shotId:input.shotId,versionNumber:nextNumber,
      status:'COMPLETED',assetId,actualCost:0,promptSnapshot:c.data.take.promptSnapshot,contextSnapshot:{...lineage,performanceCutawayKey:key},createdAt:now});
    for (const [resourceType,resourceId] of [['asset',assetId],['shotVersion',shotVersionId]] as const)
      await ensureResourceState(ctx,{projectId:c.projectId,productionId:c.production._id,resourceType,resourceId});
    return {shotVersionId,assetId};
  },
});
async function saveCutaway(ctx:ActionCtx,input:Choice,discoveryContextHash?:string):Promise<SavedTake> {
    const {saved,key,request}=await ctx.runQuery(functions.prepare,{...input,...(discoveryContextHash?{discoveryContextHash}:{})});
    if(saved) return saved;
    const worker=process.env.RENDER_WORKER_URL?.trim(), secret=process.env.RENDER_WORKER_SHARED_SECRET?.trim();
    if (!worker || !secret) return fail('The video editing worker is unavailable. Try again when it is online.');
    const response=await fetch(worker.replace(/\/$/,'')+'/media/action-window',{method:'POST',redirect:'error',signal:AbortSignal.timeout(185000),
      headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify(request)});
    const header=response.headers.get('x-finalframe-action-window');
    if (!response.ok || !header || header.length>8192 || !response.body || response.headers.get('content-type')!=='video/mp4') {
      await response.body?.cancel();
      return fail(response.status===422?'The selected MP4s must share the same 24 fps canvas and match the original recording’s timing. Check the chosen frames.':'The video editing worker could not finish. Your inputs are saved.');
    }
    const proof=JSON.parse(header);
    validateProof(proof,rangeOf(input),request.source,request.donor,request.recording);
    if (!Number.isSafeInteger(proof.byteSize)||proof.byteSize<1||proof.byteSize>ACTION_WINDOW_MAX_BYTES) return fail('The edited output is too large.');
    const reader=response.body.getReader(), chunks:Uint8Array[]=[];
    let bytes=0;
    try { while(true){const part=await reader.read(); if(part.done)break; bytes+=part.value.byteLength; if(bytes>proof.byteSize)return fail('The returned video exceeds its verified size.'); chunks.push(part.value);} }
    finally{await reader.cancel().catch(()=>undefined);}
    if (bytes!==proof.byteSize) return fail('The video transfer stopped early. Try the saved edit again.');
    const storageId=await ctx.storage.store(new Blob(chunks as BlobPart[],{type:'video/mp4'}));
    try { return await ctx.runMutation(functions.adopt,{...input,key,proof,storageId,...(discoveryContextHash?{discoveryContextHash}:{})}); }
    finally { await ctx.runMutation((internal as any).repairTiming.cleanup,{storageId}).catch(()=>undefined); }
}
export const save=action({args,returns:v.any(),handler:(ctx,input)=>saveCutaway(ctx,input)});
/** Discovery is server-directed. Manual selection cannot forge this provenance. */
export const saveDiscovered=internalAction({
  args:{...args,discoveryContextHash:v.string()},returns:v.any(),
  handler:(ctx,{discoveryContextHash,...input})=>saveCutaway(ctx,input,discoveryContextHash),
});
