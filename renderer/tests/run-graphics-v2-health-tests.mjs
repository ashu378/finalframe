import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expectedGraphicsCertificate,assertGraphicsCertificate} from '../dist/templates/graphics-v2-certificate.js';
import {verifyCallbackSignature} from '../dist/contracts/callback.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),state=await mkdtemp(join(tmpdir(),'finalframe-graphics-health-')),secret='original-fixture-health-only';
const callbacks=[];const sink=createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;callbacks.push({raw,headers:req.headers});res.writeHead(202);res.end();});await new Promise(r=>sink.listen(0,r));const origin='http://localhost:'+sink.address().port;
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
// Isolated child gets no cloud/provider credentials or retained receipts.
const child=spawn(process.execPath,[join(root,'dist/server.js')],{cwd:root,env:{PATH:process.env.PATH,PORT:String(port),RENDER_WORKER_SHARED_SECRET:secret,RENDER_CALLBACK_ORIGINS:origin,RENDER_STORAGE_ORIGINS:origin,RENDER_OUTPUT_ROOT:state,RENDER_STATE_ROOT:join(state,'state'),RENDERER_VERSION:'local-graphics-health',FINALFRAME_MOVIE_ENABLED:'false',FINALFRAME_BEAT_ANALYSIS_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
let errors='';child.stderr.on('data',b=>errors+=b.toString());
try{
 let response;for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error('Health child exited: '+errors.slice(-500));try{response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(1000)});break;}catch{await new Promise(r=>setTimeout(r,50));}}
 assert(response?.ok);const body=await response.json();assert.deepEqual(body.graphicsLayoutVersions,[1,2]);assert.deepEqual(body.motionTemplateIds,['kinetic-title','brand-card','feature-callout','end-card','product-ui','bar-chart','explainer-steps']);assert.equal(body.rendererVersion,'local-graphics-health');assert.equal(body.movieMerge.enabled,false);assert.equal(body.beatAnalysis.enabled,false);assert.equal(response.headers.get('cache-control'),'no-store');
 const manifest={kind:'finalframe.render-manifest',version:5,manifestId:'manifest-graphics-http',projectId:'original-local-fixture',rendererVersion:'local-test',selection:{scope:'TIMELINE',ids:[]},export:{scope:'TIMELINE',format:'MP4'},output:{width:320,height:180,fps:30,durationInFrames:30,codec:'h264'},tracks:[{id:'picture',kind:'GRAPHIC',orderIndex:0}],items:[{id:'title',kind:'motion-graphics',templateId:'brand-card',trackId:'picture',startFrame:0,durationInFrames:30,props:{layoutVersion:2,title:'Exact title'}}]};
 // Deliberately missing LOCKED metadata: accept the transport, then fail before
 // Chromium, encoding or upload. Its signed failure must retain the same proof.
 const payload={jobId:'graphics-http-fixture',leaseId:'graphics-http-lease',attempt:1,idempotencyKey:'graphics-http-idempotency',manifest,mode:'production',callbackUrl:origin+'/renderer/callback',storageUploadUrl:origin+'/upload',graphicsCertificate:{forged:'must be ignored'}};
 const submit=await fetch('http://127.0.0.1:'+port+'/render',{method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify(payload),signal:AbortSignal.timeout(2000)});assert.equal(submit.status,202);const ack=await submit.json(),expected=expectedGraphicsCertificate(payload);assertGraphicsCertificate(ack.graphicsCertificate,expected);assert.equal(ack.accepted,true);
 for(let i=0;i<100&&!callbacks.length;i++)await new Promise(r=>setTimeout(r,50));assert.equal(callbacks.length,1);assert(verifyCallbackSignature(callbacks[0].raw,callbacks[0].headers['x-finalframe-renderer-signature'],secret));const envelope=JSON.parse(callbacks[0].raw);assert.equal(envelope.eventType,'render.failed');assertGraphicsCertificate(envelope.payload.graphicsCertificate,expected);
 const legacy={...payload,jobId:'legacy-http-fixture',leaseId:'legacy-http-lease',idempotencyKey:'legacy-http-idempotency',manifest:{...manifest,version:4,manifestId:'manifest-legacy-http',items:[{...manifest.items[0],props:{title:'Legacy title'}}]}};const older=await fetch('http://127.0.0.1:'+port+'/render',{method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify(legacy),signal:AbortSignal.timeout(2000)});assert.equal(older.status,202);assert.equal((await older.json()).graphicsCertificate,undefined);
 console.log(JSON.stringify({checks:3,actualLocalHTTP:true,failedBeforeRender:true,exactSignedFailureCertificate:true,cloud:false,paidProviderCalls:0}));
}finally{if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}await new Promise(r=>sink.close(r));}
