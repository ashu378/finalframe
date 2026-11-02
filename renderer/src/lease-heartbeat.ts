import { randomUUID } from 'node:crypto';
import { signCallbackBody } from './contracts/callback.js';
import { assertTransferUrl, boundedTransferTimeout, readBoundedJsonReceipt } from './worker-transfer.js';
import type { CompletionRecord } from './completion-outbox.js';

export interface HeartbeatOptions {
  secret: string;
  allowedOrigins: readonly string[];
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  now?: () => number;
}

/** This endpoint never accepts browser/session authority. The coordinator
 * authenticates this exact body and renews only its current accepted lease. */
export async function sendLeaseHeartbeat(record: CompletionRecord, options: HeartbeatOptions): Promise<'active' | 'denied'> {
  if (!record.request.heartbeatUrl) return 'denied';
  if (!options.secret) throw new Error('Worker heartbeat authentication is not configured.');
  const url = assertTransferUrl(record.request.heartbeatUrl, options.allowedOrigins);
  if (url.pathname !== '/renderer/heartbeat' || url.search) throw new Error('Invalid worker heartbeat endpoint.');
  const stage = record.stage === 'RENDERING' ? 'RENDERING' : record.stage === 'UPLOAD_PENDING' ? 'UPLOADING' : 'CALLBACK_PENDING';
  const body = JSON.stringify({ version: 1, eventId: randomUUID(), jobId: record.request.jobId, projectId: record.request.projectId, attempt: record.request.attempt, leaseId: record.request.leaseId, occurredAt: new Date(options.now?.() ?? Date.now()).toISOString(), stage });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), boundedTransferTimeout(options.timeoutMs, 10_000, 10_000));
  try {
    const response = await (options.fetch ?? globalThis.fetch)(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-renderer-signature': signCallbackBody(body, options.secret), 'x-finalframe-worker-secret': options.secret }, body, redirect: 'error', signal: controller.signal });
    if ([401, 403, 404, 409, 410].includes(response.status)) { await response.body?.cancel(); return 'denied'; }
    // 425 means this exact lease is awaiting its lost/delayed HTTP202 ack.
    // It grants no renewal and remains retryable on the next monitor tick.
    if (!response.ok) { await response.body?.cancel(); throw new Error('Worker heartbeat temporarily unavailable.'); }
    const receipt = await readBoundedJsonReceipt(response, 4_096) as { leaseExpiresAt?: unknown; cancellationRequested?: unknown };
    if (receipt.cancellationRequested === true) return 'denied';
    if (typeof receipt.leaseExpiresAt !== 'number' || receipt.leaseExpiresAt <= (options.now?.() ?? Date.now())) throw new Error('Worker heartbeat returned an invalid receipt.');
    return 'active';
  } finally { clearTimeout(timeout); }
}

export class LeaseHeartbeatMonitor {
  private readonly pending = new Map<string, CompletionRecord>();
  private readonly denied = new Set<string>();
  private ticking?: Promise<void>;
  constructor(private readonly options: HeartbeatOptions) {}
  track(record: CompletionRecord) {
    if (record.request.heartbeatUrl && !this.denied.has(record.key) && !['DELIVERED', 'NEEDS_ATTENTION'].includes(record.stage)) this.pending.set(record.key, record);
  }
  stop(key: string) { this.pending.delete(key); }
  tick(): Promise<void> {
    if (this.ticking) return this.ticking;
    this.ticking = this.tickOnce().finally(() => { this.ticking = undefined; });
    return this.ticking;
  }
  private async tickOnce() {
    for (const record of this.pending.values()) {
      if ((this.options.now?.() ?? Date.now()) - record.createdAt >= 2 * 60 * 60 * 1000) { this.stop(record.key); continue; }
      try {
        if (await sendLeaseHeartbeat(record, this.options) === 'denied') { this.stop(record.key); this.denied.add(record.key); }
      } catch { /* Transient transport errors do not change lease authority. */ }
    }
  }
}
