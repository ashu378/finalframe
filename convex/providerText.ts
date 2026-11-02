'use node';

import { createHash } from 'node:crypto';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { executeAITask, type StructuredOutputInput, type AIResponse } from '../src/lib/adapters/openrouter-adapter';
import { discoverOpenRouterModels } from '../src/lib/ai/model-discovery';
import { getModelForCapability, getFallbackModelsForCapability } from '../src/lib/ai/model-registry';
import { AICapabilityError } from '../src/lib/ai/types';
import { quoteTextRequest } from './providerTextContracts';

/** Only text transport lives here. Plan creation and approval remain canonical
 * productions.ts mutations. No browser-selected model, price or secret. */
export const execute = action({
  args: {
    projectId: v.id('projects'), capability: v.union(v.literal('STRUCTURED_PLANNING'), v.literal('AI_BRAIN'), v.literal('VALIDATION')),
    messages: v.array(v.object({ role: v.union(v.literal('system'), v.literal('user'), v.literal('assistant')), content: v.string() })),
    structuredOutput: v.optional(v.object({ name: v.string(), schema: v.any(), strict: v.optional(v.boolean()), description: v.optional(v.string()) })),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    if (!args.messages.length || args.messages.length > 20) throw new Error('A bounded text request is required.');
    const requestKey = createHash('sha256').update(JSON.stringify(args)).digest('hex');
    const previous = await ctx.runQuery(internal.providerTextRequests.inspect, { projectId: args.projectId, requestKey });
    const projectResult = (row: any) => ({ content: row.content, modelUsed: row.model, model: row.model, requestId: row.providerRequestId ?? null, usage: row.usage ?? null, costUsd: row.actualCostUsd ?? null, providerTextRequestId: row._id });
    if (previous) {
      if (previous.status === 'COMPLETED') return projectResult(previous);
      throw new Error('This planning request is already recorded. A pending provider submission must be reconciled before retrying.');
    }
    if (!process.env.FINALFRAME_PAID_TEST_RUN?.trim()) throw new Error('PAID_PLANNING_DISABLED: the controlled test budget is not configured.');
    if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error('Planning is not configured in the backend environment.');
    const catalog = await discoverOpenRouterModels({ force: true, staleIfError: false });
    const candidates = [getModelForCapability(args.capability).id, ...getFallbackModelsForCapability(args.capability)];
    let selected: { model: string; quote: ReturnType<typeof quoteTextRequest> } | undefined;
    for (const id of [...new Set(candidates)]) {
      const model = catalog.find(row => row.id === id && row.inputModalities.includes('text') && row.outputModalities.includes('text') && (!args.structuredOutput || row.supportedParameters.includes('structured_outputs')));
      if (!model) continue;
      try { selected = { model: id, quote: quoteTextRequest(model, args) }; break; } catch { /* choose another eligible configured model before any paid POST */ }
    }
    if (!selected) throw new Error('No configured text model has verified capability, context and pricing for this request.');
    const result = await ctx.runMutation(internal.providerTextRequests.reserve, { projectId: args.projectId, requestKey, capability: args.capability, model: selected.model, estimatedCostUsd: selected.quote.estimatedCostUsd });
    if (!result.request) throw new Error('Unable to reserve this planning request.');
    const receipt = result.request;
    if (!result.created) {
      if (receipt.status === 'COMPLETED') return projectResult(receipt);
      throw new Error('This request is already pending. No duplicate provider request was sent.');
    }
    let submitted = false;
    let response: AIResponse;
    try {
      response = await executeAITask(args.capability, args.messages, {
        model: selected.model, fallbackModels: [], maxRetries: 0, retry: { maxRetries: 0 },
        structuredOutput: args.structuredOutput as StructuredOutputInput | undefined,
        maxTokens: selected.quote.maxTokens, providerPriceCeiling: selected.quote.priceCeiling,
        beforeChatSubmit: async () => {
          await ctx.runMutation(internal.providerTextRequests.markSubmitting, { requestId: receipt._id });
          submitted = true;
        },
      });
    } catch (error) {
      const code = error instanceof AICapabilityError ? error.code : 'TEXT_PROVIDER_FAILED';
      await ctx.runMutation(internal.providerTextRequests.finish, { requestId: receipt._id, submitted, errorCode: code });
      throw new Error(`Planning could not complete (${code}). No automatic paid retry was sent.`);
    }
    if (response.content === null) {
      await ctx.runMutation(internal.providerTextRequests.finish, { requestId: receipt._id, submitted, errorCode: 'EMPTY_TEXT_RESPONSE', actualCostUsd: response.costUsd, providerRequestId: response.requestId });
      throw new Error('The provider returned no planning content.');
    }
    await ctx.runMutation(internal.providerTextRequests.finish, { requestId: receipt._id, submitted, content: response.content, model: response.modelUsed, providerRequestId: response.requestId, usage: response.usage ? { promptTokens: response.usage.promptTokens, completionTokens: response.usage.completionTokens, totalTokens: response.usage.totalTokens } : undefined, actualCostUsd: response.costUsd });
    return { content: response.content, modelUsed: response.modelUsed, model: response.modelUsed, requestId: response.requestId ?? null, usage: response.usage ? { promptTokens: response.usage.promptTokens, completionTokens: response.usage.completionTokens, totalTokens: response.usage.totalTokens } : null, costUsd: response.costUsd ?? null, providerTextRequestId: receipt._id };
  },
});
