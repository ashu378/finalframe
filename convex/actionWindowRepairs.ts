import { internalMutation,internalQuery } from './_generated/server';
import type { QueryCtx,MutationCtx } from './_generated/server';
import type { Id,Doc } from './_generated/dataModel';
import { v } from 'convex/values';
import { assertActionWindow,assertActionWindowProof,isLocalizedActionRepair,ACTION_WINDOW_MAX_BYTES } from '../renderer/src/media/action-window-contract';
import { assertActionRegion,assertActionRegionProof,ACTION_REGION_REPAIR_VERSION } from '../renderer/src/media/action-region-contract';
import { VIDEO_EDIT_BILLING_VERSION } from '../src/lib/ai/video-routing';
import { sha256Equal } from '../renderer/src/media/sha256';
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'?v as Record<string,any>:{};
const args={jobId:v.id('generationJobs'),leaseId:v.string()};
async function scope(ctx:QueryCtx|MutationCtx,input:{jobId:Id<'generationJobs'>;leaseId:string}){
 const job=await ctx.db.get(input.jobId);
 if(!job||job.leaseId!==input.leaseId||!job.leaseExpiresAt||job.leaseExpiresAt<=Date.now())throw new Error('ACTION_WINDOW_LEASE_INVALID');
 const request=object(job.request),repair=object(request.storyRepair),source=object(request.editSource),quote=object(request.editQuote);
 // Accepted jobs use their frozen reviewed certificate, even if administrators
 // subsequently change the preferred model. Never choose another route here.
 let catalog:unknown;try{catalog=JSON.parse(quote.catalogFingerprint);}catch{throw new Error('ACTION_WINDOW_BINDING_CHANGED');}
 if(quote.version!==VIDEO_EDIT_BILLING_VERSION||!Array.isArray(catalog)||catalog[0]!==job.provider||catalog[1]!==job.model||JSON.stringify(quote.source)!==JSON.stringify(source))throw new Error('ACTION_WINDOW_BINDING_CHANGED');
 if(!isLocalizedActionRepair(repair.approachVersion)||repair.sourceAssetId!==source.assetId)throw new Error('ACTION_WINDOW_BINDING_CHANGED');
 const window=assertActionWindow(repair.window),asset=await ctx.db.get(source.assetId as Id<'assets'>),stored=asset?.storageId?await ctx.db.system.get('_storage',asset.storageId):null;
 const region=repair.approachVersion===ACTION_REGION_REPAIR_VERSION?assertActionRegion(repair.region):undefined;
 if(region&&JSON.stringify(region.window)!==JSON.stringify(window))throw new Error('ACTION_WINDOW_BINDING_CHANGED');
 if(!asset||asset.projectId!==job.projectId||asset.scope!=='PROJECT'||!stored||stored.size!==source.byteSize||!sha256Equal(stored.sha256,source.checksum)||asset.storageId!==source.storageId||window.width!==source.width||window.height!==source.height)throw new Error('ACTION_WINDOW_SOURCE_CHANGED');
 return {job,window,region,source:{assetId:asset._id,storageId:asset.storageId!,checksum:stored.sha256,byteSize:stored.size,url:await ctx.storage.getUrl(asset.storageId!)}};
}
export async function requirePreparedActionWindow(ctx:QueryCtx|MutationCtx,job:Doc<'generationJobs'>){
 const receipt=object(object(job.response).actionWindowPrepared),window=assertActionWindow(object(object(job.request).storyRepair).window);
 if(!receipt.storageId)throw new Error('ACTION_WINDOW_PREPARATION_REQUIRED');
 const repair=object(object(job.request).storyRepair);
 if(repair.approachVersion===ACTION_REGION_REPAIR_VERSION)assertActionRegionProof(assertActionRegion(repair.region),receipt.proof,false);else assertActionWindowProof(window,receipt.proof,false);
 const stored=await ctx.db.system.get('_storage',receipt.storageId as Id<'_storage'>);
 if(!stored||stored.size!==receipt.byteSize||!sha256Equal(stored.sha256,receipt.checksum)||stored.contentType!=='video/mp4')throw new Error('ACTION_WINDOW_INPUT_CHANGED');
}
export const context=internalQuery({args,returns:v.any(),handler:async(ctx,input)=>{
 const data=await scope(ctx,input),response=object(data.job.response),receipts:Record<string,unknown>={};
 for(const key of ['actionWindowPrepared','actionWindowRaw','actionWindowComposed']){const row=object(response[key]);if(!row.storageId)continue;const stored=await ctx.db.system.get('_storage',row.storageId as Id<'_storage'>);if(!stored||stored.size!==row.byteSize||!sha256Equal(stored.sha256,row.checksum))throw new Error('ACTION_WINDOW_OUTPUT_CHANGED');receipts[key]={...row,url:await ctx.storage.getUrl(row.storageId as Id<'_storage'>)};}
 return {window:data.window,source:data.source,...(data.region?{region:data.region}:{}),...(data.job.provider==='openrouter'&&data.job.model==='black-forest-labs/flux-video-edit'?{trailingFramePolicy:'DROP_ONE_PROVIDER_TRAILING_FRAME'}:{}),...receipts};
}});
export const record=internalMutation({args:{...args,phase:v.union(v.literal('PREPARED'),v.literal('RAW'),v.literal('COMPOSED')),storageId:v.id('_storage'),proof:v.optional(v.any())},returns:v.null(),handler:async(ctx,input)=>{
 const {job,window,region}=await scope(ctx,input),response=object(job.response),key={PREPARED:'actionWindowPrepared',RAW:'actionWindowRaw',COMPOSED:'actionWindowComposed'}[input.phase],old=object(response[key]);
 if(old.storageId){if(old.storageId!==input.storageId)throw new Error('ACTION_WINDOW_OUTPUT_CONFLICT');return null;}
 if(input.phase==='PREPARED'&&(job.submissionStartedAt||job.providerJobId)||input.phase!=='PREPARED'&&(!job.providerJobId||!response.actionWindowPrepared)||input.phase==='COMPOSED'&&!response.actionWindowRaw)throw new Error('ACTION_WINDOW_STAGE_INVALID');
 const stored=await ctx.db.system.get('_storage',input.storageId);if(!stored||stored.contentType!=='video/mp4'||stored.size<1||stored.size>ACTION_WINDOW_MAX_BYTES)throw new Error('ACTION_WINDOW_OUTPUT_LIMIT');
 if(input.phase!=='RAW'){const proof=region?assertActionRegionProof(region,input.proof,input.phase==='COMPOSED'):assertActionWindowProof(window,input.proof,input.phase==='COMPOSED');if(input.phase==='COMPOSED'&&proof.trimmedTrailingFrames===1&&(job.provider!=='openrouter'||job.model!=='black-forest-labs/flux-video-edit'))throw new Error('ACTION_WINDOW_BINDING_CHANGED');if(!sha256Equal(stored.sha256,proof.checksum)||stored.size!==proof.byteSize||input.phase==='COMPOSED'&&object(object(job.request).editSource).hasAudio===true&&proof.originalAudioCopied!==true)throw new Error('ACTION_WINDOW_OUTPUT_CHANGED');}
 const receipt={storageId:input.storageId,checksum:stored.sha256,byteSize:stored.size,...(input.phase!=='RAW'?{proof:input.proof}:{}),recordedAt:Date.now()};
 await ctx.db.patch(job._id,{response:{...response,[key]:receipt},updatedAt:Date.now()});
 await ctx.db.insert('audit',{studioExternalId:job.studioExternalId,studioId:job.studioId,actorExternalId:'internal-action-window-worker',action:`ACTION_WINDOW_${input.phase}`,entityType:'generationJob',entityId:job._id,metadata:{storageId:input.storageId,sourceAssetId:object(object(job.request).storyRepair).sourceAssetId,window,checksum:stored.sha256,byteSize:stored.size},createdAt:Date.now()});return null;
}});
