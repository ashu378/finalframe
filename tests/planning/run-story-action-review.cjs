const assert=require('node:assert/strict');
const {load,fixture}=require('../recipes/backend-fixture.cjs');
const {parseStoryActions,validateStoryActionObservations,storyActionPrompt}=load('src/lib/production/story-actions.ts');
const {requireStoryActionsPassed}=load('convex/storyActionReviews.ts');
const action={id:'chew',subject:'Man in blue',action:'Visible jaw and cheek chewing before the grandmother asks.',startSeconds:4,endSeconds:6,beforeSeconds:5};
const pass={actionId:'chew',result:'PASS',observedStartSeconds:4.2,observedEndSeconds:4.9,evidence:'Three distinct closed-mouth jaw movements before the question.'};
const fail={...pass,result:'FAIL',observedStartSeconds:null,observedEndSeconds:null,evidence:'His mouth stays motionless before the question.'};
function setup(){const c=fixture();c.put('productionVersions',{_id:'version',projectId:'project',productionId:'production',status:'APPROVED'});c.put('shots',{_id:'shot',projectId:'project',productionId:'production',productionVersionId:'version',durationSeconds:8,prompt:'Chew before the punchline',metadata:{storyActions:[action]}});c.put('assets',{_id:'asset',projectId:'project',checksum:'checksum-a',scope:'PROJECT'});c.put('shotVersions',{_id:'take',projectId:'project',productionId:'production',productionVersionId:'version',shotId:'shot',assetId:'asset',status:'COMPLETED'});return c;}
(async()=>{
 assert.deepEqual(parseStoryActions(undefined,8),[]);assert.equal(parseStoryActions([action],8).length,1);assert.throws(()=>parseStoryActions([{...action,endSeconds:9}],8),/timing/);assert.throws(()=>parseStoryActions([action,action],8),/unique/);console.log('PASS legacy compatibility and bounded action windows');
 assert.throws(()=>validateStoryActionObservations([action],[]),/every/);assert.throws(()=>validateStoryActionObservations([action],[{...pass,observedStartSeconds:5.1,observedEndSeconds:5.5}]),/deadline/);assert.equal(validateStoryActionObservations([action],[fail]),false);assert.equal(validateStoryActionObservations([action],[pass]),true);console.log('PASS missing and late action cannot pass; explicit failure is retained');
 assert.match(storyActionPrompt([action]),/BEFORE 5s/);assert.match(storyActionPrompt([action]),/dialogue alone/);console.log('PASS generation instructions carry observable action and timing');
 const c=setup(),args={projectId:'project',productionId:'production',resourceType:'shotVersion',resourceId:'take'};
 await c.call('approvals','submitForReview',args);await assert.rejects(c.call('approvals','approve',args),/visible story actions/);console.log('PASS generic take approval cannot bypass missing review');
 let review=await c.call('storyActionReviews','get',{takeId:'take'});await c.call('storyActionReviews','record',{takeId:'take',requirementKey:review.requirementKey,observations:[fail]});await assert.rejects(requireStoryActionsPassed(c,'take'),/visible story actions/);console.log('PASS failed review blocks shared assembly guard');
 await c.call('storyActionReviews','record',{takeId:'take',requirementKey:review.requirementKey,observations:[pass]});await requireStoryActionsPassed(c,'take');await c.call('approvals','approve',args);console.log('PASS observed on-time action enables take approval');
 await assert.rejects(c.call('storyActionReviews','record',{takeId:'take',requirementKey:review.requirementKey,observations:[fail]}),/revision/);console.log('PASS approved review cannot be overwritten');
 c.rows.get('asset').checksum='checksum-b';await assert.rejects(requireStoryActionsPassed(c,'take'),/visible story actions/);console.log('PASS changed media invalidates prior proof');
 const d=setup();review=await d.call('storyActionReviews','get',{takeId:'take'});d.rows.get('shots') // no side effects
 d.rows.get('shot').prompt='Different action';await assert.rejects(d.call('storyActionReviews','record',{takeId:'take',requirementKey:review.requirementKey,observations:[pass]}),/changed/);console.log('PASS stale prompt review cannot be submitted');
 d.role='VIEWER';await assert.rejects(d.call('storyActionReviews','record',{takeId:'take',requirementKey:review.requirementKey,observations:[pass]}),/denied/);d.denied=true;await assert.rejects(d.call('storyActionReviews','get',{takeId:'take'}),/denied/);console.log('PASS viewer writes and unrelated access denied');
 const repeated=setup();const repeatedContext=await repeated.call('storyActionReviews','get',{takeId:'take'});
 const repeatedArgs={takeId:'take',requirementKey:repeatedContext.requirementKey,observations:[pass]};
 await repeated.call('storyActionReviews','record',repeatedArgs);
 const oldReview=[...repeated.rows.values()].find(r=>r.requirementKey===repeatedContext.requirementKey&&r.reviewerUserId);
 oldReview.createdAt=Date.now()-1000;
 repeated.put('storyActionChecks',{_id:'new-ai-concern',takeId:'take',requirementKey:repeatedContext.requirementKey,observations:[{...fail,result:'UNCERTAIN'}],completedAt:Date.now()-500});
 await assert.rejects(requireStoryActionsPassed(repeated,'take'),/visible story actions/);
 assert.deepEqual(await repeated.call('storyActionReviews','record',repeatedArgs),{passed:true,replayed:false});
 await requireStoryActionsPassed(repeated,'take');
 assert.deepEqual(await repeated.call('storyActionReviews','record',repeatedArgs),{passed:true,replayed:true});
 console.log('PASS identical human confirmation clears a newer AI concern once; subsequent duplicates remain idempotent');
 const e=setup();delete e.rows.get('shot').metadata.storyActions;await requireStoryActionsPassed(e,'take');console.log('PASS retained takes without action contracts remain compatible');
 const {plannedShotMetadata}=load('convex/planningVideo.ts');assert.deepEqual(plannedShotMetadata({storyActions:[action],durationSeconds:8}).storyActions,[action]);assert.throws(()=>plannedShotMetadata({storyActions:[action],durationSeconds:3}),/timing/);console.log('PASS canonical planner persists and validates action requirements');
 const f=setup();f.rows.get('shot').sceneId='scene';f.rows.get('shot').versionNumber=1;f.put('scenes',{_id:'scene',productionId:'production'});Object.assign(f.rows.get('asset'),{storageId:'stored',mimeType:'video/mp4',studioExternalId:'studio'});f.storageObjects.set('stored',{contentType:'video/mp4',sha256:'checksum-a'});
 await f.call('approvals','submitForReview',{projectId:'project',resourceType:'asset',resourceId:'asset'});await f.call('approvals','approve',{projectId:'project',resourceType:'asset',resourceId:'asset'});
 const imported=await f.call('scenes','importEditedTake',{shotId:'shot',assetId:'asset',idempotencyKey:'manual-repair',note:'Localized cartoon animation; original voices copied.'});assert.equal(imported.status,'COMPLETED');assert.equal(imported.provider,undefined);await assert.rejects(requireStoryActionsPassed(f,imported._id),/visible story actions/);assert.equal((await f.call('scenes','importEditedTake',{shotId:'shot',assetId:'asset',idempotencyKey:'manual-repair',note:'Localized cartoon animation; original voices copied.'}))._id,imported._id);console.log('PASS uploaded edit creates one honest take and still needs action review');
 f.rows.get('asset').projectId='other';await assert.rejects(f.call('scenes','importEditedTake',{shotId:'shot',assetId:'asset',idempotencyKey:'wrong-project',note:'Cross project denied'}),/this project/);f.role='VIEWER';await assert.rejects(f.call('scenes','importEditedTake',{shotId:'shot',assetId:'asset',idempotencyKey:'viewer-import',note:'Viewer denied'}),/denied/);console.log('PASS uploaded edit denies cross-project media and viewer writes');
})().catch(e=>{console.error(e);process.exitCode=1});
