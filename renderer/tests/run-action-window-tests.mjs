import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareActionWindow, composeActionWindow } from '../dist/media/action-window.js';
import { InjectableFFmpegAdapter, InjectableFFprobeAdapter } from '../dist/media/ffmpeg.js';
const ffmpeg = new InjectableFFmpegAdapter(), probe = new InjectableFFprobeAdapter();
const root = await mkdtemp(join(tmpdir(),'finalframe-action-window-test-'));
const source=join(root,'source.mp4'), repair=join(root,'repair.mp4'), output=join(root,'output.mp4'), prepared=join(root,'prepared.mp4');
const base=['-hide_banner','-loglevel','error','-y','-threads','1','-filter_threads','1'];
const video=['-c:v','libx264','-threads','1','-crf','0','-pix_fmt','yuv420p'];
async function hashes(file){const r=await ffmpeg.execute([...base,'-i',file,'-map','0:v:0','-f','framemd5','-'],{timeoutMs:10000});return r.stdout.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());}
async function pcm(file,name){const path=join(root,name);await ffmpeg.execute([...base,'-i',file,'-map','0:a:0','-f','s16le','-c:a','pcm_s16le',path],{timeoutMs:10000});return readFile(path);}
try {
  // Moving, numbered test pattern; the original soundtrack intentionally
  // extends beyond the last picture frame to catch accidental -shortest cuts.
  await ffmpeg.execute([...base,'-f','lavfi','-i','testsrc2=size=320x240:rate=24:duration=3','-f','lavfi','-i','sine=frequency=523:sample_rate=48000:duration=3.2',...video,'-c:a','aac',source],{timeoutMs:15000});
  const plan = await prepareActionWindow({sourcePath:source,outputPath:prepared,startSeconds:.48,endSeconds:1.51});
  assert.equal(plan.startFrame,11);assert.equal(plan.endFrame,37);assert.equal(plan.windowFrames,26);assert.equal(plan.startSeconds,11/24);assert.equal(plan.endSeconds,37/24);assert.equal(plan.originalAudioCopied,false);
  const sourceHashes=await hashes(source);assert.deepEqual(await hashes(prepared),sourceHashes.slice(11,37));
  console.log('PASS preparation expands to measured whole frames and rebases to zero without altering decoded picture');
  await ffmpeg.execute([...base,'-f','lavfi','-i',`color=red:size=320x240:rate=24:duration=${26/24}`,'-frames:v','26',...video,repair],{timeoutMs:15000});
  const composed=await composeActionWindow({sourcePath:source,repairPath:repair,outputPath:output,startSeconds:.48,endSeconds:1.51});
  assert.equal(composed.outputFrames,72);assert.equal(composed.originalAudioCopied,true);
  const actual=await hashes(output), repairHashes=await hashes(repair);
  assert.deepEqual(actual.slice(0,11),sourceHashes.slice(0,11));assert.deepEqual(actual.slice(11,37),repairHashes);assert.deepEqual(actual.slice(37),sourceHashes.slice(37));
  assert.deepEqual(await pcm(output,'output.pcm'),await pcm(source,'source.pcm'));
  const measured=await probe.probe(output,{countFrames:true});assert.equal(measured.streams.find(s=>s.codec_type==='video').nb_read_frames,'72');assert(Number(measured.format.duration)>=3.19);
  console.log('PASS only selected window changes; prefix/suffix decoded frames and complete original audio samples are identical');
  for (const [startSeconds,endSeconds] of [[-1,1],[2,1],[0,4],[NaN,1],[1,Infinity]]) await assert.rejects(prepareActionWindow({sourcePath:source,outputPath:join(root,'invalid.mp4'),startSeconds,endSeconds}),/RANGE_INVALID/);
  await assert.rejects(prepareActionWindow({sourcePath:'https://example.invalid/source.mp4',outputPath:join(root,'invalid.mp4'),startSeconds:0,endSeconds:1}),/LOCAL_PATH_REQUIRED/);
  await assert.rejects(prepareActionWindow({sourcePath:source,outputPath:source,startSeconds:0,endSeconds:1}),/OVERWRITE_SOURCE/);
  await assert.rejects(prepareActionWindow({sourcePath:source,outputPath:prepared,startSeconds:0,endSeconds:1}),/OUTPUT_EXISTS/);
  await assert.rejects(composeActionWindow({sourcePath:source,repairPath:prepared,outputPath:join(root,'invalid.mp4'),startSeconds:0,endSeconds:1}),/REPAIR_TIMING_CHANGED/);
  const wrong=join(root,'wrong.mp4');await ffmpeg.execute([...base,'-f','lavfi','-i','color=blue:size=160x120:rate=24:duration=1',...video,wrong],{timeoutMs:10000});
  await assert.rejects(composeActionWindow({sourcePath:source,repairPath:wrong,outputPath:join(root,'invalid.mp4'),startSeconds:0,endSeconds:1}),/DIMENSIONS_CHANGED/);
  console.log('PASS invalid ranges, remote paths, overwrites, changed frame counts and changed dimensions are rejected');
  // Whole-source replacement and zero-length prefix/suffix do not introduce
  // phantom frames. Silent sources remain silent; generated audio is ignored.
  const whole=join(root,'whole.mp4'),silent=join(root,'silent.mp4');
  await ffmpeg.execute([...base,'-i',source,'-map','0:v:0','-c:v','copy',silent]);
  const all=await composeActionWindow({sourcePath:silent,repairPath:source,outputPath:whole,startSeconds:0,endSeconds:3});
  assert.equal(all.originalAudioCopied,false);assert.deepEqual(await hashes(whole),sourceHashes);assert.equal((await probe.probe(whole)).streams.some(s=>s.codec_type==='audio'),false);
  console.log('PASS whole-window replacement and silent source handling; repair soundtrack never replaces original voices');
  const fractional=join(root,'fractional.mp4'),fractionalWindow=join(root,'fractional-window.mp4');
  await ffmpeg.execute([...base,'-f','lavfi','-i','testsrc2=size=160x120:rate=24000/1001:duration=1',...video,fractional],{timeoutMs:10000});
  const fractionalPlan=await prepareActionWindow({sourcePath:fractional,outputPath:fractionalWindow,startSeconds:.15,endSeconds:.65});
  assert.equal(fractionalPlan.fpsNumerator,24000);assert.equal(fractionalPlan.fpsDenominator,1001);
  const long=join(root,'long.mp4');await ffmpeg.execute([...base,'-f','lavfi','-i','color=black:size=16x16:rate=1:duration=61',...video,long],{timeoutMs:10000});
  await assert.rejects(prepareActionWindow({sourcePath:long,outputPath:join(root,'invalid-long.mp4'),startSeconds:0,endSeconds:1}),/SOURCE_LIMIT/);
  const shifted=join(root,'shifted.mp4');await ffmpeg.execute([...base,'-itsoffset','1','-i',source,'-map','0:v:0','-c:v','copy',shifted],{timeoutMs:10000});
  await assert.rejects(prepareActionWindow({sourcePath:shifted,outputPath:join(root,'invalid-shift.mp4'),startSeconds:0,endSeconds:1}),/CFR_REQUIRED/);
  console.log('PASS rational frame rates, 60-second limit and nonzero timestamp rejection');

  console.log(JSON.stringify({pass:true,providerCalls:0,frames:72,changedFrames:26,frameExactOutsideWindow:true,audioDecodedExact:true,fullAudioDurationPreserved:true}));
} finally { await rm(root,{recursive:true,force:true}); }
