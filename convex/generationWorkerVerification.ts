/** Private online-development verification. This module never imports a
 * provider adapter, performs an HTTP request, or enables the live worker. */
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { claimGenerationJob } from './generationJobs';
import { object, workerEnabled } from './generationWorkerContracts';
import { settleProviderBudget } from './providerBudget';
import { settleGenerationCreditsInTransaction } from './financial';
import { validateReviewedVideoJob } from './videoRouting';

const MARKER = 'finalframe-worker-online-verification-v1';
const keyArgs = { fixtureKey: v.string() };
const fixtureJobArgs = { ...keyArgs, jobId: v.id('generationJobs') };
const modules = internal as unknown as Record<string, Record<string, FunctionReference<any, 'internal', any, any>>>;
function enabled(fixtureKey: string) {
  if (workerEnabled() || process.env.FINALFRAME_DEV_FIXTURES !== 'true' || process.env.FINALFRAME_DEV_FIXTURE_ENV !== 'development' || !process.env.FINALFRAME_DEV_FIXTURE_KEY || fixtureKey !== process.env.FINALFRAME_DEV_FIXTURE_KEY) throw new Error('Online worker verification requires the private development fixture configuration and a disabled live worker.');
}
async function fixtureJob(ctx: MutationCtx | QueryCtx, jobId: Id<'generationJobs'>) {
  const job = await ctx.db.get(jobId);
  if (!job || !['fixture', 'openrouter'].includes(job.provider) || job.model !== 'fixture/no-network' || object(job.request).fixtureMarker !== MARKER) throw new Error('This is not an isolated worker verification job.');
  return job;
}

export const claimFixture = internalMutation({ args: fixtureJobArgs, returns: v.any(), handler: async (ctx, args) => {
  enabled(args.fixtureKey); await fixtureJob(ctx, args.jobId);
  return await claimGenerationJob(ctx, { jobId: args.jobId }, args.fixtureKey);
} });
export const makeDue = internalMutation({ args: { ...fixtureJobArgs, expireLease: v.optional(v.boolean()) }, returns: v.any(), handler: async (ctx, args) => {
  enabled(args.fixtureKey); const job = await fixtureJob(ctx, args.jobId);
  await ctx.db.patch(job._id, { nextPollAt: Date.now() - 1, nextAttemptAt: undefined, ...(args.expireLease ? { leaseExpiresAt: Date.now() - 1 } : {}) });
  return { leaseId: job.leaseId };
} });
/** Change only a private synthetic catalog after its queued quote was valid. */
export const changeQueuedRoute = internalMutation({
  args: { ...fixtureJobArgs, change: v.union(v.literal('MISSING_MODEL'), v.literal('PRICE_INCREASE')) },
  returns: v.any(),
  handler: async (ctx, args) => {
    enabled(args.fixtureKey);
    const job = await fixtureJob(ctx, args.jobId);
    const timestamp = Date.now();
    const fields = { studioExternalId: job.studioExternalId, provider: 'openrouter', modelId: job.model, name: 'Internal no-network route fixture', supportsTextToVideo: true, supportsImageReferences: false, supportsVideoReferences: false, supportsFirstFrame: false, supportsLastFrame: false, supportsVideoEdit: false, supportsVideoExtension: false, supportsAudio: false, supportedDurations: [5], supportedResolutions: ['720p'], supportedAspectRatios: ['16:9'], supportedParameters: ['duration', 'aspect_ratio', 'resolution'], estimatedCostPerSecond: 0.0001, available: true, lastSeenAt: timestamp, reviewedAt: timestamp };
    const existing = await ctx.db.query('videoModelCatalog').withIndex('by_studio_model', (q) => q.eq('studioExternalId', job.studioExternalId).eq('modelId', job.model)).unique();
    const catalogId = existing?._id ?? await ctx.db.insert('videoModelCatalog', fields);
    if (existing) await ctx.db.patch(existing._id, fields);
    const request = { ...object(job.request), path: 'AI_VIDEO', resolution: '720p', videoType: 'SOCIAL_CUTDOWN', task: 'GENERATE', qualityTier: 'STANDARD' };
    const quote = await validateReviewedVideoJob(ctx, { studioExternalId: job.studioExternalId, modelId: job.model, request });
    const reservation = job.providerBudgetReservationId ? await ctx.db.get(job.providerBudgetReservationId) : null;
    if (!reservation || Math.ceil(quote.estimatedCostUsd * 1_000_000) > reservation.estimatedMicros) throw new Error('The initial fixture quote must fit its reservation.');
    await ctx.db.patch(job._id, { provider: 'openrouter', request });
    await ctx.db.patch(catalogId, args.change === 'MISSING_MODEL' ? { available: false } : { estimatedCostPerSecond: 0.01 });
    return { originalCostUsd: quote.estimatedCostUsd };
  },
});
export const snapshot = internalQuery({ args: { ...keyArgs, jobIds: v.array(v.id('generationJobs')) }, returns: v.any(), handler: async (ctx, args) => {
  enabled(args.fixtureKey);
  const jobs: Array<{ job: Doc<'generationJobs'>; providerReservation: Doc<'providerBudgetReservations'> | null; ledger: Doc<'ledger'>[]; attempts: Doc<'attempts'>[] }> = [];
  for (const jobId of args.jobIds) {
    const job = await fixtureJob(ctx, jobId);
    const providerReservation = job.providerBudgetReservationId ? await ctx.db.get(job.providerBudgetReservationId) : null;
    const ledger = job.canonicalReservationId ? await ctx.db.query('ledger').withIndex('by_reservation', (q) => q.eq('reservationId', job.canonicalReservationId)).take(20) : [];
    const attempts = await ctx.db.query('attempts').withIndex('by_job', (q) => q.eq('generationJobId', jobId)).take(20);
    jobs.push({ job, providerReservation, ledger, attempts });
  }
  const wallet = jobs.length ? await ctx.db.query('credits').withIndex('by_studio', (q) => q.eq('studioExternalId', jobs[0].job.studioExternalId)).unique() : null;
  return { jobs, wallet };
} });
export const closeFixtureBudget = internalMutation({ args: { ...keyArgs, jobIds: v.array(v.id('generationJobs')) }, returns: v.null(), handler: async (ctx, args) => {
  enabled(args.fixtureKey);
  for (const jobId of args.jobIds) {
    const job = await fixtureJob(ctx, jobId);
    if (!job.providerBudgetReservationId) continue;
    const reservation = await ctx.db.get(job.providerBudgetReservationId);
    if (!reservation) continue;
    const budget = await ctx.db.get(reservation.budgetId);
    if (!budget?.key.startsWith('creator-worker-verification-')) throw new Error('This is not a fixture budget.');
    await settleProviderBudget(ctx, { reservationId: reservation._id, accepted: Boolean(job.submissionStartedAt), actualCostUsd: 0 });
    const latest = await ctx.db.get(budget._id);
    if (latest?.reservedMicros === 0) await ctx.db.patch(budget._id, { limitMicros: 0, status: 'CLOSED', updatedAt: Date.now() });
    await settleGenerationCreditsInTransaction(ctx, { jobId: job._id, outcome: job.submissionStartedAt ? 'COMMIT' : 'RELEASE' });
    if (!['COMPLETED', 'FAILED', 'CANCELED'].includes(job.status)) {
      await ctx.db.patch(job._id, { status: 'CANCELED', executionStage: 'FIXTURE_CLOSED', leaseId: undefined, leaseExpiresAt: undefined, completedAt: Date.now(), updatedAt: Date.now() });
      if (job.shotVersionId) await ctx.db.patch(job.shotVersionId, { status: 'CANCELED' });
    }
    const project = job.projectId ? await ctx.db.get(job.projectId) : null;
    if (!project || object(project.metadata).fixtureMarker !== MARKER || !project.externalId.startsWith('creator-worker-verification-')) throw new Error('Fixture project is invalid.');
    if (!project.deletedAt) {
      await ctx.db.patch(project._id, { deletedAt: Date.now(), status: 'DELETED', updatedAt: Date.now() });
      await ctx.db.insert('audit', { studioExternalId: job.studioExternalId, studioId: job.studioId, actorExternalId: 'internal-online-verification', action: 'FIXTURE_SOFT_DELETED', entityType: 'project', entityId: project._id, metadata: { retained: true, fixtureMarker: MARKER }, createdAt: Date.now() });
    }

  }
  return null;
} });

export const run = internalAction({
  args: { ...keyArgs, runId: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    enabled(args.fixtureKey);
    const checked: string[] = [];
    function assert(value: unknown, label: string): asserts value { if (!value) throw new Error(`Online worker verification failed: ${label}`); checked.push(label); }
    const fixture = await ctx.runMutation(modules.devFixtures.seedGenerationWorkerVerification, args);
    const [ingestId, ambiguousId, rejectedId, unavailableId, priceChangedId] = fixture.jobIds as Id<'generationJobs'>[];
    const fixtureArgs = (jobId: Id<'generationJobs'>) => ({ fixtureKey: args.fixtureKey, jobId });
    try {
      const concurrent = await Promise.all([
        ctx.runMutation(modules.generationWorkerVerification.claimFixture, fixtureArgs(ingestId)),
        ctx.runMutation(modules.generationWorkerVerification.claimFixture, fixtureArgs(ingestId)),
      ]);
      assert(concurrent.filter((result) => result.claimed).length === 1, 'concurrent online claims have one winner');
      const winning = concurrent.find((result) => result.claimed);
      const lease = { jobId: ingestId, leaseId: winning.leaseId };
      assert((await ctx.runMutation(modules.generationJobs.fenceSubmission, lease)).allowed, 'first submission fence wins');
      assert(!(await ctx.runMutation(modules.generationJobs.fenceSubmission, lease)).allowed, 'duplicate submission fence denied');
      await ctx.runMutation(modules.generationJobs.submit, { ...lease, providerJobId: `gen-vid-1-${String(args.runId).replace(/-/g, '').padEnd(20, 'I').slice(0, 20)}`, actualModel: 'fixture/no-network', providerRequestId: 'fixture-accepted-request' });
      await ctx.runMutation(modules.generationJobs.poll, { ...lease, done: true, providerCostUsd: 0 });
      const storageId = await ctx.storage.store(new Blob(['internal storage-contract fixture; not an encoded video'], { type: 'video/mp4' }));
      const output = await ctx.runMutation(modules.generationJobs.recordOutput, { ...lease, storageId, contentType: 'video/mp4', byteSize: 54 });
      const duplicate = await ctx.runMutation(modules.generationJobs.recordOutput, { ...lease, storageId, contentType: 'video/mp4', byteSize: 54 });
      assert(output.assetId === duplicate.assetId, 'canonical output ingestion is idempotent');
      await ctx.runMutation(modules.generationJobs.fail, { ...lease, errorCode: 'MEDIA_VALIDATION_FAILED', retryable: false });
      await ctx.runMutation(modules.generationJobs.fail, { ...lease, errorCode: 'MEDIA_VALIDATION_FAILED', retryable: false });
      const ambiguousClaim = await ctx.runMutation(modules.generationWorkerVerification.claimFixture, fixtureArgs(ambiguousId));
      const ambiguousLease = { jobId: ambiguousId, leaseId: ambiguousClaim.leaseId };
      await ctx.runMutation(modules.generationJobs.fenceSubmission, ambiguousLease);
      await ctx.runMutation(modules.generationJobs.fail, { ...ambiguousLease, errorCode: 'NETWORK_ERROR', ambiguous: true });
      let snapshot = await ctx.runQuery(modules.generationWorkerVerification.snapshot, { fixtureKey: args.fixtureKey, jobIds: fixture.jobIds });
      assert(snapshot.jobs[1].job.executionStage === 'RECONCILIATION_REQUIRED', 'ambiguous accepted submission cannot be replayed');
      assert(snapshot.jobs[1].providerReservation.status === 'RECONCILIATION_REQUIRED', 'unknown provider cost remains reserved');
      assert(!(await ctx.runMutation(modules.generationWorkerVerification.claimFixture, fixtureArgs(ambiguousId))).claimed, 'ambiguous submission cannot be claimed');
      const acceptedId = `gen-vid-2-${String(args.runId).replace(/-/g, '').padEnd(20, 'A').slice(0, 20)}`;
      await ctx.runMutation(modules.generationJobs.reconcileAcceptedSubmission, { jobId: ambiguousId, providerJobId: acceptedId, reason: 'Verified synthetic accepted ID for no-cost online transaction coverage.' });
      const resumed = await ctx.runMutation(modules.generationWorkerVerification.claimFixture, fixtureArgs(ambiguousId));
      const resumedLease = { jobId: ambiguousId, leaseId: resumed.leaseId };
      snapshot = await ctx.runQuery(modules.generationWorkerVerification.snapshot, { fixtureKey: args.fixtureKey, jobIds: fixture.jobIds });
      assert(snapshot.jobs[1].job.executionStage === 'POLL' && snapshot.jobs[1].job.providerJobId === acceptedId, 'reconciled accepted job resumes polling only');
      await ctx.runMutation(modules.generationJobs.poll, { ...resumedLease, done: false, providerCostUsd: 0 });
      assert(!(await ctx.runMutation(modules.generationWorkerVerification.claimFixture, fixtureArgs(ambiguousId))).claimed, 'persisted polling delay cannot be bypassed');
      await ctx.runMutation(modules.generationWorkerVerification.makeDue, fixtureArgs(ambiguousId));
      const recovery = await ctx.runMutation(modules.generationWorkerVerification.claimFixture, fixtureArgs(ambiguousId));
      const recoveryLease = { jobId: ambiguousId, leaseId: recovery.leaseId };
      await ctx.runMutation(modules.generationWorkerVerification.makeDue, { ...fixtureArgs(ambiguousId), expireLease: true });
      await ctx.runMutation(modules.generationJobs.expireLease, recoveryLease);
      const afterExpiry = await ctx.runMutation(modules.generationWorkerVerification.claimFixture, fixtureArgs(ambiguousId));
      assert(afterExpiry.claimed, 'expired accepted lease can resume');
      await ctx.runMutation(modules.generationJobs.fail, { jobId: ambiguousId, leaseId: afterExpiry.leaseId, errorCode: 'PROVIDER_GENERATION_FAILED', retryable: false });
      const rejected = await ctx.runMutation(modules.generationWorkerVerification.claimFixture, fixtureArgs(rejectedId));
      await ctx.runMutation(modules.generationJobs.fail, { jobId: rejectedId, leaseId: rejected.leaseId, errorCode: 'CATALOG_UNAVAILABLE', retryable: false, rejected: true });
      for (const [jobId, change] of [[unavailableId, 'MISSING_MODEL'], [priceChangedId, 'PRICE_INCREASE']] as const) {
        const claimed = await ctx.runMutation(modules.generationWorkerVerification.claimFixture, fixtureArgs(jobId));
        await ctx.runMutation(modules.generationWorkerVerification.changeQueuedRoute, { ...fixtureArgs(jobId), change });
        let denied = false;
        try { await ctx.runMutation(modules.generationJobs.fenceSubmission, { jobId, leaseId: claimed.leaseId }); }
        catch { denied = true; }
        assert(denied, change === 'MISSING_MODEL' ? 'model unavailable after queueing is denied before submission' : 'price increase cannot exceed the frozen reservation');
        await ctx.runMutation(modules.generationJobs.fail, { jobId, leaseId: claimed.leaseId, errorCode: 'ROUTE_CHANGED', retryable: false, rejected: true });
      }
      snapshot = await ctx.runQuery(modules.generationWorkerVerification.snapshot, { fixtureKey: args.fixtureKey, jobIds: fixture.jobIds });
      assert(snapshot.jobs[0].ledger.filter((entry: { entryType: string }) => entry.entryType === 'COMMIT').length === 1, 'repeated failure settles accepted credits once');
      assert(snapshot.jobs[1].ledger.filter((entry: { entryType: string }) => entry.entryType === 'COMMIT').length === 1, 'reconciliation preserves one credit settlement');
      assert(snapshot.jobs[2].ledger.filter((entry: { entryType: string }) => entry.entryType === 'RELEASE').length === 1, 'pre-submission failure releases credits once');
      assert(snapshot.jobs[2].providerReservation.status === 'RELEASED', 'pre-submission failure releases provider budget');
      assert([snapshot.jobs[2], snapshot.jobs[3], snapshot.jobs[4]].every((item: { providerReservation: { status: string }; job: { submissionStartedAt?: number } }) => item.providerReservation.status === 'RELEASED' && !item.job.submissionStartedAt), 'catalog or quote failures release funds without a submission fence');
      assert(snapshot.wallet.reserved === 0 && snapshot.wallet.balance === 980, 'fixture wallet settles exactly two takes and releases one');
      assert(snapshot.jobs.every((item: { attempts: unknown[] }) => item.attempts.length === 1), 'polling recovery does not create another generation attempt');
      return { ok: true, checks: checked, liveProviderCalls: 0, fixture, note: 'Online transactional verification only; the stored byte fixture was deliberately failed and is not a generated or validated MP4.' };
    } finally {
      await ctx.runMutation(modules.generationWorkerVerification.closeFixtureBudget, { fixtureKey: args.fixtureKey, jobIds: fixture.jobIds });
    }
  },
});
