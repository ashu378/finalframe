import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { prepareRenderDispatch } from './renderJobs';
import { publicRenderJob, RENDER_FIXTURE_MARKER, RENDER_TERMINAL, renderWorkerEnabled } from './renderWorkerContracts';

const refs = internal as unknown as Record<string, Record<string, FunctionReference<any, 'internal', any, any>>>;
const fixtureArgs = { fixtureKey: v.string(), jobId: v.id('renderJobs') };
function enabled(key: string) {
  if (renderWorkerEnabled() || process.env.FINALFRAME_DEV_FIXTURES !== 'true' || process.env.FINALFRAME_DEV_FIXTURE_ENV !== 'development' || !process.env.FINALFRAME_DEV_FIXTURE_KEY || key !== process.env.FINALFRAME_DEV_FIXTURE_KEY) throw new Error('Private renderer verification is disabled.');
}
async function fixture(ctx: QueryCtx | MutationCtx, jobId: Id<'renderJobs'>) {
  const job = await ctx.db.get(jobId);
  const project = job?.projectId ? await ctx.db.get(job.projectId) : null;
  if (!job || !project || typeof project.metadata !== 'object' || project.metadata === null || (project.metadata as Record<string, unknown>).fixtureMarker !== RENDER_FIXTURE_MARKER) throw new Error('This is not an isolated renderer verification job.');
  return job;
}
export const prepare = internalMutation({ args: fixtureArgs, returns: v.any(), handler: async (ctx, args) => {
  enabled(args.fixtureKey); await fixture(ctx, args.jobId);
  return await prepareRenderDispatch(ctx, { jobId: args.jobId }, args.fixtureKey);
} });
export const makeDue = internalMutation({ args: { ...fixtureArgs, expireRender: v.optional(v.boolean()) }, returns: v.any(), handler: async (ctx, args) => {
  enabled(args.fixtureKey); const job = await fixture(ctx, args.jobId);
  await ctx.db.patch(job._id, { nextDispatchAt: undefined, dispatchLeaseExpiresAt: Date.now() - 1, ...(args.expireRender ? { leaseExpiresAt: Date.now() - 1 } : {}) });
  return { leaseId: job.leaseId };
} });
export const snapshot = internalQuery({ args: fixtureArgs, returns: v.any(), handler: async (ctx, args) => {
  enabled(args.fixtureKey); const job = await fixture(ctx, args.jobId);
  const receipts = await ctx.db.query('renderCallbackReceipts').withIndex('by_job', (q) => q.eq('jobId', job._id)).take(20);
  const exports = await ctx.db.query('exports').withIndex('by_render_job', (q) => q.eq('renderJobId', job._id)).take(20);
  return { job, publicJob: publicRenderJob(job), receipts, exports };
} });
export const finish = internalMutation({ args: { fixtureKey: v.string(), jobIds: v.array(v.id('renderJobs')) }, returns: v.null(), handler: async (ctx, args) => {
  enabled(args.fixtureKey);
  for (const jobId of args.jobIds) {
    const job = await fixture(ctx, jobId);
    if (!RENDER_TERMINAL.has(job.status)) await ctx.db.patch(job._id, { status: 'CANCELED', executionStage: 'CANCELED', leaseId: undefined, leaseExpiresAt: undefined, dispatchPayload: undefined, dispatchLeaseId: undefined, dispatchLeaseExpiresAt: undefined, updatedAt: Date.now() });
    const exports = await ctx.db.query('exports').withIndex('by_render_job', (q) => q.eq('renderJobId', jobId)).take(20);
    for (const row of exports) if (!RENDER_TERMINAL.has(row.status)) await ctx.db.patch(row._id, { status: 'CANCELED', progress: 0 });
    if (job.projectId) await ctx.db.patch(job.projectId, { deletedAt: Date.now(), updatedAt: Date.now() });
  }
  return null;
} });

/** Real online transactions with no HTTP renderer dispatch and no video output. */
export const run = internalAction({ args: { fixtureKey: v.string(), runId: v.string() }, returns: v.any(), handler: async (ctx, args) => {
  enabled(args.fixtureKey);
  const checked: string[] = [];
  function assert(value: unknown, label: string): asserts value { if (!value) throw new Error(`Online renderer verification failed: ${label}`); checked.push(label); }
  const seeded = await ctx.runMutation(refs.devFixtures.seedRenderWorkerVerification, args);
  const [jobId, secondJobId] = seeded.jobIds as Id<'renderJobs'>[];
  const jobArgs = (id = jobId) => ({ fixtureKey: args.fixtureKey, jobId: id });
  const snapshot = () => ctx.runQuery(refs.renderWorkerVerification.snapshot, jobArgs());
  const prepare = () => ctx.runMutation(refs.renderWorkerVerification.prepare, jobArgs());
  const due = (expireRender = false) => ctx.runMutation(refs.renderWorkerVerification.makeDue, { ...jobArgs(), expireRender });
  let first: any;
  let convexHttpChecks = 0;
  try {
    const claims = await Promise.all([prepare(), prepare()]);
    assert(claims.filter(Boolean).length === 1, 'concurrent online claims have exactly one dispatch winner');
    first = claims.find(Boolean);
    assert(first.attempt === 1 && first.payload.mode === 'production', 'approved canonical graphics manifest prepares without rendering');
    assert(await ctx.runMutation(refs.renderWorkerVerification.prepare, jobArgs(secondJobId)) === null, 'one global active render prevents concurrent host use');
    assert(first.idempotencyKey.endsWith(':attempt:1'), 'callback key is scoped to the actual render attempt');
    const initial = await snapshot();
    assert(!('leaseId' in initial.publicJob) && !('dispatchPayload' in initial.publicJob) && !('callbackIdempotencyKey' in initial.publicJob), 'public job projections omit worker authority and upload URLs');
    await ctx.runMutation(refs.renderJobs.recordDispatchFailure, { jobId, leaseId: first.leaseId, dispatchLeaseId: first.dispatchLeaseId, errorCode: 'RENDER_HANDOFF_UNKNOWN', retryable: true });
    await due();
    const retry = await prepare();
    assert(retry.leaseId === first.leaseId && retry.attempt === 1 && JSON.stringify(retry.payload) === JSON.stringify(first.payload), 'unknown HTTP acceptance retries the exact payload and lease');
    await ctx.runMutation(refs.renderJobs.recordAcceptance, { jobId, leaseId: retry.leaseId, dispatchLeaseId: 'stale-dispatch', rendererJobId: jobId });
    assert(!(await snapshot()).job.acceptedAt, 'stale dispatch acknowledgements cannot claim a current lease');
    await ctx.runMutation(refs.renderJobs.recordAcceptance, { jobId, leaseId: retry.leaseId, dispatchLeaseId: retry.dispatchLeaseId, rendererJobId: jobId });
    assert((await snapshot()).job.executionStage === 'AWAITING_CALLBACK' && await prepare() === null, 'accepted renderer work is not automatically resubmitted');
    const callback = { jobId, leaseId: retry.leaseId, event: 'FAILED', eventId: `${args.runId}:failed:1`, idempotencyKey: retry.idempotencyKey, projectId: seeded.projectId, eventType: 'render.failed', occurredAt: Date.now(), attempt: 1, payloadHash: `${args.runId}:hash:1`, errorCode: 'FIXTURE_FAILURE', retryable: true };
    const callbackUrl = `${process.env.CONVEX_SITE_URL?.replace(/\/$/, '')}/renderer/callback`;
    const unauthorized = await fetch(callbackUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    convexHttpChecks += 1;
    assert(unauthorized.status === 401, 'online HTTP callback rejects missing authentication');
    if (process.env.RENDER_WORKER_SHARED_SECRET) {
      const invalidSignature = await fetch(callbackUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': process.env.RENDER_WORKER_SHARED_SECRET, 'x-finalframe-renderer-signature': 'sha256=invalid' }, body: '{}' });
      convexHttpChecks += 1;
      assert(invalidSignature.status === 401, 'online HTTP callback rejects an invalid raw-body signature');
    }
    let denied = false;
    try { await ctx.runMutation(refs.renderJobs.applyRendererCallback, { ...callback, occurredAt: Date.now() - 20 * 60 * 1000 }); } catch { denied = true; }
    assert(denied, 'stale callbacks are rejected before any receipt');
    denied = false;
    try { await ctx.runMutation(refs.renderJobs.applyRendererCallback, { ...callback, attempt: 2 }); } catch { denied = true; }
    assert(denied, 'wrong-attempt callbacks are rejected');
    denied = false;
    try { await ctx.runMutation(refs.renderJobs.applyRendererCallback, { ...callback, event: 'COMPLETED', eventType: 'render.completed' }); } catch { denied = true; }
    assert(denied && (await snapshot()).receipts.length === 0, 'completion without canonical stored video rolls back its receipt');
    denied = false;
    try { await ctx.runMutation(refs.renderJobs.applyRendererCallback, { ...callback, leaseId: 'wrong-lease' }); } catch { denied = true; }
    assert(denied && (await snapshot()).receipts.length === 0, 'wrong-lease callbacks leave no receipt or side effect');
    const failed = await ctx.runMutation(refs.renderJobs.applyRendererCallback, callback);
    assert(failed.job.status === 'RETRYING' && !failed.job.dispatchPayload && !failed.job.acceptedAt, 'retryable render failure releases only the failed attempt');
    const duplicate = await ctx.runMutation(refs.renderJobs.applyRendererCallback, callback);
    assert(duplicate.duplicate === true && (await snapshot()).receipts.length === 1, 'exact callback replay has one immutable receipt and no duplicate effects');
    denied = false;
    try { await ctx.runMutation(refs.renderJobs.applyRendererCallback, { ...callback, payloadHash: 'modified-body' }); } catch { denied = true; }
    assert(denied, 'same-event replay with a modified body is rejected');
    denied = false;
    try { await ctx.runMutation(refs.renderJobs.applyRendererCallback, { ...callback, eventId: `${args.runId}:different-event` }); } catch { denied = true; }
    assert(denied, 'a second event cannot reuse an applied attempt key');
    await ctx.runMutation(refs.renderJobs.wake, { jobId });
    await due();
    const second = await prepare();
    assert(second.attempt === 2 && second.leaseId !== first.leaseId && second.idempotencyKey !== first.idempotencyKey, 'a failed render starts a distinct lease and callback key');
    denied = false;
    try { await ctx.runMutation(refs.renderJobs.applyRendererCallback, callback); } catch { denied = true; }
    assert(denied, 'old attempt callbacks cannot mutate a newer render');
    await due(true);
    await ctx.runMutation(refs.renderJobs.expireLease, { jobId, leaseId: second.leaseId });
    assert((await snapshot()).job.status === 'RETRYING', 'expired accepted or unacknowledged work recovers durably');
    await ctx.runMutation(refs.renderJobs.wake, { jobId }); await due();
    const third = await prepare();
    assert(third.attempt === 3, 'retry attempt count persists across recovery');
    await due(true); await ctx.runMutation(refs.renderJobs.expireLease, { jobId, leaseId: third.leaseId });
    const exhausted = await snapshot();
    assert(exhausted.job.status === 'FAILED' && exhausted.exports.every((row: Doc<'exports'>) => row.status === 'FAILED'), 'attempt exhaustion fails both render and asynchronous export');
    assert(!exhausted.exports.some((row: Doc<'exports'>) => row.storageId || row.status === 'COMPLETED'), 'no video artifact or completed export is fabricated');
    return { ok: true, checks: checked, count: checked.length, projectId: seeded.projectId, jobIds: seeded.jobIds, paidProviderCalls: 0, rendererCalls: 0, convexHttpChecks, mp4Rendered: false };
  } finally { await ctx.runMutation(refs.renderWorkerVerification.finish, { fixtureKey: args.fixtureKey, jobIds: seeded.jobIds }); }
} });
