import 'server-only';

import { isReviewMediaRequest, isReviewMediaSecret, REVIEW_MEDIA_RESOLVER_PATH, REVIEW_MEDIA_SIGNATURE, REVIEW_MEDIA_TIMESTAMP, signReviewMediaResolver } from '../../../convex/reviewMediaContract';

const MAX_MEDIA_BYTES = 2_000_000_000;
const FETCH_TIMEOUT_MS = 250_000;
const RESOLVER_TIMEOUT_MS = 8_000;
const MEDIA_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const PRIVATE_HEADERS = {
    'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
};

function convexMediaOrigin(value?: string) {
    try {
        const url = new URL(value ?? '');
        if (!/^https:\/\/[a-z0-9][a-z0-9-]*\.convex\.cloud$/.test(url.origin) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
        return url;
    } catch { return null; }
}

function mediaSource(value: unknown, origin: URL) {
    if (typeof value !== 'object' || value === null) return null;
    const { url, size, contentType } = value as Record<string, unknown>;
    if (typeof url !== 'string' || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > MAX_MEDIA_BYTES || typeof contentType !== 'string' || !MEDIA_TYPES.includes(contentType)) return null;
    try {
        const target = new URL(url);
        if (target.origin !== origin.origin || target.username || target.password || target.hash || !/^\/api\/storage\/[^/]+$/.test(target.pathname)) return null;
        return { target, size, contentType };
    } catch { return null; }
}

function singleRange(value: string, size: number) {
    const match = /^bytes=(\d{0,15})-(\d{0,15})$/i.exec(value);
    if (!match || (!match[1] && !match[2])) return null;
    if (!match[1]) {
        const length = Number(match[2]);
        return length > 0 ? { start: Math.max(0, size - length), end: size - 1 } : null;
    }
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    return start <= end ? { start, end } : null;
}

function empty(status: number, extra?: Record<string, string>) {
    return new Response(null, { status, headers: { ...PRIVATE_HEADERS, ...extra } });
}

export async function serveReviewMedia(request: Request, params: { kind: string; token: string }) {
    if (!isReviewMediaRequest(params)) return empty(404);
    const secret = process.env.FINALFRAME_REVIEW_MEDIA_SECRET;
    const origin = convexMediaOrigin(process.env.NEXT_PUBLIC_CONVEX_URL);
    if (!isReviewMediaSecret(secret) || !origin) return empty(503);
    const resolver = new URL(REVIEW_MEDIA_RESOLVER_PATH, `https://${origin.hostname.replace(/\.cloud$/, '.site')}`);
    let media;
    try {
        const body = JSON.stringify(params);
        const timestamp = Date.now().toString();
        const signature = await signReviewMediaResolver(secret, timestamp, body);
        const resolved = await fetch(resolver, {
            method: 'POST', body, cache: 'no-store', redirect: 'error', signal: AbortSignal.any([request.signal, AbortSignal.timeout(RESOLVER_TIMEOUT_MS)]),
            headers: { 'Content-Type': 'application/json', [REVIEW_MEDIA_TIMESTAMP]: timestamp, [REVIEW_MEDIA_SIGNATURE]: signature },
        });
        if (resolved.status !== 200) {
            void resolved.body?.cancel().catch(() => undefined);
            return empty(resolved.status === 404 ? 404 : 503);
        }
        media = mediaSource(await resolved.json(), origin);
    } catch { return empty(503); }
    if (!media) return empty(502);

    const headers = new Headers({ ...PRIVATE_HEADERS, 'Accept-Ranges': 'bytes', 'Content-Type': media.contentType });
    if (request.method === 'HEAD') {
        headers.set('Content-Length', media.size.toString());
        return new Response(null, { status: 200, headers });
    }
    const rawRange = request.headers.get('Range');
    const range = rawRange === null ? null : singleRange(rawRange, media.size);
    if (rawRange !== null && !range) return empty(416, { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${media.size}` });
    const expectedRange = range ? `bytes ${range.start}-${range.end}/${media.size}` : null;
    const bytesExpected = range ? range.end - range.start + 1 : media.size;
    const status = range ? 206 : 200;

    let upstream: Response;
    try {
        upstream = await fetch(media.target, {
            cache: 'no-store', redirect: 'error', signal: AbortSignal.any([request.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
            headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}) },
        });
    } catch { return empty(502); }
    const encoding = upstream.headers.get('Content-Encoding');
    const length = upstream.headers.get('Content-Length');
    if (!upstream.body || upstream.status !== status || upstream.headers.get('Content-Range') !== expectedRange || upstream.headers.get('Content-Type') !== media.contentType || (length !== null && length !== bytesExpected.toString()) || (encoding !== null && encoding !== 'identity')) {
        void upstream.body?.cancel().catch(() => undefined);
        return empty(502);
    }
    if (expectedRange) headers.set('Content-Range', expectedRange);
    headers.set('Content-Length', bytesExpected.toString());
    let bytesRead = 0;
    const stream = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
            bytesRead += chunk.byteLength;
            if (bytesRead > bytesExpected) throw new Error('Review media exceeded its verified length.');
            controller.enqueue(chunk);
        },
        flush() {
            if (bytesRead !== bytesExpected) throw new Error('Review media ended before its verified length.');
        },
    }));
    return new Response(stream, { status, headers });
}
