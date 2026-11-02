import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { InjectableFFmpegAdapter } from '../dist/media/ffmpeg.js';
import { AUDIO_EXTRACTION_PROFILE,assertExtractedWav } from '../dist/media/audio-extraction-contracts.js';
const directory=await mkdtemp(join(tmpdir(),'ff-extraction-http-')),ffmpeg=new InjectableFFmpegAdapter();let child;let checks=0;
try{
 const source=join(directory,'original.mp4');await ffmpeg.execute(['-v','error','-y','-f','lavfi','-i','color=c=green:s=64x48:r=24:d=4','-f','lavfi','-i','sine=frequency=330:sample_rate=48000:duration=4','-c:v','libx264','-preset','ultrafast','-threads','1','-c:a','aac','-pix_fmt','yuv420p',source],{timeoutMs:15000});const bytes=await readFile(source),checksum=createHash('sha256').update(bytes).digest('hex');
 const bootstrap=join(directory,'fixture-fetch.mjs');await writeFile(bootstrap,`import{readFile}from'node:fs/promises';const bytes=await readFile(${JSON.stringify(source)});globalThis.fetch=async(url)=>{if(String(url)!=='https://fixture.convex.cloud/api/storage/original')throw Error('No external network in test');await new Promise(r=>setTimeout(r,400));return new Response(bytes);};`);
 const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
 child=spawn(process.execPath,['--import',bootstrap,resolve('renderer/dist/server.js')],{env:{...process.env,PORT:String(port),RENDER_WORKER_SHARED_SECRET:'fixture-secret',RENDER_OUTPUT_ROOT:join(directory,'output'),RENDER_STATE_ROOT:join(directory,'state'),RENDER_MEDIA_ALLOWED_HOSTS:'fixture.convex.cloud',RENDER_CALLBACK_ORIGINS:'https://fixture.convex.site',RENDER_STORAGE_ORIGINS:'https://fixture.convex.cloud'},stdio:['ignore','pipe','pipe']});let ready=false;for(let at=0;at<100;at++){if(child.exitCode!==null)throw Error('Fixture worker exited');try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,30));}assert(ready);
 const payload={url:'https://fixture.convex.cloud/api/storage/original',checksum,byteSize:bytes.length,profile:AUDIO_EXTRACTION_PROFILE,startSample:48000,sampleCount:96000};const post=(body=payload,secret='fixture-secret',path='/media/extract-audio')=>fetch(`http://127.0.0.1:${port}${path}`,{method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify(body)});
 assert.equal((await post(payload,'wrong')).status,401);checks++;
 const invalid=await post({...payload,url:'http://127.0.0.1/private'});assert.equal(invalid.status,400);assert(!JSON.stringify(await invalid.json()).includes('private'));checks++;
 const pending=post();await new Promise(r=>setTimeout(r,80));assert.equal((await post()).status,429);assert.equal((await post({url:payload.url},'fixture-secret','/media/probe')).status,429);checks++;
 const response=await pending;assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/wav');assert.equal(response.headers.get('x-finalframe-extraction-profile'),AUDIO_EXTRACTION_PROFILE);const output=new Uint8Array(await response.arrayBuffer());assert.equal(assertExtractedWav(output,96000).durationSeconds,2);assert.equal(createHash('sha256').update(output).digest('hex'),response.headers.get('x-finalframe-output-checksum'));checks++;
 const after=await post({...payload,checksum:'0'.repeat(64)});assert.equal(after.status,400);assert.equal((await after.json()).error,'EXTRACTION_SOURCE_CHANGED');assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'),checksum);checks++;
 console.log(`Audio extraction HTTP: ${checks} PASS; actual authenticated worker/heavy gate/binary WAV, local synthetic media and isolated fetch only. No DB/provider calls.`);
}finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit').catch(()=>undefined);}await rm(directory,{recursive:true,force:true});}
