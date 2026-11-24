import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repairVisionSamples } from '../dist/media/repair-vision-samples.js';
import { InjectableFFmpegAdapter } from '../dist/media/ffmpeg.js';

const directory=await mkdtemp(join(tmpdir(),'ff-repair-discovery-'));
const ffmpeg=new InjectableFFmpegAdapter();
try {
  const path=join(directory,'source.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=red:s=320x240:r=24:d=1.5',
    '-vf',"drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable='gte(n,12)'",'-c:v','libx264','-threads','1',path]);
  const timing={version:'DECODED_VIDEO_FRAMES_V1',fpsNumerator:24,fpsDenominator:1,firstFrameSeconds:0,durationSeconds:1.5,frameCount:36};
  const readPixel=(encoded,x,y)=>[...execFileSync('ffmpeg',['-v','error','-i','pipe:0','-vf',`format=rgb24,crop=1:1:${x}:${y}`,'-frames:v','1','-f','rawvideo','pipe:1'],{input:Buffer.from(encoded,'base64')})];
  const result=await repairVisionSamples(path,directory,timing,{kind:'CANDIDATE'},ffmpeg,10000);
  assert.equal(result.images.length,2);assert.equal(result.stride,3);
  const top=readPixel(result.images[0],160,120),bottom=readPixel(result.images[0],160,360),tail=readPixel(result.images[1],160,360);
  assert(top[0]>200&&top[2]<40);assert(bottom[2]>200&&bottom[0]<40);assert(tail.every(c=>c<20));
  const separate=await mkdtemp(join(directory,'reference-'));
  const context=await repairVisionSamples(path,separate,timing,{kind:'CONTEXT',frame:18},ffmpeg,10000);
  assert(readPixel(context.images[0],320,320)[2]>200);
  await assert.rejects(repairVisionSamples(path,separate,timing,{kind:'CONTEXT',frame:36},ffmpeg,10000),/outside/);
  console.log('PASS actual 24fps source: before/after colors in the correct 8fps cells, final-sheet padding and exact target reference frame');
} finally {await rm(directory,{recursive:true,force:true});}
