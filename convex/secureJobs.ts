/** Read-only compatibility surface. Generation authority belongs exclusively
 * to generationJobs.ts and its internal worker, including credit settlement. */
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireProjectAccess } from './authorization';
import { publicJob } from './generationWorkerContracts';

function legacyWriteDisabled(): never {
  throw new Error('LEGACY_GENERATION_READ_ONLY: use the canonical generation job workflow.');
}

export const create = mutation({
  args: { productionId: v.id('productions'), shotId: v.id('shots'), provider: v.string(), model: v.string(), request: v.any(), estimatedCost: v.number(), idempotencyKey: v.string(), correlationId: v.string() },
  returns: v.any(), handler: async () => legacyWriteDisabled(),
});
export const claim = mutation({
  args: { jobId: v.id('generationJobs'), claimToken: v.string() }, returns: v.any(), handler: async () => legacyWriteDisabled(),
});
export const complete = mutation({
  args: { jobId: v.id('generationJobs'), assetUrl: v.string(), response: v.any(), providerJobId: v.optional(v.string()), actualCost: v.optional(v.number()) },
  returns: v.any(), handler: async () => legacyWriteDisabled(),
});
export const fail = mutation({
  args: { jobId: v.id('generationJobs'), errorCode: v.string(), errorMessage: v.string() },
  returns: v.any(), handler: async () => legacyWriteDisabled(),
});
export const get = query({
  args: { jobId: v.id('generationJobs') }, returns: v.any(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error('Generation job not found.');
    const production = await ctx.db.get(job.productionId);
    if (!production?.projectId || (job.projectId && job.projectId !== production.projectId)) throw new Error('Project ownership is required.');
    await requireProjectAccess(ctx, production.projectId);
    return { job: publicJob(job), shot: job.shotId ? await ctx.db.get(job.shotId) : null, production };
  },
});
