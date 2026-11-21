import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

/** Sandbox money is recorded durably, but never touches credits/studios.credits. */
export const applyEvent = internalMutation({
  args: { event: v.any() }, returns: v.any(),
  handler: async (ctx, { event }) => {
    if (process.env.BACHS_ENVIRONMENT !== 'sandbox' || process.env.BACHS_SANDBOX_ENABLED !== 'true') throw new Error('Sandbox payments disabled.');
    const data = event.data ?? {};
    const previous = await ctx.db.query('paymentEvents').withIndex('by_provider_event', q => q.eq('provider', 'bachs:sandbox').eq('providerEventId', event.id)).unique();
    if (previous) return { duplicate: true, status: 'DUPLICATE' };
    const checkout = typeof data.checkout_id === 'string' ? await ctx.db.query('purchases').withIndex('by_checkout', q => q.eq('providerCheckoutId', data.checkout_id)).unique() : null;
    const reference = data.reference ?? data.metadata?.reference;
    const referenced = typeof reference === 'string' ? await ctx.db.query('purchases').withIndex('by_reference', q => q.eq('reference', reference)).unique() : null;
    const charged = typeof data.charge_id === 'string' ? await ctx.db.query('purchases').withIndex('by_provider_payment', q => q.eq('provider', 'bachs').eq('providerPaymentId', data.charge_id)).unique() : null;
    const purchase = checkout ?? referenced ?? charged;
    if (!purchase) throw new Error('Payment purchase not ready; retry delivery.');
    if (!purchase.studioId || purchase.metadata?.environment !== 'sandbox' || [checkout, referenced, charged].some(p => p && p._id !== purchase._id) || (purchase.providerCheckoutId && data.checkout_id && purchase.providerCheckoutId !== data.checkout_id)) throw new Error('Payment ownership mismatch.');
    const time = Date.now();
    let status = purchase.status ?? 'PENDING';
    const wallet = await ctx.db.query('sandboxPaymentBalances').withIndex('by_studio', q => q.eq('studioId', purchase.studioId!)).unique();
    const apply = async (amount: number, key: string, refundId?: string) => {
      const seen = await ctx.db.query('sandboxPaymentLedger').withIndex('by_key', q => q.eq('idempotencyKey', key)).unique();
      if (seen) return false;
      const balance = (wallet?.balance ?? 0) + amount;
      if (balance < 0) throw new Error('Sandbox refund exceeds available test credits.');
      if (wallet) await ctx.db.patch(wallet._id, { balance, updatedAt: time });
      else await ctx.db.insert('sandboxPaymentBalances', { studioId: purchase.studioId!, balance, updatedAt: time });
      await ctx.db.insert('sandboxPaymentLedger', { studioId: purchase.studioId!, purchaseId: purchase._id, amount, idempotencyKey: key, ...(refundId ? { refundId } : {}), createdAt: time });
      return true;
    };
    if (event.type === 'collection.succeeded') {
      const amount = Number(data.amount);
      if (!Number.isFinite(amount) || Math.round(amount * 100) !== Math.round(purchase.amount * 100) || data.currency !== purchase.currency || !['SUCCEEDED', 'ACCEPTED'].includes(String(data.status).toUpperCase()) || typeof data.charge_id !== 'string') throw new Error('Payment amount, currency or state mismatch.');
      if (purchase.providerPaymentId && purchase.providerPaymentId !== data.charge_id) throw new Error('A different charge already fulfilled this purchase.');
      await apply(purchase.credits, `sandbox:purchase:${purchase._id}`);
      // A late success retry must not clear an already-completed refund.
      status = 'COMPLETED';
      await ctx.db.patch(purchase._id, { status, providerPaymentId: data.charge_id, completedAt: purchase.completedAt ?? time });
    } else if (['collection.failed', 'collection.underpaid', 'checkout.expired'].includes(event.type)) {
      if (purchase.status !== 'COMPLETED') {
        status = event.type === 'collection.underpaid' ? 'QUARANTINED' : 'FAILED';
        await ctx.db.patch(purchase._id, { status });
      }
    } else if (['refund.paid', 'refund.succeeded'].includes(event.type)) {
      if (!purchase.providerPaymentId || purchase.providerPaymentId !== data.charge_id || typeof data.refund_id !== 'string') throw new Error('Refund charge mismatch.');
      const amount = Number(data.refunded_amount ?? data.requested_amount ?? data.amount);
      const previousAmount = Number(purchase.metadata?.refundedAmount ?? 0);
      const seen = await ctx.db.query('sandboxPaymentLedger').withIndex('by_key', q => q.eq('idempotencyKey', `sandbox:refund:${data.refund_id}`)).unique();
      if (!seen) {
        if (!Number.isFinite(amount) || amount <= 0 || (data.currency !== undefined && data.currency !== purchase.currency) || Math.round((previousAmount + amount) * 100) > Math.round(purchase.amount * 100)) throw new Error('Refund amount or currency mismatch.');
        const cumulativeCredits = Math.round(purchase.credits * (previousAmount + amount) / purchase.amount);
        const delta = cumulativeCredits - Number(purchase.metadata?.refundedCredits ?? 0);
        await apply(-delta, `sandbox:refund:${data.refund_id}`, data.refund_id);
        await ctx.db.patch(purchase._id, { metadata: { ...purchase.metadata, refundedAmount: previousAmount + amount, refundedCredits: cumulativeCredits } });
      }
      status = 'REFUNDED';
    }
    await ctx.db.insert('paymentEvents', { provider: 'bachs:sandbox', providerEventId: event.id, eventType: event.type, purchaseId: purchase._id, studioId: purchase.studioId, studioExternalId: purchase.studioExternalId, payload: event, receivedAt: time, processedAt: time, createdAt: time });
    return { duplicate: false, status, purchaseId: purchase._id };
  },
});
