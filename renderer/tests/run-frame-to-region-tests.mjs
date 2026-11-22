import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir}from'node:os';import{join}from'node:path';import{execFileSync}from'node:child_process';
import{prepareFrameToRegion,composeFrameToRegion}from'../dist/media/action-window.js';
import{planActionWindow}from'../dist/media/action-window-contract.js';
import{assertFrameToRegion,assertFrameToRegionProof,frameSelection,timedFrameSelection}from'../dist/media/frame-to-region-contract.js';
import{remoteFrameToRegion}from'../dist/media/remote-frame-to-region.js';
import{createHash}from'node:crypto';
const dir=await mkdtemp(join(tmpdir(),'ff-frame-region-'));
const ff=args=>execFileSync('ffmpeg',['-v','error','-nostdin','-threads','1','-filter_threads','1',...args],{timeout:30000,maxBuffer:500000});
const raw=async(path,name,audio=false)=>{const out=join(dir,name);ff(['-i',path,...(audio?['-map','0:a','-c:a','copy','-f','adts']:['-map','0:v:0','-pix_fmt','yuv420p','-f','rawvideo']),out]);return readFile(out);};
try{
 const source=join(dir,'source.mp4'),provider=join(dir,'provider.mp4'),first=join(dir,'first.png'),last=join(dir,'last.png'),output=join(dir,'out.mp4');
 ff(['-f','lavfi','-i','testsrc2=size=320x240:rate=24:duration=3','-f','lavfi','-i','sine=frequency=523:sample_rate=48000:duration=3','-c:v','libx264','-threads','1','-crf','0','-pix_fmt','yuv420p','-c:a','aac',source]);
 ff(['-f','lavfi','-i','testsrc2=size=640x640:rate=24:duration=4','-c:v','libx264','-threads','1','-crf','0','-pix_fmt','yuv420p',provider]);
 const window=planActionWindow([{startSeconds:1,endSeconds:2}],{width:320,height:240,videoTiming:{version:'DECODED_VIDEO_FRAMES_V1',fpsNumerator:24,fpsDenominator:1,firstFrameSeconds:0,frameCount:72}});
 const c=assertFrameToRegion({version:'FRAME_TO_REGION_V1',region:{version:'ACTION_REGION_V1',mode:'STATIONARY_RECTANGLE',window,x:64,y:80,width:96,height:96},anchorPreparation:{method:'LANCZOS',width:640,height:640},providerOutput:{width:640,height:640,fps:24,frames:96},normalization:{method:'UNIFORM_FRAME_SELECTION_LANCZOS',targetWidth:96,targetHeight:96,targetFrames:24,targetFps:24}});
 const sorted=v=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort().map(([k,x])=>[k,sorted(x)])):v;
 assert.deepEqual(assertFrameToRegion(sorted(c)),c);assert.equal(frameSelection(c)[0],0);assert.equal(frameSelection(c).at(-1),95);assert.equal(new Set(frameSelection(c)).size,24);
 for(const altered of [{...c,providerOutput:{...c.providerOutput,frames:97}},{...c,normalization:{...c.normalization,targetFrames:25}},{...c,region:{...c.region,width:98}}])assert.throws(()=>assertFrameToRegion(altered));
 const prepared=await prepareFrameToRegion({sourcePath:source,firstFramePath:first,lastFramePath:last,frameToRegion:c});assertFrameToRegionProof(sorted(c),prepared.proof,'PREPARED');assert.equal(prepared.firstFrame.sourceFrame,24);assert.equal(prepared.lastFrame.sourceFrame,47);assert.equal(prepared.firstFrame.width,640);
 const frameRgb=path=>execFileSync('ffmpeg',['-v','error','-threads','1','-i',path,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:2000000});
 for(const[anchor,n]of[[first,24],[last,47]]){const expected=join(dir,`expected-${n}.png`);ff(['-i',source,'-vf',`select=eq(n\\,${n}),crop=96:96:64:80:exact=1,scale=640:640:flags=lanczos`,'-frames:v','1',expected]);assert.deepEqual(frameRgb(anchor),frameRgb(expected));}
 console.log('PASS explicit contract and key order; exact first/last source crop PNGs with declared640px Lanczos scaling and frame lineage');
 const args={sourcePath:source,repairPath:provider,normalizedPath:join(dir,'normalized.mp4'),outputPath:output,frameToRegion:c};
 const result=await composeFrameToRegion(args);assertFrameToRegionProof(c,result,'COMPOSED');assert.equal(result.outputFrames,72);assert.equal(result.providerInputFrames,96);assert.equal(result.normalizedFrames,24);assert.equal(result.originalAudioCopied,true);
 const[a,b]=await Promise.all([raw(source,'source.yuv'),raw(output,'output.yuv')]);assert.equal(a.length,b.length);let changed=0;
 for(let frame=0;frame<72;frame++){let offset=0;for(let plane=0;plane<3;plane++){const scale=plane===0?1:2,w=320/scale,h=240/scale;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=frame*320*240*1.5+offset+y*w+x;const inside=frame>=24&&frame<48&&x>=64/scale&&x<160/scale&&y>=80/scale&&y<176/scale;if(!inside)assert.equal(a[p],b[p],'outside source sample changed');else if(a[p]!==b[p])changed++;}offset+=w*h;}}
 assert(changed>1000);assert.deepEqual(await raw(source,'source.aac',true),await raw(output,'output.aac',true));
 const endpointFrame = join(dir, 'with-endpoint.mp4');
 const extraFrames = join(dir, 'extra-frames.mp4');
 for (const [path, count] of [[endpointFrame, 1], [extraFrames, 2]]) {
  ff(['-i', provider, '-vf', `tpad=stop=${count}:stop_mode=clone`, '-c:v', 'libx264', '-crf', '0', '-threads', '1', path]);
 }
 const endpointOutput = join(dir, 'endpoint-out.mp4');
 const endpointProof = await composeFrameToRegion({...args, repairPath:endpointFrame, outputPath:endpointOutput});
 assertFrameToRegionProof(c, endpointProof, 'COMPOSED');
 assert.equal(endpointProof.providerInputFrames, 97);
 assert.equal(endpointProof.trimmedTrailingFrames, 1);
 assert.deepEqual(await raw(endpointOutput, 'endpoint.yuv'), b);
 assert.deepEqual(await raw(endpointOutput, 'endpoint.aac', true), await readFile(join(dir, 'source.aac')));
 assert.throws(()=>assertFrameToRegionProof(c, {...endpointProof, trimmedTrailingFrames:0}, 'COMPOSED'));
 await assert.rejects(composeFrameToRegion({...args,repairPath:extraFrames,outputPath:join(dir,'long.mp4')}),/PROVIDER_OUTPUT_INVALID/);
 await assert.rejects(composeFrameToRegion({...args,repairPath:source,outputPath:join(dir,'bad.mp4')}),/PROVIDER_OUTPUT_INVALID/);
 assert.throws(()=>assertFrameToRegionProof(c,{...result,selectedProviderFrames:frameSelection(c).reverse()},'COMPOSED'));
 console.log('PASS explicit96→24 selection/640→96 scale; all outside luma/chroma samples and original encoded audio unchanged; wrong provider geometry/timing rejected');
 const bytes=await readFile(source),input={url:'https://fixture.convex.cloud/api/storage/source',checksum:createHash('sha256').update(bytes).digest('hex'),byteSize:bytes.length};let calls=0;const options={allowedHosts:['fixture.convex.cloud'],fetch:async()=>{calls++;return new Response(bytes);}};
 await assert.rejects(remoteFrameToRegion({operation:'PREPARE',source:{...input,url:'https://bad.invalid/media'},frameToRegion:c},options),/allowed Convex/);assert.equal(calls,0);
 await assert.rejects(remoteFrameToRegion({operation:'PREPARE',source:{...input,checksum:'a'.repeat(64)},frameToRegion:c},options),/SOURCE_CHANGED/);
 const remote=await remoteFrameToRegion({operation:'PREPARE',source:input,frameToRegion:c},options);assert.equal(remote.kind,'PREPARED');assertFrameToRegionProof(c,remote.proof,'PREPARED');assert.equal(remote.firstFrame.outputPath,undefined);assert.equal(createHash('sha256').update(Buffer.from(remote.firstFrame.base64,'base64')).digest('hex'),remote.firstFrame.checksum);
 console.log('PASS pinned source origins/checksums and bounded remote PNG response; no local paths, no provider calls');
 for(const status of[408,429,503])await assert.rejects(remoteFrameToRegion({operation:'PREPARE',source:input,frameToRegion:c},{...options,fetch:async()=>new Response('',{status})}),/WORKER_UNAVAILABLE/);
 await assert.rejects(remoteFrameToRegion({operation:'PREPARE',source:input,frameToRegion:c},{...options,fetch:async()=>new Response(new ReadableStream({pull(controller){controller.error(new Error('interrupted'));}}))}),/WORKER_UNAVAILABLE/);
 const providerBytes=await readFile(provider),providerInput={url:'https://fixture.convex.cloud/api/storage/repair',checksum:createHash('sha256').update(providerBytes).digest('hex'),byteSize:providerBytes.length};
 const remoteComposed=await remoteFrameToRegion({operation:'COMPOSE',source:input,repair:providerInput,frameToRegion:c},{...options,fetch:async url=>new Response(String(url).endsWith('/repair')?providerBytes:bytes)});
 assert.equal(remoteComposed.kind,'COMPOSED');assertFrameToRegionProof(c,remoteComposed.proof,'COMPOSED');assert.equal(remoteComposed.proof.outputPath,undefined);assert.equal(createHash('sha256').update(remoteComposed.bytes).digest('hex'),remoteComposed.proof.checksum);
 console.log('PASS transient origin interruptions classified retryable; remote composition proof binds exact source and provider bytes');
 const large=join(dir,'large.mp4');ff(['-f','lavfi','-i','testsrc2=size=864x480:rate=24:duration=8.041667','-f','lavfi','-i','sine=frequency=523:sample_rate=48000:duration=8.041667','-frames:v','193','-c:v','libx264','-threads','1','-crf','0','-pix_fmt','yuv420p','-c:a','aac',large]);
 const largeWindow=planActionWindow([{startSeconds:4.75,endSeconds:7.25}],{width:864,height:480,videoTiming:{version:'DECODED_VIDEO_FRAMES_V1',fpsNumerator:24,fpsDenominator:1,firstFrameSeconds:0,frameCount:193}});
 const actual=assertFrameToRegion({...c,region:{...c.region,window:largeWindow,x:320,y:64,width:256,height:256},normalization:{...c.normalization,targetWidth:256,targetHeight:256,targetFrames:60}});
 assert.equal(new Set(frameSelection(actual)).size,60);
 const actualOut=join(dir,'actual-out.mp4'),actualResult=await composeFrameToRegion({sourcePath:large,repairPath:provider,normalizedPath:join(dir,'actual-normalized.mp4'),outputPath:actualOut,frameToRegion:actual});
 assertFrameToRegionProof(actual,actualResult,'COMPOSED');assert.equal(actualResult.normalizedFrames,60);assert.equal(actualResult.normalizedWidth,256);assert.equal(actualResult.outputFrames,193);assert.deepEqual(await raw(large,'large.aac',true),await raw(actualOut,'large-out.aac',true));
 const knot={providerFrame:70,targetFrame:23};
 const mapped=timedFrameSelection(actual,knot);
 assert.equal(mapped[0],0);assert.equal(mapped[23],70);assert.equal(mapped.at(-1),95);assert.equal(mapped.length,60);
 assert.throws(()=>timedFrameSelection(actual,{providerFrame:94,targetFrame:4}));
 const fittedPath=join(dir,'fit.mp4');
 const fitted=await composeFrameToRegion({sourcePath:large,repairPath:endpointFrame,normalizedPath:join(dir,'fit-normalized.mp4'),outputPath:fittedPath,frameToRegion:actual,actionTiming:knot});
 assertFrameToRegionProof(actual,fitted,'COMPOSED',knot);assert.throws(()=>assertFrameToRegionProof(actual,fitted,'COMPOSED'));
 assert.throws(()=>assertFrameToRegionProof(actual,{...fitted,selectedProviderFrames:frameSelection(actual)},'COMPOSED',knot));
 assert.deepEqual(await raw(fittedPath,'fit.aac',true),await readFile(join(dir,'large.aac')));
 console.log('PASS reviewed timing knot preserves both anchors and voice, rejects forged frame choices and cannot satisfy original uniform job');
 console.log('PASS proposed864x480/193frame source: exact96→60 selection and640→256 downscale inside114–174, source AAC unchanged');

}finally{await rm(dir,{recursive:true,force:true});}
