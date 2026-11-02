'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { assertCapability } from '@/lib/ai/capabilities';
import { estimateProductionCost } from '@/lib/credits/service';
import type { QualityTier } from '@/lib/types/database';
import { buildVideoRouteMetadata, normalizeVideoType, selectVideoRoute, VIDEO_OPERATIONS, type VideoOperation, type VideoModelCapabilities, type VideoTask, type UpscaleSourceCertificate } from '@/lib/ai/video-routing';
import { discoverOpenRouterVideoModels } from '@/lib/ai/model-discovery';
import { isFeatureEnabled } from '@/lib/config/feature-flags';
import { supportsCatalogUpscaleControls, validateVideoOperationRequirements, videoTaskForOperation, type ShotOperationControls } from '@/lib/production/workspace-controls';

function object(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeRatio(value: string | undefined) {
    return value === '9:16' || value === '1:1' || value === '16:9' ? value : '16:9';
}

function generationTask(value: unknown): VideoTask {
    return value === 'EDIT' || value === 'EXTEND' || value === 'FRAME_TO_VIDEO' ? value : 'GENERATE';
}

function routingFailure(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/premium model|administrator/i.test(message)) return 'This finish level is not configured yet. Ask an administrator to approve a compatible model route.';
    if (/supports all requested|within the configured spending cap/i.test(message)) return 'No available video model supports all the requested controls and spending limits.';
    return 'A compatible video route is not available for this request. An administrator can refresh the model catalog and review its capabilities.';
}

function userSafeGenerationError(error: unknown): string {
    if (error instanceof Error && /budget|paid testing|not configured|not enabled|verified provider cost/i.test(error.message)) return 'Generation needs an active capped testing budget and a verified model route. Ask an administrator to complete setup.';
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'MISSING_API_KEY') return 'Video generation is not configured yet.';
    if (code === 'PROVIDER_RATE_LIMIT') return 'The video provider is busy. Please try again shortly.';
    if (code === 'PROVIDER_PAYMENT_REQUIRED') return 'Video generation is temporarily unavailable.';
    if (code === 'REQUEST_TIMEOUT' || code === 'NETWORK_ERROR') return 'The video provider did not respond. Please try again.';
    if (code === 'UNSUPPORTED_MODEL' || code === 'UNSUPPORTED_CAPABILITY') return 'This video capability is not available right now.';
    return 'We could not complete this video generation. Please try again.';
}

export async function createShotGenerationJob(input: { productionId: string; shotId: string; qualityTier?: QualityTier; requestId: string }) {
    try {
        const convex = await getAuthenticatedConvexClient();
        const account = await convex.query(api.account.current, {});
        if (!account?.user) return { success: false, error: 'Unauthorized' };

        const shotContext = await convex.query(api.generation.getShot, {
            productionId: input.productionId as any,
            shotId: input.shotId as any,
        });
        const { production, shot } = shotContext;
        const executionProfile = input.qualityTier === 'PREMIUM' ? 'PREMIUM' : input.qualityTier === 'STANDARD' ? 'COMMERCIAL' : 'FAST_SOCIAL';
        const capabilityId = executionProfile === 'FAST_SOCIAL' ? 'VIDEO_PREVIEW' : 'VIDEO_FINAL';
        const capability = assertCapability(capabilityId);
        const tier = input.qualityTier || 'STANDARD';
        const shotMetadata = object(shot.metadata);
        const operation: VideoOperation = (VIDEO_OPERATIONS as readonly unknown[]).includes(shotMetadata.operation) ? shotMetadata.operation as VideoOperation : generationTask(shotMetadata.videoTask);
        const requestedTask = videoTaskForOperation(operation);
        const operationControls = { operation, upscaleFactor: operation === 'UPSCALE' && typeof shotMetadata.upscaleFactor === 'number' ? shotMetadata.upscaleFactor : undefined, creativity: operation === 'UPSCALE' && typeof shotMetadata.creativity === 'number' ? shotMetadata.creativity : undefined, previousJobId: typeof shotMetadata.previousJobId === 'string' ? shotMetadata.previousJobId : undefined, previousModelId: typeof shotMetadata.previousModelId === 'string' ? shotMetadata.previousModelId : undefined, requiresSourceAudioPreservation: shotMetadata.audioPolicy === 'KEEP_SOURCE' || shotMetadata.requiresSourceAudioPreservation === true, requiresMask: shotMetadata.requiresMask === true };
        const videoType = normalizeVideoType(shotContext.project?.projectType || production.projectType || production.preset || production.workflow);
        const outputPreset = String(production.outputPreset || 'LANDSCAPE');
        const typeRoutingEnabled = isFeatureEnabled('videoTypeRouting');
        let aspectRatio = safeRatio(typeof shotMetadata.aspectRatio === 'string' ? shotMetadata.aspectRatio : outputPreset === 'SOCIAL_VERTICAL' ? '9:16' : outputPreset === 'SQUARE' ? '1:1' : '16:9');
        let durationSeconds = Number(shot.durationSeconds);
        const requestedResolution = typeof shotMetadata.resolution === 'string' ? shotMetadata.resolution : undefined;
        const firstFrameAssetId = typeof shotMetadata.firstFrameAssetId === 'string' ? shotMetadata.firstFrameAssetId : undefined;
        const lastFrameAssetId = typeof shotMetadata.lastFrameAssetId === 'string' ? shotMetadata.lastFrameAssetId : undefined;
        const requiresFirstFrame = shotMetadata.requiresFirstFrame === true || requestedTask === 'FRAME_TO_VIDEO' || Boolean(firstFrameAssetId);
        const requiresLastFrame = shotMetadata.requiresLastFrame === true || Boolean(lastFrameAssetId);
        const requiresAudio = shotMetadata.generateAudio === true;
        const references = shotContext.referenceAssets || [];
        const frameAssetIds = new Set([firstFrameAssetId, lastFrameAssetId].filter((value): value is string => Boolean(value)));
        const hasImageReferences = references.some((asset) => String(asset.mimeType).startsWith('image/') && !frameAssetIds.has(asset.assetId));
        const hasVideoReference = references.some((asset) => String(asset.mimeType).startsWith('video/'));
        try {
            validateVideoOperationRequirements({ operation, audioPolicy: shotMetadata.audioPolicy as ShotOperationControls['audioPolicy'], hasImageReferences, hasVideoReference, hasAudioReference: shotContext.hasAudioReference === true, firstFrameAssetId, previousJobId: operationControls.previousJobId, previousModelId: operationControls.previousModelId, upscaleFactor: operationControls.upscaleFactor, upscaleMode: operationControls.creativity === 0 ? 'PRECISE' : operationControls.creativity === 1 ? 'CREATIVE' : undefined });
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Check the operation source media.' };
        }
        if (requiresFirstFrame && !firstFrameAssetId) return { success: false, error: 'Choose a project image for the first frame before generating this shot.' };
        if (requiresLastFrame && !lastFrameAssetId) return { success: false, error: 'Choose a project image for the last frame before generating this shot.' };
        if (firstFrameAssetId && !references.some((asset) => asset.assetId === firstFrameAssetId && String(asset.mimeType).startsWith('image/'))) return { success: false, error: 'The first frame must be an image stored in this project.' };
        if (lastFrameAssetId && !references.some((asset) => asset.assetId === lastFrameAssetId && String(asset.mimeType).startsWith('image/'))) return { success: false, error: 'The last frame must be an image stored in this project.' };
        if (!typeRoutingEnabled && (operation !== 'GENERATE' || hasImageReferences || shotContext.hasAudioReference || requiresFirstFrame || requiresLastFrame || requiresAudio || requestedResolution)) {
            return { success: false, error: 'This shot needs a verified style-aware route for its media or output controls. Ask an administrator to enable and configure video routing.' };
        }
        if (!typeRoutingEnabled && videoType === 'MOTION_GRAPHICS') {
            return { success: false, error: 'Motion graphics use deterministic renderer templates. Open the production editor and add a designed graphics clip.' };
        }
        let upscaleSource: UpscaleSourceCertificate | undefined;
        if (operation === 'UPSCALE') {
            if (requestedResolution) return { success: false, error: 'Upscale output dimensions come from the source and factor. Remove the resolution constraint first.' };
            upscaleSource = await convex.action(api.videoRouting.prepareUpscaleSource, { productionId: input.productionId as any, shotId: input.shotId as any });
            durationSeconds = upscaleSource!.durationSeconds;
            aspectRatio = `${upscaleSource!.width}:${upscaleSource!.height}`;
        }
        let provider = capability.provider;
        let model = capability.model;
        let route: Record<string, unknown> = {
            videoType, task: requestedTask, ...operationControls, upscaleSource, path: 'AI_VIDEO', routingMode: 'legacy', routeReason: 'Existing generic route retained while type-based routing is disabled.',
            constraints: { durationSeconds, aspectRatio, resolution: requestedResolution, hasImageReferences, hasVideoReference, hasAudioReference: shotContext.hasAudioReference, requiresFirstFrame, requiresLastFrame, requiresAudio },
            referenceAssetIds: references.map((asset) => asset.assetId),
            audioAssetIds: shotContext.audioAssetIds || [],
        };
        let estimatedProviderCostUsd: number | undefined;
        let modelVersion: string | undefined;

        if (typeRoutingEnabled) {
            if (!production.projectId) return { success: false, error: 'This production needs to belong to a project before style-aware generation can run.' };
            try {
                const configuration = await convex.query(api.videoRouting.forGeneration, {
                    studioExternalId: production.studioExternalId,
                    videoType: videoType as never,
                    qualityTier: tier as never,
                });
                const live = await discoverOpenRouterVideoModels({ staleIfError: false });
                const liveById = new Map(live.map((entry) => [entry.id, entry]));
                const models: VideoModelCapabilities[] = configuration.catalog
                    .filter((entry: any) => entry.provider === 'openrouter' && entry.available && entry.reviewedAt && liveById.has(entry.modelId) && (operation !== 'UPSCALE' || supportsCatalogUpscaleControls(liveById.get(entry.modelId)!.raw, operationControls.upscaleFactor, operationControls.creativity)))
                    .map((entry: any) => {
                        const current = liveById.get(entry.modelId)!;
                        return {
                            provider: 'openrouter', modelId: entry.modelId, available: true,
                            supportsTextToVideo: entry.supportsTextToVideo,
                            supportsImageReferences: entry.supportsImageReferences,
                            supportsVideoReferences: entry.supportsVideoReferences,
                            supportsFirstFrame: entry.supportsFirstFrame,
                            supportsLastFrame: entry.supportsLastFrame,
                            supportsVideoEdit: entry.supportsVideoEdit,
                            supportsVideoExtension: entry.supportsVideoExtension,
                            supportsAudio: entry.supportsAudio,
                            supportsAudioReferences: entry.supportsAudioReferences,
                            supportsPerformanceTransfer: entry.supportsPerformanceTransfer,
                            supportsLipSync: entry.supportsLipSync,
                            supportsUpscale: entry.supportsUpscale, upscaleFactor: current.upscaleFactor, creativityLevels: current.creativityLevels,
                            supportsSourceAudioPreservation: entry.supportsSourceAudioPreservation,
                            supportsCombinedFrameReferences: entry.supportsCombinedFrameReferences,
                            reviewedOperations: entry.reviewedOperations,
                            catalogFingerprint: entry.catalogFingerprint,
                            reviewedCatalogFingerprint: entry.reviewedCatalogFingerprint,
                            supportedDurations: current.supportedDurations,
                            supportedResolutions: current.supportedResolutions,
                            supportedAspectRatios: current.supportedAspectRatios,
                            supportedSizes: current.supportedSizes,
                            estimatedCostPerSecond: current.pricingSkus['per-video-second'] ?? entry.estimatedCostPerSecond,
                            pricingSkus: current.pricingSkus,
                            supportedParameters: current.allowedPassthroughParameters,
                        };
                    });
                const policy = configuration.policy ? {
                    videoType, qualityTier: tier, path: configuration.policy.path,
                    preferredModelIds: configuration.policy.preferredModelIds,
                    maxCostUsd: configuration.policy.maxCostUsd,
                    updatedAt: configuration.policy.updatedAt,
                } : undefined;
                const selection = selectVideoRoute({
                    videoType, task: requestedTask, qualityTier: tier, durationSeconds, aspectRatio, ...operationControls, upscaleSource,
                    resolution: requestedResolution, hasImageReferences, hasVideoReference,
                    hasAudioReference: shotContext.hasAudioReference,
                    requiresFirstFrame, requiresLastFrame, requiresAudio,
                }, models, policy);
                if (selection.path === 'MOTION_GRAPHICS') {
                    return { success: false, error: 'This project is routed to deterministic motion graphics. Create the graphics in the renderer timeline instead of submitting an AI video job.' };
                }
                provider = selection.provider;
                model = selection.modelId;
                estimatedProviderCostUsd = selection.estimatedCostUsd;
                const selectedResolution = selection.resolution || requestedResolution;
                modelVersion = `video-catalog:${configuration.catalog.reduce((latest: number, entry: any) => Math.max(latest, entry.lastSeenAt || 0), 0)}:policy:${selection.policyVersion || 0}`;
                route = buildVideoRouteMetadata({
                    videoType, task: requestedTask, qualityTier: tier, durationSeconds, aspectRatio, ...operationControls, upscaleSource,
                    resolution: selectedResolution, hasImageReferences, hasVideoReference,
                    hasAudioReference: shotContext.hasAudioReference, requiresFirstFrame, requiresLastFrame, requiresAudio,
                }, selection, {
                    modelVersion, referenceAssetIds: references.map((asset) => asset.assetId),
                    audioAssetIds: shotContext.audioAssetIds || [], costCeilingUsd: policy?.maxCostUsd,
                });
            } catch (error) {
                return { success: false, error: routingFailure(error) };
            }
        }
        const estimate = await estimateProductionCost({
            shotCount: 1,
            videoSeconds: Math.ceil(durationSeconds),
            qualityTier: tier,
            needsAssembly: false,
        });
        if (!/^[a-zA-Z0-9-]{16,100}$/.test(input.requestId)) return { success: false, error: 'Start a new generation request.' };
        const idempotencyKey = `shot_${input.shotId}_${input.requestId}`;
        const job = await convex.mutation(api.generationJobs.create, {
            productionId: input.productionId as any,
            shotId: input.shotId as any,
            provider,
            model,
            modelVersion,
            request: { ...operationControls, prompt: shot.prompt, duration: durationSeconds, ratio: aspectRatio, qualityTier: tier, executionProfile, previousJobId: typeof shotMetadata.previousJobId === 'string' ? shotMetadata.previousJobId : undefined, ...route },
            estimatedCost: estimate.totalCredits,
            estimatedProviderCostUsd,
            idempotencyKey,
            capability: capabilityId,
            modality: 'VIDEO',
            correlationId: `generation-${input.productionId}-${input.shotId}`,
        });
        return { success: true, jobId: typeof job?._id === 'string' ? job._id : undefined, estimate };
    } catch (error) {
        return { success: false, error: userSafeGenerationError(error) };
    }
}

/** Compatibility handoff: the authenticated request only schedules work.
 * Provider IDs, leases, output ingestion, and settlement stay inside Convex.
 */
export async function processShotGenerationJob(jobId: string) {
    try {
        const convex = await getAuthenticatedConvexClient();
        const state = await convex.mutation(api.generationJobs.enqueue, { jobId: jobId as any });
        return { success: true, jobId, status: state.status, progress: state.progress };
    } catch (error) {
        return { success: false, error: userSafeGenerationError(error) };
    }
}
