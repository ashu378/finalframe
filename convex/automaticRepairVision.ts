'use node';
import { createHash } from 'node:crypto';
import { ConvexError, v } from 'convex/values';
import { internalAction, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { discoverOpenRouterModels } from '../src/lib/ai/model-discovery';
import { getModelForCapability, getFallbackModelsForCapability } from '../src/lib/ai/model-registry';
import { executeAITask } from '../src/lib/adapters/openrouter-adapter';
import { quoteActionCheck, ACTION_CHECK_OUTPUT_TOKENS } from '../src/lib/production/story-action-check';
import { discoveryMessages, verifyDiscovery, REPAIR_DISCOVERY_SCHEMA, REPAIR_DISCOVERY_VERSION, type RepairDiscoveryBrief } from '../src/lib/production/repair-source-vision';
import { sha256Equal } from '../renderer/src/media/sha256';

const contextRef = (internal as any).automaticPerformanceRepair.context;
const args = { takeId:v.id('shotVersions'), contextHash:v.string() };
type BoundVideo = {assetId:Id<'assets'>; storageId:Id<'_storage'>; checksum:string; byteSize:number; frameCount:number};
type Context = Omit<RepairDiscoveryBrief,'frameCount'> & {projectId:Id<'projects'>;base:BoundVideo;candidates:BoundVideo[];contextHash:string};
const fail = (message:string):never=>{throw new ConvexError(message);};
async function resolve(ctx:ActionCtx,takeId:Id<'shotVersions'>,hash:string):Promise<Context>{
  const data=await ctx.runQuery(contextRef,{takeId});
  if(!data || data.contextHash!==hash || !data.base || !data.candidates?.length || data.fps!==24)
    return fail('The approved footage or review changed. Get a fresh repair estimate.');
  return data;
}
async function currentQuote(){
  if(!process.env.OPENROUTER_API_KEY?.trim())return fail('Video checking is not configured.');
  const live=await discoverOpenRouterModels({force:true,staleIfError:false});
  for(const id of [getModelForCapability('VALIDATION').id,...getFallbackModelsForCapability('VALIDATION')]){
    const model=live.find(m=>m.id===id);
    if(!model?.inputModalities.includes('image'))continue;
    try {
      const quote=quoteActionCheck(model);
      if(quote.maximumCostUsd>0)return {model:id,...quote};
    } catch { /* The next configured model must have verified multimodal pricing. */ }
  }
  return fail('No configured visual reviewer supports these inputs with verified pricing.');
}
export const estimate=internalAction({args,returns:v.any(),handler:async(ctx,a)=>{
  await resolve(ctx,a.takeId,a.contextHash);
  return currentQuote();
}});

async function requireProviderHeadroom(maximum:number) {
  const key=process.env.OPENROUTER_API_KEY?.trim();
  if(!key)return fail('Video checking is not configured.');
  let data;
  try{
    const response=await fetch('https://openrouter.ai/api/v1/key',{redirect:'error',signal:AbortSignal.timeout(12_000),headers:{Authorization:'Bearer '+key}});
    if(!response.ok)throw new Error();
    data=(await response.json()).data;
  } catch {return fail('The provider allowance could not be checked. Try again later.');}
  // A null key limit means unlimited on the key; the local ledger still caps every purchase.
  if(!data || !('limit_remaining' in data))return fail('The provider allowance is unavailable.');
  const amounts=[data.limit_remaining,data.effective_budget?.remaining_usd,...(Array.isArray(data.budgets)?data.budgets.map((b:any)=>b.remaining_usd):[])].filter(n=>n!==null&&n!==undefined);
  if(amounts.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<maximum))return fail('The remaining provider allowance cannot cover this check.');
}

async function measuredSamples(ctx:ActionCtx, input:BoundVideo, frame:number|null){
  const worker=process.env.RENDER_WORKER_URL,secret=process.env.RENDER_WORKER_SHARED_SECRET;
  const url=await ctx.storage.getUrl(input.storageId);
  if(!worker||!secret||!url)return fail('Approved media is unavailable for visual inspection.');
  const kind=frame===null?'CANDIDATE':'CONTEXT';
  const resp=await fetch(worker.replace(/\/$/,'')+'/media/probe',{method:'POST',redirect:'error',signal:AbortSignal.timeout(70_000),
    headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},
    body:JSON.stringify({kind:'video',url,checksum:input.checksum,byteSize:input.byteSize,verifyVideoTiming:true,repairSample:{kind,...(frame===null?{}:{frame})}})});
  if(!resp.ok){await resp.body?.cancel();return fail('The editing worker could not prepare the approved frames. Try again later.');}
  const probe=await resp.json(),s=probe.repairSamples;
  const sheets=frame===null?Math.ceil(input.frameCount/24):1;
  if(!sha256Equal(probe.checksum,input.checksum)||probe.byteSize!==input.byteSize||s?.version!=='REPAIR_SAMPLES_V1'||
      s.kind!==kind||s.frameCount!==input.frameCount||s.firstFrame!==(frame??0)||s.stride!==(frame===null?3:1)||
      !Array.isArray(s.images)||s.images.length!==sheets||s.images.some((img:unknown)=>typeof img!=='string'||!img.startsWith('/9j/')||img.length>342_000)||
      s.images.reduce((n:number,img:string)=>n+img.length,0)>2_670_000)return fail('The worker returned inconsistent frames. No footage check was submitted.');
  return s.images as string[];
}
export const inspect=internalAction({
  args:{...args,candidateIndex:v.number(),model:v.string(),maximumCostUsd:v.number(),priceCeiling:v.object({prompt:v.number(),completion:v.number()})},
  returns:v.any(), handler:async(ctx,a):Promise<ReturnType<typeof verifyDiscovery>>=>{
    const data=await resolve(ctx,a.takeId,a.contextHash);
    if(!Number.isInteger(a.candidateIndex)||a.candidateIndex<0||a.candidateIndex>=3)return fail('Invalid approved candidate.');
    const candidate=data.candidates[a.candidateIndex];
    if(!candidate)return fail('The approved clip is unavailable.');
    const brief:RepairDiscoveryBrief={action:data.action,scene:data.scene,targetStartFrame:data.targetStartFrame,targetEndFrame:data.targetEndFrame,frameCount:candidate.frameCount};
    // Independent of list order, quote time, and operator. A second editor cannot rebuy the same observation.
    const requestKey=createHash('sha256').update(JSON.stringify([REPAIR_DISCOVERY_VERSION,data.projectId,
      data.base.checksum,candidate.checksum,brief,a.model])).digest('hex');
    const previous=await ctx.runQuery(internal.providerTextRequests.inspect,{projectId:data.projectId,requestKey});
    if(previous){
      if(previous.status==='COMPLETED'&&typeof previous.content==='string')return verifyDiscovery(brief,JSON.parse(previous.content));
      return fail('This source was already checked or submitted. Its receipt is saved for review.');
    }
    const fresh=await currentQuote();
    if(fresh.model!==a.model||fresh.maximumCostUsd!==a.maximumCostUsd||fresh.priceCeiling.prompt!==a.priceCeiling.prompt||
        fresh.priceCeiling.completion!==a.priceCeiling.completion)return fail('Visual reviewer pricing changed. Review a fresh estimate.');
    // Serialized on the shared worker before any paid request.
    const [reference]=await measuredSamples(ctx,data.base,data.targetStartFrame);
    const frames=await measuredSamples(ctx,candidate,null);
    const messages=discoveryMessages(brief,reference,frames);
    await requireProviderHeadroom(a.maximumCostUsd);
    await resolve(ctx,a.takeId,a.contextHash);
    const receipt=await ctx.runMutation(internal.providerTextRequests.reserve,{projectId:data.projectId,requestKey,capability:'VISION_QC',model:a.model,estimatedCostUsd:a.maximumCostUsd});
    if(!receipt.created||!receipt.request)return fail('This source check is already recorded.');
    const requestId=receipt.request._id;
    let submitted=false;
    try{
      const response=await executeAITask('VALIDATION',messages,{model:a.model,fallbackModels:[],maxRetries:0,retry:{maxRetries:0},
        providerPriceCeiling:a.priceCeiling,maxTokens:ACTION_CHECK_OUTPUT_TOKENS,
        structuredOutput:{name:'repair_source_discovery',strict:true,schema:REPAIR_DISCOVERY_SCHEMA},
        beforeChatSubmit:async()=>{await ctx.runMutation(internal.providerTextRequests.markSubmitting,{requestId});submitted=true;}});
      await ctx.runMutation(internal.providerTextRequests.finish,{requestId,submitted,model:response.modelUsed,providerRequestId:response.requestId,
        actualCostUsd:response.costUsd,...(response.content===null?{}:{content:response.content}),usage:response.usage?{promptTokens:response.usage.promptTokens,completionTokens:response.usage.completionTokens,totalTokens:response.usage.totalTokens}:undefined});
      if(!response.content)return fail('The visual reviewer returned no observations.');
      return verifyDiscovery(brief,JSON.parse(response.content));
    }catch(cause){
      const error=cause as {status?:unknown;requestId?:unknown};
      const safeId=typeof error?.requestId==='string'&&/^gen-[A-Za-z0-9_-]{1,180}$/.test(error.requestId)?error.requestId:undefined;
      await ctx.runMutation(internal.providerTextRequests.finish,{requestId,submitted,errorCode:'SOURCE_DISCOVERY_FAILED',...(safeId?{providerRequestId:safeId}:{})});
      return fail('The footage inspection could not finish. Its receipt is saved. No automatic paid retry was sent.');
    }
  },
});
