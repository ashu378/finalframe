import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAssemblyPlan } from '../dist/assembly/plan.js';
import { canRenderSequentially, renderSequentialCuts } from '../dist/media/sequential-render.js';
import { InjectableFFmpegAdapter, InjectableFFprobeAdapter, normalizeWithFFmpeg } from '../dist/media/ffmpeg.js';
const ffmpeg=new InjectableFFmpegAdapter(),ffprobe=new InjectableFFprobeAdapter();
const root=await mkdtemp(join(tmpdir(),'finalframe-cut-test-'));
const input=join(root,'source.mp4'), output=join(root,'joined.mkv'), final=join(root,'final.mp4');
try {
  await ffmpeg.execute(['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x240:rate=24:duration=3','-f','lavfi','-i','sine=frequency=550:sample_rate=48000:duration=3','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-shortest',input]);
  const manifest={kind:'finalframe.render-manifest',version:5,manifestId:'cut-equivalence',projectId:'owned-test',selection:{scope:'FULL_PROJECT',ids:[]},export:{scope:'FULL_PROJECT',format:'MP4'},rendererVersion:'test',output:{width:240,height:320,fps:24,durationInFrames:48,codec:'h264',audio:{sampleRate:48000,channels:2}},items:[{id:'first',kind:'video',src:input,startFrame:0,durationInFrames:24,trimStartInFrames:12,volume:0.5},{id:'second',kind:'video',src:input,startFrame:24,durationInFrames:24,trimStartInFrames:36,volume:0}],audioTracks:[],captionTracks:[]};
  const plan=createAssemblyPlan(manifest);assert.equal(canRenderSequentially(plan),true);
  const blocked=[{audioTracks:[{}]},{captionTracks:[{}]},{transitions:[{}]},{outputCodec:'vp9'},
    {items:plan.items.map((x,i)=>({...x,startFrame:i===1?20:0}))},
    ...['holdAfterFrame','sourceAudioRestoration','position','opacity','fit'].map(key=>({items:[{...plan.items[0],[key]:{holdAfterFrame:20,sourceAudioRestoration:{},position:'left',opacity:0.5,fit:'contain'}[key]},plan.items[1]]}))];
  for(const patch of blocked)assert.equal(canRenderSequentially({...plan,...patch}),false,JSON.stringify(patch));
  await renderSequentialCuts(plan,manifest,output,{ffmpeg,ffprobe,policy:{mode:'fixture',allowedLocalRoots:[root]},timeoutMs:30000,renderGraphic:async()=>{throw new Error('unexpected graphic');}});
  await normalizeWithFFmpeg(ffmpeg,output,final,{output:manifest.output});
  const probe=await ffprobe.probe(final,{countFrames:true});const video=probe.streams.find(s=>s.codec_type==='video');
  assert.equal(video.nb_read_frames,'48');assert.equal(video.width,240);assert.equal(video.height,320);assert.equal(Number(probe.format.duration),2);
  const pcm=join(root,'audio.raw');await ffmpeg.execute(['-hide_banner','-loglevel','error','-y','-i',final,'-map','0:a:0','-f','f32le','-ac','1','-ar','48000',pcm]);
  const b=await readFile(pcm),samples=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
  const rms=(from,to)=>Math.sqrt(samples.slice(from,to).reduce((sum,x)=>sum+x*x,0)/(to-from));
  assert(rms(4800,43000)>0.02);assert(rms(53000,90000)<0.00001,'second clip must remain muted');
  // A source too short for an approved shot fails, rather than silently holding it.
  const short={...manifest,items:[{...manifest.items[0],durationInFrames:48,trimStartInFrames:60}]};
  await assert.rejects(renderSequentialCuts(createAssemblyPlan(short),short,output,{ffmpeg,ffprobe,policy:{mode:'fixture',allowedLocalRoots:[root]},timeoutMs:30000,renderGraphic:async()=>{}}),/frame count/);
  console.log(JSON.stringify({pass:true,eligibilityCases:blocked.length+1,frames:48,nativeAudio:true,mute:true,trim:true,shortSourceDenied:true,paidCalls:0}));
} finally {await rm(root,{recursive:true,force:true});}
