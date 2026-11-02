import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

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

export async function uploadRenderFile(
  url: string,
  outputPath: string,
  options: { allowedOrigins: readonly string[]; maxBytes: number; timeoutMs?: number; fetch?: typeof globalThis.fetch },
): Promise<string> {
  assertTransferUrl(url, options.allowedOrigins);
  const file = await stat(outputPath);
  if (!file.isFile() || file.size < 1 || file.size > options.maxBytes) throw new Error('Render upload exceeds the configured file limits.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), boundedTransferTimeout(options.timeoutMs, 120_000, 300_000));
  const stream = createReadStream(outputPath, { highWaterMark: 64 * 1024 });
  const abortStream = () => stream.destroy();
  controller.signal.addEventListener('abort', abortStream, { once: true });
  try {
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST', headers: { 'content-type': 'video/mp4', 'content-length': String(file.size) },
      body: stream as unknown as BodyInit, duplex: 'half', redirect: 'error', signal: controller.signal,
    };
    const response = await (options.fetch ?? globalThis.fetch)(url, init);
    if (!response.ok) { await response.body?.cancel(); throw new Error('Render storage upload was rejected.'); }
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
