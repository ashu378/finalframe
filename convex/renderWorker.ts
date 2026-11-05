import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { record, renderWorkerEnabled } from './renderWorkerContracts';
import { assertGraphicsCertificate, expectedGraphicsCertificate } from '../renderer/src/templates/graphics-v2-certificate';
import { graphicsWorkerSupports, readGraphicsHandshake } from './renderGraphicsHandshake';
import { formatVariantRequirements } from '../renderer/src/output-variants';

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
    const graphicsCertificate = expectedGraphicsCertificate({ jobId: args.jobId, leaseId: prepared.leaseId, attempt: prepared.attempt, manifest: record(prepared.payload).manifest });
    if (graphicsCertificate || formatVariantRequirements(record(prepared.payload).manifest)) {
      try {
        const health = await fetch(new URL('/health', rendererUrl), { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5_000) });
        if (!health.ok) throw new Error('RENDER_GRAPHICS_CAPABILITY_UNAVAILABLE');
        if (!graphicsWorkerSupports(record(prepared.payload).manifest, await readGraphicsHandshake(health))) {
          await ctx.runMutation(jobs.recordDispatchFailure, { ...lease, errorCode: 'RENDER_GRAPHICS_CAPABILITY_REQUIRED', retryable: false });
          return null;
        }
      } catch {
        await ctx.runMutation(jobs.recordDispatchFailure, { ...lease, errorCode: 'RENDER_GRAPHICS_CAPABILITY_UNAVAILABLE', retryable: true });
        return null;
      }
    }
    if (graphicsCertificate) {
      try {
        if (!await ctx.runMutation(jobs.recordGraphicsHandshakeUnknown, lease)) return null;
      } catch { return null; }
    }
    try {
      const response = await fetch(`${rendererUrl.replace(/\/$/, '')}/render`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret },
        body: JSON.stringify(prepared.payload), signal: AbortSignal.timeout(20_000), redirect: 'error',
      });
      if (response.status !== 202) {
        // A proxy rejection cannot prove that a v2 worker did not accept the
        // request. Without the exact ACK certificate the durable barrier stays.
        if (graphicsCertificate) return null;
        await ctx.runMutation(jobs.recordDispatchFailure, { ...lease, errorCode: 'RENDER_HANDOFF_REJECTED', retryable: [408, 409, 429, 500, 502, 503, 504].includes(response.status) });
        return null;
      }
      const body = record(graphicsCertificate ? await readGraphicsHandshake(response) : await response.json());
      if (body.accepted !== true || body.jobId !== args.jobId) throw new Error('Renderer did not acknowledge this exact job.');
      if (graphicsCertificate) assertGraphicsCertificate(body.graphicsCertificate, graphicsCertificate);
      await ctx.runMutation(jobs.recordAcceptance, { ...lease, rendererJobId: args.jobId, ...(graphicsCertificate ? { graphicsCertificate } : {}) });
    } catch {
      if (graphicsCertificate) {
        // This worker may have accepted the request. Retain it privately and
        // wait for a certified callback; never send this uncertain request again.
        await ctx.runMutation(jobs.recordGraphicsHandshakeUnknown, lease).catch(() => undefined);
        return null;
      }
      // An unknown HTTP outcome retries the same frozen payload and render
      // lease. The renderer deduplicates by job and request fingerprint.
      await ctx.runMutation(jobs.recordDispatchFailure, { ...lease, errorCode: 'RENDER_HANDOFF_UNKNOWN', retryable: true }).catch(() => undefined);
    }
    return null;
  },
});
