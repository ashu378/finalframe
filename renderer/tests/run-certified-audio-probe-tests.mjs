import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeRemoteMedia } from '../dist/media/remote-probe.js';
import { InjectableFFmpegAdapter, InjectableFFprobeAdapter } from '../dist/media/ffmpeg.js';

const directory=await mkdtemp(join(tmpdir(),'ff-certified-audio-'));let checks=0;
const ffmpeg=new InjectableFFmpegAdapter();const ffprobe=new InjectableFFprobeAdapter();
const url='https://fixture.convex.cloud/api/storage/recording';
async function measure(bytes,patch={}) {
 return probeRemoteMedia(url,{allowedHosts:['fixture.convex.cloud'],kind:'audio',ffmpeg,ffprobe,verifyAudioDuration:true,expectedChecksum:createHash('sha256').update(bytes).digest('base64'),expectedByteSize:bytes.length,fetch:async()=>new Response(bytes),...patch});
}
try{
 const rate=16000;const samples=53400;const wav=Buffer.alloc(44+samples*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
 for(let at=0;at<samples;at++)wav.writeInt16LE(Math.round(7000*Math.sin(2*Math.PI*(220+(at%2000)/10)*at/rate)),44+at*2);
 const wavPath=join(directory,'original.wav');const mp3Path=join(directory,'original-vbr.mp3');await writeFile(wavPath,wav);
 await ffmpeg.execute(['-hide_banner','-loglevel','error','-y','-i',wavPath,'-codec:a','libmp3lame','-q:a','4',mp3Path],{timeoutMs:15000});
 const mp3=await readFile(mp3Path);const legacy=await measure(wav,{expectedChecksum:createHash('sha256').update(wav).digest('hex')});assert.equal(legacy.durationMeasurement,'DECODED_PCM_SAMPLES_V1');
 for(const bytes of [wav,mp3]){const result=await measure(bytes);assert.equal(result.durationMeasurement,'DECODED_PCM_SAMPLES_V1');assert.equal(result.decodedSampleRate,16000);assert.equal(result.durationSeconds,result.decodedSampleCount/16000);assert.ok(Math.abs(result.durationSeconds-samples/rate)<.005);checks++;}
 // A real forged VBR frame-count header understates metadata duration. The
 // complete packet stream still has to decode and determines paid authority.
 const forged=Buffer.from(mp3);const xing=forged.indexOf('Xing');assert.ok(xing>=0,'original local VBR fixture contains Xing');assert.ok(forged.readUInt32BE(xing+4)&1);forged.writeUInt32BE(10,xing+8);
 const full=await measure(forged);const understated=await measure(forged,{verifyAudioDuration:false,ffmpeg:undefined});
 assert.ok(understated.durationSeconds>0&&understated.durationSeconds<.5,'forged Xing metadata actually understates this original stream');
 assert.ok(full.decodedSampleCount>=samples,'certified duration includes the full original sound and any encoder padding retained after the forged header');
 assert.ok(full.durationSeconds<samples/rate+.2,JSON.stringify({decoded:full.durationSeconds,metadata:understated.durationSeconds}));checks++;
 const spoofedProbe={probe:async(path,options)=>({...await ffprobe.probe(path,options),format:{format_name:'mp3',duration:'.01'}})};
 const decoded=await measure(mp3,{ffprobe:spoofedProbe});assert.ok(decoded.durationSeconds>3);
 for(const invalid of [0,601,1.5,NaN])await assert.rejects(measure(wav,{maxAudioDurationSeconds:invalid}),/duration cap/);await assert.rejects(measure(wav,{maxAudioDurationSeconds:4,verifyAudioDuration:false}),/duration cap/);checks++;
 const capped=await measure(wav,{maxAudioDurationSeconds:4});assert.equal(capped.decodedSampleCount,samples);await assert.rejects(measure(wav,{maxAudioDurationSeconds:1}),/over1|truncated/);checks++;
 const generic=await measure(mp3,{ffprobe:spoofedProbe,verifyAudioDuration:false,ffmpeg:undefined});assert.equal(generic.durationSeconds,.01);assert.equal(generic.durationMeasurement,undefined);checks++;
 await assert.rejects(measure(wav,{ffmpeg:{execute:async args=>writeFile(args.at(-1),Buffer.alloc(601*rate*4))}}),/over600|truncated/);checks++;
 let decodedUnexpectedly=false;await assert.rejects(measure(wav,{expectedChecksum:'0'.repeat(64),ffmpeg:{execute:async()=>{decodedUnexpectedly=true;}}}),/bytes changed/);assert.equal(decodedUnexpectedly,false);checks++;
 console.log(`Certified audio duration: PASS (${checks}); original WAV/VBR MP3 + forged Xing + real decode, isolated downloads only. No database/provider calls.`);
}finally{await rm(directory,{recursive:true,force:true});}
