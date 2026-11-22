import type { ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { ACTION_WINDOW_MAX_BYTES,assertActionWindowProof } from '../renderer/src/media/action-window-contract';
import { assertActionRegionProof } from '../renderer/src/media/action-region-contract';
type Lease={jobId:Id<'generationJobs'>;leaseId:string};
const refs=(internal as any).actionWindowRepairs;
/** All stages persist before progressing. An accepted provider job is never
 * repurchased when local compositing or upload is interrupted. */
async function processWindow(ctx:ActionCtx,lease:Lease,compose:boolean){
 const data=await ctx.runQuery(refs.context,lease),key=compose?'actionWindowComposed':'actionWindowPrepared';
 if(data[key])return data[key];
 const base=process.env.RENDER_WORKER_URL?.trim(),secret=process.env.RENDER_WORKER_SHARED_SECRET?.trim();
 if(!base||!secret)throw Object.assign(new Error('Action window worker unavailable'),{code:'ACTION_WINDOW_WORKER_UNAVAILABLE'});
 if(compose&&!data.actionWindowRaw)throw new Error('ACTION_WINDOW_RAW_REQUIRED');
 let response:Response;
 try{response=await fetch(base.replace(/\/$/,'')+'/media/action-window',{method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify({operation:compose?'COMPOSE':'PREPARE',source:data.source,window:data.window,...(data.region?{region:data.region}:{}),...(compose?{repair:data.actionWindowRaw,...(data.trailingFramePolicy?{trailingFramePolicy:data.trailingFramePolicy}:{})}:{})}),redirect:'error',signal:AbortSignal.timeout(185_000)});}catch{throw Object.assign(new Error('Action window worker unavailable'),{code:'ACTION_WINDOW_WORKER_UNAVAILABLE'});}
 if(!response.ok)throw Object.assign(new Error('Action window processing failed'),{code:response.status===422?'ACTION_WINDOW_MEDIA_INVALID':'ACTION_WINDOW_WORKER_UNAVAILABLE'});
 const rawProof=response.headers.get('x-finalframe-action-window');if(!rawProof||rawProof.length>4096||!response.body||response.headers.get('content-type')!=='video/mp4'||Number(response.headers.get('content-length'))>ACTION_WINDOW_MAX_BYTES)throw Object.assign(new Error('Invalid action window result'),{code:'ACTION_WINDOW_MEDIA_INVALID'});
 let proof;try{proof=JSON.parse(rawProof);}catch{throw new Error('ACTION_WINDOW_OUTPUT_CHANGED');}if(data.region)assertActionRegionProof(data.region,proof,compose);else assertActionWindowProof(data.window,proof,compose);
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>ACTION_WINDOW_MAX_BYTES)throw new Error('ACTION_WINDOW_OUTPUT_LIMIT');chunks.push(next.value);}}finally{await reader.cancel().catch(()=>undefined);}
 if(bytes!==proof.byteSize||bytes<1)throw new Error('ACTION_WINDOW_OUTPUT_CHANGED');
 const blob=new Blob(chunks as BlobPart[],{type:'video/mp4'}),storageId=await ctx.storage.store(blob);
 await ctx.runMutation(refs.record,{...lease,phase:compose?'COMPOSED':'PREPARED',storageId,proof});
 return {...proof,storageId,url:await ctx.storage.getUrl(storageId)};
}
async function safeProcess(ctx:ActionCtx,lease:Lease,compose:boolean){try{return await processWindow(ctx,lease,compose);}catch(error){if((error as {code?:string}).code)throw error;const invalid=error instanceof Error&&/ACTION_WINDOW_(BINDING_CHANGED|SOURCE_CHANGED|OUTPUT_CHANGED|INPUT_CHANGED|OUTPUT_LIMIT|OUTPUT_CONFLICT|STAGE_INVALID|LEASE_INVALID|PREPARATION_REQUIRED|RAW_REQUIRED|RANGE_INVALID|SOURCE_UNSUPPORTED)/.test(error.message);throw Object.assign(new Error(invalid?'Localized repair media did not match its saved contract.':'Localized repair processing was interrupted; saved stages can resume.'),{code:invalid?'ACTION_WINDOW_MEDIA_INVALID':'ACTION_WINDOW_WORKER_UNAVAILABLE'});}}
export async function prepareActionWindowInput(ctx:ActionCtx,lease:Lease){return safeProcess(ctx,lease,false);}
export async function composeActionWindowOutput(ctx:ActionCtx,lease:Lease){return safeProcess(ctx,lease,true);}
export async function getActionWindowState(ctx:ActionCtx,lease:Lease){return ctx.runQuery(refs.context,lease);}
export async function retainRawActionWindow(ctx:ActionCtx,lease:Lease,body:ArrayBuffer|Uint8Array){
 if(body.byteLength<1||body.byteLength>ACTION_WINDOW_MAX_BYTES)throw new Error('ACTION_WINDOW_OUTPUT_LIMIT');
 const storageId=await ctx.storage.store(new Blob([body as BlobPart],{type:'video/mp4'}));
 await ctx.runMutation(refs.record,{...lease,phase:'RAW',storageId});
}
