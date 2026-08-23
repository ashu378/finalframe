'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { assertCapability } from '@/lib/ai/capabilities';
import { estimateProductionCost } from '@/lib/credits/service';
import { executeVideoGeneration } from '@/lib/ai/engine';
import type { QualityTier } from '@/lib/types/database';

export async function createShotGenerationJob(input: { productionId: string; shotId: string; qualityTier?: QualityTier }) {
    try {
        const convex = await getAuthenticatedConvexClient();
        const account = await convex.query(api.account.current, {});
        if (!account?.user) return { success: false, error: 'Unauthorized' };

        const { production, shot } = await convex.query(api.generation.getShot, {
            productionId: input.productionId as any,
            shotId: input.shotId as any,
        });
        const capability = assertCapability('VIDEO_GENERATION');
        const estimate = await estimateProductionCost({
            shotCount: 1,
            videoSeconds: Math.ceil(Number(shot.durationSeconds)),
            qualityTier: input.qualityTier || 'STANDARD',
            needsAssembly: false,
        });
        const idempotencyKey = `shot_${input.productionId}_${input.shotId}_${input.qualityTier || 'STANDARD'}`;
        const job = await convex.mutation(api.generation.createJob, {
            productionId: input.productionId as any,
            shotId: input.shotId as any,
            provider: capability.provider,
            model: capability.model,
            request: { prompt: shot.prompt, duration: shot.durationSeconds, ratio: production.outputPreset },
            estimatedCost: estimate.totalCredits,
            idempotencyKey,
        });
        const jobId = job?._id as any;
        const reservation = await convex.mutation(api.credits.reserve, {
            studioExternalId: production.studioExternalId,
            amount: estimate.totalCredits,
            idempotencyKey: `generation:${jobId}`,
            generationJobId: jobId,
        });
        return { success: true, jobId: jobId?.toString(), reservationId: reservation.reservationId.toString(), estimate };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unable to create generation job' };
    }
}

export async function processShotGenerationJob(jobId: string) {
    const convex = await getAuthenticatedConvexClient();
    try {
        const account = await convex.query(api.account.current, {});
        if (!account?.user) return { success: false, error: 'Unauthorized' };

        const job = await convex.query(api.generation.getJob, { jobId: jobId as any });
        if (!job.shot || !job.production) return { success: false, error: 'Generation job not found' };
        const processing = await convex.mutation(api.generation.markProcessing, { jobId: jobId as any });
        if (!processing || processing.status !== 'PROCESSING') {
            return { success: false, error: `Job is ${processing?.status?.toLowerCase() || 'unavailable'}` };
        }

        const duration = Math.max(4, Math.min(8, Math.round(Number(job.shot.durationSeconds)))) as 4 | 6 | 8;
        const result = await executeVideoGeneration('TEXT_TO_VIDEO', job.shot.prompt, 'FAST_SOCIAL', {
            duration,
            ratio: job.production.outputPreset === 'SOCIAL_VERTICAL' ? '9:16' : job.production.outputPreset === 'SQUARE' ? '1:1' : '16:9',
        });
        if (!result.videoUrl) throw new Error(result.error || 'Provider returned no video URL');

        const completed = await convex.mutation(api.generation.completeJob, {
            jobId: jobId as any,
            assetUrl: result.videoUrl,
            providerJobId: result.taskId,
            response: result,
        });
        const reservation = await convex.mutation(api.credits.reserve, {
            studioExternalId: job.production.studioExternalId,
            amount: job.estimatedCost,
            idempotencyKey: `generation:${jobId}`,
            generationJobId: jobId as any,
        });
        if (reservation.status === 'RESERVED') {
            await convex.mutation(api.credits.finalize, { reservationId: reservation.reservationId, outcome: 'COMMIT' });
        }
        return { success: true, videoUrl: result.videoUrl, assetId: completed.assetId.toString() };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Generation failed';
        try {
            await convex.mutation(api.generation.failJob, { jobId: jobId as any, errorMessage: message });
            const job = await convex.query(api.generation.getJob, { jobId: jobId as any });
            if (job.production) {
                const reservation = await convex.mutation(api.credits.reserve, {
                    studioExternalId: job.production.studioExternalId,
                    amount: job.estimatedCost,
                    idempotencyKey: `generation:${jobId}`,
                    generationJobId: jobId as any,
                });
                if (reservation.status === 'RESERVED') {
                    await convex.mutation(api.credits.finalize, { reservationId: reservation.reservationId, outcome: 'RELEASE' });
                }
            }
        } catch {
            // Preserve the provider/action error for the caller; reconciliation can recover the job.
        }
        return { success: false, error: message };
    }
}
