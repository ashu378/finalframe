const assert = require('node:assert/strict');
const { fixture, runFixture, load } = require('../recipes/backend-fixture.cjs');

(async () => {
  process.env.FINALFRAME_RECIPE_ENABLED='true';
  process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED='true';
  process.env.FINALFRAME_MANIFEST_V5_ENABLED='true';
  process.env.FINALFRAME_SOURCE_AUDIO_RESTORE_ENABLED='true';
  const c=fixture();
  const action={id:'bite',subject:'Man',action:'Take a bite and chew three times',startSeconds:4.79,endSeconds:7.25,beforeSeconds:5.751};
  await runFixture(c,{generation:true,shotMetadata:{storyActions:[action]}});
  Object.assign(c.rows.get('shot'),{durationSeconds:8.125});
  c.rows.get('scene').projectId='project';
  const digests={recording:'1'.repeat(64),base:'2'.repeat(64),donor:'3'.repeat(64),output:'4'.repeat(64)};
  for(const id of ['recording','base','donor']){
    c.storageObjects.set(id+'-blob',{sha256:digests[id],size:100,contentType:'video/mp4'});
    c.put('assets',{_id:id,projectId:'project',scope:'PROJECT',storageId:id+'-blob',checksum:digests[id],mimeType:'video/mp4'});
    c.put('resourceStates',{_id:id+'-approval',projectId:'project',resourceId:id,resourceType:'asset',state:'APPROVED'});
  }
  c.put('shotVersions',{_id:'failed',projectId:'project',productionId:'production',productionVersionId:'version',shotId:'shot',versionNumber:1,assetId:'recording',status:'COMPLETED',contextSnapshot:{request:{storyRepair:{approachVersion:'whole-shot-performance-v1'}}}});
  const args={shotVersionId:'failed',shotId:'shot',baseAssetId:'base',donorAssetId:'donor',targetStartFrame:115,targetEndFrame:138,donorStartFrame:28,donorEndFrame:69};
  const use=(op,params)=>c.call('performanceCutaways',op,params);
  assert.equal(await use('options',{shotVersionId:'failed'}),null);
  const review=await c.call('storyActionReviews','get',{takeId:'failed'});
  await c.call('storyActionReviews','record',{takeId:'failed',requirementKey:review.requirementKey,observations:[{actionId:'bite',result:'FAIL',observedStartSeconds:null,observedEndSeconds:null,evidence:'No chew before dialogue.'}]});
  const option=await use('options',{shotVersionId:'failed'});
  assert.equal(option.videos.length,3);assert.equal(option.targetStartFrame,115);assert.equal(option.targetEndFrame,138);
  const {key,request}=await use('prepare',args);
  assert.equal(request.recording.assetId,'recording');assert.equal(request.donor.assetId,'donor');
  await assert.rejects(use('prepare',{...args,shotId:'other'}));
  await assert.rejects(use('prepare',{...args,targetStartFrame:30}));
  await assert.rejects(use('prepare',{...args,donorEndFrame:330}));
  c.role='VIEWER';await assert.rejects(use('prepare',args));c.role='OWNER';
  c.rows.get('donor').projectId='other';await assert.rejects(use('prepare',args));c.rows.get('donor').projectId='project';
  c.rows.get('donor-approval').state='DRAFT';await assert.rejects(use('prepare',args));c.rows.get('donor-approval').state='APPROVED';
  const frames=Array.from({length:23},(_,i)=>28+Math.round(i*40/22));
  const proof={version:'PERFORMANCE_CUTAWAY_V1',sourceChecksum:digests.base,donorChecksum:digests.donor,recordingChecksum:digests.recording,
    targetStartFrame:115,targetEndFrame:138,donorStartFrame:28,donorEndFrame:69,selectedDonorFrames:frames,sourceFrames:195,donorFrames:96,
    outputFrames:195,width:1280,height:720,fps:24,originalAudioCopied:true,checksum:digests.output,byteSize:100};
  c.storageObjects.set('edited',{contentType:'video/mp4',sha256:digests.output,size:100});
  const save={...args,key,storageId:'edited',proof};
  await assert.rejects(use('adopt',{...save,key:key+'stale'}));
  await assert.rejects(use('adopt',{...save,proof:{...proof,originalAudioCopied:false}}));
  await assert.rejects(use('adopt',{...save,proof:{...proof,selectedDonorFrames:frames.slice(1)}}));
  c.put('resourceStates',{_id:'shot-lock',projectId:'project',resourceType:'shot',resourceId:'shot',state:'LOCKED'});await assert.rejects(use('adopt',save));c.rows.get('shot-lock').state='DRAFT';
  c.rows.get('donor').rights={status:'REVOKED'};await assert.rejects(use('adopt',save));delete c.rows.get('donor').rights;
  const result=await use('adopt',save), again=await use('adopt',save);
  assert.deepEqual(result,again);assert.deepEqual((await use('prepare',args)).saved,result);
  assert.equal(c.rows.get(result.shotVersionId).actualCost,0);assert.equal(c.count('providerBudgetReservations'),0);
  assert.equal(c.rows.get('failed').assetId,'recording');
  assert.equal((await c.call('storyActionReviews','get',{takeId:result.shotVersionId})).passed,false);
  const {validateSourceAudioManifest}=load('convex/sourceAudioContracts.ts');
  const item={kind:'video',shotVersionId:result.shotVersionId,assetId:result.assetId,volume:1};
  const checked=(i)=>validateSourceAudioManifest(c,'project',{items:[i]},'user','version');
  await assert.rejects(checked(item)); // newly saved picture needs creator review
  c.rows.get([...c.rows.values()].find(r=>r._table==='resourceStates'&&r.resourceId===result.assetId)._id).state='APPROVED';
  await checked(item);
  await assert.rejects(checked({...item,volume:0}));
  c.rows.get('recording').rights={status:'REVOKED'};await assert.rejects(checked(item));
  console.log('PASS saved performance, 41 → 23 decoded frame selection, original sound, reapproval, single adoption, zero charges, project access, stale source, locks and export.');
})().catch(e=>{console.error(e);process.exitCode=1;});
