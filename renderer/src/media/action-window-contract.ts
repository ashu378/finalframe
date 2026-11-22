/** Server-owned temporal repair contract. V1 deliberately supports only
 * native24fps, <=720p sources: no hidden resize, stretching or extra frames. */
export const ACTION_WINDOW_VERSION = 'ACTION_WINDOW_V1' as const;
export const ACTION_WINDOW_REPAIR_VERSION = 'isolated-action-window-v3' as const;
export const ACTION_WINDOW_MAX_BYTES = 50_000_000;
export type ActionWindow = {version:typeof ACTION_WINDOW_VERSION;startFrame:number;endFrame:number;sourceFrames:number;fps:24;startSeconds:number;endSeconds:number;durationSeconds:number;width:number;height:number};
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'?v as Record<string,any>:{};
export function planActionWindow(actions:Array<{startSeconds:number;endSeconds:number}>,probe:unknown):ActionWindow {
 const p=object(probe),t=object(p.videoTiming),fps=Number(t.fpsNumerator)/Number(t.fpsDenominator);
 if(t.version!=='DECODED_VIDEO_FRAMES_V1'||fps!==24||t.firstFrameSeconds!==0||!Number.isSafeInteger(t.frameCount)||t.frameCount<1||t.frameCount>360||!Number.isSafeInteger(p.width)||!Number.isSafeInteger(p.height)||p.width<16||p.height<16||p.width%2||p.height%2||Math.min(p.width,p.height)>720||Math.max(p.width,p.height)>1280||!actions.length)throw new Error('ACTION_WINDOW_SOURCE_UNSUPPORTED');
 const start=Math.min(...actions.map(a=>a.startSeconds)),end=Math.max(...actions.map(a=>a.endSeconds));
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>t.frameCount/fps)throw new Error('ACTION_WINDOW_RANGE_INVALID');
 const startFrame=Math.floor(start*fps+1e-7),endFrame=Math.ceil(end*fps-1e-7);
 return {version:ACTION_WINDOW_VERSION,startFrame,endFrame,sourceFrames:t.frameCount,fps:24,startSeconds:startFrame/fps,endSeconds:endFrame/fps,durationSeconds:(endFrame-startFrame)/fps,width:p.width,height:p.height};
}
export function assertActionWindow(value:unknown):ActionWindow {
 const w=object(value);const expected=planActionWindow([{startSeconds:w.startSeconds,endSeconds:w.endSeconds}],{width:w.width,height:w.height,videoTiming:{version:'DECODED_VIDEO_FRAMES_V1',fpsNumerator:24,fpsDenominator:1,firstFrameSeconds:0,frameCount:w.sourceFrames}});
 if(w.version!==expected.version||Object.keys(expected).some(k=>w[k]!==expected[k as keyof ActionWindow]))throw new Error('ACTION_WINDOW_BINDING_CHANGED');
 return expected;
}
export function assertActionWindowProof(window:ActionWindow,value:unknown,compose:boolean){
 const p=object(value);
 if(p.version!==window.version||['width','height','startFrame','endFrame','sourceFrames','startSeconds','endSeconds','durationSeconds'].some(k=>p[k]!==window[k as keyof ActionWindow])||p.windowFrames!==window.endFrame-window.startFrame||p.fps!==24||p.outputFrames!==(compose?window.sourceFrames:window.endFrame-window.startFrame)||(!compose&&p.originalAudioCopied!==false))throw new Error('ACTION_WINDOW_BINDING_CHANGED');
 return p;
}
