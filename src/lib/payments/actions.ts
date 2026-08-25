'use server';

import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import { BachsPaymentProvider } from './bachs';
import type { SupportedCurrency } from './types';
import { CREDIT_PACKS } from './config';
import { isFeatureEnabled } from '@/lib/config/feature-flags';

export async function createCreditCheckout(packId: string, currency: SupportedCurrency = 'NGN') {
    if (!isFeatureEnabled('bacsPayments')) return { success: false, error: 'Credit purchases are not enabled in this environment.' };
    const convex = await getAuthenticatedConvexClient();
    const current = await convex.query(api.account.current, {});
    const user = current.user;
    const studio = current.studio;
    if (!user || !studio) return { success: false, error: 'Studio not found' };
    const basePack = CREDIT_PACKS.find((pack) => pack.id === packId);
    if (!basePack) return { success: false, error: 'Credit pack not found' };
    const amount = basePack.amounts[currency];
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: `No ${currency} price is configured for this credit pack.` };
    const reference = `ff_${studio.externalId.slice(0, 16)}_${Date.now()}_${packId}`;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const provider = new BachsPaymentProvider();
    const checkout = await provider.createCheckout({ amount, currency, reference, idempotencyKey: `checkout_${reference}`, customerEmail: user.email || '', successUrl: `${siteUrl}/dashboard/settings`, cancelUrl: `${siteUrl}/dashboard/settings` });
    await convex.mutation(api.financial.createPurchase, { studioExternalId: studio.externalId, provider: 'bachs', providerCheckoutId: checkout.checkoutId, amount, currency, credits: basePack.credits, reference, idempotencyKey: `purchase_${reference}`, metadata: { packId, customerEmail: user.email } });
    return { success: true, checkoutUrl: checkout.checkoutUrl, checkoutId: checkout.checkoutId, reference };
}
