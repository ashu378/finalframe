import { randomUUID } from 'node:crypto';

/** Stable request/job identifiers for logs, provider calls, and renderer callbacks. */
export function createCorrelationId(prefix = 'ff') {
  return `${prefix}_${randomUUID()}`;
}

export function createIdempotencyKey(scope: string, id: string, version = '1') {
  return `${scope}:${id}:v${version}`;
}
