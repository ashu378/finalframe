const assert = require('node:assert/strict');
const { load, fixture } = require('./backend-fixture.cjs');
const { compileRecipe, recipeHash } = load('src/lib/production/recipes/compiler.ts');
const local = load('convex/recipeLocal.ts');
const { resolveCardNarration } = load('convex/recipeNarration.ts');
process.env.FINALFRAME_RECIPE_ENABLED = 'true';
process.env.FINALFRAME_MANIFEST_V5_ENABLED = 'true';
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
async function setup() {
  const ctx = fixture(), voices = load('convex/voices.ts'), registry = load('src/lib/ai/model-registry.ts');
  ctx.put('voices', { _id:'voice', projectId:'project', kind:'STOCK', status:'READY', provider:'openrouter', providerVoiceId:'stock', settingsSnapshot:{modelId:registry.PREPARATION_MODELS.narration.id}, sampleAssetIds:[] });
  ctx.put('resourceStates', { _id:'voice-state', projectId:'project', resourceType:'voice', resourceId:'voice', state:'APPROVED' });
  const resolved = await voices.resolveVoiceSynthesisInput(ctx,{projectId:'project',voiceId:'voice',use:'SYNTHESIZE'});
  const voiceVersionId = await voices.freezeVoiceVersion(ctx,resolved,'user');
  const steps = [], text = ['Start with your idea.', 'Keep every final spoken word.'];
  for(let i=0;i<2;i++) {
    steps.push({key:'card'+i,operation:'GRAPHIC',templateId:'brand-card',durationFrames:120,title:'Card '+i,subtitle:'Exact copy',brandName:'FinalFrame'}, {key:'speech'+i,operation:'NARRATION',mode:'GENERATE',voiceId:'voice',text:text[i]});
    const id='audio'+i,storageId=id+'-storage',checksum='a'.repeat(64);
    ctx.put('assets',{_id:id,projectId:'project',scope:'PROJECT',studioExternalId:'studio',storageId,checksum,mimeType:'audio/wav',provenance:{generationJobId:'job'+i}});
    ctx.storageObjects.set(storageId,{size:100,sha256:checksum,contentType:'audio/wav'});
    ctx.put('resourceStates',{_id:id+'-state',projectId:'project',resourceType:'asset',resourceId:id,state:'APPROVED'});
    ctx.put('verifiedAudioProbes',{_id:id+'-probe',projectId:'project',assetId:id,storageId,checksum,byteSize:100,durationSeconds:i?2.4:1.2,durationMeasurement:'DECODED_PCM_SAMPLES_V1',hasVideo:false});
    ctx.put('generationJobs',{_id:'job'+i,projectId:'project',productionId:'production',status:'COMPLETED',operation:'PREPARATION',request:{preparationKind:'NARRATION',targetVoiceId:'voice',voiceVersionId,text:text[i]},response:{assetId:id}});
  }
  const snapshot={summary:'Original',sequences:[]},hash=await recipeHash(snapshot),binding={projectId:'project',productionId:'production',productionVersionId:'version',snapshotHash:hash};
  const recipe={kind:'finalframe.recipe',version:1,videoType:'EXPLAINER_STORY',binding,fps:30,steps:[...steps,{key:'captions',operation:'CAPTIONS',mode:'PLANNED_NARRATION',language:'en'}],visualOrder:['card0','card1'],narrationTracks:[0,1].map(i=>({stepKey:'speech'+i,visualStepKey:'card'+i,startFrame:0})),captionStepKey:'captions'};
  const context={binding,fps:30,productionVersionState:'APPROVED',continuityApproved:true,assets:[],shots:[],voices:[{id:'voice',projectId:'project',kind:'STOCK',approved:true,consentCurrent:false,sampleAssetIds:[]}],quotes:{}};
  const compiled=await compileRecipe(recipe,context,Date.now());
  ctx.put('productionVersions',{_id:'version',productionId:'production',sourcePlanId:'plan',status:'APPROVED',snapshot});
  ctx.put('recipeRuns',{_id:'run',projectId:'project',productionId:'production',productionVersionId:'version',boundRecipe:recipe,compiledPlanHash:compiled.recipeHash,createdByUserId:'user'});
  for(const [index,node] of compiled.nodes.entries()) ctx.put('recipeRunNodes',{_id:node.id,runId:'run',projectId:'project',productionVersionId:'version',nodeId:node.id,orderIndex:index,operation:node.operation,effect:node.effect,request:node.request,dependencies:node.dependencies,requestHash:node.requestHash,idempotencyKey:node.idempotencyKey,approvalTarget:node.approvalTarget,status:['GRAPHIC','NARRATION'].includes(node.operation)||node.id.startsWith('approve:speech')?'COMPLETED':'WAITING',...(node.operation==='NARRATION'?{resultId:'audio'+node.id.slice(-1),linkedGenerationJobId:'job'+node.id.slice(-1),voiceVersionId}:node.operation==='GRAPHIC'?{resultId:node.id}:{})});
  return {ctx,recipe,context,compiled,run:ctx.rows.get('run'),caption:ctx.rows.get('captions'),timeline:ctx.rows.get('timeline')};
}
(async()=>{
 await check('fresh narration binds every card, measured timing and explicit approvals without transcription',async()=>{
  const x=await setup(),t=x.compiled.nodes.find(n=>n.id==='timeline');
  assert.deepEqual(t.request.narrationTracks.map(t=>[t.startSeconds,t.durationSeconds,t.text]),[[0,4,'Start with your idea.'],[4,4,'Keep every final spoken word.']]);
  assert(t.dependencies.includes('approve:speech0')&&t.dependencies.includes('approve:speech1')&&t.dependencies.includes('approve:captions'));
  assert(!x.compiled.nodes.some(n=>n.operation==='PREPARATION'));
  const result=await resolveCardNarration(x.ctx,x.timeline,x.run);
  assert.deepEqual(result.audioTracks.map(t=>[t.startSeconds,t.durationSeconds,t.trimStartSeconds]),[[0,1.2,0],[4,2.4,0]]);
  assert.equal(result.cues[1].text,'Keep every final spoken word.');assert.equal(result.cues[1].startFrame,120);assert.equal(result.cues[1].durationInFrames,72);
 });
 await check('local captions and timeline retain independent measured lines and exact approved source bytes',async()=>{
  const x=await setup(),before=JSON.stringify([x.ctx.rows.get('audio0'),x.ctx.rows.get('audio1')]);
  const id=await local.captionDraft(x.ctx,x.caption,x.run,'user');
  assert.equal(x.ctx.rows.get(id).format,'PLANNED_NARRATION_LINES_V1');
  const state=[...x.ctx.rows.values()].find(r=>r._table==='resourceStates'&&r.resourceType==='caption');state.state='APPROVED';
  await local.executeRecipeLocal(x.ctx,x.timeline,x.run,'user');
  const clips=[...x.ctx.rows.values()].filter(r=>r._table==='timelineClips'&&r.metadata?.clipKind==='AUDIO');
  assert.deepEqual(clips.map(t=>[t.assetId,t.startSeconds,t.durationSeconds]),[['audio0',0,1.2],['audio1',4,2.4]]);
  assert.equal(JSON.stringify([x.ctx.rows.get('audio0'),x.ctx.rows.get('audio1')]),before);assert.equal(x.ctx.count('generationJobs'),2);assert.equal(x.ctx.count('transcripts'),0);
 });
 await check('a non-frame-aligned last word keeps its complete audio and final partial frame',async()=>{
  const x=await setup();x.ctx.rows.get('audio1-probe').durationSeconds=2.411;const result=await resolveCardNarration(x.ctx,x.timeline,x.run);assert.equal(result.audioTracks[1].durationSeconds,73/30);assert.equal(result.cues[1].source.audioDurationSeconds,2.411);assert.equal(result.cues[1].durationInFrames,73);assert.equal(result.audioTracks[1].trimStartSeconds,0);
 });
 await check('new timeline assembly retains full-frame narration coverage and caption offsets',async()=>{
  const x=await setup();x.ctx.rows.get('audio1-probe').durationSeconds=2.411;
  const id=await local.captionDraft(x.ctx,x.caption,x.run,'user');[...x.ctx.rows.values()].find(r=>r._table==='resourceStates'&&r.resourceType==='caption').state='APPROVED';
  await local.executeRecipeLocal(x.ctx,x.timeline,x.run,'user');
  const timelineId=x.ctx.rows.get('timeline').resultId;[...x.ctx.rows.values()].find(r=>r._table==='resourceStates'&&r.resourceType==='timeline').state='LOCKED';
  const result=await load('convex/assembly.ts').createCanonicalAssembly(x.ctx,{productionId:'production',timelineId,idempotencyKey:'card-narration-assembly',selectionScope:'TIMELINE'},'user');
  assert.deepEqual(result.manifest.audioTracks.map(t=>[t.startFrame,t.durationInFrames,t.trimStartInFrames]),[[0,36,0],[120,73,0]]);assert.equal(result.manifest.output.durationInFrames,240);assert.equal(result.manifest.captionTracks[0].cues[1].text,'Keep every final spoken word.');assert.equal(x.ctx.rows.get(id).cues[1].source.audioDurationSeconds,2.411);
 });
 await check('invalid card association, duplicate reuse and mixed global narration fail before purchase',async()=>{
  for(const change of [x=>x.recipe.narrationStepKey='speech0',x=>x.recipe.narrationTracks[1].stepKey='speech0',x=>x.recipe.narrationTracks[1].visualStepKey='card0',x=>x.recipe.narrationTracks[0].startFrame=1,x=>x.recipe.narrationTracks.pop(),x=>x.recipe.steps[1].mode='RECORDING',x=>x.recipe.steps[1].text='This complete line is intentionally much too long to say naturally inside its four second graphic card window before the next card starts.']){
   const x=await setup();change(x);await assert.rejects(compileRecipe(x.recipe,x.context,Date.now()));
  }
 });
 await check('overlong speech, changed timing/text, revoked voice and cross-project/stale media stop without trimming or writes',async()=>{
  for(const change of [x=>x.ctx.rows.get('audio1-probe').durationSeconds=4.01,x=>x.timeline.request.narrationTracks[1].startSeconds=0,x=>x.ctx.rows.get('job1').request.text='Changed words',x=>x.ctx.rows.get('voice').revokedAt=1,x=>x.ctx.rows.get('audio1').projectId='other',x=>x.ctx.rows.get('audio1-probe').storageId='other']){
   const x=await setup();change(x);const before=x.ctx.rows.size;await assert.rejects(resolveCardNarration(x.ctx,x.timeline,x.run));assert.equal(x.ctx.rows.size,before);
  }
 });
 await check('approved frozen voice remains bound when editable current voice settings change',async()=>{
  const x=await setup();x.ctx.rows.get('voice').settingsSnapshot={modelId:'changed/current'};const result=await resolveCardNarration(x.ctx,x.timeline,x.run);assert.equal(result.audioTracks.length,2);
 });
 console.log(`Card narration: ${checks} PASS; actual compiler/local handlers, isolated no-network storage seam; no database/provider calls.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
