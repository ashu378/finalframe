import type { CreditPack, SupportedCurrency } from './types';

export const BACHS_SANDBOX_BASE_URL = 'https://sandbox-api.bachs.io';
export const BACHS_PRODUCTION_BASE_URL = 'https://api.bachs.io';
export const DEFAULT_BACHS_CURRENCIES: readonly SupportedCurrency[] = ['USD', 'NGN'];

export type BachsEnvironment = 'sandbox' | 'production';

export interface BachsConfig {
    environment: BachsEnvironment;
    baseUrl: string;
    apiKey: string;
    webhookSecret?: string;
    webhookToleranceSeconds: number;
    enabledCurrencies: readonly string[];
}

function nonEmpty(value: string | undefined, name: string): string {
    if (!value?.trim()) throw new Error(`${name} is not configured.`);
    return value.trim();
}

function parseCurrencies(value: string | undefined): readonly string[] {
    const currencies = (value?.split(',') ?? DEFAULT_BACHS_CURRENCIES).map((currency) => currency.trim().toUpperCase()).filter(Boolean);
    if (currencies.length === 0) throw new Error('BACHS_ALLOWED_CURRENCIES must contain at least one currency.');
    return [...new Set(currencies)];
}

export function getBachsConfig(env: NodeJS.ProcessEnv = process.env): BachsConfig {
    const requestedBaseUrl = env.BACHS_API_BASE_URL?.trim();
    const environment: BachsEnvironment = env.BACHS_ENVIRONMENT === 'production' || requestedBaseUrl === BACHS_PRODUCTION_BASE_URL ? 'production' : 'sandbox';
    const expectedBaseUrl = environment === 'production' ? BACHS_PRODUCTION_BASE_URL : BACHS_SANDBOX_BASE_URL;
    const baseUrl = requestedBaseUrl || expectedBaseUrl;
    if (baseUrl !== expectedBaseUrl) throw new Error(`BACHS_API_BASE_URL must be ${expectedBaseUrl} for ${environment}.`);

    const apiKey = nonEmpty(env.BACHS_API_KEY, 'BACHS_API_KEY');
    const expectedKeyPrefix = environment === 'production' ? 'sk_live_' : 'sk_sandbox_';
    if (!apiKey.startsWith(expectedKeyPrefix)) throw new Error(`BACHS_API_KEY must start with ${expectedKeyPrefix} for ${environment}.`);

    const toleranceValue = env.BACHS_WEBHOOK_TOLERANCE_SECONDS?.trim();
    const webhookToleranceSeconds = toleranceValue === undefined ? 300 : Number(toleranceValue);
    if (!Number.isInteger(webhookToleranceSeconds) || webhookToleranceSeconds <= 0) throw new Error('BACHS_WEBHOOK_TOLERANCE_SECONDS must be a positive integer.');

    return {
        environment,
        baseUrl,
        apiKey,
        webhookSecret: env.BACHS_WEBHOOK_SECRET?.trim() || undefined,
        webhookToleranceSeconds,
        enabledCurrencies: parseCurrencies(env.BACHS_ALLOWED_CURRENCIES),
    };
}

export function getBachsWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
    return nonEmpty(env.BACHS_WEBHOOK_SECRET, 'BACHS_WEBHOOK_SECRET');
}

export function isBachsCurrencyConfigured(currency: string, configuredCurrencies: readonly string[] = parseCurrencies(process.env.BACHS_ALLOWED_CURRENCIES)): boolean {
    return configuredCurrencies.includes(currency.trim().toUpperCase());
}

export const CREDIT_PACKS: CreditPack[] = [
    { id: 'starter', label: 'Starter', amounts: { USD: 5, NGN: 7500 }, credits: 100 },
    { id: 'creator', label: 'Creator', amounts: { USD: 10, NGN: 15000 }, credits: 240 },
    { id: 'studio', label: 'Studio', amounts: { USD: 20, NGN: 30000 }, credits: 520 },
];
