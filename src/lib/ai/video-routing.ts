import type { QualityTier } from '../types/database';

export const VIDEO_TYPES = [
    'ANIMATED_COMEDY_2D',
    'REALISTIC_SKIT_UGC',
    'PRODUCT_SAAS_LAUNCH',
    'MOTION_GRAPHICS',
    'EXPLAINER_STORY',
    'CINEMATIC_FILM',
    'MUSIC_VIDEO',
    'SOCIAL_CUTDOWN',
] as const;

export type VideoType = (typeof VIDEO_TYPES)[number];
export type VideoTask = 'GENERATE' | 'EDIT' | 'EXTEND' | 'FRAME_TO_VIDEO';
export const VIDEO_OPERATIONS = ['GENERATE', 'FRAME_TO_VIDEO', 'EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE', 'PERFORMANCE_TRANSFER', 'EXTEND', 'LIP_SYNC', 'UPSCALE'] as const;
export type VideoOperation = typeof VIDEO_OPERATIONS[number];
export type VideoAudioPolicy = 'KEEP_SOURCE' | 'USE_RECORDING' | 'GENERATE' | 'SILENT';
export type VideoProductionPath = 'AI_VIDEO' | 'MOTION_GRAPHICS' | 'COMPOSITED';

export const VIDEO_TYPE_LABELS: Record<VideoType, string> = {
    ANIMATED_COMEDY_2D: '2D comedy and character animation',
    REALISTIC_SKIT_UGC: 'Realistic skits and UGC',
    PRODUCT_SAAS_LAUNCH: 'Product and SaaS launch ads',
    MOTION_GRAPHICS: 'Motion graphics',
    EXPLAINER_STORY: 'Explainers and narrated stories',
    CINEMATIC_FILM: 'Cinematic shorts and films',
    MUSIC_VIDEO: 'Music videos',
    SOCIAL_CUTDOWN: 'Social cutdowns and repurposing',
};

export interface VideoModelCapabilities {
    provider: string;
    modelId: string;
    available: boolean;
    supportsTextToVideo: boolean;
    supportsImageReferences: boolean;
    supportsVideoReferences: boolean;
    supportsFirstFrame: boolean;
    supportsLastFrame: boolean;
    supportsVideoEdit: boolean;
    supportsVideoExtension: boolean;
    supportsAudio: boolean;
    supportsAudioReferences?: boolean;
    supportsPerformanceTransfer?: boolean;
    supportsLipSync?: boolean;
    supportsUpscale?: boolean;
    supportsSourceAudioPreservation?: boolean;
    supportsCombinedFrameReferences?: boolean;
    /** Advanced operations require explicit endpoint review; catalog presence is insufficient. */
    reviewedOperations?: readonly VideoOperation[];
    supportedDurations: number[];
    supportedResolutions: string[];
    supportedAspectRatios: string[];
    supportedSizes?: string[];
    estimatedCostPerSecond?: number;
    pricingSkus?: Record<string, number>;
    supportedParameters: string[];
}

export interface VideoRoutingRequest {
    videoType: VideoType;
    task: VideoTask;
    operation?: VideoOperation;
    audioPolicy?: VideoAudioPolicy;
    previousJobId?: string;
    previousModelId?: string;
    requiresSourceAudioPreservation?: boolean;
    requiresMask?: boolean;
    qualityTier: QualityTier;
    durationSeconds: number;
    aspectRatio: string;
    resolution?: string;
    hasImageReferences?: boolean;
    hasVideoReference?: boolean;
    hasAudioReference?: boolean;
    imageReferenceCount?: number;
    requiresFirstFrame?: boolean;
    requiresLastFrame?: boolean;
    requiresAudio?: boolean;
    maximumCostUsd?: number;
}

export interface VideoRoutePolicy {
    videoType: VideoType;
    qualityTier: QualityTier;
    path: VideoProductionPath;
    preferredModelIds: string[];
    maxCostUsd?: number;
    updatedAt?: number;
    updatedBy?: string;
}

export interface VideoRouteSelection {
    provider: string;
    modelId: string;
    path: VideoProductionPath;
    routeReason: string;
    estimatedCostUsd?: number;
    resolution?: string;
    policyVersion?: number;
}

export function buildVideoRouteMetadata(
    request: VideoRoutingRequest,
    selection: VideoRouteSelection,
    options: { modelVersion?: string; referenceAssetIds?: string[]; audioAssetIds?: string[]; costCeilingUsd?: number } = {},
) {
    return {
        ...request,
        routingMode: 'dynamic' as const,
        path: selection.path,
        routeReason: selection.routeReason,
        provider: selection.provider,
        model: selection.modelId,
        policyVersion: selection.policyVersion,
        modelVersion: options.modelVersion,
        estimatedProviderCostUsd: selection.estimatedCostUsd,
        maximumCostUsd: options.costCeilingUsd,
        referenceAssetIds: options.referenceAssetIds || [],
        audioAssetIds: options.audioAssetIds || [],
    };
}

export function normalizeVideoType(value: unknown): VideoType {
    if (typeof value === 'string' && (VIDEO_TYPES as readonly string[]).includes(value)) return value as VideoType;
    const legacy = String(value || '').toLowerCase();
    if (legacy.includes('comedy') || legacy.includes('cartoon')) return 'ANIMATED_COMEDY_2D';
    if (legacy.includes('ugc') || legacy.includes('skit') || legacy.includes('avatar')) return 'REALISTIC_SKIT_UGC';
    if (legacy.includes('motion')) return 'MOTION_GRAPHICS';
    if (legacy.includes('explain') || legacy.includes('voiceover') || legacy.includes('story')) return 'EXPLAINER_STORY';
    if (legacy.includes('film') || legacy.includes('cinematic')) return 'CINEMATIC_FILM';
    if (legacy.includes('music')) return 'MUSIC_VIDEO';
    if (legacy.includes('social') || legacy.includes('short')) return 'SOCIAL_CUTDOWN';
    if (legacy.includes('product') || legacy.includes('saas') || legacy.includes('commercial') || legacy.includes('business_ad')) return 'PRODUCT_SAAS_LAUNCH';
    return 'SOCIAL_CUTDOWN';
}

export function defaultVideoProductionPath(videoType: VideoType): VideoProductionPath {
    if (videoType === 'MOTION_GRAPHICS') return 'MOTION_GRAPHICS';
    if (videoType === 'PRODUCT_SAAS_LAUNCH' || videoType === 'EXPLAINER_STORY' || videoType === 'MUSIC_VIDEO') return 'COMPOSITED';
    return 'AI_VIDEO';
}

export function videoModelSupportsRequest(model: VideoModelCapabilities, request: VideoRoutingRequest): boolean {
    if (!model.available) return false;
    if (!Number.isFinite(request.durationSeconds) || request.durationSeconds < 1) return false;
    if (request.maximumCostUsd !== undefined && (!Number.isFinite(request.maximumCostUsd) || request.maximumCostUsd < 0)) return false;
    const operation = request.operation || request.task;
    if (!(VIDEO_OPERATIONS as readonly string[]).includes(operation)) return false;
    // The portable API has no mask contract. Never silently drop a requested mask.
    if (request.requiresMask) return false;
    if (operation !== 'GENERATE' && operation !== 'FRAME_TO_VIDEO' && !model.reviewedOperations?.includes(operation)) return false;
    if (operation === 'GENERATE' && !model.supportsTextToVideo) return false;
    if (operation === 'FRAME_TO_VIDEO' && !model.supportsFirstFrame) return false;
    if (['EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE'].includes(operation) && (!model.supportsVideoEdit || !request.hasVideoReference)) return false;
    if (operation === 'PERFORMANCE_TRANSFER' && (!model.supportsPerformanceTransfer || !request.hasVideoReference || !request.hasImageReferences)) return false;
    if (operation === 'EXTEND' && (!model.supportsVideoExtension || !request.previousJobId || request.previousModelId !== model.modelId)) return false;
    if (operation === 'LIP_SYNC' && (!model.supportsLipSync || !request.hasAudioReference || (!request.hasImageReferences && !request.hasVideoReference))) return false;
    if (operation === 'UPSCALE' && (!model.supportsUpscale || !request.hasVideoReference)) return false;
    if (request.hasAudioReference && !model.supportsAudioReferences) return false;
    if (request.requiresSourceAudioPreservation && !model.supportsSourceAudioPreservation) return false;
    // Several endpoints give frame_images precedence and ignore all references.
    if ((request.requiresFirstFrame || request.requiresLastFrame) && (request.hasImageReferences || request.hasVideoReference || request.hasAudioReference) && !model.supportsCombinedFrameReferences) return false;
    if (request.hasImageReferences && !model.supportsImageReferences) return false;
    if (request.hasVideoReference && !model.supportsVideoReferences) return false;
    if (request.requiresFirstFrame && !model.supportsFirstFrame) return false;
    if (request.requiresLastFrame && !model.supportsLastFrame) return false;
    if (request.requiresAudio && !model.supportsAudio) return false;
    if (!model.supportedDurations.includes(request.durationSeconds)) return false;
    if (request.resolution && !model.supportedResolutions.includes(request.resolution)) return false;
    if (!model.supportedAspectRatios.includes(request.aspectRatio)) return false;
    const estimatedCostUsd = estimateVideoCost(model, request);
    if (estimatedCostUsd === undefined) return false;
    if (request.maximumCostUsd !== undefined && estimatedCostUsd > request.maximumCostUsd) return false;
    return true;
}

export function estimateVideoCost(model: VideoModelCapabilities, request: VideoRoutingRequest): number | undefined {
    const skus = Object.entries(model.pricingSkus || {}).filter(([, value]) => Number.isFinite(value) && value >= 0);
    const resolution = request.resolution?.toLowerCase();
    const taskPrefix = request.task === 'FRAME_TO_VIDEO' ? 'image_to_video_' : request.task === 'GENERATE' ? 'text_to_video_' : '';
    const audioMarker = request.requiresAudio ? 'with_audio' : 'without_audio';
    const find = (keys: string[]) => {
        for (const key of keys) {
            const match = skus.find(([sku]) => sku.toLowerCase() === key.toLowerCase());
            if (match) return { key: match[0], value: match[1] };
        }
        return undefined;
    };

    // OpenRouter's live video catalog has several valid SKU conventions. Prefer
    // the task, audio, and resolution-specific rate, then use the documented
    // generic per-second rate when the catalog only exposes one.
    const rate = find([
        ...(resolution ? [
            `${taskPrefix}duration_seconds_${resolution}`,
            `duration_seconds_${audioMarker}_${resolution}`,
            `duration_seconds_${resolution}_${audioMarker}`,
            `duration_seconds_${resolution}`,
            `per-video-second-${resolution}`,
            `cents_per_video_output_second_${resolution}`,
            `cents_per_second_output_${resolution}`,
        ] : []),
        ...(request.requiresAudio ? [`${taskPrefix}duration_seconds_with_audio`, 'duration_seconds_with_audio'] : []),
        ...(request.requiresAudio ? [] : [`${taskPrefix}duration_seconds_without_audio`, 'duration_seconds_without_audio']),
        `${taskPrefix}duration_seconds`,
        'duration_seconds',
        ...(resolution ? [`per-video-second-${resolution}`] : []),
        'per-video-second',
        ...(resolution ? [`cents_per_video_output_second_${resolution}`, `cents_per_second_output_${resolution}`] : []),
        'cents_per_video_output_second',
        'cents_per_second_output',
    ]);

    let videoCost: number | undefined;
    if (rate) {
        const centsSku = rate.key.toLowerCase().startsWith('cents_');
        videoCost = rate.value * request.durationSeconds / (centsSku ? 100 : 1);
    } else {
        // Token-priced models publish output sizes; OpenRouter documents video
        // tokens as (width × height × seconds × 24 fps) / 1024.
        const tokenPrice = find(request.requiresAudio
            ? ['video_tokens', 'video_tokens_with_audio', 'per-video-token']
            : ['video_tokens_without_audio', 'video_tokens', 'per-video-token']);
        if (tokenPrice && model.supportedSizes?.length) {
            const ratios = request.aspectRatio.split(':').map(Number);
            if (ratios.length !== 2 || ratios.some((value) => !Number.isFinite(value) || value <= 0)) return undefined;
            const matchingSizes = model.supportedSizes.map((size) => {
                const match = /^(\d+)x(\d+)$/i.exec(size);
                return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
            }).filter((size): size is { width: number; height: number } => size !== null)
                // Catalog dimensions are rounded (e.g. 854x480 for 16:9).
                .filter((size) => Math.abs(size.width / size.height - ratios[0] / ratios[1]) < 0.02);
            if (!matchingSizes.length) return undefined;
            const requestedHeight = request.resolution ? Number.parseInt(request.resolution, 10) : undefined;
            const selectedSize = matchingSizes.sort((a, b) => requestedHeight
                ? Math.abs(a.height - requestedHeight) - Math.abs(b.height - requestedHeight)
                : a.width * a.height - b.width * b.height)[0];
            const videoTokens = (selectedSize.width * selectedSize.height * request.durationSeconds * 24) / 1024;
            videoCost = tokenPrice.value * videoTokens;
        } else {
            videoCost = model.estimatedCostPerSecond === undefined ? undefined : model.estimatedCostPerSecond * request.durationSeconds;
        }
    }
    if (videoCost === undefined) return undefined;

    const referenceCount = Math.max(0, Math.floor(request.imageReferenceCount ?? (request.hasImageReferences ? 1 : 0)));
    const perImageCents = find(['cents_per_image_input']);
    const perImageDollars = find(['reference_images', 'image_input']);
    if (referenceCount && perImageCents) videoCost += (perImageCents.value / 100) * referenceCount;
    else if (referenceCount && perImageDollars) videoCost += perImageDollars.value * referenceCount;
    return videoCost;
}

function defaultResolution(model: VideoModelCapabilities, aspectRatio: string): string | undefined {
    const requestedRatio = aspectRatio.split(':').map(Number);
    if (requestedRatio.length !== 2 || requestedRatio.some((value) => !Number.isFinite(value) || value <= 0)) return undefined;
    const sizes = (model.supportedSizes || []).map((label) => {
        const match = /^(\d+)x(\d+)$/i.exec(label);
        return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
    }).filter((size): size is { width: number; height: number } => size !== null)
        .filter((size) => Math.abs(size.width / size.height - requestedRatio[0] / requestedRatio[1]) < 0.02);
    const listed = model.supportedResolutions.map((resolution) => ({ resolution, height: Number.parseInt(resolution, 10) }))
        .filter((item) => Number.isFinite(item.height) && item.height > 0);
    if (!listed.length) return undefined;
    const minimumHeight = sizes.length ? Math.min(...sizes.map((size) => size.height)) : undefined;
    const compatible = minimumHeight === undefined ? listed : listed.filter((item) => item.height <= minimumHeight);
    return [...(compatible.length ? compatible : listed)].sort((a, b) => a.height - b.height)[0]?.resolution;
}

export function selectVideoRoute(
    request: VideoRoutingRequest,
    models: readonly VideoModelCapabilities[],
    policy?: VideoRoutePolicy,
): VideoRouteSelection {
    const path = policy?.path || defaultVideoProductionPath(request.videoType);
    if (path === 'MOTION_GRAPHICS') {
        return { provider: 'internal', modelId: 'renderer/motion-graphics', path, routeReason: 'This style is built from deterministic motion-graphics templates.' };
    }

    const preferred = policy?.preferredModelIds || [];
    const maximumCostUsd = policy?.maxCostUsd === undefined ? request.maximumCostUsd
        : request.maximumCostUsd === undefined ? policy.maxCostUsd : Math.min(policy.maxCostUsd, request.maximumCostUsd);
    const checkedRequest = { ...request, maximumCostUsd };
    if (request.qualityTier === 'PREMIUM' && preferred.length === 0) throw new Error('An administrator must set a preferred premium model before premium video generation is available.');
    if (request.qualityTier === 'PREMIUM' && maximumCostUsd === undefined) throw new Error('An administrator must set a premium spending cap before premium video generation is available.');
    const requests = models.map((model) => ({
        model,
        request: { ...checkedRequest, resolution: checkedRequest.resolution || defaultResolution(model, checkedRequest.aspectRatio) },
    }));
    const capable = requests.filter(({ model, request: candidate }) => videoModelSupportsRequest(model, { ...candidate, maximumCostUsd: undefined }));
    const eligible = requests.filter(({ model, request: candidate }) => videoModelSupportsRequest(model, candidate));
    if (!eligible.length && capable.length && maximumCostUsd !== undefined) throw new Error('No compatible video model fits within the configured spending cap.');
    if (!eligible.length) throw new Error('No available video model supports all requested video controls and limits.');

    if (request.qualityTier === 'PREMIUM' && !eligible.some(({ model }) => preferred.includes(model.modelId))) {
        throw new Error('No administrator-approved premium model supports all requested controls within the configured spending cap.');
    }

    const ordered = [...eligible].sort((left, right) => {
        const leftIndex = preferred.indexOf(left.model.modelId);
        const rightIndex = preferred.indexOf(right.model.modelId);
        if (request.qualityTier !== 'ECONOMY' && (leftIndex !== -1 || rightIndex !== -1)) return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
        return (estimateVideoCost(left.model, left.request) ?? Infinity) - (estimateVideoCost(right.model, right.request) ?? Infinity);
    });
    const { model: selected, request: selectedRequest } = ordered[0];
    const preference = preferred.includes(selected.modelId) ? 'administrator preference' : request.qualityTier === 'PREMIUM' ? 'highest quality tier among eligible models' : 'lowest-cost eligible model';
    return {
        provider: selected.provider,
        modelId: selected.modelId,
        path,
        routeReason: `Selected by ${preference}; required controls are supported.`,
        estimatedCostUsd: estimateVideoCost(selected, selectedRequest),
        resolution: selectedRequest.resolution,
        policyVersion: policy?.updatedAt,
    };
}
