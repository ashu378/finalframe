const assert=require('node:assert/strict');const{load}=require('../recipes/backend-fixture.cjs');
const registry=load('src/lib/ai/model-registry.ts'),r=load('src/lib/ai/video-routing.ts');let groups=0;function check(name,fn){fn();groups++;console.log('PASS '+name);}
const base={videoType:'CINEMATIC_FILM',task:'GENERATE',operation:'GENERATE',qualityTier:'STANDARD',durationSeconds:6,aspectRatio:'9:16',requiresAudio:false};
function seed(){return{provider:'openrouter',modelId:'bytedance/seedance-2.5',canonicalSlug:'bytedance/seedance-2.5-20260807',available:true,supportsTextToVideo:true,supportsImageReferences:true,supportsAudioReferences:true,supportsAudio:true,supportsFirstFrame:true,supportsLastFrame:true,supportedDurations:[4,5,6,7,8,9,10,30],supportedResolutions:['480p','720p'],supportedAspectRatios:['16:9','4:3','1:1','3:4','9:16','21:9'],supportedSizes:['854x480','752x560','640x640','560x752','480x854','992x432','1280x720','1112x834','960x960','834x1112','720x1280','1470x630'],supportedParameters:[],pricingSkus:{video_tokens:.0000107,video_tokens_without_audio:.0000107,video_tokens_with_video_input:.0000064}};}
function lite(){return{...seed(),modelId:'google/veo-3.1-lite',canonicalSlug:'google/veo-3.1-lite-20260331',supportedDurations:[4,6,8],supportedResolutions:['720p','1080p'],supportedAspectRatios:['16:9','9:16'],supportedSizes:['1280x720','720x1280','1920x1080','1080x1920'],pricingSkus:{duration_seconds_without_audio_720p:.03,duration_seconds_without_audio:.05}};}
check('Veo Lite cannot treat generic identity/style guidance as an initial frame even when an admin asserts image support',()=>{
 assert.equal(r.videoModelSupportsRequest(lite(),{...base,resolution:'720p',hasImageReferences:true,imageReferenceCount:1}),false);
 assert.equal(r.videoModelSupportsRequest(lite(),{...base,resolution:'720p',task:'FRAME_TO_VIDEO',operation:'FRAME_TO_VIDEO',requiresFirstFrame:true}),true);
 assert.equal(r.videoModelSupportsRequest(lite(),{...base,resolution:'720p'}),true);
 assert.equal(registry.getReviewedVideoReferenceContract(lite().modelId,lite().canonicalSlug).imageMode,'FRAME_ONLY');
});
check('reviewed omni subject guidance requires exact version/count and never drops required frame/audio controls',()=>{
 const request={...base,resolution:'480p',hasImageReferences:true,imageReferenceCount:1};assert.equal(r.videoModelSupportsRequest(seed(),request),true);
 for(const patch of[{canonicalSlug:'changed'},{modelId:'unknown/reference-model'},{supportsImageReferences:false}])assert.equal(r.videoModelSupportsRequest({...seed(),...patch},request),false);
 assert.equal(r.videoModelSupportsRequest(seed(),{...request,imageReferenceCount:31}),false);assert.equal(r.videoModelSupportsRequest(seed(),{...request,imageReferenceCount:0}),false);
 assert.equal(r.videoModelSupportsRequest(seed(),{...request,requiresFirstFrame:true}),false);assert.equal(r.videoModelSupportsRequest({...seed(),supportsCombinedFrameReferences:true},{...request,requiresFirstFrame:true}),false,'An administrator cannot certify undocumented frame/reference mixing');
 assert.equal(r.videoModelSupportsRequest(seed(),{...request,hasAudioReference:true}),true);
});
check('full Veo reference mode is eight seconds only and cannot inherit Lite or first-frame claims',()=>{
 const m={...lite(),modelId:'google/veo-3.1',canonicalSlug:'google/veo-3.1-20260320'};
 assert.equal(r.videoModelSupportsRequest(m,{...base,resolution:'720p',hasImageReferences:true,imageReferenceCount:1}),false);
 assert.equal(r.videoModelSupportsRequest(m,{...base,durationSeconds:8,resolution:'720p',hasImageReferences:true,imageReferenceCount:3}),true);
 assert.equal(r.videoModelSupportsRequest(m,{...base,durationSeconds:8,resolution:'720p',hasImageReferences:true,imageReferenceCount:4}),false);
});
check('Google higher-resolution generation needs eight seconds even when independent catalog lists include shorter durations',()=>{
 for(const m of[lite(),{...lite(),modelId:'google/veo-3.1',canonicalSlug:'google/veo-3.1-20260320',supportedResolutions:['720p','1080p','4K'],supportedSizes:[...lite().supportedSizes,'3840x2160','2160x3840']}]){
  for(const resolution of m.supportedResolutions){assert.equal(r.videoModelSupportsRequest(m,{...base,resolution}),resolution==='720p');if(resolution!=='720p')assert.equal(r.estimateVideoCost(m,{...base,resolution}),undefined);assert.equal(r.videoModelSupportsRequest(m,{...base,resolution,durationSeconds:8}),true);}
 }
});
check('six-second portrait quotes match exact published480p and720p token grids with conservative existing holds',()=>{
 assert.deepEqual(r.resolveVideoOutputSize(seed(),'9:16','480p'),{width:480,height:854,resolution:'480p'});
 assert.deepEqual(r.resolveVideoOutputSize(seed(),'9:16','720p'),{width:720,height:1280,resolution:'720p'});
 const low=r.estimateVideoCost(seed(),{...base,resolution:'480p',hasImageReferences:true,imageReferenceCount:1}),high=r.estimateVideoCost(seed(),{...base,resolution:'720p',hasImageReferences:true,imageReferenceCount:1});
 assert(Math.abs(low-.6168015)<1e-12);assert(Math.abs(high-1.38672)<1e-12);assert(high>low*2);
 assert.equal(load('convex/generationWorkerContracts.ts').videoBudgetReservationUsd(low),.657642);assert.equal(load('convex/generationWorkerContracts.ts').videoBudgetReservationUsd(high),1.466056);
 assert.equal(r.selectVideoRoute({...base,hasImageReferences:true,imageReferenceCount:1},[seed()]).resolution,'480p');const selection=r.selectVideoRoute({...base,hasImageReferences:true,imageReferenceCount:1},[seed()]);assert.equal(selection.referenceContract.version,'VIDEO_REFERENCE_SEMANTICS_V1');assert.equal(r.buildVideoRouteMetadata(base,selection).referenceContract.canonicalSlug,seed().canonicalSlug);
});
check('published square,portrait,standard andultrawide groups resolve without short-edge/height guesses; unsupported final4:5 stays composition-only',()=>{
 const expected={'16:9':[[854,480],[1280,720]],'4:3':[[752,560],[1112,834]],'1:1':[[640,640],[960,960]],'3:4':[[560,752],[834,1112]],'9:16':[[480,854],[720,1280]],'21:9':[[992,432],[1470,630]]};
 for(const[ratio,sizes]of Object.entries(expected))for(const[index,resolution]of['480p','720p'].entries()){const selected=r.resolveVideoOutputSize(seed(),ratio,resolution);assert.deepEqual([selected.width,selected.height],sizes[index]);assert.equal(r.estimateVideoCost(seed(),{...base,aspectRatio:ratio,resolution}),sizes[index][0]*sizes[index][1]*6*24/1024*.0000107);}
 assert.equal(r.resolveVideoOutputSize(seed(),'4:5','720p'),undefined);assert.equal(r.estimateVideoCost(seed(),{...base,aspectRatio:'4:5',resolution:'720p'}),undefined);
});
check('all seven composition ratios require explicit available native pixel grids; incomplete ambiguous and neighboring dimensions reject',()=>{
 const ratios=['16:9','9:16','1:1','4:5','4:3','3:4','21:9'],sizes=['640x360','360x640','360x360','360x450','480x360','360x480','840x360'];
 const m={...seed(),modelId:'unknown/native-shortedge',canonicalSlug:'unknown/v1',supportedResolutions:['360p'],supportedAspectRatios:ratios,supportedSizes:sizes};for(const ratio of ratios)assert(r.resolveVideoOutputSize(m,ratio,'360p'));
 for(const patch of[{supportedSizes:['480x854']},{supportedSizes:['720x1270']},{supportedSizes:['not-a-size']},{supportedResolutions:['1080p']}])assert.equal(r.resolveVideoOutputSize({...seed(),...patch},'9:16','720p'),undefined);
 assert.equal(r.estimateVideoCost({...seed(),supportedSizes:['480x854']},{...base,resolution:'720p'}),undefined);
 assert.equal(r.resolveVideoOutputSize({...m,supportedSizes:['360x640','360x639']},'9:16','360p'),undefined);
});
check('known reference image charges are included and unbounded audio/video or unknown input-token charges cannot use output-only estimate',()=>{
 const request={...base,resolution:'480p',hasImageReferences:true,imageReferenceCount:2},cost=r.estimateVideoCost(seed(),request);
 assert.equal(r.estimateVideoCost({...seed(),pricingSkus:{...seed().pricingSkus,cents_per_image_input:1,reference_images:.02}},request),cost+.06);
 assert.equal(r.estimateVideoCost({...seed(),pricingSkus:{...seed().pricingSkus,input_image_tokens:.01}},request),undefined);
 assert.equal(r.estimateVideoCost({...seed(),pricingSkus:{...seed().pricingSkus,image_tokens:.01}},request),undefined);
 assert.equal(r.estimateVideoCost({...seed(),pricingSkus:{...seed().pricingSkus,audio_input_seconds:.01}},{...request,hasAudioReference:true}),undefined);
 assert.equal(r.estimateVideoCost({...seed(),pricingSkus:{...seed().pricingSkus,audio_tokens:.01}},{...request,hasAudioReference:true}),undefined);
 assert.equal(r.estimateVideoCost({...seed(),pricingSkus:{...seed().pricingSkus,unknown_units_with_audio:.01}},{...request,hasAudioReference:true}),undefined);
 assert.equal(r.estimateVideoCost(seed(),{...request,hasVideoReference:true}),undefined);
 assert.throws(()=>r.selectVideoRoute({...request,maximumCostUsd:.1},[seed()]),/cap|limit/);
});
console.log('Video reference semantics and exact pricing: '+groups+' PASS. Pure contracts, no database, provider or renderer calls.');
