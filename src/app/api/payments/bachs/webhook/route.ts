import { NextResponse } from 'next/server';
import { getConvexClient } from '@/lib/convex/server';
import { api } from '../../../../../../convex/_generated/api';
import { verifyBachsSignature } from '@/lib/payments/bachs';

export async function POST(request: Request) {
    const rawBody = await request.text();
    if (!verifyBachsSignature(rawBody, request.headers.get('X-Bachs-Timestamp'), request.headers.get('X-Bachs-Signature'))) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    const event = JSON.parse(rawBody);
    const reference = event.data?.reference || event.data?.metadata?.reference;
    const result = await getConvexClient().mutation(api.payments.recordWebhook, { provider: 'bachs', providerEventId: event.id, eventType: event.type, payload: event, reference, providerChargeId: event.data?.charge_id });
    if (result.duplicate) return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ received: true });
}
