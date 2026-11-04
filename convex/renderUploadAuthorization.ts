import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { resolveProjectAccessForActor } from './authorization';
import { movieEnabled, movieObject, movieWorkerEnabled } from './movieAuthority';
import { HEARTBEAT_FRESHNESS_MS, RENDER_ATTEMPT_MAX_MS } from './renderHeartbeatPolicy';
import { renderWorkerEnabled } from './renderWorkerContracts';
import { outputFormatForStoredManifest } from '../renderer/src/output-format';
import { validRenderUploadRenewal } from '../renderer/src/contracts/upload-renewal';

export const renew = internalMutation({
  args: {
    jobId: v.union(v.id('renderJobs'), v.id('movieMergeJobs')), projectId: v.id('projects'),
    leaseId: v.string(), attempt: v.number(), idempotencyKey: v.string(), identity: v.string(),
    byteSize: v.number(), checksum: v.string(), mimeType: v.string(), occurredAt: v.number(),
  },
  returns: v.object({ uploadUrl: v.string() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (!validRenderUploadRenewal(args) || Math.abs(now - args.occurredAt) > HEARTBEAT_FRESHNESS_MS) throw new Error('Invalid upload renewal.');
    const job = await ctx.db.get(args.jobId);
    if (!job || job.projectId !== args.projectId || !job.createdByUserId || job.leaseId !== args.leaseId ||
        job.callbackIdempotencyKey !== args.idempotencyKey || !job.dispatchPayload || job.acceptedAt === undefined ||
        job.acceptedAt > now || now - job.acceptedAt >= RENDER_ATTEMPT_MAX_MS || job.leaseExpiresAt === undefined ||
        !['PROCESSING', 'SUBMITTED'].includes(job.status) || job.executionStage === 'NEEDS_ATTENTION' ||
        (job.leaseExpiresAt <= now && job.executionStage !== 'RECONCILIATION_REQUIRED')) {
      throw new Error('The accepted upload attempt is unavailable.');
    }
    const access = await resolveProjectAccessForActor(ctx, args.projectId, job.createdByUserId, ['OWNER', 'EDITOR']);
    if (access.project.archivedAt || access.project.status === 'ARCHIVED') throw new Error('The upload project is archived.');
    const payload = movieObject(job.dispatchPayload);
    if (payload.jobId !== job._id || payload.attempt !== args.attempt || payload.leaseId !== args.leaseId ||
        payload.idempotencyKey !== args.idempotencyKey) throw new Error('The accepted dispatch no longer matches.');
    if ('movieVersionId' in job) {
      if (!movieEnabled() || !movieWorkerEnabled() || job.attempt !== args.attempt || job.planHash !== args.identity ||
          payload.planHash !== args.identity || payload.projectId !== args.projectId || payload.movieExportId !== job.movieExportId ||
          payload.movieVersionId !== job.movieVersionId || args.mimeType !== 'video/mp4') throw new Error('Invalid movie upload attempt.');
      const output = await ctx.db.get(job.movieExportId);
      if (!output || output.projectId !== args.projectId || output.movieVersionId !== job.movieVersionId ||
          output.mergeJobId !== job._id || output.planHash !== args.identity || !['MERGING', 'NEEDS_ATTENTION'].includes(output.status)) {
        throw new Error('The accepted movie export is unavailable.');
      }
    } else {
      const manifest = movieObject(payload.manifest);
      if (!renderWorkerEnabled() || job.dispatchAttempt !== args.attempt || job.manifestId !== args.identity ||
          manifest.manifestId !== args.identity || manifest.projectId !== args.projectId ||
          outputFormatForStoredManifest(manifest).mimeType !== args.mimeType) throw new Error('Invalid render upload attempt.');
    }
    const existing = await ctx.db.query('renderUploadRenewals').withIndex('by_job_attempt', q => q.eq('jobId', args.jobId).eq('attempt', args.attempt)).unique();
    if (existing) {
      if (existing.leaseId !== args.leaseId || existing.projectId !== args.projectId || existing.actorId !== job.createdByUserId || existing.idempotencyKey !== args.idempotencyKey ||
          existing.identity !== args.identity || existing.checksum !== args.checksum || existing.byteSize !== args.byteSize ||
          existing.mimeType !== args.mimeType || now - existing.issuedAt >= 60 * 60_000) throw new Error('The upload renewal no longer matches.');
      return { uploadUrl: existing.uploadUrl };
    }
    const { occurredAt: _occurredAt, ...facts } = args;
    void _occurredAt;
    const uploadUrl = await ctx.storage.generateUploadUrl();
    await ctx.db.insert('renderUploadRenewals', { ...facts, actorId: job.createdByUserId, uploadUrl, issuedAt: now });
    return { uploadUrl };
  },
});
