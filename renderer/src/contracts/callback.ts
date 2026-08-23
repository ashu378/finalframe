import { createHmac, timingSafeEqual } from 'node:crypto';

export const RENDERER_CALLBACK_VERSION = 1 as const;
export const RENDERER_CALLBACK_SIGNATURE_PREFIX = 'sha256=' as const;

export type RendererCallbackType = 'render.completed' | 'render.failed' | 'render.cancelled';

export interface RendererCallbackEnvelope<TPayload = Record<string, unknown>> {
  version: typeof RENDERER_CALLBACK_VERSION;
  eventId: string;
  eventType: RendererCallbackType;
  idempotencyKey: string;
  jobId: string;
  rendererVersion: string;
  occurredAt: string;
  attempt: number;
  payload: TPayload;
}

export interface AuthenticatedRendererCallback<TPayload = Record<string, unknown>> extends RendererCallbackEnvelope<TPayload> {
  signature: string;
}

export interface CallbackReceipt {
  eventId: string;
  idempotencyKey: string;
  receivedAt: string;
  status: 'processed' | 'rejected';
}

export interface CallbackReceiptStore {
  get(eventId: string): Promise<CallbackReceipt | null>;
  claim(receipt: CallbackReceipt): Promise<'claimed' | 'duplicate'>;
}

export type CallbackHandlingResult =
  | { status: 'accepted'; duplicate: false }
  | { status: 'accepted'; duplicate: true }
  | { status: 'rejected'; reason: string };

export function signCallbackBody(rawBody: string, secret: string): string {
  return `${RENDERER_CALLBACK_SIGNATURE_PREFIX}${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

export function verifyCallbackSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = signCallbackBody(rawBody, secret);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function assertCallbackEnvelope(input: unknown): asserts input is RendererCallbackEnvelope {
  if (typeof input !== 'object' || input === null) throw new Error('Renderer callback must be an object');
  const value = input as Record<string, unknown>;
  if (value.version !== RENDERER_CALLBACK_VERSION) throw new Error('Unsupported renderer callback version');
  for (const key of ['eventId', 'idempotencyKey', 'jobId', 'rendererVersion', 'occurredAt']) {
    if (typeof value[key] !== 'string' || value[key].length === 0) throw new Error(`Renderer callback ${key} is required`);
  }
  if (!['render.completed', 'render.failed', 'render.cancelled'].includes(value.eventType as string)) throw new Error('Unsupported renderer callback event type');
  if (!Number.isInteger(value.attempt) || (value.attempt as number) < 1) throw new Error('Renderer callback attempt must be a positive integer');
  if (typeof value.payload !== 'object' || value.payload === null || Array.isArray(value.payload)) throw new Error('Renderer callback payload must be an object');
}
