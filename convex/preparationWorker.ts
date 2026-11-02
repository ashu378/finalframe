import type { ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { FunctionReference } from 'convex/server';
import { internal } from './_generated/api';
import { generateImage, synthesizeSpeech, transcribeAudio, generateMusic } from '../src/lib/adapters/openrouter-adapter';
import { quotePreparation, assertReferenceVoiceQuote, type PreparationKind } from '../src/lib/ai/preparation';
import { object } from './generationWorkerContracts';
import {MUSIC_LIMITS,sameMusicQuote,musicQcError,assertMusicOutputProbe} from '../src/lib/ai/music';
import { sha256Equal } from '../renderer/src/media/sha256';
const jobs = (internal as unknown as { generationJobs: Record<string, FunctionReference<any, 'internal', any, any>> }).generationJobs;
const voices = (internal as unknown as { voices: { resolveForSynthesis: FunctionReference<'query', 'internal', any, any> } }).voices;
function decode(value: string) { const binary = atob(value); return Uint8Array.from(binary, c => c.charCodeAt(0)); }
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
  if(kind==='SFX')throw new Error('SFX_UNSUPPORTED');
  if(kind==='MUSIC'){await runMusicPreparation(ctx,input,lease,beforeSubmit);return;}
  const quote = await quotePreparation({ kind, text: String(request.text || ''), clone: request.clone === true, durationSeconds: Number(request.durationSeconds),durationMeasurement:object(request.transcriptSource).durationMeasurement as 'DECODED_PCM_SAMPLES_V1'|undefined });
  if (quote.model !== job.model || quote.estimatedProviderCostUsd > Number(job.estimatedProviderCostUsd)) throw new Error('Preparation price or route changed. Create a new estimate.');
  if (request.clone === true && JSON.stringify(assertReferenceVoiceQuote(quote.referenceVoiceQuote)) !== JSON.stringify(assertReferenceVoiceQuote(object(request.quote).referenceVoiceQuote))) throw new Error('Reference voice endpoint certificate changed.');
  const options = { maxRetries: 0, fallbackModels: [], allowDiscoveredModel: true, idempotencyKey: job.idempotencyKey, maxResponseBytes: 15 * 1024 * 1024, beforeMediaSubmit: () => beforeSubmit(quote) };
  if (kind === 'CHARACTER_REFERENCE') {
    const output = await generateImage({ model: job.model, prompt: String(request.text), resolution: '1K', n: 1, outputFormat: 'png' }, options);
    if (!output.b64_json || output.b64_json.length > 21 * 1024 * 1024) throw new Error('Bounded image data was not returned.');
    const contentType = output.images[0]?.mediaType || 'image/png';
    if (!contentType.startsWith('image/')) throw new Error('Image output is invalid.');
    const bytes = decode(output.b64_json);
    if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024) throw new Error('Image output exceeds the preparation limit.');
    const storageId = await ctx.storage.store(new Blob([bytes], { type: contentType }));
    await ctx.runMutation(jobs.completePreparation, { ...lease, storageId, contentType, actualModel: output.modelUsed, providerRequestId: output.requestId, providerCostUsd: output.costUsd, usage: output.usage });
  } else if (kind === 'TRANSCRIPT') {
    const source = input.references.find((entry: any) => entry.assetId === request.sourceAssetId && entry.kind === 'audio');
    if (!source) throw new Error('Project recording is unavailable.');
    const data = await boundedAudio(source.url,object(request.transcriptSource));
    const format = typeof request.transcriptFormat==='string'&&['wav','mp3','m4a','flac','ogg','webm'].includes(request.transcriptFormat)?request.transcriptFormat:undefined;
    if (!format) throw new Error('This recording format is unsupported.');
    const result = await transcribeAudio({ model: job.model, audio: { data, format } }, options);
    await ctx.runMutation(jobs.completePreparation, { ...lease, actualModel: result.modelUsed, text: result.text, segments: result.segments, providerRequestId: result.requestId, providerCostUsd: result.costUsd, usage: result.usage });
  } else {
    const voice = await ctx.runQuery(voices.resolveForSynthesis, { projectId: job.projectId, voiceId: request.targetVoiceId, use: 'SYNTHESIZE', primaryVoiceSampleAssetId: request.primaryVoiceSampleAssetId });
    if (voice.mode === 'STOCK' && voice.provider !== 'openrouter') throw new Error('This voice provider is unavailable.');
    if (voice.mode === 'RECORDED' || (voice.mode === 'REFERENCE_CLONE') !== (request.clone === true)) throw new Error('Voice mode changed.');
    if (voice.mode === 'REFERENCE_CLONE' && (!request.primaryVoiceSampleAssetId || voice.references.length !== 1 || voice.references[0].assetId !== request.primaryVoiceSampleAssetId)) throw new Error('The explicit primary voice recording changed.');
    const result = await synthesizeSpeech({ model: job.model, input: String(request.text), ...(voice.mode === 'STOCK' ? { voice: voice.providerVoiceId } : { inputReferences: voice.references.map((reference: any) => ({ url: reference.url })) }), responseFormat: 'mp3' }, options);
    if (!result.contentType.startsWith('audio/') || !result.audio.byteLength || result.audio.byteLength > 15 * 1024 * 1024) throw new Error('Speech output is invalid.');
    const storageId = await ctx.storage.store(new Blob([result.audio], { type: result.contentType }));
    await ctx.runMutation(jobs.completePreparation, { ...lease, storageId, contentType: result.contentType, actualModel: result.modelUsed, providerRequestId: result.generationId || result.requestId, providerCostUsd: result.costUsd, usage: result.usage });
  }
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
