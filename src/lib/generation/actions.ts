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
        const job = await convex.mutation(api.generationJobs.create, {
            productionId: input.productionId as any,
            shotId: input.shotId as any,
            provider: capability.provider,
            model: capability.model,
            request: { prompt: shot.prompt, duration: shot.durationSeconds, ratio: production.outputPreset },
            estimatedCost: estimate.totalCredits,
            idempotencyKey,
            capability: 'VIDEO_GENERATION',
            modality: 'VIDEO',
            correlationId: `generation-${input.productionId}-${input.shotId}`,
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

        const current = await convex.query(api.generationJobs.get, { jobId: jobId as any });
        const job = current.job;
        const shot = current.shot;
        const production = current.production;
        if (!shot || !production) return { success: false, error: 'Generation job not found' };
        const processing = await convex.mutation(api.generationJobs.claim, { jobId: jobId as any }) as any;
        const processingJob = processing?.job ?? processing;
        if (!processingJob || processingJob.status !== 'PROCESSING') {
            return { success: false, error: `Job is ${processingJob?.status?.toLowerCase() || 'unavailable'}` };
        }
        const leaseId = processing.leaseId;

        const duration = Math.max(4, Math.min(8, Math.round(Number(shot.durationSeconds)))) as 4 | 6 | 8;
        const result = await executeVideoGeneration('TEXT_TO_VIDEO', shot.prompt, 'FAST_SOCIAL', {
            duration,
            ratio: production.outputPreset === 'SOCIAL_VERTICAL' ? '9:16' : production.outputPreset === 'SQUARE' ? '1:1' : '16:9',
        });
        if (!result.videoUrl) throw new Error(result.error || 'Provider returned no video URL');

        const remoteResponse = await fetch(result.videoUrl);
        if (!remoteResponse.ok) throw new Error(`The provider video could not be downloaded (${remoteResponse.status}).`);
        const bytes = await remoteResponse.arrayBuffer();
        if (bytes.byteLength === 0) throw new Error('The provider returned an empty video.');
        const uploadUrl = await convex.mutation(api.assetStorage.generateUploadUrl, { studioExternalId: production.studioExternalId });
        const upload = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': remoteResponse.headers.get('content-type') || 'video/mp4' }, body: bytes });
        if (!upload.ok) throw new Error('FinalFrame could not store the generated video.');
        const uploaded = await upload.json() as { storageId?: string };
        if (!uploaded.storageId) throw new Error('FinalFrame storage did not return an asset ID.');
        const asset = await convex.mutation(api.assetStorage.ingestAsset, {
            studioExternalId: production.studioExternalId,
            productionId: production._id,
            storageId: uploaded.storageId as any,
            source: 'AI_GENERATED',
            roles: ['GENERATED_VIDEO'],
            mimeType: remoteResponse.headers.get('content-type') || 'video/mp4',
            metadata: { byteSize: bytes.byteLength, durationSeconds: shot.durationSeconds, sourceUrl: result.videoUrl },
            provenance: { provider: result.provider, model: result.model, providerTaskId: result.taskId, generationJobId: jobId },
        });

        const completed = await convex.mutation(api.generationJobs.succeed, {
            jobId: jobId as any,
            leaseId,
            assetId: asset.assetId,
            providerJobId: result.taskId,
            response: result,
            qc: { status: 'PASS', qualityVersion: 'media-ingest-v1', checkedAt: new Date().toISOString(), blockingReasons: [], checks: [{ check: 'MEDIA_INTEGRITY', status: 'PASS', explanation: `${bytes.byteLength} bytes stored in Convex Storage.` }] },
        });
        const reservation = await convex.query(api.credits.getReservationForJob, { generationJobId: jobId as any });
        if (reservation?.status === 'RESERVED') {
            await convex.mutation(api.credits.finalize, { reservationId: reservation._id, outcome: 'COMMIT' });
        }
        return { success: true, assetId: completed.assetId?.toString(), storageId: uploaded.storageId };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Generation failed';
        try {
            const retryable = Boolean((error as { retryable?: boolean }).retryable);
            const failed = await convex.mutation(api.generationJobs.fail, { jobId: jobId as any, errorMessage: message, errorCode: 'PROVIDER_ERROR', retryable });
            const reservation = await convex.query(api.credits.getReservationForJob, { generationJobId: jobId as any });
            if (reservation?.status === 'RESERVED' && failed?.status !== 'RETRYING') {
                await convex.mutation(api.credits.finalize, { reservationId: reservation._id, outcome: 'RELEASE' });
            }
        } catch {
            // Preserve the provider/action error for the caller; reconciliation can recover the job.
        }
        return { success: false, error: message };
    }
}
