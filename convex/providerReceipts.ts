/** Metadata-only reconciliation. Never imports or submits a generation adapter. */
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { settleProviderBudget } from './providerBudget';

const refs = (internal as unknown as { providerReceipts: Record<string, FunctionReference<any, 'internal', any, any>> }).providerReceipts;
const args = { jobId: v.id('generationJobs') };

export const context = internalQuery({
  args, returns: v.any(),
  handler: async (ctx, input) => {
    const job = await ctx.db.get(input.jobId);
    if (!job || job.operation !== 'PREPARATION' || job.modality !== 'AUDIO' || job.provider !== 'openrouter' || job.status !== 'COMPLETED' || job.providerCostUsd !== undefined || !job.providerBudgetReservationId || !/^gen-tts-\d+-[A-Za-z0-9]+$/.test(job.providerRequestId ?? '')) return null;
    return { receiptId: job.providerRequestId, model: job.model };
  },
});

export const record = internalMutation({
  args: { ...args, receiptId: v.string(), model: v.string(), costUsd: v.number() }, returns: v.null(),
  handler: async (ctx, input) => {
    const job = await ctx.db.get(input.jobId);
    if (!job || job.operation !== 'PREPARATION' || job.modality !== 'AUDIO' || job.provider !== 'openrouter' || job.status !== 'COMPLETED' || job.providerRequestId !== input.receiptId || !job.providerBudgetReservationId || !Number.isFinite(input.costUsd) || input.costUsd < 0 || !(input.model === job.model || input.model.startsWith(job.model + '-'))) throw new Error('Provider receipt does not match the completed speech job.');
    if (job.providerCostUsd !== undefined) {
      if (job.providerCostUsd !== input.costUsd) throw new Error('Provider receipt cost conflicts with an already settled job.');
      return null;
    }
    await settleProviderBudget(ctx, { reservationId: job.providerBudgetReservationId, accepted: true, actualCostUsd: input.costUsd });
    await ctx.db.patch(job._id, { providerCostUsd: input.costUsd, updatedAt: Date.now() });
    await ctx.db.insert('audit', { studioExternalId: job.studioExternalId, studioId: job.studioId, actorExternalId: 'internal-provider-receipt-reconciliation', action: 'PROVIDER_RECEIPT_RECONCILED', entityType: 'generationJob', entityId: job._id, metadata: { receiptId: input.receiptId, model: input.model, costUsd: input.costUsd, noGenerationSubmission: true }, createdAt: Date.now() });
    return null;
  },
});

export const reconcile = internalAction({
  args: { ...args, attempt: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, input) => {
    const attempt = input.attempt ?? 0;
    if (!Number.isInteger(attempt) || attempt < 0 || attempt > 4) throw new Error('Receipt reconciliation attempt is invalid.');
    const job = await ctx.runQuery(refs.context, { jobId: input.jobId });
    const secret = process.env.OPENROUTER_API_KEY?.trim();
    if (!job || !secret) return null;
    try {
      const response = await fetch('https://openrouter.ai/api/v1/generation?id=' + encodeURIComponent(job.receiptId), { headers: { Authorization: 'Bearer ' + secret }, signal: AbortSignal.timeout(10_000) });
      if (response.ok) {
        const body = await response.json() as { data?: { id?: string; model?: string; total_cost?: number } };
        const receipt = body.data;
        if (receipt && receipt.id === job.receiptId && typeof receipt.model === 'string' && typeof receipt.total_cost === 'number') {
          await ctx.runMutation(refs.record, { jobId: input.jobId, receiptId: receipt.id, model: receipt.model, costUsd: receipt.total_cost });
          return null;
        }
      }
    } catch {
      // A metadata failure never turns delivered audio into another purchase.
      // Unknown costs retain their original budget hold.
    }
    if (attempt < 4) await ctx.scheduler.runAfter(10_000 * (attempt + 1), refs.reconcile, { jobId: input.jobId, attempt: attempt + 1 });
    return null;
  },
});
