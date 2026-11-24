'use node';
import { createHash } from 'node:crypto';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { discoverOpenRouterModels } from '../src/lib/ai/model-discovery';
import { getModelForCapability, getFallbackModelsForCapability } from '../src/lib/ai/model-registry';
import { executeAITask } from '../src/lib/adapters/openrouter-adapter';
import { ACTION_CHECK_VERSION, ACTION_CHECK_OUTPUT_TOKENS, ACTION_CHECK_SCHEMA, actionCheckPrompt, quoteActionCheck } from '../src/lib/production/story-action-check';

import { checkedShotGrids } from './storyActionGridMedia';
import { GRID_CHECK_PREFIX, INLINE_VIDEO_MAX_BYTES } from '../src/lib/production/story-action-grid';

export const estimate=action({args:{takeId:v.id('shotVersions')},returns:v.any(),handler:async(ctx,args):Promise<any>=>{
 const data=await ctx.runQuery(internal.storyActionChecks.context,args);
 if(!process.env.OPENROUTER_API_KEY?.trim())throw new Error('Video checking is not configured.');
 const grids=data.byteSize>INLINE_VIDEO_MAX_BYTES;
 const catalog=await discoverOpenRouterModels({force:true,staleIfError:false});
 for(const id of [getModelForCapability('VALIDATION').id,...getFallbackModelsForCapability('VALIDATION')]){
  const model=catalog.find(m=>m.id===id);if(!model||grids&&(!model.inputModalities.includes('image')||!model.inputModalities.includes('audio')))continue;
  let quote;try{quote=quoteActionCheck(model);}catch{continue;}
  const requestKey=(grids?GRID_CHECK_PREFIX:'')+createHash('sha256').update(JSON.stringify([ACTION_CHECK_VERSION,data.projectId,data.actorUserId,data.requirementKey,data.checksum,id,quote])).digest('hex');
  const checkId=await ctx.runMutation(internal.storyActionChecks.saveQuote,{projectId:data.projectId,takeId:args.takeId,requirementKey:data.requirementKey,requestKey,model:id,checkVersion:ACTION_CHECK_VERSION,...quote});
  return {checkId,maximumCostUsd:quote.maximumCostUsd,model:id,sampledFrames:grids};
 }
 throw new Error('No configured model can inspect video with verified pricing.');
}});
export const run=action({args:{checkId:v.id('storyActionChecks')},returns:v.null(),handler:async(ctx,args)=>{
 const check=await ctx.runQuery(internal.storyActionChecks.quoteContext,args);
 if(check.completedAt)return null;
 let receipt=await ctx.runQuery(internal.providerTextRequests.inspect,{projectId:check.projectId,requestKey:check.requestKey});
 if(receipt){
  await ctx.runMutation(internal.storyActionChecks.bindReceipt,{...args,receiptId:receipt._id});
  if(receipt.status==='COMPLETED'){await ctx.runMutation(internal.storyActionChecks.complete,args);return null;}
  throw new Error('This check is already recorded. A pending request will not be purchased twice.');
 }
 if(check.expiresAt<Date.now())throw new Error('The check estimate expired. Review a new estimate.');
 const data=await ctx.runQuery(internal.storyActionChecks.context,{takeId:check.takeId});
 if(data.requirementKey!==check.requirementKey)throw new Error('The take changed. Review a fresh estimate.');
 const grids=check.requestKey.startsWith(GRID_CHECK_PREFIX);
 if(grids!==(data.byteSize>INLINE_VIDEO_MAX_BYTES))throw new Error('The video check method changed. Review a fresh estimate.');
 let messages:Parameters<typeof executeAITask>[1];
 if(grids){
  messages=await checkedShotGrids(ctx,data);
 }else{
  const blob=await ctx.storage.get(data.storageId);if(!blob||blob.size!==data.byteSize)throw new Error('The stored video changed.');
  const bytes=Buffer.from(await blob.arrayBuffer()),digest=createHash('sha256').update(bytes).digest();
  if(![digest.toString('hex'),digest.toString('base64')].includes(data.checksum))throw new Error('The stored video checksum changed.');
  messages=[{role:'user',content:[{type:'text',text:actionCheckPrompt(data.actions)},{type:'video_url',video_url:{url:'data:video/mp4;base64,'+bytes.toString('base64'),processing:'static'}}]}] as unknown as Parameters<typeof executeAITask>[1];
 }
 const reserved=grids?await ctx.runMutation((internal as any).storyActionChecks.reserveGrid,args):
  await ctx.runMutation(internal.providerTextRequests.reserve,{projectId:check.projectId,requestKey:check.requestKey,capability:'VISION_QC',model:check.model,estimatedCostUsd:check.maximumCostUsd});
 receipt=reserved.request;
 if(!receipt)throw new Error('Unable to reserve the check.');
 const receiptId=receipt._id;
 if(!grids)await ctx.runMutation(internal.storyActionChecks.bindReceipt,{...args,receiptId:receiptId});
 if(!reserved.created)throw new Error('This check is already running.');
 let submitted=false;
 try{
  const response=await executeAITask('VALIDATION',messages,{model:check.model,fallbackModels:[],maxRetries:0,retry:{maxRetries:0},maxTokens:ACTION_CHECK_OUTPUT_TOKENS,providerPriceCeiling:check.priceCeiling,structuredOutput:{name:'visible_action_check',schema:ACTION_CHECK_SCHEMA,strict:true},beforeChatSubmit:async()=>{await ctx.runMutation(internal.providerTextRequests.markSubmitting,{requestId:receiptId});submitted=true;}});
  await ctx.runMutation(internal.providerTextRequests.finish,{requestId:receiptId,submitted,...(response.content!==null?{content:response.content}:{}),model:response.modelUsed,providerRequestId:response.requestId,actualCostUsd:response.costUsd,usage:response.usage?{promptTokens:response.usage.promptTokens,completionTokens:response.usage.completionTokens,totalTokens:response.usage.totalTokens}:undefined});
  await ctx.runMutation(internal.storyActionChecks.complete,args);
 }catch(cause){
  const error=(cause&&typeof cause==='object'?cause:{}) as {status?:unknown;requestId?:unknown};
  const status=typeof error.status==='number'&&Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:null;
  const requestId=typeof error.requestId==='string'&&/^gen-[A-Za-z0-9_-]{1,180}$/.test(error.requestId)?error.requestId:undefined;
  await ctx.runMutation(internal.providerTextRequests.finish,{requestId:receiptId,submitted,errorCode:status?`ACTION_CHECK_HTTP_${status}`:'ACTION_CHECK_FAILED',...(requestId?{providerRequestId:requestId}:{})});
  throw new Error('The video check could not finish. Its receipt is saved; no automatic paid retry was sent.');
 }
 return null;
}});
