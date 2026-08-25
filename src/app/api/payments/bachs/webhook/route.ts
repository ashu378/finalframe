import { NextResponse } from 'next/server';
import { getConvexClient } from '@/lib/convex/server';
import { api } from '../../../../../../convex/_generated/api';
import { verifyBachsSignature } from '@/lib/payments/bachs';

export async function POST(request: Request) {
    const rawBody = await request.text();
    const timestamp = request.headers.get('X-Bachs-Timestamp');
    const signature = request.headers.get('X-Bachs-Signature');
    if (!verifyBachsSignature(rawBody, timestamp, signature)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    try {
        const result = await getConvexClient().action(api.paymentWebhook.receive, { rawBody, timestamp: timestamp || '', signature: signature || '' });
        return NextResponse.json({ received: true, ...result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Webhook processing failed.';
        return NextResponse.json({ error: message }, { status: message.toLowerCase().includes('signature') ? 401 : 500 });
    }
}
