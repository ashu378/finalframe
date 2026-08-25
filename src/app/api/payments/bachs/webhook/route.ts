import { NextResponse } from 'next/server';
import { getConvexClient } from '@/lib/convex/server';
import { api } from '../../../../../../convex/_generated/api';
import { BachsPaymentProvider } from '@/lib/payments/bachs';

export async function POST(request: Request) {
    const rawBody = await request.text();
    const provider = new BachsPaymentProvider({
        environment: process.env.BACHS_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
        baseUrl: process.env.BACHS_API_BASE_URL || (process.env.BACHS_ENVIRONMENT === 'production' ? 'https://api.bachs.io' : 'https://sandbox-api.bachs.io'),
        apiKey: process.env.BACHS_API_KEY || '',
        webhookSecret: process.env.BACHS_WEBHOOK_SECRET,
        webhookToleranceSeconds: Number(process.env.BACHS_WEBHOOK_TOLERANCE_SECONDS || 300),
        enabledCurrencies: (process.env.BACHS_ALLOWED_CURRENCIES || 'USD,NGN').split(',').map((currency) => currency.trim().toUpperCase()).filter(Boolean),
    });
    let event;
    try {
        event = provider.verifyWebhook({ rawBody, timestamp: request.headers.get('X-Bachs-Timestamp'), signature: request.headers.get('X-Bachs-Signature') });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid Bachs webhook.';
        const status = message.includes('signature') ? 401 : 400;
        return NextResponse.json({ error: status === 401 ? 'Invalid signature' : message }, { status });
    }
    if (event.eventType === 'collection.succeeded' && (event.status !== 'succeeded' || !event.checkoutId || !event.chargeId || event.amount === undefined || !event.currency)) {
        return NextResponse.json({ error: 'Incomplete collection event' }, { status: 400 });
    }
    const result = await getConvexClient().mutation(api.payments.recordWebhook, { provider: 'bachs', providerEventId: event.eventId, eventType: event.eventType, payload: event.raw, reference: event.reference, providerCheckoutId: event.checkoutId, providerChargeId: event.chargeId, amount: event.amount, currency: event.currency });
    if (result.duplicate) return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ received: true, quarantined: 'quarantined' in result && result.quarantined === true });
}
