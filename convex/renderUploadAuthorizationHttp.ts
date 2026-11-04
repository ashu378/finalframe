import type { FunctionReference } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { validRenderUploadRenewal, type RenderUploadRenewal } from '../renderer/src/contracts/upload-renewal';
import { HEARTBEAT_FRESHNESS_MS } from './renderHeartbeatPolicy';

type RenewalArgs = Omit<RenderUploadRenewal, 'jobId' | 'projectId'> & {
  jobId: Id<'renderJobs'> | Id<'movieMergeJobs'>;
  projectId: Id<'projects'>;
  occurredAt: number;
};
type RenewalReference = FunctionReference<'mutation', 'internal', RenewalArgs, { uploadUrl: string }>;
const maxBody = 4096;

function json(value: unknown, status: number) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export const rendererUploadAuthorization = httpAction(async (ctx, request) => {
  const secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim();
  const signature = request.headers.get('x-finalframe-renderer-signature');
  if (!secret || !signature || !/^sha256=[0-9a-f]{64}$/.test(signature)) return json({ code: 'UPLOAD_RENEWAL_UNAUTHORIZED' }, 401);
  if (Number(request.headers.get('content-length') ?? 0) > maxBody) return json({ code: 'UPLOAD_RENEWAL_TOO_LARGE' }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ code: 'UPLOAD_RENEWAL_INVALID' }, 400);
  const bytes = new Uint8Array(maxBody);
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (size + chunk.value.byteLength > maxBody) return json({ code: 'UPLOAD_RENEWAL_TOO_LARGE' }, 413);
      bytes.set(chunk.value, size);
      size += chunk.value.byteLength;
    }
  } catch { return json({ code: 'UPLOAD_RENEWAL_INVALID' }, 400); }
  finally { await reader.cancel().catch(() => undefined); }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const provided = Uint8Array.from(signature.slice(7).match(/../g)!, pair => Number.parseInt(pair, 16));
  const raw = bytes.subarray(0, size);
  if (!await crypto.subtle.verify('HMAC', key, provided, raw)) return json({ code: 'UPLOAD_RENEWAL_UNAUTHORIZED' }, 401);
  let body: unknown;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { return json({ code: 'UPLOAD_RENEWAL_INVALID' }, 400); }
  if (!validRenderUploadRenewal(body) || Math.abs(Date.now() - body.occurredAt) > HEARTBEAT_FRESHNESS_MS) return json({ code: 'UPLOAD_RENEWAL_INVALID' }, 400);
  const { jobId, projectId, leaseId, attempt, idempotencyKey, identity, byteSize, checksum, mimeType, occurredAt } = body;
  try {
    const { renew } = (internal as unknown as { renderUploadAuthorization: { renew: RenewalReference } }).renderUploadAuthorization;
    const result = await ctx.runMutation(renew, { jobId: jobId as RenewalArgs['jobId'], projectId: projectId as RenewalArgs['projectId'], leaseId, attempt, idempotencyKey, identity, byteSize, checksum, mimeType, occurredAt });
    return json(result, 200);
  } catch { return json({ code: 'UPLOAD_RENEWAL_REJECTED' }, 409); }
});
