import { v } from 'convex/values';
import { internalMutation, internalQuery, query } from './_generated/server';
import { requireAdmin } from './authorization';
import { requirePlatformRole } from './platformAdministration';
import { CREDIT_PACKS } from '../src/lib/payments/config';
import type { MutationCtx, QueryCtx } from './_generated/server';

export async function sandboxAccess(ctx: QueryCtx | MutationCtx, studioExternalId: string) {
  if (process.env.BACHS_ENVIRONMENT !== 'sandbox' || process.env.BACHS_SANDBOX_ENABLED !== 'true') throw new Error('Sandbox checkout is not enabled.');
  const member = await requireAdmin(ctx, studioExternalId);
  // Test money must never become an ordinary customer's spendable balance.
  const allow = (process.env.BACHS_SANDBOX_TEST_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!allow.includes(member.user.email?.toLowerCase() ?? '')) await requirePlatformRole(ctx, ['ADMIN']);
  return member;
}

export const status = query({
  args: { studioExternalId: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    const member = await requireAdmin(ctx, args.studioExternalId);
    let enabled = false;
    try { await sandboxAccess(ctx, args.studioExternalId); enabled = true; } catch { /* Ordinary creators see disabled billing. */ }
    if (!enabled) return { enabled: false, environment: 'disabled', balance: 0, purchases: [] };
    const wallet = await ctx.db.query('sandboxPaymentBalances').withIndex('by_studio', q => q.eq('studioId', member.studio._id)).unique();
    const rows = await ctx.db.query('purchases').withIndex('by_studio', q => q.eq('studioExternalId', member.studio.externalId)).order('desc').take(30);
    return { enabled, environment: 'sandbox', balance: wallet?.balance ?? 0, purchases: rows.filter(p => p.metadata?.environment === 'sandbox').map(p => ({ id: p._id, reference: p.reference, status: p.status, amount: p.amount, currency: p.currency, credits: p.credits, refundedCredits: p.metadata?.refundedCredits ?? 0, createdAt: p.createdAt })) };
  },
});

export const prepare = internalMutation({
  args: { studioExternalId: v.string(), packId: v.string(), currency: v.union(v.literal('USD'), v.literal('NGN')), requestKey: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    const member = await sandboxAccess(ctx, args.studioExternalId);
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(args.requestKey)) throw new Error('Invalid checkout request.');
    const pack = CREDIT_PACKS.find(p => p.id === args.packId);
    if (!pack) throw new Error('Unknown credit pack.');
    const key = `sandbox:${member.studio._id}:${args.requestKey}`;
    let purchase = await ctx.db.query('purchases').withIndex('by_idempotency', q => q.eq('idempotencyKey', key)).unique();
    if (purchase && (purchase.metadata?.packId !== args.packId || purchase.currency !== args.currency)) throw new Error('Checkout request already used for a different purchase.');
    if (!purchase) {
      const recent = await ctx.db.query('purchases').withIndex('by_studio', q => q.eq('studioExternalId', member.studio.externalId)).order('desc').take(30);
      purchase = recent.find(p => p.metadata?.environment === 'sandbox' && p.metadata?.packId === args.packId && p.currency === args.currency && p.status === 'PENDING') ?? null;
    }
    if (!purchase) {
      const id = await ctx.db.insert('purchases', { studioId: member.studio._id, studioExternalId: member.studio.externalId, provider: 'bachs', amount: pack.amounts[args.currency], currency: args.currency, credits: pack.credits, reference: `ff_sandbox_${member.studio._id}_${args.requestKey}`, status: 'PENDING', idempotencyKey: key, metadata: { environment: 'sandbox', packId: pack.id, customerEmail: member.user.email }, createdAt: Date.now() });
      purchase = (await ctx.db.get(id))!;
    }
    if (purchase.status !== 'PENDING') return { purchase, submit: false };
    if (purchase.metadata?.checkoutUrl) return { purchase, submit: false };
    // Never reuse an ambiguous provider key after its 24-hour retention window.
    if (Date.now() - purchase.createdAt > 23 * 3600000) throw new Error('This checkout needs reconciliation before another attempt.');
    if ((purchase.metadata?.leaseUntil ?? 0) > Date.now()) return { purchase, submit: false };
    await ctx.db.patch(purchase._id, { metadata: { ...purchase.metadata, leaseUntil: Date.now() + 45000 } });
    return { purchase, submit: true };
  },
});

export const attach = internalMutation({
  args: { purchaseId: v.id('purchases'), checkoutId: v.string(), checkoutUrl: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const purchase = await ctx.db.get(args.purchaseId);
    if (!purchase || purchase.metadata?.environment !== 'sandbox') throw new Error('Sandbox purchase missing.');
    if (purchase.providerCheckoutId && purchase.providerCheckoutId !== args.checkoutId) throw new Error('Provider checkout mismatch.');
    await ctx.db.patch(purchase._id, { providerCheckoutId: args.checkoutId, metadata: { ...purchase.metadata, checkoutUrl: args.checkoutUrl, leaseUntil: 0 } });
    return null;
  },
});

export const getForRecovery = internalQuery({
  args: { purchaseId: v.id('purchases') }, returns: v.any(),
  handler: async (ctx, args) => {
    const purchase = await ctx.db.get(args.purchaseId);
    if (!purchase || purchase.metadata?.environment !== 'sandbox') throw new Error('Sandbox purchase missing.');
    await sandboxAccess(ctx, purchase.studioExternalId);
    return purchase;
  },
});
