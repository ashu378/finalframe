const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const Module = require('node:module');
const { createHmac, webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-heartbeat-'));
function compile(file, output) { const target = path.join(temp, output); fs.writeFileSync(target, ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText); return target; }
compile('convex/renderHeartbeatPolicy.ts', 'renderHeartbeatPolicy.js');
const policy = require(path.join(temp, 'renderHeartbeatPolicy.js'));
const at = Date.now();
const job = { projectId: 'project', status: 'SUBMITTED', leaseId: 'lease', leaseExpiresAt: at + 30000, acceptedAt: at - 30000, dispatchAttempt: 2, progress: 20 };
const input = { projectId: 'project', leaseId: 'lease', attempt: 2, occurredAt: at, stage: 'UPLOADING', progress: 60 };
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS '+name); }
check('valid heartbeat extends bounded exact lease and monotonic progress', () => { const patch = policy.heartbeatPatch(job,input,at); assert.equal(patch.leaseExpiresAt,at+300000); assert.equal(patch.progress,60); assert.equal(policy.heartbeatPatch({...job,progress:80},input,at).progress,80); });
check('wrong project, lease, attempt, terminal and unaccepted jobs denied',()=>{for(const change of [{projectId:'foreign'},{leaseId:'wrong'},{dispatchAttempt:3},{status:'COMPLETED'},{acceptedAt:undefined},{leaseExpiresAt:at}])assert.throws(()=>policy.heartbeatPatch({...job,...change},input,at));});
check('freshness, stage and progress validated',()=>{for(const change of [{occurredAt:at-61000},{occurredAt:at+61000},{stage:'APPROVED'},{progress:100},{progress:NaN}])assert.throws(()=>policy.heartbeatPatch(job,{...input,...change},at));});
check('duplicate/out-of-order heartbeat never extends authority',()=>{assert.equal(policy.heartbeatPatch({...job,lastHeartbeatOccurredAt:at},input,at),null);assert.equal(policy.heartbeatPatch({...job,lastHeartbeatOccurredAt:at+1},input,at),null);});
check('attempt wallclock cannot be reset with renewals',()=>{const max=at+1000;assert.equal(policy.heartbeatPatch({...job,acceptedAt:max-policy.RENDER_ATTEMPT_MAX_MS},input,at).leaseExpiresAt,max);assert.throws(()=>policy.heartbeatPatch({...job,acceptedAt:at-policy.RENDER_ATTEMPT_MAX_MS},input,at));});
check('unsigned stale callbacks remain denied; fresh delivery bounded',()=>{assert(!policy.validCallbackTime(at-660000,at));assert(policy.validCallbackTime(at-660000,at,at));assert(!policy.validCallbackTime(at-660000,at,at-61000));assert(!policy.validCallbackTime(at-policy.RENDER_ATTEMPT_MAX_MS-1,at,at));assert(!policy.validCallbackTime(at+61000,at,at));});
const routes = new Map();const originalLoad=Module._load;const secret='local-contract-secret';const previousSecret=process.env.RENDER_WORKER_SHARED_SECRET;
process.env.RENDER_WORKER_SHARED_SECRET=secret;globalThis.crypto ??= webcrypto;
Module._load=function(request,parent,isMain){if(parent?.filename.startsWith(temp)){if(request==='convex/server')return {httpRouter:()=>({route:r=>routes.set(r.path,r.handler)})};if(request==='./_generated/server')return {httpAction:fn=>fn};if(request==='./_generated/api')return {internal:{renderHeartbeat:{apply:'heartbeat'},renderJobs:{applyRendererCallback:'callback'}}};if(request==='./auth')return {auth:{addHttpRoutes(){}}};}return originalLoad.call(this,request,parent,isMain);};
compile('convex/reviewMediaContract.ts','reviewMediaContract.js');
require(compile('convex/http.ts','http.js'));Module._load=originalLoad;
function sign(s){return 'sha256='+createHmac('sha256',secret).update(s).digest('hex');}
let acceptancePending=false;
const called=[];const ctx={runMutation:async (name,args)=>{called.push({name,args});return name==='heartbeat'?{leaseExpiresAt:at+300000,cancellationRequested:false,...(acceptancePending?{pendingAcceptance:true}:{})}:{job:{_id:'job'},duplicate:false};}};
function req(route,body,headers={}){return new Request('https://fixture.convex.site'+route,{method:'POST',body,headers:{'content-type':'application/json','x-finalframe-worker-secret':secret,'x-finalframe-renderer-signature':sign(body),...headers}});}
(async()=>{
 const h=JSON.stringify({version:1,eventId:'beat',jobId:'job',projectId:'project',attempt:2,leaseId:'lease',occurredAt:new Date().toISOString(),stage:'UPLOADING',progress:60});
 assert.equal((await routes.get('/renderer/heartbeat')(ctx,req('/renderer/heartbeat',h))).status,200);checks++;
 assert.equal(called.at(-1).name,'heartbeat');assert.equal(called.at(-1).args.projectId,'project');
 acceptancePending=true; assert.equal((await routes.get('/renderer/heartbeat')(ctx,req('/renderer/heartbeat',h))).status,425); checks++; acceptancePending=false;
 assert.equal((await routes.get('/renderer/heartbeat')(ctx,req('/renderer/heartbeat',h))).status,200); checks++;
 assert.equal((await routes.get('/renderer/heartbeat')(ctx,req('/renderer/heartbeat',h,{'x-finalframe-renderer-signature':'sha256=bad'}))).status,401);checks++;
 const stale=JSON.stringify({...JSON.parse(h),occurredAt:new Date(at-61000).toISOString()});assert.equal((await routes.get('/renderer/heartbeat')(ctx,req('/renderer/heartbeat',stale))).status,400);checks++;
 const body=JSON.stringify({version:1,eventId:'completion',idempotencyKey:'attempt-2',jobId:'job',projectId:'project',rendererVersion:'contract',attempt:2,occurredAt:new Date(at-660000).toISOString(),eventType:'render.completed',payload:{leaseId:'lease',storageId:'stored'}});
 assert.equal((await routes.get('/renderer/callback')(ctx,req('/renderer/callback',body))).status,400);checks++;
 const timestamp=new Date().toISOString();const headers={'x-finalframe-delivery-timestamp':timestamp,'x-finalframe-delivery-signature':sign(timestamp+'\n'+body)};
 assert.equal((await routes.get('/renderer/callback')(ctx,req('/renderer/callback',body,headers))).status,202);assert.equal(called.at(-1).args.verifiedDeliveryAt,Date.parse(timestamp));checks++;
 assert.equal((await routes.get('/renderer/callback')(ctx,req('/renderer/callback',body,{...headers,'x-finalframe-delivery-signature':'sha256=bad'}))).status,401);checks++;
 console.log(JSON.stringify({passed:checks,database:'none',paidRequests:0,actualHttpHandlers:true}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(previousSecret===undefined)delete process.env.RENDER_WORKER_SHARED_SECRET;else process.env.RENDER_WORKER_SHARED_SECRET=previousSecret;fs.rmSync(temp,{recursive:true,force:true});});
