import type { ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { FunctionReference } from 'convex/server';
import { internal } from './_generated/api';
import { generateImage, synthesizeSpeech, transcribeAudio } from '../src/lib/adapters/openrouter-adapter';
import { quotePreparation, type PreparationKind } from '../src/lib/ai/preparation';
import { object } from './generationWorkerContracts';
const jobs = (internal as unknown as { generationJobs: Record<string, FunctionReference<any, 'internal', any, any>> }).generationJobs;
const voices = (internal as unknown as { voices: { resolveForSynthesis: FunctionReference<'query', 'internal', any, any> } }).voices;
function decode(value: string) { const binary = atob(value); return Uint8Array.from(binary, c => c.charCodeAt(0)); }
async function boundedAudio(url: string) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Recording is unavailable.');
  const reader = response.body?.getReader(); if (!reader) throw new Error('Recording is unavailable.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 15 * 1024 * 1024) { await reader.cancel(); throw new Error('Recording is too large.'); } chunks.push(next.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
/** Synchronous preparation results share durable generation ownership and the
 * pre-submit fence. A lost acknowledgement is held for reconciliation, never
 * retried as another purchase. */
export async function runPreparation(ctx: ActionCtx, input: any, lease: { jobId: Id<'generationJobs'>; leaseId: string }, beforeSubmit: () => Promise<void>) {
  const job = input.job;
  const request = object(input.request);
  const kind = request.preparationKind as PreparationKind;
  const quote = await quotePreparation({ kind, text: String(request.text || ''), clone: request.clone === true, durationSeconds: Number(request.durationSeconds) });
  if (quote.model !== job.model || quote.estimatedProviderCostUsd > Number(job.estimatedProviderCostUsd)) throw new Error('Preparation price or route changed. Create a new estimate.');
  const options = { maxRetries: 0, fallbackModels: [], allowDiscoveredModel: true, idempotencyKey: job.idempotencyKey, maxResponseBytes: 15 * 1024 * 1024, beforeMediaSubmit: beforeSubmit };
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
    const data = await boundedAudio(source.url);
    const format = ({ 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/flac': 'flac', 'audio/ogg': 'ogg', 'audio/webm': 'webm' } as Record<string, string>)[source.mimeType];
    if (!format) throw new Error('This recording format is unsupported.');
    const result = await transcribeAudio({ model: job.model, audio: { data, format } }, options);
    await ctx.runMutation(jobs.completePreparation, { ...lease, actualModel: result.modelUsed, text: result.text, segments: result.segments, providerRequestId: result.requestId, providerCostUsd: result.costUsd, usage: result.usage });
  } else {
    const voice = await ctx.runQuery(voices.resolveForSynthesis, { projectId: job.projectId, voiceId: request.targetVoiceId, use: 'SYNTHESIZE' });
    if (voice.mode === 'STOCK' && voice.provider !== 'openrouter') throw new Error('This voice provider is unavailable.');
    if (voice.mode === 'RECORDED' || (voice.mode === 'REFERENCE_CLONE') !== (request.clone === true)) throw new Error('Voice mode changed.');
    const result = await synthesizeSpeech({ model: job.model, input: String(request.text), ...(voice.mode === 'STOCK' ? { voice: voice.providerVoiceId } : { inputReferences: voice.references.map((reference: any) => ({ url: reference.url })) }), responseFormat: 'mp3' }, options);
    if (!result.contentType.startsWith('audio/') || !result.audio.byteLength || result.audio.byteLength > 15 * 1024 * 1024) throw new Error('Speech output is invalid.');
    const storageId = await ctx.storage.store(new Blob([result.audio], { type: result.contentType }));
    await ctx.runMutation(jobs.completePreparation, { ...lease, storageId, contentType: result.contentType, actualModel: result.modelUsed, providerRequestId: result.requestId, providerCostUsd: result.costUsd, usage: result.usage });
  }
}
