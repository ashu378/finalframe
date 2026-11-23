import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectCutawayFrames } from '../dist/media/performance-cutaway.js';
import { remoteActionWindow } from '../dist/media/remote-action-window.js';

const dir = await mkdtemp(join(tmpdir(),'finalframe-cutaway-test-'));
const ff = args => execFileSync('ffmpeg',['-v','error','-nostdin','-threads','1',...args]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const files = new Map();
  async function media(id,args) {
    const path = join(dir,id+'.mp4');
    ff([...args,path]);
    const bytes = await readFile(path);
    files.set(id,bytes);
    return {url:'https://fixture.convex.cloud/api/storage/'+id,checksum:digest(bytes),byteSize:bytes.length};
  }
  const video = ['-f','lavfi','-i','testsrc2=s=160x90:r=24:d=2'];
  const enc = ['-an','-c:v','libx264','-threads','1','-g','12','-keyint_min','12','-sc_threshold','0','-pix_fmt','yuv420p'];
  const source = await media('source',[...video,...enc]);
  const donor = await media('donor',[...video,'-vf','hflip',...enc]);
  const recording = await media('recording',['-f','lavfi','-i','sine=f=330:d=2','-c:a','aac']);
  const args = {operation:'PERFORMANCE_CUTAWAY',source,donor,recording,
    targetStartFrame:4,targetEndFrame:12,donorStartFrame:8,donorEndFrame:28};
  const expected=[8,11,13,16,19,22,24,27];
  assert.deepEqual(selectCutawayFrames(args),expected);
  assert.deepEqual(selectCutawayFrames({...args,targetStartFrame:0,targetEndFrame:1,donorStartFrame:5,donorEndFrame:6}),[5]);
  let calls=0;
  const transport={allowedHosts:['fixture.convex.cloud'],fetch:async(url,init)=>{
    assert.equal(init.redirect,'error'); assert.ok(init.signal); calls++;
    return new Response(files.get(url.pathname.split('/').at(-1)),{status:200});
  }};
  for (const ranges of [{donorStartFrame: .1},{targetEndFrame:4},{targetEndFrame:40},{donorEndFrame:35},{targetEndFrame:361}])
    await assert.rejects(remoteActionWindow({...args,...ranges},transport),/CUTAWAY_RANGE_INVALID/);
  assert.equal(calls,0);
  await assert.rejects(remoteActionWindow({...args,source:{...source,url:'https://another.convex.cloud/api/storage/source'}},transport),/allowed Convex/);
  assert.equal(calls,0);
  await assert.rejects(remoteActionWindow({...args,donor:{...donor,checksum:source.checksum}},transport),/SOURCE_CHANGED/);
  await assert.rejects(remoteActionWindow({...args,recording:source},transport),/RECORDING_MISMATCH/);
  await assert.rejects(remoteActionWindow({...args,donorStartFrame:40,donorEndFrame:60},transport),/MEDIA_TIMING_INVALID/);
  const frameHashes = file => ff(['-i',file,'-map','0:v:0','-f','framemd5','-']).toString().split('\n').filter(l=>/^0,/.test(l)).map(l=>l.split(',').at(-1).trim());
  for (const req of [args,{...args,targetStartFrame:12,targetEndFrame:24,donorStartFrame:0,donorEndFrame:24}]) {
    const result=await remoteActionWindow(req,transport);
    assert.equal(result.proof.checksum,digest(result.bytes));
    assert.equal(result.proof.outputFrames,48);
    assert.equal(result.proof.originalAudioCopied,true);
    assert.equal(result.proof.recordingChecksum,recording.checksum);
    const out=join(dir,'finished.mp4'); await writeFile(out,result.bytes);
    const original=frameHashes(join(dir,'source.mp4')),finished=frameHashes(out);
    assert.deepEqual(original.slice(0,req.targetStartFrame),finished.slice(0,req.targetStartFrame));
    assert.deepEqual(original.slice(req.targetEndFrame),finished.slice(req.targetEndFrame));
    if (req===args) {
      const donorFrames=frameHashes(join(dir,'donor.mp4'));
      assert.deepEqual(finished.slice(req.targetStartFrame,req.targetEndFrame),expected.map(i=>donorFrames[i]));
    } else {
      const profile=execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=profile','-of','csv=p=0',out]).toString().trim();
      assert.equal(profile,'High');
    }
    const audio = path => digest(ff(['-i',path,'-map','0:a:0','-c:a','copy','-f','adts','-']));
    assert.equal(audio(out),audio(join(dir,'recording.mp4')));
  }
  console.log('PASS performance cutaway: both exact endpoints, measured timing and source shape, bounded ranges, pinned assets, preserved outside frames and original AAC on both generic and seekable MP4s.');
} finally { await rm(dir,{recursive:true,force:true}); }
