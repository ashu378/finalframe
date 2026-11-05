const assert = require('node:assert/strict');
const { load, fixture } = require('./backend-fixture.cjs');
const { compileRecipe, recipeHash } = load('src/lib/production/recipes/compiler.ts');
const proposals = load('src/lib/production/recipes/proposal.ts');
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
function input() {
  const binding = { projectId: 'project', productionId: 'production', productionVersionId: 'version', snapshotHash: 'a'.repeat(64) };
  const segments = [1,2].map(i => ({ speakerResourceVersionId: 'character-'+i, voiceVersionId: 'voice-v'+i, startSeconds: .25, durationSeconds: 2, text: 'Exact line '+i }));
  const recipe = { kind: 'finalframe.recipe', version: 1, videoType: 'CINEMATIC_FILM', binding, fps: 30, steps: segments.flatMap((segment,index) => [{ key: 'picture'+index, operation:'GENERATION', shotId:'shot'+index, references:[] }, { key: 'speech'+index, operation:'NARRATION', mode:'GENERATE', text: segment.text, voiceId:'same-profile', voiceVersionId:segment.voiceVersionId }]), visualOrder:['picture0','picture1'], dialogueTracks:segments.map((_,index)=>({stepKey:'speech'+index,shotId:'shot'+index,segmentIndex:0})) };
  const context = { binding, fps:30, productionVersionState:'APPROVED', continuityApproved:true, assets:[], shots:segments.map((segment,index)=>({id:'shot'+index,productionVersionId:'version',prompt:'Original shot '+index,durationFrames:120,referenceAssetIds:[],approvedRecipeReferenceSlots:[],nativeAudioPolicy:'SILENT',dialogueSegments:[segment]})), voices:segments.map(segment=>({id:'same-profile',voiceVersionId:segment.voiceVersionId,projectId:'project',kind:'STOCK',approved:true,consentCurrent:false,sampleAssetIds:[]})), quotes:{} };
  return {recipe,context};
}
function audio(ctx,id,durationSeconds) {
  const checksum='a'.repeat(64),storageId=id+'-storage';
  ctx.put('assets',{_id:id,projectId:'project',studioExternalId:'studio',scope:'PROJECT',storageId,checksum,mimeType:'audio/wav'});
  ctx.storageObjects.set(storageId,{size:100,sha256:checksum,contentType:'audio/wav'});
  ctx.put('resourceStates',{_id:id+'-approval',projectId:'project',resourceType:'asset',resourceId:id,state:'APPROVED'});
  ctx.put('verifiedAudioProbes',{_id:id+'-probe',projectId:'project',assetId:id,storageId,checksum,byteSize:100,durationSeconds,durationMeasurement:'DECODED_PCM_SAMPLES_V1',hasVideo:false});
}
(async()=>{
  await check('two immutable speaker versions compile exact words and shot-relative timing into distinct approved audio dependencies',async()=>{
    const {recipe,context}=input();const plan=await compileRecipe(recipe,context,Date.now());
    const timeline=plan.nodes.find(node=>node.id==='timeline');
    assert.deepEqual(timeline.request.dialogueTracks.map(track=>track.startSeconds),[.25,4.25]);
    assert(timeline.dependencies.includes('approve:speech0')&&timeline.dependencies.includes('approve:speech1'));
    assert.deepEqual(plan.nodes.filter(node=>node.operation==='NARRATION').map(node=>node.request.voice.voiceVersionId),['voice-v1','voice-v2']);
    assert.equal(plan.nodes.some(node=>node.operation==='LIP_SYNC'),false,'Audio placement does not claim mouth synchronization.');
  });
  await check('wrong text, mutable/mismatched voice, duplicate lines, missing shots and overflow cannot compile',async()=>{
    for(const mutate of [r=>r.steps[1].text='An unapproved rewrite',r=>delete r.steps[1].voiceVersionId,r=>r.steps[1].voiceVersionId='voice-v2',r=>r.dialogueTracks.push({...r.dialogueTracks[0]}),r=>r.dialogueTracks[0].shotId='foreign',r=>r.narrationStepKey='speech0']){
      const {recipe,context}=input();mutate(recipe);await assert.rejects(compileRecipe(recipe,context,Date.now()));
    }
    const badAudio=input();badAudio.context.shots[0].nativeAudioPolicy='GENERATE';await assert.rejects(compileRecipe(badAudio.recipe,badAudio.context,Date.now()),/SILENT picture/);
    const {recipe,context}=input();context.shots[0].dialogueSegments[0].durationSeconds=4;await assert.rejects(compileRecipe(recipe,context,Date.now()),/timing/);
  });
  await check('logical dialogue tracks bind exact materialized shots without allowing invented canonical IDs',async()=>{
    const snapshot={sequences:[{orderIndex:0,scenes:[{orderIndex:0,shots:[{orderIndex:0,title:'Original',prompt:'Speak',durationSeconds:4,metadata:{},requiredAssetIds:[]}]}]}]};
    const logicalShots=await proposals.snapshotLogicalShots(snapshot),hash=await recipeHash(snapshot);
    const {recipe}=input();const proposal={...recipe,kind:'finalframe.recipe-proposal',steps:[{key:'picture',operation:'GENERATION',logicalShotKey:logicalShots[0].key,references:[]},recipe.steps[1]],visualOrder:['picture'],dialogueTracks:[{stepKey:'speech0',logicalShotKey:logicalShots[0].key,segmentIndex:0}]};delete proposal.binding;
    const bound=await proposals.bindRecipeProposal(proposal,{sourceDraftHash:hash,logicalShots},{binding:{...recipe.binding,snapshotHash:hash},snapshot,materializedShots:[{shotId:'materialized-shot',sequenceOrderIndex:0,sceneOrderIndex:0,shotOrderIndex:0,descriptorHash:logicalShots[0].descriptorHash}]});
    assert.equal(bound.dialogueTracks[0].shotId,'materialized-shot');
    const forged=structuredClone(proposal);forged.dialogueTracks[0].shotId='invented';assert.throws(()=>proposals.parseRecipeProposal(forged));
  });
  await check('actual local timeline places measured approved speech intact and stops on an overlong line',async()=>{
    const ctx=fixture();ctx.put('productionVersions',{_id:'version',productionId:'production',status:'APPROVED'});
    const run={_id:'run',projectId:'project',productionId:'production',productionVersionId:'version',boundRecipe:{fps:30}};
    const title={_id:'graphic-node',runId:'run',nodeId:'picture',operation:'GRAPHIC',status:'COMPLETED',resultId:'picture',request:{operation:'GRAPHIC',templateId:'end-card',durationFrames:240,title:'Original',subtitle:'',brandName:''}};ctx.put('recipeRunNodes',title);
    const tracks=[0,1].map(i=>({stepKey:'speech'+i,shotId:'shot'+i,segmentIndex:0,voiceVersionId:'voice-v'+i,text:'Exact line '+i,startSeconds:i*4+.25,durationSeconds:2}));
    for(let i=0;i<2;i++){audio(ctx,'audio'+i,1.5);ctx.put('recipeRunNodes',{_id:'speech-node'+i,runId:'run',nodeId:'speech'+i,operation:'NARRATION',status:'COMPLETED',resultId:'audio'+i,request:{operation:'NARRATION',mode:'GENERATE',voiceVersionId:'voice-v'+i,text:'Exact line '+i}});}
    const node={_id:'timeline-node',runId:'run',nodeId:'timeline',projectId:'project',productionId:'production',productionVersionId:'version',operation:'TIMELINE',idempotencyKey:'dialogue-timeline-proof',request:{visualOrder:['picture'],durationFrames:240,dialogueTracks:tracks}};ctx.put('recipeRunNodes',node);
    const local=load('convex/recipeLocal.ts');ctx.rows.get('audio1-probe').durationSeconds=2.1;
    await assert.rejects(local.executeRecipeLocal(ctx,node,run,'user'),/DIALOGUE_TIMING_REVIEW_REQUIRED/);assert.equal(ctx.count('timelines'),0);
    ctx.rows.get('audio1-probe').durationSeconds=1.5;await local.executeRecipeLocal(ctx,node,run,'user');
    const clips=[...ctx.rows.values()].filter(row=>row._table==='timelineClips'&&row.metadata?.audioRole==='dialogue');
    assert.deepEqual(clips.map(row=>[row.assetId,row.startSeconds,row.durationSeconds]),[['audio0',.25,1.5],['audio1',4.25,1.5]]);
    assert.equal(ctx.count('generationJobs'),0);assert.equal(ctx.count('renderJobs'),0);
  });
  await check('ordinary opt-in builder selects each exact voice and requires a deliberate frozen clone sample',()=>{
    const builder=load('src/lib/production/recipes/workspace.ts').buildWorkspaceRecipe;
    const base={videoType:'CINEMATIC_FILM',fps:30,visualMode:'GENERATE',referencePrompt:'',narrationMode:'NONE',captions:false,musicAssetId:'',usePlannedDialogue:true};
    const line={speakerResourceVersionId:'character',voiceVersionId:'frozen-voice',startSeconds:.25,durationSeconds:2,text:'Exact line',voiceId:'voice',voiceKind:'STOCK',sampleAssetIds:[]};
    const shots=[{id:'shot',key:'sequence_0_scene_0_shot_0',title:'Original',durationSeconds:4,referenceAssetIds:[],recipeReferenceSlots:[],audioPolicy:'SILENT',dialogueSegments:[line]}];
    const stock=builder(base,shots);assert.equal(stock.steps[1].voiceVersionId,'frozen-voice');assert.equal(stock.dialogueTracks[0].segmentIndex,0);
    const clone=structuredClone(shots);clone[0].dialogueSegments[0].voiceKind='CLONED';clone[0].dialogueSegments[0].sampleAssetIds=['frozen-recording'];
    assert.throws(()=>builder(base,clone),/primary consented recording/);
    assert.throws(()=>builder({...base,dialoguePrimarySamples:{'frozen-voice':'mutable-other-recording'}},clone),/primary consented recording/);
    assert.equal(builder({...base,dialoguePrimarySamples:{'frozen-voice':'frozen-recording'}},clone).steps[1].primaryVoiceSampleAssetId,'frozen-recording');
    const recorded=structuredClone(shots);recorded[0].dialogueSegments[0].voiceKind='RECORDED';assert.throws(()=>builder(base,recorded),/cannot synthesize fresh words/);
    assert.throws(()=>builder({...base,visualMode:'PROJECT_MEDIA',sourceAssetId:'visual',sourceStartSeconds:0,sourceDurationSeconds:4},shots),/exact planned shots/);
    const legacy=builder({...base,usePlannedDialogue:false},shots);assert.equal(legacy.dialogueTracks,undefined);assert.equal(legacy.steps.some(step=>step.operation==='NARRATION'),false);
  });
  await check('paid-input preparation reuses the exact old voice version after the profile changes and rejects contradictory node bindings',async()=>{
    const ctx=fixture(),voices=load('convex/voices.ts'),registry=load('src/lib/ai/model-registry.ts');
    ctx.put('voices',{_id:'voice',projectId:'project',kind:'STOCK',status:'READY',provider:'openrouter',providerVoiceId:'old-provider-voice',settingsSnapshot:{modelId:registry.PREPARATION_MODELS.narration.id},sampleAssetIds:[]});
    ctx.put('resourceStates',{_id:'voice-approval',projectId:'project',resourceType:'voice',resourceId:'voice',state:'APPROVED',approvedAt:1,updatedAt:1});
    const input=await voices.resolveVoiceSynthesisInput(ctx,{projectId:'project',voiceId:'voice',use:'SYNTHESIZE'}),id=await voices.freezeVoiceVersion(ctx,input,'user');
    const node={_id:'node',runId:'run',projectId:'project',operation:'NARRATION',request:{voiceId:'voice',voiceVersionId:id,text:'Exact words'},voiceVersionId:id,requestHash:'exact-hash',dependencies:[]};
    ctx.rows.get('voice').providerVoiceId='changed-profile-voice';
    const resolver=load('convex/recipePlanning.ts').resolvePaidRecipeInput;
    const resolved=await resolver(ctx,node,{_id:'run',projectId:'project'});assert.equal(resolved.bindings.createArgs.voiceConfigSnapshot.providerVoiceId,'old-provider-voice');
    await assert.rejects(resolver(ctx,{...node,voiceVersionId:'another-version'},{_id:'run',projectId:'project'}),/RECIPE_VOICE_UNAVAILABLE/);
    ctx.rows.get('voice').revokedAt=1;await assert.rejects(resolver(ctx,node,{_id:'run',projectId:'project'}),/VOICE_NOT_READY/);
    assert.equal(ctx.count('generationJobs'),0);assert.equal(ctx.count('providerBudgetReservations'),0);
  });
  console.log(`Dialogue tracks: ${checks} PASS; actual compiler/binder/local timeline with isolated Storage/auth seams. No database/provider/render calls.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
