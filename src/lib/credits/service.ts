import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import type { CostEstimate, CostLineItem, QualityTier } from '@/lib/types/database';

const FALLBACK_PRICES: Record<string, number> = { VIDEO_ECONOMY: 8, VIDEO_STANDARD: 16, VIDEO_PREMIUM: 32, TRANSCRIPTION: 4, CAPTIONS: 2, ASSEMBLY: 3 };
function priceKey(operation: string, tier: QualityTier = 'STANDARD') { return operation === 'VIDEO' ? `${operation}_${tier}` : operation; }

export async function estimateProductionCost(input: { shotCount: number; videoSeconds: number; qualityTier: QualityTier; hasVoice?: boolean; needsCaptions?: boolean; needsAssembly?: boolean }): Promise<CostEstimate> {
    const operations = ['VIDEO', ...(input.hasVoice ? ['TRANSCRIPTION'] : []), ...(input.needsCaptions ? ['CAPTIONS'] : []), ...(input.needsAssembly ? ['ASSEMBLY'] : [])];
    const findRate = (operation: string) => ({ credits: FALLBACK_PRICES[priceKey(operation, input.qualityTier)] ?? FALLBACK_PRICES[operation] ?? 0, unit: operation === 'VIDEO' ? 'second' : 'production' });
    const videoRate = findRate('VIDEO');
    const items: CostLineItem[] = [{ operation: 'VIDEO', quantity: input.videoSeconds, unit: videoRate.unit, credits: Math.ceil(input.videoSeconds * videoRate.credits), description: `${input.shotCount} shot${input.shotCount === 1 ? '' : 's'} at ${input.qualityTier.toLowerCase()} quality` }];
    for (const operation of operations.filter((item) => item !== 'VIDEO')) { const rate = findRate(operation); const quantity = operation === 'TRANSCRIPTION' ? Math.max(1, Math.ceil(input.videoSeconds / 60)) : 1; items.push({ operation, quantity, unit: rate.unit, credits: quantity * rate.credits, description: operation.toLowerCase() }); }
    return { totalCredits: items.reduce((total, item) => total + item.credits, 0), qualityTier: input.qualityTier, lineItems: items, estimateVersion: `pricing-${new Date().toISOString().slice(0, 10)}`, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
}

export async function getStudioCreditBalance(studioId: string): Promise<number> {
    try { return await (await getAuthenticatedConvexClient()).query(api.credits.getBalance, { studioExternalId: studioId }); }
    catch { return 0; }
}

export async function reserveCredits(input: { studioId: string; amount: number; idempotencyKey: string; generationJobId?: string }): Promise<{ success: boolean; reservationId?: string; error?: string }> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) return { success: false, error: 'Credit amount must be positive' };
    try {
        const result = await (await getAuthenticatedConvexClient()).mutation(api.credits.reserve, { studioExternalId: input.studioId, amount: input.amount, idempotencyKey: input.idempotencyKey, generationJobId: input.generationJobId as any });
        return { success: result.status === 'RESERVED', reservationId: result.reservationId.toString(), error: result.status === 'RESERVED' ? undefined : 'Reservation already finalized' };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to reserve credits' }; }
}

export async function finalizeCreditReservation(reservationId: string, outcome: 'COMMIT' | 'RELEASE') {
    try { await (await getAuthenticatedConvexClient()).mutation(api.credits.finalize, { reservationId: reservationId as any, outcome }); return { success: true }; }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to finalize reservation' }; }
}
