import { NextResponse } from 'next/server';
import { getConvexClient } from '@/lib/convex/server';
import { api } from '../../../../../../convex/_generated/api';

export async function POST(request: Request) {
    if (Number(request.headers.get('content-length') || 0) > 131072) return NextResponse.json({ code: 'BODY_TOO_LARGE' }, { status: 413 });
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > 131072) return NextResponse.json({ code: 'BODY_TOO_LARGE' }, { status: 413 });
    try {
        // Convex verifies the raw signature and applies the event transactionally.
        const result = await getConvexClient().action(api.paymentWebhook.receive, { rawBody, timestamp: request.headers.get('X-Bachs-Timestamp') || '', signature: request.headers.get('X-Bachs-Signature') || '' });
        return NextResponse.json({ received: true, ...result });
    } catch {
        return NextResponse.json({ code: 'PAYMENT_EVENT_REJECTED' }, { status: 400 });
    }
}
