import { action,query } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import type { FunctionReference } from 'convex/server';
import { quotePreparation, type PreparationKind } from '../src/lib/ai/preparation';
const jobs: Record<string, FunctionReference<any, 'internal', any, any>> = (internal as unknown as { generationJobs: Record<string, FunctionReference<any, 'internal', any, any>> }).generationJobs;

export const create = action({
  args: { productionId: v.id('productions'), kind: v.union(v.literal('CHARACTER_REFERENCE'), v.literal('NARRATION'), v.literal('VOICE_PREVIEW'), v.literal('TRANSCRIPT'),v.literal('MUSIC'),v.literal('SFX')), text: v.optional(v.string()), voiceId: v.optional(v.id('voices')), primaryVoiceSampleAssetId: v.optional(v.id('assets')), sourceAssetId: v.optional(v.id('assets')), idempotencyKey: v.string() },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    if(args.kind==='SFX')throw new Error('Sound effect generation is not available through a verified route.');
    if(args.kind==='MUSIC'&&process.env.FINALFRAME_MUSIC_PREPARATION_ENABLED!=='true')throw new Error('Music generation is not enabled.');
    if (process.env.FINALFRAME_PREPARATION_ENABLED !== 'true') throw new Error('Preparation is not configured yet.');
    if (!['NARRATION','VOICE_PREVIEW'].includes(args.kind) && (args.voiceId || args.primaryVoiceSampleAssetId) || args.kind !== 'TRANSCRIPT' && args.sourceAssetId) throw new Error('Choose only the sources used by this preparation type.');
    const context = await ctx.runQuery(jobs.preparationContext, { productionId: args.productionId, voiceId: args.voiceId, primaryVoiceSampleAssetId: args.primaryVoiceSampleAssetId, sourceAssetId: args.sourceAssetId });
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
    const quote = await quotePreparation({ kind: args.kind as PreparationKind, text, clone, durationSeconds,durationMeasurement });
    return ctx.runMutation(jobs.createPreparation, { productionId: args.productionId, kind: args.kind, text, targetVoiceId: args.voiceId, primaryVoiceSampleAssetId: args.primaryVoiceSampleAssetId, sourceAssetId: args.sourceAssetId, clone, durationSeconds, model: quote.model, capability: quote.capability, estimatedProviderCostUsd: quote.estimatedProviderCostUsd, quote, idempotencyKey: args.idempotencyKey });
  },
});

export const musicAvailability=query({args:{},returns:v.object({music:v.boolean(),sfx:v.literal(false)}),handler:async()=>({music:process.env.FINALFRAME_PREPARATION_ENABLED==='true'&&process.env.FINALFRAME_GENERATION_WORKER_ENABLED==='true'&&process.env.FINALFRAME_MUSIC_PREPARATION_ENABLED==='true',sfx:false as const})});
