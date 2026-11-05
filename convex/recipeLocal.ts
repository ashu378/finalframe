import type {MutationCtx} from './_generated/server';
import type {Doc,Id} from './_generated/dataModel';
import {recipeHash} from '../src/lib/production/recipes/compiler';
import {recipeObject,canonicalRecipeAsset,approvedRecipeResource} from './recipeAuthority';
import {recipeSourceNode,recipeNodeScope} from './recipePlanning';
import {mutation} from './_generated/server';
import {v} from 'convex/values';
import {requireProjectRole} from './authorization';
import {ensureResourceState,getEffectiveResourceState} from './resourceStates';
import {transitionResourceState} from './approvals';
import {createCanonicalTimelineDraft} from './timeline';
import {createCanonicalAssembly} from './assembly';
import {requestCanonicalReview,requestCanonicalExport} from './reviewExport';
import {requestCanonicalBeatAnalysis,validateBeatVersionForApproval} from './beatAnalysis';
import {normalizeCaptionTrack} from './finishingContracts';
import type {RecipeDocument} from '../src/lib/production/recipes/contract';
import {resolveFrozenVoiceSynthesisInput} from './voices';
export async function completeRecipeNode(ctx:MutationCtx,node:Doc<'recipeRunNodes'>,id:string,value:unknown){await ctx.db.patch(node._id,{status:'COMPLETED',resultId:id,resultHash:await recipeHash(value),leaseId:undefined,leaseExpiresAt:undefined,errorCode:undefined,updatedAt:Date.now()});}
function normalizeDialogueCues(input:Record<string,unknown>,durationSeconds:number,fps:number,id:string){try{return normalizeCaptionTrack(input,durationSeconds,fps,id);}catch{throw new Error('RECIPE_DIALOGUE_CAPTION_REVIEW_REQUIRED');}}
async function plannedDialogueCaptions(ctx:MutationCtx,node:Doc<'recipeRunNodes'>,run:Doc<'recipeRuns'>) {
 const r=recipeObject(node.request),recipe=run.boundRecipe as RecipeDocument;
 if(node.runId!==run._id||node.projectId!==run.projectId||node.productionVersionId!==run.productionVersionId||!Array.isArray(r.dialogueTracks)||!r.dialogueTracks.length||r.dialogueTracks.length>32||!Array.isArray(r.visualOrder)||r.visualOrder.length>64||r.fps!==recipe.fps)throw new Error('RECIPE_DIALOGUE_BINDING_CHANGED');
 const picture=await ctx.db.query('recipeRunNodes').withIndex('by_run_node',q=>q.eq('runId',run._id).eq('nodeId','timeline')).unique();
 if(!picture||JSON.stringify(recipeObject(picture.request).visualOrder)!==JSON.stringify(r.visualOrder)||recipeObject(picture.request).durationFrames!==r.durationFrames)throw new Error('RECIPE_DIALOGUE_BINDING_CHANGED');
 const visuals=new Map<string,{shot:Doc<'shots'>;take:Doc<'shotVersions'>;startFrame:number}>();let elapsed=0;
 for(const key of r.visualOrder){
  const visual=await recipeSourceNode(ctx,node,key),vr=recipeObject(visual.request);
  if(visual.projectId!==run.projectId||visual.productionVersionId!==run.productionVersionId)throw new Error('RECIPE_DIALOGUE_BINDING_CHANGED');
  if(visual.operation==='GENERATION'){
   const takeId=ctx.db.normalizeId('shotVersions',visual.resultId!),take=takeId?await ctx.db.get(takeId):null;
   const shot=take?await ctx.db.get(take.shotId):null;
   if(!take||!shot||take.projectId!==run.projectId||take.productionId!==run.productionId||take.productionVersionId!==run.productionVersionId||take.status!=='COMPLETED'||!take.assetId||shot.projectId!==run.projectId||shot.productionVersionId!==run.productionVersionId||shot.productionId!==run.productionId||recipeObject(vr.shot).id!==shot._id)throw new Error('RECIPE_DIALOGUE_BINDING_CHANGED');
   await approvedRecipeResource(ctx,run.projectId,'shotVersion',take._id);await canonicalRecipeAsset(ctx,run.projectId,take.assetId);
   visuals.set(key,{shot,take,startFrame:elapsed});elapsed+=Math.round(shot.durationSeconds*recipe.fps);
  }else if(visual.operation==='GRAPHIC'||visual.operation==='SOURCE_RANGE')elapsed+=Number(vr.durationFrames);
  else throw new Error('RECIPE_DIALOGUE_BINDING_CHANGED');
 }
 if(!Number.isSafeInteger(elapsed)||elapsed<=0||elapsed>60*recipe.fps||elapsed!==r.durationFrames)throw new Error('RECIPE_DIALOGUE_TIMING_REVIEW_REQUIRED');
 const cues:Array<{id:string;startFrame:number;durationInFrames:number;text:string;source:Record<string,unknown>}>=[],seen=new Set<string>();
 for(const raw of r.dialogueTracks){
  const track=recipeObject(raw),visual=visuals.get(track.visualStepKey);const segments=recipeObject(visual?.shot.metadata).dialogueSegments;
  const segment=Array.isArray(segments)&&Number.isSafeInteger(track.segmentIndex)?recipeObject(segments[track.segmentIndex]):{};
  if(!visual||visual.shot._id!==track.shotId||segment.text!==track.text||segment.voiceVersionId!==track.voiceVersionId||segment.speakerResourceVersionId!==track.speakerResourceVersionId||segment.durationSeconds!==track.durationSeconds||!Number.isFinite(segment.startSeconds)||segment.startSeconds<0||!Number.isFinite(segment.durationSeconds)||segment.durationSeconds<=0||Math.abs(visual.startFrame/recipe.fps+Number(segment.startSeconds)-Number(track.startSeconds))>0.000001||seen.has(track.stepKey))throw new Error('RECIPE_DIALOGUE_BINDING_CHANGED');
  seen.add(track.stepKey);
  const source=await recipeSourceNode(ctx,node,track.stepKey),sr=recipeObject(source.request),id=ctx.db.normalizeId('assets',source.resultId!);
  if(!id||source.projectId!==run.projectId||source.productionVersionId!==run.productionVersionId||source.operation!=='NARRATION'||sr.mode!=='GENERATE'||sr.voiceVersionId!==track.voiceVersionId||sr.text!==track.text||source.voiceVersionId&&source.voiceVersionId!==track.voiceVersionId)throw new Error('RECIPE_DIALOGUE_BINDING_CHANGED');
  const job=source.linkedGenerationJobId?await ctx.db.get(source.linkedGenerationJobId):null,jr=recipeObject(job?.request);
  if(!job||job.projectId!==run.projectId||job.productionId!==run.productionId||job.status!=='COMPLETED'||job.operation!=='PREPARATION'||jr.preparationKind!=='NARRATION'||jr.voiceVersionId!==track.voiceVersionId||jr.text!==track.text||recipeObject(job.response).assetId!==id)throw new Error('RECIPE_DIALOGUE_BINDING_CHANGED');
  const voiceId=ctx.db.normalizeId('voices',sr.voiceId),voiceVersionId=ctx.db.normalizeId('voiceVersions',track.voiceVersionId);
  if(!voiceId||!voiceVersionId||jr.targetVoiceId!==voiceId)throw new Error('RECIPE_DIALOGUE_BINDING_CHANGED');
  await resolveFrozenVoiceSynthesisInput(ctx,{projectId:run.projectId,voiceId,voiceVersionId,use:'SYNTHESIZE',...(sr.primaryVoiceSampleAssetId?{primaryVoiceSampleAssetId:sr.primaryVoiceSampleAssetId}:{})});
  const found=await canonicalRecipeAsset(ctx,run.projectId,id),measured=found.canonical.durationSeconds;
  if(!found.canonical.mimeType.startsWith('audio/')||!Number.isFinite(measured)||measured!<=0||!Number.isFinite(track.startSeconds)||track.startSeconds<0||!Number.isFinite(track.durationSeconds)||track.durationSeconds<=0||measured!>track.durationSeconds+0.000001||track.startSeconds+measured!>(visual.startFrame/recipe.fps+visual.shot.durationSeconds)+0.000001||track.startSeconds+measured!>elapsed/recipe.fps+0.000001)throw new Error('RECIPE_DIALOGUE_TIMING_REVIEW_REQUIRED');
  cues.push({id:`dialogue-${track.stepKey}`,startFrame:Math.round(track.startSeconds*recipe.fps),durationInFrames:Math.ceil(measured!*recipe.fps),text:track.text,source:{kind:'PLANNED_DIALOGUE',runId:run._id,nodeId:source._id,productionVersionId:run.productionVersionId,shotId:visual.shot._id,shotVersionId:visual.take._id,segmentIndex:track.segmentIndex,speakerResourceVersionId:track.speakerResourceVersionId,voiceVersionId:track.voiceVersionId,audioAssetId:id,audioStorageId:found.canonical.storageId,audioChecksum:found.canonical.checksum,audioDurationSeconds:measured,generationJobId:job._id,approvedText:track.text,sourceRequestHash:source.requestHash}});
 }
 const normalized=normalizeDialogueCues({language:r.language,cues},elapsed/recipe.fps,recipe.fps,node.nodeId);
 return {normalized,cues:normalized.cues.map(cue=>({...cue,source:cues.find(value=>value.id===cue.id)!.source})),durationSeconds:elapsed/recipe.fps};
}

export async function captionDraft(ctx:MutationCtx,node:Doc<'recipeRunNodes'>,run:Doc<'recipeRuns'>,actorId:Id<'users'>,manualCues?:unknown[]){
 if(node.operation!=='CAPTIONS')throw new Error('RECIPE_CAPTION_NODE_INVALID');
 const current=await ctx.db.get(node._id);if(current?.resultId){const id=ctx.db.normalizeId('captions',current.resultId),caption=id?await ctx.db.get(id):null;if(!caption||caption.productionId!==run.productionId)throw new Error('RECIPE_CAPTION_NODE_INVALID');return caption._id;}
 const r=recipeObject(node.request),recipe=run.boundRecipe as RecipeDocument;let transcriptId:Id<'transcripts'>|undefined,normalized,storedCues,format;
 if(r.mode==='PLANNED_DIALOGUE'){
  if(manualCues)throw new Error('RECIPE_DIALOGUE_CAPTION_REVISION_REQUIRED');const draft=await plannedDialogueCaptions(ctx,node,run);normalized=draft.normalized;storedCues=draft.cues;format='PLANNED_DIALOGUE_LINES_V1';
 }else{
  const source=await recipeSourceNode(ctx,node,r.transcriptStepKey),id=ctx.db.normalizeId('transcripts',source.resultId!),transcript=id?await ctx.db.get(id):null;
  if(!transcript||transcript.productionId!==run.productionId||transcript.status!=='COMPLETED')throw new Error('RECIPE_TRANSCRIPT_UNAVAILABLE');await approvedRecipeResource(ctx,run.projectId,'transcript',transcript._id);transcriptId=transcript._id;
  const picture=await ctx.db.query('recipeRunNodes').withIndex('by_run_node',q=>q.eq('runId',run._id).eq('nodeId','timeline')).unique(),duration=Number(recipeObject(picture?.request).durationFrames)/recipe.fps;
  const segments=recipeObject(transcript.segments).segments,cues=manualCues??(Array.isArray(segments)?segments.map((value:any,index:number)=>({id:`segment-${index+1}`,startSeconds:typeof value.startSeconds==='number'?value.startSeconds:value.start,endSeconds:typeof value.endSeconds==='number'?value.endSeconds:value.end,text:value.text})):[]);if(!cues.length)throw new Error('CAPTION_TIMING_REVIEW_REQUIRED');
  normalized=normalizeCaptionTrack({language:r.language,cues},duration,recipe.fps,node.nodeId);storedCues=normalized.cues;format=manualCues?'REVIEWED_CUES_V1':'TIMED_SEGMENTS_V1';
 }
 const production=await ctx.db.get(run.productionId);if(!production||production.projectId!==run.projectId)throw new Error('RECIPE_PRODUCTION_UNAVAILABLE');
 const id=await ctx.db.insert('captions',{productionId:run.productionId,studioId:production.studioId,studioExternalId:production.studioExternalId,...(transcriptId?{transcriptId}:{}),language:normalized.language,format,cues:storedCues,style:normalized.style,status:'DRAFT',createdAt:Date.now()});await ensureResourceState(ctx,{projectId:run.projectId,productionId:run.productionId,resourceType:'caption',resourceId:id},actorId);await completeRecipeNode(ctx,node,id,{...normalized,cues:storedCues});return id;
}

/** Explicit caption revision. Approved captions and already consumed recipes
 * are immutable; the prior draft is retained for audit and comparison. */
export const reviseDialogueCaptions=mutation({
 args:{nodeId:v.id('recipeRunNodes'),expectedCaptionId:v.id('captions'),cues:v.array(v.any())},returns:v.id('captions'),
 handler:async(ctx,args)=>{
  const {run,node}=await recipeNodeScope(ctx,args.nodeId);const access=await requireProjectRole(ctx,run.projectId,['OWNER','EDITOR']);
  if(run.cancelRequestedAt||node.operation!=='CAPTIONS'||recipeObject(node.request).mode!=='PLANNED_DIALOGUE'||!node.resultId||node.leaseId&&(node.leaseExpiresAt??0)>Date.now())throw new Error('RECIPE_CAPTION_REVISION_NOT_ADMISSIBLE');
  const draft=await plannedDialogueCaptions(ctx,node,run),recipe=run.boundRecipe as RecipeDocument;
  if(args.cues.length!==draft.cues.length)throw new Error('RECIPE_CAPTION_LINE_IDENTITY_CHANGED');
  const normalized=normalizeDialogueCues({language:draft.normalized.language,cues:args.cues},draft.durationSeconds,recipe.fps,node.nodeId);
  if(normalized.cues.some(cue=>!draft.cues.some(original=>original.id===cue.id)))throw new Error('RECIPE_CAPTION_LINE_IDENTITY_CHANGED');
  const currentId=ctx.db.normalizeId('captions',node.resultId),caption=currentId?await ctx.db.get(currentId):null;
  if(!caption||caption.productionId!==run.productionId||caption.format!=='PLANNED_DIALOGUE_LINES_V1')throw new Error('RECIPE_CAPTION_NODE_INVALID');
  if(caption._id!==args.expectedCaptionId){
   const previous=Array.isArray(caption.cues)?caption.cues:[];
   const current=normalizeCaptionTrack({language:caption.language,cues:previous},draft.durationSeconds,recipe.fps,node.nodeId);
   if(previous.length&&previous.every((cue:any)=>recipeObject(cue.source).captionRevisionOf===args.expectedCaptionId)&&await recipeHash(current.cues)===await recipeHash(normalized.cues))return caption._id;
   throw new Error('RECIPE_CAPTION_CHANGED');
  }
  const state=await getEffectiveResourceState(ctx,run.projectId,'caption',caption._id,run.productionId,access.user._id);
  const approval=await ctx.db.query('recipeRunNodes').withIndex('by_run_node',q=>q.eq('runId',run._id).eq('nodeId',`approve:${node.nodeId}`)).unique();
  const timeline=await ctx.db.query('recipeRunNodes').withIndex('by_run_node',q=>q.eq('runId',run._id).eq('nodeId','timeline')).unique();
  if(caption.status!=='DRAFT'||!['DRAFT','IN_REVIEW'].includes(state.currentState)||!approval||approval.status==='COMPLETED'||approval.leaseId&&(approval.leaseExpiresAt??0)>Date.now()||timeline?.resultId||timeline?.leaseId&&(timeline.leaseExpiresAt??0)>Date.now())throw new Error('RECIPE_CAPTION_ALREADY_CONSUMED');
  const editedAt=Date.now();const cues=normalized.cues.map(cue=>({...cue,source:{...draft.cues.find(original=>original.id===cue.id)!.source,captionRevisionOf:caption._id,editedByUserId:access.user._id,editedAt}}));
  const id=await ctx.db.insert('captions',{productionId:run.productionId,studioId:caption.studioId,studioExternalId:caption.studioExternalId,language:normalized.language,format:'PLANNED_DIALOGUE_LINES_V1',cues,style:caption.style??{},status:'DRAFT',createdAt:editedAt});
  await ensureResourceState(ctx,{projectId:run.projectId,productionId:run.productionId,resourceType:'caption',resourceId:id},access.user._id);
  await completeRecipeNode(ctx,node,id,{...normalized,cues});
  await ctx.db.patch(approval._id,{status:'WAITING_APPROVAL',resultId:undefined,resultHash:undefined,errorCode:'RECIPE_OWNER_APPROVAL_REQUIRED',updatedAt:editedAt});
  await ctx.db.patch(run._id,{status:'WAITING_APPROVAL',updatedAt:editedAt});return id;
 },
});
async function approvalResources(ctx:MutationCtx,node:Doc<'recipeRunNodes'>,run:Doc<'recipeRuns'>){const source=await recipeSourceNode(ctx,node,recipeObject(node.request).sourceNodeId);let resources:Array<{type:string;id:string;productionId?:Id<'productions'>}>=[];
 if(node.approvalTarget==='TAKE'){const takeId=ctx.db.normalizeId('shotVersions',source.resultId!);const take=takeId?await ctx.db.get(takeId):null;if(!take||take.projectId!==run.projectId||take.productionVersionId!==run.productionVersionId||!take.assetId)throw new Error('RECIPE_TAKE_UNAVAILABLE');await canonicalAssetExists(ctx,run.projectId,take.assetId);resources=[{type:'asset',id:take.assetId},{type:'shotVersion',id:take._id,productionId:run.productionId}];}
 else if(node.approvalTarget==='ASSET'){await canonicalAssetExists(ctx,run.projectId,source.resultId!);resources=[{type:'asset',id:source.resultId!}];}
 else resources=[{type:node.approvalTarget==='TRANSCRIPT'?'transcript':node.approvalTarget==='BEAT_MAP'?'beatAnalysisVersion':node.approvalTarget==='CAPTION_PLAN'?'caption':'timeline',id:source.resultId!,...(node.approvalTarget==='BEAT_MAP'?{}:{productionId:run.productionId})}];return {source,resources};
}
async function canonicalAssetExists(ctx:MutationCtx,projectId:Id<'projects'>,id:string){const assetId=ctx.db.normalizeId('assets',id);const asset=assetId?await ctx.db.get(assetId):null;if(!asset||asset.projectId!==projectId||asset.scope!=='PROJECT'||asset.deletedAt||!asset.storageId)throw new Error('RECIPE_RESULT_UNAVAILABLE');return asset;}
export async function advanceRecipeApproval(ctx:MutationCtx,node:Doc<'recipeRunNodes'>,run:Doc<'recipeRuns'>,actorId:Id<'users'>){const {source,resources}=await approvalResources(ctx,node,run);let approved=true;for(const resource of resources){const effective=await getEffectiveResourceState(ctx,run.projectId,resource.type,resource.id,resource.productionId,actorId);if(!['APPROVED','LOCKED'].includes(effective.currentState)){approved=false;if(effective.currentState==='DRAFT')await transitionResourceState(ctx,{projectId:run.projectId,productionId:resource.productionId,resourceType:resource.type,resourceId:resource.id,targetState:'IN_REVIEW',roles:['OWNER','EDITOR'],decision:'RECIPE_REVIEW_REQUESTED'},actorId);}else{if(resource.type==='asset')await canonicalRecipeAsset(ctx,run.projectId,resource.id as Id<'assets'>);if(resource.type==='beatAnalysisVersion')await validateBeatVersionForApproval(ctx,run.projectId,resource.id as Id<'beatAnalysisVersions'>);if(resource.type==='timeline'&&effective.currentState!=='LOCKED')approved=false;}}
 if(approved){await completeRecipeNode(ctx,node,source.resultId!,{sourceHash:source.resultHash,resources});return true;}await ctx.db.patch(node._id,{status:'WAITING_APPROVAL',leaseId:undefined,leaseExpiresAt:undefined,errorCode:node.approvalTarget==='TIMELINE'?'RECIPE_TIMELINE_LOCK_REQUIRED':'RECIPE_OWNER_APPROVAL_REQUIRED',updatedAt:Date.now()});return false;
}
export async function executeRecipeLocal(ctx:MutationCtx,node:Doc<'recipeRunNodes'>,run:Doc<'recipeRuns'>,actorId:Id<'users'>){const r=recipeObject(node.request);const recipe=run.boundRecipe as RecipeDocument;
 if(node.operation==='GRAPHIC'||node.operation==='SOURCE_RANGE'||node.operation==='NARRATION'&&r.mode==='RECORDING'){if(r.sourceAssetId)await canonicalRecipeAsset(ctx,run.projectId,r.sourceAssetId);await completeRecipeNode(ctx,node,r.sourceAssetId??node.nodeId,{requestHash:node.requestHash});return;}
 if(node.operation==='MUSIC_ANALYSIS'){const result=await requestCanonicalBeatAnalysis(ctx,{projectId:run.projectId,assetId:r.sourceAssetId,idempotencyKey:node.idempotencyKey},actorId);await ctx.db.patch(node._id,{linkedBeatJobId:result.jobId,status:'QUEUED',updatedAt:Date.now()});if(result.analysisVersionId){await ensureResourceState(ctx,{projectId:run.projectId,resourceType:'beatAnalysisVersion',resourceId:result.analysisVersionId},actorId);await completeRecipeNode(ctx,node,result.analysisVersionId,{id:result.analysisVersionId});}return;}
 if(node.operation==='CAPTIONS'){await captionDraft(ctx,node,run,actorId);return;}
 if(node.operation==='TIMELINE'){const clips=[];for(const key of r.visualOrder){const source=await recipeSourceNode(ctx,node,key);const sr=recipeObject(source.request);if(source.operation==='GENERATION')clips.push({kind:'TAKE' as const,shotVersionId:source.resultId as Id<'shotVersions'>});else if(source.operation==='SOURCE_RANGE')clips.push({kind:'ASSET' as const,assetId:sr.sourceAssetId,durationSeconds:sr.durationFrames/recipe.fps,trimStartSeconds:sr.startFrame/recipe.fps,volume:sr.audioPolicy==='MUTE'?0:1,...(sr.fit?{fit:sr.fit}:{})});else if(source.operation==='GRAPHIC')clips.push({kind:'GRAPHIC' as const,templateId:sr.templateId,durationSeconds:sr.durationFrames/recipe.fps,props:Object.fromEntries(['title','subtitle','brandName','eyebrow','feature','detail','index','callToAction','url','accentColor','backgroundColor','textColor'].filter(key=>sr[key]!==undefined).map(key=>[key,sr[key]])) as {title:string},...(sr.logoAssetId?{logoAssetId:sr.logoAssetId}:{})});else throw new Error('RECIPE_VISUAL_OPERATION_UNSUPPORTED');}
 const audioTracks=[];if(r.narrationStepKey){const source=await recipeSourceNode(ctx,node,r.narrationStepKey);const sr=recipeObject(source.request);const id=ctx.db.normalizeId('assets',source.resultId!);if(!id)throw new Error('RECIPE_NARRATION_UNAVAILABLE');const found=await canonicalRecipeAsset(ctx,run.projectId,id);const duration=sr.mode==='RECORDING'?Number(sr.durationFrames)/recipe.fps:found.canonical.durationSeconds;if(!duration||duration>Number(r.durationFrames)/recipe.fps)throw new Error('RECIPE_NARRATION_TIMING_REVIEW_REQUIRED');audioTracks.push({assetId:id,startSeconds:0,durationSeconds:duration,trimStartSeconds:sr.mode==='RECORDING'?Number(sr.startFrame)/recipe.fps:0,role:'voiceover' as const,volume:1});}
 for(const raw of Array.isArray(r.dialogueTracks)?r.dialogueTracks:[]){const track=recipeObject(raw);const source=await recipeSourceNode(ctx,node,track.stepKey);const sr=recipeObject(source.request);const id=ctx.db.normalizeId('assets',source.resultId!);if(!id||sr.operation!=='NARRATION'||sr.mode!=='GENERATE'||sr.voiceVersionId!==track.voiceVersionId||sr.text!==track.text)throw new Error('RECIPE_DIALOGUE_BINDING_CHANGED');const found=await canonicalRecipeAsset(ctx,run.projectId,id);const measured=found.canonical.durationSeconds;if(!measured||measured>Number(track.durationSeconds)+0.000001||Number(track.startSeconds)+measured>Number(r.durationFrames)/recipe.fps+0.000001)throw new Error('RECIPE_DIALOGUE_TIMING_REVIEW_REQUIRED');audioTracks.push({assetId:id,startSeconds:Number(track.startSeconds),durationSeconds:measured,trimStartSeconds:0,role:'dialogue' as const,volume:1});}
 if(r.musicStepKey){const source=await recipeSourceNode(ctx,node,r.musicStepKey);const sr=recipeObject(source.request);audioTracks.push({assetId:sr.sourceAssetId,startSeconds:0,durationSeconds:Number(sr.durationFrames)/recipe.fps,trimStartSeconds:Number(sr.trimStartFrame)/recipe.fps,role:'music' as const,volume:1});}
 const caption=r.captionStepKey?await recipeSourceNode(ctx,node,r.captionStepKey):null;const result=await createCanonicalTimelineDraft(ctx,{productionId:run.productionId,productionVersionId:run.productionVersionId,idempotencyKey:node.idempotencyKey,clips,audioTracks,fps:recipe.fps,...(caption?{captionId:caption.resultId as Id<'captions'>}:{})},actorId);await completeRecipeNode(ctx,node,result.timelineId,result);return;}
 if(node.operation==='MANIFEST'){const timeline=await recipeSourceNode(ctx,node,'timeline');const result=await createCanonicalAssembly(ctx,{productionId:run.productionId,timelineId:timeline.resultId as Id<'timelines'>,idempotencyKey:node.idempotencyKey,selectionScope:'TIMELINE'},actorId);if(recipeObject(result.manifest).version!==5)throw new Error('RECIPE_FINISHING_V5_REQUIRED');await completeRecipeNode(ctx,node,result.manifestId,{manifestId:result.manifestId});return;}
 if(node.operation==='EXPORT'){const manifest=await recipeSourceNode(ctx,node,'manifest');const review=await requestCanonicalReview(ctx,{productionId:run.productionId,manifestId:manifest.resultId as Id<'manifests'>,idempotencyKey:node.idempotencyKey+':review'},actorId);if(!review||review.status!=='APPROVED'){await ctx.db.patch(node._id,{status:'WAITING_APPROVAL',leaseId:undefined,leaseExpiresAt:undefined,errorCode:'RECIPE_EXPORT_REVIEW_REQUIRED',updatedAt:Date.now()});return;}const result=await requestCanonicalExport(ctx,{productionId:run.productionId,manifestId:manifest.resultId as Id<'manifests'>,reviewId:review._id,idempotencyKey:node.idempotencyKey},actorId);if(!result.job)throw new Error('RECIPE_RENDER_JOB_UNAVAILABLE');await ctx.db.patch(node._id,{linkedRenderJobId:result.job._id,status:'QUEUED',errorCode:undefined,updatedAt:Date.now()});return;}
 throw new Error('RECIPE_LOCAL_OPERATION_UNSUPPORTED');
}
