import { ConvexError, v } from 'convex/values';
import type { Id, Doc } from './_generated/dataModel';
import { action, internalMutation, internalQuery, query, type QueryCtx, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import { requireProjectRole } from './authorization';
import { requireApprovedResource, ensureResourceState, isResourceEditable, getEffectiveResourceState, requireEditable, isResourceApproved } from './resourceStates';
import { resolveStoryRepair } from './storyActionRepairs';
import { deniedRepairMedia } from './performanceRetakeSupport';
import { sha256Equal } from '../renderer/src/media/sha256';
import { selectCutawayFrames, type CutawayRange as Range } from '../renderer/src/media/performance-cutaway-contract';
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
type Binding = {assetId:Id<'assets'>; storageId:Id<'_storage'>; checksum:string; byteSize:number};
const rangeOf = ({targetStartFrame, targetEndFrame, donorStartFrame, donorEndFrame}:Range) => ({targetStartFrame, targetEndFrame, donorStartFrame, donorEndFrame});
function allowedMedia(a:Doc<'assets'>) {
  return a.scope==='PROJECT' && !a.deletedAt && a.storageId && a.checksum && a.mimeType==='video/mp4' &&
    ![a.rights,a.provenance,a.moderation].some(deniedRepairMedia);
}
async function media(ctx:Context, projectId:Id<'projects'>, id:Id<'assets'>):Promise<Binding> {
  const a=await ctx.db.get(id);
  if (!a || a.projectId!==projectId || !allowedMedia(a)) return fail('Choose an available MP4 from this project.');
  await requireApprovedResource(ctx, projectId, 'asset', id);
  const stored=await ctx.db.system.get('_storage',a.storageId!);
  if (!stored || stored.contentType!=='video/mp4' || stored.size<1 || stored.size>ACTION_WINDOW_MAX_BYTES || !sha256Equal(stored.sha256,a.checksum))
    return fail('The approved video has changed or exceeds the 50 MB editing limit.');
  return {assetId:id,storageId:a.storageId!,checksum:stored.sha256,byteSize:stored.size};
}

async function current(ctx:Context, id:Id<'shotVersions'>) {
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
    start:Math.ceil(a.startSeconds*24-1e-7),
    end:Math.floor(Math.min(a.endSeconds,a.beforeSeconds??a.endSeconds)*24+1e-7),
  })).filter(a=>a.end>a.start);
  if (!deadlines.length) return fail('Review a missing action with a visible time window first.');
  return {projectId:take.projectId,production,version,scene,data,proof,audioAssetId,deadlines};
}

export const options=query({
  args:{shotVersionId:v.id('shotVersions')},returns:v.any(),
  handler:async(ctx,{shotVersionId})=>{
    const take=await ctx.db.get(shotVersionId);
    if (!take?.projectId) return null;
    await requireProjectRole(ctx,take.projectId,['OWNER','EDITOR']);
    let c:Awaited<ReturnType<typeof current>>;
    try { c=await current(ctx,shotVersionId); } catch { return null; }
    const assets=await ctx.db.query('assets').withIndex('by_project',q=>q.eq('projectId',c.projectId)).order('desc').take(200);
    const videos=[];
    for(const asset of assets.filter(allowedMedia)){
      const state=await ctx.db.query('resourceStates').withIndex('by_project_resource',q=>q.eq('projectId',c.projectId).eq('resourceType','asset').eq('resourceId',asset._id)).unique();
      if (!state || !isResourceApproved(state.state)) continue;
      const url=await ctx.storage.getUrl(asset.storageId!);
      if (url) videos.push({id:asset._id,title:asset.name??'Untitled video',url});
    }
    return {shotId:c.data.shot._id,videos,targetStartFrame:c.deadlines[0].start,targetEndFrame:c.deadlines[0].end,fps:24};
  },
});

async function select(ctx:Context,input:Choice) {
  const c=await current(ctx,input.shotVersionId);
  const range=rangeOf(input);
  try { selectCutawayFrames(range); } catch {
    return fail('Use whole frame numbers and a performed clip that fits the selected time at normal speed or up to three times faster.');
  }
  if (input.shotId!==c.data.shot._id || !c.deadlines.some(w=>range.targetStartFrame>=w.start && range.targetEndFrame<=w.end))
    return fail('Choose a replacement inside the missing action’s reviewed time window.');
  const [source,donor,recording]=await Promise.all([media(ctx,c.projectId,input.baseAssetId),media(ctx,c.projectId,input.donorAssetId),media(ctx,c.projectId,c.audioAssetId)]);
  if(sha256Equal(source.checksum,donor.checksum) && range.targetStartFrame===range.donorStartFrame && range.targetEndFrame===range.donorEndFrame)
    return fail('Choose a different performance or a different moment from the video.');
  const key=JSON.stringify([input.shotVersionId,input.shotId,c.data.requirementKey,c.proof.reviewId,c.proof.checkId,source,donor,recording,range]);
  const takes=await ctx.db.query('shotVersions').withIndex('by_shot',q=>q.eq('shotId',input.shotId)).take(201);
  const prior=takes.find(t=>t.contextSnapshot?.performanceCutawayKey===key);
  if (!prior && takes.length>=200) return fail('This shot has reached its take limit.');
  for(const [type,id] of [['shot',input.shotId],['scene',c.scene._id]] as const) {
    const state=await getEffectiveResourceState(ctx,c.projectId,type,id);
    if (!isResourceEditable(state.currentState)) return fail('Open a revision of the locked scene or shot before changing its picture.');
  }
  return {c,source,donor,recording,key,prior,range,nextNumber:Math.max(0,...takes.map(t=>t.versionNumber))+1};
}
export const prepare=internalQuery({
  args,returns:v.any(),handler:async(ctx,input)=>{
    const {source,donor,recording,key,prior,range}=await select(ctx,input);
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
  args:{...args,key:v.string(),storageId:v.id('_storage'),proof:v.any()},returns:v.any(),
  handler:async(ctx,input)=>{
    const {c,source,donor,recording,key,prior,range,nextNumber}=await select(ctx,input);
    if (input.key!==key) return fail('The reviewed shot or its source files changed. Review them again.');
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
    const lineage={source:'PERFORMANCE_CUTAWAY',failedTakeId:input.shotVersionId,reviewId:c.proof.reviewId,checkId:c.proof.checkId,failedActionIds:c.proof.failedActionIds,sourcePicture:source,donor,originalRecording:recording,range};
    const assetId=await ctx.db.insert('assets',{...shared,scope:'PROJECT',source:'EDITED',name:'Saved performance cutaway',originAssetId:source.assetId,
      roles:['FOOTAGE'],mimeType:'video/mp4',storageId:input.storageId,checksum:stored.sha256,byteSize:stored.size,width:proof.width,height:proof.height,
      durationSeconds:proof.outputFrames/24,frameRate:24,provenance:{kind:'PERFORMANCE_CUTAWAY',...lineage},metadata:{...lineage,proof},createdAt:now});
    const shotVersionId=await ctx.db.insert('shotVersions',{...shared,productionVersionId:c.version._id,shotId:input.shotId,versionNumber:nextNumber,
      status:'COMPLETED',assetId,actualCost:0,promptSnapshot:c.data.take.promptSnapshot,contextSnapshot:{...lineage,performanceCutawayKey:key},createdAt:now});
    for (const [resourceType,resourceId] of [['asset',assetId],['shotVersion',shotVersionId]] as const)
      await ensureResourceState(ctx,{projectId:c.projectId,productionId:c.production._id,resourceType,resourceId});
    return {shotVersionId,assetId};
  },
});
export const save=action({
  args,returns:v.any(),handler:async(ctx,input):Promise<{shotVersionId:Id<'shotVersions'>;assetId:Id<'assets'>}>=>{
    const {saved,key,request}=await ctx.runQuery(functions.prepare,input);
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
    try { return await ctx.runMutation(functions.adopt,{...input,key,proof,storageId}); }
    finally { await ctx.runMutation((internal as any).repairTiming.cleanup,{storageId}).catch(()=>undefined); }
  },
});
