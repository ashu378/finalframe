import { createHmac, timingSafeEqual } from 'node:crypto';
import { getBachsConfig, getBachsWebhookSecret, isBachsCurrencyConfigured, type BachsConfig } from './config';
import type { CheckoutReconciliation, CheckoutSession, CreateCheckoutInput, PaymentProvider, RawWebhookInput, RefundInput, RefundResult, VerifiedPaymentEvent } from './types';

type JsonRecord = Record<string, unknown>;
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function record(value: unknown, field: string): JsonRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Bachs ${field} response must be an object.`);
    return value as JsonRecord;
}

function stringValue(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Bachs ${field} is missing or invalid.`);
    return value;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function decimalValue(value: unknown, field: string): number | undefined {
    if (value === undefined || value === null) return undefined;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Bachs ${field} is invalid.`);
    return parsed;
}

function ensureAmount(amount: number): string {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be greater than zero.');
    return amount.toFixed(2);
}

function ensureUrl(url: string, field: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') throw new Error();
        return parsed.toString();
    } catch {
        throw new Error(`${field} must be an absolute HTTPS URL or localhost URL.`);
    }
}

function errorMessage(body: unknown, status: number): string {
    const parsed = typeof body === 'object' && body !== null ? body as JsonRecord : undefined;
    const detail = parsed?.detail ?? parsed?.message ?? parsed?.error_code;
    return `Bachs request failed (${status})${detail ? `: ${String(detail)}` : ''}`;
}

export class BachsPaymentProvider implements PaymentProvider {
    private readonly config: BachsConfig;
    private readonly fetcher: Fetcher;

    constructor(config: BachsConfig = getBachsConfig(), fetcher: Fetcher = fetch) {
        this.config = config;
        this.fetcher = fetcher;
    }

    async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
        if (!isBachsCurrencyConfigured(input.currency, this.config.enabledCurrencies)) throw new Error(`Currency ${input.currency} is not enabled for Bachs.`);
        const currency = input.currency.trim().toUpperCase();
        const reference = stringValue(input.reference, 'checkout reference');
        const idempotencyKey = stringValue(input.idempotencyKey, 'checkout idempotency key');
        const response = await this.request('/v1/checkout-sessions', {
            method: 'POST',
            headers: { 'Idempotency-Key': idempotencyKey },
            body: {
                pricing: { currency, amount: ensureAmount(input.amount) },
                customer: { email: stringValue(input.customerEmail, 'customer email'), ...(input.customerName ? { name: input.customerName } : {}) },
                success_url: ensureUrl(input.successUrl, 'successUrl'),
                cancel_url: ensureUrl(input.cancelUrl, 'cancelUrl'),
            },
        });
        return { provider: 'bachs', checkoutId: stringValue(response.checkout_id, 'checkout_id'), checkoutUrl: stringValue(response.checkout_url, 'checkout_url'), reference, status: stringValue(response.status, 'status'), expiresAt: optionalString(response.expires_at) };
    }

    verifyWebhook(input: RawWebhookInput): VerifiedPaymentEvent {
        const secret = input.secret || this.config.webhookSecret || getBachsWebhookSecret();
        if (!verifyBachsSignature(input.rawBody, input.timestamp, input.signature, secret, input.toleranceSeconds ?? this.config.webhookToleranceSeconds)) throw new Error('Invalid Bachs webhook signature.');
        let parsed: JsonRecord;
        try {
            parsed = record(JSON.parse(input.rawBody), 'webhook');
        } catch (error) {
            throw new Error(error instanceof Error && error.message.startsWith('Bachs') ? error.message : 'Invalid Bachs webhook JSON.');
        }
        const data = record(parsed.data ?? {}, 'webhook data');
        const eventId = stringValue(parsed.id, 'event id');
        const eventType = stringValue(parsed.type, 'event type');
        const currency = optionalString(data.currency)?.toUpperCase();
        if (eventType === 'collection.succeeded' && currency && !isBachsCurrencyConfigured(currency, this.config.enabledCurrencies)) throw new Error(`Currency ${currency} is not enabled for Bachs.`);
        const metadata = data.metadata === undefined ? undefined : record(data.metadata, 'event metadata');
        return {
            provider: 'bachs', eventId, eventType, createdAt: optionalString(parsed.created_at), checkoutId: optionalString(data.checkout_id), chargeId: optionalString(data.charge_id), status: optionalString(data.status), amount: decimalValue(data.amount, 'event amount'), currency, reference: optionalString(data.reference) || optionalString(metadata?.reference), raw: parsed,
        };
    }

    async reconcileCheckout(checkoutId: string): Promise<CheckoutReconciliation> {
        const id = stringValue(checkoutId, 'checkout id');
        const response = await this.request(`/v1/checkout-sessions/${encodeURIComponent(id)}`, { method: 'GET' });
        return { provider: 'bachs', checkoutId: stringValue(response.checkout_id ?? id, 'checkout_id'), status: stringValue(response.status, 'status'), chargeId: optionalString(response.charge_id), amount: decimalValue(response.amount ?? response.total_amount, 'checkout amount'), currency: optionalString(response.currency)?.toUpperCase(), raw: response };
    }

    async refund(input: RefundInput): Promise<RefundResult> {
        const response = await this.request('/v1/refunds', {
            method: 'POST',
            headers: { 'Idempotency-Key': stringValue(input.idempotencyKey, 'refund idempotency key') },
            body: { charge_id: stringValue(input.chargeId, 'charge id'), reference: stringValue(input.reference, 'refund reference'), ...(input.amount === undefined ? {} : { amount: ensureAmount(input.amount) }), ...(input.reason ? { reason: input.reason } : {}) },
        });
        return { provider: 'bachs', refundId: stringValue(response.refund_id, 'refund_id'), chargeId: stringValue(response.charge_id, 'charge_id'), reference: stringValue(response.reference ?? input.reference, 'refund reference'), status: stringValue(response.status, 'status'), requestedAmount: decimalValue(response.requested_amount, 'requested_amount'), raw: response };
    }

    private async request(path: string, input: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: JsonRecord }): Promise<JsonRecord> {
        const response = await this.fetcher(`${this.config.baseUrl}${path}`, {
            method: input.method,
            headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: 'application/json', ...(input.body ? { 'Content-Type': 'application/json' } : {}), ...input.headers },
            body: input.body ? JSON.stringify(input.body) : undefined,
        });
        const text = await response.text();
        let body: unknown = {};
        try {
            body = text ? JSON.parse(text) : {};
        } catch {
            body = { detail: text };
        }
        if (!response.ok) throw new Error(errorMessage(body, response.status));
        return record(body, 'API');
    }
}

export function verifyBachsSignature(rawBody: string, timestamp: string | null, signature: string | null, secret = process.env.BACHS_WEBHOOK_SECRET, toleranceSeconds = Number(process.env.BACHS_WEBHOOK_TOLERANCE_SECONDS || 300), nowSeconds = Math.floor(Date.now() / 1000)): boolean {
    if (!secret || !timestamp || !signature || !Number.isInteger(toleranceSeconds) || toleranceSeconds <= 0) return false;
    if (!/^\d+$/.test(timestamp)) return false;
    const timestampNumber = Number(timestamp);
    if (!Number.isSafeInteger(timestampNumber) || Math.abs(nowSeconds - timestampNumber) > toleranceSeconds) return false;
    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const signatureBuffer = Buffer.from(signature.trim(), 'utf8');
    return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}
