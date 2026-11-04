export const RENDER_UPLOAD_RENEWAL_PATH = '/renderer/upload-capability';

export interface RenderUploadRenewal {
  jobId: string;
  projectId: string;
  leaseId: string;
  attempt: number;
  idempotencyKey: string;
  identity: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
}

export function validRenderUploadRenewal(value: unknown): value is RenderUploadRenewal & { occurredAt: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as RenderUploadRenewal & { occurredAt: number };
  return [request.jobId, request.projectId, request.leaseId, request.idempotencyKey, request.identity].every(field =>
    typeof field === 'string' && field.length >= 1 && field.length <= 256) &&
    Number.isSafeInteger(request.attempt) && request.attempt >= 1 && request.attempt <= 3 &&
    Number.isSafeInteger(request.byteSize) && request.byteSize >= 1 && request.byteSize <= 2_000_000_000 &&
    ['video/mp4', 'video/webm', 'video/quicktime'].includes(request.mimeType) &&
    typeof request.checksum === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(request.checksum) &&
    Number.isSafeInteger(request.occurredAt);
}
