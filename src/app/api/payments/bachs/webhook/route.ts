import { NextResponse } from 'next/server';
import { getConvexClient } from '@/lib/convex/server';
import { api } from '../../../../../../convex/_generated/api';
import { verifyBachsSignature } from '@/lib/payments/bachs';

export async function POST(request: Request) {
    const rawBody = await request.text();
    if (!verifyBachsSignature(rawBody, request.headers.get('X-Bachs-Timestamp'), request.headers.get('X-Bachs-Signature'))) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    let event: Record<string, any>;
    try {
        event = JSON.parse(rawBody) as Record<string, any>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (typeof event.id !== 'string' || typeof event.type !== 'string') {
        return NextResponse.json({ error: 'Invalid event envelope' }, { status: 400 });
    }
    const reference = event.data?.reference || event.data?.metadata?.reference;
    const amount = event.data?.amount === undefined ? undefined : Number(event.data.amount);
    const result = await getConvexClient().mutation(api.payments.recordWebhook, { provider: 'bachs', providerEventId: event.id, eventType: event.type, payload: event, reference, providerCheckoutId: event.data?.checkout_id, providerChargeId: event.data?.charge_id, amount: Number.isFinite(amount) ? amount : undefined, currency: event.data?.currency });
    if (result.duplicate) return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ received: true });
}
