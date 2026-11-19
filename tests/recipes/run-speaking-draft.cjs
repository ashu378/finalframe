const assert=require('node:assert/strict');
const {getFunctionName}=require('convex/server');
const {fixture,load}=require('./backend-fixture.cjs');
const {readPlanSettings}=load('src/lib/production/plan-settings.ts');
function setup(){
 const c=fixture();c.rows.get('production').currentPlanId='plan';Object.assign(c.rows.get('production'),{requestedDurationSeconds:4,workflow:'SOCIAL',inputMode:'IDEA',language:'en',outputPreset:'VERTICAL'});
 c.put('directorPlans',{_id:'plan',productionId:'production',status:'DRAFT',input:{requestedDurationSeconds:4},plan:{summary:'Preserved brief'}});
 c.put('productionVersions',{_id:'version',productionId:'production',sourcePlanId:'plan',status:'DRAFT',snapshot:{summary:'Preserved brief'},planningContextSnapshot:{}});
 c.put('sequences',{_id:'seq',projectId:'project',productionId:'production',productionVersionId:'version',orderIndex:0});
 c.put('scenes',{_id:'scene',projectId:'project',productionId:'production',productionVersionId:'version',sequenceId:'seq',orderIndex:0});
 c.put('shots',{_id:'shot',projectId:'project',productionId:'production',productionVersionId:'version',sceneId:'scene',durationSeconds:4,orderIndex:0,requiredAssetIds:['speech'],metadata:{operation:'LIP_SYNC',audioPolicy:'USE_RECORDING'}});
 c.put('assets',{_id:'speech',projectId:'project',scope:'PROJECT',storageId:'storage',mimeType:'audio/wav'});
 c.storageObjects.set('storage',{sha256:'a'.repeat(64),size:128,contentType:'audio/wav'});
 c.put('verifiedAudioProbes',{_id:'probe',projectId:'project',assetId:'speech',storageId:'storage',checksum:'a'.repeat(64),byteSize:128,durationSeconds:3.21,audioCodec:'pcm_s16le',audioFormat:'wav',durationMeasurement:'DECODED_PCM_SAMPLES_V1',sampleRate:16000,channels:1,hasVideo:false});
 c.runMutation=(ref,args)=>c.call(...getFunctionName(ref).split(':'),args);
 return c;
}
const args={productionId:'production',shotId:'shot',expectedAudioAssetId:'speech'};
(async()=>{
 const c=setup(),before=JSON.stringify(c.rows.get('version').snapshot);const result=await c.call('productions','fitTalkingShotToRecording',args);
 assert.equal(result.shotSeconds,97/30);assert.equal(result.productionSeconds,97/30);assert.equal(c.rows.get('shot').durationSeconds,97/30);assert.equal(readPlanSettings(c.rows.get('plan').input,c.rows.get('production')).requestedDurationSeconds,97/30);assert.equal(JSON.stringify(c.rows.get('version').snapshot),before);assert.equal(c.count('audit'),1);await c.call('productions','fitTalkingShotToRecording',args);assert.equal(c.count('audit'),1);assert.equal(c.count('generationJobs'),0);console.log('PASS measured timing updates current draft atomically, preserves snapshot and replays without another audit or purchase');
 for(const change of[c=>c.role='VIEWER',c=>c.rows.get('speech').projectId='foreign',c=>c.rows.get('version').status='APPROVED',c=>c.rows.get('plan').status='APPROVED',c=>c.rows.get('shot').requiredAssetIds=[],c=>c.rows.get('probe').checksum='b'.repeat(64),c=>c.rows.get('probe').durationSeconds=61,c=>c.put('resourceStates',{_id:'lock',projectId:'project',resourceType:'shot',resourceId:'shot',state:'LOCKED'})]){const x=setup();change(x);await assert.rejects(x.call('productions','fitTalkingShotToRecording',args));assert.equal(x.count('audit'),0);assert.equal(x.rows.get('shot').durationSeconds,4);}console.log('PASS wrong roles, foreign/stale audio, approved versions, locked shots and over-limit duration denied');
})().catch(e=>{console.error(e);process.exitCode=1});
