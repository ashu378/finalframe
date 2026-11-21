"use node";
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { ConvexError, v } from 'convex/values';
import { BachsPaymentProvider } from '../src/lib/payments/bachs';
import { getBachsConfig } from '../src/lib/payments/config';

function provider() {
  const config = getBachsConfig();
  if (config.environment !== 'sandbox' || process.env.BACHS_SANDBOX_ENABLED !== 'true') throw new Error('Only sandbox payments are enabled.');
  return new BachsPaymentProvider(config);
}

export const create = action({
  args: { studioExternalId: v.string(), packId: v.string(), currency: v.union(v.literal('USD'), v.literal('NGN')), requestKey: v.string() }, returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    const api = provider();
    const prepared = await ctx.runMutation(internal.paymentCheckoutState.prepare, args);
    const purchase = prepared.purchase;
    if (!prepared.submit) return { success: Boolean(purchase.metadata?.checkoutUrl) && purchase.status === 'PENDING', checkoutUrl: purchase.status === 'PENDING' ? purchase.metadata?.checkoutUrl ?? null : null, purchaseId: purchase._id, finished: purchase.status !== 'PENDING', error: purchase.status === 'PENDING' ? 'Checkout is being prepared. Retry shortly to resume the same payment.' : 'This purchase is already finished. Start a new checkout.' };
    const site = process.env.SITE_URL;
    if (!site || new URL(site).protocol !== 'https:') throw new Error('Public site URL is not configured.');
    try {
      const result = await api.createCheckout({ amount: purchase.amount, currency: args.currency, reference: purchase.reference, idempotencyKey: purchase.idempotencyKey!, customerEmail: purchase.metadata.customerEmail, successUrl: `${site}/dashboard/settings?payment=returned#credits`, cancelUrl: `${site}/dashboard/settings?payment=cancelled#credits` });
      await ctx.runMutation(internal.paymentCheckoutState.attach, { purchaseId: purchase._id, checkoutId: result.checkoutId, checkoutUrl: result.checkoutUrl });
      return { success: true, checkoutUrl: result.checkoutUrl, purchaseId: purchase._id };
    } catch {
      // Keep the intent and provider key. Retrying never buys a different checkout.
      return { success: false, purchaseId: purchase._id, error: 'Checkout could not be confirmed yet. Wait a minute, then retry to resume this same payment.' };
    }
  },
});

export const refundSandbox = action({
  args: { purchaseId: v.id('purchases') }, returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    try {
    const api = provider();
    const purchase = await ctx.runQuery(internal.paymentCheckoutState.getForRecovery, args);
    if (purchase.status !== 'COMPLETED' || !purchase.providerPaymentId) throw new Error('Only a confirmed sandbox payment can be refunded.');
    if ((purchase.metadata?.refundedAmount ?? 0) > 0) throw new Error('This test payment already has a refund.');
    const refundAmount = Number(purchase.metadata?.settlementAmount);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) throw new Error('Verified refund amount is missing.');
    const existing = await api.findRefund(purchase.providerPaymentId);
    const result = existing ?? await api.refund({ chargeId: purchase.providerPaymentId, amount: refundAmount, reference: `refund_${purchase.reference}`, idempotencyKey: `sandbox-full-refund:${purchase._id}`, reason: 'FinalFrame sandbox acceptance test' });
    await ctx.runMutation(internal.paymentCheckoutState.recordRefund, { purchaseId: purchase._id, refundId: result.refundId, providerStatus: result.status });
    return { refundId: result.refundId, status: result.status };
    } catch {
      throw new ConvexError('The test refund could not be confirmed. Retry to check the same payment; no additional refund is created automatically.');
    }
  },
});
