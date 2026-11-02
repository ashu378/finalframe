const assert=require('node:assert/strict');const h=require('./run-operation-controls.cjs');
async function main(){
 for(const status of ['removed','suspended','invited','inactive']){
  const state=h.backendFixture({operation:'GENERATE'});const made=await state.create();
  state.rows.get('studio-member').status=status;
  state.rows.set('legacy-active',{_id:'legacy-active',table:'studioMembers',studioExternalId:'studio',userExternalId:'user',role:'owner',status:'active'});
  await assert.rejects(state.fence(made._id),/workspace membership/);assert.equal(state.rows.get(made._id).submissionStartedAt,undefined);
  state.rows.get(made._id).providerJobId='accepted-provider-job';assert.deepEqual(await state.fence(made._id),{allowed:false},'accepted work retains its polling path without authorizing another purchase');
 }
 for(const change of [s=>s.rows.get('studio-id').status='SUSPENDED',s=>s.rows.get('studio-id').externalId='foreign']){const state=h.backendFixture({operation:'GENERATE'});const made=await state.create();change(state);await assert.rejects(state.fence(made._id),/workspace membership/);}
 const active=h.backendFixture({operation:'GENERATE'});const made=await active.create();assert.deepEqual(await active.fence(made._id),{allowed:true});
 console.log('Stored-actor studio submission fence: PASS (7 cases); actual mutation + canonical membership resolver, isolated memory only. No DB/provider calls.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(h.cleanup);
