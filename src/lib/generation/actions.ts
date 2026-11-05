'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { assertCapability } from '@/lib/ai/capabilities';
import { estimateProductionCost } from '@/lib/credits/service';
import type { QualityTier } from '@/lib/types/database';
import { buildVideoRouteMetadata, normalizeVideoType, selectVideoRoute, videoCatalogFingerprint, videoCatalogQuoteFingerprint, VIDEO_CATALOG_MAX_AGE_MS, VIDEO_OPERATIONS, isSourceVideoEdit, type VideoOperation, type VideoModelCapabilities, type VideoTask, type UpscaleSourceCertificate, type VideoEditSourceCertificate, type LipSyncAudioCertificate, type LipSyncPortraitCertificate } from '@/lib/ai/video-routing';
import { discoverOpenRouterVideoModels } from '@/lib/ai/model-discovery';
import { isFeatureEnabled } from '@/lib/config/feature-flags';
import { supportsCatalogUpscaleControls, validateVideoOperationRequirements, videoTaskForOperation, type ShotOperationControls } from '@/lib/production/workspace-controls';
import { getOutputPreset, OUTPUT_PRESETS } from '../../../renderer/src/output-presets';

function object(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeRatio(value: string | undefined) {
    if (!OUTPUT_PRESETS.some(preset => preset.aspectRatio === value)) throw new Error('OUTPUT_PRESET_INVALID');
    return value!;
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
    const castCode=(error as {data?:{code?:string}})?.data?.code;
    if(['RECIPE_CAST_REFERENCES_REQUIRED','RECIPE_CAST_RESOURCE_UNAVAILABLE','RECIPE_CAST_BINDING_CHANGED'].includes(castCode??''))return 'Approve project character references and a bible, then explicitly bind them to the draft shots before buying a new video take. Existing paid results remain retained.';
    if (error instanceof Error && /OUTPUT_PRESET_INVALID/.test(error.message)) return 'Choose a supported video format before reviewing generation costs.';
    if (error instanceof Error && /SHOT_ESTIMATE_(EXPIRED|CHANGED|REVIEW_REQUIRED)/.test(error.message)) return 'This estimate is no longer valid. Review a fresh estimate before making the take.';
    if (error instanceof Error && /budget|paid testing|not configured|not enabled|verified provider cost/i.test(error.message)) return 'Generation needs an active capped testing budget and a verified model route. Ask an administrator to complete setup.';
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'MISSING_API_KEY') return 'Video generation is not configured yet.';
    if (code === 'PROVIDER_RATE_LIMIT') return 'The video provider is busy. Please try again shortly.';
    if (code === 'PROVIDER_PAYMENT_REQUIRED') return 'Video generation is temporarily unavailable.';
    if (code === 'REQUEST_TIMEOUT' || code === 'NETWORK_ERROR') return 'The video provider did not respond. Please try again.';
    if (code === 'UNSUPPORTED_MODEL' || code === 'UNSUPPORTED_CAPABILITY') return 'This video capability is not available right now.';
    return 'We could not complete this video generation. Please try again.';
}

export async function previewShotGeneration(input: { productionId: string; shotId: string; qualityTier?: QualityTier; requestId: string }) {
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
        const operationControls = { operation, audioPolicy: (typeof shotMetadata.audioPolicy === 'string' ? shotMetadata.audioPolicy : 'SILENT') as ShotOperationControls['audioPolicy'], upscaleFactor: operation === 'UPSCALE' && typeof shotMetadata.upscaleFactor === 'number' ? shotMetadata.upscaleFactor : undefined, creativity: operation === 'UPSCALE' && typeof shotMetadata.creativity === 'number' ? shotMetadata.creativity : undefined, previousJobId: typeof shotMetadata.previousJobId === 'string' ? shotMetadata.previousJobId : undefined, previousModelId: typeof shotMetadata.previousModelId === 'string' ? shotMetadata.previousModelId : undefined, requiresSourceAudioPreservation: shotMetadata.audioPolicy === 'KEEP_SOURCE' || shotMetadata.requiresSourceAudioPreservation === true, requiresMask: shotMetadata.requiresMask === true };
        const videoType = normalizeVideoType(production.projectType || shotContext.project?.projectType || production.preset || production.workflow);
        const outputPreset = String(production.outputPreset || 'LANDSCAPE');
        const typeRoutingEnabled = isFeatureEnabled('videoTypeRouting');
        let aspectRatio = safeRatio(typeof shotMetadata.aspectRatio === 'string' ? shotMetadata.aspectRatio : getOutputPreset(outputPreset).aspectRatio);
        let durationSeconds = Number(shot.durationSeconds);
        const requestedResolution = typeof shotMetadata.resolution === 'string' ? shotMetadata.resolution : undefined;
        const firstFrameAssetId = typeof shotMetadata.firstFrameAssetId === 'string' ? shotMetadata.firstFrameAssetId : undefined;
        const lastFrameAssetId = typeof shotMetadata.lastFrameAssetId === 'string' ? shotMetadata.lastFrameAssetId : undefined;
        const requiresFirstFrame = shotMetadata.requiresFirstFrame === true || requestedTask === 'FRAME_TO_VIDEO' || Boolean(firstFrameAssetId);
        const requiresLastFrame = shotMetadata.requiresLastFrame === true || Boolean(lastFrameAssetId);
        const requiresAudio = shotMetadata.generateAudio === true || shotMetadata.audioPolicy === 'GENERATE';
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
        let editSource: VideoEditSourceCertificate | undefined;
        let lipSyncSource: LipSyncAudioCertificate | undefined;
        let lipSyncPortrait: LipSyncPortraitCertificate | undefined;
        if (operation === 'LIP_SYNC') {
            lipSyncSource = await convex.action(api.audioCertificates.prepareSource, { productionId: input.productionId as any, shotId: input.shotId as any });
            lipSyncPortrait = await convex.action((api as any).imageCertificates.prepareSource, { productionId: input.productionId as any, shotId: input.shotId as any });
            durationSeconds = lipSyncSource!.durationSeconds;
        }
        if (operation === 'UPSCALE') {
            if (requestedResolution) return { success: false, error: 'Upscale output dimensions come from the source and factor. Remove the resolution constraint first.' };
            upscaleSource = await convex.action(api.videoRouting.prepareUpscaleSource, { productionId: input.productionId as any, shotId: input.shotId as any });
            durationSeconds = upscaleSource!.durationSeconds;
            aspectRatio = `${upscaleSource!.width}:${upscaleSource!.height}`;
        }
        if (isSourceVideoEdit(operation)) {
            if (requestedResolution) return { success: false, error: 'Video edit dimensions come from the source. Remove the resolution constraint first.' };
            editSource = await convex.action(api.videoRouting.prepareEditSource, { productionId: input.productionId as any, shotId: input.shotId as any });
            durationSeconds = editSource!.durationSeconds;
            aspectRatio = `${editSource!.width}:${editSource!.height}`;
        }
        let provider = capability.provider;
        let model = capability.model;
        let route: Record<string, unknown> = {
            videoType, task: requestedTask, ...operationControls, upscaleSource, editSource, lipSyncSource, lipSyncPortrait, path: 'AI_VIDEO', routingMode: 'legacy', routeReason: 'Existing generic route retained while type-based routing is disabled.',
            constraints: { durationSeconds, aspectRatio, resolution: requestedResolution, hasImageReferences, hasVideoReference, hasAudioReference: shotContext.hasAudioReference, requiresFirstFrame, requiresLastFrame, requiresAudio },
            referenceAssetIds: references.map((asset) => asset.assetId),
            audioAssetIds: shotContext.audioAssetIds || [],
        };
        let estimatedProviderCostUsd: number | undefined;
        let modelVersion: string | undefined;

        if (typeRoutingEnabled) {
            if (!production.projectId) return { success: false, error: 'This production needs to belong to a project before style-aware generation can run.' };
            try {
                await convex.action(api.videoRouting.refreshReviewedForQuote, { projectId: production.projectId }).catch(() => null);
                const configuration = await convex.query(api.videoRouting.forGeneration, {
                    studioExternalId: production.studioExternalId,
                    videoType: videoType as never,
                    qualityTier: tier as never,
                });
                const live = await discoverOpenRouterVideoModels({ staleIfError: false });
                const liveById = new Map(live.map((entry) => [entry.id, entry]));
                const oldestAllowed = Date.now() - VIDEO_CATALOG_MAX_AGE_MS;
                const models: VideoModelCapabilities[] = configuration.catalog
                    .filter((entry: any) => {
                        const current = liveById.get(entry.modelId);
                        return current && entry.provider === 'openrouter' && entry.available && entry.reviewedAt && entry.lastSeenAt >= oldestAllowed
                            && (!entry.reviewedCatalogFingerprint || entry.reviewedCatalogFingerprint === videoCatalogFingerprint(entry))
                            && videoCatalogQuoteFingerprint(entry) === videoCatalogQuoteFingerprint({ ...current, provider: 'openrouter', modelId: current.id, supportedParameters: current.allowedPassthroughParameters })
                            && (operation !== 'UPSCALE' || supportsCatalogUpscaleControls(current.raw, operationControls.upscaleFactor, operationControls.creativity));
                    })
                    .map((entry: any) => {
                        const current = liveById.get(entry.modelId)!;
                        return {
                            provider: 'openrouter', modelId: entry.modelId, canonicalSlug: current.canonicalSlug, available: true,
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
                    videoType, task: requestedTask, qualityTier: tier, durationSeconds, aspectRatio, ...operationControls, upscaleSource, editSource, lipSyncSource, lipSyncPortrait,
                    resolution: requestedResolution, hasImageReferences, imageReferenceCount: references.filter(asset => String(asset.mimeType).startsWith('image/')).length, hasVideoReference,
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
                    videoType, task: requestedTask, qualityTier: tier, durationSeconds, aspectRatio, ...operationControls, upscaleSource, editSource, lipSyncSource, lipSyncPortrait,
                    resolution: selectedResolution, hasImageReferences, imageReferenceCount: references.filter(asset => String(asset.mimeType).startsWith('image/')).length, hasVideoReference,
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
        const quote = await convex.mutation(api.generationJobs.previewShotEstimate, {
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
        return { success: true as const, quote };
    } catch (error) {
        return { success: false, error: userSafeGenerationError(error) };
    }
}

export async function confirmShotGeneration(input: { estimateId: string; quoteHash: string }) {
    try {
        const convex = await getAuthenticatedConvexClient();
        const job = await convex.mutation(api.generationJobs.createReviewedTake, {
            estimateId: input.estimateId as import('../../../convex/_generated/dataModel').Id<'estimates'>,
            quoteHash: input.quoteHash,
        });
        return { success: true as const, jobId: typeof job?._id === 'string' ? job._id : undefined };
    } catch (error) {
        return { success: false as const, error: userSafeGenerationError(error) };
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
