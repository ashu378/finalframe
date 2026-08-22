'use server';

import { createClient } from '@/lib/supabase/server';
import { getConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import { assertCapability } from '@/lib/ai/capabilities';
import { estimateProductionCost, finalizeCreditReservation, reserveCredits } from '@/lib/credits/service';
import { executeVideoGeneration } from '@/lib/ai/engine';
import type { QualityTier } from '@/lib/types/database';

async function currentUser() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function createShotGenerationJob(input: { productionId: string; shotId: string; qualityTier?: QualityTier }) {
    const user = await currentUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    try {
        const convex = getConvexClient();
        const { production, shot } = await convex.query(api.generation.getShot, { ownerExternalId: user.id, productionId: input.productionId as any, shotId: input.shotId as any });
        const capability = assertCapability('VIDEO_GENERATION');
        const estimate = await estimateProductionCost({ shotCount: 1, videoSeconds: Math.ceil(Number(shot.durationSeconds)), qualityTier: input.qualityTier || 'STANDARD', needsAssembly: false });
        const idempotencyKey = `shot_${input.shotId}_${Date.now()}`;
        const job = await convex.mutation(api.generation.createJob, { ownerExternalId: user.id, productionId: input.productionId as any, shotId: input.shotId as any, provider: capability.provider, model: capability.model, request: { prompt: shot.prompt, duration: shot.durationSeconds, ratio: production.outputPreset }, estimatedCost: estimate.totalCredits, idempotencyKey });
        const reservation = await reserveCredits({ studioId: production.studioExternalId, amount: estimate.totalCredits, idempotencyKey: `reservation_${job?._id || idempotencyKey}`, generationJobId: job?._id?.toString() });
        if (!reservation.success) {
            await convex.mutation(api.generation.failJob, { ownerExternalId: user.id, jobId: job?._id as any, errorMessage: reservation.error || 'Insufficient credits' });
            return { success: false, error: reservation.error };
        }
        return { success: true, jobId: job?._id?.toString(), reservationId: reservation.reservationId, estimate };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to create generation job' }; }
}

export async function processShotGenerationJob(jobId: string) {
    const user = await currentUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    const convex = getConvexClient();
    try {
        const job = await convex.query(api.generation.getJob, { ownerExternalId: user.id, jobId: jobId as any });
        if (!job.shot || !job.production) return { success: false, error: 'Generation job not found' };
        const processing = await convex.mutation(api.generation.markProcessing, { ownerExternalId: user.id, jobId: jobId as any });
        if (!processing || processing.status !== 'PROCESSING') return { success: false, error: `Job is ${processing?.status?.toLowerCase() || 'unavailable'}` };
        const duration = Math.max(4, Math.min(8, Math.round(Number(job.shot.durationSeconds)))) as 4 | 6 | 8;
        const result = await executeVideoGeneration('TEXT_TO_VIDEO', job.shot.prompt, 'FAST_SOCIAL', { duration, ratio: job.production.outputPreset === 'SOCIAL_VERTICAL' ? '9:16' : job.production.outputPreset === 'SQUARE' ? '1:1' : '16:9' });
        if (!result.videoUrl) throw new Error(result.error || 'Provider returned no video URL');
        const completed = await convex.mutation(api.generation.completeJob, { ownerExternalId: user.id, jobId: jobId as any, assetUrl: result.videoUrl, providerJobId: result.taskId, response: result });
        const reservation = await reserveCredits({ studioId: job.production.studioExternalId, amount: job.estimatedCost, idempotencyKey: `reservation_${jobId}`, generationJobId: jobId });
        if (reservation.reservationId) await finalizeCreditReservation(reservation.reservationId, 'COMMIT');
        return { success: true, videoUrl: result.videoUrl, assetId: completed.assetId.toString() };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Generation failed';
        try { await convex.mutation(api.generation.failJob, { ownerExternalId: user.id, jobId: jobId as any, errorMessage: message }); } catch { /* preserve original provider error */ }
        const job = await convex.query(api.generation.getJob, { ownerExternalId: user.id, jobId: jobId as any }).catch(() => null);
        if (job?.production) { const reservation = await reserveCredits({ studioId: job.production.studioExternalId, amount: job.estimatedCost, idempotencyKey: `reservation_${jobId}`, generationJobId: jobId }); if (reservation.reservationId) await finalizeCreditReservation(reservation.reservationId, 'RELEASE'); }
        return { success: false, error: message };
    }
}
