import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { requireProjectAccess, resolveProjectAccessForActor } from './authorization';
import { reserveProviderBudget, settleProviderBudget } from './providerBudget';

export const inspect = internalQuery({
  args: { actorId:v.optional(v.id('users')), projectId: v.id('projects'), requestKey: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    await (args.actorId?resolveProjectAccessForActor(ctx,args.projectId,args.actorId,['OWNER','EDITOR']):requireProjectAccess(ctx, args.projectId, ['OWNER', 'EDITOR']));
    const row = await ctx.db.query('providerTextRequests').withIndex('by_request_key', q => q.eq('requestKey', args.requestKey)).unique();
    if (row && row.projectId !== args.projectId) throw new Error('TEXT_REQUEST_PROJECT_MISMATCH');
    return row;
  },
});

type TextReservation = {actorId?:Id<'users'>;projectId:Id<'projects'>;requestKey:string;capability:string;model:string;estimatedCostUsd:number};
export async function reserveTextRequest(ctx:MutationCtx,args:TextReservation){
    const access = await (args.actorId?resolveProjectAccessForActor(ctx,args.projectId,args.actorId,['OWNER','EDITOR']):requireProjectAccess(ctx, args.projectId, ['OWNER', 'EDITOR']));
    const previous = await ctx.db.query('providerTextRequests').withIndex('by_request_key', q => q.eq('requestKey', args.requestKey)).unique();
    if (previous) {
      if (previous.projectId !== args.projectId) throw new Error('TEXT_REQUEST_PROJECT_MISMATCH');
      return { created: false, request: previous };
    }
    const reservationId = await reserveProviderBudget(ctx, { studioExternalId: access.project.studioExternalId, estimatedCostUsd: args.estimatedCostUsd, idempotencyKey: `text:${args.requestKey}` });
    const {actorId:_actor,...request}=args;
    const id = await ctx.db.insert('providerTextRequests', { ...request, studioExternalId: access.project.studioExternalId, createdByUserId: access.user._id, provider: 'openrouter', reservationId, status: 'RESERVED', createdAt: Date.now(), updatedAt: Date.now() });
    return { created: true, request: await ctx.db.get(id) };
}
export const reserve = internalMutation({
  args: { actorId:v.optional(v.id('users')), projectId: v.id('projects'), requestKey: v.string(), capability: v.string(), model: v.string(), estimatedCostUsd: v.number() },
  returns: v.any(),
  handler: reserveTextRequest,
});

export const markSubmitting = internalMutation({
  args: { requestId: v.id('providerTextRequests'), actorId:v.optional(v.id('users')) }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.requestId);
    if (!row || row.status !== 'RESERVED') throw new Error('TEXT_ALREADY_SUBMITTED');
    if(args.actorId && row.createdByUserId!==args.actorId)throw new Error('TEXT_REQUEST_ACTOR_MISMATCH');
    await (args.actorId?resolveProjectAccessForActor(ctx,row.projectId,args.actorId,['OWNER','EDITOR']):requireProjectAccess(ctx, row.projectId, ['OWNER', 'EDITOR']));
    const hold = await ctx.db.get(row.reservationId);
    const budget = hold ? await ctx.db.get(hold.budgetId) : null;
    if (!hold || hold.status !== 'RESERVED' || !budget || budget.status !== 'ACTIVE' || budget.key !== process.env.FINALFRAME_PAID_TEST_RUN?.trim() || !budget.allowedStudioExternalIds.includes(row.studioExternalId)) throw new Error('Paid testing is not enabled for this request.');
    await ctx.db.patch(row._id, { status: 'SUBMITTING', updatedAt: Date.now() });
    return null;
  },
});

export const finish = internalMutation({
  args: { requestId: v.id('providerTextRequests'), submitted: v.boolean(), content: v.optional(v.string()), model: v.optional(v.string()), providerRequestId: v.optional(v.string()), usage: v.optional(v.any()), actualCostUsd: v.optional(v.number()), errorCode: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.requestId);
    if (!row) throw new Error('TEXT_REQUEST_NOT_FOUND');
    if (['COMPLETED', 'FAILED', 'RECONCILIATION_REQUIRED'].includes(row.status)) return null;
    // A missing reply after POST never releases the allowance. Persisted
    // SUBMITTING rows after process loss are also never submitted again.
    const submitted = row.status === 'SUBMITTING' || args.submitted;
    await settleProviderBudget(ctx, { reservationId: row.reservationId, accepted: submitted, actualCostUsd: args.actualCostUsd });
    const completed = args.content !== undefined;
    await ctx.db.patch(row._id, { status: completed ? 'COMPLETED' : submitted ? 'RECONCILIATION_REQUIRED' : 'FAILED', content: args.content, model: args.model ?? row.model, providerRequestId: args.providerRequestId, usage: args.usage, actualCostUsd: args.actualCostUsd, errorCode: args.errorCode, updatedAt: Date.now() });
    return null;
  },
});
