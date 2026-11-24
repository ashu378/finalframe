const assert=require('node:assert/strict');
const { fixture, runFixture, load }=require('../recipes/backend-fixture.cjs');
async function verifyRepair(aiOnly){
  Object.assign(process.env,{FINALFRAME_MANIFEST_V5_ENABLED:'true',FINALFRAME_SOURCE_AUDIO_RESTORE_ENABLED:'true',FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED:'true',FINALFRAME_RECIPE_ENABLED:'true'});
  const c=fixture();
  const beat={id:'lift',subject:'The returning performer',action:'Lift a blue cup to eye height and lower it.',startSeconds:2,endSeconds:4,beforeSeconds:3.5};
  const binding={role:'cast_0',resourceVersionId:'person-v1'};
  await runFixture(c,{generation:true,shotMetadata:{storyActions:[beat]}});
  Object.assign(c.rows.get('shot'),{durationSeconds:6,title:'The cup trick'}); c.rows.get('shot').metadata.resourceBindings=[binding];
  c.rows.get('scene').projectId='project';
  c.put('projectResources',{_id:'person',projectId:'project',kind:'CHARACTER'});
  c.put('projectResourceVersions',{_id:'person-v1',projectId:'project',resourceId:'person'});
  function approved(type,id){c.put('resourceStates',{_id:id+'-state',projectId:'project',resourceType:type,resourceId:id,state:'APPROVED'});}
  approved('projectResourceVersion','person-v1');
  const pic=(id,checksum,frames=144,audio=false)=>{
    c.put('assets',{_id:id,projectId:'project',scope:'PROJECT',source:'USER_UPLOAD',storageId:id+'-blob',checksum,mimeType:'video/mp4',metadata:{}});
    c.storageObjects.set(id+'-blob',{contentType:'video/mp4',size:300,sha256:checksum});approved('asset',id);
    c.put('verifiedMediaProbes',{_id:id+'-probe',assetId:id,projectId:'project',storageId:id+'-blob',checksum,byteSize:300,width:640,height:360,videoCodec:'h264',hasAudio:audio,audioCodec:audio?'aac':null,
      videoTiming:{version:'DECODED_VIDEO_FRAMES_V1',firstFrameSeconds:0,fpsNumerator:24,fpsDenominator:1,frameCount:frames,durationSeconds:frames/24},videoTimingSourceStorageId:id+'-blob',videoTimingSourceChecksum:checksum});
  };
  pic('baseline','1'.repeat(64),144,true);pic('other','2'.repeat(64),100);pic('donor','3'.repeat(64),96);
  const take=(id,shotId,assetId,bnd=binding)=>c.put('shotVersions',{_id:id,projectId:'project',productionId:'production',productionVersionId:'version',shotId,assetId,status:'COMPLETED',versionNumber:1,contextSnapshot:{request:{resourceBindings:[bnd]}}});
  take('failed','shot','baseline');
  const review=async(id,passed,start=null,end=null)=>{
    const data=await c.call('storyActionReviews','get',{takeId:id});
    return c.call('storyActionReviews','record',{takeId:id,requirementKey:data.requirementKey,observations:[{actionId:beat.id,result:passed?'PASS':'FAIL',observedStartSeconds:start,observedEndSeconds:end,evidence:passed?'The performer clearly raises the blue cup.':'The hand stays still by the cup.'}]});
  };
  const call=(f,args={})=>c.call('automaticPerformanceRepair',f,{takeId:'failed',...args},false);
  if(aiOnly){
    const { requirementKey }=await c.call('storyActionReviews','get',{takeId:'failed'});
    const { ACTION_CHECK_VERSION }=load('src/lib/production/story-action-check.ts');
    const observation={actionId:beat.id,result:'FAIL',performance:'STILL_OR_CAMERA_ONLY',observedStartSeconds:null,observedEndSeconds:null,evidence:'The hand remains beside the cup.'};
    const check={_id:'picture-check',projectId:'project',takeId:'failed',requirementKey,requestKey:'verified-receipt',actorUserId:'user',model:'test/vision',checkVersion:ACTION_CHECK_VERSION,priceCeiling:{prompt:1,completion:1},maximumCostUsd:.01,createdAt:1,expiresAt:11,completedAt:3,observations:[observation]};
    for(const changes of [
      {observations:[{...observation,result:'PASS',performance:'AS_DIRECTED'}]},
      {observations:[{...observation,result:'UNCERTAIN',performance:'UNCLEAR'}]},
      {requirementKey:'superseded-picture-or-shot'},
      {projectId:'other-project'},
      {checkVersion:'prior-prompt-without-performance-check'},
      {completedAt:undefined},
    ]){
      c.put('storyActionChecks',{...check,...changes});
      await assert.rejects(call('estimate'),/Run the picture check again/);
    }
    c.put('storyActionChecks',check);
    const { latest,failedPictureCheck }=await c.call('storyActionReviews','get',{takeId:'failed'});
    assert.equal(latest,null);
    assert.equal(failedPictureCheck,true);
  } else await review('failed',false);
  const initial=await call('context');assert.equal(initial.base.assetId,'baseline');assert.deepEqual(initial.candidates.map(x=>x.assetId),['donor','other']);
  c.put('shots',{...c.rows.get('shot'),_id:'another-shot',metadata:{storyActions:[{...beat,startSeconds:0,beforeSeconds:null}],resourceBindings:[binding]}});
  take('different-shot','another-shot','donor');await review('different-shot',true,.5,1.5);approved('shotVersion','different-shot');
  const reviewed=await call('context');assert.equal(reviewed.reviewed.donor.assetId,'donor');assert.deepEqual(reviewed.reviewed.range,{targetStartFrame:48,targetEndFrame:72,donorStartFrame:12,donorEndFrame:36});
  for(const [r,k,bad] of [[c.rows.get('another-shot').metadata,'resourceBindings',[{role:'cast_0',resourceVersionId:'foreign'}]],
    [c.rows.get('different-shot').contextSnapshot.request,'resourceBindings',[]],
    [c.rows.get('person-v1'),'projectId','other-project'],[c.rows.get('person-v1-state'),'state','REVISION_REQUESTED'],
    [c.rows.get('different-shot'),'projectId','other-project']]){
    const old=r[k];r[k]=bad;assert.equal((await call('context')).reviewed,null);r[k]=old;
  }
  let checks=0,submits=0,donorStartFrame=12;
  const origAction=c.runAction;
  let chosen='donor';
  c.runAction=async(ref,args)=>{
    const name=String(ref);
    if(name==='automaticRepairVision.estimate')return {model:'test/vision',maximumCostUsd:.05,priceCeiling:{prompt:1,completion:2}};
    if(name==='automaticRepairVision.inspect'){
      checks++;
      return args.candidateIndex===1?{status:'MATCH',targetEndFrame:84,donorStartFrame,donorEndFrame:donorStartFrame+36}:{status:'NO_MATCH'};
    }
    if(name==='performanceCutaways.saveDiscovered'){
      submits++;
      const {discoveryContextHash,...choice}=args;
      const {key,request}=await c.call('performanceCutaways','prepare',args);
      assert.equal(args.donorAssetId,chosen);
      const {source,donor,recording,operation,...range}=request;
      const frames=load('renderer/src/media/performance-cutaway-contract.ts').selectCutawayFrames(range);
      const checksum='4'.repeat(64);
      c.storageObjects.set('repair-output',{contentType:'video/mp4',size:400,sha256:checksum});
      const payload={...choice,discoveryContextHash,key,storageId:'repair-output',proof:{version:'PERFORMANCE_CUTAWAY_V1',...range,selectedDonorFrames:frames,originalAudioCopied:true,sourceFrames:144,outputFrames:144,donorFrames:96,fps:24,width:640,height:360,sourceChecksum:source.checksum,donorChecksum:donor.checksum,recordingChecksum:recording.checksum,checksum,byteSize:400}};
      await assert.rejects(c.call('performanceCutaways','adopt',{...payload,discoveryContextHash:'changed-while-rendering'}),/changed/);
      return c.call('performanceCutaways','adopt',payload);
    }
    return origAction(ref,args);
  };
  const free=await call('estimate');assert.equal(free.maximumCostUsd,0);assert.equal(submits,0);
  await assert.rejects(call('run',{quoteKey:'0.forged'}));
  c.rows.get('different-shot-state').state='REVISION_REQUESTED';
  const paid=await call('estimate');assert.equal(paid.candidateCount,2);assert.equal(paid.maximumCostUsd,.1);
  await assert.rejects(call('run',{quoteKey:free.quoteKey}),/changed/);
  const actual=await call('context'); chosen=actual.candidates[1].assetId;
  const result=await call('run',{quoteKey:paid.quoteKey});assert.equal(result.status,'SAVED');assert.equal(checks,2);assert.equal(submits,1);
  assert.equal(c.rows.get(result.shotVersionId).actualCost,0);assert.equal(c.rows.get('failed').assetId,'baseline');
  const receipt=c.rows.get(result.shotVersionId).contextSnapshot;
  if(aiOnly){assert.equal(receipt.reviewId,null);assert.equal(receipt.checkId,'picture-check');}
  else {assert.ok(receipt.reviewId);assert.equal(receipt.checkId,null);}
  const version=load('src/lib/production/repair-source-vision.ts').REPAIR_DISCOVERY_VERSION;
  assert.equal(receipt.discoveryVersion,version);
  assert.equal(c.rows.get(result.assetId).name,'The cup trick - take 2');
  const fresh=await call('estimate');assert.equal(fresh.maximumCostUsd,0);const replay=await call('run',{quoteKey:paid.quoteKey});
  assert.deepEqual(result,replay);assert.equal(checks,2);assert.equal(submits,1);
  // A rejected draft and its original lead back to the very same performance and audio.
  await review(result.shotVersionId,false);
  assert.equal(await call('repairOrigin',{takeId:result.shotVersionId}),'failed');
  await assert.rejects(c.call('performanceCutaways','prepare',{...receipt.range,shotVersionId:'failed',shotId:'shot',baseAssetId:'baseline',donorAssetId:chosen,discoveryContextHash:receipt.discoveryContextHash}),/changed/);
  const same=await call('context');
  assert.ok(!same.saved && !same.candidates.some(a=>a.assetId===chosen));
  // Simulate a draft adopted by an older method. It can be reevaluated only
  // after a new quote and still cannot be silently readopted at the same frames.
  delete c.rows.get(result.shotVersionId).contextSnapshot.discoveryVersion; // Unversioned v1 rows in storage
  const newer=await call('context');assert.ok(newer.candidates.some(a=>a.assetId===chosen));
  const newQuote=await call('estimate',{takeId:result.shotVersionId});
  const unchanged=await call('run',{takeId:result.shotVersionId,quoteKey:newQuote.quoteKey});
  assert.equal(unchanged.status,'NO_MATCH');assert.equal(submits,1);
  donorStartFrame=24;
  const newEdit=await call('run',{takeId:result.shotVersionId,quoteKey:newQuote.quoteKey});
  assert.equal(newEdit.status,'SAVED');assert.notEqual(newEdit.shotVersionId,result.shotVersionId);
  const nextReceipt=c.rows.get(newEdit.shotVersionId).contextSnapshot;
  assert.equal(nextReceipt.failedTakeId,'failed');assert.equal(nextReceipt.sourcePicture.assetId,'baseline');
  assert.equal(nextReceipt.originalRecording.assetId,'baseline');assert.equal(nextReceipt.range.donorStartFrame,24);
  assert.equal(c.rows.get(newEdit.assetId).name,'The cup trick - take 3');
  const reread=await call('run',{takeId:result.shotVersionId,quoteKey:newQuote.quoteKey});
  assert.deepEqual(reread,newEdit);
  c.role='VIEWER';await assert.rejects(call('estimate'));c.role='OWNER';
  console.log(aiOnly?'PASS AI-only failure, PASS/UNCERTAIN/stale/foreign/incomplete evidence denied;':'PASS creator-reviewed failure;', 'fresh failed action, authorized search, same-cast approved timing, wrong/foreign/revoked identity rejection, 2 unmarked candidates, approved shorter action, versioned entry/exit range, original sound, rejected edit skipped, corrected sibling, no replayed purchase.');
}
(async()=>{await verifyRepair(false);await verifyRepair(true);})().catch(e=>{console.error(e);process.exitCode=1;});
