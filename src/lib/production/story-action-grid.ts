import type { StoryAction } from './story-actions';
import { actionCheckPrompt } from './story-action-check';

export const INLINE_VIDEO_MAX_BYTES = 2_000_000;
export const GRID_CHECK_PREFIX = 'picture-grids-v1:';
export function canRequoteRejectedVideo(requestKey:string,byteSize:number,receipt:{status:string;errorCode?:string}|null){
  return !requestKey.startsWith(GRID_CHECK_PREFIX) && byteSize>INLINE_VIDEO_MAX_BYTES &&
    receipt?.status==='RECONCILIATION_REQUIRED' && receipt.errorCode==='ACTION_CHECK_HTTP_400';
}
export function gridMessages(actions:StoryAction[],frameCount:number,images:string[],audio:string|null,audioEnd:number) {
  const text=actionCheckPrompt(actions)+'\nThe original shot was decoded at 24 fps. Review the labeled image grids, eight real samples per second, left-to-right then top-to-bottom. Ignore padding. The labels are seconds from the shot start. Cite only observed motion and timestamps; use UNCERTAIN if the sampled poses cannot establish the action. '+
    (audio?'The attached original recording starts at 0 s and runs through '+audioEnd.toFixed(3)+' s. Use it to compare the visible action with the dialogue.':'This clip has no recorded audio track. Use UNCERTAIN for a requirement depending on audible speech.');
  type Part={type:'text';text:string}|{type:'image_url';image_url:{url:string}}|{type:'input_audio';input_audio:{format:'wav';data:string}};
  const content:Part[]=[{type:'text',text}];
  images.forEach((image,index)=>{
    const times=Array.from({length:8},(_,i)=>(index*8+i)*3).filter(frame=>frame<frameCount).map(frame=>(frame/24).toFixed(3));
    content.push({type:'text',text:'Original timestamps (seconds): '+times.join(', ')},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+image}});
  });
  if(audio)content.push({type:'input_audio',input_audio:{format:'wav',data:audio}});
  return [{role:'user' as const,content}];
}
