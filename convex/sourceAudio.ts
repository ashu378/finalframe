import { action, internalQuery, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import type { FunctionReference } from 'convex/server';
import { sha256Equal } from '../renderer/src/media/sha256';
import { decodedVideoTiming } from '../renderer/src/media/source-audio-contract';
import { editedSourceContext, sourceAudioEnabled } from './sourceAudioContracts';
const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const refs=(internal as unknown as {sourceAudio:Record<string,FunctionReference<any,'internal',any,any>>}).sourceAudio;
const takeArgs={projectId:v.id('projects'),takeId:v.id('shotVersions')};
export const measurementContext=internalQuery({args:takeArgs,returns:v.any(),handler:async(ctx,args)=>{if(!sourceAudioEnabled())throw new Error('SOURCE_AUDIO_DISABLED');const found=await editedSourceContext(ctx,args.projectId,args.takeId);if(found.edited.stored.size>50_000_000)throw new Error('SOURCE_AUDIO_VIDEO_SIZE_LIMIT');const url=await ctx.storage.getUrl(found.edited.asset.storageId!);return {url,assetId:found.edited.asset._id,storageId:found.edited.asset.storageId,checksum:found.edited.stored.sha256,byteSize:found.edited.stored.size};}});
export const recordMeasurement=internalMutation({args:{...takeArgs,storageId:v.id('_storage'),checksum:v.string(),byteSize:v.number(),probe:v.any()},returns:v.null(),handler:async(ctx,args)=>{
 const found=await editedSourceContext(ctx,args.projectId,args.takeId),p=record(args.probe),timing=decodedVideoTiming(p.videoTiming);
 if(found.edited.asset.storageId!==args.storageId||found.edited.stored.size!==args.byteSize||!sha256Equal(found.edited.stored.sha256,args.checksum)||!sha256Equal(p.checksum,args.checksum)||p.byteSize!==args.byteSize||p.hasVideo!==true||!Number.isSafeInteger(p.width)||!Number.isSafeInteger(p.height)||p.width<=0||p.height<=0||p.width>7680||p.height>7680||typeof p.videoCodec!=='string'||!p.videoCodec||typeof p.hasAudio!=='boolean')throw new Error('SOURCE_AUDIO_VIDEO_TIMING_REQUIRED');
 const row={projectId:args.projectId,assetId:found.edited.asset._id,storageId:args.storageId,checksum:found.edited.stored.sha256,byteSize:args.byteSize,width:p.width,height:p.height,durationSeconds:timing.durationSeconds,videoCodec:p.videoCodec,hasAudio:p.hasAudio,...(typeof p.audioCodec==='string'?{audioCodec:p.audioCodec}:{}),videoTiming:timing,videoTimingSourceStorageId:args.storageId,videoTimingSourceChecksum:found.edited.stored.sha256,probedAt:Date.now()};
 const prior=await ctx.db.query('verifiedMediaProbes').withIndex('by_asset',q=>q.eq('assetId',found.edited.asset._id)).unique();if(prior)await ctx.db.patch(prior._id,row);else await ctx.db.insert('verifiedMediaProbes',row);return null;
}});
export const measureTake=action({args:takeArgs,returns:v.null(),handler:async(ctx,args)=>{
 const found=await ctx.runQuery(refs.measurementContext,args);const base=process.env.RENDER_WORKER_URL?.trim(),secret=process.env.RENDER_WORKER_SHARED_SECRET?.trim();if(!base||!secret||!found.url)throw new Error('SOURCE_AUDIO_VIDEO_TIMING_UNAVAILABLE');
 const response=await fetch(base.replace(/\/$/,'')+'/media/probe',{method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify({url:found.url,kind:'video',checksum:found.checksum,byteSize:found.byteSize,verifyVideoTiming:true}),redirect:'error',signal:AbortSignal.timeout(70000)});
 if(!response.ok||!response.body)throw new Error('SOURCE_AUDIO_VIDEO_TIMING_UNAVAILABLE');
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>20000)throw new Error('SOURCE_AUDIO_VIDEO_TIMING_UNAVAILABLE');parts.push(part.value);}}finally{await reader.cancel().catch(()=>undefined);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 await ctx.runMutation(refs.recordMeasurement,{...args,storageId:found.storageId,checksum:found.checksum,byteSize:found.byteSize,probe:JSON.parse(new TextDecoder().decode(bytes))});return null;
}});
