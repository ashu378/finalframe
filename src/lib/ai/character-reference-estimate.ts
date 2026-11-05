import type { PreparationQuote } from './preparation';
export interface CharacterReferenceEstimateConsent { requestHash: string; model: string; maximumProviderCostUsd: number; expiresAt: number }
export async function characterReferenceRequestHash(productionId: string, text: string, model: string) {
  const bytes = new TextEncoder().encode(JSON.stringify(['CHARACTER_REFERENCE_V1', productionId, text.trim(), model]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function assertCharacterReferenceConsent(consent: CharacterReferenceEstimateConsent, productionId: string, text: string, quote: PreparationQuote, now = Date.now()) {
  if (!consent || !Number.isFinite(consent.expiresAt) || consent.expiresAt < now || consent.expiresAt > now + 31000 || consent.model !== quote.model || !Number.isFinite(consent.maximumProviderCostUsd) || consent.maximumProviderCostUsd <= 0 || consent.maximumProviderCostUsd > 2 || quote.estimatedProviderCostUsd > consent.maximumProviderCostUsd + 0.0000001 || consent.requestHash !== await characterReferenceRequestHash(productionId, text, quote.model)) throw new Error('CHARACTER_REFERENCE_ESTIMATE_REVIEW_REQUIRED');
}
