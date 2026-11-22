const assert=require('node:assert/strict');
const {load,fixture}=require('../recipes/backend-fixture.cjs');
const {canRecoverUnsubmittedRegion,requireStoryRepairRecovery,latestStoryRepairJob,storyRepairKey}=load('convex/storyRepairRecovery.ts');
process.env.FINALFRAME_ACTION_REGION_REPAIR_ENABLED='true';process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED='true';
function setup(){
 const c=fixture(),proof={approachVersion:'isolated-action-region-v4',sourceTakeId:'source',region:{x:64,y:64,width:128,height:128},audioSource:{assetId:'original-recording'}};
 const request={storyRepairTakeId:'source',storyRepair:proof};
 c.put('shotVersions',{_id:'source',projectId:'project',productionId:'production',productionVersionId:'version',shotId:'shot',status:'COMPLETED'});
 c.put('shotVersions',{_id:'failed-take',studioExternalId:'studio',projectId:'project',productionId:'production',productionVersionId:'version',shotId:'shot',status:'FAILED',contextSnapshot:{request}});
 const job=c.put('generationJobs',{_id:'failed',projectId:'project',productionId:'production',productionVersionId:'version',shotId:'shot',shotVersionId:'failed-take',studioExternalId:'studio',operation:'SHOT_GENERATION',provider:'openrouter',status:'FAILED',executionStage:'FAILED',errorCode:'ACTION_WINDOW_MEDIA_INVALID',completedAt:1,canonicalReservationId:'credit',providerBudgetReservationId:'provider',attemptCount:1,idempotencyKey:storyRepairKey('source'),request});
 c.put('reservations',{_id:'credit',generationJobId:'failed',studioExternalId:'studio',amount:9});
 c.put('providerBudgetReservations',{_id:'provider',jobId:'failed',studioExternalId:'studio',status:'RELEASED',actualMicros:0});
 for(const [entryType,amount]of[['RESERVE',-9],['RELEASE',9]])c.put('ledger',{_id:entryType,reservationId:'credit',studioExternalId:'studio',sourceType:'RESERVATION',sourceId:'credit',entryType,amount});
 c.put('attempts',{_id:'attempt',generationJobId:'failed',studioExternalId:'studio',status:'FAILED',errorCode:'ACTION_WINDOW_MEDIA_INVALID',attemptNumber:1});
 const args={takeId:'source',priorJobId:'failed',idempotencyKey:storyRepairKey('source','failed'),projectId:'project',productionId:'production',productionVersionId:'version',shotId:'shot',proof};return{c,job,args};
}
(async()=>{
 let x=setup(),before=JSON.stringify([...x.c.rows]);assert(await canRecoverUnsubmittedRegion(x.c,x.job,'source'));await requireStoryRepairRecovery(x.c,x.args);assert.equal(JSON.stringify([...x.c.rows]),before);assert.equal((await latestStoryRepairJob(x.c,'source'))._id,'failed');
 assert((await x.c.call('storyActionRepairs','get',{takeId:'source'})).canRequestFreshEstimate);x.c.denied=true;await assert.rejects(x.c.call('storyActionRepairs','get',{takeId:'source'}),/denied/);
 console.log('PASS conclusively local failed preparation with exact released receipts offers explicit recovery without writes; access still required');
 for(const mutate of [x=>x.job.providerJobId='accepted',x=>x.job.providerRequestId='request',x=>x.job.submissionStartedAt=1,x=>x.job.response={actionWindowRaw:{storageId:'saved'}},x=>x.job.providerCostUsd=.01,x=>x.job.actualCost=1,x=>x.job.leaseId='active',x=>x.job.errorCode='INVALID_REQUEST',x=>x.job.status='PROCESSING',x=>x.job.executionStage='RECONCILIATION_REQUIRED',x=>x.c.rows.get('provider').status='RESERVED',x=>delete x.c.rows.get('provider').actualMicros,x=>x.c.rows.get('provider').actualMicros=1,x=>x.c.rows.get('provider').jobId='other',x=>x.c.rows.get('RELEASE').amount=8,x=>x.c.rows.get('RELEASE').sourceId='other',x=>x.c.rows.get('failed-take').assetId='output',x=>x.c.rows.get('failed-take').contextSnapshot.request.storyRepair.region.x=2,x=>x.c.rows.get('attempt').providerJobId='uncertain',x=>x.c.rows.get('attempt').status='SUBMITTED',x=>x.c.rows.delete('attempt'),x=>x.job.attemptCount=2,x=>x.c.put('provenance',{_id:'p',generationJobId:'failed'}),x=>x.c.rows.get('source').projectId='other']){
  x=setup();mutate(x);assert.equal(await canRecoverUnsubmittedRegion(x.c,x.job,'source'),false);await assert.rejects(requireStoryRepairRecovery(x.c,x.args),/RECOVERY_REVIEW_REQUIRED/);
 }
 console.log('PASS accepted, uncertain, charged, output-bearing, active, wrong-project and incompletely released failures cannot buy replacement');
 for(const patch of [{idempotencyKey:'arbitrary-new-key'},{projectId:'other'},{productionVersionId:'other'},{shotId:'other'},{priorJobId:'other'},{proof:{changed:true}}]){x=setup();await assert.rejects(requireStoryRepairRecovery(x.c,{...x.args,...patch}),/RECOVERY_REVIEW_REQUIRED/);}
 x=setup();await requireStoryRepairRecovery(x.c,{...x.args,priorJobId:undefined,idempotencyKey:storyRepairKey('source')});await assert.rejects(requireStoryRepairRecovery(x.c,{...x.args,priorJobId:undefined,idempotencyKey:'second-blind-purchase'}),/RECOVERY_REVIEW_REQUIRED/);
 console.log('PASS exact failed job/current source proof and deterministic retry key enforced, including direct marker-free callers');
 x=setup();x.c.put('generationJobs',{...x.job,_id:'replacement',status:'QUEUED',idempotencyKey:storyRepairKey('source','failed'),request:{...x.job.request,storyRepairRetryOfJobId:'failed'}});assert.equal((await latestStoryRepairJob(x.c,'source'))._id,'replacement');await requireStoryRepairRecovery(x.c,x.args);assert.equal(x.c.count('generationJobs'),2);
 console.log('PASS deterministic child is visible after reload and repeated confirmation does not invent another attempt key');
 console.log('No paid calls or database operations; canonical read handlers with isolated storage/auth seam.');
})().catch(e=>{console.error(e);process.exitCode=1});
