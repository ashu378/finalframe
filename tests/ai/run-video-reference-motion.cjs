const assert=require('node:assert/strict');
const{load}=require('../recipes/backend-fixture.cjs');
const r=load('src/lib/ai/video-routing.ts'),c=load('src/lib/ai/video-reference-contracts.ts');
let groups=0;function check(name,fn){fn();groups++;console.log('PASS '+name);}
function model(){return{provider:'openrouter',modelId:'bytedance/seedance-2.5',canonicalSlug:'bytedance/seedance-2.5-20260807',available:true,supportsTextToVideo:true,supportsImageReferences:true,supportsVideoReferences:true,supportsPerformanceTransfer:true,supportsAudioReferences:true,supportsAudio:true,supportsFirstFrame:true,supportsLastFrame:true,reviewedOperations:['PERFORMANCE_TRANSFER'],supportedDurations:[4,5,6,8],supportedResolutions:['480p','720p'],supportedAspectRatios:['16:9','9:16'],supportedSizes:['854x480','480x854','1280x720','720x1280'],supportedParameters:['watermark','req_key','output_format'],pricingSkus:{video_tokens:.0000107,video_tokens_without_audio:.0000107,video_tokens_with_video_input:.0000064}};}
function source(){return{assetId:'owned-video',storageId:'storage-original',checksum:'a'.repeat(64),byteSize:12345,mimeType:'video/mp4',videoCodec:'h264',width:854,height:480,durationSeconds:4,videoTiming:{version:'DECODED_VIDEO_FRAMES_V1',frameCount:96,fpsNumerator:24,fpsDenominator:1,firstFrameSeconds:0,durationSeconds:4}};}
function request(){return{videoType:'REALISTIC_SKIT_UGC',task:'EDIT',operation:'PERFORMANCE_TRANSFER',qualityTier:'ECONOMY',audioPolicy:'SILENT',durationSeconds:5,aspectRatio:'16:9',resolution:'480p',hasImageReferences:true,imageReferenceCount:1,hasVideoReference:true,videoReferenceCount:1,motionSource:source()};}
function quote(m=model(),q=request()){return c.quotePromptMotionTransfer(m,q,r.videoCatalogQuoteFingerprint(m));}
check('exact reviewed source-motion path is eligible and freezes source, catalog and native pixels',()=>{
 const m=model(),q=request();assert.equal(r.videoModelSupportsRequest(m,q),true);const selected=r.selectVideoRoute(q,[m]);
 assert.equal(selected.motionQuote.version,'SEEDANCE_PROMPT_LED_VIDEO_REFERENCE_V1');assert.equal(selected.motionQuote.catalogQuoteFingerprint,r.videoCatalogQuoteFingerprint(m));
 assert.deepEqual([selected.expectedNativeOutput.width,selected.expectedNativeOutput.height],[854,480]);assert.match(selected.routeReason,/does not guarantee frame-exact/);
 assert.deepEqual(r.buildVideoRouteMetadata(q,selected).motionQuote,selected.motionQuote);q.motionSource.storageId='changed-after-quote';assert.equal(selected.motionQuote.source.storageId,'storage-original');
});
check('full input plus output and published narrow minimum-cell upper estimate are included; provider authorization is not margined twice',()=>{
 for(const durationSeconds of[2,3,4]){const q=request();q.motionSource.durationSeconds=durationSeconds;q.motionSource.videoTiming.durationSeconds=durationSeconds;q.motionSource.videoTiming.frameCount=durationSeconds*24;const receipt=quote(model(),q);assert.equal(receipt.inputDurationSeconds,durationSeconds);assert.equal(receipt.estimatedVideoTokens,86563);assert.equal(receipt.estimatedCostUsd,.554004);assert.equal(receipt.authorizationUsd,2);assert.equal(receipt.reservedProviderUsd,2);assert.equal(r.estimateVideoCost(model(),q),.554004);}
 assert(quote().estimatedCostUsd>854*480*24*5/1024*.0000064,'Never use output-only price');
 const square=request();square.motionSource={...source(),width:720,height:720,durationSeconds:3.92,videoTiming:{...source().videoTiming,frameCount:98,fpsNumerator:25,durationSeconds:3.92}};
 assert.equal(quote(model(),square).estimatedCostUsd,.624967);assert.equal(quote(model(),square).reservedProviderUsd,2);
 const large=request();large.motionSource={...source(),width:1920,height:1080,videoTiming:{...source().videoTiming,frameCount:240,fpsNumerator:60}};
 assert(quote(model(),large).estimatedCostUsd>3.4);assert(quote(model(),large).reservedProviderUsd>3.5);assert.equal(r.videoModelSupportsRequest(model(),{...large,maximumCostUsd:2}),false);
 assert.equal(r.videoModelSupportsRequest(model(),{...request(),maximumCostUsd:.55}),false);
});
check('source proof requires exact stored MP4/H264 bytes and bounded coherent decoded timing',()=>{
 assert.equal(c.validMotionSource(source()),true);
 for(const patch of[{assetId:''},{assetId:3},{storageId:''},{storageId:{}},{checksum:'bad'},{byteSize:0},{byteSize:32_000_001},{mimeType:'video/webm'},{videoCodec:'hevc'},{width:299},{width:640,height:360},{width:300,height:1800},{width:1800,height:300},{width:1921},{width:1920,height:1920},{durationSeconds:1.99},{durationSeconds:4.01},{durationSeconds:NaN}])assert.equal(quote(model(),{...request(),motionSource:{...source(),...patch}}),undefined,JSON.stringify(patch));
 for(const patch of[{version:'metadata-only'},{frameCount:95},{frameCount:0},{fpsNumerator:0},{fpsDenominator:0},{fpsNumerator:23},{fpsNumerator:61},{firstFrameSeconds:-1},{firstFrameSeconds:.1},{durationSeconds:3.99}])assert.equal(quote(model(),{...request(),motionSource:{...source(),videoTiming:{...source().videoTiming,...patch}}}),undefined,JSON.stringify(patch));
});
check('flags never replace source proof or permit another model, catalog or unknown billing unit',()=>{
 assert.equal(r.videoModelSupportsRequest(model(),{...request(),motionSource:undefined}),false);
 for(const patch of[{modelId:'other/model'},{canonicalSlug:'new-version'},{provider:'other'},{supportsPerformanceTransfer:false},{supportsVideoReferences:false},{supportsImageReferences:false},{reviewedOperations:[]}])assert.equal(r.videoModelSupportsRequest({...model(),...patch},request()),false,JSON.stringify(patch));
 for(const pricingSkus of[{...model().pricingSkus,video_tokens_with_video_input:.0000065},{...model().pricingSkus,image_tokens:.01},{video_tokens_with_video_input:.0000064}])assert.equal(quote({...model(),pricingSkus}),undefined);
});
check('exact one source and identity, output cell and silent new-clip controls remain mandatory',()=>{
 for(const patch of[{task:'GENERATE'},{operation:'GENERATE'},{audioPolicy:'KEEP_SOURCE'},{audioPolicy:'GENERATE'},{audioPolicy:'USE_RECORDING'},{audioPolicy:undefined},{hasImageReferences:false},{imageReferenceCount:0},{imageReferenceCount:2},{videoReferenceCount:undefined},{videoReferenceCount:2},{hasVideoReference:false},{hasAudioReference:true},{requiresAudio:true},{requiresMask:true},{requiresSourceAudioPreservation:true},{requiresFirstFrame:true},{requiresLastFrame:true},{previousJobId:'accepted-job'},{previousModelId:model().modelId},{upscaleFactor:2},{creativity:0},{durationSeconds:4},{durationSeconds:6},{resolution:'720p'},{aspectRatio:'9:16'}])assert.equal(quote(model(),{...request(),...patch}),undefined,JSON.stringify(patch));
 assert.equal(r.estimateVideoCost(model(),{...request(),operation:'GENERATE',task:'GENERATE'}),undefined,'Generic video references stay unpriced');
 assert.equal(r.certifyNativeVideoOutput(model(),{...request(),motionSource:undefined}),undefined);
});
console.log(`Prompt-led motion reference contracts: ${groups} PASS. No network, database, provider or renderer calls.`);
