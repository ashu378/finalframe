const assert = require('node:assert/strict');
const { fixture, load } = require('./backend-fixture.cjs');
const { externalHumanPortraits } = load('convex/videoReferenceEligibility.ts');
const routing = load('src/lib/ai/video-routing.ts');
const { selectGenerationDuration } = load('src/lib/generation/duration-bridge.ts');
const { validateReviewedVideoJob } = load('convex/videoRouting.ts');
const registry = load('src/lib/ai/model-registry.ts');
function setup() {
 const ctx=fixture();
 ctx.put('directorPlans',{_id:'plan',productionId:'production',input:{creatorIntent:{visualStyle:{id:'REALISTIC'}}}});
 ctx.put('productionVersions',{_id:'version',productionId:'production',status:'APPROVED',sourcePlanId:'plan',snapshot:{bible:{characters:[{name:'Presenter',description:'Original adult woman with short curly hair.'}]}},planningContextSnapshot:{projectId:'project',resources:[{resourceVersionId:'character-v',resourceId:'character',assetIds:['portrait']}]}});
 ctx.put('shots',{_id:'shot',projectId:'project',productionVersionId:'version',metadata:{resourceBindings:[{role:'cast_0',resourceVersionId:'character-v'}]}});
 ctx.put('projectResources',{_id:'character',projectId:'project',kind:'CHARACTER'});
 ctx.put('projectResourceVersions',{_id:'character-v',resourceId:'character',projectId:'project',assetIds:['portrait']});
 ctx.put('resourceStates',{_id:'approved-cast',projectId:'project',resourceType:'projectResourceVersion',resourceId:'character-v',state:'LOCKED'});
 ctx.put('assets',{_id:'portrait',projectId:'project',scope:'PROJECT',storageId:'stored',mimeType:'image/png',name:'irrelevant filename'});
 return ctx;
}
const args={productionVersionId:'version',shotId:'shot',referenceAssetIds:['portrait']};
const seed={provider:'openrouter',modelId:'bytedance/seedance-2.5',canonicalSlug:'bytedance/seedance-2.5-20260807',available:true,supportsTextToVideo:true,supportsImageReferences:true,supportsVideoReferences:false,supportsFirstFrame:true,supportsLastFrame:true,supportsVideoEdit:false,supportsVideoExtension:false,supportsAudio:true,supportedDurations:[4,8],supportedResolutions:['480p','720p'],supportedAspectRatios:['16:9','9:16'],supportedSizes:['854x480','480x854','1280x720','720x1280'],supportedParameters:[],pricingSkus:{video_tokens:.0000107,video_tokens_without_audio:.0000107,video_tokens_with_video_input:.0000064,video_tokens_1080p:.0000117,video_tokens_1080p_with_video_input:.000007}};
const veo={...seed,modelId:'google/veo-3.1-fast',canonicalSlug:'google/veo-3.1-fast-20260320',supportedDurations:[4,6,8],supportedResolutions:['720p'],supportedSizes:['1280x720','720x1280'],pricingSkus:{duration_seconds_with_audio_720p:.10,duration_seconds_without_audio_720p:.08}};
const request={videoType:'REALISTIC_SKIT_UGC',task:'GENERATE',operation:'GENERATE',audioPolicy:'SILENT',qualityTier:'STANDARD',durationSeconds:4,aspectRatio:'9:16',hasImageReferences:true,imageReferenceCount:2,externalHumanPortraitAssetIds:['portrait']};
let checks=0;async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
(async()=>{
 await check('only approved same-project explicit realistic human cast produces evidence',async()=>{
  const c=setup();assert.deepEqual(await externalHumanPortraits(c,args),['portrait']);
  assert.deepEqual(await externalHumanPortraits(c,{...args,referenceAssetIds:['other']}),[]);
  c.rows.get('version').snapshot.bible.characters[0].description='One original adult presenter.';c.rows.get('character-v').profile={description:'Original adult woman with short hair.'};assert.deepEqual(await externalHumanPortraits(c,args),['portrait']);
  const mutations=[c=>c.rows.get('version').status='DRAFT',c=>c.rows.get('shot').projectId='other',c=>c.rows.get('version').planningContextSnapshot.projectId='other',c=>c.rows.get('character-v').projectId='other',c=>c.rows.get('character').kind='PROP',c=>c.rows.get('character').archivedAt=1,c=>c.rows.get('approved-cast').state='DRAFT',c=>c.rows.get('portrait').projectId='other',c=>c.rows.get('portrait').scope='GLOBAL',c=>c.rows.get('portrait').deletedAt=1,c=>c.rows.get('portrait').mimeType='video/mp4',c=>c.rows.get('version').planningContextSnapshot.resources[0].assetIds=['other'],c=>c.rows.get('shot').metadata.resourceBindings[0].role='cast_1'];
  for(const mutate of mutations){const c=setup();mutate(c);assert.deepEqual(await externalHumanPortraits(c,args),[]);}
 });
 await check('approved prepared-reference label preserves explicit human identity without scanning incidental mentions',async()=>{for(const noun of ['man','woman']){const c=setup();c.rows.get('version').snapshot.bible.characters[0].description='Presenter';c.rows.get('character-v').profile={description:`Proposed reference: fictional adult ${noun}, visibly around 30.`};assert.deepEqual(await externalHumanPortraits(c,args),['portrait']);}const c=setup();c.rows.get('version').snapshot.bible.characters[0].description='Proposed reference: a basket held by an adult woman';assert.deepEqual(await externalHumanPortraits(c,args),[]);});
 await check('objects, animals, cartoons, unknowns and filenames do not become human portrait assertions',async()=>{
  for(const description of ['A fox wearing a coat.','A toy robot.','A human-shaped statue.','A basket held by an adult woman.','Presenter']){const c=setup();c.rows.get('version').snapshot.bible.characters[0].description=description;c.rows.get('portrait').name='adult woman photo.png';assert.deepEqual(await externalHumanPortraits(c,args),[]);}
  for(const style of ['2D_CARTOON','3D_ANIMATION','ILLUSTRATED',undefined]){const c=setup();c.rows.get('plan').input.creatorIntent.visualStyle.id=style;assert.deepEqual(await externalHumanPortraits(c,args),[]);}
 });
 await check('exact model certificate rejects external portraits but retains ordinary object/reference eligibility',async()=>{
  assert.equal(registry.getReviewedVideoReferenceContract(seed.modelId,seed.canonicalSlug).humanPortraitPolicy.mode,'TRUSTED_PROVIDER_ASSET_REQUIRED');
  assert.equal(routing.videoModelSupportsRequest(seed,request),false);
  assert.equal(routing.videoModelSupportsRequest(seed,{...request,externalHumanPortraitAssetIds:[]}),true);
  assert.equal(routing.videoModelSupportsRequest(veo,{...request,durationSeconds:8,resolution:'720p'}),true);
  assert.equal(routing.videoModelSupportsRequest(veo,request),false);
  assert.throws(()=>routing.selectVideoRoute(request,[seed,veo]),/RECIPE_HUMAN_REFERENCE_ROUTE_UNAVAILABLE/);
 });
 await check('compatible longer silent handle preserves both refs, while speech cannot silently bridge',async()=>{
  const original=JSON.stringify(request),selected=selectGenerationDuration(request,[seed,veo]);assert.equal(selected.selection.modelId,veo.modelId);assert.equal(selected.request.durationSeconds,8);assert.equal(selected.request.imageReferenceCount,2);assert.deepEqual(selected.request.externalHumanPortraitAssetIds,['portrait']);assert.equal(JSON.stringify(request),original);
  assert.throws(()=>selectGenerationDuration(request,[seed,veo],undefined,true),/RECIPE_HUMAN_REFERENCE_ROUTE_UNAVAILABLE/);
 });
 await check('canonical preflight derives evidence and ignores forged false or empty caller claims without a purchase',async()=>{
  const c=setup();c.put('videoModelCatalog',{_id:'seed',studioExternalId:'studio',...seed,reviewedAt:Date.now(),lastSeenAt:Date.now()});
  for(const fake of [undefined,[],['unrelated']])await assert.rejects(validateReviewedVideoJob(c,{studioExternalId:'studio',modelId:seed.modelId,productionVersionId:'version',shotId:'shot',request:{...request,referenceAssetIds:['portrait'],externalHumanPortraitAssetIds:fake,constraints:{externalHumanPortraitAssetIds:[],referenceAssetIds:[]}}}),/RECIPE_HUMAN_REFERENCE_ROUTE_UNAVAILABLE/);
  assert.equal(c.count('generationJobs'),0);assert.equal(c.count('providerBudgetReservations'),0);
 });
 console.log(`Human reference eligibility: ${checks} PASS; isolated no-cost contracts, no database or provider calls.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
