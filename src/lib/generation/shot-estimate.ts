export const SHOT_ESTIMATE_VERSION = 'SHOT_GENERATION_ESTIMATE_V1';
export const SHOT_ESTIMATE_TTL_MS = 30_000;

export interface ShotEstimateConsent { estimateId: string; quoteHash: string }
export interface ShotGenerationEstimate extends ShotEstimateConsent {
    model: string;
    operation: string;
    baseProviderUsd: number;
    providerHoldMicros: number;
    totalCredits: number;
    expiresAt: number;
}

/** JSON normalization also drops optional undefined fields across Convex transport. */
export function stableShotEstimate(value: unknown): string {
    const clean = JSON.parse(JSON.stringify(value));
    function sorted(input: unknown): unknown {
        if (Array.isArray(input)) return input.map(sorted);
        if (input !== null && typeof input === 'object') return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sorted(item)]));
        return input;
    }
    const encoded = JSON.stringify(sorted(clean));
    if (new TextEncoder().encode(encoded).length > 128 * 1024) throw new Error('SHOT_ESTIMATE_INPUT_TOO_LARGE');
    return encoded;
}

export async function shotEstimateHash(value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(stableShotEstimate(value));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function assertShotEstimateTime(createdAt: number, expiresAt: number, now = Date.now()) {
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || createdAt > now + 1000 || expiresAt <= now || expiresAt <= createdAt || expiresAt > createdAt + SHOT_ESTIMATE_TTL_MS) throw new Error('SHOT_ESTIMATE_EXPIRED');
}
