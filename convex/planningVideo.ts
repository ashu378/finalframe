import { query } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { requireProjectRole } from './authorization';
import { resolvePlanningContinuity } from './continuityPlanning';
import { resolveGenerationContinuity } from './generationContinuity';
import { getOutputPreset, OUTPUT_PRESETS } from '../renderer/src/output-presets';
import { normalizeVideoType, VIDEO_TYPES, defaultVideoProductionPath, type VideoRoutePolicy } from '../src/lib/ai/video-routing';
import { eligibleShotDurations, exactShotSchedule, validatePlannedShotDurations, ShotDurationPlanningError, SHOT_DURATION_PLANNING_VERSION, type PlanningVideoRequest, type ReviewedPlanningModel } from '../src/lib/production/shot-duration-planning';

type ReadCtx=QueryCtx|MutationCtx;
const object=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const stable=(value:unknown)=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const qualityTier=v.union(v.literal('ECONOMY'),v.literal('STANDARD'),v.literal('PREMIUM'));
const planningArgs={asOf:v.number(),projectId:v.id('projects'),productionId:v.optional(v.id('productions')),durationSeconds:v.number(),outputPreset:v.string(),input:v.any(),plan:v.optional(v.any())};

export function plannedShotMetadata(shot:Record<string,any>){
    const metadata={...object(shot.metadata)};
    for(const field of ['resourceBindings','dialogueSegments','audioPolicy','aspectRatio'])if(shot[field]!==undefined){
        if(metadata[field]!==undefined&&stable(metadata[field])!==stable(shot[field]))throw new Error('Shot planning controls conflict with their metadata.');
        metadata[field]=shot[field];
    }
    return metadata;
}
async function inputAssets(ctx:ReadCtx,projectId:Id<'projects'>,ids:unknown){
    if(ids!==undefined&&(!Array.isArray(ids)||ids.length>50||ids.some(id=>typeof id!=='string')))throw new Error('Select at most50 project-owned planning assets.');
    const assets:Doc<'assets'>[]=[];
    for(const raw of [...new Set((ids??[]) as string[])]){const id=ctx.db.normalizeId('assets',raw),asset=id?await ctx.db.get(id):null;
        if(!asset||asset.projectId!==projectId||asset.scope!=='PROJECT'||asset.deletedAt||!asset.storageId)throw new Error('Import planning references into the selected project first.');assets.push(asset);}
    return assets;
}
export function planningVideoType(input:unknown,fallback:unknown){const selected=object(input).videoType;if(selected!==undefined&&(typeof selected!=='string'||!(VIDEO_TYPES as readonly string[]).includes(selected)))throw new Error('Choose a supported video recipe.');return selected??normalizeVideoType(fallback);}
async function routeContext(ctx:ReadCtx,project:Doc<'projects'>,input:unknown,outputPreset:string,productionId?:Id<'productions'>){
    const source=object(input),tier=source.qualityTier??'STANDARD';if(!['ECONOMY','STANDARD','PREMIUM'].includes(tier))throw new Error('Choose an available finish level.');
    const production=productionId?await ctx.db.get(productionId):null;if(productionId&&(!production||production.projectId!==project._id))throw new Error('Production does not belong to this project.');
    const videoType=planningVideoType(source,production?.projectType??project.projectType),assets=await inputAssets(ctx,project._id,source.inputAssetIds);
    const hasVisual=assets.some(asset=>/^(image|video)\//.test(asset.mimeType??''));
    const rendererOnly=videoType==='MOTION_GRAPHICS'||hasVisual&&(source.mode==='FOOTAGE'||videoType==='EXPLAINER_STORY'&&source.mode==='VOICE');
    let mode=rendererOnly?'RENDERER':defaultVideoProductionPath(videoType)==='COMPOSITED'?'HYBRID':'AI_VIDEO';
    const [catalog,policy]=rendererOnly?[[],undefined]:await Promise.all([
        ctx.db.query('videoModelCatalog').withIndex('by_studio',q=>q.eq('studioExternalId',project.studioExternalId)).take(201),
        ctx.db.query('videoRoutePolicies').withIndex('by_studio_type_quality',q=>q.eq('studioExternalId',project.studioExternalId).eq('videoType',videoType).eq('qualityTier',tier)).unique(),
    ]);
    const rendererReason=videoType==='MOTION_GRAPHICS'||policy?.path==='MOTION_GRAPHICS'?'GRAPHIC':'UPLOADED_MEDIA';
    if(policy?.path==='MOTION_GRAPHICS')mode='RENDERER';
    const audioPolicy=source.audioPolicy??'SILENT';
    if(!['SILENT','GENERATE','KEEP_SOURCE','USE_RECORDING'].includes(audioPolicy))throw new Error('Choose a supported planning audio policy.');
    const subjectImages=source.mode==='IMAGES'&&assets.length>0&&assets.every(asset=>asset.mimeType?.startsWith('image/'));
    const request:PlanningVideoRequest={videoType,task:'GENERATE',operation:'GENERATE',qualityTier:tier,aspectRatio:getOutputPreset(outputPreset).aspectRatio,audioPolicy,requiresAudio:audioPolicy==='GENERATE'||source.generateAudio===true||source.requiresAudio===true,
        // These are conditional edit-length suggestions, never an approval of
        // an unseen shot. Actual validation requires an explicit SILENT policy.
        durationBridgeAllowed:subjectImages&&[undefined,'GENERATE'].includes(source.operation)&&[undefined,'GENERATE'].includes(source.videoTask),
        hasPlannedDialogue:Array.isArray(source.dialogueSegments)&&source.dialogueSegments.length>0,
        requiresFirstFrame:!!source.firstFrameAssetId||source.requiresFirstFrame===true,requiresLastFrame:!!source.lastFrameAssetId||source.requiresLastFrame===true,
        requiresMask:source.requiresMask===true,requiresSourceAudioPreservation:audioPolicy==='KEEP_SOURCE'||source.requiresSourceAudioPreservation===true,
        previousJobId:typeof source.previousJobId==='string'?source.previousJobId:undefined,previousModelId:typeof source.previousModelId==='string'?source.previousModelId:undefined,
        upscaleFactor:source.upscaleFactor,creativity:source.creativity,
        // Image/performance references remain explicit shot choices. Their exact
        // modalities and pricing are revalidated after the actual plan exists.
        hasImageReferences:source.mode==='IMAGES'&&assets.some(asset=>asset.mimeType?.startsWith('image/')),hasVideoReference:source.mode==='IMAGES'&&assets.some(asset=>asset.mimeType?.startsWith('video/')),hasAudioReference:source.mode==='IMAGES'&&assets.some(asset=>asset.mimeType?.startsWith('audio/')),imageReferenceCount:source.mode==='IMAGES'?assets.filter(asset=>asset.mimeType?.startsWith('image/')).length:0};
    return {source,assets,mode,rendererReason,request,catalog:catalog as ReviewedPlanningModel[],policy:policy as VideoRoutePolicy|undefined};
}
async function planningVideoConstraintsImpl(ctx:ReadCtx,project:Doc<'projects'>,input:unknown,outputPreset:string,totalSeconds:number,productionId?:Id<'productions'>,asOf=Date.now()){
    const scope=await routeContext(ctx,project,input,outputPreset,productionId);
    if(scope.mode==='RENDERER')return {version:SHOT_DURATION_PLANNING_VERSION,mode:scope.mode,finalAspectRatio:scope.request.aspectRatio,options:[{aspectRatio:scope.request.aspectRatio,allowedShotSeconds:[4,5,6,7,8],suggestedShotSeconds:exactShotSchedule(totalSeconds,[4,5,6,7,8])}],note:'Deterministic composition from authored graphics or explicitly supplied visuals; no video provider is required.'};
    const ratios=[scope.request.aspectRatio,...new Set(OUTPUT_PRESETS.map(preset=>preset.aspectRatio))].filter((ratio,index,values)=>values.indexOf(ratio)===index);
    const options=[];for(const aspectRatio of ratios){const allowedShotSeconds=eligibleShotDurations({...scope.request,aspectRatio},scope.catalog,scope.policy,asOf);if(!allowedShotSeconds.length)continue;
        try{options.push({aspectRatio,allowedShotSeconds,suggestedShotSeconds:exactShotSchedule(totalSeconds,allowedShotSeconds)});}catch{/* Another supported aspect ratio may offer an exact decomposition. */}}
    if(!options.length){const allowed=eligibleShotDurations(scope.request,scope.catalog,scope.policy,asOf);exactShotSchedule(totalSeconds,allowed);throw new Error('No compatible video plan is available.');}
    return {version:SHOT_DURATION_PLANNING_VERSION,mode:scope.mode,finalAspectRatio:scope.request.aspectRatio,options,note:'Write actual shot coverage using these lengths. Never split an existing spoken line. If generation framing differs from final framing, state it explicitly for approval; final composition uses a separately reviewed fit.'+(scope.request.durationBridgeAllowed?' Conditional image-reference lengths are planned EDIT lengths, not native purchase lengths. A compatible provider clip may be longer and its full generation duration is priced. Actual shots must explicitly declare SILENT, have no dialogue, audio/video references, frame pins, masks or source-preservation controls; otherwise only exact native durations apply. Review the take before using its planned first portion.':'')};
}
async function validateAutomaticVideoPlanImpl(ctx:ReadCtx,project:Doc<'projects'>,input:unknown,outputPreset:string,totalSeconds:number,plan:unknown,productionId?:Id<'productions'>,continuitySnapshot?:unknown,asOf=Date.now()){
    const scope=await routeContext(ctx,project,input,outputPreset,productionId),shots=[];
    const source=object(input),bibleId=typeof source.continuityBibleId==='string'?ctx.db.normalizeId('continuityBibles',source.continuityBibleId):null;
    const continuity=continuitySnapshot===undefined?await resolvePlanningContinuity(ctx,project._id,productionId,bibleId??undefined,String(source.prompt??source.script??'').slice(0,256)):continuitySnapshot;
    for(const sequence of object(plan).sequences??[])for(const scene of object(sequence).scenes??[])for(const raw of object(scene).shots??[]){const shot=object(raw),metadata=plannedShotMetadata(shot);
        if(metadata.referenceAssetIds!==undefined&&!Array.isArray(metadata.referenceAssetIds))throw new Error('Choose explicit project reference assets.');
        const referenceIds=[...new Set([...(shot.requiredAssetIds??[]),...(metadata.referenceAssetIds??[]),...[metadata.firstFrameAssetId,metadata.lastFrameAssetId].filter(Boolean)])] as string[];
        const resolved=await resolveGenerationContinuity(ctx,{projectId:project._id,productionId:productionId??object(continuity).productionId??undefined,snapshot:continuity,explicitResourceVersionIds:metadata.resourceVersionIds,referenceAssetIds:referenceIds,shotMetadata:metadata,durationSeconds:shot.durationSeconds});
        const assets=await inputAssets(ctx,project._id,resolved.referenceAssetIds);
        const aspectRatio=metadata.aspectRatio??scope.request.aspectRatio;if(!OUTPUT_PRESETS.some(preset=>preset.aspectRatio===aspectRatio))throw new Error('Choose a registered shot generation aspect ratio.');
        if(scope.mode==='RENDERER'){if(scope.rendererReason!=='GRAPHIC'&&!assets.some(asset=>/^(image|video)\//.test(asset.mimeType??'')))throw new Error('Each uploaded-media composition shot needs an explicit project visual asset.');shots.push({durationSeconds:Number(shot.durationSeconds),request:{...scope.request,aspectRatio}});continue;}
        const first=metadata.firstFrameAssetId,last=metadata.lastFrameAssetId;
        for(const frame of [first,last])if(frame&&!assets.some(asset=>asset._id===frame&&asset.mimeType?.startsWith('image/')))throw new Error('First and last frames must be selected project images.');
        if((metadata.requiresFirstFrame===true||scope.request.requiresFirstFrame)&&!first||(metadata.requiresLastFrame===true||scope.request.requiresLastFrame)&&!last)throw new ShotDurationPlanningError('SHOT_NOT_SUPPORTED','Select each required project frame before approving its shot.');
        const referenceAssets=assets.filter(asset=>asset._id!==first&&asset._id!==last);
        const audioPolicy=metadata.audioPolicy??(metadata.generateAudio===true?'GENERATE':'SILENT');
        if(![undefined,'GENERATE','FRAME_TO_VIDEO'].includes(metadata.operation)||![undefined,'GENERATE','FRAME_TO_VIDEO'].includes(metadata.videoTask))throw new Error('Plan source edits or continuation through their certified operation workflow.');
        if(audioPolicy==='KEEP_SOURCE'&&!referenceAssets.some(asset=>asset.mimeType?.startsWith('video/')))throw new ShotDurationPlanningError('SHOT_NOT_SUPPORTED','Preserving source audio requires an explicit project video. Revise the shot source before approval.');
        const request:PlanningVideoRequest={...scope.request,aspectRatio,resolution:metadata.resolution,operation:metadata.operation??'GENERATE',task:metadata.videoTask??'GENERATE',
            // Never trust provisional or caller-authored bridge permission.
            durationBridgeAllowed:metadata.audioPolicy==='SILENT'&&resolved.dialogueSegments.length===0,hasPlannedDialogue:resolved.dialogueSegments.length>0||scope.request.hasPlannedDialogue===true,
            hasImageReferences:referenceAssets.some(asset=>asset.mimeType?.startsWith('image/')),imageReferenceCount:referenceAssets.filter(asset=>asset.mimeType?.startsWith('image/')).length,
            hasVideoReference:referenceAssets.some(asset=>asset.mimeType?.startsWith('video/')),hasAudioReference:referenceAssets.some(asset=>asset.mimeType?.startsWith('audio/')),
            requiresFirstFrame:!!first||metadata.requiresFirstFrame===true||scope.request.requiresFirstFrame,requiresLastFrame:!!last||metadata.requiresLastFrame===true||scope.request.requiresLastFrame,requiresAudio:audioPolicy==='GENERATE'||metadata.generateAudio===true||scope.request.requiresAudio,audioPolicy,requiresMask:metadata.requiresMask===true||scope.request.requiresMask,requiresSourceAudioPreservation:audioPolicy==='KEEP_SOURCE'||metadata.requiresSourceAudioPreservation===true||scope.request.requiresSourceAudioPreservation,
            previousJobId:typeof metadata.previousJobId==='string'?metadata.previousJobId:scope.request.previousJobId,previousModelId:typeof metadata.previousModelId==='string'?metadata.previousModelId:scope.request.previousModelId,
            upscaleFactor:metadata.upscaleFactor??scope.request.upscaleFactor,creativity:metadata.creativity??scope.request.creativity};
        shots.push({durationSeconds:Number(shot.durationSeconds),request});
    }
    if(scope.mode==='RENDERER'){const total=shots.reduce((sum,shot)=>sum+shot.durationSeconds,0);if(!shots.length||!Number.isFinite(total)||Math.abs(total-totalSeconds)>0.000001)throw new Error('The composition shot total must match the requested production duration.');return {version:SHOT_DURATION_PLANNING_VERSION,mode:scope.mode,finalAspectRatio:scope.request.aspectRatio,shotSeconds:shots.map(shot=>shot.durationSeconds),checkedAt:asOf};}
    const selections=validatePlannedShotDurations(shots,totalSeconds,scope.catalog,scope.policy,asOf);
    return {version:SHOT_DURATION_PLANNING_VERSION,mode:scope.mode,finalAspectRatio:scope.request.aspectRatio,shotSeconds:shots.map(shot=>shot.durationSeconds),shotAspectRatios:shots.map(shot=>shot.request.aspectRatio),routes:selections.map(route=>({provider:route.provider,model:route.modelId,resolution:route.resolution??null,...(route.plannedUseDurationSeconds!==undefined?{plannedUseDurationSeconds:route.plannedUseDurationSeconds,generationDurationSeconds:route.generationDurationSeconds}:{} )})),checkedAt:asOf};
}
async function safePlanningCall<T>(run:()=>Promise<T>):Promise<T>{try{return await run();}catch(error){if(error instanceof ShotDurationPlanningError)throw new ConvexError({code:error.code,message:error.message});throw error;}}
export const planningVideoConstraints=(...args:Parameters<typeof planningVideoConstraintsImpl>)=>safePlanningCall(()=>planningVideoConstraintsImpl(...args));
export const validateAutomaticVideoPlan=(...args:Parameters<typeof validateAutomaticVideoPlanImpl>)=>safePlanningCall(()=>validateAutomaticVideoPlanImpl(...args));
/** Only a completed server-side planning receipt can certify an automatic plan.
 * Manual/composition drafts remain editable, never implicitly provider-ready. */
export async function automaticPlanningReceipt(ctx:ReadCtx,projectId:Id<'projects'>,input:unknown,expectedCreator?:Id<'users'>){
    const raw=object(object(input).planningReceipt).requestId;if(raw===undefined)return null;
    const id=typeof raw==='string'?ctx.db.normalizeId('providerTextRequests',raw):null,receipt=id?await ctx.db.get(id):null;
    if(!receipt||receipt.projectId!==projectId||receipt.capability!=='STRUCTURED_PLANNING'||receipt.status!=='COMPLETED'||expectedCreator&&receipt.createdByUserId!==expectedCreator)throw new Error('Use the completed planning receipt from this project.');return receipt;
}
function requireCurrentPlanningTime(asOf:number){if(!Number.isFinite(asOf)||Math.abs(Date.now()-asOf)>30_000)throw new ConvexError({code:'PLANNING_CHECK_EXPIRED',message:'The capability check expired. Refresh the plan before approval.'});return asOf;}
export const path=query({args:{projectId:v.id('projects'),productionId:v.optional(v.id('productions')),input:v.any(),outputPreset:v.string()},returns:v.string(),handler:async(ctx,args)=>{const access=await requireProjectRole(ctx,args.projectId,['OWNER','EDITOR']);return (await routeContext(ctx,access.project,args.input,args.outputPreset,args.productionId)).mode;}});
export const constraints=query({args:{...planningArgs,qualityTier:v.optional(qualityTier)},returns:v.any(),handler:async(ctx,args)=>{const access=await requireProjectRole(ctx,args.projectId,['OWNER','EDITOR']);return planningVideoConstraints(ctx,access.project,{...object(args.input),...(args.qualityTier?{qualityTier:args.qualityTier}:{})},args.outputPreset,args.durationSeconds,args.productionId,requireCurrentPlanningTime(args.asOf));}});
export const validate=query({args:planningArgs,returns:v.any(),handler:async(ctx,args)=>{const access=await requireProjectRole(ctx,args.projectId,['OWNER','EDITOR']);return validateAutomaticVideoPlan(ctx,access.project,args.input,args.outputPreset,args.durationSeconds,args.plan,args.productionId,undefined,requireCurrentPlanningTime(args.asOf));}});
