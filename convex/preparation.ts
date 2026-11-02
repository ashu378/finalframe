import { action } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import type { FunctionReference } from 'convex/server';
import { quotePreparation, type PreparationKind } from '../src/lib/ai/preparation';
const jobs: Record<string, FunctionReference<any, 'internal', any, any>> = (internal as unknown as { generationJobs: Record<string, FunctionReference<any, 'internal', any, any>> }).generationJobs;

export const create = action({
  args: { productionId: v.id('productions'), kind: v.union(v.literal('CHARACTER_REFERENCE'), v.literal('NARRATION'), v.literal('VOICE_PREVIEW'), v.literal('TRANSCRIPT')), text: v.optional(v.string()), voiceId: v.optional(v.id('voices')), sourceAssetId: v.optional(v.id('assets')), idempotencyKey: v.string() },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    if (process.env.FINALFRAME_PREPARATION_ENABLED !== 'true') throw new Error('Preparation is not configured yet.');
    const context = await ctx.runQuery(jobs.preparationContext, { productionId: args.productionId, voiceId: args.voiceId, sourceAssetId: args.sourceAssetId });
    const text = (args.text || '').trim();
    if (text.length > 4000 || (args.kind !== 'TRANSCRIPT' && !text)) throw new Error('Use between one and 4000 characters.');
    const clone = context.voice?.mode === 'REFERENCE_CLONE';
    if (context.voice?.mode === 'RECORDED') throw new Error('Use the original recording directly; recorded voices do not enable cloning.');
    let durationSeconds: number | undefined;
    if (args.kind === 'TRANSCRIPT') {
      if (!context.source?.url) throw new Error('Select a project-owned recording.');
      const rendererUrl = process.env.RENDER_WORKER_URL?.trim();
      const secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim();
      if (!rendererUrl || !secret) throw new Error('Recording validation is unavailable.');
      const response = await fetch(`${rendererUrl.replace(/\/$/, '')}/media/probe`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret }, body: JSON.stringify({ url: context.source.url, kind: 'audio' }), signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error('Recording could not be validated.');
      const probe = await response.json() as { durationSeconds?: number; hasAudio?: boolean };
      if (probe.hasAudio !== true || !Number.isFinite(probe.durationSeconds) || probe.durationSeconds! <= 0 || probe.durationSeconds! > 60) throw new Error('Select a recording of at most 60 seconds.');
      durationSeconds = probe.durationSeconds;
    }
    const quote = await quotePreparation({ kind: args.kind as PreparationKind, text, clone, durationSeconds });
    return ctx.runMutation(jobs.createPreparation, { productionId: args.productionId, kind: args.kind, text, targetVoiceId: args.voiceId, sourceAssetId: args.sourceAssetId, clone, durationSeconds, model: quote.model, capability: quote.capability, estimatedProviderCostUsd: quote.estimatedProviderCostUsd, quote, idempotencyKey: args.idempotencyKey });
  },
});
