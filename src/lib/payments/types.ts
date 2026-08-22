export type SupportedCurrency = 'XAF' | 'XOF' | 'NGN';

export interface CreditPack {
    id: string;
    label: string;
    amounts: Record<SupportedCurrency, number>;
    currency?: SupportedCurrency;
    credits: number;
}

export interface CheckoutSession {
    provider: string;
    checkoutId: string;
    checkoutUrl: string;
    reference: string;
    status: string;
}

export interface PaymentProvider {
    createCheckout(input: {
        amount: number;
        currency: SupportedCurrency;
        reference: string;
        customerEmail: string;
        credits: number;
        successUrl: string;
        cancelUrl: string;
    }): Promise<CheckoutSession>;
}
