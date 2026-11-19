const assert = require('node:assert/strict');
const { load, fixture } = require('./backend-fixture.cjs');
const { parseUgcBrief, EMPTY_UGC_BRIEF, assessSpeechFit, ugcPlanningInstructions } = load('src/lib/production/ugc-brief.ts');
const { compileRecipe } = load('src/lib/production/recipes/compiler.ts');
const { resolvePaidRecipeInput } = load('convex/recipePlanning.ts');
const contract = load('src/lib/ai/model-registry.ts').REVIEWED_OPERATION_CONTRACTS.suppliedAudioAvatar;
let checks=0; async function check(name,fn){await fn();console.log('PASS '+name);checks++;}
function input(){
 const binding={projectId:'project',productionId:'production',productionVersionId:'version',snapshotHash:'a'.repeat(64)};
 const assets=[['portrait','image/png'],['speech','audio/wav']].map(([id,mimeType])=>({id,projectId:'project',storageId:id+'-storage',checksum:'a'.repeat(64),byteSize:128,mimeType,state:'APPROVED',rightsApproved:true,durationSeconds:4}));
 const context={binding,fps:30,productionVersionState:'APPROVED',continuityApproved:true,assets,shots:[{id:'shot',operation:'LIP_SYNC',nativeAudioPolicy:'USE_RECORDING',productionVersionId:'version',prompt:'An original speaker says the supplied words.',durationFrames:120,referenceAssetIds:['portrait','speech'],approvedRecipeReferenceSlots:[]}],voices:[],quotes:{}};
 const recipe={kind:'finalframe.recipe',version:1,videoType:'REALISTIC_SKIT_UGC',binding,fps:30,steps:[{key:'talk',operation:'GENERATION',shotId:'shot',references:[{assetId:'portrait'},{assetId:'speech'}]}],visualOrder:['talk']};return {context,recipe};
}
(async()=>{
 await check('optional UGC brief validates exact bounded fields without approval authority',()=>{
  assert.equal(parseUgcBrief(undefined),undefined);assert.deepEqual(parseUgcBrief(EMPTY_UGC_BRIEF),EMPTY_UGC_BRIEF);
  for(const v of [null,{}, {...EMPTY_UGC_BRIEF,speechMode:'AUTO_CLONE'},{...EMPTY_UGC_BRIEF,productFacts:'x'.repeat(3001)},{...EMPTY_UGC_BRIEF,approved:true}])assert.throws(()=>parseUgcBrief(v));
  assert(ugcPlanningInstructions({...EMPTY_UGC_BRIEF,speechMode:'KEEP_ORIGINAL'}).includes('Do not synthesize replacement speech'));
  assert(ugcPlanningInstructions({...EMPTY_UGC_BRIEF,speechMode:'VOICEOVER'}).includes('Do not purchase lip sync'));
 });
 await check('speech preflight flags rushed lines and counts non-whitespace scripts without changing words',()=>{
  assert(assessSpeechFit('Hello there.',4).fits);assert(!assessSpeechFit('one '.repeat(60),4).fits);
  assert(!assessSpeechFit('这是一个很长的句子'.repeat(10),4).fits);assert(!assessSpeechFit('Hello',NaN).fits);
  assert(assessSpeechFit('Na me own this puff-puff!',4).fits);
 });
 await check('portrait speech compiles through canonical take approval and export without a second narration charge',async()=>{
  const {recipe,context}=input();const plan=await compileRecipe(recipe,context,Date.now());
  assert.deepEqual(plan.nodes.filter(n=>n.effect==='PAID').map(n=>n.id),['talk']);assert.equal(plan.nodes.at(-1).operation,'EXPORT');
  assert(plan.nodes.find(n=>n.id==='timeline').dependencies.includes('approve:talk'));assert.equal(plan.nodes[0].request.shot.operation,'LIP_SYNC');
 });
 await check('lip sync rejects foreign/unapproved media, audio replacement and clipped speech before purchase',async()=>{
  for(const change of [c=>c.assets[0].projectId='other',c=>c.assets[1].state='DRAFT',c=>c.assets[1].durationSeconds=5,c=>c.shots[0].nativeAudioPolicy='GENERATE',c=>c.assets[0].mimeType='video/mp4']){
   const {recipe,context}=input();change(context);await assert.rejects(compileRecipe(recipe,context,Date.now()));
  }
 });
 await check('on-camera briefs reject a voiceover-only recipe and original-audio briefs reject replacement synthesis',async()=>{
  const {recipe,context}=input();context.speechMode='ON_CAMERA';await compileRecipe(recipe,context,Date.now());
  context.shots[0].operation='GENERATE';await assert.rejects(compileRecipe(recipe,context,Date.now()),/ON_CAMERA_SETUP/);
  context.shots[0].operation='LIP_SYNC';context.speechMode='KEEP_ORIGINAL';await assert.rejects(compileRecipe(recipe,context,Date.now()),/ORIGINAL_AUDIO/);
 });
 await check('multi-view identity sends only the selected portrait to lip sync and rejects another character',async()=>{
  const ctx=fixture(),resolve=load('convex/generationContinuity.ts').resolveGenerationContinuity;
  const resource={_id:'character',projectId:'project',kind:'CHARACTER',name:'Original speaker'},version={_id:'character-v1',projectId:'project',resourceId:'character',profile:{description:'Original'},assetIds:['front','side']};
  ctx.put('projectResources',resource);ctx.put('projectResourceVersions',version);
  ctx.put('continuityBibles',{_id:'bible',projectId:'project',state:'APPROVED',snapshot:{resourceBindings:[{resourceVersionId:version._id}]}});
  for(const [resourceType,resourceId]of [['projectResourceVersion',version._id],['continuityBible','bible']])ctx.put('resourceStates',{_id:resourceId+'-state',projectId:'project',resourceType,resourceId,state:'APPROVED'});
  for(const id of version.assetIds)ctx.put('assets',{_id:id,projectId:'project',scope:'PROJECT',storageId:id+'-storage'});
  const args={projectId:'project',productionId:'production',snapshot:{projectId:'project',productionId:'production',continuityBibleId:'bible',resources:[{resourceId:resource._id,resourceVersionId:version._id,profile:version.profile,assetIds:version.assetIds}]},explicitResourceVersionIds:[version._id],referenceAssetIds:['front','speech'],shotMetadata:{operation:'LIP_SYNC'}};
  assert.deepEqual((await resolve(ctx,args)).referenceAssetIds,['front','speech']);
  assert.deepEqual((await resolve(ctx,{...args,shotMetadata:{operation:'GENERATE'}})).referenceAssetIds,['front','speech','side']);
  await assert.rejects(resolve(ctx,{...args,referenceAssetIds:['front','side','speech']}),/exactly one/);
  ctx.rows.get('side').projectId='foreign';await assert.rejects(resolve(ctx,args),/Import every/);
 });
 await check('actual paid-input resolver uses measured supplied audio, certified model, project assets and exact price',async()=>{
  const ctx=fixture(),{recipe,context}=input();
  for(const asset of context.assets){ctx.put('assets',{_id:asset.id,projectId:'project',scope:'PROJECT',storageId:asset.storageId,checksum:asset.checksum,mimeType:asset.mimeType,rights:{status:'OWNED'}});ctx.storageObjects.set(asset.storageId,{sha256:asset.checksum,size:128,contentType:asset.mimeType});ctx.put('resourceStates',{_id:'state-'+asset.id,projectId:'project',resourceType:'asset',resourceId:asset.id,state:'APPROVED'});}
  ctx.put('verifiedAudioProbes',{_id:'audio-probe',projectId:'project',assetId:'speech',storageId:'speech-storage',checksum:'a'.repeat(64),byteSize:128,durationSeconds:4,audioCodec:'pcm_s16le',audioFormat:'wav',durationMeasurement:'DECODED_PCM_SAMPLES_V1',sampleRate:16000,channels:1,hasVideo:false});
  ctx.put('verifiedImageProbes',{_id:'portrait-probe',projectId:'project',assetId:'portrait',storageId:'portrait-storage',checksum:'a'.repeat(64),byteSize:128,width:512,height:512,imageCodec:'png'});
  ctx.put('shots',{_id:'shot',projectId:'project',productionVersionId:'version',durationSeconds:4,metadata:{operation:'LIP_SYNC',videoTask:'EDIT',audioPolicy:'USE_RECORDING'}});
  ctx.put('videoModelCatalog',{_id:'model',studioExternalId:'studio',provider:'openrouter',modelId:contract.modelId,canonicalSlug:contract.canonicalSlug,available:true,reviewedAt:1,lastSeenAt:Date.now(),supportsImageReferences:true,supportsAudioReferences:true,supportsLipSync:true,reviewedOperations:['LIP_SYNC'],supportedDurations:[],supportedResolutions:['720p','1080p'],supportedAspectRatios:['16:9','9:16','1:1'],supportedParameters:[...contract.passthrough],pricingSkus:{duration_seconds:.05}});
  const plan=await compileRecipe(recipe,context,Date.now());const node={...plan.nodes[0],_id:'node',nodeId:'talk',projectId:'project',runId:'run'};
  const run={_id:'run',projectId:'project',productionId:'production',productionVersionId:'version',boundRecipe:recipe,canonicalContext:{executionIntent:{qualityTier:'STANDARD',generationResolution:'480p'}}};
  const result=await resolvePaidRecipeInput(ctx,node,run);assert.equal(result.bindings.createArgs.model,contract.modelId);assert.equal(result.bindings.createArgs.request.operation,'LIP_SYNC');assert.equal(result.bindings.createArgs.request.lipSyncSource.assetId,'speech');assert.equal(result.bindings.createArgs.estimatedProviderCostUsd,.25);assert.equal(ctx.count('generationJobs'),0);
  const validate=load('convex/planningVideo.ts').validateAutomaticVideoPlan;
  const planningShot={title:'Talk',durationSeconds:4,requiredAssetIds:['portrait','speech'],metadata:{operation:'LIP_SYNC',audioPolicy:'USE_RECORDING'}};
  const planningGraph={sequences:[{scenes:[{shots:[planningShot]}]}]};
  await validate(ctx,ctx.rows.get('project'),{mode:'IDEA',videoType:'REALISTIC_SKIT_UGC'},'VERTICAL',4,planningGraph,'production',{});
  planningShot.durationSeconds=5;
  await assert.rejects(validate(ctx,ctx.rows.get('project'),{mode:'IDEA',videoType:'REALISTIC_SKIT_UGC'},'VERTICAL',5,planningGraph,'production',{}));
  ctx.rows.get('speech').projectId='other';await assert.rejects(resolvePaidRecipeInput(ctx,node,run));ctx.rows.get('speech').projectId='project';ctx.rows.get('audio-probe').durationSeconds=4.3;await assert.rejects(resolvePaidRecipeInput(ctx,node,run),/TIMING_REQUIRED/);
 });
 console.log(`UGC and speech: ${checks} PASS; pure/canonical handler seams, no database or provider calls.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
