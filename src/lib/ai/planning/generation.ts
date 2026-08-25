import type { AIErrorCode, FeatureFlag, FeatureFlagKey, FeatureFlagSet, ProviderTaskStatus, RetryClassification, RetryReasonCode } from '../types';

export type ProviderFailure = {
    code?: AIErrorCode;
    status?: number;
    message?: string;
    providerStateUnknown?: boolean;
    canceledByUser?: boolean;
    attempt: number;
    maxAttempts: number;
    retryAfterSeconds?: number;
};

function mapReasonCode(failure: ProviderFailure): RetryReasonCode {
    if (failure.canceledByUser) return 'CANCELED_BY_USER';
    if (failure.providerStateUnknown) return 'UNKNOWN_PROVIDER_STATE';
    switch (failure.code) {
        case 'PROVIDER_RATE_LIMIT': return 'RATE_LIMITED';
        case 'PROVIDER_UNAVAILABLE': return 'PROVIDER_UNAVAILABLE';
        case 'NETWORK_ERROR': return 'NETWORK_ERROR';
        case 'REQUEST_TIMEOUT': return 'REQUEST_TIMEOUT';
        case 'UNSUPPORTED_CAPABILITY': return 'UNSUPPORTED_CAPABILITY';
        case 'PROVIDER_AUTHENTICATION': return 'AUTHENTICATION_FAILED';
        case 'INVALID_REQUEST': return 'INVALID_REQUEST';
        default: return 'UNKNOWN_PROVIDER_STATE';
    }
}

/** Classify provider failures without making a retry decision in UI code. */
export function classifyProviderFailure(failure: ProviderFailure): RetryClassification {
    const reasonCode = mapReasonCode(failure);
    if (failure.canceledByUser) {
        return { disposition: 'CANCELED', reasonCode, retryable: false, reason: failure.message ?? 'Canceled by the user.', attempt: failure.attempt, maxAttempts: failure.maxAttempts };
    }
    if (failure.providerStateUnknown) {
        return { disposition: 'RECONCILIATION_REQUIRED', reasonCode, retryable: false, reason: failure.message ?? 'The provider state is unknown and must be reconciled before retrying.', attempt: failure.attempt, maxAttempts: failure.maxAttempts };
    }
    const retryableCode = reasonCode === 'RATE_LIMITED' || reasonCode === 'PROVIDER_UNAVAILABLE' || reasonCode === 'NETWORK_ERROR' || reasonCode === 'REQUEST_TIMEOUT';
    if (!retryableCode) {
        return { disposition: 'NON_RETRYABLE', reasonCode, retryable: false, reason: failure.message ?? 'The provider rejected this request.', attempt: failure.attempt, maxAttempts: failure.maxAttempts };
    }
    if (failure.attempt >= failure.maxAttempts) {
        return { disposition: 'TIMED_OUT', reasonCode, retryable: false, reason: failure.message ?? 'The provider did not complete within the retry limit.', attempt: failure.attempt, maxAttempts: failure.maxAttempts };
    }
    const exponentialDelay = Math.min(300, 2 ** Math.max(0, failure.attempt - 1) * 5);
    return { disposition: 'RETRYABLE', reasonCode, retryable: true, reason: failure.message ?? 'The provider failure can be retried safely.', attempt: failure.attempt, maxAttempts: failure.maxAttempts, retryAfterSeconds: failure.retryAfterSeconds ?? exponentialDelay };
}

export function isTerminalProviderTaskStatus(status: ProviderTaskStatus): boolean {
    return status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELED' || status === 'TIMED_OUT' || status === 'RECONCILIATION_REQUIRED';
}

export function canRetryProviderTask(status: ProviderTaskStatus, retry?: RetryClassification): boolean {
    return status !== 'SUCCEEDED' && status !== 'CANCELED' && status !== 'RECONCILIATION_REQUIRED' && Boolean(retry?.retryable);
}

export function isFeatureEnabled(flags: FeatureFlagSet, key: FeatureFlagKey, audience: 'INTERNAL' | 'BETA' | 'PUBLIC' = 'PUBLIC'): boolean {
    const flag: FeatureFlag | undefined = flags[key];
    if (!flag || flag.expiresAt && Date.parse(flag.expiresAt) <= Date.now()) return false;
    if (flag.state === 'ENABLED') return true;
    if (flag.state === 'BETA') return audience === 'BETA' || audience === 'INTERNAL';
    return flag.state === 'INTERNAL' && audience === 'INTERNAL';
}
