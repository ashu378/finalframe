import { action } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import type { FunctionReference } from 'convex/server';
import { discoverStockVoices, selectStockVoice } from '../src/lib/ai/stock-voices';
const voiceRefs: Record<string, FunctionReference<any, 'internal', any, any>> = (internal as unknown as { voices: Record<string, FunctionReference<any, 'internal', any, any>> }).voices;

export const catalog = action({
  args: { projectId: v.id('projects') },
  returns: v.object({ choices: v.array(v.object({ selectionKey: v.string(), label: v.string() })), modelName: v.string() }),
  handler: async (ctx, args): Promise<{ choices: Array<{ selectionKey: string; label: string }>; modelName: string }> => {
    await ctx.runQuery(voiceRefs.stockBindingContext, { projectId: args.projectId, write: false });
    const catalog = await discoverStockVoices();
    return { modelName: catalog.modelName, choices: catalog.voices.map(({ selectionKey, label }) => ({ selectionKey, label })) };
  },
});

export const select = action({
  args: { projectId: v.id('projects'), voiceId: v.optional(v.id('voices')), name: v.string(), selectionKey: v.string(), idempotencyKey: v.string() }, returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    await ctx.runQuery(voiceRefs.stockBindingContext, { projectId: args.projectId, write: true });
    const catalog = await discoverStockVoices();
    const selected = selectStockVoice(catalog, args.selectionKey);
    return ctx.runMutation(voiceRefs.bindStockSelection, { projectId: args.projectId, voiceId: args.voiceId, name: args.name, selectionKey: selected.selectionKey, providerVoiceId: selected.providerVoiceId, modelId: catalog.modelId, fingerprint: catalog.fingerprint, checkedAt: catalog.checkedAt, idempotencyKey: args.idempotencyKey });
  },
});
