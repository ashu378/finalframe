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
  if (code === 'RENDER_GRAPHICS_CAPABILITY_REQUIRED') return 'These graphics need an updated renderer. Your approved timeline is saved.';
  if (code === 'RENDER_GRAPHICS_CAPABILITY_UNAVAILABLE') return 'Renderer graphics support could not be verified. The saved export will retry safely.';
  if (code === 'RENDER_GRAPHICS_HANDOFF_UNKNOWN') return 'The renderer may have accepted these graphics. FinalFrame will not start another render automatically.';
  if (code === 'RENDER_RECONCILIATION_REQUIRED') return 'The saved render result needs recovery. FinalFrame will not start another render automatically.';
  if (code === 'RENDER_RECOVERY_WINDOW_EXPIRED') return 'The retained render result needs an administrator check before it can be recovered.';
  if (code === 'RENDER_MAX_ATTEMPTS') return 'This export needs an administrator check before it can continue.';
  return 'This export could not finish. Your project and approved media are unchanged.';
}
export function publicRenderJob<T extends Record<string, unknown>>(job: T) {
  const { leaseId: _lease, leaseExpiresAt: _leaseExpiry, dispatchLeaseId: _dispatchLease, dispatchLeaseExpiresAt: _dispatchExpiry, dispatchPayload: _payload, callbackIdempotencyKey: _callbackKey, ...safe } = job;
  void _lease; void _leaseExpiry; void _dispatchLease; void _dispatchExpiry; void _payload; void _callbackKey;
  return { ...safe, errorMessage: safeRenderError(typeof job.errorCode === 'string' ? job.errorCode : undefined) };
}
export function dispatchCanRun(job: { status: string; executionStage?: string; acceptedAt?: number; nextDispatchAt?: number; dispatchLeaseExpiresAt?: number }, timestamp: number) {
  if (RENDER_TERMINAL.has(job.status) || job.acceptedAt !== undefined || ['AWAITING_CALLBACK', 'RECONCILIATION_REQUIRED', 'NEEDS_ATTENTION'].includes(job.executionStage || '')) return false;
  if (job.nextDispatchAt && job.nextDispatchAt > timestamp) return false;
  return !job.dispatchLeaseExpiresAt || job.dispatchLeaseExpiresAt <= timestamp;
}
