/** Shared policy for durable renderer handoff; no renderer/network imports. */
export const RENDER_LEASE_MS = 30 * 60 * 1000;
export const RENDER_DISPATCH_LEASE_MS = 60_000;
export const RENDER_RETRY_MS = 15_000;
export const RENDER_MAX_ATTEMPTS = 3;
export const RENDER_TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELED']);
export const RENDER_FIXTURE_MARKER = 'finalframe-render-worker-verification-v1';
export function renderWorkerEnabled() { return process.env.FINALFRAME_RENDER_WORKER_ENABLED === 'true'; }
export function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function safeRenderError(code?: string) {
  if (!code) return undefined;
  if (code === 'RENDER_CONFIGURATION_REQUIRED') return 'Export processing is not configured yet. Your approved timeline is saved.';
  if (code === 'RENDER_SOURCE_UNAVAILABLE') return 'A selected project asset or approval is unavailable. Review the timeline before exporting again.';
  if (code === 'RENDER_MAX_ATTEMPTS') return 'This export needs an administrator check before it can continue.';
  return 'This export could not finish. Your project and approved media are unchanged.';
}
export function publicRenderJob<T extends Record<string, unknown>>(job: T) {
  const { leaseId: _lease, leaseExpiresAt: _leaseExpiry, dispatchLeaseId: _dispatchLease, dispatchLeaseExpiresAt: _dispatchExpiry, dispatchPayload: _payload, callbackIdempotencyKey: _callbackKey, ...safe } = job;
  void _lease; void _leaseExpiry; void _dispatchLease; void _dispatchExpiry; void _payload; void _callbackKey;
  return { ...safe, errorMessage: safeRenderError(typeof job.errorCode === 'string' ? job.errorCode : undefined) };
}
export function dispatchCanRun(job: { status: string; executionStage?: string; acceptedAt?: number; nextDispatchAt?: number; dispatchLeaseExpiresAt?: number }, timestamp: number) {
  if (RENDER_TERMINAL.has(job.status) || job.acceptedAt || job.executionStage === 'AWAITING_CALLBACK') return false;
  if (job.nextDispatchAt && job.nextDispatchAt > timestamp) return false;
  return !job.dispatchLeaseExpiresAt || job.dispatchLeaseExpiresAt <= timestamp;
}
