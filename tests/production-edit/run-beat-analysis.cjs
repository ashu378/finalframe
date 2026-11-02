const assert=require('node:assert/strict');
const path=require('node:path');
const {fixture,editor}=require('./run-finishing-v5.cjs');
const beat=require(path.resolve(__dirname,'../../convex/beatAnalysis.ts'));
const {planBeatCuts}=require(path.resolve(__dirname,'../../convex/beatCutContracts.ts'));
const {getFunctionName}=require('convex/server');
const algorithm='ff-beat-spectral-flux-v1';
let time=Date.now();const originalNow=Date.now;Date.now=()=>time;
const oldFlags=[process.env.FINALFRAME_BEAT_ANALYSIS_ENABLED,process.env.FINALFRAME_BEAT_WORKER_ENABLED,process.env.FINALFRAME_MANIFEST_V5_ENABLED];
const oldWorker=[process.env.RENDER_WORKER_URL,process.env.RENDER_WORKER_SHARED_SECRET];const originalFetch=globalThis.fetch;
const sourceSha='a'.repeat(64);
const goodResult=()=>({algorithmVersion:algorithm,outcome:'RELIABLE',durationSeconds:12,sampleRate:16000,beatsSeconds:Array.from({length:23},(_,index)=>.5+index*.5),confidence:.852,tempoBpm:120,tempoSegments:[{startSeconds:0,endSeconds:12,bpm:120,confidence:.9}],reasonCode:'STRONG_PERIODIC_ONSETS'});
let key=0;const args=()=>({projectId:'project_1',assetId:'asset_music',idempotencyKey:`beat-contract-${++key}`});
function context(){
 const ctx=fixture();const project=ctx.rows.get('project_1');Object.assign(project,{studioId:'studio_1',ownerUserId:'user_1',status:'ACTIVE'});
 ctx.put('users',{_id:'user_1',status:'active',externalId:'owner'});ctx.put('studios',{_id:'studio_1',externalId:'studio',ownerUserId:'user_1',status:'active'});ctx.put('members',{_id:'member_1',studioId:'studio_1',userId:'user_1',role:'owner',status:'active'});ctx.put('projectMembers',{_id:'pm_1',projectId:'project_1',userId:'user_1',role:'OWNER',status:'ACTIVE'});
 for(const id of ['music','red','blue'])ctx.put('resourceStates',{_id:`state_${id}`,projectId:'project_1',resourceType:'asset',resourceId:`asset_${id}`,state:'APPROVED'});
 ctx.storageObjects.get('storage_music').sha256=sourceSha;ctx.storage.getUrl=async id=>`https://fixture.convex.cloud/api/storage/${id}`;
 ctx.scheduled=[];ctx.scheduler={runAfter:async(delay,ref,input)=>{ctx.scheduled.push({delay,name:getFunctionName(ref),input});}};
 ctx.runMutation=(ref,input)=>beat[getFunctionName(ref).split(':')[1]].handler(ctx,input);
 return ctx;
}
async function completed(ctx){const created=await beat.request.handler(ctx,args());const leased=await beat.claim.handler(ctx,{jobId:created.jobId});assert.ok(leased);await beat.complete.handler(ctx,{jobId:created.jobId,leaseId:leased.leaseId,result:goodResult()});return ctx.rows.get(created.jobId).analysisVersionId;}
let checks=0;async function check(name,run){await run();checks++;console.log('PASS '+name);}
(async()=>{try{
 delete process.env.FINALFRAME_BEAT_ANALYSIS_ENABLED;delete process.env.FINALFRAME_BEAT_WORKER_ENABLED;
 await check('public analysis is disabled by default and never schedules paid/model work',async()=>{const ctx=context();await assert.rejects(beat.request.handler(ctx,args()),/not enabled/);assert.equal(ctx.count('beatAnalysisJobs'),0);assert.equal(ctx.scheduled.length,0);});
 process.env.FINALFRAME_BEAT_ANALYSIS_ENABLED='true';process.env.FINALFRAME_BEAT_WORKER_ENABLED='true';
 await check('canonical online Storage base64 SHA binds the exact same worker digest without rewriting asset lineage',async()=>{
  const ctx=context();ctx.storageObjects.get('storage_music').sha256=Buffer.from(sourceSha,'hex').toString('base64');
  const originalAssetChecksum=ctx.rows.get('asset_music').checksum;
  const made=await beat.request.handler(ctx,args());const claimed=await beat.claim.handler(ctx,{jobId:made.jobId});
  assert.equal(claimed.sourceChecksum,sourceSha);assert.equal(claimed.assetChecksum,originalAssetChecksum);
  await beat.complete.handler(ctx,{jobId:made.jobId,leaseId:claimed.leaseId,result:goodResult()});
  assert.equal(ctx.rows.get(made.jobId).status,'COMPLETED');assert.equal(ctx.rows.get('asset_music').checksum,originalAssetChecksum);
  ctx.storageObjects.get('storage_music').sha256='not-a-digest';await assert.rejects(beat.request.handler(ctx,args()),/canonical audio/);
 });
 await check('request replay fences current source/user and cache reuse does not recompute',async()=>{
  const ctx=context();const input=args();const first=await beat.request.handler(ctx,input);const repeat=await beat.request.handler(ctx,input);assert.equal(first.jobId,repeat.jobId);assert.equal(repeat.replayed,true);assert.equal(ctx.count('beatAnalysisJobs'),1);
  const leased=await beat.claim.handler(ctx,{jobId:first.jobId});await beat.complete.handler(ctx,{jobId:first.jobId,leaseId:leased.leaseId,result:goodResult()});const cached=await beat.request.handler(ctx,args());assert.equal(ctx.rows.get(cached.jobId).status,'COMPLETED');assert.equal(ctx.count('beatAnalysisVersions'),1);
  ctx.storageObjects.get('storage_music').sha256='b'.repeat(64);await assert.rejects(beat.request.handler(ctx,input),/another source/);
 });
 await check('leases serialize analysis, preserve attempts on media429, and recover bounded expiry',async()=>{
  const ctx=context();const first=await beat.request.handler(ctx,args());const second=await beat.request.handler(ctx,args());const lease=await beat.claim.handler(ctx,{jobId:first.jobId});assert.equal(await beat.claim.handler(ctx,{jobId:second.jobId}),null);
  await beat.fail.handler(ctx,{jobId:first.jobId,leaseId:'forged',retryable:true,errorCode:'bad'});assert.equal(ctx.rows.get(first.jobId).status,'PROCESSING');
  await beat.fail.handler(ctx,{jobId:first.jobId,leaseId:lease.leaseId,retryable:true,busy:true,errorCode:'BEAT_WAITING_FOR_MEDIA'});assert.equal(ctx.rows.get(first.jobId).attemptCount,0);assert.equal(ctx.rows.get(first.jobId).status,'RETRYING');
  time+=30001;const retry=await beat.claim.handler(ctx,{jobId:first.jobId});assert.ok(retry);time+=180001;await beat.expire.handler(ctx,{jobId:first.jobId,leaseId:retry.leaseId});assert.equal(ctx.rows.get(first.jobId).status,'RETRYING');
  await beat.complete.handler(ctx,{jobId:first.jobId,leaseId:retry.leaseId,result:goodResult()});assert.equal(ctx.count('beatAnalysisVersions'),0);
 });
 await check('claim/commit reject changed approval, storage, identity and malformed grids',async()=>{
  for(const mutate of [ctx=>ctx.rows.get('state_music').state='DRAFT',ctx=>ctx.rows.get('user_1').status='disabled',ctx=>ctx.rows.get('pm_1').role='VIEWER',ctx=>ctx.rows.get('member_1').status='removed',ctx=>ctx.rows.get('asset_music').projectId='project_2',ctx=>ctx.rows.get('project_1').status='ARCHIVED',ctx=>ctx.rows.get('asset_music').moderation={status:'DENIED'}]){
   const ctx=context();const job=await beat.request.handler(ctx,args());mutate(ctx);assert.equal(await beat.claim.handler(ctx,{jobId:job.jobId}),null);assert.equal(ctx.rows.get(job.jobId).status,'FAILED');
  }
  const ctx=context();const job=await beat.request.handler(ctx,args());const lease=await beat.claim.handler(ctx,{jobId:job.jobId});ctx.storageObjects.get('storage_music').sha256='c'.repeat(64);await beat.complete.handler(ctx,{jobId:job.jobId,leaseId:lease.leaseId,result:goodResult()});assert.equal(ctx.rows.get(job.jobId).status,'FAILED');assert.equal(ctx.count('beatAnalysisVersions'),0);
  const bad=context();const pending=await beat.request.handler(bad,args());const claimed=await beat.claim.handler(bad,{jobId:pending.jobId});const invalid=goodResult();invalid.beatsSeconds=[1,.5];await beat.complete.handler(bad,{jobId:pending.jobId,leaseId:claimed.leaseId,result:invalid});assert.equal(bad.rows.get(pending.jobId).status,'FAILED');
  const legacy=context();legacy.rows.delete('pm_1');legacy.rows.delete('member_1');delete legacy.rows.get('project_1').ownerUserId;delete legacy.rows.get('project_1').createdByUserId;legacy.rows.get('project_1').createdByExternalId='owner';delete legacy.rows.get('studio_1').ownerUserId;legacy.rows.get('studio_1').ownerExternalId='owner';const retained=await beat.request.handler(legacy,args());assert.ok(await beat.claim.handler(legacy,{jobId:retained.jobId}),'verified saved actor retains canonical legacy owner fallback');
 });
 await check('manual correction appends immutable source-bound version, retains confidence and fences replay',async()=>{
  const ctx=context();const parentId=await completed(ctx);const original=structuredClone(ctx.rows.get(parentId));const input={parentVersionId:parentId,beatsSeconds:[.5,1.01,1.5,2],correctionNote:'Reviewed original click attacks.',idempotencyKey:'manual-beat-contract'};const made=await beat.manual.handler(ctx,input);const version=ctx.rows.get(made.analysisVersionId);assert.equal(version.origin,'MANUAL');assert.equal(version.confidence,original.confidence);assert.equal(version.parentVersionId,parentId);assert.deepEqual(ctx.rows.get(parentId),original);
  assert.equal((await beat.manual.handler(ctx,input)).replayed,true);await assert.rejects(beat.manual.handler(ctx,{...input,beatsSeconds:[.5,1,1.5,2.1]}),/another version/);
  ctx.actorUserId='user_other';await assert.rejects(beat.manual.handler(ctx,input),/another version/);ctx.actorUserId=undefined;
  ctx.rows.get('state_music').state='REVISION_REQUESTED';await assert.rejects(beat.manual.handler(ctx,input),/Approve/);
 });
 await check('reliable map cuts create a new immutable timeline and preserve complete independent audio settings',async()=>{
  const ctx=context();ctx.rows.get('clip_sound').durationSeconds=4;ctx.rows.get('clip_sound').metadata.audio={fadeInSeconds:.25,fadeOutSeconds:.5};const analysisVersionId=await completed(ctx);ctx.lock('timeline_1');const before=structuredClone(ctx.rows.get('timeline_1'));const sound=structuredClone(ctx.rows.get('clip_sound'));
  process.env.FINALFRAME_MANIFEST_V5_ENABLED='true';const input={timelineId:'timeline_1',analysisVersionId,audioClipId:'clip_sound',pictureTrackId:'picture'};const preview=await editor.previewBeatCuts.handler(ctx,input);assert.equal(ctx.count('timelines'),1);assert.equal(preview.durationSeconds,4);assert.deepEqual(preview.clips.map(clip=>clip.durationInFrames),[60,60]);
  const request={...input,expectedPlanHash:preview.planHash,idempotencyKey:'apply-beat-contract'};const created=await editor.applyBeatCuts.handler(ctx,request);const draft=await ctx.draft(created.timelineId);assert.equal(draft.timeline.status,'DRAFT');assert.equal(draft.timeline.durationSeconds,4);assert.deepEqual(ctx.rows.get('timeline_1'),before);assert.deepEqual(ctx.rows.get('clip_sound'),sound);
  const audio=draft.tracks.find(track=>track.kind==='AUDIO').clips[0];for(const field of ['startSeconds','durationSeconds','trimStartSeconds','volume'])assert.equal(audio[field],sound[field]);assert.deepEqual(audio.metadata.audio,sound.metadata.audio);assert.equal(draft.metadata.beatEdit.analysisVersionId,analysisVersionId);assert.equal((await editor.applyBeatCuts.handler(ctx,request)).replayed,true);
  await assert.rejects(editor.applyBeatCuts.handler(ctx,{...input,expectedPlanHash:'stale',idempotencyKey:'apply-beat-stale'}),/plan changed/);
  const blocked=context();blocked.rows.get('clip_sound').durationSeconds=4;const amb=await completed(blocked);blocked.rows.get(amb).outcome='AMBIGUOUS';await assert.rejects(editor.previewBeatCuts.handler(blocked,{...input,analysisVersionId:amb}),/reliable/);
 });
 await check('planner refuses unsupported source extension, out-of-window/manual cuts and too few beats',()=>{
  const base={pictures:[{id:'a',durationSeconds:2},{id:'b',durationSeconds:2}],beatsSeconds:[.5,1,1.5,2,2.5,3,3.5],fps:30,audioStartSeconds:0,audioDurationSeconds:4,audioTrimStartSeconds:0};const plan=planBeatCuts(base);assert.deepEqual(plan.boundaryFrames,[0,60,120]);
  assert.throws(()=>planBeatCuts({...base,audioStartSeconds:1}));assert.throws(()=>planBeatCuts({...base,audioDurationSeconds:5}));assert.throws(()=>planBeatCuts({...base,beatIndices:[0]}),/extend/);assert.throws(()=>planBeatCuts({...base,beatsSeconds:[]}));assert.throws(()=>planBeatCuts({...base,beatIndices:[999]}));
  assert.throws(()=>planBeatCuts({...base,beatsSeconds:[1,.5,2]}));assert.throws(()=>planBeatCuts({...base,audioStartSeconds:NaN}));assert.throws(()=>planBeatCuts({...base,pictures:[base.pictures[0],base.pictures[0]]}));
 });
 await check('beat edit rejects captions, transitions, overhanging audio and revoked picture rights',async()=>{
  for(const [mutate,reason] of [
   [ctx=>ctx.rows.get('clip_red').transition={out:{kind:'DISSOLVE',durationSeconds:.5}},/transitions/],
   [ctx=>ctx.rows.get('clip_red').metadata.captionTrack={cues:[{text:'Keep these words',startSeconds:0,endSeconds:1}]},/captions/],
   [ctx=>ctx.rows.get('clip_sound').startSeconds=1,/starting at zero/],
   [ctx=>ctx.put('timelineClips',{...structuredClone(ctx.rows.get('clip_sound')),_id:'extra_audio',durationSeconds:5}),/Other audio or overlays/],
   [ctx=>ctx.rows.get('asset_red').rights={status:'REVOKED'},/rights changed/],
  ]){
   const ctx=context();ctx.rows.get('clip_sound').durationSeconds=4;const analysisVersionId=await completed(ctx);mutate(ctx);const before=ctx.count('timelines');await assert.rejects(editor.previewBeatCuts.handler(ctx,{timelineId:'timeline_1',analysisVersionId,audioClipId:'clip_sound',pictureTrackId:'picture'}),reason);assert.equal(ctx.count('timelines'),before);
  }
 });
 await check('async worker receipt identity, byte caps and retry exhaustion remain fenced',async()=>{
  process.env.RENDER_WORKER_URL='https://worker.invalid';process.env.RENDER_WORKER_SHARED_SECRET='fixture-only';
  for(const mode of ['good','scope','oversized','busy','denied']){
   const ctx=context();const created=await beat.request.handler(ctx,args());let calls=0;
   globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,'https://worker.invalid/media/analyze-beats');assert.equal(init.redirect,'error');assert.equal(init.headers['x-finalframe-worker-secret'],'fixture-only');const prepared=JSON.parse(init.body);if(mode==='busy')return new Response('',{status:429});if(mode==='denied')return new Response('',{status:401});if(mode==='oversized')return new Response('x'.repeat(256*1024+1));return Response.json({...prepared,url:undefined,projectId:mode==='scope'?'foreign-project':prepared.projectId,result:goodResult()});};
   await beat.run.handler(ctx,{jobId:created.jobId});assert.equal(calls,1);const job=ctx.rows.get(created.jobId);
   assert.equal(job.status,mode==='good'?'COMPLETED':mode==='denied'?'FAILED':'RETRYING');assert.equal(ctx.count('beatAnalysisVersions'),mode==='good'?1:0);if(mode==='busy')assert.equal(job.attemptCount,0);
  }
  const exhausted=context();const created=await beat.request.handler(exhausted,args());for(let attempt=0;attempt<3;attempt++){const lease=await beat.claim.handler(exhausted,{jobId:created.jobId});assert.ok(lease);await beat.fail.handler(exhausted,{jobId:created.jobId,leaseId:lease.leaseId,retryable:true,errorCode:'BEAT_TRANSFER_UNCERTAIN'});time+=30001;}assert.equal(exhausted.rows.get(created.jobId).status,'FAILED');assert.equal(exhausted.rows.get(created.jobId).attemptCount,3);
  const old=context();const queued=await beat.request.handler(old,args());time+=2*60*60*1000+1;assert.equal(await beat.claim.handler(old,{jobId:queued.jobId}),null);assert.equal(old.rows.get(queued.jobId).errorCode,'BEAT_RETRY_EXHAUSTED');
  globalThis.fetch=originalFetch;
 });
 await check('cancel/disabled worker preserve records and late responses cannot complete canceled work',async()=>{
  const ctx=context();const job=await beat.request.handler(ctx,args());const leased=await beat.claim.handler(ctx,{jobId:job.jobId});await beat.cancel.handler(ctx,{jobId:job.jobId});await beat.complete.handler(ctx,{jobId:job.jobId,leaseId:leased.leaseId,result:goodResult()});assert.equal(ctx.rows.get(job.jobId).status,'CANCELED');assert.equal(ctx.count('beatAnalysisVersions'),0);
  process.env.FINALFRAME_BEAT_WORKER_ENABLED='false';const waiting=await beat.request.handler(ctx,args());assert.equal(await beat.claim.handler(ctx,{jobId:waiting.jobId}),null);assert.equal(ctx.rows.get(waiting.jobId).status,'QUEUED');process.env.FINALFRAME_BEAT_WORKER_ENABLED='true';assert.ok(await beat.wakePending.handler(ctx,{})>0);
 });
 console.log(`Beat analysis jobs/manual/cuts: ${checks} PASS; actual handlers with in-memory auth/storage only, no database/provider calls.`);
}finally{Date.now=originalNow;globalThis.fetch=originalFetch;for(const[index,name]of ['FINALFRAME_BEAT_ANALYSIS_ENABLED','FINALFRAME_BEAT_WORKER_ENABLED','FINALFRAME_MANIFEST_V5_ENABLED'].entries()){if(oldFlags[index]===undefined)delete process.env[name];else process.env[name]=oldFlags[index];}for(const[index,name]of ['RENDER_WORKER_URL','RENDER_WORKER_SHARED_SECRET'].entries()){if(oldWorker[index]===undefined)delete process.env[name];else process.env[name]=oldWorker[index];}}})().catch(error=>{console.error(error);process.exitCode=1;});
