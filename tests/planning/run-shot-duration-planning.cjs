const assert=require('node:assert/strict');
const {load,fixture}=require('../recipes/backend-fixture.cjs');
const duration=load('src/lib/production/shot-duration-planning.ts');
const routing=load('src/lib/ai/video-routing.ts');
const planning=load('convex/planningVideo.ts');
let checks=0;async function check(name,run){await run();checks++;console.log('PASS '+name);}
const now=Date.now();
function model(patch={}){return {provider:'openrouter',modelId:'test/current-video',available:true,reviewedAt:now,lastSeenAt:now,supportsTextToVideo:true,supportsImageReferences:true,supportsVideoReferences:false,supportsFirstFrame:true,supportsLastFrame:false,supportsVideoEdit:false,supportsVideoExtension:false,supportsAudio:false,supportedDurations:[4,6,8],supportedResolutions:['720p'],supportedAspectRatios:['16:9'],supportedParameters:[],pricingSkus:{'per-video-second':.01},...patch};}
const request={videoType:'CINEMATIC_FILM',qualityTier:'STANDARD',task:'GENERATE',operation:'GENERATE',aspectRatio:'16:9',audioPolicy:'SILENT'};
function state(){const ctx=fixture();ctx.rows.get('project').externalId='external-project';ctx.rows.get('project').projectType='CINEMATIC_FILM';ctx.rows.get('production').externalProjectId='external-project';ctx.rows.get('production').outputPreset='LANDSCAPE';ctx.put('videoModelCatalog',{...model(),_id:'catalog',studioExternalId:'studio'});return ctx;}
function plan(){return {summary:'An original thirty-second test story.',workflow:'SHORT_FILM',sequences:[{title:'Sequence',description:'Original',orderIndex:0,scenes:[{title:'Scene',purpose:'Setup and payoff',visualDirection:'Original',orderIndex:0,shots:Array.from({length:5},(_,index)=>({title:'Shot '+index,prompt:'Original clear coverage '+index,durationSeconds:6,orderIndex:index,requiredAssetIds:[],aspectRatio:'16:9',audioPolicy:'SILENT',resourceBindings:[],dialogueSegments:[]}))}]}]};}
(async()=>{
 await check('exact thirty seconds prefers five viable six-second shots without modifying original dialogue',()=>{
  const durations=duration.eligibleShotDurations(request,[model()],undefined,now);assert.deepEqual(durations,[4,6,8]);assert.deepEqual(duration.exactShotSchedule(30,durations),[6,6,6,6,6]);
  assert.throws(()=>duration.exactShotSchedule(30,[4,8]),/cannot be made exactly/);assert.throws(()=>duration.exactShotSchedule(3,[4,6,8]),/No reviewed/);
  assert.deepEqual(duration.exactShotSchedule(6,[2,4,8]),[4,2]);
 });
 await check('durations come from reviewed current routing and enforce ratio, references, frames, audio, quality and spending caps',()=>{
  for(const patch of [{available:false},{reviewedAt:undefined},{lastSeenAt:now-routing.VIDEO_CATALOG_MAX_AGE_MS-1},{platformQuarantinedAt:now},{reviewedCatalogFingerprint:'changed'},{provider:'unapproved'}])assert.deepEqual(duration.eligibleShotDurations(request,[model(patch)],undefined,now),[]);
  for(const patch of [{aspectRatio:'9:16'},{requiresLastFrame:true},{requiresAudio:true},{hasVideoReference:true},{resolution:'4k'},{maximumCostUsd:.001}])assert.deepEqual(duration.eligibleShotDurations({...request,...patch},[model()],undefined,now),[]);
  assert.deepEqual(duration.eligibleShotDurations({...request,hasImageReferences:true,imageReferenceCount:1},[model()],undefined,now),[4,6,8]);
  assert.deepEqual(duration.eligibleShotDurations({...request,qualityTier:'PREMIUM'},[model()],undefined,now),[]);
  assert.deepEqual(duration.eligibleShotDurations({...request,qualityTier:'PREMIUM'},[model()],{videoType:'CINEMATIC_FILM',qualityTier:'PREMIUM',path:'AI_VIDEO',preferredModelIds:['test/current-video'],maxCostUsd:1},now),[4,6,8]);
 });
 await check('invalid provider shots or wrong totals fail rather than shortening coverage or cutting a spoken line',()=>{
  const shots=Array.from({length:5},()=>({durationSeconds:6,request}));assert.equal(duration.validatePlannedShotDurations(shots,30,[model()],undefined,now).length,5);
  assert.throws(()=>duration.validatePlannedShotDurations([{durationSeconds:3,request}],3,[model()],undefined,now),/Shot1|Shot 1/);
  assert.throws(()=>duration.validatePlannedShotDurations(shots,29,[model()],undefined,now),/instead of/);
 });
 await check('online-shaped preflight proposes explicit alternate framing and deterministic composition needs no video catalog',async()=>{
  const ctx=state();const args={asOf:Date.now(),projectId:'project',durationSeconds:30,outputPreset:'PORTRAIT_FEED',input:{mode:'IDEA',qualityTier:'STANDARD',inputAssetIds:[]}};
  const constraints=await ctx.call('planningVideo','constraints',args);assert.equal(constraints.finalAspectRatio,'4:5');assert.equal(constraints.options[0].aspectRatio,'16:9');assert.deepEqual(constraints.options[0].suggestedShotSeconds,[6,6,6,6,6]);
  ctx.rows.get('project').projectType='MOTION_GRAPHICS';ctx.rows.delete('catalog');const graphic=await ctx.call('planningVideo','constraints',args);assert.equal(graphic.mode,'RENDERER');assert.equal(graphic.options[0].aspectRatio,'4:5');
  ctx.role='VIEWER';await assert.rejects(ctx.call('planningVideo','constraints',args),/access denied/);assert.equal(ctx.count('generationJobs'),0);assert.equal(ctx.count('providerBudgetReservations'),0);
 });
 await check('fresh server arguments and production recipe selection prevent cached or project-global misrouting',async()=>{
  const ctx=state(),args={asOf:Date.now(),projectId:'project',productionId:'production',durationSeconds:30,outputPreset:'LANDSCAPE',input:{mode:'IDEA',qualityTier:'STANDARD',videoType:'MOTION_GRAPHICS',inputAssetIds:[]}};
  ctx.rows.delete('catalog');assert.equal((await ctx.call('planningVideo','constraints',args)).mode,'RENDERER');
  await assert.rejects(ctx.call('planningVideo','constraints',{...args,asOf:Date.now()-31000}),/expired/);
  await assert.rejects(ctx.call('planningVideo','constraints',{...args,input:{...args.input,videoType:'invented-recipe'}}),/supported video recipe/);
  const made=await ctx.call('productions','createPlan',{studioExternalId:'studio',projectExternalId:'external-project',productionId:'production',workflow:'SHORT_FILM',inputMode:'SCRIPT',durationSeconds:30,language:'en',outputPreset:'LANDSCAPE',input:{...args.input,mode:'SCRIPT'},plan:plan(),estimate:{},idempotencyKey:'changed-production-type'});
  assert.equal(ctx.rows.get(made.planId).input.videoType,'MOTION_GRAPHICS');assert.notEqual(ctx.rows.get('production').projectType,'MOTION_GRAPHICS','Draft must not rewrite the earlier approved production type');
  process.env.FINALFRAME_RECIPE_ENABLED='true';assert.equal((await ctx.call('recipeWorkspace','get',{productionId:'production'})).videoType,'MOTION_GRAPHICS');
  await ctx.call('productions','approvePlan',{planId:made.planId});assert.equal(ctx.rows.get('production').projectType,'MOTION_GRAPHICS');assert.equal(ctx.rows.get('project').projectType,'CINEMATIC_FILM');
 });
 await check('actual canonical create and approval recheck provider-backed shots, preserve manual drafts and remain idempotent',async()=>{
  const ctx=state(),original=plan();ctx.put('providerTextRequests',{_id:'text-receipt',projectId:'project',createdByUserId:'user',capability:'STRUCTURED_PLANNING',status:'COMPLETED'});
  const args={studioExternalId:'studio',projectExternalId:'external-project',productionId:'production',workflow:'SHORT_FILM',inputMode:'IDEA',durationSeconds:30,language:'en',outputPreset:'LANDSCAPE',input:{mode:'IDEA',qualityTier:'STANDARD',inputAssetIds:[],planningReceipt:{requestId:'text-receipt'}},plan:original,estimate:{providerCalls:0}};
  const bad=structuredClone(args);bad.plan.sequences[0].scenes[0].shots[0].durationSeconds=3;await assert.rejects(ctx.call('productions','createPlan',bad));assert.equal(ctx.count('directorPlans'),0);
  const made=await ctx.call('productions','createPlan',args),replay=await ctx.call('productions','createPlan',args);assert.equal(replay.planId,made.planId);assert.equal(ctx.count('directorPlans'),1);assert.equal(ctx.rows.get(made.planId).input.planningVideoContract.mode,'AI_VIDEO');
  ctx.rows.get('catalog').supportedDurations=[4,8];await assert.rejects(ctx.call('productions','approvePlan',{planId:made.planId}));assert.equal(ctx.rows.get(made.versionId).status,'DRAFT');
  ctx.rows.get('catalog').supportedDurations=[4,6,8];await ctx.call('productions','approvePlan',{planId:made.planId});assert.equal(ctx.rows.get(made.versionId).status,'APPROVED');
  const approved=structuredClone(ctx.rows.get(made.versionId));await ctx.call('productions','approvePlan',{planId:made.planId});assert.deepEqual(ctx.rows.get(made.versionId),approved);
  const manual=structuredClone(args);delete manual.input.planningReceipt;manual.input.planningVideoContract={mode:'AI_VIDEO',forged:true};manual.idempotencyKey='manual-graph-unreviewed';manual.plan.sequences[0].scenes[0].shots[0].durationSeconds=3;const draft=await ctx.call('productions','createPlan',manual);assert.equal(ctx.rows.get(draft.planId).input.planningVideoContract,undefined);assert.equal(ctx.rows.get(draft.versionId).status,'DRAFT');
  assert.equal(ctx.count('generationJobs'),0);assert.equal(ctx.count('providerBudgetReservations'),0);
 });
 await check('ordinary server action sends reviewed duration schedule before one planning call and rejects invalid response without fake coverage or new writes',async()=>{
  const h=require('../generation/run-operation-controls.cjs'),old=process.env.FINALFRAME_PLANNING_FALLBACK_ENABLED;process.env.FINALFRAME_PLANNING_FALLBACK_ENABLED='false';
  try{for(const invalid of [false,true]){
   const ctx=state(),calls=[],actual=plan();Object.assign(actual,{assumptions:[],questions:[],operations:[],bible:{projectContext:{title:'Original',duration:30,language:'en'},characters:[],locations:[],products:[],style:{},story:{}}});
   if(invalid)actual.sequences[0].scenes[0].shots[0].durationSeconds=3;
   const client={query:async(ref,args)=>{calls.push({kind:'query',ref,args});if(ref==='account.current')return{studio:{externalId:'studio'}};if(ref==='projects.list')return[ctx.rows.get('project')];if(ref==='continuity.planningRequirements')return{productionId:'production',requiresBible:false};if(ref==='continuity.productionPlanningContext')return null;if(ref==='credits.getBalance')return 1000;if(ref.startsWith('planningVideo.'))return ctx.call('planningVideo',ref.split('.')[1],args);throw Error('Unexpected query '+ref);},action:async(ref,args)=>{calls.push({kind:'action',ref,args});if(ref==='videoRouting.refreshReviewedForQuote')return null;if(ref==='providerText.execute'){ctx.put('providerTextRequests',{_id:'text-receipt',projectId:'project',createdByUserId:'user',capability:'STRUCTURED_PLANNING',status:'COMPLETED'});return{content:JSON.stringify(actual),providerTextRequestId:'text-receipt',modelUsed:'test/planner'};}throw Error('Unexpected action '+ref);},mutation:async(ref,args)=>{calls.push({kind:'mutation',ref,args});if(ref==='productions.createPlan')return ctx.call('productions','createPlan',args);throw Error('Unexpected mutation '+ref);}};
   const actions=h.compile('src/lib/production/actions.ts',{'next/cache':{revalidatePath:()=>{}},'@convex-dev/auth/nextjs/server':{convexAuthNextjsToken:async()=> 'private-fixture-token'},'@/lib/convex/server':{getAuthenticatedConvexClient:async()=>client},'../../../convex/_generated/api':{api:h.api},'@/lib/ai/types':h.compile('src/lib/ai/types.ts'),'@/lib/credits/service':{estimateProductionCost:async()=>({totalCredits:1,operations:[]})},'@/lib/production/planning-schema':load('src/lib/production/planning-schema.ts'),'./shot-duration-planning':duration});
   const result=await actions.createDirectorPlan({projectId:'external-project',mode:'IDEA',prompt:'An original thirty-second story',inputAssetIds:[],requestedDurationSeconds:30,outputPreset:'LANDSCAPE',qualityTier:'STANDARD'});
   const paid=calls.filter(call=>call.ref==='providerText.execute');assert.equal(paid.length,1);const prompt=JSON.parse(paid[0].args.messages[1].content);assert.deepEqual(prompt.shotConstraints.options[0].suggestedShotSeconds,[6,6,6,6,6]);
   if(invalid){assert.equal(result.success,false);assert.match(result.error,/total|duration|Shot/);assert.equal(ctx.count('directorPlans'),0);}else{assert.equal(result.success,true,JSON.stringify({result,calls:calls.map(call=>call.ref)}));assert.equal(result.plan.sequences[0].scenes[0].shots.length,5);assert.equal(ctx.count('directorPlans'),1);}
   assert.equal(ctx.count('generationJobs'),0);assert.equal(ctx.count('providerBudgetReservations'),0);
  }}finally{if(old===undefined)delete process.env.FINALFRAME_PLANNING_FALLBACK_ENABLED;else process.env.FINALFRAME_PLANNING_FALLBACK_ENABLED=old;h.cleanup();}
 });
 await check('indexed plan and production-version maxima preserve legacy high numbers without collecting history',async()=>{
  const ctx=state();
  for(const [id,versionNumber]of [['highest-old-plan',900],['recent-lower-plan',3],['legacy-unnumbered',undefined]])ctx.put('directorPlans',{_id:id,productionId:'production',versionNumber,input:{},plan:{},estimate:{},status:'SUPERSEDED'});
  for(const [id,versionNumber]of [['highest-old-version',700],['recent-lower-version',2]])ctx.put('productionVersions',{_id:id,productionId:'production',versionNumber,sourcePlanId:'old-plan-'+id,status:'APPROVED'});
  const query=ctx.db.query;ctx.db.query=table=>{const result=query(table);if(['directorPlans','productionVersions'].includes(table))result.collect=async()=>{throw Error('Unbounded history reads forbidden');};return result;};
  const made=await ctx.call('productions','createPlan',{studioExternalId:'studio',projectExternalId:'external-project',productionId:'production',workflow:'SHORT_FILM',inputMode:'SCRIPT',durationSeconds:30,language:'en',outputPreset:'LANDSCAPE',input:{},plan:plan(),estimate:{},idempotencyKey:'indexed-version-max-test'});
  assert.equal(ctx.rows.get(made.planId).versionNumber,901);assert.equal(ctx.rows.get(made.versionId).versionNumber,701);
 });
 await check('canonical shot quote ignores forged top-level and nested recipe types in favor of approved source-plan intent',async()=>{
  const h=require('../generation/run-operation-controls.cjs');try{const state=h.backendFixture({operation:'GENERATE'});state.rows.get('production').projectType='REALISTIC_SKIT_UGC';state.rows.get('version').sourcePlanId='approved-plan';state.rows.set('approved-plan',{_id:'approved-plan',table:'directorPlans',productionId:'production',input:{videoType:'CINEMATIC_FILM'}});
   const quote=await state.preview({request:{videoType:'MOTION_GRAPHICS',constraints:{videoType:'MOTION_GRAPHICS'},ratio:'16:9'}});assert.equal(state.routeChecks[0].videoType,'CINEMATIC_FILM');assert.equal(state.routeChecks[0].constraints,undefined);const job=await state.confirm(quote);assert.equal(state.rows.get(job._id).request.videoType,'CINEMATIC_FILM');
  }finally{h.cleanup();}
 });
 console.log(`Shot duration planning: ${checks} PASS; real pure routing and canonical Convex handlers with transactional seams, no database/provider/render calls.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
