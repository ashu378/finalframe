import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { extractCanonicalAudio } from '../dist/media/extract-audio.js';
import { AUDIO_EXTRACTION_PROFILE,assertExtractedWav } from '../dist/media/audio-extraction-contracts.js';
import { spawnSync } from 'node:child_process';
import { InjectableFFmpegAdapter,InjectableFFprobeAdapter } from '../dist/media/ffmpeg.js';
const directory=await mkdtemp(join(tmpdir(),'ff-audio-extract-real-')),ffmpeg=new InjectableFFmpegAdapter(),ffprobe=new InjectableFFprobeAdapter();let checks=0;
async function source(extra=[],name='original.mp4'){const path=join(directory,name);await ffmpeg.execute(['-v','error','-y','-f','lavfi','-i','color=c=blue:s=64x48:r=24:d=4','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4',...extra,'-c:v','libx264','-preset','ultrafast','-threads','1','-pix_fmt','yuv420p','-c:a','aac',path],{timeoutMs:15000});return readFile(path);}
try{
 const bytes=await source(),input={url:'https://fixture.convex.cloud/api/storage/video',checksum:createHash('sha256').update(bytes).digest('base64'),byteSize:bytes.length,profile:AUDIO_EXTRACTION_PROFILE,startSample:48000,sampleCount:96000};const options={allowedHosts:['fixture.convex.cloud'],ffmpeg,ffprobe,fetch:async(_url,init)=>{assert.equal(init.redirect,'error');return new Response(bytes);}};
 const result=await extractCanonicalAudio(input,options);assert.equal(assertExtractedWav(result.bytes).sampleCount,96000);assert.equal(result.proof.durationSeconds,2);assert.equal(result.proof.channels,2);assert.ok(Math.abs(result.proof.sourceDurationSeconds-4)<.001);checks++;
 // AAC tail packet duration can already include its edit-list discard. Decode
 // actual nb_samples rather than subtracting discard_padding a second time.
 for(const seconds of [1.2,8.2]){
  const path=join(directory,`aac-tail-${seconds}.mp4`);await ffmpeg.execute(['-v','error','-y','-f','lavfi','-i',`color=c=blue:s=64x48:r=30:d=${seconds}`,'-f','lavfi','-i',`sine=frequency=440:sample_rate=48000:duration=${seconds}`,'-c:v','libx264','-preset','ultrafast','-threads','1','-pix_fmt','yuv420p','-c:a','aac',path],{timeoutMs:15000});
  const tailBytes=await readFile(path),samples=Math.round(seconds*48000);const tail=await extractCanonicalAudio({...input,startSample:0,sampleCount:samples,byteSize:tailBytes.length,checksum:createHash('sha256').update(tailBytes).digest('hex')},{...options,fetch:async()=>new Response(tailBytes)});
  assert.equal(assertExtractedWav(tail.bytes).sampleCount,samples);assert.equal(tail.proof.durationSeconds,seconds);checks++;
 }
 // Genuine decoded AAC sound may outlast the last picture. The late tone
 // lies entirely beyond the1s video; compare every PCM sample with an
 // independent whole-audio decode and reject even one absent tail sample.
 {
 const tailPath=join(directory,'audio-beyond-picture.mp4');
 await ffmpeg.execute(['-v','error','-y','-f','lavfi','-i','color=c=blue:s=64x48:r=30:d=1','-f','lavfi','-i','sine=frequency=2000:sample_rate=48000:duration=1.2','-c:v','libx264','-preset','ultrafast','-threads','1','-pix_fmt','yuv420p','-c:a','aac',tailPath],{timeoutMs:15000});
 const tailBytes=await readFile(tailPath),decoded=spawnSync('ffmpeg',['-v','error','-i',tailPath,'-map','0:a:0','-vn','-ac','2','-ar','48000','-c:a','pcm_s16le','-f','s16le','pipe:1'],{timeout:15000,maxBuffer:1_000_000});
 assert.equal(decoded.status,0,decoded.stderr?.toString());const reference=decoded.stdout,tailSamples=reference.length/4;assert(tailSamples>48000);assert(Number.isSafeInteger(tailSamples));
 const late=await extractCanonicalAudio({...input,startSample:0,sampleCount:tailSamples,byteSize:tailBytes.length,checksum:createHash('sha256').update(tailBytes).digest('hex')},{...options,fetch:async()=>new Response(tailBytes)});
 assert.equal(assertExtractedWav(late.bytes).sampleCount,tailSamples);
 let pcm;for(let at=12;at<late.bytes.length;){const size=late.bytes.readUInt32LE(at+4);if(late.bytes.toString('ascii',at,at+4)==='data'){pcm=late.bytes.subarray(at+8,at+8+size);break;}at+=8+size+(size%2);}
 assert(pcm);assert.deepEqual(pcm,reference);const audibleTail=pcm.subarray(48000*4,Math.min(tailSamples,57000)*4);let energy=0;for(let i=0;i<audibleTail.length;i+=2)energy+=audibleTail.readInt16LE(i)**2;assert(Math.sqrt(energy/(audibleTail.length/2))>1000,'The sound beyond picture must be audible, not padded silence');
 await assert.rejects(extractCanonicalAudio({...input,startSample:0,sampleCount:tailSamples+1,byteSize:tailBytes.length,checksum:createHash('sha256').update(tailBytes).digest('hex')},{...options,fetch:async()=>new Response(tailBytes)}),/AUDIO_WINDOW_SHORT/);checks++;
 }
 await assert.rejects(extractCanonicalAudio({...input,checksum:'0'.repeat(64)},options),/SOURCE_CHANGED/);await assert.rejects(extractCanonicalAudio({...input,byteSize:bytes.length-1},options),/SOURCE_LIMIT/);await assert.rejects(extractCanonicalAudio({...input,url:'https://foreign.convex.cloud/api/storage/video'},options),/allowed/);checks++;
 const silent=await source(['-an'],'silent.mp4');await assert.rejects(extractCanonicalAudio({...input,byteSize:silent.length,checksum:createHash('sha256').update(silent).digest('hex')},{...options,fetch:async()=>new Response(silent)}),/AUDIO_UNAVAILABLE/);checks++;
 const shortAudio=await source(['-af','atrim=end=1'],'short-audio.mp4');await assert.rejects(extractCanonicalAudio({...input,startSample:0,byteSize:shortAudio.length,checksum:createHash('sha256').update(shortAudio).digest('hex')},{...options,fetch:async()=>new Response(shortAudio)}),/AUDIO_WINDOW_SHORT/);checks++;
 // Metadata spoof cannot replace actual full packet timestamp bounds.
 await assert.rejects(extractCanonicalAudio(input,{...options,ffprobe:{...ffprobe,command:ffprobe.command,probe:async(...args)=>{const m=await ffprobe.probe(...args);m.format.duration='.001';return m;}},runner:{run:async()=>({stdout:JSON.stringify({packets:[{pts_time:'0',duration_time:'.041667'},{pts_time:'60',duration_time:'.041667'}]})})}}),/SOURCE_LIMIT/);checks++;
 // A positive audio stream timestamp must not be shifted into an earlier
 // selected source-video window or silently filled with new samples.
 const offset=await source(['-af','asetpts=PTS+1/TB'],'delayed-audio.mp4');await assert.rejects(extractCanonicalAudio({...input,startSample:0,byteSize:offset.length,checksum:createHash('sha256').update(offset).digest('hex')},{...options,fetch:async()=>new Response(offset)}),/AUDIO_WINDOW_SHORT/);checks++;
 for(const patch of [{fetch:async()=>new Response(null,{status:503})},{fetch:async()=>{throw Error('Isolated download unavailable');}},{ffprobe:{command:ffprobe.command,probe:async()=>{throw Object.assign(new Error('Isolated probe timeout'),{details:{timedOut:true}});}}}])await assert.rejects(extractCanonicalAudio(input,{...options,...patch}),error=>error.code==='EXTRACTION_WORKER_UNAVAILABLE');checks++;
 // Real4s video+61s PCM audio: a video-only certificate would pass this source.
 // Copy video/PCM to avoid expensive long synthesis/encoding in the test.
 const pcm=Buffer.alloc(44+61*48000*2);pcm.write('RIFF');pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(48000,24);pcm.writeUInt32LE(96000,28);pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(pcm.length-44,40);const pcmPath=join(directory,'long-original.wav'),longPath=join(directory,'short-video-long-audio.mov');await writeFile(pcmPath,pcm);await ffmpeg.execute(['-v','error','-y','-i',join(directory,'original.mp4'),'-i',pcmPath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy',longPath],{timeoutMs:15000});const longBytes=await readFile(longPath),longMetadata=await ffprobe.probe(longPath);assert.equal(Number(longMetadata.streams.find(s=>s.codec_type==='video').duration),4);assert.equal(Number(longMetadata.streams.find(s=>s.codec_type==='audio').duration),61);await assert.rejects(extractCanonicalAudio({...input,byteSize:longBytes.length,checksum:createHash('sha256').update(longBytes).digest('hex')},{...options,fetch:async()=>new Response(longBytes)}),/SOURCE_LIMIT/);checks++;
 console.log(`Real source audio extraction: ${checks} PASS; local original synthetic media + FFmpeg, mocked canonical downloads only. No DB/provider calls.`);
}finally{await rm(directory,{recursive:true,force:true});}
