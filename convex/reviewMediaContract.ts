export const REVIEW_MEDIA_RESOLVER_PATH = '/internal/review-media';
export const REVIEW_MEDIA_TIMESTAMP = 'x-finalframe-review-timestamp';
export const REVIEW_MEDIA_SIGNATURE = 'x-finalframe-review-signature';
const MAX_RESOLVER_BODY_BYTES = 256;
const SIGNATURE_WINDOW_MS = 30_000;

export type ReviewMediaKind = 'export' | 'movie';
export type ReviewMediaRequest = { kind: ReviewMediaKind; token: string };
export type ReviewMediaOrigin = { url: string; size: number; contentType: string };

export function isReviewMediaRequest(value: unknown): value is ReviewMediaRequest {
  if (typeof value !== 'object' || value === null) return false;
  const { kind, token } = value as Partial<ReviewMediaRequest>;
  return (kind === 'export' || kind === 'movie') && typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function reviewMediaPath(kind: ReviewMediaKind, token: string) {
  return `/api/review-media/${kind}/${token}`;
}

export function isReviewMediaSecret(secret?: string): secret is string {
  return typeof secret === 'string' && /^[a-f0-9]{64}$/.test(secret);
}

async function signatureKey(secret: string, usage: 'sign' | 'verify') {
  return await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

function signaturePayload(timestamp: string, body: string) {
  return new TextEncoder().encode(`POST\n${REVIEW_MEDIA_RESOLVER_PATH}\n${timestamp}\n${body}`);
}

export async function signReviewMediaResolver(secret: string, timestamp: string, body: string) {
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', await signatureKey(secret, 'sign'), signaturePayload(timestamp, body)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readBoundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(MAX_RESOLVER_BODY_BYTES);
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
      if (value.byteLength > bytes.length - size) return null;
      bytes.set(value, size);
      size += value.byteLength;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

export async function respondToReviewMediaResolver(request: Request, secret: string | undefined, resolve: (input: ReviewMediaRequest) => Promise<ReviewMediaOrigin | null>) {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const signature = request.headers.get(REVIEW_MEDIA_SIGNATURE) ?? '';
  const timestamp = request.headers.get(REVIEW_MEDIA_TIMESTAMP) ?? '';
  if (!isReviewMediaSecret(secret) || !/^[a-f0-9]{64}$/.test(signature) || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > SIGNATURE_WINDOW_MS) return new Response(null, { status: 401, headers });
  let input: unknown;
  try {
    const body = await readBoundedBody(request);
    if (!body) return new Response(null, { status: 400, headers });
    const bytes = Uint8Array.from(signature.match(/../g)!, pair => Number.parseInt(pair, 16));
    if (!await crypto.subtle.verify('HMAC', await signatureKey(secret, 'verify'), bytes, signaturePayload(timestamp, body))) return new Response(null, { status: 401, headers });
    input = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400, headers });
  }
  if (!isReviewMediaRequest(input)) return new Response(null, { status: 400, headers });
  try {
    const media = await resolve(input);
    return media ? Response.json(media, { headers }) : new Response(null, { status: 404, headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
