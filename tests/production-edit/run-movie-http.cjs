const assert=require('node:assert/strict');const path=require('node:path');const Module=require('node:module');const {createHmac}=require('node:crypto');
require('./run-finishing-v5.cjs');const routes=[];const previous=Module._load;
Module._load=function(request,parent,isMain){if(parent?.filename.endsWith('/convex/http.ts')){if(request==='convex/server')return {httpRouter:()=>({route:route=>routes.push(route)})};if(request==='./_generated/server')return {httpAction:value=>value};if(request==='./renderUploadAuthorizationHttp')return {rendererUploadAuthorization(){throw Error('unexpected upload renewal');}};if(request==='./auth')return {auth:{addHttpRoutes:()=>{}}};}return previous.call(this,request,parent,isMain);};
require(path.resolve(__dirname,'../../convex/http.ts'));const old=process.env.RENDER_WORKER_SHARED_SECRET;const secret='original-local-movie-http-fixture';process.env.RENDER_WORKER_SHARED_SECRET=secret;
const sign=raw=>'sha256='+createHmac('sha256',secret).update(raw).digest('hex');let calls=0;let accepted;let pending=false;const ctx={runMutation:async(_reference,args)=>{calls++;accepted=args;return pending?{pendingAcceptance:true,leaseExpiresAt:Date.now()+300000,cancellationRequested:false}:{duplicate:false,leaseExpiresAt:Date.now()+300000,cancellationRequested:false};}};
const envelope={version:1,eventId:'movie-event',jobId:'movie-job',projectId:'project',idempotencyKey:'movie-key',rendererVersion:'fixture-pcm-v1',attempt:1,eventType:'render.completed',occurredAt:new Date().toISOString(),payload:{movieVersionId:'movie-v1',movieExportId:'movie-e1',planHash:'a'.repeat(64),leaseId:'movie-lease',storageId:'movie-storage',checksum:'b'.repeat(64)}};
function request(raw,extra={}){return new Request('https://fixture.convex.site/renderer/movie-callback',{method:'POST',headers:{'x-finalframe-worker-secret':secret,'x-finalframe-renderer-signature':sign(raw),...extra},body:raw});}
const callback=routes.find(route=>route.path==='/renderer/movie-callback').handler;const heartbeat=routes.find(route=>route.path==='/renderer/movie-heartbeat').handler;let checks=0;async function check(name,run){await run();checks++;console.log('PASS '+name);}
(async()=>{try{
 await check('real registered movie callback forwards signed exact raw-body digest and actual renderer ABI',async()=>{const raw=JSON.stringify(envelope);assert.equal((await callback(ctx,request(raw))).status,202);assert.equal(accepted.rendererVersion,'fixture-pcm-v1');assert.equal(accepted.payloadHash,require('node:crypto').createHash('sha256').update(raw).digest('hex'));});
 await check('wrong secret or modified raw body never reaches a mutation',async()=>{const before=calls;const raw=JSON.stringify(envelope);assert.equal((await callback(ctx,request(raw,{'x-finalframe-worker-secret':'wrong'}))).status,401);assert.equal((await callback(ctx,request(raw+' ',{'x-finalframe-renderer-signature':sign(raw)}))).status,401);assert.equal(calls,before);});
 await check('streamed body cap stops oversized callback before mutation',async()=>{const before=calls;assert.equal((await callback(ctx,request('x'.repeat(384*1024+1)))).status,413);assert.equal(calls,before);});
 await check('old body requires fresh delivery signature over the same exact raw body',async()=>{const raw=JSON.stringify({...envelope,occurredAt:new Date(Date.now()-11*60000).toISOString()});assert.equal((await callback(ctx,request(raw))).status,400);const time=new Date().toISOString();assert.equal((await callback(ctx,request(raw,{'x-finalframe-delivery-timestamp':time,'x-finalframe-delivery-signature':sign(time+'\n'+raw)}))).status,202);assert.ok(accepted.verifiedDeliveryAt);assert.equal((await callback(ctx,request(raw,{'x-finalframe-delivery-timestamp':time,'x-finalframe-delivery-signature':sign(time+'\n'+raw+' ')}))).status,401);});
 await check('expired delivery signature and nonmatching ABI shape fail before mutation',async()=>{const before=calls;const raw=JSON.stringify(envelope);const time=new Date(Date.now()-61000).toISOString();assert.equal((await callback(ctx,request(raw,{'x-finalframe-delivery-timestamp':time,'x-finalframe-delivery-signature':sign(time+'\n'+raw)}))).status,401);assert.equal((await callback(ctx,request(JSON.stringify({...envelope,rendererVersion:''})))).status,400);assert.equal(calls,before);});
 await check('heartbeat acceptance-pending425 then accepted200 preserves exact lease/project attempt',async()=>{const body=JSON.stringify({version:1,eventId:'heartbeat-one',jobId:'movie-job',projectId:'project',leaseId:'movie-lease',attempt:1,occurredAt:new Date().toISOString(),stage:'CALLBACK_PENDING'});pending=true;assert.equal((await heartbeat(ctx,request(body))).status,425);pending=false;assert.equal((await heartbeat(ctx,request(body))).status,200);assert.equal(accepted.leaseId,'movie-lease');assert.equal(accepted.stage,'CALLBACK_PENDING');});
 await check('review resolver is registered and signs each exact public review kind with an independent key', async () => {
   const { getFunctionName } = require('convex/server');
   const contract = require(path.resolve(__dirname, '../../convex/reviewMediaContract.ts'));
   const resolver = routes.find(route => route.path === contract.REVIEW_MEDIA_RESOLVER_PATH && route.method === 'POST').handler;
   const previousSecret = process.env.FINALFRAME_REVIEW_MEDIA_SECRET;
   const reviewSecret = 'ab'.repeat(32);
   const token = 'A'.repeat(43);
   const resolved = [];
   const origin = { url: 'https://fixture.convex.cloud/api/storage/fixture', size: 3, contentType: 'video/mp4' };
   const queryContext = { runQuery: async (ref, args) => { resolved.push([getFunctionName(ref), args]); return origin; } };
   process.env.FINALFRAME_REVIEW_MEDIA_SECRET = reviewSecret;
   try {
     for (const [kind, moduleName] of [['export', 'reviewExport'], ['movie', 'movieReviews']]) {
       const body = JSON.stringify({ kind, token });
       const timestamp = Date.now().toString();
       const send = async key => resolver(queryContext, new Request(`https://fixture.convex.site${contract.REVIEW_MEDIA_RESOLVER_PATH}`, { method: 'POST', body, headers: { [contract.REVIEW_MEDIA_TIMESTAMP]: timestamp, [contract.REVIEW_MEDIA_SIGNATURE]: await contract.signReviewMediaResolver(key, timestamp, body) } }));
       const denied = await send(secret);
       assert.equal(denied.status, 401);
       assert.equal(await denied.text(), '');
       const allowed = await send(reviewSecret);
       assert.equal(allowed.status, 200);
       assert.deepEqual(await allowed.json(), origin);
       assert.deepEqual(resolved.at(-1), [`${moduleName}:resolveSharedMedia`, { token }]);
     }
     assert.equal(resolved.length, 2);
   } finally {
     if (previousSecret === undefined) delete process.env.FINALFRAME_REVIEW_MEDIA_SECRET;
     else process.env.FINALFRAME_REVIEW_MEDIA_SECRET = previousSecret;
   }
 });
 console.log(`Movie HTTP: ${checks} PASS; real route handlers with signed fixture requests, no database/network/provider calls.`);
}finally{if(old===undefined)delete process.env.RENDER_WORKER_SHARED_SECRET;else process.env.RENDER_WORKER_SHARED_SECRET=old;}})().catch(error=>{console.error(error);process.exitCode=1;});
