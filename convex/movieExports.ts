import {mutation,query,internalMutation} from './_generated/server';
import type {Id,Doc} from './_generated/dataModel';
import type {FunctionReference} from 'convex/server';
import {internal} from './_generated/api';
import {v} from 'convex/values';
import {normalizeSha256,sha256Equal} from '../renderer/src/media/sha256';
import {requireProjectAccess,requireProjectRole} from './authorization';
import {composeMovie,planMovieExport,movieHash,type MovieExportPlan,type MovieSelection} from '../renderer/src/movie/contracts';
import {movieActor,movieEnabled,movieReference,movieResourceState,movieVersionContext,movieWorkerEnabled,authorizeMovieRenderContext,assertCurrentMovieSources,requiredMovieMediaAbi} from './movieAuthority';
import {movieKey} from './movies';
import {createCanonicalRenderJob} from './renderJobs';
import {serializeCaptionSidecars} from '../renderer/src/captions';
import {validateLockedManifest} from '../renderer/src/manifest';
import type {RenderManifest} from '../renderer/src/types';
import {finishingRetryEligibility} from '../src/lib/render/recovery';
export const movieSelectionValidator=v.object({scope:v.union(v.literal('MOVIE'),v.literal('CHAPTERS'),v.literal('SCENES'),v.literal('SHOTS')),chapterIds:v.optional(v.array(v.string())),occurrences:v.optional(v.array(v.object({componentId:v.id('movieComponents'),sceneId:v.optional(v.id('scenes')),shotVersionId:v.optional(v.id('shotVersions'))})))});
const refs=(internal as unknown as {movieExports:Record<string,FunctionReference<any,'internal',any,any>>;movieMergeJobs:Record<string,FunctionReference<any,'internal',any,any>>});
export async function movieExportPlan(ctx:import('./movieAuthority').MovieReadCtx,versionId:Id<'movieVersions'>,selection:MovieSelection,acceptedPrivate=false){const privateVersion=acceptedPrivate?await ctx.db.get(versionId):null;const privateMovie=privateVersion?await ctx.db.get(privateVersion.movieId):null;const {version,movie}=acceptedPrivate&&privateVersion&&privateMovie&&privateMovie.projectId===privateVersion.projectId?{version:privateVersion,movie:privateMovie}:await movieVersionContext(ctx,versionId);if(version.state!=='READY'||!version.contentHash||!version.durationInFrames)throw new Error('Validate this movie composition first.');const rows=await ctx.db.query('movieComponents').withIndex('by_version_order',q=>q.eq('movieVersionId',versionId)).take(129);const components=rows.map(movieReference);const header=await composeMovie({projectId:version.projectId,movieVersionId:versionId,output:version.output,components});if(header.contentHash!==version.contentHash||header.durationInFrames!==version.durationInFrames)throw new Error('Movie component identity changed.');return {version,movie,rows,components,plan:await planMovieExport(header,components,selection)};}
export async function assertMovieExportExposure(ctx:import('./movieAuthority').MovieReadCtx,output:Doc<'movieExports'>){const abi=requiredMovieMediaAbi();if(output.mediaAbi!==abi)throw new Error('MOVIE_MEDIA_ABI_OBSOLETE');const context=await movieExportPlan(ctx,output.movieVersionId,output.selection);if(context.plan.planHash!==output.planHash)throw new Error('Movie export identity changed.');await movieResourceState(ctx,output.projectId,'movieVersion',context.version._id,true);await assertCurrentMovieSources(ctx,context.version,context.components);return context;}
export async function authorizedMovieExport(ctx:import('./movieAuthority').MovieReadCtx,id:Id<'movieExports'>,write=false){const output=await ctx.db.get(id);if(!output)throw new Error('Movie export unavailable.');const access=write?await requireProjectRole(ctx,output.projectId,['OWNER','EDITOR']):await requireProjectAccess(ctx,output.projectId);await movieVersionContext(ctx,output.movieVersionId);return {output,access};}
export const preview=query({args:{movieVersionId:v.id('movieVersions'),selection:movieSelectionValidator},returns:v.any(),handler:async(ctx,args)=>{const {version}=await movieVersionContext(ctx,args.movieVersionId);await requireProjectAccess(ctx,version.projectId);return (await movieExportPlan(ctx,args.movieVersionId,args.selection)).plan;}});
async function schedule(ctx:import('./_generated/server').MutationCtx,id:Id<'movieExports'>,delay=0){if(movieEnabled()&&movieWorkerEnabled())await ctx.scheduler.runAfter(delay,refs.movieExports.advance,{movieExportId:id});}
export const request=mutation({args:{movieVersionId:v.id('movieVersions'),selection:movieSelectionValidator,purpose:v.union(v.literal('REVIEW'),v.literal('DELIVERY')),approvedReviewId:v.optional(v.id('movieReviews')),expectedPlanHash:v.string(),idempotencyKey:v.string()},returns:v.object({movieExportId:v.id('movieExports'),replayed:v.boolean()}),handler:async(ctx,args)=>{
  if(!movieEnabled())throw new Error('Movie exports are not enabled yet.');const scope=await movieVersionContext(ctx,args.movieVersionId);const access=await requireProjectRole(ctx,scope.version.projectId,['OWNER','EDITOR']);await movieVersionContext(ctx,args.movieVersionId,access.user._id,true);const context=await movieExportPlan(ctx,args.movieVersionId,args.selection);const {version,plan}=context;const mediaAbi=requiredMovieMediaAbi();if(plan.planHash!==args.expectedPlanHash)throw new Error('The movie selection plan changed. Preview it again.');const key=movieKey(args.idempotencyKey);const requestHash=await movieHash({movieVersionId:version._id,selection:args.selection,purpose:args.purpose,approvedReviewId:args.approvedReviewId??null,planHash:plan.planHash});
  const previous=await ctx.db.query('movieExports').withIndex('by_idempotency',q=>q.eq('idempotencyKey',key)).unique();if(previous){if(previous.projectId!==version.projectId||previous.movieVersionId!==version._id||previous.requestedByUserId!==access.user._id||previous.requestHash!==requestHash)throw new Error('Movie export key belongs to another request or user.');return {movieExportId:previous._id,replayed:true};}
  let delivery:Doc<'movieExports'>|null=null;
  if(args.purpose==='DELIVERY'){const review=args.approvedReviewId?await ctx.db.get(args.approvedReviewId):null;if(!review||review.projectId!==version.projectId||review.movieVersionId!==version._id||review.planHash!==plan.planHash)throw new Error('Delivery requires an approved review of this exact movie selection.');await movieResourceState(ctx,version.projectId,'movieReview',review._id);delivery=await ctx.db.get(review.movieExportId);if(delivery)await assertMovieExportExposure(ctx,delivery);if(!delivery||delivery.status!=='COMPLETED'||delivery.planHash!==plan.planHash||!delivery.storageId||!delivery.checksum||!delivery.verification)throw new Error('The approved review artifact is unavailable.');const storage=await ctx.db.system.get('_storage',delivery.storageId);if(!storage||!sha256Equal(storage.sha256,delivery.checksum)||storage.size!==delivery.byteSize)throw new Error('The approved review bytes changed.');}
  const timestamp=Date.now();const movieExportId=await ctx.db.insert('movieExports',{projectId:version.projectId,movieVersionId:version._id,requestedByUserId:access.user._id,idempotencyKey:key,requestHash,purpose:args.purpose,mediaAbi,...(args.approvedReviewId?{approvedReviewId:args.approvedReviewId}:{}),selection:args.selection,outputHash:await movieHash(plan.output),planHash:plan.planHash,partCount:plan.parts.length,readyPartCount:0,durationInFrames:plan.durationInFrames,status:'QUEUED',...(delivery?{storageId:delivery.storageId!,checksum:delivery.checksum!,byteSize:delivery.byteSize!,verification:delivery.verification!}:{}),createdAt:timestamp,updatedAt:timestamp});
  const original=delivery?await ctx.db.query('movieExportParts').withIndex('by_export_order',q=>q.eq('movieExportId',delivery!._id)).take(257):[];
  for(const [orderIndex,part]of plan.parts.entries()){const copy=original[orderIndex];if(delivery&&(!copy||copy.componentId!==part.componentId||copy.sourceStartFrame!==part.sourceStartFrame||copy.durationInFrames!==part.durationInFrames||copy.outputStartFrame!==part.outputStartFrame||copy.status!=='READY'))throw new Error('The reviewed movie part plan changed.');await ctx.db.insert('movieExportParts',{projectId:version.projectId,movieExportId,componentId:part.componentId as Id<'movieComponents'>,orderIndex,sourceStartFrame:part.sourceStartFrame,durationInFrames:part.durationInFrames,outputStartFrame:part.outputStartFrame,sourceManifestSha256:part.sourceManifestSha256,status:'WAITING_RENDER',reused:Boolean(delivery),...(copy?{renderJobId:copy.renderJobId,exportId:copy.exportId,storageId:copy.storageId,checksum:copy.checksum,byteSize:copy.byteSize,verification:copy.verification}:{}),createdAt:timestamp,updatedAt:timestamp});}
  await schedule(ctx,movieExportId);return {movieExportId,replayed:false};
}});
export const advance=internalMutation({args:{movieExportId:v.id('movieExports')},returns:v.null(),handler:async(ctx,args)=>{
  if(!movieEnabled()||!movieWorkerEnabled())return null;const output=await ctx.db.get(args.movieExportId);if(!output||!['QUEUED','RENDERING_COMPONENTS'].includes(output.status))return null;
  try{const mediaAbi=requiredMovieMediaAbi();if(output.mediaAbi!==mediaAbi)throw new Error('MOVIE_MEDIA_ABI_OBSOLETE');await movieVersionContext(ctx,output.movieVersionId,output.requestedByUserId,true);const parts=await ctx.db.query('movieExportParts').withIndex('by_export_order',q=>q.eq('movieExportId',output._id)).take(257);if(parts.length!==output.partCount||parts.length>256)throw new Error('Movie part count changed.');const part=parts.find(candidate=>candidate.status!=='READY');
    if(!part){
      if(output.purpose==='DELIVERY'){const review=output.approvedReviewId?await ctx.db.get(output.approvedReviewId):null;if(!review||review.projectId!==output.projectId||review.movieVersionId!==output.movieVersionId||review.planHash!==output.planHash)throw new Error('Delivery review identity changed.');await movieResourceState(ctx,output.projectId,'movieReview',review._id);const original=await ctx.db.get(review.movieExportId);if(original)await assertMovieExportExposure(ctx,original);const storage=original?.storageId?await ctx.db.system.get('_storage',original.storageId):null;if(!original||original.status!=='COMPLETED'||original.planHash!==output.planHash||!original.verification||!storage||!sha256Equal(storage.sha256,original.checksum)||storage.size!==original.byteSize)throw new Error('Reviewed artifact bytes changed.');await ctx.db.patch(output._id,{status:'COMPLETED',storageId:original.storageId,checksum:original.checksum,byteSize:original.byteSize,verification:original.verification,readyPartCount:parts.length,completedAt:Date.now(),updatedAt:Date.now()});return null;}
      let job=output.mergeJobId?await ctx.db.get(output.mergeJobId):await ctx.db.query('movieMergeJobs').withIndex('by_export',q=>q.eq('movieExportId',output._id)).unique();if(!job){const timestamp=Date.now();const id=await ctx.db.insert('movieMergeJobs',{projectId:output.projectId,movieVersionId:output.movieVersionId,movieExportId:output._id,planHash:output.planHash,idempotencyKey:'movie-merge:'+output._id,requestHash:await movieHash({movieExportId:output._id,planHash:output.planHash,mediaAbi}),mediaAbi,createdByUserId:output.requestedByUserId,status:'QUEUED',executionStage:'QUEUED',progress:0,attempt:0,dispatchRetryCount:0,createdAt:timestamp,updatedAt:timestamp});job=await ctx.db.get(id);}await ctx.db.patch(output._id,{status:'MERGING',mergeJobId:job!._id,readyPartCount:parts.length,updatedAt:Date.now()});await ctx.scheduler.runAfter(0,refs.movieMergeJobs.run,{jobId:job!._id});return null;}
    if(part.status!=='WAITING_RENDER')throw new Error('A movie component requires explicit retry.');const component=await ctx.db.get(part.componentId);if(!component||component.sourceManifestSha256!==part.sourceManifestSha256)throw new Error('Movie source identity changed.');await authorizeMovieRenderContext(ctx,{componentId:component._id,projectId:output.projectId,productionId:component.productionId,manifestId:component.manifestId,actorId:output.requestedByUserId});
    let job=part.renderJobId?await ctx.db.get(part.renderJobId):null;
    if(!job){const key='movie-component:'+await movieHash({projectId:output.projectId,manifestId:component.manifestId,sourceManifestSha256:component.sourceManifestSha256,mediaAbi});job=await ctx.db.query('renderJobs').withIndex('by_idempotency',q=>q.eq('idempotencyKey',key)).unique();if(!job){const candidates=await ctx.db.query('renderJobs').withIndex('by_production',q=>q.eq('productionId',component.productionId)).order('desc').take(201);job=candidates.find(candidate=>candidate.status==='COMPLETED'&&candidate.projectId===output.projectId&&candidate.manifestId===component.manifestId&&candidate.providerJobId===mediaAbi)??null;}
      if(!job){const created=await createCanonicalRenderJob(ctx,{productionId:component.productionId,manifestId:component.manifestId,timelineId:component.timelineId,movieComponentId:component._id,operation:'MOVIE_COMPONENT',preset:'CANONICAL_MOVIE_COMPONENT',idempotencyKey:key},output.requestedByUserId);job=await ctx.db.get(created._id);}if(!job)throw new Error('Movie component render was not created.');await ctx.db.patch(part._id,{renderJobId:job._id,reused:job.status==='COMPLETED',updatedAt:Date.now()});}
    if(job.projectId!==output.projectId||job.productionId!==component.productionId||job.manifestId!==component.manifestId)throw new Error('Movie component render belongs to another source.');
    if(job.status==='COMPLETED'){if(job.providerJobId!==mediaAbi)throw new Error('MOVIE_MEDIA_ABI_OBSOLETE');const exports=await ctx.db.query('exports').withIndex('by_render_job',q=>q.eq('renderJobId',job!._id)).take(101);const artifact=exports.find(row=>row.status==='COMPLETED'&&row.projectId===output.projectId&&row.manifestId===component.manifestId&&row.storageId);const storage=artifact?.storageId?await ctx.db.system.get('_storage',artifact.storageId):null;if(!artifact||!storage||!storage.contentType?.startsWith('video/')||storage.size<1||storage.size>2_000_000_000||!normalizeSha256(storage.sha256)||artifact.checksum&&!sha256Equal(artifact.checksum,storage.sha256))throw new Error('Verified movie component storage is unavailable.');await ctx.db.patch(part._id,{status:'READY',exportId:artifact._id,storageId:artifact.storageId,checksum:storage.sha256,byteSize:storage.size,updatedAt:Date.now()});await ctx.db.patch(output._id,{status:'RENDERING_COMPONENTS',readyPartCount:parts.filter(row=>row.status==='READY').length+1,updatedAt:Date.now()});await schedule(ctx,output._id);return null;}
    if(['FAILED','CANCELED'].includes(job.status)){await ctx.db.patch(part._id,{status:'FAILED',errorCode:'MOVIE_COMPONENT_RENDER_FAILED',updatedAt:Date.now()});throw new Error('Movie component render failed.');}if(['RECONCILIATION_REQUIRED','NEEDS_ATTENTION'].includes(job.executionStage??'')){await ctx.db.patch(output._id,{status:'NEEDS_ATTENTION',errorCode:'MOVIE_COMPONENT_RECONCILIATION',updatedAt:Date.now()});return null;}await ctx.db.patch(output._id,{status:'RENDERING_COMPONENTS',updatedAt:Date.now()});await schedule(ctx,output._id,30_000);
  }catch{await ctx.db.patch(output._id,{status:'FAILED',errorCode:'MOVIE_SOURCE_OR_COMPONENT_UNAVAILABLE',updatedAt:Date.now()});}return null;
}});
function publicArtifact<T extends Record<string,any>>(value:T){const {storageId:_storage,checksum:_checksum,verification:_verification,...safe}=value;void _storage;void _checksum;void _verification;return safe;}
function isMovieRetryStatus(output: Doc<'movieExports'>) {
  return output.status === 'FAILED' || output.status === 'CANCELED';
}

function mergeRetryBlock(output: Doc<'movieExports'>, job: Doc<'movieMergeJobs'> | null) {
  if (!isMovieRetryStatus(output)) return 'Retry only failed or canceled movie work.';
  if (!output.mergeJobId) return null;
  if (!job || job.movieExportId !== output._id || job.projectId !== output.projectId || job.movieVersionId !== output.movieVersionId) {
    return 'The saved movie merge needs an administrator check before retrying.';
  }
  // The worker may have accepted a dispatch even if its acknowledgement was lost.
  if (job.acceptedAt !== undefined || job.dispatchPayload !== undefined || job.leaseId !== undefined ||
      job.dispatchLeaseId !== undefined || ['AWAITING_CALLBACK', 'RECONCILIATION_REQUIRED', 'NEEDS_ATTENTION'].includes(job.executionStage)) {
    return 'The previous merge handoff needs recovery review before another attempt.';
  }
  if (job.attempt >= 3 || !['FAILED', 'CANCELED'].includes(job.status)) {
    return 'The saved movie merge needs an administrator check before retrying.';
  }
  return null;
}

async function retryComponents(ctx: import('./movieAuthority').MovieReadCtx, output: Doc<'movieExports'>, parts: Doc<'movieExportParts'>[]) {
  const jobIds = new Set<Id<'renderJobs'>>();
  for (const part of parts) {
    if (part.status === 'READY' || !part.renderJobId) continue;
    const job = await ctx.db.get(part.renderJobId);
    if (!job || job.projectId !== output.projectId) {
      return {jobIds, reason: 'A saved component needs an administrator check before retrying.'};
    }
    if (job.status === 'CANCELED' || ['RECONCILIATION_REQUIRED', 'NEEDS_ATTENTION'].includes(job.executionStage ?? '')) {
      return {jobIds, reason: 'A saved component needs recovery review before another attempt.'};
    }
    if (job.status !== 'FAILED' && job.status !== 'RETRYING') continue;
    const eligibility = finishingRetryEligibility(job);
    if (!eligibility.eligible) return {jobIds, reason: eligibility.reason};
    jobIds.add(job._id);
  }
  return {jobIds, reason: null};
}

function retryAvailability(project: Doc<'projects'>) {
  if (!movieEnabled()) return 'Movie exports are currently disabled.';
  if (!movieWorkerEnabled()) return 'Movie finishing is temporarily unavailable. Saved components are retained.';
  if (project.archivedAt || project.status === 'ARCHIVED') return 'Restore this project before retrying the movie export.';
  return null;
}

export const get=query({args:{movieExportId:v.id('movieExports')},returns:v.any(),handler:async(ctx,args)=>{const {output,access}=await authorizedMovieExport(ctx,args.movieExportId);const parts=await ctx.db.query('movieExportParts').withIndex('by_export_order',q=>q.eq('movieExportId',output._id)).take(257);const storage=output.storageId&&output.status==='COMPLETED'?await ctx.db.system.get('_storage',output.storageId):null;let downloadUrl:string|null=null;let unavailableReason:string|undefined;if(storage&&sha256Equal(storage.sha256,output.checksum)&&storage.size===output.byteSize){try{await assertMovieExportExposure(ctx,output);downloadUrl=await ctx.storage.getUrl(output.storageId!);}catch{unavailableReason='Current source approvals, bytes or renderer compatibility need verification.';}}
  const canEdit = ['OWNER', 'EDITOR'].includes(access.projectRole);
  const canRequestRetry = canEdit && isMovieRetryStatus(output);
  const retryReason = canRequestRetry
    ? retryAvailability(access.project)
      ?? mergeRetryBlock(output, output.mergeJobId ? await ctx.db.get(output.mergeJobId) : null)
      ?? (await retryComponents(ctx, output, parts)).reason
    : null;
  return {output:publicArtifact(output),parts:parts.map(publicArtifact),downloadUrl,...(unavailableReason?{unavailableReason}:{}),enabled:movieEnabled(),workerEnabled:movieWorkerEnabled(),canEdit,canRetry:canRequestRetry&&retryReason===null,retryReason};
}});
export const list=query({args:{movieVersionId:v.id('movieVersions')},returns:v.any(),handler:async(ctx,args)=>{const {version}=await movieVersionContext(ctx,args.movieVersionId);await requireProjectAccess(ctx,version.projectId);return (await ctx.db.query('movieExports').withIndex('by_version',q=>q.eq('movieVersionId',version._id)).order('desc').take(30)).map(publicArtifact);}});
export const cancel=mutation({args:{movieExportId:v.id('movieExports')},returns:v.null(),handler:async(ctx,args)=>{const {output}=await authorizedMovieExport(ctx,args.movieExportId,true);if(['COMPLETED','CANCELED'].includes(output.status))return null;await ctx.db.patch(output._id,{status:'CANCELED',canceledAt:Date.now(),updatedAt:Date.now()});if(output.mergeJobId){const job=await ctx.db.get(output.mergeJobId);if(job&&!['COMPLETED','CANCELED'].includes(job.status))await ctx.db.patch(job._id,{status:'CANCELED',executionStage:'CANCELED',updatedAt:Date.now()});}return null;}});
export const retry=mutation({args:{movieExportId:v.id('movieExports')},returns:v.null(),handler:async(ctx,args)=>{
  const {output,access}=await authorizedMovieExport(ctx,args.movieExportId,true);
  const unavailable = retryAvailability(access.project);
  if (unavailable) throw new Error(unavailable);
  await movieVersionContext(ctx,output.movieVersionId,access.user._id,true);
  const mergeJob = output.mergeJobId ? await ctx.db.get(output.mergeJobId) : null;
  const blocked = mergeRetryBlock(output, mergeJob);
  if (blocked) throw new Error(blocked);
  const parts = await ctx.db.query('movieExportParts').withIndex('by_export_order',q=>q.eq('movieExportId',output._id)).take(257);
  const components = await retryComponents(ctx, output, parts);
  if (components.reason) throw new Error(components.reason);
  if (mergeJob) await ctx.db.patch(mergeJob._id, {
    status: 'QUEUED', executionStage: 'QUEUED', createdByUserId: access.user._id,
    progress: 0, leaseExpiresAt: undefined, dispatchLeaseExpiresAt: undefined,
    nextDispatchAt: undefined, dispatchRetryCount: 0, callbackIdempotencyKey: undefined,
    errorCode: undefined, updatedAt: Date.now(),
  });
  for (const part of parts) {
    if (part.status === 'READY') continue;
    const jobId = part.renderJobId;
    if (jobId && components.jobIds.delete(jobId)) {
      const component = await ctx.db.get(part.componentId);
      if (!component) throw new Error('Component unavailable.');
      await authorizeMovieRenderContext(ctx,{componentId:component._id,projectId:output.projectId,productionId:component.productionId,manifestId:component.manifestId,actorId:access.user._id});
      await ctx.db.patch(jobId,{status:'QUEUED',createdByUserId:access.user._id,executionStage:'QUEUED',dispatchLeaseId:undefined,dispatchLeaseExpiresAt:undefined,nextDispatchAt:undefined,leaseExpiresAt:undefined,errorCode:undefined,updatedAt:Date.now()});
      await ctx.scheduler.runAfter(0,(internal as any).renderJobs.dispatch,{jobId});
    }
    await ctx.db.patch(part._id,{status:'WAITING_RENDER',errorCode:undefined,updatedAt:Date.now()});
  }
  await ctx.db.patch(output._id,{status:output.mergeJobId?'MERGING':'QUEUED',requestedByUserId:access.user._id,errorCode:undefined,canceledAt:undefined,updatedAt:Date.now()});if(output.mergeJobId)await ctx.scheduler.runAfter(0,refs.movieMergeJobs.run,{jobId:output.mergeJobId});else await schedule(ctx,output._id);return null;
}});
export const wakePending=internalMutation({args:{},returns:v.number(),handler:async(ctx)=>{if(!movieEnabled()||!movieWorkerEnabled())return 0;let count=0;for(const status of ['QUEUED','RENDERING_COMPONENTS'] as const){const rows=await ctx.db.query('movieExports').withIndex('by_status',q=>q.eq('status',status)).take(25);for(const row of rows){await schedule(ctx,row._id);count++;}}return count;}});
/** One bounded part per read. Filenames retain occurrence/track identity;
 * overlapping same-language tracks are never flattened into ambiguous SRT. */
export const captionSidecars=query({args:{movieExportId:v.id('movieExports'),partIndex:v.number()},returns:v.array(v.object({partId:v.id('movieExportParts'),partIndex:v.number(),componentId:v.id('movieComponents'),trackId:v.string(),language:v.string(),srt:v.string(),vtt:v.string()})),handler:async(ctx,args)=>{
  const {output}=await authorizedMovieExport(ctx,args.movieExportId);await assertMovieExportExposure(ctx,output);if(output.status!=='COMPLETED'||!output.storageId||!output.checksum||!output.verification||!Number.isSafeInteger(args.partIndex)||args.partIndex<0||args.partIndex>=output.partCount)throw new Error('Choose a completed movie export and an exact component part.');const storage=await ctx.db.system.get('_storage',output.storageId);if(!storage||!sha256Equal(storage.sha256,output.checksum)||storage.size!==output.byteSize)throw new Error('Movie caption artifact unavailable.');const part=await ctx.db.query('movieExportParts').withIndex('by_export_order',q=>q.eq('movieExportId',output._id).eq('orderIndex',args.partIndex)).unique();const component=part?await ctx.db.get(part.componentId):null;const stored=component?await ctx.db.get(component.manifestId):null;if(!part||part.status!=='READY'||!component||component.movieVersionId!==output.movieVersionId||component.projectId!==output.projectId||!stored||stored.projectId!==output.projectId||stored.productionId!==component.productionId||stored.contractVersion!==5)throw new Error('Movie caption source identity is unavailable.');const raw=stored.manifest as RenderManifest;if(!validateLockedManifest(raw).ok||raw.version!==5||raw.projectId!==output.projectId||raw.productionId!==component.productionId||raw.productionVersionId!==component.productionVersionId||raw.timelineId!==component.timelineId||raw.manifestId!==stored._id||await movieHash(raw)!==part.sourceManifestSha256)throw new Error('Movie caption manifest changed.');const end=part.sourceStartFrame+part.durationInFrames;return (raw.captionTracks??[]).flatMap(track=>{const cues=track.cues.flatMap(cue=>{const start=Math.max(cue.startFrame,part.sourceStartFrame),last=Math.min(cue.startFrame+cue.durationInFrames,end);return last>start?[{...cue,id:part._id+':'+cue.id,startFrame:part.outputStartFrame+start-part.sourceStartFrame,durationInFrames:last-start}]:[];});return cues.length?[{partId:part._id,partIndex:part.orderIndex,componentId:part.componentId,trackId:track.id,language:track.language,...serializeCaptionSidecars({...track,cues},raw.output.fps)}]:[];});
}});
