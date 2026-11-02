import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { BoundedDeterministicRenderer, type RenderRequest } from './renderer.js';
import { RemotionRenderRuntime } from './remotion/runtime.js';
import { InjectableFFmpegAdapter, InjectableFFprobeAdapter } from './media/ffmpeg.js';
import { sendRendererCallback } from './contracts/callback.js';
import type { RenderManifest, RenderMode } from './types.js';
import { probeRemoteMedia } from './media/remote-probe.js';
import { validateManifest } from './manifest.js';
import { RenderRequestQueue } from './request-queue.js';
import { assertTransferUrl, transferOrigins, uploadRenderFile } from './worker-transfer.js';
import { CompletionOutbox, FileRenderReceiptStore, type CompletionRequest } from './completion-outbox.js';
import { LeaseHeartbeatMonitor } from './lease-heartbeat.js';
import { HeavyMediaGate } from './media/heavy-media-gate.js';
import { analyzeCanonicalAudio } from './media/beat-analysis.js';
import { BEAT_ANALYSIS_VERSION } from './media/beat-detector.js';

const port = Number(process.env.PORT ?? 8080);
const secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim() ?? '';
const outputRoot = process.env.RENDER_OUTPUT_ROOT ?? '/tmp/finalframe-renders';
const rendererVersion = process.env.RENDERER_VERSION ?? 'finalframe-renderer-v1';
const renderQueue = new RenderRequestQueue(4);
const heavyMedia = new HeavyMediaGate(() => renderQueue.busy);
const mediaHosts = (process.env.RENDER_MEDIA_ALLOWED_HOSTS ?? '').split(',').map(host => host.trim()).filter(Boolean);
const callbackOrigins = transferOrigins(process.env.RENDER_CALLBACK_ORIGINS, mediaHosts, 'callback');
const storageOrigins = transferOrigins(process.env.RENDER_STORAGE_ORIGINS, mediaHosts, 'storage');
const stateRoot = process.env.RENDER_STATE_ROOT ?? join(outputRoot, '.worker-state');
const receipts = new FileRenderReceiptStore(join(stateRoot, 'receipts'));
const maxOutputBytes = Number(process.env.RENDER_MAX_OUTPUT_BYTES ?? 2_000_000_000);
const heartbeatMonitor = new LeaseHeartbeatMonitor({ secret, allowedOrigins: callbackOrigins });

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage): Promise<any> {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 2_000_000) throw new Error('Request body is too large.');
  }
  return JSON.parse(raw || '{}');
}

const runtime = new RemotionRenderRuntime({
  entryPoint: process.env.REMOTION_ENTRYPOINT ?? join(process.cwd(), 'dist/remotion/entry.js'),
  ffmpeg: new InjectableFFmpegAdapter(),
  ffprobe: new InjectableFFprobeAdapter(),
  maxConcurrency: Number(process.env.RENDER_MAX_CONCURRENCY ?? 1),
  commandTimeoutMs: Number(process.env.RENDER_COMMAND_TIMEOUT_MS ?? 900_000),
  maxOutputBytes: Number(process.env.RENDER_MAX_OUTPUT_BYTES ?? 2_000_000_000),
  bundleCache: new Map(),
  mediaPolicy: { allowedRemoteHosts: mediaHosts },
  requireMediaTools: true,
});
const renderer = new BoundedDeterministicRenderer(runtime, {
  maxDurationInFrames: Number(process.env.RENDER_MAX_FRAMES ?? 18_000),
  maxItems: Number(process.env.RENDER_MAX_ITEMS ?? 200),
  maxOutputBytes: Number(process.env.RENDER_MAX_OUTPUT_BYTES ?? 2_000_000_000),
  allowedRemoteHosts: mediaHosts,
}, receipts);

const outbox = new CompletionOutbox({
  root: join(stateRoot, 'outbox'), outputRoot, receipts,
  keepOutput: process.env.RENDER_KEEP_OUTPUT === 'true',
  onPending: record => heartbeatMonitor.track(record),
  onDelivered: record => heartbeatMonitor.stop(record.key),
  onAttention: record => { heartbeatMonitor.stop(record.key); console.error('FinalFrame worker finishing exceeded its recovery window; retained artifact requires administrator attention.'); },
  upload: (request, result) => uploadRenderFile(request.storageUploadUrl, result.outputPath, { allowedOrigins: storageOrigins, maxBytes: maxOutputBytes, timeoutMs: Number(process.env.RENDER_UPLOAD_TIMEOUT_MS ?? 120_000) }),
  callback: (request, exactBody) => sendRendererCallback(request.callbackUrl, exactBody, secret, { allowedOrigins: callbackOrigins, timeoutMs: Number(process.env.RENDER_CALLBACK_TIMEOUT_MS ?? 15_000) }),
});

async function render(payload: any) {
  if (!secret) throw new Error('Renderer authentication is not configured.');
  if (payload.secret !== secret) throw new Error('Invalid worker secret.');
  if (!payload.jobId || !payload.manifest) throw new Error('jobId and manifest are required.');
  const jobId = String(payload.jobId);
  const completionRequest: CompletionRequest = { jobId, leaseId: payload.leaseId, attempt: payload.attempt ?? 1, projectId: String(payload.manifest.projectId), manifestId: payload.manifest.manifestId, durationInFrames: payload.manifest.output.durationInFrames, idempotencyKey: payload.idempotencyKey ?? `render:${jobId}:${payload.manifest.manifestId}`, callbackUrl: payload.callbackUrl, storageUploadUrl: payload.storageUploadUrl, heartbeatUrl: payload.heartbeatUrl, rendererVersion };
  // Never persist the shared secret. The request fingerprint binds the exact
  // original payload and prevents a restarted worker reusing another request.
  const { secret: _secret, ...originalPayload } = payload;
  void _secret;
  let completion = await outbox.begin(completionRequest, originalPayload);
  if (completion.stage !== 'RENDERING') { await outbox.deliver(completion); return; }
  const outputPath = join(outputRoot, `${completion.key}.mp4`);
  await mkdir(outputRoot, { recursive: true });
  const request: RenderRequest = { jobId, manifest: payload.manifest as RenderManifest, outputPath, idempotencyKey: payload.idempotencyKey, correlationId: payload.correlationId, attempt: payload.attempt, mode: (payload.mode ?? 'production') as RenderMode };
  let result;
  try { result = await renderer.render(request); }
  catch (error) { completion = await outbox.failed(completion); await outbox.deliver(completion); throw error; }
  completion = await outbox.rendered(completion, result);
  await outbox.deliver(completion);
}

// Recover local verified receipts before accepting work. Transfer retries run
// independently of HTTP acknowledgement and never purchase/re-render media.
await outbox.recover();
void outbox.drain().catch(() => console.error('FinalFrame worker finishing state requires administrator attention.'));
const retryTimer = setInterval(() => { void outbox.drain().catch(() => console.error('FinalFrame worker finishing state requires administrator attention.')); }, 15_000);
retryTimer.unref();
const heartbeatTimer = setInterval(() => { void heartbeatMonitor.tick(); }, 30_000);
heartbeatTimer.unref();

createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') return json(response, 200, { ok: true, service: 'finalframe-renderer', rendererVersion, beatAnalysis: { algorithmVersion: BEAT_ANALYSIS_VERSION, enabled: process.env.FINALFRAME_BEAT_ANALYSIS_ENABLED === 'true' } });
    if (request.method !== 'POST' || !['/render', '/media/probe', '/media/analyze-beats'].includes(request.url ?? '')) return json(response, 404, { error: 'Not found' });
    if (!secret) return json(response, 503, { error: 'Renderer authentication is not configured.' });
    const headerSecret = request.headers['x-finalframe-worker-secret'];
    if (headerSecret !== secret) return json(response, 401, { error: 'Unauthorized' });
    const payload = await body(request);
    if (request.url === '/media/probe') {
      const release = heavyMedia.tryAcquireMedia();
      if (!release) return json(response, 429, { error: 'FinalFrame media processing is busy. Retry the existing job later.' });
      try {
        const result = await probeRemoteMedia(payload.url, {
          kind: payload.kind === 'audio' ? 'audio' : 'video',
          allowedHosts: mediaHosts,
          ffprobe: new InjectableFFprobeAdapter(),
        });
        return json(response, 200, result);
      } finally { release(); }
    }
    if (request.url === '/media/analyze-beats') {
      if (process.env.FINALFRAME_BEAT_ANALYSIS_ENABLED !== 'true') return json(response, 503, { error: 'Beat analysis is not enabled.' });
      const release = heavyMedia.tryAcquireMedia();
      if (!release) return json(response, 429, { error: 'FinalFrame media processing is busy. Retry the existing job later.' });
      try {
        const result = await analyzeCanonicalAudio(payload, { allowedHosts: mediaHosts, ffmpeg: new InjectableFFmpegAdapter(), ffprobe: new InjectableFFprobeAdapter(), cacheRoot: join(stateRoot, 'beat-cache') });
        return json(response, 200, result);
      } finally { release(); }
    }
    if (
      typeof payload.jobId !== 'string' || !/^[a-zA-Z0-9._-]{1,180}$/.test(payload.jobId)
      || typeof payload.callbackUrl !== 'string' || typeof payload.storageUploadUrl !== 'string'
      || typeof payload.leaseId !== 'string' || !payload.leaseId || payload.leaseId.length > 512 || /[\u0000\r\n]/.test(payload.leaseId)
      || payload.attempt !== undefined && (!Number.isInteger(payload.attempt) || payload.attempt < 1)
      || payload.idempotencyKey !== undefined && (typeof payload.idempotencyKey !== 'string' || !payload.idempotencyKey.trim() || payload.idempotencyKey.length > 1_024)
    ) return json(response, 400, { error: 'A leased render job, storage upload, and callback are required.' });
    assertTransferUrl(payload.callbackUrl, callbackOrigins);
    assertTransferUrl(payload.storageUploadUrl, storageOrigins);
    if (payload.heartbeatUrl !== undefined) {
      const heartbeat = assertTransferUrl(payload.heartbeatUrl, callbackOrigins);
      if (heartbeat.pathname !== '/renderer/heartbeat' || heartbeat.search) throw new Error('Invalid worker heartbeat endpoint.');
    }
    if (!validateManifest(payload.manifest).ok) return json(response, 400, { error: 'Invalid render manifest.' });
    if (!heavyMedia.acceptsRender) return json(response, 429, { error: 'FinalFrame media processing is busy. Retry the existing job later.' });
    return json(response, 202, renderQueue.accept(payload.jobId, payload, () => render({ ...payload, secret: headerSecret })));
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return json(response, code === 'RENDER_QUEUE_FULL' ? 429 : code === 'RENDER_REQUEST_CONFLICT' ? 409 : 400,
      { error: code === 'RENDER_QUEUE_FULL' ? 'Renderer is busy. Retry the existing job later.' : code === 'RENDER_REQUEST_CONFLICT' ? 'This render job already has a different request.' : 'Request could not be processed.' });
  }
}).listen(port, '0.0.0.0', () => console.log(`FinalFrame renderer listening on 0.0.0.0:${port}`));
