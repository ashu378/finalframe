import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, writeFile, mkdtemp, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCanonicalAudio } from '../dist/media/beat-analysis.js';
import { BEAT_ANALYSIS_VERSION } from '../dist/media/beat-detector.js';
import { InjectableFFmpegAdapter, InjectableFFprobeAdapter } from '../dist/media/ffmpeg.js';
import { HeavyMediaGate } from '../dist/media/heavy-media-gate.js';
import { RenderRequestQueue } from '../dist/request-queue.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const directory=await mkdtemp(join(tmpdir(),'finalframe-beat-media-'));
const rate=16000;const count=rate*12;const wav=Buffer.alloc(44+count*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
for(let beat=.5;beat<12;beat+=.5)for(let sample=0;sample<rate*.025;sample++){const index=Math.round(beat*rate)+sample;if(index<count)wav.writeInt16LE(Math.round(.7*Math.sin(2*Math.PI*1200*sample/rate)*Math.exp(-sample/(rate*.004))*32767),44+index*2);}
const sourceFile=join(directory,'original-clicks.wav');await writeFile(sourceFile,wav);const sha=createHash('sha256').update(wav).digest('hex');
const input={jobId:'job-fixture',leaseId:'lease-fixture',projectId:'project-fixture',assetId:'asset-fixture',storageId:'storage-fixture',sourceChecksum:sha,assetChecksum:sha,byteSize:wav.length,algorithmVersion:BEAT_ANALYSIS_VERSION,url:'https://fixture.convex.cloud/api/storage/storage-fixture'};
const media={ffmpeg:new InjectableFFmpegAdapter(),ffprobe:new InjectableFFprobeAdapter()};
let checks=0;async function check(name,run){await run();checks++;console.log('PASS '+name);}
try{
 await check('actual FFmpeg decode and bounded analysis thread verify source SHA and reuse exact derived cache',async()=>{
  let downloads=0;const options={...media,allowedHosts:['fixture.convex.cloud'],cacheRoot:join(directory,'direct-cache'),fetch:async(_url,init)=>{downloads++;assert.equal(init.redirect,'error');return new Response(wav,{headers:{'content-length':String(wav.length)}});}};
  const first=await analyzeCanonicalAudio(input,options);assert.equal(first.result.outcome,'RELIABLE');assert.ok(Math.abs(first.result.tempoBpm-120)<1);assert.equal(first.cached,false);assert.ok(first.result.beatsSeconds.every(beat=>Math.abs((beat-.5)*2-Math.round((beat-.5)*2))<.07));
  const replay=await analyzeCanonicalAudio({...input,jobId:'job-second',leaseId:'lease-second'},options);assert.equal(replay.cached,true);assert.equal(replay.jobId,'job-second');assert.deepEqual(replay.result,first.result);assert.equal(downloads,1);assert.equal(JSON.stringify(replay).includes('https://'),false);
  const {readdir}=await import('node:fs/promises');const cacheFiles=await readdir(options.cacheRoot);assert.equal((await stat(join(options.cacheRoot,cacheFiles[0]))).mode&0o777,0o600);
  for(let index=0;index<128;index++)await writeFile(join(options.cacheRoot,createHash('sha256').update('evictable-derived-'+index).digest('hex')+'.json'),'{}',{mode:0o600});
  const abandoned=join(options.cacheRoot,'c'.repeat(64)+'.json.00000000-0000-0000-0000-000000000000.tmp');await writeFile(abandoned,'{}',{mode:0o600});await utimes(abandoned,new Date(0),new Date(0));
  assert.equal((await analyzeCanonicalAudio(input,options)).cached,true);assert.equal((await readdir(options.cacheRoot)).length,128,'derived cache prunes known old entries and stale incomplete receipts');assert.equal(downloads,1);
  await assert.rejects(analyzeCanonicalAudio({...input,sourceChecksum:'b'.repeat(64)},options),/checksum/);
  await assert.rejects(analyzeCanonicalAudio({...input,url:'https://other.convex.cloud/api/storage/file'},options),/allowed/);
  await assert.rejects(analyzeCanonicalAudio({...input,assetId:'asset-overlong'}, {...options,ffprobe:{probe:async()=>({streams:[{codec_type:'audio',channels:1}],format:{duration:'601'}})}}),/ten minutes/);
 });
 await check('shared gate excludes queued renders, probes and analysis without increasing render concurrency',async()=>{
  const queue=new RenderRequestQueue(4);const gate=new HeavyMediaGate(()=>queue.busy);let release;
  queue.accept('job',{leaseId:'lease'},()=>new Promise(resolve=>release=resolve));assert.equal(gate.tryAcquireMedia(),null,'render admission already reserves heavy capacity before work microtask');await new Promise(resolve=>setImmediate(resolve));release();await queue.idle();
  const probeRelease=gate.tryAcquireMedia();assert.ok(probeRelease);assert.equal(gate.acceptsRender,false);assert.equal(gate.tryAcquireMedia(),null);probeRelease();
  const analysisRelease=gate.tryAcquireMedia();assert.ok(analysisRelease);probeRelease();assert.equal(gate.acceptsRender,false,'old release cannot unlock a newer owner');analysisRelease();assert.equal(gate.acceptsRender,true);
 });
 await check('real local HTTP route authenticates, advertises version and returns429 across all heavy work',async()=>{
  const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const preload=join(directory,'offline-fetch.mjs');await writeFile(preload,`import {readFile} from 'node:fs/promises';globalThis.fetch=async(value,options)=>{if(String(value)!==${JSON.stringify(input.url)})throw new Error('External network is disabled in this local fixture');process.send?.({fixtureDownload:true});await new Promise(resolve=>setTimeout(resolve,500));return new Response(await readFile(${JSON.stringify(sourceFile)}));};`);
  const child=spawn(process.execPath,['--import',preload,join(root,'dist/server.js')],{cwd:root,env:{...process.env,PORT:String(port),RENDER_WORKER_SHARED_SECRET:'local-test-only',RENDER_MEDIA_ALLOWED_HOSTS:'fixture.convex.cloud',RENDER_OUTPUT_ROOT:join(directory,'server-output'),RENDER_STATE_ROOT:join(directory,'server-state'),FINALFRAME_BEAT_ANALYSIS_ENABLED:'true'},stdio:['ignore','pipe','pipe','ipc']});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);let downloads=0;let onDownload;child.on('message',message=>{if(message.fixtureDownload){downloads++;onDownload?.();}});
  const base=`http://127.0.0.1:${port}`;
  try{
   let health;for(let attempt=0;attempt<100;attempt++){try{health=await fetch(base+'/health');if(health.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,20));}
   assert.ok(health?.ok,output);const healthBody=await health.json();assert.equal(healthBody.beatAnalysis.algorithmVersion,BEAT_ANALYSIS_VERSION);
   assert.equal((await fetch(base+'/media/analyze-beats',{method:'POST',body:JSON.stringify(input)})).status,401);
   const options=body=>({method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':'local-test-only'},body:JSON.stringify(body)});
   let startedTimer;const started=new Promise((resolve,reject)=>{startedTimer=setTimeout(()=>reject(new Error('Local analysis did not reach fixture download: '+output)),15000);onDownload=()=>{clearTimeout(startedTimer);resolve();};});const processing=fetch(base+'/media/analyze-beats',options(input));await started;
   assert.equal((await fetch(base+'/media/probe',options({url:input.url,kind:'audio'}))).status,429);
   assert.equal((await fetch(base+'/media/analyze-beats',options({...input,jobId:'job-busy'}))).status,429);
   const manifest=JSON.parse(await readFile(join(root,'fixtures/kinetic-title.json'),'utf8'));
   assert.equal((await fetch(base+'/render',options({jobId:'render-busy',leaseId:'render-lease',mode:'fixture',manifest,callbackUrl:'https://fixture.convex.site/renderer/callback',storageUploadUrl:'https://fixture.convex.cloud/api/storage/upload'}))).status,429);
   const done=await processing;assert.equal(done.status,200,output);assert.equal((await done.json()).result.outcome,'RELIABLE');
   const cached=await fetch(base+'/media/analyze-beats',options({...input,jobId:'job-replayed',leaseId:'lease-replayed'}));assert.equal(cached.status,200);assert.equal((await cached.json()).cached,true);assert.equal(downloads,1);
  }finally{if(child.exitCode===null){const closed=new Promise(resolve=>child.once('close',resolve));child.kill('SIGTERM');await closed;}}
 });
 console.log(`Beat media/HTTP: ${checks} PASS; original WAV + local FFmpeg/thread/HTTP, external fetch blocked; no database/provider calls.`);
}finally{await rm(directory,{recursive:true,force:true});}
