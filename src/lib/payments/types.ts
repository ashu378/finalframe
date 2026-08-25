export type SupportedCurrency = 'USD' | 'NGN';

export interface CreditPack {
    id: string;
    label: string;
    amounts: Record<SupportedCurrency, number>;
    currency?: SupportedCurrency;
    credits: number;
}

export interface CreateCheckoutInput {
    amount: number;
    currency: string;
    reference: string;
    customerEmail: string;
    customerName?: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
}

export interface CheckoutSession {
    provider: string;
    checkoutId: string;
    checkoutUrl: string;
    reference: string;
    status: string;
    expiresAt?: string;
}

export interface RawWebhookInput {
    rawBody: string;
    timestamp: string | null;
    signature: string | null;
    secret?: string;
    toleranceSeconds?: number;
}

export interface VerifiedPaymentEvent {
    provider: string;
    eventId: string;
    eventType: string;
    createdAt?: string;
    checkoutId?: string;
    chargeId?: string;
    status?: string;
    amount?: number;
    currency?: string;
    reference?: string;
    raw: Record<string, unknown>;
}

export interface CheckoutReconciliation {
    provider: string;
    checkoutId: string;
    status: string;
    chargeId?: string;
    amount?: number;
    currency?: string;
    raw: Record<string, unknown>;
}

export interface RefundInput {
    chargeId: string;
    reference: string;
    reason?: string;
    amount?: number;
    idempotencyKey: string;
}

export interface RefundResult {
    provider: string;
    refundId: string;
    chargeId: string;
    reference: string;
    status: string;
    requestedAmount?: number;
    raw: Record<string, unknown>;
}

export interface PaymentProvider {
    createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
    verifyWebhook(input: RawWebhookInput): VerifiedPaymentEvent;
    reconcileCheckout(checkoutId: string): Promise<CheckoutReconciliation>;
    refund(input: RefundInput): Promise<RefundResult>;
}
