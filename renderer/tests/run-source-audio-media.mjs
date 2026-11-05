import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {openBrowser,renderMedia,selectComposition} from '@remotion/renderer';
import {extractCanonicalAudio} from '../dist/media/extract-audio.js';
import {probeRemoteMedia} from '../dist/media/remote-probe.js';
import {AUDIO_EXTRACTION_PROFILE} from '../dist/media/audio-extraction-contracts.js';
import {sourceAudioPlan,sourceAudioReceipt} from '../dist/media/source-audio-contract.js';
import {assertValidManifest} from '../dist/manifest.js';
import {InjectableFFmpegAdapter,InjectableFFprobeAdapter,normalizeWithFFmpeg} from '../dist/media/ffmpeg.js';
import {validateOutputProbe} from '../dist/media/probe.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=await mkdtemp(join(tmpdir(),'finalframe-source-audio-'));
const run=(name,args)=>{const r=spawnSync(name,args,{timeout:60000,maxBuffer:16_000_000});assert.equal(r.status,0,r.stderr?.toString());return r.stdout;};
const head=['-hide_banner','-loglevel','error','-y'];
run('ffmpeg',[...head,'-f','lavfi','-i','color=c=green:s=320x180:r=30:d=1.2','-f','lavfi','-i',String.raw`aevalsrc=0.2*sin(2*PI*440*t)+if(gte(t\,1.002)\,0.2*sin(2*PI*1170*t)\,0):s=48000:d=1.2`,'-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-ac','2',join(dir,'original.mp4')]);
run('ffmpeg',[...head,'-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=1','-f','lavfi','-i','sine=frequency=3000:sample_rate=48000:duration=1','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-ac','2',join(dir,'edited.mp4')]);
run('ffmpeg',[...head,'-i',join(dir,'edited.mp4'),'-frames:v','29','-c:v','libx264','-threads','1','-c:a','aac',join(dir,'edited-short.mp4')]);
const original=await readFile(join(dir,'original.mp4')),edited=await readFile(join(dir,'edited.mp4'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),host='knowing-snail-785.convex.cloud';
const ffmpeg=new InjectableFFmpegAdapter(),ffprobe=new InjectableFFprobeAdapter();
const measured=await probeRemoteMedia(`https://${host}/api/storage/edited`,{allowedHosts:[host],ffprobe,expectedChecksum:hash(edited),expectedByteSize:edited.length,verifyVideoTiming:true,fetch:async()=>new Response(edited)});
assert.equal(measured.videoTiming.frameCount,30);assert.equal(measured.videoTiming.durationSeconds,1);assert.equal(measured.videoTiming.firstFrameSeconds,0);
const shortEdited=await readFile(join(dir,'edited-short.mp4'));const shortMeasured=await probeRemoteMedia(`https://${host}/api/storage/edited-short`,{allowedHosts:[host],ffprobe,expectedChecksum:hash(shortEdited),expectedByteSize:shortEdited.length,verifyVideoTiming:true,fetch:async()=>new Response(shortEdited)});assert.equal(shortMeasured.videoTiming.frameCount,29);
const files=new Map([['/edited.mp4',{bytes:edited,type:'video/mp4'}],['/edited-short.mp4',{bytes:shortEdited,type:'video/mp4'}]]),proofs={};
for(const count of [48000,52800,48480,43200]){const extracted=await extractCanonicalAudio({url:`https://${host}/api/storage/original`,checksum:hash(original),byteSize:original.length,profile:AUDIO_EXTRACTION_PROFILE,startSample:0,sampleCount:count},{allowedHosts:[host],ffmpeg,ffprobe,fetch:async()=>new Response(original)});assert.equal(extracted.proof.sampleCount,count);files.set('/recording-'+count+'.wav',{bytes:extracted.bytes,type:'audio/wav'});proofs[count]=extracted.proof;await writeFile(join(dir,'recording-'+count+'.wav'),extracted.bytes);}
const server=createServer((req,res)=>{const file=files.get(req.url);if(!file){res.writeHead(404).end();return;}const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/),size=file.bytes.length;let start=0,end=size-1;if(range){start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),size-1):size-1;res.writeHead(206,{'content-type':file.type,'content-range':`bytes ${start}-${end}/${size}`,'accept-ranges':'bytes','content-length':end-start+1});}else res.writeHead(200,{'content-type':file.type,'content-length':size,'accept-ranges':'bytes'});res.end(file.bytes.subarray(start,end+1));});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await openBrowser('chrome',{browserExecutable:process.env.FINALFRAME_TEST_CHROMIUM??'/usr/bin/chromium',logLevel:'error'}),serveUrl=await bundle({entryPoint:join(root,'dist/remotion/entry.js')});
function pcm(file){const b=run('ffmpeg',['-v','error','-i',file,'-ar','48000','-ac','1','-f','f32le','pipe:1']);return new Float32Array(b.buffer,b.byteOffset,b.length/4);}
function amplitude(samples,hz,center){let a=0,b=0,count=2400,start=Math.round(center*48000-count/2);for(let i=0;i<count;i++){const phase=2*Math.PI*hz*i/48000;a+=samples[start+i]*Math.cos(phase);b+=samples[start+i]*Math.sin(phase);}return 2*Math.hypot(a,b)/count;}
const records=[];
try{
 for(const [name,choice,count,available]of [['EXACT','EXACT',48000,30],['HOLD_COMPLETE','HOLD_PICTURE',52800,30],['HOLD_SUBFRAME','HOLD_PICTURE',48480,30],['HOLD_NORMALIZATION','HOLD_PICTURE',48000,29],['TRIM_RECORDING','TRIM_RECORDING',52800,30],['KEEP_PICTURE','KEEP_PICTURE',43200,30]]){
  const plan=sourceAudioPlan({fps:30,pictureFrames:30,availablePictureFrames:available,audioSamples:count,timingChoice:choice,confirmedDeltaSamples:count-48000,maximumPictureFrames:60});
  const receipt=sourceAudioReceipt({...plan,version:1,key:'source-audio-media-'+name,fps:30,derivationJobId:'extraction',editedTakeId:'take',editedAssetId:'edited',sourceAssetId:'original',sourceStorageId:'original_storage',sourceChecksum:hash(original),sourceStartSample:0,audioAssetId:'recording',audioStorageId:'audio_storage',audioChecksum:proofs[count].checksum});
  const manifest=assertValidManifest({kind:'finalframe.render-manifest',version:5,manifestId:'source-audio-'+name,projectId:'owned-fixture',rendererVersion:'local-source-audio-contract',selection:{scope:'TIMELINE',ids:[]},export:{scope:'TIMELINE',format:'MP4'},output:{width:320,height:180,fps:30,durationInFrames:plan.outputFrames,codec:'h264',audio:{sampleRate:48000,channels:2}},metadata:{lockState:'LOCKED',lockId:'fixture',lockedAt:'2026-11-05',lockedBy:'fixture'},tracks:[{id:'picture',kind:'VIDEO',orderIndex:0},{id:'source',kind:'AUDIO',orderIndex:1}],items:[{id:'edited',kind:'video',trackId:'picture',src:origin+(available===29?'/edited-short.mp4':'/edited.mp4'),assetId:'edited',shotVersionId:'take',startFrame:0,durationInFrames:plan.outputFrames,volume:0,...(plan.holdAfterFrame?{holdAfterFrame:plan.holdAfterFrame}:{}),sourceAudioRestoration:receipt}],audioTracks:[{id:'recording',trackId:'source',src:origin+'/recording-'+count+'.wav',startFrame:0,durationInFrames:Math.ceil(plan.placedSamples*30/48000),volume:1,role:'dialogue',sourceAudioRestoration:receipt}],captionTracks:[]});
  const composition=await selectComposition({serveUrl,id:'FinalFrameAssembly',inputProps:{manifest},puppeteerInstance:browser,logLevel:'error'}),intermediate=join(dir,name+'.mkv'),output=join(dir,name+'.mp4');
  await renderMedia({serveUrl,composition:{...composition,width:320,height:180,fps:30,durationInFrames:plan.outputFrames},inputProps:{manifest},puppeteerInstance:browser,codec:'h264',preferLossless:true,outputLocation:intermediate,concurrency:1,logLevel:'error'});
  await normalizeWithFFmpeg(ffmpeg,intermediate,output,{output:manifest.output,requireAudio:true,timeoutMs:60000,maxOutputBytes:8_000_000});const probe=await ffprobe.probe(output);assert(validateOutputProbe(probe,manifest.output,{requireAudio:true}).ok);
  const samples=pcm(output);assert(amplitude(samples,440,.5)>.1);assert(amplitude(samples,3000,.5)<.001,'provider-native tone must be muted');
  let heldDifference=null;
  if(choice==='HOLD_PICTURE'){
   if(count>48000)assert(amplitude(samples,1170,Math.min(1.06,count/48000-.003))>.008,'complete recording tail must remain audible');
   const frame=n=>run('ffmpeg',['-v','error','-i',output,'-vf',`select=eq(n\\,${n})`,'-frames:v','1','-threads','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);const last=frame(plan.holdAfterFrame-1),held=frame(plan.outputFrames-1);heldDifference=last.reduce((sum,v,i)=>sum+Math.abs(v-held[i]),0)/last.length;assert(heldDifference<1,'last approved picture frame must hold: '+heldDifference);
  }
  if(choice==='KEEP_PICTURE')assert(amplitude(samples,440,.96)<.001,'short recording must not stretch to cover picture');
  if(choice==='TRIM_RECORDING')assert.equal(samples.length,48000);
  records.push({name,choice,availableDecodedPictureFrames:available,sourceSamples:count,placedSamples:plan.placedSamples,discardedSamples:count-plan.placedSamples,outputFrames:plan.outputFrames,outputPath:output,sha256:hash(await readFile(output)),providerAudioMuted:true,heldDifference});console.log('PASS actual '+name+' original audio and measured '+plan.outputFrames+' picture frames');
 }
 await writeFile(join(dir,'RESULTS.json'),JSON.stringify({scope:'Owned synthetic media; source extraction, decoded timing and deterministic restoration, not likeness/lip-sync certification',providerCalls:0,databaseCalls:0,videoTiming:measured.videoTiming,shortVideoTiming:shortMeasured.videoTiming,cases:records},null,2));console.log('Source-audio actual media PASS. Artifacts '+dir);
}finally{await browser.close({silent:true});server.closeAllConnections();await new Promise(done=>server.close(done));}
