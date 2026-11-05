import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireProjectRole, resolveProjectAccessForActor } from './authorization';
import { requireApprovedResource } from './resourceStates';
import { normalizeSha256, sha256Equal } from '../renderer/src/media/sha256';
import { AUDIO_EXTRACTION_PROFILE } from '../renderer/src/media/audio-extraction-contracts';
import { decodedVideoTiming, sourceAudioReceipt, sourceAudioPlan, sourceAudioRequirements, SOURCE_AUDIO_RATE, type SourceAudioTimingChoice, type SourceAudioRestoration } from '../renderer/src/media/source-audio-contract';
import { validateManifest } from '../renderer/src/manifest';

type ReadCtx=QueryCtx|MutationCtx;
const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const denied=(value:unknown)=>{const r=record(value);return r.approved===false||r.consent===false||['DENIED','REJECTED','REVOKED','EXPIRED','BLOCKED','RESTRICTED','QUARANTINED'].includes(String(typeof value==='string'?value:r.status??r.state??'').toUpperCase());};
export const sourceAudioEnabled=()=>process.env.FINALFRAME_SOURCE_AUDIO_RESTORE_ENABLED==='true'&&process.env.FINALFRAME_MANIFEST_V5_ENABLED==='true';
export interface SourceAudioClip {kind?:string;assetId?:string;shotVersionId?:string;startSeconds:number;durationSeconds:number;trimStartSeconds?:number;trimEndSeconds?:number;volume?:number;metadata?:unknown;transition?:unknown;}
async function asset(ctx:ReadCtx,projectId:Id<'projects'>,id:Id<'assets'>,actorId?:Id<'users'>){
 const found=await ctx.db.get(id);const stored=found?.storageId?await ctx.db.system.get('_storage',found.storageId):null;
 if(!found||found.projectId!==projectId||found.scope!=='PROJECT'||found.deletedAt||!found.storageId||!stored||stored.size<1||!normalizeSha256(stored.sha256)||!sha256Equal(found.checksum,stored.sha256)||found.mimeType!==stored.contentType||[found.rights,found.provenance,found.moderation].some(denied))throw new Error('SOURCE_AUDIO_MEDIA_CHANGED');
 await requireApprovedResource(ctx,projectId,'asset',id,undefined,actorId);return {asset:found,stored};
}
/** Only genuine completed generated takes qualify; user-authored take metadata
 * or an arbitrary approved recording cannot impersonate the original source. */
export async function editedSourceContext(ctx:ReadCtx,projectId:Id<'projects'>,takeId:Id<'shotVersions'>,actorId?:Id<'users'>,expectedProductionVersionId?:Id<'productionVersions'>){
 const access=actorId?await resolveProjectAccessForActor(ctx,projectId,actorId,['OWNER','EDITOR']):await requireProjectRole(ctx,projectId,['OWNER','EDITOR']);
 if(access.project.deletedAt||access.project.archivedAt||['ARCHIVED','DELETED','DISABLED'].includes(String(access.project.status??'').toUpperCase())||access.project.moderationStatus==='RESTRICTED')throw new Error('SOURCE_AUDIO_PROJECT_UNAVAILABLE');
 const take=await ctx.db.get(takeId);const production=take?.productionId?await ctx.db.get(take.productionId):null;
 if(!take||take.projectId!==projectId||take.status!=='COMPLETED'||!take.assetId||!production||production.projectId!==projectId||(expectedProductionVersionId??production.currentVersionId)!==take.productionVersionId)throw new Error('SOURCE_AUDIO_TAKE_UNAVAILABLE');
 const version=take.productionVersionId?await ctx.db.get(take.productionVersionId):null;if(!version||version.productionId!==production._id||version.status!=='APPROVED')throw new Error('SOURCE_AUDIO_TAKE_UNAVAILABLE');
 await requireApprovedResource(ctx,projectId,'shotVersion',takeId,production._id,actorId);
 const edited=await asset(ctx,projectId,take.assetId,actorId);const jobId=ctx.db.normalizeId('generationJobs',String(record(edited.asset.metadata).generationJobId??''));const job=jobId?await ctx.db.get(jobId):null;
 const request=record(job?.request),frozen=record(record(take.contextSnapshot).request),certificate=record(request.editSource);
 if(!job||job.projectId!==projectId||job.productionId!==production._id||job.productionVersionId!==take.productionVersionId||job.shotVersionId!==take._id||job.status!=='COMPLETED'||!job.providerJobId||record(job.response).assetId!==edited.asset._id||request.audioPolicy!=='KEEP_SOURCE'||frozen.audioPolicy!=='KEEP_SOURCE'||!['EDIT','APPEARANCE_EDIT','OBJECT_REPLACE'].includes(request.operation)||record(request.editQuote).version!=='FLUX_SOURCE_VIDEO_EDIT_V1'||JSON.stringify(frozen.editSource)!==JSON.stringify(request.editSource))throw new Error('SOURCE_AUDIO_SOURCE_BINDING_REQUIRED');
 const sourceId=ctx.db.normalizeId('assets',String(certificate.assetId??''));if(!sourceId)throw new Error('SOURCE_AUDIO_SOURCE_BINDING_REQUIRED');const original=await asset(ctx,projectId,sourceId,actorId);
 if(certificate.hasAudio!==true||original.asset.storageId!==certificate.storageId||!sha256Equal(original.stored.sha256,certificate.checksum)||original.stored.size!==certificate.byteSize||!original.asset.mimeType?.startsWith('video/'))throw new Error('SOURCE_AUDIO_SOURCE_CHANGED');
 return {access,take,production,edited,original,certificate};
}
export async function sourceAudioBinding(ctx:ReadCtx,args:{projectId:Id<'projects'>;takeId:Id<'shotVersions'>;derivationJobId:Id<'mediaDerivationJobs'>;trimStartSeconds:number;pictureFrames:number;fps:number;timingChoice:SourceAudioTimingChoice;confirmedDeltaSamples:number;maximumPictureFrames:number;key:string;skipVideoTiming?:boolean;actorId?:Id<'users'>;expectedProductionVersionId?:Id<'productionVersions'>}){
 const context=await editedSourceContext(ctx,args.projectId,args.takeId,args.actorId,args.expectedProductionVersionId);const {edited,original}=context;
 const job=await ctx.db.get(args.derivationJobId);
 if(!job||job.projectId!==args.projectId||job.status!=='COMPLETED'||job.profile!==AUDIO_EXTRACTION_PROFILE||job.sourceAssetId!==original.asset._id||job.sourceStorageId!==original.asset.storageId||job.sourceByteSize!==original.stored.size||!sha256Equal(job.sourceChecksum,original.stored.sha256)||!sha256Equal(job.sourceAssetChecksum,original.asset.checksum)||!sha256Equal(job.sourceStorageChecksum,original.stored.sha256)||!job.resultAssetId||!job.resultStorageId||!job.resultChecksum||job.actualSampleCount!==job.sampleCount)throw new Error('SOURCE_AUDIO_EXTRACTION_BINDING_REQUIRED');
 const audio=await asset(ctx,args.projectId,job.resultAssetId,args.actorId);const provenance=record(audio.asset.provenance);
 if(!['audio/wav','audio/x-wav'].includes(audio.asset.mimeType??'')||audio.asset.originAssetId!==original.asset._id||audio.asset.storageId!==job.resultStorageId||!sha256Equal(audio.stored.sha256,job.resultChecksum)||audio.stored.size!==job.resultByteSize||provenance.kind!=='LOCAL_AUDIO_EXTRACTION'||provenance.mediaDerivationJobId!==job._id||provenance.sourceAssetId!==original.asset._id||provenance.sourceStorageId!==original.asset.storageId||!sha256Equal(provenance.sourceChecksum,original.stored.sha256)||provenance.profile!==AUDIO_EXTRACTION_PROFILE||provenance.sampleCount!==job.sampleCount||provenance.startSample!==job.startSample)throw new Error('SOURCE_AUDIO_EXTRACTION_BINDING_REQUIRED');
 if(Math.abs(args.trimStartSeconds*args.fps-Math.round(args.trimStartSeconds*args.fps))>0.000001)throw new Error('SOURCE_AUDIO_FRAME_ALIGNMENT_REQUIRED');
 const startSample=args.trimStartSeconds*SOURCE_AUDIO_RATE;if(!Number.isSafeInteger(Math.round(startSample))||Math.abs(startSample-Math.round(startSample))>0.000001||Math.round(startSample)!==job.startSample)throw new Error('SOURCE_AUDIO_SOURCE_WINDOW_CHANGED');
 const probe=await ctx.db.query('verifiedMediaProbes').withIndex('by_asset',q=>q.eq('assetId',edited.asset._id)).unique();
 let timing:ReturnType<typeof decodedVideoTiming>|null=null;
 const currentProbe=probe&&probe.projectId===args.projectId&&probe.storageId===edited.asset.storageId&&probe.videoTimingSourceStorageId===edited.asset.storageId&&sha256Equal(probe.videoTimingSourceChecksum,edited.stored.sha256)&&sha256Equal(probe.checksum,edited.stored.sha256)&&probe.byteSize===edited.stored.size;
 try{if(currentProbe)timing=decodedVideoTiming(probe.videoTiming);}catch{if(!args.skipVideoTiming)throw new Error('SOURCE_AUDIO_VIDEO_TIMING_REQUIRED');}
 if(!timing&&!args.skipVideoTiming)throw new Error('SOURCE_AUDIO_VIDEO_TIMING_REQUIRED');
 if(timing&&(timing.firstFrameSeconds!==0||args.trimStartSeconds>=timing.durationSeconds))throw new Error('SOURCE_AUDIO_VIDEO_WINDOW_SHORT');
 // Count actual timeline sample positions within decoded picture coverage,
 // not a duration tolerance. A shorter picture needs an explicit hold choice.
 const availablePictureFrames=timing?Math.ceil((timing.durationSeconds-args.trimStartSeconds)*args.fps-0.000001):undefined;
 const plan=sourceAudioPlan({...args,audioSamples:job.sampleCount,availablePictureFrames});
 const receipt=sourceAudioReceipt({...plan,version:1,key:args.key,fps:args.fps,derivationJobId:job._id,editedTakeId:context.take._id,editedAssetId:edited.asset._id,sourceAssetId:original.asset._id,sourceStorageId:original.asset.storageId,sourceChecksum:normalizeSha256(original.stored.sha256)!,sourceStartSample:job.startSample,audioAssetId:audio.asset._id,audioStorageId:audio.asset.storageId,audioChecksum:normalizeSha256(audio.stored.sha256)!});
 return {...context,audio,job,receipt,videoTiming:timing};
}
/** Revalidate persisted pairs on every edit and assembly. No edited native
 * sound can be re-enabled while still claiming original-source restoration. */
export async function validateSourceAudioPairs(ctx:ReadCtx,projectId:Id<'projects'>,clips:SourceAudioClip[],fps:number,actorId?:Id<'users'>,expectedProductionVersionId?:Id<'productionVersions'>){
 const groups=new Map<string,Array<{clip:SourceAudioClip;receipt:SourceAudioRestoration}>>();
 for(const clip of clips){const raw=record(clip.metadata).sourceAudioRestoration;if(raw!==undefined){const receipt=sourceAudioReceipt(raw);const rows=groups.get(receipt.key)??[];rows.push({clip,receipt});groups.set(receipt.key,rows);}else if(record(record(clip.metadata).renderItem).holdAfterFrame!==undefined)throw new Error('SOURCE_AUDIO_BINDING_INVALID');}
 for(const rows of groups.values()){
  const pictures=rows.filter(row=>(row.clip.kind??record(row.clip.metadata).clipKind)==='VIDEO'),sounds=rows.filter(row=>(row.clip.kind??record(row.clip.metadata).clipKind)==='AUDIO');
  if(rows.length!==2||pictures.length!==1||sounds.length!==1)throw new Error('SOURCE_AUDIO_PAIR_INCOMPLETE');
  const {clip:picture,receipt}=pictures[0],{clip:sound}=sounds[0];
  if(Math.abs(picture.startSeconds*fps-Math.round(picture.startSeconds*fps))>0.000001)throw new Error('SOURCE_AUDIO_FRAME_ALIGNMENT_REQUIRED');
  if(JSON.stringify(receipt)!==JSON.stringify(sounds[0].receipt)||receipt.fps!==fps||picture.assetId!==receipt.editedAssetId||picture.shotVersionId!==receipt.editedTakeId||picture.volume!==0||sound.assetId!==receipt.audioAssetId||typeof sound.volume!=='number'||!Number.isFinite(sound.volume)||sound.volume<0||sound.volume>2||sound.startSeconds!==picture.startSeconds||(sound.trimStartSeconds??0)!==0||Math.abs(sound.durationSeconds-receipt.placedSamples/SOURCE_AUDIO_RATE)>1e-9||Math.abs(picture.durationSeconds-receipt.outputFrames/fps)>1e-9||record(record(picture.metadata).renderItem).holdAfterFrame!==receipt.holdAfterFrame)throw new Error('SOURCE_AUDIO_PAIR_CHANGED');
  if(receipt.holdAfterFrame!==undefined){const oldEnd=picture.startSeconds+receipt.pictureFrames/fps,newEnd=picture.startSeconds+receipt.outputFrames/fps;if(record(record(picture.transition).out).kind&&record(record(picture.transition).out).kind!=='CUT'||clips.some(other=>other!==picture&&!['AUDIO','CAPTIONS'].includes(other.kind??record(other.metadata).clipKind)&&other.startSeconds>=oldEnd-0.000001&&other.startSeconds<newEnd-0.000001))throw new Error('SOURCE_AUDIO_HOLD_OVERLAPS_PICTURE');}
  const restored=await sourceAudioBinding(ctx,{projectId,takeId:receipt.editedTakeId as Id<'shotVersions'>,derivationJobId:receipt.derivationJobId as Id<'mediaDerivationJobs'>,trimStartSeconds:picture.trimStartSeconds??0,pictureFrames:receipt.pictureFrames,fps,timingChoice:receipt.timingChoice,confirmedDeltaSamples:receipt.deltaSamples,maximumPictureFrames:60*fps,key:receipt.key,actorId,expectedProductionVersionId});
  if(JSON.stringify(restored.receipt)!==JSON.stringify(receipt))throw new Error('SOURCE_AUDIO_BINDING_CHANGED');
 }
}

/** First-dispatch fence over the immutable manifest, not a later timeline.
 * The caller has already authorized the exact current version or retained
 * movie component before supplying its server-only expected version. */
export async function validateSourceAudioManifest(ctx:ReadCtx,projectId:Id<'projects'>,manifest:unknown,actorId:Id<'users'>,expectedProductionVersionId:Id<'productionVersions'>){
 if(!sourceAudioRequirements(manifest))return;
 if(!validateManifest(manifest).ok)throw new Error('SOURCE_AUDIO_MANIFEST_INVALID');
 const raw=record(manifest),fps=Number(record(raw.output).fps),sources=new Map<string,Record<string,any>>();
 for(const value of Array.isArray(raw.sources)?raw.sources:[]){const source=record(value);if(typeof source.timelineClipId==='string')sources.set(source.timelineClipId,source);if(typeof source.audioId==='string')sources.set(source.audioId,source);}
 const clips:SourceAudioClip[]=[];
 for(const value of raw.items){
  const item=record(value),source=sources.get(String(item.id)),transition=(Array.isArray(raw.transitions)?raw.transitions:[]).map(record).find(row=>row.fromItemId===item.id);
  clips.push({kind:item.kind==='video'?'VIDEO':item.kind==='image'?'IMAGE':'GRAPHIC',assetId:item.assetId??source?.assetId,shotVersionId:item.shotVersionId,startSeconds:item.startFrame/fps,durationSeconds:item.durationInFrames/fps,trimStartSeconds:(item.trimStartInFrames??0)/fps,volume:item.volume,metadata:{sourceAudioRestoration:item.sourceAudioRestoration,renderItem:{holdAfterFrame:item.holdAfterFrame}},...(transition?{transition:{out:{kind:transition.kind}}}:{})});
 }
 for(const value of Array.isArray(raw.audioTracks)?raw.audioTracks:[]){
  const item=record(value),source=sources.get(String(item.id)),receipt=item.sourceAudioRestoration===undefined?null:sourceAudioReceipt(item.sourceAudioRestoration);
  if(receipt&&source?.assetId!==receipt.audioAssetId)throw new Error('SOURCE_AUDIO_MANIFEST_BINDING_CHANGED');
  clips.push({kind:'AUDIO',assetId:source?.assetId,startSeconds:item.startFrame/fps,durationSeconds:receipt?receipt.placedSamples/SOURCE_AUDIO_RATE:item.durationInFrames/fps,trimStartSeconds:(item.trimStartInFrames??0)/fps,volume:item.volume,metadata:{sourceAudioRestoration:item.sourceAudioRestoration}});
 }
 await validateSourceAudioPairs(ctx,projectId,clips,fps,actorId,expectedProductionVersionId);
}
