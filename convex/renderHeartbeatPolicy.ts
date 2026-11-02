export const HEARTBEAT_FRESHNESS_MS = 60_000;
export const HEARTBEAT_LEASE_MS = 5 * 60_000;
export const CALLBACK_RECEIPT_REPLAY_MAX_MS = 24 * 60 * 60_000;
export const RENDER_ATTEMPT_MAX_MS = 2 * 60 * 60_000;

export interface HeartbeatJob {
  projectId?: string; status: string; leaseId?: string; leaseExpiresAt?: number;
  acceptedAt?: number; dispatchAttempt?: number; progress: number;
  lastHeartbeatOccurredAt?: number;
}

export function heartbeatPatch(job: HeartbeatJob, input: { projectId: string; leaseId: string; attempt: number; occurredAt: number; stage: string; progress?: number }, timestamp: number) {
  if (!['PROCESSING', 'SUBMITTED'].includes(job.status) || !job.leaseId || job.leaseId !== input.leaseId || !job.leaseExpiresAt || job.leaseExpiresAt <= timestamp) throw new Error('Inactive renderer lease.');
  if (job.projectId !== input.projectId || (job.dispatchAttempt ?? 1) !== input.attempt) throw new Error('Renderer heartbeat ownership mismatch.');
  if (!Number.isFinite(input.occurredAt) || Math.abs(timestamp - input.occurredAt) > HEARTBEAT_FRESHNESS_MS) throw new Error('Stale renderer heartbeat.');
  if (!['RENDERING', 'UPLOADING', 'CALLBACK_PENDING'].includes(input.stage)) throw new Error('Invalid renderer stage.');
  if (input.progress !== undefined && (!Number.isFinite(input.progress) || input.progress < 0 || input.progress > 99)) throw new Error('Invalid renderer progress.');
  if (job.acceptedAt === undefined) throw Object.assign(new Error('Renderer acceptance acknowledgement is pending.'), { code: 'HEARTBEAT_ACCEPTANCE_PENDING' });
  const maximum = job.acceptedAt + RENDER_ATTEMPT_MAX_MS;
  if (timestamp >= maximum) throw new Error('Renderer attempt wallclock exceeded.');
  if (input.occurredAt <= (job.lastHeartbeatOccurredAt ?? -Infinity)) return null;
  return { leaseExpiresAt: Math.min(timestamp + HEARTBEAT_LEASE_MS, maximum), lastHeartbeatAt: timestamp, lastHeartbeatOccurredAt: input.occurredAt, executionStage: input.stage, progress: Math.max(job.progress, input.progress ?? job.progress), updatedAt: timestamp };
}

/** A delivery signature permits retrying one unchanged event after an outage. */
export function validCallbackTime(occurredAt: number, timestamp: number, verifiedDeliveryAt?: number) {
  if (!Number.isFinite(occurredAt) || occurredAt > timestamp + HEARTBEAT_FRESHNESS_MS) return false;
  if (verifiedDeliveryAt === undefined) return Math.abs(timestamp - occurredAt) <= 10 * 60_000;
  return Number.isFinite(verifiedDeliveryAt) && Math.abs(timestamp - verifiedDeliveryAt) <= HEARTBEAT_FRESHNESS_MS && timestamp - occurredAt <= RENDER_ATTEMPT_MAX_MS;
}


/** No-side-effect receipt acknowledgement only. New completion remains <=2h. */
export function validCallbackReceiptReplayTime(occurredAt: number, timestamp: number, verifiedDeliveryAt?: number) {
  return verifiedDeliveryAt !== undefined && Number.isFinite(verifiedDeliveryAt) && Math.abs(timestamp - verifiedDeliveryAt) <= HEARTBEAT_FRESHNESS_MS && Number.isFinite(occurredAt) && occurredAt <= timestamp + HEARTBEAT_FRESHNESS_MS && timestamp - occurredAt <= CALLBACK_RECEIPT_REPLAY_MAX_MS;
}

export function canReconcileAcceptedCompletion(job: HeartbeatJob & { executionStage?: string; callbackIdempotencyKey?: string; idempotencyKey: string }, input: { projectId: string; leaseId?: string; attempt: number; idempotencyKey: string; event: string; eventType: string; occurredAt: number; verifiedDeliveryAt?: number }, timestamp: number) {
  return ['PROCESSING', 'SUBMITTED'].includes(job.status) && job.executionStage === 'RECONCILIATION_REQUIRED' && typeof job.acceptedAt === 'number' && Number.isFinite(job.acceptedAt) && job.acceptedAt <= timestamp && timestamp - job.acceptedAt <= RENDER_ATTEMPT_MAX_MS && Boolean(job.leaseId) && job.leaseId === input.leaseId && typeof job.leaseExpiresAt === 'number' && job.leaseExpiresAt <= timestamp && job.projectId === input.projectId && input.attempt === (job.dispatchAttempt ?? 1) && input.idempotencyKey === (job.callbackIdempotencyKey ?? job.idempotencyKey) && input.event === 'COMPLETED' && input.eventType === 'render.completed' && input.verifiedDeliveryAt !== undefined && validCallbackTime(input.occurredAt, timestamp, input.verifiedDeliveryAt);
}
