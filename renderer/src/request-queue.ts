import { createHash } from 'node:crypto';

/** Bounded process queue. Convex owns durable jobs and leases; a restart is
 * recovered there. This queue never acknowledges more work than it can hold. */
export class RenderRequestQueue {
  private readonly entries = new Map<string, { fingerprint: string; leaseId?: string; completedAt?: number }>();
  private tail = Promise.resolve();
  private pending = 0;

  constructor(private readonly limit = 4) {}

  get busy() { return this.pending > 0; }

  accept(jobId: string, payload: unknown, work: () => Promise<unknown>) {
    const timestamp = Date.now();
    for (const [id, entry] of this.entries) if (entry.completedAt && (timestamp - entry.completedAt > 600_000 || this.entries.size > 100)) this.entries.delete(id);
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const leaseId = payload && typeof payload === 'object' && 'leaseId' in payload && typeof payload.leaseId === 'string' ? payload.leaseId : undefined;
    const existing = this.entries.get(jobId);
    if (existing) {
      if (existing.fingerprint === fingerprint) return { jobId, accepted: true, duplicate: true };
      if (!existing.completedAt || !leaseId || leaseId === existing.leaseId) throw new Error('RENDER_REQUEST_CONFLICT');
      this.entries.delete(jobId);
    }
    if (this.pending >= this.limit) throw new Error('RENDER_QUEUE_FULL');
    const entry: { fingerprint: string; leaseId?: string; completedAt?: number } = { fingerprint, leaseId };
    this.entries.set(jobId, entry);
    this.pending += 1;
    this.tail = this.tail.then(async () => { await work(); }).catch(() => {
      // render() sends the signed failure callback. Do not log media URLs,
      // credentials, or raw command errors on this public server surface.
      console.error('FinalFrame render failed; see the authenticated job status.');
    }).finally(() => { entry.completedAt = Date.now(); this.pending -= 1; });
    return { jobId, accepted: true, duplicate: false };
  }

  async idle() { await this.tail; }
}
