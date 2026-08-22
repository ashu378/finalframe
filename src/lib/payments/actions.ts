'use server';

import { createClient } from '@/lib/supabase/server';
import { getConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import { BachsPaymentProvider } from './bachs';
import type { SupportedCurrency } from './types';
import { CREDIT_PACKS } from './config';

export async function createCreditCheckout(packId: string, currency: SupportedCurrency = 'XAF') {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    const { data: studio } = await supabase.from('studios').select('id,name,credits').eq('user_id', user.id).single();
    if (!studio) return { success: false, error: 'Studio not found' };
    const basePack = CREDIT_PACKS.find((pack) => pack.id === packId);
    if (!basePack) return { success: false, error: 'Credit pack not found' };
    const reference = `ff_${studio.id.slice(0, 8)}_${Date.now()}_${packId}`;
    const amount = basePack.amounts[currency];
    const convex = getConvexClient();
    await convex.mutation(api.bootstrap.ensureStudio, { ownerExternalId: user.id, studioExternalId: studio.id, name: studio.name || 'FinalFrame Studio', initialCredits: Number(studio.credits || 0) });
    const provider = new BachsPaymentProvider();
    const checkout = await provider.createCheckout({ amount, currency, reference, customerEmail: user.email || '', credits: basePack.credits, successUrl: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard/settings`, cancelUrl: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard/settings` });
    await convex.mutation(api.payments.createPurchase, { ownerExternalId: user.id, studioExternalId: studio.id, provider: 'bachs', providerCheckoutId: checkout.checkoutId, amount, currency, credits: basePack.credits, reference, metadata: { packId, customerEmail: user.email } });
    return { success: true, checkoutUrl: checkout.checkoutUrl, checkoutId: checkout.checkoutId, reference };
}
