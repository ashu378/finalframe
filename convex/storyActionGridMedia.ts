'use node';
import { createHash } from 'node:crypto';
import { ConvexError } from 'convex/values';
import { sha256Equal } from '../renderer/src/media/sha256';
import { assertExtractedWav, AUDIO_EXTRACTION_PROFILE } from '../renderer/src/media/audio-extraction-contracts';
import type { StoryAction } from '../src/lib/production/story-actions';
import { gridMessages } from '../src/lib/production/story-action-grid';
import type { ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

// Only server-resolved storage, a configured FinalFrame worker and its shared
// secret participate in media preparation. Nothing from the client is fetched.
export async function checkedShotGrids(ctx:ActionCtx, data:{storageId:Id<'_storage'>;checksum:string;byteSize:number;actions:StoryAction[]}) {
  const worker=process.env.RENDER_WORKER_URL?.trim(),secret=process.env.RENDER_WORKER_SHARED_SECRET?.trim(),url=await ctx.storage.getUrl(data.storageId);
  if(!worker||!secret||!url)throw new ConvexError('The saved video is unavailable for frame inspection.');
  const source={url,checksum:data.checksum,byteSize:data.byteSize};
  const request=async(path:string,body:Record<string,unknown>)=>{
    const response=await fetch(worker.replace(/\/$/,'')+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(105_000),
      headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify({...source,...body})});
    if(!response.ok){await response.body?.cancel();throw new ConvexError('The worker could not verify the video frames or original sound. No check was purchased.');}
    return response;
  };
  const probe=await (await request('/media/probe',{kind:'video',verifyVideoTiming:true,repairSample:{kind:'CANDIDATE'}})).json();
  const g=probe.repairSamples,t=probe.videoTiming,frames=g?.frameCount;
  if(!sha256Equal(probe.checksum,data.checksum)||probe.byteSize!==data.byteSize||typeof probe.hasAudio!=='boolean'||
     !t||t.version!=='DECODED_VIDEO_FRAMES_V1'||t.fpsNumerator/t.fpsDenominator!==24||t.firstFrameSeconds!==0||
     !Number.isInteger(frames)||frames<1||frames>360||frames!==t.frameCount||g.version!=='REPAIR_SAMPLES_V1'||
     g.kind!=='CANDIDATE'||g.firstFrame!==0||g.stride!==3||!Array.isArray(g.images)||g.images.length!==Math.ceil(frames/24)||
     g.images.some((s:unknown)=>typeof s!=='string'||!s.startsWith('/9j/')||s.length>342000)||
     g.images.reduce((n:number,s:string)=>n+s.length,0)>2670000)
    throw new ConvexError('This frame check needs a verified 24 fps video of up to 15 seconds. No check was purchased.');
  const end=Math.max(...data.actions.map(a=>a.endSeconds)),samples=Math.ceil(end*48000);
  if(!Number.isSafeInteger(samples)||samples<1||samples>frames*2000)throw new ConvexError('The action timing extends past the verified picture.');
  let audio:string|null=null;
  if(probe.hasAudio){
    const response=await request('/media/extract-audio',{profile:AUDIO_EXTRACTION_PROFILE,startSample:0,sampleCount:samples});
    if(response.headers.get('content-type')!=='audio/wav'||Number(response.headers.get('content-length'))>samples*4+4096){
      await response.body?.cancel();throw new ConvexError('The original audio could not be verified.');}
    const wav=Buffer.from(await response.arrayBuffer());
    assertExtractedWav(wav,samples);
    if(!sha256Equal(createHash('sha256').update(wav).digest('hex'),response.headers.get('x-finalframe-output-checksum')))
      throw new ConvexError('The original audio changed during inspection.');
    audio=wav.toString('base64');
  }
  return gridMessages(data.actions,frames,g.images,audio,samples/48000);
}
