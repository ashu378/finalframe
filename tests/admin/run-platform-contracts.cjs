const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { getFunctionName } = require('convex/server');
function load(file, stubs = {}) {
  const filename = path.join(root, file); const mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod); mod.require = (id) => Object.hasOwn(stubs, id) ? stubs[id] : normal(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
class AccessError extends Error { constructor(code, message) { super(message); this.code = code; } }
const auth = { ConvexAuthError: AccessError, ConvexAuthorizationError: AccessError };
let actorId = 'owner'; let signedIn = true; let sequence = 0; let writes = 0; let forbiddenRead;
const identity = () => ({ externalId: actorId, subject: actorId });
const authorization = load('convex/authorization.ts', { './studioMemberships': load('convex/studioMemberships.ts'), './auth': auth, './identity': { getIdentity: async () => signedIn ? identity() : null, requireIdentity: async () => { if (!signedIn) throw new AccessError('UNAUTHENTICATED', 'Sign in'); return identity(); } } });
const contracts = load('src/lib/platform-admin/contracts.ts');
const registered = { query: (value) => value, mutation: (value) => value, internalMutation: (value) => value };
const platform = load('convex/platformAdministration.ts', { './_generated/server': registered, './authorization': authorization, './auth': auth, '../src/lib/platform-admin/contracts': contracts });
const tables = Object.fromEntries(['users','studios','members','studioMembers','projectMembers','projects','platformRoles','moderationReports','audit','assets','exports','generationJobs','ledger','videoModelCatalog'].map((name) => [name, []]));
function add(table, data) { const row = { _creationTime: ++sequence, ...structuredClone(data) }; tables[table].push(row); return row; }
const ctx = { db: {
  get: async (id) => { if (id === forbiddenRead) throw new Error('temporary database transport failure'); return Object.values(tables).flat().find((row) => row._id === id) ?? null; },
  insert: async (table, data) => { writes++; const id = `${table}-${++sequence}`; add(table, { _id: id, ...data }); return id; },
  patch: async (id, fields) => { writes++; const row = await ctx.db.get(id); assert(row); for (const [key, value] of Object.entries(fields)) { if (value === undefined) delete row[key]; else row[key] = structuredClone(value); } },
  query: (table) => {
    let rows = tables[table]; let descending = false;
    const query = {
      withIndex: (_name, select) => { if (select) { const predicates = []; const q = { eq: (field, value) => { predicates.push([field,value]); return q; } }; select(q); rows = rows.filter((row) => predicates.every(([key,value]) => row[key] === value)); } return query; },
      order: (value) => { descending = value === 'desc'; return query; },
      unique: async () => { assert(rows.length <= 1); return rows[0] ?? null; },
      take: async (limit) => [...rows].sort((a,b) => descending ? b._creationTime-a._creationTime : a._creationTime-b._creationTime).slice(0,limit),
      paginate: async ({cursor,numItems}) => { assert(numItems <= 50); const start = cursor === null ? 0 : Number(cursor); assert(Number.isFinite(start)); const ordered = [...rows].sort((a,b) => descending ? b._creationTime-a._creationTime : a._creationTime-b._creationTime); const page = ordered.slice(start,start+numItems); return {page,isDone:start+page.length>=ordered.length,continueCursor:String(start+page.length)}; },
    }; return query;
  },
} };
for (const name of ['owner','admin','second-admin','support','moderator','ordinary','future']) add('users', { _id: name, externalId: name, authSubject: name, name, email: `${name}@example.test`, status: 'active', metadata: name === 'owner' ? { isAdmin: true, platformRole: 'ADMIN' } : {}, createdAt: 1 });
add('studios', { _id:'studio-one', externalId:'studio-one', ownerUserId:'owner', ownerExternalId:'owner' });
for (const userId of ['owner','support','ordinary']) add('members', { _id:`member-${userId}`, studioId:'studio-one', userId, role:userId === 'owner' ? 'owner' : 'member', status:'active' });
const project = add('projects', { _id:'project-one', externalId:'external-one', studioExternalId:'studio-one', studioId:'studio-one', name:'Retained real project', status:'DRAFT', ownerUserId:'owner', createdByUserId:'owner', createdByExternalId:'owner', createdAt:1, updatedAt:1 });
add('projectMembers', { _id:'project-owner', projectId:project._id, userId:'owner', role:'OWNER', status:'ACTIVE' });
add('projectMembers', { _id:'project-viewer', projectId:project._id, userId:'support', role:'VIEWER', status:'ACTIVE' });
add('assets', { _id:'asset-one', projectId:project._id, storageId:'private-storage', provenance:{secret:'do-not-return'} });
add('assets', { _id:'asset-foreign', projectId:'foreign-project' });
add('exports', { _id:'export-foreign', projectId:'foreign-project' });
const call = (name,args={}) => platform[name].handler(ctx,args);
const previousEnv = { enabled:process.env.FINALFRAME_PLATFORM_BOOTSTRAP_ENABLED, user:process.env.FINALFRAME_PLATFORM_BOOTSTRAP_USER_ID };
(async () => {
  assert.equal(await call('currentRole'),null,'studio owner and user metadata confer no platform access');
  await assert.rejects(call('inventory',{kind:'users'}),/Explicit platform/);
  await assert.rejects(call('setUserStatus',{userId:'ordinary',status:'disabled',reason:'Forbidden owner grant',requestId:'owner-request'}),/Explicit platform/);
  process.env.FINALFRAME_PLATFORM_BOOTSTRAP_ENABLED='false'; process.env.FINALFRAME_PLATFORM_BOOTSTRAP_USER_ID='admin';
  await assert.rejects(call('bootstrapAdministrator',{userId:'admin'}),/disabled/);
  process.env.FINALFRAME_PLATFORM_BOOTSTRAP_ENABLED='true';
  await assert.rejects(call('bootstrapAdministrator',{userId:'owner'}),/disabled/);
  const boot = await call('bootstrapAdministrator',{userId:'admin'}); assert.equal(boot.replayed,false);
  assert.equal(tables.platformRoles.length,1); assert.equal(tables.audit[0].metadata.scope,'PLATFORM');
  const bootstrapWrites = writes; assert.equal((await call('bootstrapAdministrator',{userId:'admin'})).replayed,true); assert.equal(writes,bootstrapWrites);
  process.env.FINALFRAME_PLATFORM_BOOTSTRAP_USER_ID='ordinary'; await assert.rejects(call('bootstrapAdministrator',{userId:'ordinary'}),/existing platform administrator/);
  actorId='admin'; assert.equal((await call('currentRole')).role,'ADMIN');
  for (const [userId,role] of [['support','SUPPORT'],['moderator','MODERATOR']]) await call('setRole',{userId,role,status:'ACTIVE',reason:'Explicit test role',requestId:`grant-${userId}`});
  const beforeLast = writes;
  await assert.rejects(call('setRole',{userId:'admin',role:'SUPPORT',status:'ACTIVE',reason:'Do not orphan platform',requestId:'demote-sole-admin'}),/administrator must remain/);
  await assert.rejects(call('setRole',{userId:'admin',role:'ADMIN',status:'REVOKED',reason:'Do not orphan platform',requestId:'revoke-sole-admin'}),/administrator must remain/);
  assert.equal(writes,beforeLast);
  await call('setRole',{userId:'second-admin',role:'ADMIN',status:'ACTIVE',reason:'Second explicit administrator',requestId:'grant-second-admin'});
  const secondUser = tables.users.find((user)=>user._id==='second-admin'); secondUser.status='disabled';
  await assert.rejects(call('setRole',{userId:'admin',role:'SUPPORT',status:'ACTIVE',reason:'Disabled admin cannot preserve access',requestId:'disabled-other-admin'}),/administrator must remain/);
  secondUser.status='active';
  const grantWrites = writes;
  assert.equal((await call('setRole',{userId:'second-admin',role:'ADMIN',status:'ACTIVE',reason:'Second explicit administrator',requestId:'grant-second-admin'})).replayed,true); assert.equal(writes,grantWrites);
  await assert.rejects(call('setRole',{userId:'second-admin',role:'SUPPORT',status:'ACTIVE',reason:'Changed request',requestId:'grant-second-admin'}),/another change/);
  await call('setRole',{userId:'admin',role:'SUPPORT',status:'ACTIVE',reason:'Second administrator preserves service',requestId:'demote-with-second'});
  actorId='second-admin'; await call('setRole',{userId:'admin',role:'ADMIN',status:'ACTIVE',reason:'Restore reviewed administrator',requestId:'restore-admin-role'});
  actorId='support'; await assert.rejects(call('inventory',{kind:'reports'}),/Explicit platform/);
  await assert.rejects(call('setRole',{userId:'ordinary',role:'ADMIN',status:'ACTIVE',reason:'Support cannot elevate',requestId:'support-elevation'}),/Explicit platform/);
  await assert.rejects(call('setUserStatus',{userId:'ordinary',status:'disabled',reason:'Support cannot disable',requestId:'support-disable'}),/Explicit platform/);
  actorId='moderator'; await assert.rejects(call('inventory',{kind:'users'}),/Explicit platform/);
  actorId='owner';
  await assert.rejects(call('createReport',{projectId:project._id,assetId:'asset-foreign',category:'RIGHTS',reason:'Foreign media must be denied',requestId:'foreign-asset-report'}),/another project/);
  await assert.rejects(call('createReport',{projectId:project._id,exportId:'export-foreign',category:'RIGHTS',reason:'Foreign export must be denied',requestId:'foreign-export-report'}),/another project/);
  const foreign = add('projects',{_id:'foreign-project',externalId:'foreign-ext',studioExternalId:'studio-one',ownerUserId:'ordinary',createdByUserId:'ordinary',createdAt:1,updatedAt:1});
  await assert.rejects(call('createReport',{projectId:foreign._id,category:'RIGHTS',reason:'Studio owner is not project owner',requestId:'foreign-project-report'}),/not authorized/);
  const reportArgs={projectId:project._id,assetId:'asset-one',category:'CONSENT',reason:'Please review the supplied speaker permission.',requestId:'create-consent-report'};
  const report=await call('createReport',reportArgs); assert.equal(report.replayed,false);
  const reportWrites=writes; assert.equal((await call('createReport',reportArgs)).replayed,true); assert.equal(writes,reportWrites);
  await assert.rejects(call('createReport',{...reportArgs,reason:'Changed reported concern'}),/another report/);
  actorId='support'; await call('createReport',{projectId:project._id,category:'OTHER',reason:'Viewer can report a project concern',requestId:'viewer-own-report'});
  assert.equal((await call('myReports')).reports.length,1,'reporters cannot read other reports');
  actorId='moderator';
  const open=await call('inventory',{kind:'reports',reportStatus:'OPEN',limit:1}); assert.equal(open.rows.length,1); assert(open.continueCursor);
  await assert.rejects(call('inventory',{kind:'reports',reportStatus:'RESOLVED',cursor:open.continueCursor}),/first page/);
  const decision={reportId:report.reportId,decision:'QUARANTINED',reason:'Consent needs further review',requestId:'quarantine-consent-report'};
  await call('decideReport',decision); assert.equal(project.moderationStatus,'RESTRICTED');
  assert.equal(tables.moderationReports.find((row)=>row._id===report.reportId).status,'RESOLVED');
  const decisionWrites=writes; assert.equal((await call('decideReport',decision)).replayed,true); assert.equal(writes,decisionWrites);
  await assert.rejects(call('decideReport',{...decision,decision:'DISMISSED'}),/another change/);
  await assert.rejects(call('decideReport',{...decision,requestId:'new-decision-request'}),/already been decided/);
  await assert.rejects(call('clearRestriction',{projectId:project._id,reason:'Moderator cannot override admin restriction',requestId:'moderator-clear'}),/Explicit platform/);
  actorId='owner';
  await assert.rejects(authorization.requireProjectAccess(ctx,project._id),/restricted/);
  await assert.rejects(authorization.requireProjectRole(ctx,project._id,['OWNER'],{allowRestrictedRead:true}),/restricted/);
  const context=await call('reportContext',{projectExternalId:project.externalId}); assert.deepEqual(Object.keys(context).sort(),['moderationStatus','name','projectId']);
  assert.equal(context.moderationStatus,'RESTRICTED'); assert.equal((await call('myReports')).reports.length,1);
  actorId='admin'; await call('clearRestriction',{projectId:project._id,reason:'Permission evidence reviewed',requestId:'admin-clear-restriction'}); assert.equal(project.moderationStatus,'CLEAR');
  await call('setUserStatus',{userId:'ordinary',status:'disabled',reason:'Reviewed account concern',requestId:'disable-ordinary-user'}); assert.equal(tables.users.find((user)=>user._id==='ordinary').status,'disabled');
  await call('setUserStatus',{userId:'ordinary',status:'active',reason:'Account concern resolved',requestId:'restore-ordinary-user'});
  await assert.rejects(call('setUserStatus',{userId:'admin',status:'disabled',reason:'No self-disable',requestId:'self-disable-request'}),/Another administrator/);
  add('audit',{_id:'studio-private-audit',action:'STUDIO_PRIVATE',entityType:'studio',entityId:'studio-one',metadata:{scope:'STUDIO',secret:'never-return'},createdAt:5});
  const events=await call('inventory',{kind:'audit',limit:50}); assert(events.rows.every((row)=>row.title!=='STUDIO_PRIVATE')); assert(!JSON.stringify(events).includes('never-return'));
  for(let i=0;i<65;i++) add('generationJobs',{_id:`job-${i}`,studioExternalId:'studio-one',provider:'openrouter',model:'test-model',status:'QUEUED',progress:0,attemptCount:0,createdAt:i,request:{secret:'do-not-return'},response:{privateUrl:'do-not-return'},providerJobId:'private-provider-id'});
  let cursor;let jobs=[];do{const page=await call('inventory',{kind:'jobs',limit:17,cursor});jobs.push(...page.rows);cursor=page.continueCursor??undefined;}while(cursor);
  assert.equal(jobs.length,65);assert(!JSON.stringify(jobs).includes('do-not-return'));assert(!JSON.stringify(jobs).includes('private-provider-id'));
  const model=add('videoModelCatalog',{_id:'catalog-model',studioExternalId:'studio-one',modelId:'provider/test',available:true,reviewedAt:1,reviewedOperations:['GENERATE'],lastSeenAt:1});
  actorId='moderator';await assert.rejects(call('quarantineModel',{modelId:model._id,reason:'Moderator cannot route',requestId:'moderator-quarantine'}),/Explicit platform/);
  actorId='admin';await call('quarantineModel',{modelId:model._id,reason:'Reported endpoint contract mismatch',requestId:'admin-model-quarantine'});assert.equal(model.available,false);assert.equal(model.reviewedAt,undefined);assert.equal(model.platformQuarantinedByUserId,'admin');assert.equal(typeof model.platformQuarantinedAt,'number');
  model.available=true;model.reviewedAt=Date.now();assert.equal((await call('inventory',{kind:'routing'})).rows[0].status,'PLATFORM_QUARANTINED','studio raw availability does not clear platform authority');
  actorId='moderator';await assert.rejects(call('clearModelQuarantine',{modelId:model._id,reason:'Moderator cannot release routing',requestId:'moderator-clear-model'}),/Explicit platform/);
  actorId='admin';await call('clearModelQuarantine',{modelId:model._id,reason:'Endpoint reviewed, studio re-review remains required',requestId:'admin-clear-model'});assert.equal(model.platformQuarantinedAt,undefined);assert.equal(model.available,false);assert.equal(model.reviewedAt,undefined);assert.deepEqual(model.reviewedOperations,[]);
  await call('setRole',{userId:'future',role:'SUPPORT',status:'REVOKED',reason:'Explicit revocation fixture',requestId:'revoke-future-role'});
  process.env.FINALFRAME_PLATFORM_BOOTSTRAP_USER_ID='future';await assert.rejects(call('bootstrapAdministrator',{userId:'future'}),/cannot replace or reactivate/);
  actorId='future';assert.equal(await call('currentRole'),null);
  signedIn=false;await assert.rejects(call('inventory',{kind:'users'}),/Sign in/);signedIn=true;
  assert(tables.audit.filter((entry)=>entry.action.startsWith('PLATFORM_')||entry.action.startsWith('MODERATION_')).every((entry)=>entry.metadata.scope==='PLATFORM'));
  assert.equal(tables.assets.length,2,'moderation never deletes retained media');
  let transportFailure = false;
  const redirect = (url) => { throw new Error(`REDIRECT ${url}`); };
  const fakeClient = { query: async (reference) => {
    if (transportFailure) throw new Error('temporary query unavailable');
    if (reference === 'account') {
      const member = tables.members.find((entry)=>entry.userId===actorId&&entry.status==='active');
      return { studio: member ? tables.studios[0] : null, role: member?.role ?? null };
    }
    return call('currentRole');
  } };
  const guards = load('src/lib/guards/platform.ts', {
    'next/navigation': { redirect }, '../../../convex/_generated/api': { api: { account: { current: 'account' } } },
    './index': { requireAuth: async () => ({user:{id:actorId,email:`${actorId}@example.test`}}) },
    '@/lib/convex/server': { getAuthenticatedConvexClient: async()=>fakeClient },
  });
  actorId='owner'; assert.equal((await guards.requireStudioAdmin()).role,'owner');
  await assert.rejects(guards.requirePlatformRole(),/REDIRECT \/dashboard/);
  actorId='admin';assert.equal((await guards.requirePlatformRole(['ADMIN'])).role,'ADMIN');
  await assert.rejects(guards.requireStudioAdmin(),/REDIRECT \/dashboard/);
  actorId='moderator';await assert.rejects(guards.requirePlatformRole(['ADMIN']),/REDIRECT \/dashboard/);
  transportFailure=true;await assert.rejects(guards.requirePlatformRole(),/temporary query unavailable/);transportFailure=false;
  const envUrl=process.env.NEXT_PUBLIC_CONVEX_URL;process.env.NEXT_PUBLIC_CONVEX_URL='https://test.invalid';
  const compatibilityGuards=load('src/lib/guards/index.ts',{
    '@convex-dev/auth/nextjs/server':{isAuthenticatedNextjs:async()=>true,convexAuthNextjsToken:async()=>'offline-test-token'},
    'convex/browser':{ConvexHttpClient:class{async query(reference){if(getFunctionName(reference)==='auth:currentUser')return {id:actorId,email:'test@example.test',name:actorId,onboardingCompleted:true,isAdmin:true,role:'owner',studioExternalId:'studio-one',createdAt:1};return call('currentRole');}}},
    'next/navigation':{redirect},
  });
  actorId='owner';await assert.rejects(compatibilityGuards.requireAdmin(),/REDIRECT \/dashboard/);
  actorId='support';await assert.rejects(compatibilityGuards.requireAdmin(),/REDIRECT \/dashboard/);
  actorId='admin';assert.equal((await compatibilityGuards.requireAdmin()).is_admin,true);
  if(envUrl===undefined)delete process.env.NEXT_PUBLIC_CONVEX_URL;else process.env.NEXT_PUBLIC_CONVEX_URL=envUrl;
  const Link=({children,...props})=>React.createElement('a',props,children);
  const Overview=load('src/app/(admin)/admin/page.tsx',{'next/link':Link,'@/lib/guards/platform':guards,'@/lib/platform-admin/contracts':contracts}).default;
  actorId='moderator';const overview=renderToStaticMarkup(await Overview());
  assert.match(overview,/Content reports/);assert.doesNotMatch(overview,/href="\/admin\/users"/);assert.doesNotMatch(overview,/href="\/admin\/roles"/);
  const reportContext=await authorization.requireProjectAccess(ctx,project._id).catch(()=>null);
  assert.equal(reportContext,null,'platform moderator is not impersonated into a project studio');

  console.log('PASS platform separation: actual auth denies studio/metadata inheritance; exact internal bootstrap, role matrix, last-enabled-admin and idempotency guards, isolated report ownership/effects, quarantine metadata-only reads, bounded global projections, private-payload omission and immutable audit effects. In-memory only; no online grants/database/provider calls.');
})().catch((error)=>{console.error(error);process.exitCode=1;}).finally(()=>{
  if(previousEnv.enabled===undefined)delete process.env.FINALFRAME_PLATFORM_BOOTSTRAP_ENABLED;else process.env.FINALFRAME_PLATFORM_BOOTSTRAP_ENABLED=previousEnv.enabled;
  if(previousEnv.user===undefined)delete process.env.FINALFRAME_PLATFORM_BOOTSTRAP_USER_ID;else process.env.FINALFRAME_PLATFORM_BOOTSTRAP_USER_ID=previousEnv.user;
});
