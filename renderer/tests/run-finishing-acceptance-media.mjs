import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// New local-only acceptance harness. Uses the canonical runtime unchanged.
// No remote source assets, database, provider, browser automation API or paid call.
const FPS=24,RATE=48000,W=320,H=180,FRAMES=128,SAMPLES=FRAMES*RATE/FPS;
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const kinds=['CUT','DISSOLVE','FADE','WIPE','SLIDE'];
const policies={DISSOLVE:'PRESERVE',FADE:'CROSSFADE',WIPE:'PRESERVE',SLIDE:'CROSSFADE'};
const formats={h264:{extension:'mp4',format:'MP4',audio:'aac'},vp9:{extension:'webm',format:'WEBM',audio:'opus'},prores:{extension:'mov',format:'MOV',audio:'pcm_s16le'}};
const selected=(process.env.FINALFRAME_FINISHING_CASES??'h264,vp9,prores').split(',');
assert(selected.length>0&&selected.length<=3&&new Set(selected).size===selected.length&&selected.every(key=>formats[key]),'Choose at most the three explicit codecs');
function atlas(codec='h264'){
 const items=[],transitions=[],blocks=[];let start=0;
 for(const kind of kinds){const incoming=kind==='CUT'?16:8,first=kind.toLowerCase()+'-a',second=kind.toLowerCase()+'-b';
  items.push({id:first,kind:'video',trackId:'picture',src:'/public/red.mov',startFrame:start,durationInFrames:16,trimStartInFrames:6,volume:.8,orderIndex:items.length});
  items.push({id:second,kind:'video',trackId:'picture',src:'/public/blue.mov',startFrame:start+incoming,durationInFrames:16,trimStartInFrames:4,volume:.8,orderIndex:items.length});
  if(kind!=='CUT')transitions.push({id:kind.toLowerCase()+'-join',fromItemId:first,toItemId:second,kind,durationInFrames:8,audioPolicy:policies[kind]});
  blocks.push({kind,start,incoming,audioPolicy:policies[kind]??'PRESERVE'});start+=incoming+16;
 }
 assert.equal(start,FRAMES);
 const captionTracks=['TOP','CENTER','BOTTOM'].map((position,index)=>({id:'caption-'+position.toLowerCase(),language:'en',style:{fontSize:18,color:'#00ff00',backgroundColor:'#000000ff',position,maxLines:2},cues:[{id:'full-'+position.toLowerCase(),startFrame:blocks[index].start+3,durationInFrames:4,text:position+' & FULL\nEVERY WORD'}]}));
 return {blocks,manifest:{kind:'finalframe.render-manifest',version:5,manifestId:'local-finishing-'+codec,projectId:'owned-original-finishing-fixture',rendererVersion:'fixture-only',selection:{scope:'TIMELINE',ids:[]},export:{scope:'TIMELINE',format:formats[codec].format},output:{width:W,height:H,fps:FPS,durationInFrames:FRAMES,codec,audio:{sampleRate:RATE,channels:2}},tracks:[{id:'picture',kind:'VIDEO',orderIndex:0},{id:'music',kind:'AUDIO',orderIndex:1}],items,transitions,captionTracks,audioTracks:[{id:'independent-music',trackId:'music',src:'/public/music.wav',startFrame:0,durationInFrames:FRAMES,trimStartInFrames:3,volume:.35}]}};
}
function timestamp(text){const m=text.match(/^(\d+):(\d\d):(\d\d)[,.](\d{3})$/);assert(m,'Actual sidecar timestamp shape');return(+m[1]*3600 + +m[2]*60 + +m[3])*1000 + +m[4];}
function checkSidecars(track,sidecars){
 for(const [kind,text] of Object.entries(sidecars)){let body=kind==='vtt'?text.replace(/^WEBVTT\n\n/,''):text;const lines=body.trimEnd().split('\n');assert.equal(lines[0],'1');const [start,end]=lines[1].split(' --> ').map(timestamp),cue=track.cues[0];assert(Math.abs(start-cue.startFrame*1000/FPS)<=.5+1e-6);assert(Math.abs(end-(cue.startFrame+cue.durationInFrames)*1000/FPS)<=.5+1e-6);assert.equal(lines.slice(2).join('\n').replaceAll('&amp;','&'),cue.text);}
}
const mode=process.argv.includes('--self-test')?'self-test':process.argv.includes('--execute-local')?'execute':'plan';
if(mode==='plan'){console.log(JSON.stringify({mode,network:false,paidCalls:0,database:false,cases:selected,perCase:{frames:FRAMES,seconds:FRAMES/FPS,width:W,height:H,sampleFrames:SAMPLES},maxCases:3,totalFrames:selected.length*FRAMES,concurrency:1,renderDeadlineMs:180000,artifactCapPerOutputBytes:20000000,command:'node renderer/tests/run-finishing-acceptance-media.mjs --self-test; FINALFRAME_FINISHING_CASES=h264 node renderer/tests/run-finishing-acceptance-media.mjs --execute-local'}));process.exit(0);}
const {validateManifest}=await import('../dist/manifest.js');
const {createAssemblyPlan}=await import('../dist/assembly/plan.js');
const {serializeCaptionSidecars}=await import('../dist/captions.js');
for(const codec of selected){const {manifest}=atlas(codec),valid=validateManifest(manifest);assert(valid.ok,JSON.stringify(valid.issues));const p=createAssemblyPlan(manifest);assert.equal(p.durationInFrames,FRAMES);assert.deepEqual(p.transitions.map(t=>t.kind),kinds.slice(1));for(const track of manifest.captionTracks)checkSidecars(track,serializeCaptionSidecars(track,FPS));}
if(mode==='self-test'){assert.equal(SAMPLES,256000);assert.equal(atlas().manifest.items[1].startFrame,16);assert.deepEqual(atlas().blocks.map(x=>x.start),[0,32,56,80,104]);console.log(JSON.stringify({mode,cases:selected.length,actualManifestPlannerSidecarContracts:true,network:false,rendering:false,paidCalls:0}));process.exit(0);}
const {bundle}=await import('@remotion/bundler');
const {RemotionRenderRuntime}=await import('../dist/remotion/runtime.js');
const {createMediaAdapters}=await import('../dist/media/ffmpeg.js');
const artifacts=process.env.FINALFRAME_FINISHING_ARTIFACT_DIR?resolve(process.env.FINALFRAME_FINISHING_ARTIFACT_DIR):await mkdtemp(join(tmpdir(),'finalframe-finishing-acceptance-'));
await mkdir(artifacts,{recursive:true});
const ffmpeg=process.env.FINALFRAME_TEST_FFMPEG??'ffmpeg',ffprobe=process.env.FINALFRAME_TEST_FFPROBE??'ffprobe';
function command(exe,args,{input,maxBuffer=64*1024*1024}={}){const r=spawnSync(exe,args,{input,maxBuffer,timeout:90000});if(r.status!==0)throw Error(`${exe} failed: ${r.stderr?.toString().slice(-1400)}`);return r.stdout;}
const ff=(args,opts)=>command(ffmpeg,['-hide_banner','-loglevel','error','-threads','1',...args],opts);
function wave(seconds,frequency,channel,clicks){const n=Math.round(seconds*RATE),data=Buffer.alloc(n*4);for(let i=0;i<n;i++){let sample=.12*Math.sin(2*Math.PI*frequency*i/RATE);for(const at of clicks){const offset=i-Math.round(at*RATE);if(offset>=0&&offset<240)sample+=.55*Math.exp(-offset/22)*Math.cos(offset*.7);}data.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*32767),i*4+channel*2);}const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(data.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(2,22);h.writeUInt32LE(RATE,24);h.writeUInt32LE(RATE*4,28);h.writeUInt16LE(4,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(data.length,40);return Buffer.concat([h,data]);}
for(const [name,frequency]of [['red',440],['blue',880]]){await writeFile(join(artifacts,name+'.wav'),wave(2,frequency,0,[.5]));ff(['-y','-f','lavfi','-i',`color=c=${name}:s=${W}x${H}:r=${FPS}:d=2`,'-i',join(artifacts,name+'.wav'),'-c:v','libx264','-preset','ultrafast','-threads','1','-pix_fmt','yuv420p','-c:a','pcm_s16le','-t','2',join(artifacts,name+'.mov')]);}
await writeFile(join(artifacts,'music.wav'),wave((FRAMES+3)/FPS,220,1,atlas().blocks.map(b=>(b.start+5)/FPS)));
const entryPoint=join(ROOT,'dist/remotion/entry.js'),serveUrl=await bundle({entryPoint,publicDir:artifacts});
const runtime=new RemotionRenderRuntime({entryPoint,bundleCache:new Map([[entryPoint,serveUrl]]),...createMediaAdapters({ffmpegCommand:ffmpeg,ffprobeCommand:ffprobe}),maxConcurrency:1,commandTimeoutMs:180000,maxOutputBytes:20000000});
const results={fixture:'D01-D02-local-original-atlas',database:false,paidCalls:0,actualCanonicalRuntime:true,concurrency:1,frames:FRAMES,fps:FPS,seconds:FRAMES/FPS,cases:[],artifacts};
const frameBytes=W*H*3;
function pixel(rgb,frame,x,y){return [...rgb.subarray(frame*frameBytes+(y*W+x)*3,frame*frameBytes+(y*W+x)*3+3)];}
const isRed=p=>p[0]>220&&p[1]<35&&p[2]<35,isBlue=p=>p[2]>220&&p[0]<35&&p[1]<35;
function captionBounds(rgb,frame){let count=0,minY=H,maxY=-1;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=pixel(rgb,frame,x,y);if(p[1]>130&&p[0]<100&&p[2]<100){count++;minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}return{count,minY,maxY};}
function amplitude(pcm,channel,frequency,time){let a=0,b=0;const n=4800,start=Math.round(time*RATE)-n/2;for(let i=0;i<n;i++){const v=pcm[(start+i)*2+channel],angle=2*Math.PI*frequency*i/RATE;a+=v*Math.cos(angle);b+=v*Math.sin(angle);}return 2*Math.hypot(a,b)/n;}
function click(pcm,channel,time){const center=Math.round(time*RATE);let peak=center-480;for(let i=peak+1;i<center+480;i++)if(Math.abs(pcm[i*2+channel])>Math.abs(pcm[peak*2+channel]))peak=i;assert(Math.abs(pcm[peak*2+channel])>(channel===0?.15:.08),'Expected original impulse');assert(Math.abs(peak-center)<=96,`Original content onset shifted ${(peak-center)/48}ms at${time}s ch${channel}`);return{time,channel,errorMs:(peak-center)/48};}
try{
 for(const codec of selected){const {manifest,blocks}=atlas(codec),format=formats[codec],outputPath=join(artifacts,'finishing-'+codec+'.'+format.extension);await writeFile(join(artifacts,'manifest-'+codec+'.json'),JSON.stringify(manifest,null,2));for(const track of manifest.captionTracks){const sidecars=serializeCaptionSidecars(track,FPS);checkSidecars(track,sidecars);for(const [ext,text]of Object.entries(sidecars))await writeFile(join(artifacts,codec+'-'+track.id+'.'+ext),text);}
  const render=await runtime.render(createAssemblyPlan(manifest),{jobId:'finishing-'+codec,outputPath,manifest,mode:'fixture'});
  const probe=JSON.parse(command(ffprobe,['-v','error','-count_frames','-show_streams','-show_format','-of','json',outputPath]));const video=probe.streams.find(x=>x.codec_type==='video'),audio=probe.streams.find(x=>x.codec_type==='audio');assert.equal(Number(video.nb_read_frames),FRAMES);assert.equal(video.width,W);assert.equal(video.height,H);assert.equal(video.avg_frame_rate,FPS+'/1');assert.equal(audio.codec_name,format.audio);assert.equal(Number(audio.sample_rate),RATE);assert.equal(audio.channels,2);assert(Math.abs(Number(video.start_time??0))<=.002);if(audio.start_time!==undefined)assert(Math.abs(Number(audio.start_time))<=.002);if(video.duration!==undefined)assert(Math.abs(Number(video.duration)-FRAMES/FPS)<=.002);
  const rgb=ff(['-i',outputPath,'-map','0:v:0','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);assert.equal(rgb.length,FRAMES*frameBytes);
  const pixels=[];assert(isRed(pixel(rgb,15,80,90)),'CUT before');assert(isBlue(pixel(rgb,16,80,90)),'CUT exact boundary');
  for(const block of blocks.slice(1)){const before=pixel(rgb,block.start+7,80,90),start=pixel(rgb,block.start+8,80,90),left=pixel(rgb,block.start+12,80,90),right=pixel(rgb,block.start+12,240,90),after=pixel(rgb,block.start+16,80,90);assert(isRed(before),block.kind+' before');assert(isRed(start),block.kind+' exact start');assert(isBlue(after),block.kind+' exact end');if(block.kind==='DISSOLVE')assert(left[0]>105&&left[0]<150&&left[2]>105&&left[2]<150,'DISSOLVE literal half mix');if(block.kind==='FADE')assert(left.every(v=>v<25),'FADE literal black midpoint');if(block.kind==='WIPE')assert(isBlue(left)&&isRed(right),'WIPE literal spatial split');if(block.kind==='SLIDE')assert(isRed(left)&&isBlue(right),'SLIDE literal spatial split');pixels.push({kind:block.kind,before,start,left,right,after});}
  const captions=[];for(const track of manifest.captionTracks){const cue=track.cues[0],before=captionBounds(rgb,cue.startFrame-1),active=captionBounds(rgb,cue.startFrame),last=captionBounds(rgb,cue.startFrame+cue.durationInFrames-1),after=captionBounds(rgb,cue.startFrame+cue.durationInFrames);assert.equal(before.count,0,'No caption before exact cue');assert(active.count>40&&last.count>40,'Full styled caption visible for entire cue');assert.equal(after.count,0,'No caption on exclusive cue end');const [lo,hi]=track.style.position==='TOP'?[14,60]:track.style.position==='CENTER'?[65,115]:[115,167];assert(active.minY>=lo&&active.maxY<=hi,`Caption position ${track.style.position} ${JSON.stringify(active)}`);captions.push({id:track.id,position:track.style.position,startFrame:cue.startFrame,endFrame:cue.startFrame+cue.durationInFrames,active});}
  const bytes=ff(['-i',outputPath,'-map','0:a:0','-ac','2','-ar',String(RATE),'-f','f32le','pipe:1']);const pcm=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));assert.equal(pcm.length/2,SAMPLES,'Canonical exact decoded audio sample count');const impulses=[];for(const block of blocks){impulses.push(click(pcm,0,(block.start+6)/FPS),click(pcm,0,(block.start+block.incoming+8)/FPS),click(pcm,1,(block.start+2)/FPS));}
  const levels=blocks.slice(1).map(block=>({kind:block.kind,policy:block.audioPolicy,nativeA:amplitude(pcm,0,440,(block.start+12)/FPS),nativeB:amplitude(pcm,0,880,(block.start+12)/FPS),independentMusic:amplitude(pcm,1,220,(block.start+12)/FPS)}));const preserves=levels.filter(x=>x.policy==='PRESERVE'),baseA=preserves.reduce((n,x)=>n+x.nativeA,0)/2,baseB=preserves.reduce((n,x)=>n+x.nativeB,0)/2,baseMusic=preserves.reduce((n,x)=>n+x.independentMusic,0)/2;assert(baseA>.075&&baseA<.115&&baseB>.075&&baseB<.115,'Original native gains preserved');for(const row of levels){assert(Math.abs(row.independentMusic/baseMusic-1)<.1,'Independent music unchanged by native policy');if(row.policy==='CROSSFADE'){assert(row.nativeA/baseA>.42&&row.nativeA/baseA<.58,JSON.stringify(row)+' nativeA crossfade midpoint');assert(row.nativeB/baseB>.42&&row.nativeB/baseB<.58,JSON.stringify(row)+' nativeB crossfade midpoint');}}
  const frames=[15,16,...blocks.slice(1).map(b=>b.start+12),...manifest.captionTracks.map(t=>t.cues[0].startFrame)];for(const n of frames)ff(['-y','-f','rawvideo','-pixel_format','rgb24','-video_size',W+'x'+H,'-i','pipe:0','-frames:v','1',join(artifacts,codec+'-frame-'+n+'.png')],{input:rgb.subarray(n*frameBytes,(n+1)*frameBytes)});
  results.cases.push({codec,outputPath,verification:render.verification,probe,pixels,captions,impulses,levels,exactDecodedSamples:SAMPLES,savedFrames:frames});await writeFile(join(artifacts,'RESULTS.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({PASS:codec,frames:FRAMES,decodedSamples:SAMPLES,impulses:impulses.length,captionTracks:captions.length,artifacts}));
 }
}catch(error){await writeFile(join(artifacts,'FAILURE.json'),JSON.stringify({message:error.message,stack:error.stack,completedCases:results.cases.map(x=>x.codec),artifacts},null,2));throw error;}
console.log(JSON.stringify({PASS:true,cases:results.cases.length,artifacts,paidCalls:0,database:false}));
