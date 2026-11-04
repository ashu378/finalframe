import { createReadStream } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { outputFormatForMimeType, type RenderOutputMimeType } from './output-format.js';
import { RENDER_UPLOAD_RENEWAL_PATH, type RenderUploadRenewal } from './contracts/upload-renewal.js';

/** Transfer capabilities are accepted only on explicitly configured origins.
 * Do not derive an origin allowlist from an incoming render request. */
export function assertTransferUrl(value: string, allowedOrigins: readonly string[]): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid worker transfer destination.'); }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (value.length > 2_048 || (!localHttp && url.protocol !== 'https:') || url.username || url.password || url.hash || !allowedOrigins.includes(url.origin)) {
    throw new Error('Worker transfer destination is not on the configured origin allowlist.');
  }
  return url;
}

export function transferOrigins(explicit: string | undefined, mediaHosts: readonly string[], kind: 'storage' | 'callback'): string[] {
  if (explicit?.trim()) return [...new Set(explicit.split(',').map(value => {
    let url: URL;
    try { url = new URL(value.trim()); } catch { throw new Error('Invalid configured worker transfer origin.'); }
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Configure worker transfer origins without paths or credentials.');
    assertTransferUrl(url.origin, [url.origin]);
    return url.origin;
  }))];
  // Existing deployments can use their pinned Convex media host for both
  // Storage and its corresponding HTTP-action origin, without trusting input.
  return [...new Set(mediaHosts.filter(host => /^[a-z0-9-]+\.convex\.cloud$/.test(host)).map(host => `https://${kind === 'callback' ? host.replace(/\.convex\.cloud$/, '.convex.site') : host}`))];
}

export function boundedTransferTimeout(value: number | undefined, fallback: number, maximum: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.max(1, Math.min(Math.floor(value), maximum)) : fallback;
}

export async function readBoundedJsonReceipt(response: Response, maxBytes: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Worker transfer returned no receipt.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error('Worker transfer receipt exceeds its limit.'); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export class RenderStorageUploadRejected extends Error {
  constructor(readonly status: number) { super('Render storage upload was rejected.'); }
}

export async function renderUploadArtifact(outputPath: string) {
  const hash = createHash('sha256');
  let byteSize = 0;
  for await (const chunk of createReadStream(outputPath, { highWaterMark: 64 * 1024 })) {
    byteSize += chunk.length;
    if (byteSize > 2_000_000_000) throw new Error('Retained upload artifact exceeds its limit.');
    hash.update(chunk);
  }
  if (!byteSize) throw new Error('Retained upload artifact is empty.');
  return { byteSize, checksum: hash.digest('base64') };
}

export async function requestRenderUploadRenewal(callbackUrl: string, originalUploadUrl: string, request: RenderUploadRenewal, options: {
  secret: string; callbackOrigins: readonly string[]; storageOrigins: readonly string[]; fetch?: typeof globalThis.fetch;
}) {
  const callback = assertTransferUrl(callbackUrl, options.callbackOrigins);
  const original = assertTransferUrl(originalUploadUrl, options.storageOrigins);
  if (!options.secret || !['/renderer/callback', '/renderer/movie-callback'].includes(callback.pathname) || callback.search) throw new Error('Invalid renderer upload authority.');
  const url = new URL(RENDER_UPLOAD_RENEWAL_PATH, callback.origin);
  const body = JSON.stringify({ ...request, occurredAt: Date.now() });
  const signature = createHmac('sha256', options.secret).update(body).digest('hex');
  const response = await (options.fetch ?? globalThis.fetch)(url, {
    method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { 'content-type': 'application/json', 'x-finalframe-renderer-signature': `sha256=${signature}` },
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error('Renderer upload authorization could not renew.'); }
  const receipt = await readBoundedJsonReceipt(response, 4096) as { uploadUrl?: unknown };
  if (typeof receipt?.uploadUrl !== 'string') throw new Error('Renderer upload renewal returned an invalid receipt.');
  const upload = assertTransferUrl(receipt.uploadUrl, options.storageOrigins);
  if (upload.origin !== original.origin || upload.pathname !== '/api/storage/upload') throw new Error('Renderer upload renewal returned an invalid destination.');
  return receipt.uploadUrl;
}

export async function uploadRenderFile(
  url: string,
  outputPath: string,
  options: { allowedOrigins: readonly string[]; maxBytes: number; timeoutMs?: number; fetch?: typeof globalThis.fetch; mimeType?: RenderOutputMimeType; checksum?: string },
): Promise<string> {
  assertTransferUrl(url, options.allowedOrigins);
  const { mimeType } = outputFormatForMimeType(options.mimeType);
  const file = await stat(outputPath);
  if (!file.isFile() || file.size < 1 || file.size > options.maxBytes) throw new Error('Render upload exceeds the configured file limits.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), boundedTransferTimeout(options.timeoutMs, 120_000, 300_000));
  const stream = createReadStream(outputPath, { highWaterMark: 64 * 1024 });
  const abortStream = () => stream.destroy();
  controller.signal.addEventListener('abort', abortStream, { once: true });
  try {
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST', headers: { 'content-type': mimeType, 'content-length': String(file.size), ...(options.checksum ? { digest: `sha-256=${options.checksum}` } : {}) },
      body: stream as unknown as BodyInit, duplex: 'half', redirect: 'error', signal: controller.signal,
    };
    const response = await (options.fetch ?? globalThis.fetch)(url, init);
    if (!response.ok) { await response.body?.cancel(); throw new RenderStorageUploadRejected(response.status); }
    // Bound the receipt as well as the streamed upload. Keep the timeout active
    // until the entire receipt has arrived, including a stalled response body.
    const receipt = await readBoundedJsonReceipt(response, 8_192) as { storageId?: unknown };
    if (typeof receipt.storageId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(receipt.storageId)) throw new Error('Render storage upload returned an invalid receipt.');
    return receipt.storageId;
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', abortStream);
    stream.destroy();
  }
}
