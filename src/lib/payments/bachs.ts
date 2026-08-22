import type { CheckoutSession, PaymentProvider, SupportedCurrency } from './types';

const BASE_URL = process.env.BACHS_API_BASE_URL || 'https://sandbox-api.bachs.io';
const API_KEY = process.env.BACHS_API_KEY;

export class BachsPaymentProvider implements PaymentProvider {
    async createCheckout(input: {
        amount: number;
        currency: SupportedCurrency;
        reference: string;
        customerEmail: string;
        credits: number;
        successUrl: string;
        cancelUrl: string;
    }): Promise<CheckoutSession> {
        if (!API_KEY) throw new Error('BACHS_API_KEY is not configured');
        const response = await fetch(`${BASE_URL}/v1/checkout-sessions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pricing: { currency: input.currency, amount: input.amount.toFixed(2) },
                customer: { email: input.customerEmail },
                success_url: `${input.successUrl}?reference=${encodeURIComponent(input.reference)}`,
                cancel_url: `${input.cancelUrl}?reference=${encodeURIComponent(input.reference)}`,
                reference: input.reference,
                metadata: { credits: String(input.credits), reference: input.reference },
            }),
        });
        if (!response.ok) throw new Error(`Bachs checkout failed: ${response.status} ${await response.text()}`);
        const data = await response.json();
        return { provider: 'bachs', checkoutId: data.checkout_id, checkoutUrl: data.checkout_url, reference: input.reference, status: data.status };
    }
}

export function verifyBachsSignature(rawBody: string, timestamp: string | null, signature: string | null, secret = process.env.BACHS_WEBHOOK_SECRET) {
    if (!secret || !timestamp || !signature) return false;
    const timestampNumber = Number(timestamp);
    if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
    const crypto = require('crypto') as typeof import('crypto');
    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}
