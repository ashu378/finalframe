import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boundedStillImage, probeCanonicalImage } from '../dist/media/image-probe.js';
import { InjectableFFmpegAdapter, InjectableFFprobeAdapter } from '../dist/media/ffmpeg.js';

const directory=await mkdtemp(join(tmpdir(),'ff-image-contract-'));let checks=0;
try {
  const ppm=Buffer.concat([Buffer.from('P6\n64 64\n255\n'),Buffer.from(Array.from({length:64*64*3},(_,index)=>index%3===2?190:45))]);
  const source=join(directory,'original.ppm');await writeFile(source,ppm);
  const ffmpeg=new InjectableFFmpegAdapter();const ffprobe=new InjectableFFprobeAdapter();
  for(const [extension,mime] of [['png','image/png'],['jpg','image/jpeg']]) {
    const path=join(directory,'portrait.'+extension);
    await ffmpeg.execute(['-hide_banner','-loglevel','error','-y','-i',source,'-frames:v','1','-threads','1',path],{timeoutMs:15000});
    const bytes=await readFile(path);const checksum=createHash('sha256').update(bytes).digest('base64');
    const input={url:'https://fixture.convex.cloud/api/storage/image',checksum,byteSize:bytes.length,mimeType:mime};
    const options={allowedHosts:['fixture.convex.cloud'],ffprobe,fetch:async(url,init)=>{assert.equal(String(url),input.url);assert.equal(init.redirect,'error');return new Response(bytes,{headers:{'content-type':mime}});}};
    const measured=await probeCanonicalImage(input,options);assert.equal(measured.width,64);assert.equal(measured.height,64);assert.equal(measured.frameCount,1);assert.equal(measured.checksum,checksum);const legacyHex=Buffer.from(checksum,'base64').toString('hex');assert.equal((await probeCanonicalImage({...input,checksum:legacyHex},options)).checksum,legacyHex);checks++;
    await assert.rejects(probeCanonicalImage({...input,checksum:'0'.repeat(64)},options),/bytes changed/);
    await assert.rejects(probeCanonicalImage({...input,byteSize:bytes.length-1},options),/byte limit/);
    await assert.rejects(probeCanonicalImage({...input,url:'https://foreign.convex.cloud/api/storage/image'},options),/allowed/);
    const concatenated=Buffer.concat([bytes,bytes]);
    await assert.rejects(probeCanonicalImage({...input,checksum:createHash('sha256').update(concatenated).digest('hex'),byteSize:concatenated.length},{...options,fetch:async()=>new Response(concatenated,{headers:{'content-type':mime}})}));checks++;
    if(extension==='png') {
      const animated=Buffer.concat([bytes.subarray(0,33),Buffer.from([0,0,0,8]),Buffer.from('acTL'),Buffer.alloc(12),bytes.subarray(33)]);
      assert.throws(()=>boundedStillImage(animated,mime),/Animated/);
      const enormous=Buffer.from(bytes);enormous.writeUInt32BE(100000,16);assert.throws(()=>boundedStillImage(enormous,mime),/2K/);checks++;
    }
  }
  assert.throws(()=>boundedStillImage(Buffer.from('GIF89a'),'image/png'));
  console.log(`Image byte/probe contracts: PASS (${checks}); original local pixels + real FFmpeg/FFprobe, mocked downloads only. No database/provider calls.`);
} finally {await rm(directory,{recursive:true,force:true});}
