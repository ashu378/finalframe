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

export interface CallbackVerificationOptions {
  maxAgeMs?: number;
  now?: () => number;
}

export interface CallbackRequestOptions {
  eventId: string;
  idempotencyKey: string;
  jobId: string;
  rendererVersion: string;
  attempt: number;
  eventType: RendererCallbackType;
  payload: Record<string, unknown>;
  occurredAt?: string;
}

export function createCallbackBody(options: CallbackRequestOptions): string {
  const envelope: RendererCallbackEnvelope = {
    version: RENDERER_CALLBACK_VERSION,
    eventId: options.eventId,
    eventType: options.eventType,
    idempotencyKey: options.idempotencyKey,
    jobId: options.jobId,
    rendererVersion: options.rendererVersion,
    occurredAt: options.occurredAt ?? new Date().toISOString(),
    attempt: options.attempt,
    payload: options.payload,
  };
  assertCallbackEnvelope(envelope);
  return JSON.stringify(envelope);
}

export interface CallbackSenderOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

/** Sends the exact signed body and never retries with a new event ID. */
export async function sendRendererCallback(url: string, body: string, secret: string, options: CallbackSenderOptions = {}): Promise<void> {
  if (!/^https:\/\//i.test(url) && !/^http:\/\/localhost(?::\d+)?\//i.test(url)) throw new Error('Renderer callback URL must use HTTPS (localhost HTTP is allowed for development).');
  if (!secret) throw new Error('Renderer callback secret is required.');
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) throw new Error('No fetch implementation is available for renderer callbacks.');
  const controller = new AbortController();
  const timeout = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
  try {
    const response = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'x-finalframe-renderer-signature': signCallbackBody(body, secret) }, body, signal: controller.signal });
    if (!response.ok) throw new Error(`Renderer callback failed with HTTP ${response.status}.`);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function signCallbackBody(rawBody: string, secret: string): string {
  return `${RENDERER_CALLBACK_SIGNATURE_PREFIX}${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

export function verifyCallbackSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = signCallbackBody(rawBody, secret);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

/**
 * Verify and claim a renderer callback before any side effect is performed.
 * The raw body must be passed unchanged from the HTTP request. A duplicate
 * event is acknowledged, but is never handed back to the caller as new work.
 */
export async function handleRendererCallback(
  rawBody: string,
  signature: string,
  secret: string,
  receipts: CallbackReceiptStore,
  options: CallbackVerificationOptions = {},
): Promise<{ result: CallbackHandlingResult; envelope?: RendererCallbackEnvelope }> {
  if (!verifyCallbackSignature(rawBody, signature, secret)) return { result: { status: 'rejected', reason: 'Invalid callback signature' } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
    assertCallbackEnvelope(parsed);
  } catch (error) {
    return { result: { status: 'rejected', reason: error instanceof Error ? error.message : 'Invalid callback body' } };
  }

  const envelope = parsed as RendererCallbackEnvelope;
  const occurredAt = Date.parse(envelope.occurredAt);
  const maxAgeMs = options.maxAgeMs ?? 10 * 60 * 1000;
  const now = options.now?.() ?? Date.now();
  if (!Number.isFinite(occurredAt) || Math.abs(now - occurredAt) > maxAgeMs) return { result: { status: 'rejected', reason: 'Callback timestamp is outside the accepted window' } };

  const existing = await receipts.get(envelope.eventId);
  if (existing) return { result: { status: 'accepted', duplicate: true }, envelope };
  const claimed = await receipts.claim({ eventId: envelope.eventId, idempotencyKey: envelope.idempotencyKey, receivedAt: new Date(now).toISOString(), status: 'processed' });
  if (claimed === 'duplicate') return { result: { status: 'accepted', duplicate: true }, envelope };
  return { result: { status: 'accepted', duplicate: false }, envelope };
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
