import { mkdtemp,open,readFile,rm,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertProbeUrl } from './remote-probe.js';
import { sha256Equal,normalizeSha256 } from './sha256.js';
import { assertActionWindow,assertActionWindowProof,ACTION_WINDOW_MAX_BYTES } from './action-window-contract.js';
import { prepareActionWindow,composeActionWindow,prepareActionRegion,composeActionRegion } from './action-window.js';
import { assertActionRegion,assertActionRegionProof } from './action-region-contract.js';
const unavailable=()=>Object.assign(new Error('ACTION_WINDOW_WORKER_UNAVAILABLE'),{code:'ACTION_WINDOW_WORKER_UNAVAILABLE'});
export function actionWindowErrorStatus(error:unknown){const failure=object(error);return ['ACTION_WINDOW_WORKER_UNAVAILABLE','ENOSPC','EIO','EMFILE','ENFILE','EAGAIN','ETIMEDOUT'].includes(failure.code)||failure.message==='ACTION_WINDOW_TIMEOUT'||object(failure.details).timedOut===true?503:422;}
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'?v as Record<string,any>:{};
/** Authenticated worker handler. Only checksum-pinned canonical Convex files
 * are accepted; caller input can never choose a local path or remote output. */
export async function remoteActionWindow(value:unknown,options:{allowedHosts:readonly string[];fetch?:typeof fetch}){
 const p=object(value),window=assertActionWindow(p.window),compose=p.operation==='COMPOSE';
 const region=p.region===undefined?undefined:assertActionRegion(p.region);
 if(region&&JSON.stringify(region.window)!==JSON.stringify(window))throw new Error('ACTION_WINDOW_BINDING_CHANGED');
 if(!['PREPARE','COMPOSE'].includes(p.operation))throw new Error('ACTION_WINDOW_INVALID_OPERATION');
  if(p.trailingFramePolicy!==undefined&&(!compose||p.trailingFramePolicy!=='DROP_ONE_PROVIDER_TRAILING_FRAME'))throw new Error('ACTION_WINDOW_INVALID_FRAME_POLICY');
 const directory=await mkdtemp(join(tmpdir(),'finalframe-action-window-'));
 const download=async(input:unknown,name:string)=>{
  const source=object(input),url=assertProbeUrl(source.url,options.allowedHosts);
  if(!normalizeSha256(source.checksum)||!Number.isSafeInteger(source.byteSize)||source.byteSize<1||source.byteSize>ACTION_WINDOW_MAX_BYTES)throw new Error('ACTION_WINDOW_SOURCE_LIMIT');
  let response:Response;try{response=await(options.fetch??fetch)(url,{redirect:'error',signal:AbortSignal.timeout(30_000)});}catch{throw unavailable();}
  if(response.status===408||response.status===429||response.status>=500){await response.body?.cancel().catch(()=>undefined);throw unavailable();}
  if(!response.ok||!response.body||Number(response.headers.get('content-length'))>ACTION_WINDOW_MAX_BYTES){await response.body?.cancel().catch(()=>undefined);throw new Error('ACTION_WINDOW_DOWNLOAD_FAILED');}
  const path=join(directory,name),file=await open(path,'wx',0o600),reader=response.body.getReader(),hash=createHash('sha256');let size=0;
  try{while(true){const {done,value}=await reader.read().catch(()=>{throw unavailable();});if(done)break;size+=value.byteLength;if(size>ACTION_WINDOW_MAX_BYTES)throw new Error('ACTION_WINDOW_SOURCE_LIMIT');hash.update(value);await file.writeFile(value);}}finally{await reader.cancel().catch(()=>undefined);await file.close();}
  if(size!==source.byteSize||!sha256Equal(hash.digest('hex'),source.checksum))throw new Error('ACTION_WINDOW_SOURCE_CHANGED');return path;
 };
 try{
  const sourcePath=await download(p.source,'source.mp4'),outputPath=join(directory,'output.mp4');
  const args={sourcePath,outputPath,startSeconds:window.startSeconds,endSeconds:window.endSeconds};
  const result=region?(compose?await composeActionRegion({sourcePath,outputPath,region,repairPath:await download(p.repair,'repair.mp4'),trailingFramePolicy:p.trailingFramePolicy}):await prepareActionRegion({sourcePath,outputPath,region})):(compose?await composeActionWindow({...args,repairPath:await download(p.repair,'repair.mp4'),trailingFramePolicy:p.trailingFramePolicy}):await prepareActionWindow(args));
  if(region)assertActionRegionProof(region,result,compose);else assertActionWindowProof(window,result,compose);
  const size=(await stat(outputPath)).size;if(size<1||size>ACTION_WINDOW_MAX_BYTES)throw new Error('ACTION_WINDOW_OUTPUT_LIMIT');
  const bytes=await readFile(outputPath),{outputPath:_path,...proof}=result;
  return {bytes,proof:{...proof,checksum:createHash('sha256').update(bytes).digest('hex'),byteSize:bytes.length}};
 }finally{await rm(directory,{recursive:true,force:true});}
}
