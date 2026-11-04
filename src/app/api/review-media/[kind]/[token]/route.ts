import { serveReviewMedia } from '@/lib/review/media-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Context = { params: Promise<{ kind: string; token: string }> };

export async function GET(request: Request, context: Context) {
    return serveReviewMedia(request, await context.params);
}

export async function HEAD(request: Request, context: Context) {
    return serveReviewMedia(request, await context.params);
}
