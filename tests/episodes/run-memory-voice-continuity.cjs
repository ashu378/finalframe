const assert = require('node:assert/strict');
const { fixture, load } = require('../recipes/backend-fixture.cjs');
const memory = load('convex/projectMemory.ts');
const voices = load('convex/voices.ts');
const bindings = load('convex/continuityContracts.ts');
const registry = load('src/lib/ai/model-registry.ts');
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }

function memoryFixture() {
  const ctx = fixture();
  const query = ctx.db.query;
  ctx.db.query = table => {
    const base = query(table);
    if (table === 'projectMemoryFacts') base.withSearchIndex = (_name, build) => {
      let text, projectId;
      const search = { search: (_field, value) => { text = value.toLowerCase(); return search; }, eq: (_field, value) => { projectId = value; return search; } };
      build(search);
      return { take: async count => [...ctx.rows.values()].filter(row => row._table === table && row.projectId === projectId && row.text.toLowerCase().includes(text)).slice(0, count) };
    };
    return base;
  };
  ctx.addEpisode = async (number, facts) => {
    const episodeId = 'episode-' + number, productionId = 'production-' + number, versionId = 'version-' + number, timelineId = 'timeline-' + number, stateId = 'state-' + number;
    ctx.put('productions', { _id: productionId, projectId: 'project', currentVersionId: versionId });
    ctx.put('productionVersions', { _id: versionId, productionId, status: 'APPROVED' });
    ctx.put('timelines', { _id: timelineId, productionId, projectId: 'project' });
    ctx.put('episodes', { _id: episodeId, projectId: 'project', productionId, episodeNumber: number, acceptedStoryStateId: stateId, continuityStatus: 'CURRENT' });
    ctx.put('episodeStoryStates', { _id: stateId, projectId: 'project', episodeId, productionVersionId: versionId, timelineId, snapshot: { summary: `Episode ${number}`, facts, unresolvedThreads: [], characterStates: [], cliffhanger: '', nextEpisodePayoff: '' }, createdAt: number });
    for (const [resourceType, resourceId] of [['episodeStoryState',stateId],['timeline',timelineId]]) ctx.put('resourceStates', { _id: resourceType + number, projectId: 'project', resourceType, resourceId, state: 'LOCKED' });
    await memory.materializeAcceptedMemory(ctx, 'project', stateId);
    return stateId;
  };
  return ctx;
}

function stockVoiceFixture() {
  const ctx = fixture();
  ctx.put('voices', { _id: 'voice', projectId: 'project', kind: 'STOCK', name: 'Original voice', status: 'READY', provider: 'openrouter', providerVoiceId: 'original-provider-voice', settingsSnapshot: { modelId: registry.PREPARATION_MODELS.narration.id }, sampleAssetIds: [], createdByUserId: 'user' });
  ctx.put('resourceStates', { _id: 'voice-state', projectId: 'project', resourceType: 'voice', resourceId: 'voice', state: 'APPROVED', approvedAt: 10, updatedAt: 10 });
  return ctx;
}

(async () => {
  await check('relevant approved fact survives more than eight subsequent episodes with exact source provenance', async () => {
    const ctx = memoryFixture();
    for (let i = 1; i <= 12; i++) await ctx.addEpisode(i, i === 1 ? ['The brass key opens the lighthouse.'] : ['An ordinary event ' + i]);
    const found = await memory.retrieveApprovedMemory(ctx, 'project', 13, 'brass key');
    assert.equal(found.facts.length, 1);
    assert.equal(found.facts[0].episodeNumber, 1);
    assert.equal(found.facts[0].storyStateId, 'state-1');
    assert.equal(found.facts[0].timelineId, 'timeline-1');
    const count = ctx.count('projectMemoryFacts');
    assert.equal(await memory.materializeAcceptedMemory(ctx, 'project', 'state-1'), 0);
    assert.equal(ctx.count('projectMemoryFacts'), count);
  });
  await check('search cannot reuse foreign, superseded, stale, tampered or unapproved source facts', async () => {
    const ctx = memoryFixture();
    await ctx.addEpisode(1, ['The brass key opens the lighthouse.']);
    const target = [...ctx.rows.values()].find(row => row._table === 'projectMemoryFacts' && row.kind === 'FACT');
    for (const mutate of [() => { ctx.rows.get('episode-1').continuityStatus='STALE'; }, () => { ctx.rows.get('episode-1').acceptedStoryStateId='replacement'; }, () => { ctx.rows.get('production-1').currentVersionId='other-version'; }, () => { ctx.rows.get('timeline1').state='DRAFT'; }, () => { ctx.rows.get(target._id).text='The brass key belongs to an invented character.'; }]) {
      const saved = structuredClone([...ctx.rows]); mutate();
      assert.equal((await memory.retrieveApprovedMemory(ctx,'project',13,'brass key')).facts.length,0);
      ctx.rows.clear();for(const [id,value] of saved)ctx.rows.set(id,value);
    }
    ctx.put('projectMemoryFacts',{...target,_id:'foreign-fact',projectId:'foreign'});
    assert.equal((await memory.retrieveApprovedMemory(ctx,'project',13,'brass key')).facts.length,1);
    assert.equal((await memory.retrieveApprovedMemory(ctx,'project',1,'brass key')).facts.length,0);
  });
  await check('queued voice uses immutable provider settings after mutable profile changes', async () => {
    const ctx=stockVoiceFixture();
    const args={projectId:'project',voiceId:'voice',use:'SYNTHESIZE'};
    const quoted=await voices.resolveVoiceSynthesisInput(ctx,args);
    const id=await voices.freezeVoiceVersion(ctx,quoted,'user');
    const original=structuredClone(ctx.rows.get(id));
    ctx.rows.get('voice').providerVoiceId='replacement-provider-voice';
    ctx.rows.get('voice').settingsSnapshot={modelId:registry.PREPARATION_MODELS.narration.id,delivery:'different'};
    const frozen=await voices.resolveFrozenVoiceSynthesisInput(ctx,{...args,voiceVersionId:id,voiceConfigHash:quoted.voiceConfigHash,voiceConfigSnapshot:quoted.voiceConfigSnapshot});
    assert.equal(frozen.providerVoiceId,'original-provider-voice');
    const changed=await voices.resolveVoiceSynthesisInput(ctx,args);
    assert.notEqual(changed.voiceConfigHash,quoted.voiceConfigHash);
    assert.notEqual(await voices.freezeVoiceVersion(ctx,changed,'user'),id);
    assert.deepEqual(ctx.rows.get(id),original);
    ctx.rows.get('voice').revokedAt=100;
    await assert.rejects(voices.resolveFrozenVoiceSynthesisInput(ctx,{...args,voiceVersionId:id}),/VOICE_NOT_READY/);
  });
  await check('frozen voice cannot cross projects or accept changed hashes and snapshots',async()=>{
    const ctx=stockVoiceFixture(),args={projectId:'project',voiceId:'voice',use:'SYNTHESIZE'};
    const input=await voices.resolveVoiceSynthesisInput(ctx,args),id=await voices.freezeVoiceVersion(ctx,input,'user');
    await assert.rejects(voices.resolveFrozenVoiceSynthesisInput(ctx,{...args,voiceVersionId:id,voiceConfigHash:'forged'}),/VERSION_CHANGED/);
    await assert.rejects(voices.resolveFrozenVoiceSynthesisInput(ctx,{...args,voiceVersionId:id,voiceConfigSnapshot:{...input.voiceConfigSnapshot,providerVoiceId:'forged'}}),/VERSION_CHANGED/);
    ctx.rows.get(id).projectId='foreign';
    await assert.rejects(voices.resolveFrozenVoiceSynthesisInput(ctx,{...args,voiceVersionId:id}),/VOICE_NOT_READY/);
  });
  await check('new synthesis binds quote settings before a hold and freezes one immutable version on queue',async()=>{
    Object.assign(process.env,{FINALFRAME_GENERATION_WORKER_ENABLED:'true',FINALFRAME_PREPARATION_ENABLED:'true',FINALFRAME_PAID_TEST_RUN:'recipe-test'});
    const ctx=stockVoiceFixture(),voiceArgs={projectId:'project',voiceId:'voice',use:'SYNTHESIZE'};
    const quoted=await voices.resolveVoiceSynthesisInput(ctx,voiceArgs);
    const selected=load('src/lib/ai/preparation.ts').preparationModel('NARRATION',false);
    const args={productionId:'production',kind:'NARRATION',text:'An exact original line.',targetVoiceId:'voice',clone:false,model:selected.id,capability:selected.capability,estimatedProviderCostUsd:.01,quote:{},idempotencyKey:'frozen-voice-queued-test',voiceConfigSnapshot:quoted.voiceConfigSnapshot,voiceConfigHash:quoted.voiceConfigHash};
    ctx.rows.get('voice').providerVoiceId='changed-before-queue';
    await assert.rejects(ctx.call('generationJobs','createPreparation',args),/VOICE_QUOTE_CONFIG_CHANGED/);
    assert.equal(ctx.count('generationJobs'),0);assert.equal(ctx.count('providerBudgetReservations'),0);
    ctx.rows.get('voice').providerVoiceId='original-provider-voice';
    const job=await ctx.call('generationJobs','createPreparation',args);
    const request=ctx.rows.get(job._id).request;
    assert(request.voiceVersionId);assert.equal(request.voiceConfigHash,quoted.voiceConfigHash);
    assert.equal(request.voiceConfigSnapshot.providerVoiceId,'original-provider-voice');
    assert.equal(ctx.count('voiceVersions'),1);assert.equal(ctx.count('generationJobs'),1);assert.equal(ctx.count('providerBudgetReservations'),1);
    const replay=await ctx.call('generationJobs','createPreparation',args);assert.equal(replay._id,job._id);assert.equal(ctx.count('providerBudgetReservations'),1);
  });
  await check('frozen cloned voice keeps its approved source but respects immutable consent revocation',async()=>{
    const ctx=stockVoiceFixture();
    const voice=ctx.rows.get('voice');Object.assign(voice,{kind:'CLONED',sampleAssetIds:['recording'],currentConsentId:'consent'});
    ctx.put('assets',{_id:'recording',projectId:'project',scope:'PROJECT',storageId:'recording-storage',mimeType:'audio/wav'});
    ctx.put('voiceConsents',{_id:'consent',projectId:'project',voiceId:'voice',permittedUses:['SYNTHESIZE'],expiresAt:Date.now()+100000});
    ctx.db.system={get:async()=>({contentType:'audio/wav',size:100,sha256:'a'.repeat(64)})};
    ctx.storage={getUrl:async id=>'https://example.convex.cloud/'+id};
    const args={projectId:'project',voiceId:'voice',use:'SYNTHESIZE'};
    const quoted=await voices.resolveVoiceSynthesisInput(ctx,args),id=await voices.freezeVoiceVersion(ctx,quoted,'user');
    voice.sampleAssetIds=[];voice.currentConsentId='another-consent';
    const frozen=await voices.resolveFrozenVoiceSynthesisInput(ctx,{...args,voiceVersionId:id});
    assert.equal(frozen.references[0].assetId,'recording');assert.equal(frozen.consentId,'consent');
    ctx.put('voiceConsentEvents',{_id:'revoked',consentId:'consent',projectId:'project',voiceId:'voice',event:'REVOKED'});
    for(let i=0;i<25;i++)ctx.put('voiceConsentEvents',{_id:'granted'+i,consentId:'consent',event:'GRANTED'});
    await assert.rejects(voices.resolveFrozenVoiceSynthesisInput(ctx,{...args,voiceVersionId:id}),/VOICE_CONSENT_REQUIRED/);
  });
  await check('timed dialogue binds exact character and voice while costumes and props bind their character',async()=>{
    const ctx=stockVoiceFixture(),input=await voices.resolveVoiceSynthesisInput(ctx,{projectId:'project',voiceId:'voice',use:'SYNTHESIZE'}),voiceVersionId=await voices.freezeVoiceVersion(ctx,input,'user');
    ctx.put('projectResources',{_id:'character',projectId:'project',kind:'CHARACTER'});
    ctx.put('projectResources',{_id:'costume',projectId:'project',kind:'COSTUME'});
    ctx.put('projectResourceVersions',{_id:'character-v1',projectId:'project',resourceId:'character',voiceId:'voice',voiceVersionId});
    ctx.put('projectResourceVersions',{_id:'costume-v1',projectId:'project',resourceId:'costume'});
    const snapshot={resources:[{resourceVersionId:'character-v1'},{resourceVersionId:'costume-v1'}]};
    const metadata={resourceBindings:[{role:'speaker',resourceVersionId:'character-v1',voiceVersionId},{role:'outfit',resourceVersionId:'costume-v1',characterResourceVersionId:'character-v1'}],dialogueSegments:[{speakerResourceVersionId:'character-v1',voiceVersionId,startSeconds:.5,durationSeconds:2,text:'Na me own this puff-puff!',delivery:'Playful'}]};
    assert.equal((await bindings.validateShotBindings(ctx,'project',snapshot,metadata,4)).dialogueSegments[0].voiceVersionId,voiceVersionId);
    for(const bad of [{...metadata,dialogueSegments:[{...metadata.dialogueSegments[0],voiceVersionId:'invented'}]},{...metadata,dialogueSegments:[{...metadata.dialogueSegments[0],startSeconds:3}]},{...metadata,resourceBindings:[metadata.resourceBindings[1]]}])await assert.rejects(bindings.validateShotBindings(ctx,'project',snapshot,bad,4));
    ctx.rows.get('character-v1').projectId='foreign';await assert.rejects(bindings.validateShotBindings(ctx,'project',snapshot,metadata,4),/unavailable/);
  });
  await check('actual scene CRUD rejects foreign assignments and clipped dialogue before changing saved shots',async()=>{
    const ctx=stockVoiceFixture();
    const input=await voices.resolveVoiceSynthesisInput(ctx,{projectId:'project',voiceId:'voice',use:'SYNTHESIZE'}),voiceVersionId=await voices.freezeVoiceVersion(ctx,input,'user');
    ctx.put('projectResources',{_id:'character',projectId:'project',kind:'CHARACTER',name:'Original speaker'});
    ctx.put('projectResourceVersions',{_id:'character-v1',projectId:'project',resourceId:'character',voiceId:'voice',voiceVersionId,profile:{},assetIds:[]});
    const resources=[{resourceId:'character',resourceVersionId:'character-v1',profile:{},assetIds:[],voice:{voiceId:'voice',voiceVersionId}}];
    ctx.put('continuityBibles',{_id:'bible',projectId:'project',state:'APPROVED',snapshot:{resourceBindings:[{resourceId:'character',resourceVersionId:'character-v1'}],rules:[]}});
    for(const [type,id] of [['continuityBible','bible'],['projectResourceVersion','character-v1']])ctx.put('resourceStates',{_id:type,projectId:'project',resourceType:type,resourceId:id,state:'APPROVED'});
    ctx.put('productionVersions',{_id:'version',productionId:'production',status:'DRAFT',planningContextSnapshot:{projectId:'project',productionId:'production',continuityBibleId:'bible',resources,bible:{rules:[]}}});
    ctx.put('sequences',{_id:'sequence',projectId:'project',productionId:'production',productionVersionId:'version'});
    ctx.put('scenes',{_id:'scene',projectId:'project',productionId:'production',productionVersionId:'version',sequenceId:'sequence'});
    const metadata={resourceVersionIds:['character-v1'],resourceBindings:[{role:'speaker',resourceVersionId:'character-v1',voiceVersionId}],dialogueSegments:[{speakerResourceVersionId:'character-v1',voiceVersionId,startSeconds:1,durationSeconds:2,text:'An exact approved line.'}]};
    const args={sceneId:'scene',title:'A speaking shot',prompt:'The original speaker speaks.',durationSeconds:4,metadata};
    for(const bad of [{...metadata,resourceBindings:[{...metadata.resourceBindings[0],resourceVersionId:'foreign'}]},{...metadata,dialogueSegments:[{...metadata.dialogueSegments[0],voiceVersionId:'invented'}]}]){
      await assert.rejects(ctx.call('scenes','createShot',{...args,metadata:bad}));assert.equal(ctx.count('shots'),0);
    }
    const shot=await ctx.call('scenes','createShot',args);
    const saved=structuredClone(ctx.rows.get(shot._id));
    await assert.rejects(ctx.call('scenes','updateShot',{shotId:shot._id,durationSeconds:2}),/timing inside the shot/);
    await assert.rejects(ctx.call('scenes','updateShot',{shotId:shot._id,metadata:{...metadata,resourceVersionIds:[]}}),/assignments/);
    assert.deepEqual(ctx.rows.get(shot._id),saved);
    await ctx.call('scenes','updateShot',{shotId:shot._id,durationSeconds:5});assert.equal(ctx.rows.get(shot._id).durationSeconds,5);
    const firstMetadata={...metadata,aspectRatio:'16:9'};
    await ctx.call('scenes','updateShot',{shotId:shot._id,metadata:firstMetadata,expectedMetadata:metadata});
    await assert.rejects(ctx.call('scenes','updateShot',{shotId:shot._id,metadata:{...metadata,resolution:'720p'},expectedMetadata:metadata}),/SHOT_METADATA_CHANGED/);
    assert.deepEqual(ctx.rows.get(shot._id).metadata,firstMetadata);
    await ctx.call('scenes','updateShot',{shotId:shot._id,metadata:firstMetadata,expectedMetadata:Object.fromEntries(Object.entries(firstMetadata).reverse())});
  });
  console.log(`Memory/voice continuity: ${checks} PASS; actual helpers and persisted-shape in-memory seams, no database/provider/render calls.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
