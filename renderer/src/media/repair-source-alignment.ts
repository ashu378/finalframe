import type { FFmpegAdapter } from './ffmpeg.js';
import type { DecodedVideoTiming } from './source-audio-contract.js';

/** Fingerprint the complete decoded image in display order, at native timing.
 * Never compare file names, packet encodings, thumbnails or just the faces. */
export async function repairFrameHashes(path:string,timing:DecodedVideoTiming,ffmpeg:FFmpegAdapter,timeoutMs:number) {
  if(timing.fpsNumerator/timing.fpsDenominator!==24||timing.firstFrameSeconds!==0||timing.frameCount<1||timing.frameCount>360)
    throw new Error('Native repair alignment requires a measured short 24fps shot.');
  const output=await ffmpeg.execute(['-nostdin','-hide_banner','-loglevel','error','-threads','1','-protocol_whitelist','file,pipe',
    '-i',path,'-map','0:v:0','-an','-fps_mode','passthrough','-c:v','rawvideo','-threads','1','-f','framehash','-hash','sha256','-'],
    {timeoutMs,maxOutputBytes:100000});
  const lines=output.stdout.split('\n').filter(l=>/^0,/.test(l));
  const hashes=lines.map(l=>l.split(',').at(-1)?.trim()??'');
  if(hashes.length!==timing.frameCount||hashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw new Error('Decoded repair fingerprint count changed.');
  return {version:'DECODED_REPAIR_FRAMES_V1',hashes};
}
