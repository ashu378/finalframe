import { ConvexHttpClient } from 'convex/browser';

export function getConvexClient() {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured');
    return new ConvexHttpClient(url);
}
