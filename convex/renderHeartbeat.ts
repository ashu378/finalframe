import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { heartbeatPatch } from './renderHeartbeatPolicy';
import { renderWorkerEnabled, RENDER_FIXTURE_MARKER } from './renderWorkerContracts';

const argsValidator = { jobId: v.id('renderJobs'), projectId: v.id('projects'), leaseId: v.string(), attempt: v.number(), occurredAt: v.number(), stage: v.union(v.literal('RENDERING'), v.literal('UPLOADING'), v.literal('CALLBACK_PENDING')), progress: v.optional(v.number()) };
const responseValidator = v.object({ leaseExpiresAt: v.number(), cancellationRequested: v.boolean(), pendingAcceptance: v.optional(v.boolean()) });
type HeartbeatInput = { jobId: Id<'renderJobs'>; projectId: Id<'projects'>; leaseId: string; attempt: number; occurredAt: number; stage: string; progress?: number };

async function applyForJob(ctx: MutationCtx, args: HeartbeatInput) {
  const job = await ctx.db.get(args.jobId);
  if (!job) throw new Error('Render job not found.');
  const timestamp = Date.now();
  let patch;
  try { patch = heartbeatPatch(job, args, timestamp); }
  catch (error) {
    if ((error as { code?: string }).code === 'HEARTBEAT_ACCEPTANCE_PENDING') return { leaseExpiresAt: job.leaseExpiresAt!, cancellationRequested: false, pendingAcceptance: true };
    throw error;
  }
  if (patch) {
    await ctx.db.patch(job._id, patch);
    await ctx.scheduler.runAfter(patch.leaseExpiresAt - timestamp + 1000, internal.renderJobs.expireLease, { jobId: job._id, leaseId: args.leaseId });
  }
  return { leaseExpiresAt: patch?.leaseExpiresAt ?? job.leaseExpiresAt!, cancellationRequested: false };
}

export const apply = internalMutation({
  args: argsValidator,
  returns: responseValidator,
  handler: async (ctx, args) => {
    if (!renderWorkerEnabled()) throw new Error('Renderer heartbeats are disabled.');
    return applyForJob(ctx, args);
  },
});

/** Isolated online transaction verification; never callable by a browser. */
export const applyFixture = internalMutation({
  args: { ...argsValidator, fixtureKey: v.string() }, returns: responseValidator,
  handler: async (ctx, args) => {
    if (renderWorkerEnabled() || process.env.FINALFRAME_DEV_FIXTURES !== 'true' || process.env.FINALFRAME_DEV_FIXTURE_ENV !== 'development' || !process.env.FINALFRAME_DEV_FIXTURE_KEY || args.fixtureKey !== process.env.FINALFRAME_DEV_FIXTURE_KEY) throw new Error('Private renderer verification is disabled.');
    const job = await ctx.db.get(args.jobId);
    const project = job?.projectId ? await ctx.db.get(job.projectId) : null;
    if (!project || typeof project.metadata !== 'object' || project.metadata === null || (project.metadata as Record<string, unknown>).fixtureMarker !== RENDER_FIXTURE_MARKER) throw new Error('Not an isolated render fixture.');
    return applyForJob(ctx, args);
  },
});
