import type { ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { FunctionReference } from 'convex/server';
import { internal } from './_generated/api';
import { generateImage, synthesizeSpeech, transcribeAudio, generateMusic, generateSoundEffect, extractUsageAndCost } from '../src/lib/adapters/openrouter-adapter';
import { quotePreparation, assertReferenceVoiceQuote, type PreparationKind } from '../src/lib/ai/preparation';
import { object } from './generationWorkerContracts';
import {MUSIC_LIMITS,sameMusicQuote,musicQcError,assertMusicOutputProbe} from '../src/lib/ai/music';
import { SFX_LIMITS, sameSfxQuote, assertSfxConsent, assertSfxOutputProbe, sfxError } from '../src/lib/ai/sfx';
import { sha256Equal } from '../renderer/src/media/sha256';
import { decodePreparedImage, IMAGE_RESPONSE_LIMITS } from '../src/lib/ai/image-response';
const jobs = (internal as unknown as { generationJobs: Record<string, FunctionReference<any, 'internal', any, any>> }).generationJobs;
const voices = (internal as unknown as { voices: { resolveFrozenForSynthesis: FunctionReference<'query', 'internal', any, any> } }).voices;
async function boundedAudio(url: string, expected: Record<string, unknown>) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Recording is unavailable.');
  const reader = response.body?.getReader(); if (!reader) throw new Error('Recording is unavailable.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 15 * 1024 * 1024) { await reader.cancel(); throw new Error('Recording is too large.'); } chunks.push(next.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  if(expected.byteSize!==size||!sha256Equal(expected.checksum,checksum))throw new Error('Transcript download differs from its certified source.');
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
/** Synchronous preparation results share durable generation ownership and the
 * pre-submit fence. A lost acknowledgement is held for reconciliation, never
 * retried as another purchase. */
export async function runPreparation(ctx: ActionCtx, input: any, lease: { jobId: Id<'generationJobs'>; leaseId: string }, beforeSubmit: (livePreparationQuote: unknown) => Promise<void>) {
  const job = input.job;
  const request = object(input.request);
  const kind = request.preparationKind as PreparationKind;
  if(kind==='SFX'){await runSfxPreparation(ctx,input,lease,beforeSubmit);return;}
  if(kind==='MUSIC'){await runMusicPreparation(ctx,input,lease,beforeSubmit);return;}
  if(kind==='CHARACTER_REFERENCE'&&input.imageOutput){await finishImage(ctx,input,lease);return;}
  const quote = await quotePreparation({ kind, text: String(request.text || ''), clone: request.clone === true, durationSeconds: Number(request.durationSeconds),durationMeasurement:object(request.transcriptSource).durationMeasurement as 'DECODED_PCM_SAMPLES_V1'|undefined });
  if (quote.model !== job.model || quote.estimatedProviderCostUsd > Number(job.estimatedProviderCostUsd)) throw new Error('Preparation price or route changed. Create a new estimate.');
  if (request.clone === true && JSON.stringify(assertReferenceVoiceQuote(quote.referenceVoiceQuote)) !== JSON.stringify(assertReferenceVoiceQuote(object(request.quote).referenceVoiceQuote))) throw new Error('Reference voice endpoint certificate changed.');
  const options = { maxRetries: 0, fallbackModels: [], allowDiscoveredModel: true, idempotencyKey: job.idempotencyKey, maxResponseBytes: 15 * 1024 * 1024, beforeMediaSubmit: () => beforeSubmit(quote) };
  if (kind === 'CHARACTER_REFERENCE') {
    await generateImage({ model: job.model, prompt: String(request.text), resolution: '1K', n: 1, outputFormat: 'png' }, {...options,timeoutMs:IMAGE_RESPONSE_LIMITS.timeoutMs,imageDeadlineAt:Number(job.leaseExpiresAt)-15_000,
      onImageReceipt:(providerRequestId,kind)=>ctx.runMutation(jobs.recordImageReceipt,{...lease,providerRequestId,kind}),
      onImageCompleted:async(body,providerRequestId,actualModel)=>{const {bytes,contentType}=decodePreparedImage(body);const storageId=await ctx.storage.store(new Blob([Uint8Array.from(bytes).buffer],{type:contentType}));const normalized=extractUsageAndCost(body);await ctx.runMutation(jobs.recordImageOutput,{...lease,storageId,contentType,actualModel:actualModel!,...(providerRequestId?{providerRequestId}:{}),...(normalized.costUsd!==undefined&&normalized.costUsd>=0?{providerCostUsd:normalized.costUsd}:{}),...(normalized.usage?{usage:normalized.usage}:{})});}
    });
    await finishImage(ctx,await ctx.runQuery(jobs.getWorkerInput,lease),lease);
  } else if (kind === 'TRANSCRIPT') {
    const source = input.references.find((entry: any) => entry.assetId === request.sourceAssetId && entry.kind === 'audio');
    if (!source) throw new Error('Project recording is unavailable.');
    const data = await boundedAudio(source.url,object(request.transcriptSource));
    const format = typeof request.transcriptFormat==='string'&&['wav','mp3','m4a','flac','ogg','webm'].includes(request.transcriptFormat)?request.transcriptFormat:undefined;
    if (!format) throw new Error('This recording format is unsupported.');
    const result = await transcribeAudio({ model: job.model, audio: { data, format } }, options);
    await ctx.runMutation(jobs.completePreparation, { ...lease, actualModel: result.modelUsed, text: result.text, segments: result.segments, providerRequestId: result.requestId, providerCostUsd: result.costUsd, usage: result.usage });
  } else {
    if (!request.voiceVersionId || !request.voiceConfigHash || !request.voiceConfigSnapshot) throw new Error('VOICE_FROZEN_CONFIG_REQUIRED');
    const voice = await ctx.runQuery(voices.resolveFrozenForSynthesis, { projectId: job.projectId, voiceId: request.targetVoiceId,
      voiceVersionId: request.voiceVersionId, voiceConfigHash: request.voiceConfigHash, voiceConfigSnapshot: request.voiceConfigSnapshot,
      use: 'SYNTHESIZE', primaryVoiceSampleAssetId: request.primaryVoiceSampleAssetId });
    if (voice.mode === 'STOCK' && voice.provider !== 'openrouter') throw new Error('This voice provider is unavailable.');
    if (voice.mode === 'RECORDED' || (voice.mode === 'REFERENCE_CLONE') !== (request.clone === true)) throw new Error('Voice mode changed.');
    if (voice.mode === 'REFERENCE_CLONE' && (!request.primaryVoiceSampleAssetId || voice.references.length !== 1 || voice.references[0].assetId !== request.primaryVoiceSampleAssetId)) throw new Error('The explicit primary voice recording changed.');
    const result = await synthesizeSpeech({ model: job.model, input: String(request.text), ...(voice.mode === 'STOCK' ? { voice: voice.providerVoiceId } : { inputReferences: voice.references.map((reference: any) => ({ url: reference.url })) }), responseFormat: 'mp3' }, options);
    if (!result.contentType.startsWith('audio/') || !result.audio.byteLength || result.audio.byteLength > 15 * 1024 * 1024) throw new Error('Speech output is invalid.');
    const storageId = await ctx.storage.store(new Blob([result.audio], { type: result.contentType }));
    await ctx.runMutation(jobs.completePreparation, { ...lease, storageId, contentType: result.contentType, actualModel: result.modelUsed, providerRequestId: result.generationId || result.requestId, providerCostUsd: result.costUsd, usage: result.usage });
  }
}
async function finishImage(ctx:ActionCtx,input:any,lease:{jobId:Id<'generationJobs'>;leaseId:string}) {
  const saved=input.imageOutput;if(!saved)throw new Error('IMAGE_OUTPUT_UNAVAILABLE');
  await ctx.runMutation(jobs.completePreparation,{...lease,storageId:saved.storageId,contentType:saved.contentType,actualModel:saved.model,...(saved.providerRequestId?{providerRequestId:saved.providerRequestId}:{}),...(input.job.providerCostUsd!==undefined?{providerCostUsd:input.job.providerCostUsd}:{}),...(object(input.job.response).usage?{usage:object(input.job.response).usage}:{})});
}

async function boundedProbe(response: Response) { const reader = response.body?.getReader(); if (!reader)
    throw musicQcError('MUSIC_QC_UNAVAILABLE'); const chunks: Uint8Array[] = []; let size = 0; try {
    for (;;) {
        const next = await reader.read();
        if (next.done)
            break;
        size += next.value.length;
        if (size > 16384)
            throw musicQcError('MUSIC_QC_INVALID_RESPONSE');
        chunks.push(next.value);
    }
}
finally {
    await reader.cancel().catch(() => undefined);
} const bytes = new Uint8Array(size); let position = 0; for (const part of chunks) {
    bytes.set(part, position);
    position += part.length;
} try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw musicQcError('MUSIC_QC_INVALID_RESPONSE');} }
async function runMusicPreparation(ctx: ActionCtx, input: any, lease: {
    jobId: Id<'generationJobs'>;
    leaseId: string;
}, beforeSubmit: (quote: unknown) => Promise<void>) {
    const job = input.job, request = object(input.request);
    let saved = input.musicOutput;
    let cost = job.providerCostUsd;
    if (!saved) {
        const quote = await quotePreparation({ kind: 'MUSIC', text: String(request.text ?? '') });
        if (!sameMusicQuote(quote.musicQuote, object(request.quote).musicQuote) || quote.model !== job.model || quote.estimatedProviderCostUsd !== job.estimatedProviderCostUsd)
            throw new Error('MUSIC_QUOTE_CHANGED');
        const result = await generateMusic({ model: job.model, prompt: String(request.text) }, { maxRetries: 0, fallbackModels: [], idempotencyKey: job.idempotencyKey, timeoutMs: MUSIC_LIMITS.timeoutMs, beforeMediaSubmit: () => beforeSubmit(quote), onMusicAccepted: id => ctx.runMutation(jobs.recordMusicAcceptance, { ...lease, providerRequestId: id }) });
        const storageId = await ctx.storage.store(new Blob([Uint8Array.from(result.audio).buffer], { type: 'audio/mpeg' }));
        await ctx.runMutation(jobs.recordMusicOutput, { ...lease, storageId, providerRequestId: result.providerRequestId!, actualModel: result.modelUsed, generatedText: result.generatedText, ...(result.costUsd !== undefined && result.costUsd >= .04 ? { providerCostUsd: result.costUsd } : {}), ...(result.usage !== undefined ? { usage: result.usage } : {}) });
        const current = await ctx.runQuery(jobs.getWorkerInput, lease);
        saved = current.musicOutput;
        cost = current.job.providerCostUsd;
    }
    if (!saved?.url)
        throw new Error('MUSIC_OUTPUT_UNAVAILABLE');
    const base = process.env.RENDER_WORKER_URL?.trim(), secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim();
    if (!base || !secret)
        throw musicQcError('MUSIC_QC_UNAVAILABLE');
    const response = await fetch(base.replace(/\/$/, '') + '/media/probe', { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret }, body: JSON.stringify({ kind: 'audio', url: saved.url, verifyAudioDuration: true, checksum: saved.checksum, byteSize: saved.byteSize }), redirect: 'error', signal: AbortSignal.timeout(70000) }).catch(()=>{throw musicQcError('MUSIC_QC_UNAVAILABLE');});
    if (!response.ok) {
        await response.body?.cancel();
        throw musicQcError([408,429].includes(response.status)||response.status>=500?'MUSIC_QC_UNAVAILABLE':'MUSIC_QC_AUTHORITY_DENIED');
    }
    const probe = await boundedProbe(response).catch(error=>{if(error?.code)throw error;throw musicQcError('MUSIC_QC_UNAVAILABLE');});
    assertMusicOutputProbe(probe,saved);
    await ctx.runMutation(jobs.completePreparation, { ...lease, storageId: saved.storageId, contentType: 'audio/mpeg', actualModel: job.model, providerRequestId: saved.providerRequestId, providerCostUsd: cost, musicProbe: probe });
}

async function boundedSfxProbe(response:Response) {
  const reader=response.body?.getReader();if(!reader)throw sfxError('SFX_QC_UNAVAILABLE');
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>16384)throw sfxError('SFX_QC_INVALID_RESPONSE');chunks.push(next.value);}}finally{await reader.cancel().catch(()=>undefined);}
  const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw sfxError('SFX_QC_INVALID_RESPONSE');}
}
async function runSfxPreparation(ctx:ActionCtx,input:any,lease:{jobId:Id<'generationJobs'>;leaseId:string},beforeSubmit:(quote:unknown)=>Promise<void>) {
  const job=input.job,request=object(input.request);let saved=input.sfxOutput;
  if(!saved){
    const quote=await quotePreparation({kind:'SFX',text:String(request.text??'')});
    if(!sameSfxQuote(quote.sfxQuote,object(request.quote).sfxQuote)||quote.model!==job.model||quote.estimatedProviderCostUsd!==job.estimatedProviderCostUsd)throw sfxError('SFX_QUOTE_CHANGED');
    assertSfxConsent(object(request.quote).sfxEstimateConsent,String(job.productionId),request.text,quote.sfxQuote);
    await generateSoundEffect({model:job.model,prompt:String(request.text)}, {maxRetries:0,fallbackModels:[],idempotencyKey:job.idempotencyKey,timeoutMs:SFX_LIMITS.timeoutMs,maxResponseBytes:SFX_LIMITS.maxBytes,sfxDeadlineAt:Number(job.leaseExpiresAt)-15000,beforeMediaSubmit:()=>beforeSubmit(quote),
      onSfxReceipt:receipt=>ctx.runMutation(jobs.recordSfxReceipt,{...lease,...receipt}),
      onSfxCompleted:async result=>{const storageId=await ctx.storage.store(new Blob([Uint8Array.from(result.audio).buffer],{type:'audio/mpeg'}));await ctx.runMutation(jobs.recordSfxOutput,{...lease,storageId,actualModel:result.modelUsed,...(result.generationId?{providerRequestId:result.generationId}:{}),...(result.costUsd!==undefined&&Number.isFinite(result.costUsd)&&result.costUsd>=0?{providerCostUsd:result.costUsd}:{}),...(result.usage?{usage:result.usage}:{})});}
    });
    const current=await ctx.runQuery(jobs.getWorkerInput,lease);saved=current.sfxOutput;
  }
  if(!saved?.url)throw sfxError('SFX_OUTPUT_UNAVAILABLE');
  const base=process.env.RENDER_WORKER_URL?.trim(),secret=process.env.RENDER_WORKER_SHARED_SECRET?.trim();if(!base||!secret)throw sfxError('SFX_QC_UNAVAILABLE');
  const response=await fetch(base.replace(/\/$/,'')+'/media/probe',{method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify({kind:'audio',url:saved.url,verifyAudioDuration:true,maxAudioDurationSeconds:SFX_LIMITS.maxOriginalSeconds,checksum:saved.checksum,byteSize:saved.byteSize}),redirect:'error',signal:AbortSignal.timeout(70000)}).catch(()=>{throw sfxError('SFX_QC_UNAVAILABLE');});
  if(!response.ok){await response.body?.cancel();throw sfxError([408,429].includes(response.status)||response.status>=500?'SFX_QC_UNAVAILABLE':'SFX_QC_AUTHORITY_DENIED');}
  const probe=await boundedSfxProbe(response).catch(error=>{if(error?.code)throw error;throw sfxError('SFX_QC_UNAVAILABLE');});assertSfxOutputProbe(probe,saved);
  await ctx.runMutation(jobs.completePreparation,{...lease,storageId:saved.storageId,contentType:'audio/mpeg',actualModel:job.model,...(saved.providerRequestId?{providerRequestId:saved.providerRequestId}:{}),sfxProbe:probe});
}
