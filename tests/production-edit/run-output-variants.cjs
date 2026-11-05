const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const file=path.join(__dirname,'run-finishing-v5.cjs');
const harness=new Module(file,module);harness.filename=file;harness.paths=Module._nodeModulePaths(path.dirname(file));
harness._compile(fs.readFileSync(file,'utf8').split('const originalFlag =')[0]+'\nmodule.exports={fixture,editor,timeline,assembly};',file);
const {fixture,editor,timeline,assembly}=harness.exports;
const {OUTPUT_PRESETS,OUTPUT_FPS,getOutputPreset}=require('../../renderer/src/output-presets.ts');
const {graphicsWorkerSupports}=require('../../convex/renderGraphicsHandshake.ts');
const {validateManifest}=require('../../renderer/src/manifest.ts');
process.env.FINALFRAME_MANIFEST_V5_ENABLED='true';
process.env.FINALFRAME_GRAPHICS_V2_ENABLED='true';
process.env.FINALFRAME_FORMAT_VARIANTS_ENABLED='true';
let serial=0,checks=0;
function context(){
  const ctx=fixture();ctx.lock('timeline_1');ctx.rows.get('timeline_1').updatedAt=20;
  for(const [index,id]of ['red','blue','music','image','logo'].entries()){const checksum=String(index+1).repeat(64);ctx.rows.get('asset_'+id).checksum=checksum;ctx.storageObjects.get('storage_'+id).sha256=checksum;}
  Object.assign(ctx.rows.get('clip_red').metadata,{captionTrack:{id:'whole-words',language:'en',style:{position:'BOTTOM',fontSize:42,maxLines:3},cues:[{id:'line',startFrame:0,durationInFrames:60,text:'Keep every approved word.'}]},captionFps:30});
  return ctx;
}
function args(ctx,presetId='VERTICAL',extra={}){const source=ctx.rows.get('timeline_1');return {timelineId:source._id,presetId,expectedVersionNumber:source.versionNumber,expectedUpdatedAt:source.updatedAt,idempotencyKey:'format-test-'+(++serial),...extra};}
const create=(ctx,input)=>timeline.createFormatVariant.handler(ctx,input);
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
(async()=>{
 await check('seven registry presets and aliases are exact, with supported independent fps values',async()=>{
  assert.deepEqual(OUTPUT_PRESETS.map(p=>[p.aspectRatio,p.width,p.height]),[['9:16',1080,1920],['16:9',1920,1080],['1:1',1080,1080],['4:5',1080,1350],['4:3',1440,1080],['3:4',1080,1440],['21:9',1680,720]]);
  assert.deepEqual(OUTPUT_FPS,[24,25,30,50,60]);assert.equal(getOutputPreset('SOCIAL_VERTICAL').id,'VERTICAL');assert.throws(()=>getOutputPreset('unsupported'));
 });
 await check('all formats create independently editable drafts while source audio/captions/timing and media identities remain intact',async()=>{
  const ctx=context();const source=await ctx.draft('timeline_1');const original=structuredClone(ctx.rows.get('timeline_1'));
  const ids=[];
  for(const preset of OUTPUT_PRESETS){
   const input=args(ctx,preset.id);const made=await create(ctx,input);ids.push(made.timelineId);
   const draft=await ctx.draft(made.timelineId);
   assert.equal(draft.timeline.status,'DRAFT');assert.equal(ctx.states.get('timeline:'+made.timelineId),'DRAFT');
   assert.equal(draft.metadata.outputPresetId,preset.id);assert.deepEqual(draft.metadata.authoredOutput,{width:preset.width,height:preset.height});
   assert.equal(draft.metadata.formatVariant.sourceTimelineId,'timeline_1');assert.equal(draft.metadata.formatVariant.rootTimelineId,'timeline_1');
   assert.equal(draft.timeline.durationSeconds,source.timeline.durationSeconds);
   for(let lane=0;lane<source.tracks.length;lane++)for(let at=0;at<source.tracks[lane].clips.length;at++){
    const before=source.tracks[lane].clips[at],after=draft.tracks[lane].clips[at];
    for(const key of ['assetId','shotVersionId','startSeconds','durationSeconds','trimStartSeconds','trimEndSeconds','volume','transition'])assert.deepEqual(after[key],before[key]);
    assert.deepEqual(after.metadata.captionTrack,before.metadata.captionTrack);assert.deepEqual(after.metadata.audio,before.metadata.audio);
    if(['VIDEO','IMAGE'].includes(after.kind))assert.equal(after.metadata.renderItem.fit,'contain');
   }
   assert.equal((await create(ctx,input)).timelineId,made.timelineId);
   ctx.lock(made.timelineId);
   const built=await assembly.createJob.handler(ctx,{productionId:'production_1',timelineId:made.timelineId,idempotencyKey:'format-manifest-'+preset.id});
   assert.deepEqual([built.manifest.output.width,built.manifest.output.height,built.manifest.output.fps,built.manifest.output.presetId],[preset.width,preset.height,30,preset.id]);
   assert.equal(validateManifest(built.manifest).ok,true);
   const imported=await timeline.createVersion.handler(ctx,{productionId:'production_1',manifestId:built.manifestId,idempotencyKey:'format-import-'+preset.id});
   const importedDraft=await ctx.draft(imported._id);assert.equal(importedDraft.metadata.outputPresetId,preset.id);assert.equal(importedDraft.tracks[0].clips[0].metadata.renderItem.fit,'contain');
  }
  assert.equal(new Set(ids).size,7);assert.deepEqual(ctx.rows.get('timeline_1'),original);
  assert.equal(ctx.count('generationJobs'),0);assert.equal(ctx.count('renderJobs'),0);assert.equal(ctx.count('reservations'),0);
 });
 await check('caption and audio seconds remain exact at every supported frame rate',async()=>{
  for(const fps of OUTPUT_FPS){const ctx=context();ctx.rows.get('timeline_1').tracks.metadata.fps=fps;
   const source=await ctx.draft('timeline_1');const made=await create(ctx,args(ctx,'PORTRAIT_FEED'));const result=await ctx.draft(made.timelineId);
   assert.equal(result.metadata.fps,fps);assert.deepEqual(result.tracks[1].clips.map(c=>[c.startSeconds,c.durationSeconds,c.trimStartSeconds,c.volume,c.metadata.audio]),source.tracks[1].clips.map(c=>[c.startSeconds,c.durationSeconds,c.trimStartSeconds,c.volume,c.metadata.audio]));
  }
 });
 await check('responsive graphics retain explicit copy and exact screenshot binding in a new variant',async()=>{
  const ctx=context();ctx.put('timelineTracks',{_id:'graphic-track',timelineId:'timeline_1',kind:'GRAPHIC',orderIndex:3,studioExternalId:'studio'});
  ctx.put('timelineClips',{_id:'original-title',timelineId:'timeline_1',trackId:'graphic-track',studioExternalId:'studio',startSeconds:0,durationSeconds:2,metadata:{clipKind:'GRAPHIC',motionTemplateId:'end-card',templateProps:{title:'Try DraftDesk',copyPolicy:'authored-only'}}});
  const made=await create(ctx,args(ctx));const draft=await ctx.draft(made.timelineId);const graphic=draft.tracks[2].clips[0];
  assert.equal(graphic.metadata.motionTemplateId,'kinetic-title');assert.equal(graphic.metadata.templateProps.layoutVersion,2);assert.equal(graphic.metadata.templateProps.title,'Try DraftDesk');assert.equal(graphic.metadata.templateProps.eyebrow,undefined);
  assert.equal(ctx.rows.get('original-title').metadata.templateProps.copyPolicy,'authored-only');
 });
 await check('one clip framing edit creates another draft, supports undo, and cannot mutate a locked variant',async()=>{
  const ctx=context();const made=await create(ctx,args(ctx));const draft=await ctx.draft(made.timelineId);const clip=draft.tracks[0].clips[0];const before=structuredClone(ctx.rows.get(clip.id));
  const edit=await editor.apply.handler(ctx,{timelineId:made.timelineId,kind:'adjustFraming',input:{clipId:clip.id,fit:'cover',focalPoint:{x:.8,y:.25},backgroundColor:'#123456'},idempotencyKey:'frame-a-single-variant-clip'});
  const revised=await ctx.draft(edit.timelineId);assert.equal(revised.tracks[0].clips[0].metadata.renderItem.position,'80% 25%');assert.equal(revised.tracks[0].clips[1].metadata.renderItem.fit,'contain');assert.deepEqual(ctx.rows.get(clip.id),before);
  const undone=await editor.undo.handler(ctx,{timelineId:edit.timelineId,idempotencyKey:'undo-variant-framing'});assert.equal((await ctx.draft(undone.timelineId)).tracks[0].clips[0].metadata.renderItem.fit,'contain');
  ctx.lock(made.timelineId);await assert.rejects(editor.apply.handler(ctx,{timelineId:made.timelineId,kind:'adjustFraming',input:{clipId:clip.id,fit:'cover'},idempotencyKey:'locked-variant-denied'}),/Locked/);
 });
 await check('disabled, stale, unapproved, foreign, viewer and conflicting requests deny without successful duplicate allocation',async()=>{
  const ctx=context();const input=args(ctx);const count=ctx.count('timelines');
  delete process.env.FINALFRAME_FORMAT_VARIANTS_ENABLED;await assert.rejects(create(ctx,input),/disabled/);process.env.FINALFRAME_FORMAT_VARIANTS_ENABLED='true';
  await assert.rejects(create(ctx,{...input,presetId:'bogus'}));await assert.rejects(create(ctx,{...input,expectedUpdatedAt:999}),/changed/);
  ctx.role='VIEWER';await assert.rejects(create(ctx,input),/Forbidden/);ctx.role='OWNER';
  ctx.states.set('timeline:timeline_1','DRAFT');await assert.rejects(create(ctx,input),/Approve/);ctx.lock('timeline_1');
  assert.equal(ctx.count('timelines'),count);const made=await create(ctx,input);await assert.rejects(create(ctx,{...input,presetId:'CINEMA'}),/another edit/);assert.equal(ctx.count('timelines'),count+1);
  ctx.rows.get('production_1').currentVersionId='other';await assert.rejects(create(ctx,args(ctx)),/read-only/);assert.equal((await create(ctx,input)).timelineId,made.timelineId,'same accepted request replays after production advances');
 });
 await check('old worker capability is denied for reframed media while historical plain manifests retain compatibility',async()=>{
  const manifest={version:5,metadata:{formatVariant:{version:1}},items:[]};
  const old={ok:true,service:'finalframe-renderer'};assert.equal(graphicsWorkerSupports(manifest,old),false);assert.equal(graphicsWorkerSupports(manifest,{...old,formatVariantVersion:1}),true);assert.equal(graphicsWorkerSupports({version:4,items:[]},old),true);
  assert.equal(graphicsWorkerSupports({version:5,items:[{kind:'video',fit:'contain'}]},old),false);
 });
 await check('cross-project timelines/assets, global resources and withdrawn bytes or approvals cannot enter a variant',async()=>{
  for(const change of [ctx=>ctx.rows.get('timeline_1').projectId='foreign',ctx=>ctx.rows.get('asset_red').projectId='foreign',ctx=>ctx.rows.get('asset_red').scope='GLOBAL',ctx=>ctx.rows.get('asset_red').rights={status:'REVOKED'},ctx=>ctx.states.set('asset:asset_red','REVISION_REQUESTED'),ctx=>ctx.storageObjects.get('storage_red').sha256='9'.repeat(64),ctx=>ctx.rows.get('project_1').archivedAt=1]){
   const ctx=context(),input=args(ctx);change(ctx);const count=ctx.count('timelines');await assert.rejects(create(ctx,input));assert.equal(ctx.count('timelines'),count);assert.equal(ctx.count('productionOperations'),0);
  }
 });
 console.log('Output variants: '+checks+' PASS. Actual canonical handlers with isolated contract fixtures; no database/provider/render requests.');
})().catch(error=>{console.error(error);process.exitCode=1;});
