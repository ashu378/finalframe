'use server';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import type { SupportedCurrency } from './types';

export async function createCreditCheckout(packId: string, currency: SupportedCurrency = 'NGN', requestKey: string) {
  try {
    const convex = await getAuthenticatedConvexClient();
    const current = await convex.query(api.account.current, {});
    if (!current.user || !current.studio) return { success: false, error: 'Sign in to your workspace first.' };
    return await convex.action(api.bachsCheckout.create, { studioExternalId: current.studio.externalId, packId, currency, requestKey });
  } catch {
    return { success: false, error: 'Checkout is unavailable for this account. Live payments remain disabled.' };
  }
}
