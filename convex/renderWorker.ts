import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { record, renderWorkerEnabled } from './renderWorkerContracts';

const jobs = (internal as unknown as { renderJobs: Record<string, FunctionReference<'mutation', 'internal', any, any>> }).renderJobs;

/** One short authenticated handoff. The renderer responds 202 before doing
 * media work; durable leases and signed completion receipts remain in Convex. */
export const run = internalAction({
  args: { jobId: v.id('renderJobs') }, returns: v.null(),
  handler: async (ctx, args) => {
    if (!renderWorkerEnabled()) return null;
    const rendererUrl = process.env.RENDER_WORKER_URL?.trim();
    const secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim();
    const callbackBase = process.env.CONVEX_SITE_URL?.trim();
    if (!rendererUrl || !secret || !callbackBase) {
      await ctx.runMutation(jobs.recordDispatchFailure, { jobId: args.jobId, errorCode: 'RENDER_CONFIGURATION_REQUIRED', retryable: false });
      return null;
    }
    let prepared;
    try { prepared = await ctx.runMutation(jobs.prepareForRenderer, args); }
    catch {
      await ctx.runMutation(jobs.recordDispatchFailure, { jobId: args.jobId, errorCode: 'RENDER_SOURCE_UNAVAILABLE', retryable: false });
      return null;
    }
    if (!prepared) return null;
    const lease = { jobId: args.jobId, leaseId: prepared.leaseId, dispatchLeaseId: prepared.dispatchLeaseId };
    try {
      const response = await fetch(`${rendererUrl.replace(/\/$/, '')}/render`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret },
        body: JSON.stringify(prepared.payload), signal: AbortSignal.timeout(20_000), redirect: 'error',
      });
      if (response.status !== 202) {
        await ctx.runMutation(jobs.recordDispatchFailure, { ...lease, errorCode: 'RENDER_HANDOFF_REJECTED', retryable: [408, 409, 429, 500, 502, 503, 504].includes(response.status) });
        return null;
      }
      const body = record(await response.json());
      if (body.accepted !== true || body.jobId !== args.jobId) throw new Error('Renderer did not acknowledge this exact job.');
      await ctx.runMutation(jobs.recordAcceptance, { ...lease, rendererJobId: args.jobId });
    } catch {
      // An unknown HTTP outcome retries the same frozen payload and render
      // lease. The renderer deduplicates by job and request fingerprint.
      await ctx.runMutation(jobs.recordDispatchFailure, { ...lease, errorCode: 'RENDER_HANDOFF_UNKNOWN', retryable: true }).catch(() => undefined);
    }
    return null;
  },
});
