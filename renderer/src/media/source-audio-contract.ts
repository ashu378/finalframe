/** Deterministic finishing only: no provider, storage or voice synthesis. */
export const SOURCE_AUDIO_VERSION = 1;
export const SOURCE_AUDIO_RATE = 48000;
export const SOURCE_AUDIO_TIMING_CHOICES = ['EXACT', 'TRIM_RECORDING', 'HOLD_PICTURE', 'KEEP_PICTURE'] as const;
export type SourceAudioTimingChoice = typeof SOURCE_AUDIO_TIMING_CHOICES[number];
export interface DecodedVideoTiming {
  version: 'DECODED_VIDEO_FRAMES_V1'; frameCount: number; fpsNumerator: number; fpsDenominator: number;
  firstFrameSeconds: number; durationSeconds: number;
}
export function decodedVideoTiming(input: unknown): DecodedVideoTiming {
  const p=input as DecodedVideoTiming;
  if(!p||p.version!=='DECODED_VIDEO_FRAMES_V1'||!Number.isSafeInteger(p.frameCount)||p.frameCount<1||p.frameCount>3600||!Number.isSafeInteger(p.fpsNumerator)||!Number.isSafeInteger(p.fpsDenominator)||p.fpsNumerator<1||p.fpsDenominator<1||p.fpsNumerator/p.fpsDenominator>60||!Number.isFinite(p.firstFrameSeconds)||p.firstFrameSeconds<0||!Number.isFinite(p.durationSeconds)||p.durationSeconds<=0||p.durationSeconds>60.000001||Math.abs(p.durationSeconds-p.frameCount*p.fpsDenominator/p.fpsNumerator)>1e-9)throw new Error('SOURCE_AUDIO_VIDEO_TIMING_REQUIRED');
  return {version:p.version,frameCount:p.frameCount,fpsNumerator:p.fpsNumerator,fpsDenominator:p.fpsDenominator,firstFrameSeconds:p.firstFrameSeconds,durationSeconds:p.durationSeconds};
}
export interface SourceAudioPlan {
  pictureFrames: number; playbackFrames: number; outputFrames: number; audioSamples: number; placedSamples: number;
  deltaSamples: number; timingChoice: SourceAudioTimingChoice; holdAfterFrame?: number;
}
export function sourceAudioPlan(input: {fps:number;pictureFrames:number;availablePictureFrames?:number;audioSamples:number;timingChoice:SourceAudioTimingChoice;confirmedDeltaSamples:number;maximumPictureFrames:number}):SourceAudioPlan {
  const {fps,pictureFrames,audioSamples,timingChoice,confirmedDeltaSamples,maximumPictureFrames}=input;
  if(![24,25,30,50,60].includes(fps)||!Number.isSafeInteger(pictureFrames)||pictureFrames<1||pictureFrames>60*fps||!Number.isSafeInteger(audioSamples)||audioSamples<1||audioSamples>60*SOURCE_AUDIO_RATE||!Number.isSafeInteger(maximumPictureFrames)||maximumPictureFrames<pictureFrames)throw new Error('SOURCE_AUDIO_TIMING_INVALID');
  const deltaSamples=audioSamples-pictureFrames*SOURCE_AUDIO_RATE/fps;
  const available=input.availablePictureFrames??pictureFrames;
  if(!Number.isSafeInteger(available)||available<1)throw new Error('SOURCE_AUDIO_VIDEO_WINDOW_SHORT');
  const playbackFrames=Math.min(pictureFrames,available),shortPicture=playbackFrames<pictureFrames;
  if(!SOURCE_AUDIO_TIMING_CHOICES.includes(timingChoice)||confirmedDeltaSamples!==deltaSamples)throw new Error('SOURCE_AUDIO_TIMING_REVIEW_REQUIRED');
  let outputFrames=pictureFrames,placedSamples=audioSamples;
  if(timingChoice==='EXACT'&&(deltaSamples!==0||shortPicture)||timingChoice==='TRIM_RECORDING'&&(deltaSamples<=0||shortPicture)||timingChoice==='HOLD_PICTURE'&&deltaSamples<=0&&!shortPicture||timingChoice==='KEEP_PICTURE'&&(deltaSamples>=0||shortPicture))throw new Error('SOURCE_AUDIO_TIMING_REVIEW_REQUIRED');
  if(timingChoice==='TRIM_RECORDING')placedSamples=pictureFrames*SOURCE_AUDIO_RATE/fps;
  if(timingChoice==='HOLD_PICTURE')outputFrames=Math.max(pictureFrames,Math.ceil(audioSamples*fps/SOURCE_AUDIO_RATE));
  if(outputFrames>maximumPictureFrames||outputFrames>60*fps)throw new Error('SOURCE_AUDIO_HOLD_OVERLAPS_PICTURE');
  return {pictureFrames,playbackFrames,outputFrames,audioSamples,placedSamples,deltaSamples,timingChoice,...(outputFrames>playbackFrames?{holdAfterFrame:playbackFrames}:{})};
}
export interface SourceAudioRestoration extends SourceAudioPlan {
  version:1; key:string; fps:number; derivationJobId:string; editedTakeId:string; editedAssetId:string;
  sourceAssetId:string; sourceStorageId:string; sourceChecksum:string; sourceStartSample:number;
  audioAssetId:string; audioStorageId:string; audioChecksum:string;
}
export function sourceAudioReceipt(input:unknown):SourceAudioRestoration {
  const p=input as SourceAudioRestoration;
  if(!p||p.version!==1||typeof p.key!=='string'||p.key.length<8||p.key.length>200)throw new Error('SOURCE_AUDIO_BINDING_INVALID');
  for(const field of ['derivationJobId','editedTakeId','editedAssetId','sourceAssetId','sourceStorageId','audioAssetId','audioStorageId']as const)if(typeof p[field]!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(p[field]))throw new Error('SOURCE_AUDIO_BINDING_INVALID');
  for(const field of ['sourceChecksum','audioChecksum']as const)if(typeof p[field]!=='string'||!/^[a-f0-9]{64}$/.test(p[field]))throw new Error('SOURCE_AUDIO_BINDING_INVALID');
  if(!Number.isSafeInteger(p.sourceStartSample)||p.sourceStartSample<0||p.sourceStartSample+p.audioSamples>60*SOURCE_AUDIO_RATE)throw new Error('SOURCE_AUDIO_BINDING_INVALID');
  const plan=sourceAudioPlan({fps:p.fps,pictureFrames:p.pictureFrames,availablePictureFrames:p.playbackFrames,audioSamples:p.audioSamples,timingChoice:p.timingChoice,confirmedDeltaSamples:p.deltaSamples,maximumPictureFrames:60*p.fps});
  if(plan.outputFrames!==p.outputFrames||plan.placedSamples!==p.placedSamples||plan.holdAfterFrame!==p.holdAfterFrame)throw new Error('SOURCE_AUDIO_BINDING_INVALID');
  return {...plan,version:1,key:p.key,fps:p.fps,derivationJobId:p.derivationJobId,editedTakeId:p.editedTakeId,editedAssetId:p.editedAssetId,sourceAssetId:p.sourceAssetId,sourceStorageId:p.sourceStorageId,sourceChecksum:p.sourceChecksum,sourceStartSample:p.sourceStartSample,audioAssetId:p.audioAssetId,audioStorageId:p.audioStorageId,audioChecksum:p.audioChecksum};
}
export function sourceAudioRequirements(manifest: unknown): boolean {
  const p=manifest as {items?:Array<{holdAfterFrame?:unknown;sourceAudioRestoration?:unknown}>;audioTracks?:Array<{sourceAudioRestoration?:unknown}>};
  return Boolean(p&&(p.items?.some(item=>item.holdAfterFrame!==undefined||item.sourceAudioRestoration!==undefined)||p.audioTracks?.some(item=>item.sourceAudioRestoration!==undefined)));
}
