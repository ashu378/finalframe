const assert=require('node:assert/strict');
const {fixture,load}=require('../recipes/backend-fixture.cjs');
const pure=load('src/lib/production/storyboard-contract.ts');
let count=0;
async function test(name,body){await body();count++;console.log('PASS '+name);}
function setup(){
  const ctx=fixture();ctx.put('productionVersions',{_id:'version',productionId:'production',sourcePlanId:'plan',status:'DRAFT'});
  ctx.put('sequences',{_id:'sequence',projectId:'project',productionId:'production',productionVersionId:'version',title:'Chapter',orderIndex:0,status:'DRAFT'});
  ctx.put('scenes',{_id:'scene',projectId:'project',productionId:'production',productionVersionId:'version',sequenceId:'sequence',title:'Scene',purpose:'An original scene',visualDirection:'Clear action',orderIndex:0,status:'DRAFT'});
  ctx.put('shots',{_id:'shot',projectId:'project',productionId:'production',productionVersionId:'version',sceneId:'scene',sequenceId:'sequence',title:'First shot',prompt:'An original scene',durationSeconds:4,orderIndex:0,camera:{angle:'eye_level'},requiredAssetIds:['cast'],metadata:{audioPolicy:'SILENT'},status:'DRAFT'});
  for(const id of['image-a','image-b','cast'])addImage(ctx,id);
  return ctx;
}
function addImage(ctx,id,extra={}){ctx.put('assets',{_id:id,projectId:'project',studioExternalId:'studio',scope:'PROJECT',source:'UPLOAD',storageId:'storage-'+id,checksum:'a'.repeat(64),mimeType:'image/png',rights:{status:'OWNED'},...extra});ctx.storageObjects.set('storage-'+id,{sha256:'a'.repeat(64),size:100,contentType:'image/png'});ctx.put('resourceStates',{_id:'state-'+id,projectId:'project',resourceType:'asset',resourceId:id,state:'APPROVED'});}
const register=(ctx,assetId='image-a',extra={})=>ctx.call('storyboard','registerFrame',{shotId:'shot',assetId,kind:'UPLOAD',prompt:'Original reference',...extra});
const select=(ctx,frameId,generationGuide='IMAGE_REFERENCE')=>ctx.call('storyboard','selectFrame',{shotId:'shot',frameId,generationGuide,expectedMetadata:structuredClone(ctx.rows.get('shot').metadata)});
function selection(ctx){const shot=ctx.rows.get('shot');return {projectId:'project',productionId:'production',productionVersionId:'version',shotId:'shot',metadata:shot.metadata,requiredAssetIds:shot.requiredAssetIds};}
(async()=>{
 await test('pure directing/binding contracts reject invented controls and oversize preservation',async()=>{
  assert.throws(()=>pure.normalizeShotDirecting({script:'executable'}),/DIRECTION_INVALID/);assert.throws(()=>pure.normalizeShotDirecting({preserve:Array(21).fill('face')}),/DIRECTION_INVALID/);
  assert.throws(()=>pure.parseStoryboardBinding({version:1,frameId:'x',generationGuide:'AUTO',proof:'forged'}),/SELECTION_INVALID/);
  assert.deepEqual(pure.selectedFrameAssetIds(['old','cast'],'old','new',['old']),['old','cast','new']);
 });
 await test('actual register is immutable/idempotent, project-scoped, approval and bytes enforced',async()=>{
  const ctx=setup(),id=await register(ctx);assert.equal(await register(ctx),id);assert.equal(ctx.count('storyboardFrames'),1);
  ctx.rows.get('image-b').projectId='foreign';await assert.rejects(register(ctx,'image-b'),/IMAGE_UNAVAILABLE/);
  ctx.rows.get('image-b').projectId='project';ctx.rows.get('state-image-b').state='DRAFT';await assert.rejects(register(ctx,'image-b'),/approved/);
  ctx.rows.get('state-image-b').state='APPROVED';ctx.storageObjects.get('storage-image-b').sha256='b'.repeat(64);await assert.rejects(register(ctx,'image-b'),/IMAGE_UNAVAILABLE/);
  ctx.rows.get('image-a').rights={status:'REVOKED'};await assert.rejects(select(ctx,id),/IMAGE_UNAVAILABLE/);assert.equal(ctx.count('storyboardFrames'),1);
 });
 await test('selected frame only reaches canonical shot refs, explicit first frame and protected character refs survive',async()=>{
  const ctx=setup(),a=await register(ctx),b=await register(ctx,'image-b');await select(ctx,a);
  assert.deepEqual(ctx.rows.get('shot').requiredAssetIds,['cast','image-a']);assert.equal(ctx.rows.get('shot').metadata.firstFrameAssetId,undefined);
  await select(ctx,b,'FIRST_FRAME');assert.deepEqual(ctx.rows.get('shot').requiredAssetIds,['cast','image-b']);assert.equal(ctx.rows.get('shot').metadata.firstFrameAssetId,'image-b');
  ctx.put('projectResources',{_id:'character',projectId:'project',kind:'CHARACTER',name:'Original presenter'});ctx.put('projectResourceVersions',{_id:'character-v1',resourceId:'character',projectId:'project',profile:{},assetIds:['image-b']});ctx.put('resourceStates',{_id:'character-state',projectId:'project',resourceType:'projectResourceVersion',resourceId:'character-v1',state:'APPROVED'});ctx.put('continuityBibles',{_id:'bible',projectId:'project',state:'APPROVED',snapshot:{resourceBindings:[{resourceId:'character',resourceVersionId:'character-v1'}]}});ctx.put('resourceStates',{_id:'bible-state',projectId:'project',resourceType:'continuityBible',resourceId:'bible',state:'APPROVED'});ctx.rows.get('version').planningContextSnapshot={projectId:'project',productionId:'production',continuityBibleId:'bible',resources:[{resourceId:'character',resourceVersionId:'character-v1',profile:{},assetIds:['image-b']}]};ctx.rows.get('shot').metadata.resourceBindings=[{role:'presenter',resourceVersionId:'character-v1'}];
  await select(ctx,a);assert.deepEqual(ctx.rows.get('shot').requiredAssetIds,['cast','image-b','image-a']);assert.equal(ctx.rows.get('shot').metadata.firstFrameAssetId,null);
  const resolved=await load('convex/storyboard.ts').resolveStoryboardSelection(ctx,selection(ctx));assert.equal(resolved.assetId,'image-a');
  ctx.storageObjects.get('storage-image-a').sha256='b'.repeat(64);ctx.rows.get('image-a').checksum='b'.repeat(64);await assert.rejects(load('convex/storyboard.ts').resolveStoryboardSelection(ctx,selection(ctx)),/FRAME_CHANGED/);
 });
 await test('approved snapshot/locked shot and stale metadata deny all edits without candidate or job writes',async()=>{
  const ctx=setup(),id=await register(ctx),old=structuredClone(ctx.rows.get('shot').metadata);await select(ctx,id);
  await assert.rejects(ctx.call('storyboard','saveDirection',{shotId:'shot',expectedMetadata:old,direction:{angle:'closeup'}}),/SHOT_METADATA_CHANGED/);
  const shotState=[...ctx.rows.values()].find(row=>row._table==='resourceStates'&&row.resourceType==='shot'&&row.resourceId==='shot');shotState.state='LOCKED';await assert.rejects(register(ctx,'image-b'),/cannot be edited/);
  ctx.rows.get(shotState._id).state='DRAFT';ctx.rows.get('version').status='APPROVED';await assert.rejects(register(ctx,'image-b'),/REVISION_REQUIRED/);await assert.rejects(select(ctx,id),/REVISION_REQUIRED/);
  assert.equal(ctx.count('generationJobs'),0);assert.equal(ctx.count('reservations'),0);
 });
 await test('generated and angle provenance requires exact completed job/source before registration',async()=>{
  const ctx=setup(),source=await register(ctx);addImage(ctx,'generated',{source:'AI_GENERATED',provenance:{generationJobId:'job'}});
  ctx.put('generationJobs',{_id:'job',projectId:'project',productionId:'production',status:'COMPLETED',operation:'PREPARATION',request:{preparationKind:'STORYBOARD_IMAGE',text:'Original reference',imageRequest:{sourceAssetIds:['image-a'],sourceProofs:[ctx.rows.get(source).direction.mediaProof],purpose:'ANGLE',sourceFrameId:source,shotId:'shot',direction:{angle:'low_angle'}}},response:{assetId:'generated',imageOutput:{storageId:'storage-generated',checksum:'a'.repeat(64),byteSize:100,contentType:'image/png'}}});
  await assert.rejects(register(ctx,'generated',{kind:'UPLOAD'}),/JOB_INVALID/);
  await assert.rejects(register(ctx,'generated',{kind:'ANGLE',generationJobId:'job'}),/SOURCE_UNAVAILABLE/);
  ctx.rows.get('job').request.imageRequest.sourceAssetIds=['image-b'];await assert.rejects(register(ctx,'generated',{kind:'ANGLE',generationJobId:'job',sourceFrameId:source}),/JOB_INVALID/);
  ctx.rows.get('job').request.imageRequest.sourceAssetIds=['image-a'];ctx.rows.get('job').response.imageOutput.checksum='b'.repeat(64);await assert.rejects(register(ctx,'generated',{kind:'ANGLE',generationJobId:'job',sourceFrameId:source,direction:{angle:'low_angle'}}),/OUTPUT_CHANGED/);ctx.rows.get('job').response.imageOutput.checksum='a'.repeat(64);
  ctx.rows.get('job').request.imageRequest.sourceProofs=[{...ctx.rows.get(source).direction.mediaProof,checksum:'b'.repeat(64)}];await assert.rejects(register(ctx,'generated',{kind:'ANGLE',generationJobId:'job',sourceFrameId:source,direction:{angle:'low_angle'}}),/SOURCE_CHANGED/);ctx.rows.get('job').request.imageRequest.sourceProofs=[ctx.rows.get(source).direction.mediaProof];
  const angle=await register(ctx,'generated',{kind:'ANGLE',generationJobId:'job',sourceFrameId:source,direction:{angle:'low_angle'}});
  assert.equal(ctx.count('shots'),1);const added=await ctx.call('storyboard','addSelectedAngleAsShot',{frameId:angle,durationSeconds:4});assert.equal(ctx.count('shots'),2);assert.notEqual(added._id,'shot');assert.equal(added.metadata.storyboard.generationGuide,'IMAGE_REFERENCE');assert.equal(ctx.count('generationJobs'),1);
  const proof=await load('convex/storyboard.ts').resolveStoryboardSelection(ctx,{...selection(ctx),shotId:added._id,metadata:added.metadata,requiredAssetIds:added.requiredAssetIds});assert.equal(proof.assetId,'generated');
 });
 await test('actual canonical CRUD/direction/order and paged authorized image projection',async()=>{
  const ctx=setup(),id=await register(ctx);await select(ctx,id);await ctx.call('storyboard','saveDirection',{shotId:'shot',expectedMetadata:ctx.rows.get('shot').metadata,direction:{framing:'wide',angle:'high',lighting:'sunrise',preserve:['teal shirt']}});
  assert.equal(ctx.rows.get('shot').camera.angle,'high');assert.equal(ctx.rows.get('shot').metadata.directing.lighting,'sunrise');
  const copy=await ctx.call('storyboard','duplicateShot',{shotId:'shot'});assert.notEqual(copy.metadata.storyboard.frameId,id);assert.equal(copy.metadata.storyboard.generationGuide,'IMAGE_REFERENCE');assert.notEqual(copy._id,'shot');
  await ctx.call('storyboard','reorderShots',{sceneId:'scene',orderedShotIds:[copy._id,'shot']});let view=await ctx.call('storyboard','list',{productionId:'production'});assert.deepEqual(view.scenes[0].orderedShotIds,[copy._id,'shot']);assert.equal(view.scenes[0].shots[1].frames[0].url,'https://fixture.convex.cloud/api/storage/storage-image-a');
  ctx.rows.get('state-image-a').state='REVISION_REQUESTED';view=await ctx.call('storyboard','list',{productionId:'production'});assert.equal(view.scenes[0].shots[1].frames[0].url,null);assert.equal(view.scenes[0].shots[1].frames[0].available,false);
  await ctx.call('storyboard','removeShot',{shotId:copy._id});assert.equal(ctx.rows.get(copy._id).status,'DELETED');assert.equal(ctx.rows.has(id),true);
  ctx.signedIn=false;await assert.rejects(ctx.call('storyboard','list',{productionId:'production'}),/session/);
 });
 await test('candidate bound and foreign selection deny before writes; views do not purchase or mutate',async()=>{
  const ctx=setup(),id=await register(ctx);for(let i=1;i<24;i++)ctx.put('storyboardFrames',{...structuredClone(ctx.rows.get(id)),_id:'candidate-'+i,prompt:'alternative '+i});
  await assert.rejects(register(ctx,'image-b'),/TOO_MANY_FRAMES/);assert.equal(ctx.count('storyboardFrames'),24);
  ctx.rows.get(id).shotId='foreign-shot';await assert.rejects(select(ctx,id),/SELECTION_INVALID/);
  ctx.rows.get(id).shotId='shot';const before=JSON.stringify([...ctx.rows]);await ctx.call('storyboard','list',{productionId:'production'});assert.equal(JSON.stringify([...ctx.rows]),before);assert.equal(ctx.scheduled.length,0);
 });
 await test('24-shot pages preserve complete canonical scene order and viewers cannot register or direct',async()=>{
  const ctx=setup();for(let i=1;i<27;i++)ctx.put('shots',{...structuredClone(ctx.rows.get('shot')),_id:'shot-'+i,title:'Shot '+i,orderIndex:i});
  const first=await ctx.call('storyboard','list',{productionId:'production'}),second=await ctx.call('storyboard','list',{productionId:'production',offset:first.nextOffset});
  assert.equal(first.totalShots,27);assert.equal(first.scenes[0].shots.length,24);assert.equal(first.scenes[0].orderedShotIds.length,27);assert.equal(first.nextOffset,24);assert.equal(second.scenes[0].shots.length,3);assert.equal(second.scenes[0].shots[0].id,'shot-24');assert.equal(second.nextOffset,null);
  ctx.role='VIEWER';assert.equal((await ctx.call('storyboard','list',{productionId:'production'})).canEdit,false);await assert.rejects(register(ctx),/access denied/);await assert.rejects(ctx.call('storyboard','saveDirection',{shotId:'shot',expectedMetadata:ctx.rows.get('shot').metadata,direction:{angle:'low'}}),/access denied/);
 });
 await test('duplicate appends unique order and retains an independent selected-frame record and exact guide',async()=>{
  const ctx=setup(),source=await register(ctx);await select(ctx,source,'FIRST_FRAME');ctx.put('shots',{...structuredClone(ctx.rows.get('shot')),_id:'next-shot',metadata:{},orderIndex:1});
  const added=await ctx.call('storyboard','duplicateShot',{shotId:'shot'});assert.equal(added.orderIndex,2);assert.equal(added.metadata.firstFrameAssetId,'image-a');assert.equal(added.metadata.storyboard.generationGuide,'FIRST_FRAME');assert.notEqual(added.metadata.storyboard.frameId,source);
  const selected=await load('convex/storyboard.ts').resolveStoryboardSelection(ctx,{...selection(ctx),shotId:added._id,metadata:added.metadata,requiredAssetIds:added.requiredAssetIds});assert.equal(selected.assetId,'image-a');
  assert.equal(ctx.rows.get(source).shotId,'shot');assert.equal(ctx.rows.get('shot').metadata.storyboard.frameId,source);
 });
 await test('canonical revision clones bounded source lineage to new scoped candidates without changing approved history',async()=>{
  const ctx=setup(),base=await register(ctx),original=structuredClone(ctx.rows.get(base));
  ctx.put('storyboardFrames',{...original,_id:'angle',kind:'ANGLE',sourceFrameId:base,direction:{...original.direction,sourceProof:original.direction.mediaProof}});await select(ctx,'angle');
  const previous=structuredClone(ctx.rows.get('shot').metadata);previous.storyboardSelection={frameId:'angle',old:'receipt'};ctx.rows.get('version').status='APPROVED';
  ctx.put('productionVersions',{_id:'version-new',productionId:'production',sourcePlanId:'plan-new',status:'DRAFT'});ctx.put('shots',{...structuredClone(ctx.rows.get('shot')),_id:'shot-new',productionVersionId:'version-new',metadata:previous});
  const args={projectId:'project',productionId:'production',productionVersionId:'version-new',shotId:'shot-new',metadata:previous};const next=await load('convex/storyboard.ts').cloneStoryboardSelection(ctx,args);
  assert.notEqual(next.storyboard.frameId,'angle');assert.equal(next.storyboardSelection,undefined);const copied=ctx.rows.get(next.storyboard.frameId),copiedSource=ctx.rows.get(copied.sourceFrameId);assert.equal(copied.productionVersionId,'version-new');assert.equal(copied.shotId,'shot-new');assert.equal(copiedSource.productionVersionId,'version-new');assert.equal(copiedSource.shotId,'shot-new');assert.notEqual(copiedSource._id,base);assert.deepEqual(ctx.rows.get(base),original);assert.equal(ctx.rows.get('shot').metadata.storyboard.frameId,'angle');
  assert.deepEqual(await load('convex/storyboard.ts').cloneStoryboardSelection(ctx,{...args,metadata:next}),next);
  await assert.rejects(load('convex/storyboard.ts').cloneStoryboardSelection(ctx,{...args,projectId:'foreign'}),/REVISION_INVALID/);
  let previousId=base;for(let i=0;i<9;i++){const id='deep-'+i;ctx.put('storyboardFrames',{...original,_id:id,sourceFrameId:previousId,direction:{...original.direction,sourceProof:original.direction.mediaProof}});previousId=id;}
  const before=ctx.count('storyboardFrames');await assert.rejects(load('convex/storyboard.ts').cloneStoryboardSelection(ctx,{...args,metadata:{storyboard:{version:1,frameId:previousId,generationGuide:'IMAGE_REFERENCE'}}}),/LINEAGE_LIMIT/);assert.equal(ctx.count('storyboardFrames'),before);
 });
 await test('selected angle applies captured composition while uploaded/project references preserve author direction and expose stale stills',async()=>{
  const ctx=setup();const current=pure.normalizeShotDirecting({framing:'wide',angle:'eye level',lens:'35mm',movement:'slow pan',lighting:'warm',preserve:['teal costume']});Object.assign(ctx.rows.get('shot'),{camera:{angle:'eye level',lens:'35mm',movement:'slow pan',framing:'wide'},metadata:{audioPolicy:'SILENT',directing:current}});
  const base=await register(ctx);const captured={...current,framing:'close-up',angle:'low angle',preserve:[]};ctx.put('storyboardFrames',{...structuredClone(ctx.rows.get(base)),_id:'angle',kind:'ANGLE',sourceFrameId:base,direction:{version:1,controls:captured,mediaProof:ctx.rows.get(base).direction.mediaProof,sourceProof:ctx.rows.get(base).direction.mediaProof}});
  await select(ctx,'angle');assert.equal(ctx.rows.get('shot').camera.framing,'close-up');assert.equal(ctx.rows.get('shot').camera.angle,'low angle');assert.equal(ctx.rows.get('shot').metadata.directing.lighting,'warm');assert.equal(ctx.rows.get('shot').camera.lens,'35mm');assert.deepEqual(ctx.rows.get('shot').metadata.directing.preserve,['teal costume']);
  // A later lighting edit retains the actual still and exposes its older direction.
  const changed={...ctx.rows.get('shot').metadata.directing,lighting:'cool moonlight'};await ctx.call('storyboard','saveDirection',{shotId:'shot',direction:changed,expectedMetadata:ctx.rows.get('shot').metadata});const view=await ctx.call('storyboard','list',{productionId:'production'});assert.equal(view.scenes[0].shots[0].selectedFrameDirectionOutdated,true);
  await select(ctx,base);assert.equal(ctx.rows.get('shot').metadata.directing.lighting,'cool moonlight');assert.equal(ctx.rows.get('shot').camera.framing,'close-up');
  const provenance={generationJobId:'historical-image-job',provider:'openrouter',model:'historical/model'};addImage(ctx,'old-generated',{source:'AI_GENERATED',provenance});const id=await register(ctx,'old-generated',{kind:'PROJECT_REFERENCE',prompt:'Deliberately reused approved project image'});await select(ctx,id);assert.equal(ctx.rows.get(id).kind,'PROJECT_REFERENCE');assert.equal(ctx.rows.get(id).generationJobId,undefined);assert.equal(ctx.rows.get('shot').metadata.directing.lighting,'cool moonlight');assert.deepEqual(ctx.rows.get('old-generated').provenance,provenance);assert.equal(ctx.count('generationJobs'),0);
  await assert.rejects(register(ctx,'old-generated',{kind:'PROJECT_REFERENCE',generationJobId:'invented-job'}),/JOB_INVALID/);
 });
 console.log('Storyboard: '+count+' PASS; real handlers and canonical scene delegates, isolated auth/storage contracts, no online database or provider calls.');
})().catch(error=>{console.error(error);process.exitCode=1;});
