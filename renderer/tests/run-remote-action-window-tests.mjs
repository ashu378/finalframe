import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {remoteActionWindow,actionWindowErrorStatus} from '../dist/media/remote-action-window.js';
import {planActionWindow} from '../dist/media/action-window-contract.js';
const dir=await mkdtemp(join(tmpdir(),'finalframe-remote-window-test-'));
try{
 const path=join(dir,'source.mp4');execFileSync('ffmpeg',['-v','error','-nostdin','-threads','1','-f','lavfi','-i','testsrc2=size=192x128:rate=24:duration=3','-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac',path]);
 const bytes=await readFile(path),checksum=createHash('sha256').update(bytes).digest('hex'),window=planActionWindow([{startSeconds:1,endSeconds:2}],{width:192,height:128,videoTiming:{version:'DECODED_VIDEO_FRAMES_V1',frameCount:72,fpsNumerator:24,fpsDenominator:1,firstFrameSeconds:0}});
 const source={url:'https://fixture.convex.cloud/api/storage/source',checksum,byteSize:bytes.length};let calls=0;
 const fetch=async(url,init)=>{calls++;assert.equal(init.redirect,'error');assert(init.signal);return new Response(bytes,{headers:{'content-length':String(bytes.length),'content-type':'video/mp4'}});};
 const options={allowedHosts:['fixture.convex.cloud'],fetch};
 await assert.rejects(remoteActionWindow({operation:'PREPARE',source:{...source,url:'https://evil.example/media'},window},options),/allowed Convex/);assert.equal(calls,0);console.log('PASS foreign origins rejected before network');
 await assert.rejects(remoteActionWindow({operation:'PREPARE',source:{...source,checksum:'a'.repeat(64)},window},options),/SOURCE_CHANGED/);console.log('PASS exact canonical checksum verified');
 await assert.rejects(remoteActionWindow({operation:'PREPARE',source,window},{...options,fetch:async()=>new Response(bytes,{headers:{'content-length':'50000001'}})}),/DOWNLOAD_FAILED/);console.log('PASS oversized remote media fails before processing');
 for(const fetch of [async()=>{throw Error('network timeout')},async()=>new Response('',{status:503}),async()=>new Response(new ReadableStream({start(controller){controller.error(Error('stream interrupted'));}}))])await assert.rejects(remoteActionWindow({operation:'PREPARE',source,window},{...options,fetch}),error=>actionWindowErrorStatus(error)===503);assert.equal(actionWindowErrorStatus(Error('ACTION_WINDOW_SOURCE_CHANGED')),422);for(const code of ['ENOSPC','EIO','EAGAIN'])assert.equal(actionWindowErrorStatus(Object.assign(Error('transient'),{code})),503);assert.equal(actionWindowErrorStatus(Object.assign(Error('timeout'),{details:{timedOut:true}})),503);assert.equal(actionWindowErrorStatus(Error('ACTION_WINDOW_TIMEOUT')),503);console.log('PASS network, storage outage and body interruption remain retryable; invalid media does not');
 const prepared=await remoteActionWindow({operation:'PREPARE',source,window},options);assert.equal(prepared.proof.outputFrames,24);assert.equal(prepared.proof.originalAudioCopied,false);assert.equal(prepared.proof.byteSize,prepared.bytes.length);assert.equal(prepared.proof.checksum,createHash('sha256').update(prepared.bytes).digest('hex'));assert.equal(prepared.proof.outputPath,undefined);console.log('PASS bounded remote preparation returns exact proof without local paths');
 const repair={url:'https://fixture.convex.cloud/api/storage/repair',checksum:prepared.proof.checksum,byteSize:prepared.bytes.length};const composed=await remoteActionWindow({operation:'COMPOSE',source,repair,window},{...options,fetch:async(url,init)=>new Response(String(url).endsWith('/repair')?prepared.bytes:bytes)});assert.equal(composed.proof.outputFrames,72);assert.equal(composed.proof.originalAudioCopied,true);console.log('PASS remote composition preserves whole-source frames/audio receipt');
 const region={version:'ACTION_REGION_V1',mode:'STATIONARY_RECTANGLE',window,x:32,y:32,width:64,height:64};
 const focused=await remoteActionWindow({operation:'PREPARE',source,window,region},options);assert.equal(focused.proof.width,64);assert.equal(focused.proof.height,64);assert.deepEqual(focused.proof.region,region);assert.equal(focused.proof.outputPath,undefined);
 const focusedInput={url:'https://fixture.convex.cloud/api/storage/repair',checksum:focused.proof.checksum,byteSize:focused.bytes.length};
 const restored=await remoteActionWindow({operation:'COMPOSE',source,repair:focusedInput,window,region},{...options,fetch:async(url)=>new Response(String(url).endsWith('/repair')?focused.bytes:bytes)});assert.equal(restored.proof.width,192);assert.equal(restored.proof.height,128);assert.equal(restored.proof.outputFrames,72);assert.equal(restored.proof.originalAudioCopied,true);assert.deepEqual(restored.proof.region,region);
 await assert.rejects(remoteActionWindow({operation:'PREPARE',source,window,region:{...region,window:{...window,startSeconds:0,startFrame:0,durationSeconds:2}}},options),/BINDING_CHANGED/);
 console.log('PASS remote focused crop and source-sized composition preserve exact reviewed region proof; mismatched windows rejected');
 await assert.rejects(remoteActionWindow({operation:'DELETE',source,window},options),/INVALID_OPERATION/);console.log('PASS unknown operations rejected');
}finally{await rm(dir,{recursive:true,force:true});}
