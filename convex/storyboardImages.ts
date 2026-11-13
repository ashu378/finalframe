import { action, internalQuery, internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { FunctionReference } from 'convex/server';
import { requireProjectRole, requireProjectAccess } from './authorization';
import { validateStoryboardImageInput } from './storyboardImageInputs';
import { createCanonicalPreparationJob } from './generationJobs';
import { quotePreparation } from '../src/lib/ai/preparation';
import { normalizeShotDirecting, stableStoryboardValue, storyboardObject as object } from '../src/lib/production/storyboard-contract';
import { recipeHash } from '../src/lib/production/recipes/compiler';

const refs:Record<string,FunctionReference<any,'internal',any,any>> = (internal as unknown as {storyboardImages:Record<string,FunctionReference<any,'internal',any,any>>}).storyboardImages;
const operations = v.union(v.literal('FRAME'),v.literal('FOUR_ANGLES'),v.literal('RELIGHT'),v.literal('BACKGROUND_REPLACE'),v.literal('OBJECT_REPLACE'),v.literal('CHARACTER_REPLACE'));
const input = {shotId:v.id('shots'),operation:operations,instructions:v.string(),sourceFrameId:v.optional(v.id('storyboardFrames')),referenceAssetIds:v.optional(v.array(v.id('assets')))};
const angleControls = [
  {framing:'wide',angle:'eye-level',label:'Wide establishing composition',compositionInstruction:'WIDE SHOT: show the complete subject and enough surrounding environment to establish the setting.'},
  {framing:'medium',angle:'eye-level',label:'Medium composition',compositionInstruction:'MEDIUM SHOT: crop a person from the waist upward. The face and torso fill the frame; legs and shoes must be outside the image. For an object, show its main working area rather than its entire surroundings.'},
  {framing:'close-up',angle:'eye-level',label:'Close-up or reaction',compositionInstruction:'CLOSE-UP: frame only the face and shoulders of a person. The head fills most of the image. Do not show the waist, legs, shoes or a full body. For an object, fill the frame with one meaningful detail.'},
  {framing:'medium',angle:'low angle',label:'Low-angle composition',compositionInstruction:'LOW ANGLE: move the viewpoint below the subject and look upward. Make the changed camera height visually clear; do not return another eye-level view.'},
];

async function assertFrameCapacity(ctx: import('./_generated/server').QueryCtx | import('./_generated/server').MutationCtx, shotId:Id<'shots'>, count:number) {
  const frames=await ctx.db.query('storyboardFrames').withIndex('by_shot',q=>q.eq('shotId',shotId)).take(25);
  const confirmed=await ctx.db.query('storyboardImageEstimates').withIndex('by_shot_confirmed',q=>q.eq('shotId',shotId).gt('confirmedAt',0)).take(25);
  const registered=new Set(frames.map(frame=>frame.generationJobId).filter(Boolean));
  const pending=new Set(confirmed.flatMap(estimate=>estimate.jobIds??[]).filter(id=>!registered.has(id)));
  if(frames.length+pending.size+count>24||confirmed.length>24)throw new Error('STORYBOARD_FRAME_CAPACITY: create a new shot or version before purchasing more alternatives.');
}

export const context = internalQuery({args:input,returns:v.any(),handler:async(ctx,args)=>{
  const shot=await ctx.db.get(args.shotId),production=shot?.productionId?await ctx.db.get(shot.productionId):null;
  if(!shot||!production?.projectId||!shot.productionVersionId)throw new Error('STORYBOARD_IMAGE_UNAVAILABLE');
  const access=await requireProjectRole(ctx,production.projectId,['OWNER','EDITOR']);
  const text=args.instructions.trim();if(text.length>1800)throw new Error('Keep image direction below1800characters.');
  const source=args.sourceFrameId?await ctx.db.get(args.sourceFrameId):null;
  if(args.operation!=='FRAME'&&!source)throw new Error('Choose the approved storyboard frame to change.');
  const sourceAssetIds=[...new Set([...(source?[source.assetId]:[]),...(args.referenceAssetIds??[])])];
  const direction=normalizeShotDirecting(object(shot.metadata).directing);
  const purpose=args.operation==='FOUR_ANGLES'?'ANGLE':args.operation==='FRAME'?'STORYBOARD_FRAME':'IMAGE_EDIT';
  const checked=await validateStoryboardImageInput(ctx,production._id,{purpose,shotId:shot._id,productionVersionId:shot.productionVersionId,sourceAssetIds,...(args.sourceFrameId?{sourceFrameId:args.sourceFrameId}:{}),direction});
  const controls=args.operation==='FOUR_ANGLES'?angleControls:[{...direction,label:args.operation==='FRAME'?'Storyboard frame':args.operation.replaceAll('_',' ').toLowerCase(),compositionInstruction:''}];
  const entries=controls.map((control,index)=>{
    const {label,compositionInstruction,...composition}=control;
    const applied=normalizeShotDirecting({...direction,...composition});
    const base=source?`Use [Image 1] as the approved scene and identity reference. Preserve character identity, garment cut and sleeve length, exposed-skin regions, outfit colors, props, product markings, location and treatment except the creator's explicit requested change.`:'Create one still storyboard frame for the approved project brief and its explicit reference images.';
    const change=args.operation==='FOUR_ANGLES'?`Explore a ${label}. ${compositionInstruction} This framing requirement overrides the source image's crop and any full-body framing in the shot description. Preserve identity, outfit and setting within the new crop; showing less of the body is intentional. Keep the scene and action.`:args.operation==='FRAME'?'Create the planned shot image.':`Edit only ${args.operation==='RELIGHT'?'lighting and atmosphere':args.operation==='BACKGROUND_REPLACE'?'the background':args.operation==='OBJECT_REPLACE'?'the identified object or product':'the identified character'} as instructed. Preserve all other specified elements.`;
    const prompt=`${base} ${change}\nShot: ${shot.prompt}\nDirecting: ${JSON.stringify(applied)}\nCreator instruction: ${text||'Follow the saved shot direction.'}\nOne composition, no grid, contact sheet, captions or invented logos.`;
    if(prompt.length>4000)throw new Error('Shorten the shot description or image instructions before quoting.');
    return{index,label,text:prompt,imageRequest:{...checked.request,direction:applied}};
  });
  return{projectId:production.projectId,productionId:production._id,productionVersionId:shot.productionVersionId,shotId:shot._id,actorUserId:access.user._id,entries};
}});

export const record = internalMutation({args:{context:v.any(),quote:v.any()},returns:v.any(),handler:async(ctx,args)=>{
  const context=object(args.context),entries=context.entries;
  if(!Array.isArray(entries)||![1,4].includes(entries.length))throw new Error('STORYBOARD_IMAGE_ESTIMATE_INVALID');
  const projectId=ctx.db.normalizeId('projects',String(context.projectId)),productionId=ctx.db.normalizeId('productions',String(context.productionId)),productionVersionId=ctx.db.normalizeId('productionVersions',String(context.productionVersionId)),shotId=ctx.db.normalizeId('shots',String(context.shotId));
  if(!projectId||!productionId||!productionVersionId||!shotId)throw new Error('STORYBOARD_IMAGE_ESTIMATE_INVALID');
  const access=await requireProjectRole(ctx,projectId,['OWNER','EDITOR']);
  if(access.user._id!==context.actorUserId)throw new Error('STORYBOARD_IMAGE_DENIED');
  for(const entry of entries){const checked=await validateStoryboardImageInput(ctx,productionId,entry.imageRequest);if(stableStoryboardValue(checked.request)!==stableStoryboardValue(entry.imageRequest))throw new Error('STORYBOARD_IMAGE_SOURCE_CHANGED');}
  await assertFrameCapacity(ctx,shotId,entries.length);
  const quote=object(args.quote),cost=Number(quote.estimatedProviderCostUsd);
  if(!quote.storyboardImageQuote||!Number.isFinite(cost)||cost<=0||cost>2||Date.now()-Number(quote.checkedAt)>30000)throw new Error('STORYBOARD_IMAGE_QUOTE_CHANGED');
  const requestHash=await recipeHash({context,quote}),now=Date.now();
  const estimateId=await ctx.db.insert('storyboardImageEstimates',{projectId,productionId,productionVersionId,shotId,createdByUserId:access.user._id,createdAt:now,expiresAt:now+30000,requestHash,entries,quote});
  return{estimateId,requestHash,expiresAt:now+30000,model:quote.model,alternatives:entries.map(entry=>({index:entry.index,label:entry.label,maximumProviderCostUsd:cost})),maximumProviderCostUsd:Math.ceil(cost*entries.length*1e6)/1e6};
}});

/** Catalog/byte validation only. No provider inference, job or reservation. */
export const preview = action({args:input,returns:v.any(),handler:async(ctx,args):Promise<Record<string,unknown>>=>{
  const context=await ctx.runQuery(refs.context,args);
  const quote=await quotePreparation({kind:'CHARACTER_REFERENCE',text:context.entries[0].text,imageRequest:context.entries[0].imageRequest});
  return ctx.runMutation(refs.record,{context,quote});
}});

/** One atomic approval freezes the whole grid and reserves every existing job.
 * Repeated confirmation returns its original job IDs, even after expiry. */
export const confirm = mutation({args:{estimateId:v.id('storyboardImageEstimates'),requestHash:v.string()},returns:v.any(),handler:async(ctx,args)=>{
  const estimate=await ctx.db.get(args.estimateId);if(!estimate)throw new Error('STORYBOARD_IMAGE_ESTIMATE_UNAVAILABLE');
  const access=await requireProjectRole(ctx,estimate.projectId,['OWNER','EDITOR']);
  if(estimate.createdByUserId!==access.user._id||estimate.requestHash!==args.requestHash)throw new Error('STORYBOARD_IMAGE_ESTIMATE_INVALID');
  if(estimate.confirmedAt)return{jobIds:estimate.jobIds,replayed:true};
  if(estimate.expiresAt<=Date.now())throw new Error('STORYBOARD_IMAGE_ESTIMATE_EXPIRED');
  await assertFrameCapacity(ctx,estimate.shotId,(estimate.entries as unknown[]).length);
  const entries=estimate.entries as Array<{text:string;imageRequest:any}>,quote=object(estimate.quote),jobIds:Id<'generationJobs'>[]=[];
  for(const [index,entry]of entries.entries()){
    const checked=await validateStoryboardImageInput(ctx,estimate.productionId,entry.imageRequest);
    if(checked.version._id!==estimate.productionVersionId||stableStoryboardValue(checked.request)!==stableStoryboardValue(entry.imageRequest))throw new Error('STORYBOARD_IMAGE_SOURCE_CHANGED');
    const job=await createCanonicalPreparationJob(ctx,{productionId:estimate.productionId,clone:false,kind:'CHARACTER_REFERENCE',text:entry.text,imageRequest:checked.request,model:String(quote.model),capability:'IMAGE_GENERATION',estimatedProviderCostUsd:Number(quote.estimatedProviderCostUsd),quote,idempotencyKey:`storyboard:${estimate._id}:${index}`});
    const jobId=ctx.db.normalizeId('generationJobs',String(job._id));if(!jobId)throw new Error('STORYBOARD_IMAGE_JOB_INVALID');jobIds.push(jobId);
  }
  await ctx.db.patch(estimate._id,{confirmedAt:Date.now(),jobIds});
  return{jobIds,replayed:false};
}});

export const list = query({args:{shotId:v.id('shots')},returns:v.any(),handler:async(ctx,args)=>{
  const shot=await ctx.db.get(args.shotId);if(!shot?.projectId)throw new Error('STORYBOARD_IMAGE_UNAVAILABLE');
  await requireProjectAccess(ctx,shot.projectId);
  const estimates=await ctx.db.query('storyboardImageEstimates').withIndex('by_shot',q=>q.eq('shotId',shot._id)).order('desc').take(8),results=[];
  for(const estimate of estimates)for(const [index,id]of (estimate.jobIds??[]).entries()){
    const job=await ctx.db.get(id),assetId=object(job?.response).assetId;
    if(!job||job.projectId!==shot.projectId||job.productionId!==shot.productionId)continue;
    const resolvedAssetId=typeof assetId==='string'?ctx.db.normalizeId('assets',assetId):null;
    const output=resolvedAssetId?await ctx.db.get(resolvedAssetId):null;
    const asset=output?.projectId===shot.projectId&&!output.deletedAt?output:null;
    const entry=estimate.entries[index];
    results.push({jobId:id,status:job.status,errorCode:job.errorCode??null,assetId:asset?._id??null,url:asset?.projectId===shot.projectId&&!asset.deletedAt&&asset.storageId?await ctx.storage.getUrl(asset.storageId):null,label:entry.label,prompt:entry.text,imageRequest:entry.imageRequest,estimatedCostUsd:job.estimatedProviderCostUsd??null,actualCostUsd:job.providerCostUsd??null});
  }
  return results;
}});
