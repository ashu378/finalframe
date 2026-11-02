// Actual stored-actor resolver + dispatch authority helper; in-memory only.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../team/run-team-lifecycle-contracts.cjs');
const prefix = fs.readFileSync(filename, 'utf8').split('(async () => {')[0];
const body = `
(async()=>{
 const project=add('projects',{_id:'render-project',studioId:'studio',studioExternalId:'studio',ownerUserId:'owner',createdByUserId:'owner',status:'ACTIVE'});
 tables.productions=[];const production=add('productions',{_id:'render-production',projectId:project._id});
 const pm=add('projectMembers',{_id:'render-owner',projectId:project._id,userId:'owner',role:'OWNER',status:'ACTIVE'});
 const source=fs.readFileSync(path.join(root,'convex/renderJobs.ts'),'utf8');
 const ast=ts.createSourceFile('renderJobs.ts',source,ts.ScriptTarget.Latest,true);
 const declaration=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='internalProject');assert(declaration);
 const helper=new Module(path.join(root,'convex/render-dispatch-actor-test.cjs'),module);
 helper.filename=path.join(root,'convex/render-dispatch-actor-test.cjs');
helper._compile(ts.transpileModule('const resolveProjectAccessForActor=globalThis.__dispatchActorResolver;'+declaration.getText(ast)+';exports.internalProject=internalProject;', {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,helper.filename);
 const job={projectId:project._id,productionId:production._id,studioExternalId:'studio',createdByUserId:'owner'};
 const call=()=>helper.exports.internalProject(ctx,job);const before=writes;
 signedIn=false;assert.equal((await call()).project._id,project._id);signedIn=true;
 for(const [name,change,restore]of [
  ['studio tombstone',()=>ownerMember.status='removed',()=>ownerMember.status='active'],
  ['project tombstone',()=>pm.status='REMOVED',()=>pm.status='ACTIVE'],
  ['project demotion',()=>pm.role='VIEWER',()=>pm.role='OWNER'],
  ['disabled studio',()=>studio.status='disabled',()=>studio.status='active'],
  ['disabled actor',()=>tables.users.find(u=>u._id==='owner').status='disabled',()=>tables.users.find(u=>u._id==='owner').status='active'],
  ['restricted project',()=>project.moderationStatus='RESTRICTED',()=>delete project.moderationStatus],
  ['archived project',()=>project.archivedAt=1,()=>delete project.archivedAt],
 ]){change();await assert.rejects(call(),undefined,name);restore();}
 // An existing frozen request is still unaccepted; it gains no authority.
 job.dispatchPayload={manifest:{manifestId:'captured'}};ownerMember.status='removed';await assert.rejects(call(),/not a member/);ownerMember.status='active';
 const owner=tables.users.find(u=>u._id==='owner');owner.authSubject='canonical|verified';tables.members.splice(tables.members.indexOf(ownerMember),1);
 add('studioMembers',{_id:'canonical-render-denial',studioExternalId:'studio',userExternalId:'canonical',userId:'owner',status:'removed',role:'owner'});await assert.rejects(call(),/not a member/);
 assert.equal(writes,before);assert.match(source,/const manifest = await authorizedManifest\\(ctx, job\\)/);
 const prepare=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='prepareRenderDispatch');assert(prepare);
 const policy=load('convex/renderWorkerContracts.ts');
 globalThis.__dispatchActorTestPolicy=policy;
 const dispatch=new Module(path.join(root,'convex/render-dispatch-prepare-test.cjs'),module);dispatch.filename=path.join(root,'convex/render-dispatch-prepare-test.cjs');
 const prelude='const {RENDER_TERMINAL,dispatchCanRun}=globalThis.__dispatchActorTestPolicy;const renderWorkerEnabled=()=>true,movieEnabled=()=>false,now=()=>Date.now(),object=v=>v||{};const resolveProjectAccessForActor=globalThis.__dispatchActorResolver;';
 dispatch._compile(ts.transpileModule(prelude+declaration.getText(ast)+';async function authorizedManifest(ctx,job){await internalProject(ctx,job);throw new Error("Reached authorized source gate");}'+prepare.getText(ast)+';exports.prepareRenderDispatch=prepareRenderDispatch;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,dispatch.filename);
 tables.renderJobs=[];tables.members.push(ownerMember);owner.authSubject='owner';
 for(const retry of [false,true]){const queued=add('renderJobs',{...job,_id:'render-job-'+retry,status:'QUEUED',progress:0,...(retry?{dispatchPayload:{manifest:{manifestId:'captured'}}}:{dispatchPayload:undefined})});
 ownerMember.status='removed';await assert.rejects(dispatch.exports.prepareRenderDispatch(ctx,{jobId:queued._id}),/not a member/);ownerMember.status='active';
 await assert.rejects(dispatch.exports.prepareRenderDispatch(ctx,{jobId:queued._id}),/Reached authorized source gate/);
 queued.acceptedAt=Date.now();ownerMember.status='removed';assert.equal(await dispatch.exports.prepareRenderDispatch(ctx,{jobId:queued._id}),null);ownerMember.status='active';}
 assert.equal(writes,before);

 const callback=ast.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='applyRendererCallback'));
 assert(callback);assert(!/internalProject\\(|authorizedManifest\\(/.test(callback.getText(ast)),'accepted receipt reconciliation must not invoke fresh dispatch authority');
 console.log('PASS current canonical actor/studio/project lifecycle, retry authority, legacy alias denial, zero writes and accepted callback separation');
})().catch(e=>{console.error(e);process.exitCode=1;});`;
// Prefix uses the real canonical membership/authorization modules.
const injection = '\nglobalThis.__dispatchActorResolver=authorization.resolveProjectAccessForActor;\n';
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(prefix + injection + body, filename);
