import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import { OUTPUT_PRESETS, OUTPUT_FPS } from '../dist/output-presets.js';
import { assertValidManifest } from '../dist/manifest.js';
import { InjectableFFmpegAdapter, InjectableFFprobeAdapter, normalizeWithFFmpeg } from '../dist/media/ffmpeg.js';
import { validateOutputProbe } from '../dist/media/probe.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory=await mkdtemp(join(process.env.FINALFRAME_FORMAT_ARTIFACT_DIR??tmpdir(),'finalframe-format-matrix-'));
const run=(name,args)=>{const result=spawnSync(name,args,{timeout:60_000,maxBuffer:16*1024*1024});assert.equal(result.status,0,result.stderr?.toString());return result.stdout;};
const ffmpegArgs=['-hide_banner','-loglevel','error','-y'];
run('ffmpeg',[...ffmpegArgs,'-f','lavfi','-i','color=c=red:s=160x90:r=30:d=1','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1','-vf','drawbox=x=80:y=0:w=80:h=90:color=blue:t=fill','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac',join(directory,'original.mp4')]);
run('ffmpeg',[...ffmpegArgs,'-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=1',join(directory,'music.wav')]);
const media=new Map([['/original.mp4','video/mp4'],['/music.wav','audio/wav']]);
const server=createServer(async(req,res)=>{
 const type=media.get(req.url);if(!type){res.writeHead(404).end();return;}
 const bytes=await readFile(join(directory,req.url.slice(1)));
 const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
 if(range){const start=Number(range[1]),end=range[2]?Number(range[2]):bytes.length-1;res.writeHead(206,{'content-type':type,'content-range':`bytes ${start}-${end}/${bytes.length}`,'content-length':end-start+1,'accept-ranges':'bytes'});res.end(bytes.subarray(start,end+1));return;}
 res.writeHead(200,{'content-type':type,'content-length':bytes.length,'accept-ranges':'bytes'});res.end(bytes);
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await openBrowser('chrome',{browserExecutable:process.env.FINALFRAME_TEST_CHROMIUM??'/usr/bin/chromium',logLevel:'error'});
const serveUrl=await bundle({entryPoint:join(root,'dist/remotion/entry.js')});
const ffmpeg=new InjectableFFmpegAdapter(),ffprobe=new InjectableFFprobeAdapter();
const cases=OUTPUT_PRESETS.map(preset=>({preset,fps:30})).concat(OUTPUT_FPS.filter(fps=>fps!==30).map(fps=>({preset:OUTPUT_PRESETS[1],fps})),[{preset:OUTPUT_PRESETS[0],fps:30,crop:true}]);
const records=[];
function manifestFor(preset,fps,crop=false){const cut=Math.floor(fps/2);return {
 kind:'finalframe.render-manifest',version:5,manifestId:`format-${preset.id}-${fps}-${crop?'crop':'contain'}`,projectId:'owned-format-fixtures',rendererVersion:'local-fixture',
 selection:{scope:'TIMELINE',ids:[]},export:{scope:'TIMELINE',format:'MP4'},
 output:{presetId:preset.id,width:preset.width,height:preset.height,fps,durationInFrames:fps,codec:'h264',audio:{sampleRate:48000,channels:2}},
 metadata:{lockState:'LOCKED',lockId:'fixture',lockedAt:'2026-11-05T00:00:00Z',lockedBy:'fixture',formatVariant:{version:1,sourceTimelineId:'original-edit',rootTimelineId:'original-edit',sourceVersionNumber:1,sourceUpdatedAt:1,presetId:preset.id,fit:crop?'cover':'contain',focalPoint:{x:crop ? .9 : .5,y:.5},backgroundColor:'#204060'}},
 tracks:[{id:'picture',kind:'VIDEO',orderIndex:0},{id:'music',kind:'AUDIO',orderIndex:1}],
 items:[{id:'owned-video',kind:'video',trackId:'picture',src:origin+'/original.mp4',fit:crop?'cover':'contain',position:crop?'90% 50%':'50% 50%',backgroundColor:'#204060',startFrame:0,durationInFrames:cut,volume:.7},
 {id:'authored-graphic',kind:'motion-graphics',trackId:'picture',startFrame:cut,durationInFrames:fps-cut,templateId:'kinetic-title',props:{layoutVersion:2,title:'Try DraftDesk',backgroundColor:'#101722',textColor:'#ffffff'}}],
 audioTracks:[{id:'original-music',trackId:'music',src:origin+'/music.wav',startFrame:0,durationInFrames:fps,volume:.2}],
 captionTracks:[{id:'caption',language:'en',style:{fontSize:42,color:'#00ff00',backgroundColor:'#000000cc',position:'BOTTOM',maxLines:3},cues:[{id:'all-words',startFrame:0,durationInFrames:fps,text:'Exact approved caption.'}]}],
 };}
function amplitude(samples,frequency,center){const count=4800,start=Math.round(center*48000-count/2);let a=0,b=0;for(let n=0;n<count;n++){const phase=2*Math.PI*frequency*n/48000;a+=samples[start+n]*Math.cos(phase);b+=samples[start+n]*Math.sin(phase);}return 2*Math.hypot(a,b)/count;}
try{
 for(const preset of OUTPUT_PRESETS)for(const fps of OUTPUT_FPS)assertValidManifest(manifestFor(preset,fps));
 for(const {preset,fps,crop=false} of cases){
  const manifest=assertValidManifest(manifestFor(preset,fps,crop));
  const composition=await selectComposition({serveUrl,id:'FinalFrameAssembly',inputProps:{manifest},puppeteerInstance:browser,logLevel:'error'});
  const name=`${preset.id.toLowerCase()}-${fps}-${crop?'crop':'contain'}`;
  const intermediate=join(directory,name+'.mkv'),output=join(directory,name+'.mp4');
  await renderMedia({serveUrl,composition:{...composition,durationInFrames:fps,fps,width:preset.width,height:preset.height},inputProps:{manifest},puppeteerInstance:browser,codec:'h264',preferLossless:true,outputLocation:intermediate,concurrency:1,logLevel:'error',timeoutInMilliseconds:30_000});
  await normalizeWithFFmpeg(ffmpeg,intermediate,output,{output:manifest.output,requireAudio:true,timeoutMs:60_000,maxOutputBytes:8_000_000});
  const probe=await ffprobe.probe(output);const validated=validateOutputProbe(probe,manifest.output,{requireAudio:true});assert(validated.ok,JSON.stringify(validated.issues));
  assert.equal(Number(probe.streams.find(s=>s.codec_type==='video').nb_frames),fps);
  const decoded=run('ffmpeg',['-hide_banner','-loglevel','error','-i',output,'-map','0:a:0','-ar','48000','-ac','1','-f','f32le','pipe:1']);
  const samples=new Float32Array(decoded.buffer,decoded.byteOffset,decoded.byteLength/4);
  assert(amplitude(samples,440,.25)>.03);assert(amplitude(samples,220,.25)>.01);assert(amplitude(samples,220,.75)>.01);assert(amplitude(samples,440,.75)<.005);
  const last=join(directory,name+'.png');run('ffmpeg',[...ffmpegArgs,'-i',output,'-vf',`select=eq(n\\,${fps-1})`,'-frames:v','1','-threads','1',last]);
  const words=run('tesseract',[last,'stdout','--psm','11']).toString().toUpperCase().replace(/\s+/g,' ');
  assert(words.includes('TRY DRAFTDESK'),name+': '+words);assert(words.includes('EXACT APPROVED CAPTION'),name+': '+words);
  const pixels=run('ffmpeg',['-hide_banner','-loglevel','error','-i',output,'-frames:v','1','-vf','scale=16:16','-threads','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
  if(preset.id==='VERTICAL'&&!crop){const corner=[...pixels.subarray(0,3)];assert(corner.every((v,i)=>Math.abs(v-[32,64,96][i])<8),JSON.stringify(corner));}
  if(crop){const center=[...pixels.subarray((8*16+8)*3,(8*16+8)*3+3)];assert(center[2]>220&&center[0]<25,JSON.stringify(center));}
  records.push({preset:preset.id,fps,width:preset.width,height:preset.height,frames:fps,seconds:1,framing:crop?'cover-90%-50%':'contain',nativeAudio:true,independentMusic:true,captionsVisible:true,authoredTextVisible:true});
  console.log('PASS actual '+name+' frames, native/music timing, full caption and graphic');
 }
 await writeFile(join(directory,'MATRIX.json'),JSON.stringify({allPresetFpsContracts:35,actualMediaCases:records},null,2));
 console.log(`Output formats actual media matrix PASS. Artifacts ${directory}`);
}finally{await browser.close({silent:true});server.closeAllConnections();await new Promise(done=>server.close(done));}
