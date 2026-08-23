import { ConvexHttpClient } from 'convex/browser';
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';

export function getConvexClient() {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured');
    return new ConvexHttpClient(url);
}

export async function getAuthenticatedConvexClient() {
    const client = getConvexClient();
    const token = await convexAuthNextjsToken();
    if (token) client.setAuth(token);
    return client;
}
