import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BoundedDeterministicRenderer, type RenderRequest } from './renderer.js';
import { RemotionRenderRuntime } from './remotion/runtime.js';
import { InjectableFFmpegAdapter, InjectableFFprobeAdapter } from './media/ffmpeg.js';
import { createCallbackBody, sendRendererCallback } from './contracts/callback.js';
import type { RenderManifest, RenderMode } from './types.js';

const port = Number(process.env.PORT ?? 8080);
const secret = process.env.RENDER_WORKER_SHARED_SECRET ?? '';
const outputRoot = process.env.RENDER_OUTPUT_ROOT ?? '/tmp/finalframe-renders';
const rendererVersion = process.env.RENDERER_VERSION ?? 'finalframe-renderer-v1';

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
  requireMediaTools: true,
});
const renderer = new BoundedDeterministicRenderer(runtime, {
  maxDurationInFrames: Number(process.env.RENDER_MAX_FRAMES ?? 18_000),
  maxItems: Number(process.env.RENDER_MAX_ITEMS ?? 200),
  maxOutputBytes: Number(process.env.RENDER_MAX_OUTPUT_BYTES ?? 2_000_000_000),
});

async function render(payload: any) {
  if (secret && payload.secret !== secret) throw new Error('Invalid worker secret.');
  if (!payload.jobId || !payload.manifest) throw new Error('jobId and manifest are required.');
  const jobId = String(payload.jobId);
  const outputPath = join(outputRoot, `${jobId.replace(/[^a-zA-Z0-9._-]/g, '_')}.mp4`);
  await mkdir(outputRoot, { recursive: true });
  const request: RenderRequest = { jobId, manifest: payload.manifest as RenderManifest, outputPath, idempotencyKey: payload.idempotencyKey, correlationId: payload.correlationId, attempt: payload.attempt, mode: (payload.mode ?? 'production') as RenderMode };
  try {
    const result = await renderer.render(request);
    if (payload.storageUploadUrl) {
      const file = await (await import('node:fs/promises')).readFile(result.outputPath);
      const upload = await fetch(payload.storageUploadUrl, { method: 'POST', headers: { 'content-type': 'video/mp4' }, body: file });
      if (!upload.ok) throw new Error(`Storage upload failed with HTTP ${upload.status}.`);
      const uploaded = await upload.json() as { storageId?: string };
      if (!uploaded.storageId) throw new Error('Storage upload did not return a storageId.');
      payload.storageId = uploaded.storageId;
    }
    if (payload.callbackUrl) {
      if (!payload.storageId) throw new Error('storageId is required when callbackUrl is supplied.');
      const callbackBody = createCallbackBody({ eventId: randomUUID(), idempotencyKey: payload.idempotencyKey ?? `render:${jobId}:${result.manifestId}`, jobId, rendererVersion, attempt: payload.attempt ?? 1, eventType: 'render.completed', payload: { storageId: payload.storageId, leaseId: payload.leaseId, mimeType: 'video/mp4', outputPath: result.outputPath, durationInFrames: result.durationInFrames } });
      await sendRendererCallback(payload.callbackUrl, callbackBody, secret);
    }
    return result;
  } catch (error) {
    if (payload.callbackUrl) {
      const callbackBody = createCallbackBody({ eventId: randomUUID(), idempotencyKey: payload.idempotencyKey ?? `render:${jobId}`, jobId, rendererVersion, attempt: payload.attempt ?? 1, eventType: 'render.failed', payload: { leaseId: payload.leaseId, errorCode: 'RENDER_FAILED', errorMessage: error instanceof Error ? error.message : String(error), retryable: true } });
      await sendRendererCallback(payload.callbackUrl, callbackBody, secret).catch(() => undefined);
    }
    throw error;
  } finally {
    if (process.env.RENDER_KEEP_OUTPUT !== 'true') await rm(outputPath, { force: true });
  }
}

createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') return json(response, 200, { ok: true, service: 'finalframe-renderer', rendererVersion });
    if (request.method !== 'POST' || request.url !== '/render') return json(response, 404, { error: 'Not found' });
    const headerSecret = request.headers['x-finalframe-worker-secret'];
    if (secret && headerSecret !== secret) return json(response, 401, { error: 'Unauthorized' });
    const payload = await body(request);
    return json(response, 202, await render({ ...payload, secret: headerSecret }));
  } catch (error) {
    return json(response, 400, { error: error instanceof Error ? error.message : 'Request failed' });
  }
}).listen(port, '0.0.0.0', () => console.log(`FinalFrame renderer listening on 0.0.0.0:${port}`));
