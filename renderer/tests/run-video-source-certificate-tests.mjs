import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {probeRemoteMedia} from '../dist/media/remote-probe.js';
const bytes=Buffer.from('original synthetic transport fixture');const checksum=createHash('sha256').update(bytes).digest('base64');let probes=0;
const options={allowedHosts:['fixture.convex.cloud'],expectedChecksum:checksum,expectedByteSize:bytes.length,fetch:async()=>new Response(bytes),ffprobe:{probe:async()=>{probes++;return{format:{duration:'8.125'},streams:[{codec_type:'video',codec_name:'h264',width:1280,height:720},{codec_type:'audio',codec_name:'aac'}]};}}};
const result=await probeRemoteMedia('https://fixture.convex.cloud/api/storage/source',options);assert.equal(result.hasVideo,true);assert.equal(result.checksum,checksum);assert.equal(result.byteSize,bytes.length);assert.equal(result.durationSeconds,8.125);assert.equal(result.hasAudio,true);assert.equal(result.videoCodec,'h264');
await assert.rejects(probeRemoteMedia('https://fixture.convex.cloud/api/storage/source',{...options,expectedChecksum:'0'.repeat(64)}),/bytes changed/);assert.equal(probes,1);await assert.rejects(probeRemoteMedia('https://fixture.convex.cloud/api/storage/source',{...options,expectedByteSize:bytes.length+1}),/bytes changed/);assert.equal(probes,1);
console.log('Video source certificate: PASS canonical base64 digest/bytes/hasVideo roundtrip and changed source denial before probe; isolated synthetic transport, no database/provider calls.');
