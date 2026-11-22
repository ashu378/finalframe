import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { ACTION_REGION_REPAIR_VERSION } from '../renderer/src/media/action-region-contract';
import { stableShotEstimate } from '../src/lib/generation/shot-estimate';

type ReadCtx = QueryCtx | MutationCtx;
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
export function storyRepairKey(takeId: Id<'shotVersions'>, priorJobId?: Id<'generationJobs'>) {
  return `story-repair:${takeId}${priorJobId ? `:retry:${priorJobId}` : ''}`;
}

/** Read-only proof of a local preparation failure, never a provider retry.
 * Zero/absent IDs alone are insufficient: both canonical reservations must
 * demonstrate release and every worker attempt must precede submission. */
export async function canRecoverUnsubmittedRegion(ctx: ReadCtx, job: Doc<'generationJobs'>, takeId: Id<'shotVersions'>) {
  const request = object(job.request), repair = object(request.storyRepair);
  if (process.env.FINALFRAME_ACTION_REGION_REPAIR_ENABLED !== 'true' || process.env.FINALFRAME_ACTION_WINDOW_REPAIR_ENABLED !== 'true' || job.operation !== 'SHOT_GENERATION' || job.provider !== 'openrouter' || job.status !== 'FAILED' || job.executionStage !== 'FAILED' || job.errorCode !== 'ACTION_WINDOW_MEDIA_INVALID' || !job.completedAt || job.leaseId || job.leaseExpiresAt || job.submissionStartedAt !== undefined || job.providerJobId !== undefined || job.providerRequestId !== undefined || job.providerCostUsd !== undefined && job.providerCostUsd !== 0 || job.actualCost !== undefined && job.actualCost !== 0 || Object.keys(object(job.response)).length || request.storyRepairTakeId !== takeId || repair.sourceTakeId !== takeId || repair.approachVersion !== ACTION_REGION_REPAIR_VERSION || !repair.region || !job.shotVersionId || !job.canonicalReservationId || !job.providerBudgetReservationId) return false;
  const [source, failedTake, credit, provider] = await Promise.all([ctx.db.get(takeId), ctx.db.get(job.shotVersionId), ctx.db.get(job.canonicalReservationId), ctx.db.get(job.providerBudgetReservationId)]);
  if (!source || source.status !== 'COMPLETED' || source.projectId !== job.projectId || source.productionId !== job.productionId || source.productionVersionId !== job.productionVersionId || source.shotId !== job.shotId || !failedTake || failedTake.status !== 'FAILED' || failedTake.projectId !== job.projectId || failedTake.productionId !== job.productionId || failedTake.productionVersionId !== job.productionVersionId || failedTake.shotId !== job.shotId || failedTake.studioExternalId !== job.studioExternalId || failedTake.assetId || failedTake.actualCost !== undefined && failedTake.actualCost !== 0 || stableShotEstimate(object(failedTake.contextSnapshot).request) !== stableShotEstimate(job.request)) return false;
  if (!credit || credit.generationJobId !== job._id || credit.studioExternalId !== job.studioExternalId || !Number.isSafeInteger(credit.amount) || credit.amount <= 0 || !provider || provider.jobId !== job._id || provider.studioExternalId !== job.studioExternalId || provider.status !== 'RELEASED' || provider.actualMicros !== 0) return false;
  const entries = await ctx.db.query('ledger').withIndex('by_reservation', q => q.eq('reservationId', credit._id)).take(4);
  if (entries.length !== 2 || entries.some(entry => entry.studioExternalId !== job.studioExternalId || entry.sourceType !== 'RESERVATION' || entry.sourceId !== String(credit._id)) || entries.filter(entry => entry.entryType === 'RESERVE' && entry.amount === -credit.amount).length !== 1 || entries.filter(entry => entry.entryType === 'RELEASE' && entry.amount === credit.amount).length !== 1) return false;
  if (job.reservationId) { const legacy = await ctx.db.get(job.reservationId); if (!legacy || legacy.generationJobId !== job._id || legacy.studioExternalId !== job.studioExternalId || legacy.status !== 'RELEASED') return false; }
  if (await ctx.db.query('provenance').withIndex('by_generation_job', q => q.eq('generationJobId', job._id)).first()) return false;
  const attempts = await ctx.db.query('attempts').withIndex('by_job', q => q.eq('generationJobId', job._id)).take(9);
  if (!attempts.length || attempts.length > 8 || attempts.length !== job.attemptCount || attempts.some(attempt => attempt.status !== 'FAILED' || attempt.errorCode !== 'ACTION_WINDOW_MEDIA_INVALID' || attempt.providerJobId !== undefined || attempt.providerRequestId !== undefined || Object.keys(object(attempt.response)).length || attempt.studioExternalId !== job.studioExternalId)) return false;
  return true;
}

/** Called by canonical estimate AND confirmation, including direct callers. */
export async function requireStoryRepairRecovery(ctx: ReadCtx, args: { takeId: Id<'shotVersions'>; priorJobId: unknown; idempotencyKey: string; projectId: Id<'projects'>; productionId: Id<'productions'>; productionVersionId: Id<'productionVersions'>; shotId: Id<'shots'>; proof: unknown }) {
  if (args.priorJobId === undefined) {
    if (args.idempotencyKey !== storyRepairKey(args.takeId)) throw new Error('ACTION_REGION_RECOVERY_REVIEW_REQUIRED');
    return;
  }
  const id = typeof args.priorJobId === 'string' ? ctx.db.normalizeId('generationJobs', args.priorJobId) : null;
  const job = id ? await ctx.db.get(id) : null;
  if (!job || args.idempotencyKey !== storyRepairKey(args.takeId, job._id) || job.projectId !== args.projectId || job.productionId !== args.productionId || job.productionVersionId !== args.productionVersionId || job.shotId !== args.shotId || !await canRecoverUnsubmittedRegion(ctx, job, args.takeId) || stableShotEstimate(object(job.request).storyRepair) !== stableShotEstimate(args.proof)) throw new Error('ACTION_REGION_RECOVERY_REVIEW_REQUIRED');
}

export async function latestStoryRepairJob(ctx: ReadCtx, takeId: Id<'shotVersions'>) {
  let job = await ctx.db.query('generationJobs').withIndex('by_idempotency', q => q.eq('idempotencyKey', storyRepairKey(takeId))).unique();
  for (let depth = 0; job && depth < 8; depth++) {
    const next = await ctx.db.query('generationJobs').withIndex('by_idempotency', q => q.eq('idempotencyKey', storyRepairKey(takeId, job!._id))).unique();
    if (!next) return job;
    if (next.projectId !== job.projectId || next.productionId !== job.productionId || next.shotId !== job.shotId || object(next.request).storyRepairRetryOfJobId !== job._id || depth === 7) throw new Error('ACTION_REGION_RECOVERY_REVIEW_REQUIRED');
    job = next;
  }
  return job;
}
