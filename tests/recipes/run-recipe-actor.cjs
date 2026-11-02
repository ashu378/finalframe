const fs = require('node:fs'); const path = require('node:path'); const Module = require('node:module');
const filename = path.resolve(__dirname, '../team/run-team-lifecycle-contracts.cjs');
const prefix = fs.readFileSync(filename, 'utf8').split('(async () => {')[0];
const body = `
(async()=>{
  const project=add('projects',{_id:'recipe-project',studioId:'studio',studioExternalId:'studio',ownerUserId:'owner',createdByUserId:'owner',createdByExternalId:'owner',status:'ACTIVE'});
  const projectMember=add('projectMembers',{_id:'recipe-pm',projectId:project._id,userId:'owner',status:'ACTIVE',role:'OWNER'});
  const internal=()=>authorization.resolveProjectAccessForActor(ctx,project._id,'owner',['OWNER','EDITOR']);
  const publicRead=()=>authorization.requireProjectAccess(ctx,project._id,['OWNER','EDITOR']);
  const access=await internal();assert.equal(access.projectRole,'OWNER');assert.equal(access.actorExternalId,'owner');assert.equal(access.identity,undefined,'stored actor is not a verified session');assert.equal((await publicRead()).projectRole,'OWNER');
  signedIn=false;assert.equal((await internal()).projectRole,'OWNER');await assert.rejects(publicRead(),/Verified identity/);signedIn=true;
  const cases=[['disabled actor',()=>tables.users.find(u=>u._id==='owner').status='disabled',()=>tables.users.find(u=>u._id==='owner').status='active'],['canonical tombstone',()=>ownerMember.status='removed',()=>ownerMember.status='active'],['project tombstone',()=>projectMember.status='REMOVED',()=>projectMember.status='ACTIVE'],['role demotion',()=>projectMember.role='VIEWER',()=>projectMember.role='OWNER'],['studio disabled',()=>studio.status='disabled',()=>studio.status='active'],['restricted project',()=>project.moderationStatus='RESTRICTED',()=>delete project.moderationStatus],['deleted project',()=>project.deletedAt=1,()=>delete project.deletedAt]];
  for(const [name,mutate,restore]of cases){mutate();await assert.rejects(internal(),undefined,name);await assert.rejects(publicRead(),undefined,name);restore();}
  const before=writes;ownerMember.status='removed';assert.equal((await authorization.resolveProjectAccessForActor(ctx,project._id,'owner',undefined,{allowRestrictedRead:true}).catch(()=>null)),null);ownerMember.status='active';assert.equal(writes,before);
  const owner=tables.users.find(u=>u._id==='owner');owner.authSubject='canonical|verified';const old=ownerMember.status;tables.members.splice(tables.members.indexOf(ownerMember),1);add('studioMembers',{_id:'canonical-legacy-denial',studioExternalId:'studio',userExternalId:'canonical',userId:'owner',status:'removed',role:'owner'});await assert.rejects(internal(),/not a member/);tables.members.push(ownerMember);ownerMember.status=old;owner.authSubject='owner';
  console.log('Recipe stored actor: PASS session-free canonical scope, same public role/tombstone/lifecycle policy, legacy alias denial and zero writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});`;
const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); mod._compile(prefix + body, filename);
