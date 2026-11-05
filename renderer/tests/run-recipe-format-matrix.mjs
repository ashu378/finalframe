import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import { OUTPUT_PRESETS } from '../dist/output-presets.js';
import { assertValidManifest } from '../dist/manifest.js';
import { InjectableFFmpegAdapter, InjectableFFprobeAdapter, normalizeWithFFmpeg } from '../dist/media/ffmpeg.js';
import { validateOutputProbe } from '../dist/media/probe.js';

// This matrix verifies output/framing/audio/caption contracts of short retained
// samples. It is deliberately not a fresh browser journey or creative-quality
// acceptance for the full recipe, and makes no provider/database requests.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const retained=process.env.FINALFRAME_RECIPE_FIXTURES??'/home/ashuboris/.codex/artifacts/finalframe/functional-continuation-2026-11-04';
const artifactRoot=process.env.FINALFRAME_FORMAT_ARTIFACT_DIR??'/home/ashuboris/.codex/artifacts/finalframe/output-recipe-format-matrix-2026-11-05';
await mkdir(artifactRoot,{recursive:true});
const directory=await mkdtemp(join(artifactRoot,'run-'));
const run=(name,args)=>{const result=spawnSync(name,args,{timeout:60_000,maxBuffer:32*1024*1024});assert.equal(result.status,0,result.stderr?.toString());return result.stdout;};
const ffmpegArgs=['-hide_banner','-loglevel','error','-y'];
const checksum=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const fixtures=JSON.parse(await readFile(join(retained,'eight-browser-fixtures.json'),'utf8'));
assert.equal(fixtures.length,8);
const sources=new Map();
for(const fixture of fixtures){
 const file=join(retained,`retained-${fixture.type}.mp4`),actualHash=await checksum(file);assert.equal(actualHash,fixture.sha256,fixture.type+' retained checksum');
 const probe=JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]).toString());
 const video=probe.streams.find(s=>s.codec_type==='video'),hasAudio=probe.streams.some(s=>s.codec_type==='audio');assert(Number(probe.format.duration)>=1);
 const samples=hasAudio?pcm(file,.5):null;
 sources.set('/'+fixture.type+'.mp4',{file,fixture,hash:actualHash,video,hasAudio,samples});
}
const server=createServer(async(req,res)=>{
 const source=sources.get(req.url);if(!source){res.writeHead(404).end();return;}
 const size=(await stat(source.file)).size,range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
 if(range){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):size-1,size-1);if(start>end||start>=size){res.writeHead(416,{'content-range':`bytes */${size}`}).end();return;}res.writeHead(206,{'content-type':'video/mp4','content-range':`bytes ${start}-${end}/${size}`,'content-length':end-start+1,'accept-ranges':'bytes'});createReadStream(source.file,{start,end}).pipe(res);return;}
 res.writeHead(200,{'content-type':'video/mp4','content-length':size,'accept-ranges':'bytes'});createReadStream(source.file).pipe(res);
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await openBrowser('chrome',{browserExecutable:process.env.FINALFRAME_TEST_CHROMIUM??'/usr/bin/chromium',logLevel:'error'});
const serveUrl=await bundle({entryPoint:join(root,'dist/remotion/entry.js')});
const ffmpeg=new InjectableFFmpegAdapter(),ffprobe=new InjectableFFprobeAdapter(),records=[];
function pcm(file,start=0){const decoded=run('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(start),'-i',file,'-t','0.5','-map','0:a:0','-ar','24000','-ac','1','-f','f32le','pipe:1']);return new Float32Array(decoded.buffer,decoded.byteOffset,decoded.byteLength/4);}
function rms(samples){return Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);}
function correlation(a,b){let best=-1,bestLag=0;for(let lag=-768;lag<=768;lag+=1){let aa=0,bb=0,ab=0,count=0;for(let i=1000;i<Math.min(a.length,b.length)-1000;i+=2){const j=i+lag;if(j<0||j>=b.length)continue;aa+=a[i]*a[i];bb+=b[j]*b[j];ab+=a[i]*b[j];count++;}const corr=count?ab/Math.sqrt(aa*bb):-1;if(corr>best){best=corr;bestLag=lag;}}return {correlation:best,lagMilliseconds:bestLag/24};}
function manifestFor(source,preset){return {
 kind:'finalframe.render-manifest',version:5,manifestId:`recipe-format-${source.fixture.type}-${preset.id}`,projectId:source.fixture.projectExternalId,rendererVersion:'local-retained-contract',
 selection:{scope:'TIMELINE',ids:[]},export:{scope:'TIMELINE',format:'MP4'},
 output:{presetId:preset.id,width:preset.width,height:preset.height,fps:30,durationInFrames:15,codec:'h264',audio:{sampleRate:48000,channels:2}},
 metadata:{lockState:'LOCKED',lockId:'local-retained-contract',lockedAt:'2026-11-05T00:00:00Z',lockedBy:'fixture',formatVariant:{version:1,sourceTimelineId:source.fixture.manifestId,rootTimelineId:source.fixture.manifestId,sourceVersionNumber:1,sourceUpdatedAt:null,presetId:preset.id,fit:'contain',focalPoint:{x:.5,y:.5},backgroundColor:'#000000'}},
 tracks:[{id:'retained-picture',kind:'VIDEO',orderIndex:0}],
 items:[{id:source.fixture.type,kind:'video',trackId:'retained-picture',src:origin+'/'+source.fixture.type+'.mp4',startFrame:0,durationInFrames:15,trimStartInFrames:15,fit:'contain',position:'50% 50%',backgroundColor:'#000000',volume:1}],audioTracks:[],
 captionTracks:[{id:'diagnostic-caption',language:'en',style:{fontSize:36,color:'#00ff00',backgroundColor:'#000000',position:'TOP',maxLines:2},cues:[{id:'sample',startFrame:0,durationInFrames:15,text:'FORMAT CHECK'}]}],
 };}
try{
 for(const source of sources.values())for(const preset of OUTPUT_PRESETS){
  const name=source.fixture.type+'-'+preset.id,manifest=assertValidManifest(manifestFor(source,preset));
  const intermediate=join(directory,name+'.mkv'),output=join(directory,name+'.mp4');
  const composition=await selectComposition({serveUrl,id:'FinalFrameAssembly',inputProps:{manifest},puppeteerInstance:browser,logLevel:'error'});
  await renderMedia({serveUrl,composition:{...composition,durationInFrames:15,fps:30,width:preset.width,height:preset.height},inputProps:{manifest},puppeteerInstance:browser,codec:'h264',preferLossless:true,outputLocation:intermediate,concurrency:1,logLevel:'error',timeoutInMilliseconds:30_000});
  await normalizeWithFFmpeg(ffmpeg,intermediate,output,{output:manifest.output,requireAudio:source.hasAudio,timeoutMs:60_000,maxOutputBytes:8_000_000});
  const probe=await ffprobe.probe(output),validated=validateOutputProbe(probe,manifest.output,{requireAudio:source.hasAudio});assert(validated.ok,JSON.stringify(validated.issues));assert.equal(Number(probe.streams.find(s=>s.codec_type==='video').nb_frames),15);
  let audio={sourceHasAudio:source.hasAudio,outputHasAudio:probe.streams.some(s=>s.codec_type==='audio')};
  if(source.hasAudio){const actual=pcm(output),sourceRms=rms(source.samples),outputRms=rms(actual);assert.equal(actual.length,12000);if(sourceRms>.001){const similarity=correlation(source.samples,actual);assert(similarity.correlation>.94,name+': '+JSON.stringify(similarity));assert(Math.abs(similarity.lagMilliseconds)<40,name+' audio drift');audio={...audio,sourceRms,outputRms,...similarity};}else {assert(outputRms<.003,name+' silent source remains silent');audio={...audio,sourceRms,outputRms};}}
  else if(audio.outputHasAudio){const outputRms=rms(pcm(output));assert(outputRms<.0001,name+' no-source audio stays silent');audio={...audio,outputRms,silentNormalizationTrack:true};}
  const png=join(directory,name+'.png');run('ffmpeg',[...ffmpegArgs,'-i',output,'-vf','select=eq(n\\,7)','-frames:v','1','-threads','1',png]);
  // Isolate the diagnostic caption by authored green color so artwork and
  // burned-in source text cannot confuse the OCR assertion.
  const captionPixels=run('ffmpeg',['-hide_banner','-loglevel','error','-i',png,'-frames:v','1','-threads','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
  const sourceRatio=source.video.width/source.video.height,targetRatio=preset.width/preset.height;
  let letterboxVerified=null;
  if(Math.abs(sourceRatio-targetRatio)>.001){
   const x=sourceRatio<targetRatio?5:Math.floor(preset.width/2),y=sourceRatio>targetRatio?preset.height-6:Math.floor(preset.height/2),offset=(y*preset.width+x)*3;
   const pixel=[...captionPixels.subarray(offset,offset+3)];assert(pixel.every(value=>value<10),name+': contain background '+JSON.stringify(pixel));letterboxVerified=true;
  }
  const captionHeight=Math.floor(preset.height/4),mask=Buffer.alloc(preset.width*captionHeight,255);
  for(let i=0;i<mask.length;i++){const r=captionPixels[i*3],g=captionPixels[i*3+1],b=captionPixels[i*3+2];if(g>150&&g>r*1.8&&g>b*1.8)mask[i]=0;}
  const captionImage=join(directory,name+'.caption.pgm');await writeFile(captionImage,Buffer.concat([Buffer.from(`P5\n${preset.width} ${captionHeight}\n255\n`),mask]));
  const words=run('tesseract',[captionImage,'stdout','--psm','11']).toString().toUpperCase().replace(/\s+/g,' ');assert(words.includes('FORMAT CHECK'),name+': '+words);
  const pixelBytes=run('ffmpeg',['-hide_banner','-loglevel','error','-i',output,'-vf','select=eq(n\\,7),scale=16:16','-frames:v','1','-threads','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
  let brightest=0;for(let i=0;i<pixelBytes.length;i+=3)brightest=Math.max(brightest,pixelBytes[i]+pixelBytes[i+1]+pixelBytes[i+2]);assert(brightest>60,name+' has visible source');
  const record={type:source.fixture.type,preset:preset.id,sourcePath:source.file,sourceSha256:source.hash,sourceManifestId:source.fixture.manifestId,sourceDimensions:{width:source.video.width,height:source.video.height},outputPath:output,outputSha256:await checksum(output),outputDimensions:{width:preset.width,height:preset.height},fps:30,frames:15,durationSeconds:.5,sourceStartSeconds:.5,fit:'contain',focalPoint:{x:.5,y:.5},backgroundColor:'#000000',letterboxVerified,caption:'FORMAT CHECK (diagnostic only; original burned-in captions retained as source)',captionVisible:true,audio};
  records.push(record);await writeFile(join(directory,'MATRIX.json'),JSON.stringify({scope:'Retained-media format/framing/audio/caption contract; not creative quality or browser E2E',paidRequests:0,cases:records},null,2));console.log(`PASS ${records.length}/56 ${name} ${preset.width}x${preset.height} audio=${source.hasAudio}`);
 }
 assert.equal(records.length,56);console.log('56 retained-media format cases PASS. Artifacts '+directory);
}finally{await browser.close({silent:true});server.closeAllConnections();await new Promise(done=>server.close(done));}
