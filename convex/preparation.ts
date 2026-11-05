import { action,query } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import type { FunctionReference } from 'convex/server';
import { quotePreparation, type PreparationKind } from '../src/lib/ai/preparation';
import {assertSfxConsent,sfxRequestHash,validateSfxPrompt} from '../src/lib/ai/sfx';
const sfxConsentValidator=v.object({requestHash:v.string(),quoteFingerprint:v.string(),maximumProviderHoldUsd:v.number()});
const jobs: Record<string, FunctionReference<any, 'internal', any, any>> = (internal as unknown as { generationJobs: Record<string, FunctionReference<any, 'internal', any, any>> }).generationJobs;

export const create = action({
  args: { productionId: v.id('productions'), kind: v.union(v.literal('CHARACTER_REFERENCE'), v.literal('NARRATION'), v.literal('VOICE_PREVIEW'), v.literal('TRANSCRIPT'),v.literal('MUSIC'),v.literal('SFX')), text: v.optional(v.string()), voiceId: v.optional(v.id('voices')),voiceVersionId:v.optional(v.id('voiceVersions')), primaryVoiceSampleAssetId: v.optional(v.id('assets')), sourceAssetId: v.optional(v.id('assets')), idempotencyKey: v.string(), sfxEstimateConsent:v.optional(sfxConsentValidator) },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    if(args.kind==='SFX'&&process.env.FINALFRAME_SFX_PREPARATION_ENABLED!=='true')throw new Error('Sound effect generation is not enabled.');
    if(args.kind!=='SFX'&&args.sfxEstimateConsent)throw new Error('SFX_ESTIMATE_REVIEW_REQUIRED');
    if(args.kind==='MUSIC'&&process.env.FINALFRAME_MUSIC_PREPARATION_ENABLED!=='true')throw new Error('Music generation is not enabled.');
    if (process.env.FINALFRAME_PREPARATION_ENABLED !== 'true') throw new Error('Preparation is not configured yet.');
    if(args.voiceVersionId&&!args.voiceId)throw new Error('Select the project voice owning this version.');
    if (!['NARRATION','VOICE_PREVIEW'].includes(args.kind) && (args.voiceId || args.primaryVoiceSampleAssetId) || args.kind !== 'TRANSCRIPT' && args.sourceAssetId) throw new Error('Choose only the sources used by this preparation type.');
    const context = await ctx.runQuery(jobs.preparationContext, { productionId: args.productionId, voiceId: args.voiceId,voiceVersionId:args.voiceVersionId, primaryVoiceSampleAssetId: args.primaryVoiceSampleAssetId, sourceAssetId: args.sourceAssetId });
    const text = (args.text || '').trim();
    if (text.length > 4000 || (args.kind !== 'TRANSCRIPT' && !text)) throw new Error('Use between one and 4000 characters.');
    const clone = context.voice?.mode === 'REFERENCE_CLONE';
    if (context.voice?.mode === 'RECORDED') throw new Error('Use the original recording directly; recorded voices do not enable cloning.');
    if (clone) {
      if (!args.voiceId || !args.primaryVoiceSampleAssetId) throw new Error('Choose an explicit primary recording for narration.');
      const audio = (internal as unknown as { audioCertificates: Record<string, FunctionReference<any, 'internal', any, any>> }).audioCertificates;
      await ctx.runAction(audio.prepareVoiceSample, { projectId: context.projectId, voiceId: args.voiceId, primaryVoiceSampleAssetId: args.primaryVoiceSampleAssetId });
    } else if (args.primaryVoiceSampleAssetId) throw new Error('Only reference voices use a primary recording.');
    let durationSeconds: number | undefined;
    let durationMeasurement: 'DECODED_PCM_SAMPLES_V1' | undefined;
    if (args.kind === 'TRANSCRIPT') {
      if (!context.source?.url) throw new Error('Select a project-owned recording.');
      const rendererUrl = process.env.RENDER_WORKER_URL?.trim();
      const secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim();
      if (!rendererUrl || !secret) throw new Error('Recording validation is unavailable.');
      const response = await fetch(`${rendererUrl.replace(/\/$/, '')}/media/probe`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret }, body: JSON.stringify({ url: context.source.url, kind: 'audio', verifyAudioDuration:true, checksum:context.source.checksum,byteSize:context.source.byteSize }), redirect:'error', signal: AbortSignal.timeout(70_000) });
      if (!response.ok) throw new Error('Recording could not be validated.');
      const audio = (internal as unknown as {audioCertificates:Record<string,FunctionReference<any,'internal',any,any>>}).audioCertificates;
      const measured=await ctx.runMutation(audio.recordTranscriptProbe,{productionId:args.productionId,sourceAssetId:args.sourceAssetId,storageId:context.source.storageId,checksum:context.source.checksum,byteSize:context.source.byteSize,probe:await response.json()});
      durationSeconds=measured.durationSeconds;durationMeasurement=measured.durationMeasurement;
    }
    if(args.kind==='SFX')validateSfxPrompt(args.text);
    const quote = await quotePreparation({ kind: args.kind as PreparationKind, text, clone, durationSeconds,durationMeasurement });
    if(args.kind==='SFX'){const consent=assertSfxConsent(args.sfxEstimateConsent,String(args.productionId),text,quote.sfxQuote);Object.assign(quote,{sfxEstimateConsent:consent});}
    return ctx.runMutation(jobs.createPreparation, { productionId: args.productionId, kind: args.kind, text, targetVoiceId: args.voiceId,
      ...(context.voice?{voiceVersionId:context.voice.voiceVersionId,voiceConfigSnapshot:context.voice.voiceConfigSnapshot,voiceConfigHash:context.voice.voiceConfigHash}:{}),
      primaryVoiceSampleAssetId: args.primaryVoiceSampleAssetId, sourceAssetId: args.sourceAssetId, clone, durationSeconds, model: quote.model, capability: quote.capability, estimatedProviderCostUsd: quote.estimatedProviderCostUsd, quote, idempotencyKey: args.idempotencyKey });
  },
});

export const musicAvailability=query({args:{},returns:v.object({music:v.boolean(),sfx:v.boolean()}),handler:async()=>({music:process.env.FINALFRAME_PREPARATION_ENABLED==='true'&&process.env.FINALFRAME_GENERATION_WORKER_ENABLED==='true'&&process.env.FINALFRAME_MUSIC_PREPARATION_ENABLED==='true',sfx:process.env.FINALFRAME_PREPARATION_ENABLED==='true'&&process.env.FINALFRAME_GENERATION_WORKER_ENABLED==='true'&&process.env.FINALFRAME_SFX_PREPARATION_ENABLED==='true'})});

/** Explicit estimate button only: no job, reservation, scheduling or inference. */
export const previewSfx=action({
  args:{productionId:v.id('productions'),text:v.string()},
  returns:v.object({requestHash:v.string(),quoteFingerprint:v.string(),expiresAt:v.number(),maximumOriginalSeconds:v.literal(120),baseProviderCeilingUsd:v.number(),providerHoldUsd:v.number()}),
  handler:async(ctx,args)=>{
    if(process.env.FINALFRAME_PREPARATION_ENABLED!=='true'||process.env.FINALFRAME_GENERATION_WORKER_ENABLED!=='true'||process.env.FINALFRAME_SFX_PREPARATION_ENABLED!=='true')throw new Error('SFX_DISABLED');
    const text=validateSfxPrompt(args.text);
    await ctx.runQuery(jobs.preparationContext,{productionId:args.productionId});
    const prepared=await quotePreparation({kind:'SFX',text}),quote=prepared.sfxQuote!;
    return {requestHash:sfxRequestHash(String(args.productionId),text,quote),quoteFingerprint:quote.endpointFingerprint,expiresAt:quote.checkedAt+30000,maximumOriginalSeconds:120 as const,baseProviderCeilingUsd:quote.baseProviderCeilingUsd,providerHoldUsd:quote.reservedProviderUsd};
  }
});
