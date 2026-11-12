import { REVIEWED_OPERATION_CONTRACTS } from './model-registry';
import { normalizeSha256 } from '../../../renderer/src/media/sha256';
import type { VideoModelCapabilities, VideoRoutingRequest } from './video-routing';

/** A canonical same-project storage/probe proof. The backend must derive this
 * from authorized assets; this pure validator does not authorize caller IDs. */
export interface MotionSourceCertificate {
    assetId: string;
    storageId: string;
    checksum: string;
    byteSize: number;
    mimeType: 'video/mp4';
    videoCodec: 'h264';
    width: number;
    height: number;
    /** Container upper duration, not a rounded/truncated timeline length. */
    durationSeconds: number;
    videoTiming: {
        version: 'DECODED_VIDEO_FRAMES_V1';
        frameCount: number;
        fpsNumerator: number;
        fpsDenominator: number;
        firstFrameSeconds: number;
        durationSeconds: number;
    };
}

export interface MotionQuoteCertificate {
    version: 'SEEDANCE_PROMPT_LED_VIDEO_REFERENCE_V1';
    source: MotionSourceCertificate;
    modelId: string;
    canonicalSlug: string;
    catalogQuoteFingerprint: string;
    inputDurationSeconds: number;
    outputSeconds: number;
    outputWidth: number;
    outputHeight: number;
    outputFps: number;
    estimatedVideoTokens: number;
    estimatedInputVideoTokens: number;
    inputBoundBasis: 'MAX_DOCUMENTED_OUTPUT_GRID_AND_NATIVE_SOURCE_GRID';
    minimumVideoTokensUpperBound: number;
    estimatedCostUsd: number;
    authorizationUsd: number;
    /** Already includes the provider's flat authorization. Do not margin again. */
    reservedProviderUsd: number;
    pricingBasis: 'PUBLISHED_NARROW_CELL_AND_INPUT_OUTPUT_FORMULA';
    evidence: readonly string[];
}

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;

export function validMotionSource(source: MotionSourceCertificate | undefined): source is MotionSourceCertificate {
    const c = REVIEWED_OPERATION_CONTRACTS.promptMotion;
    if (!source || typeof source.assetId !== 'string' || !source.assetId.trim() || typeof source.storageId !== 'string' || !source.storageId.trim() || !normalizeSha256(source.checksum) ||
        source.mimeType !== 'video/mp4' || source.videoCodec !== 'h264' || !positiveInteger(source.byteSize) || source.byteSize > c.maximumSourceBytes ||
        !positiveInteger(source.width) || !positiveInteger(source.height) || Math.min(source.width,source.height) < c.minimumSourceDimension || Math.max(source.width,source.height) > c.maximumSourceDimension ||
        source.width * source.height < c.minimumSourcePixels || source.width * source.height > c.maximumSourcePixels || source.width/source.height < c.minimumSourceAspectRatio || source.width/source.height > c.maximumSourceAspectRatio ||
        !Number.isFinite(source.durationSeconds) || source.durationSeconds < c.minimumSourceSeconds || source.durationSeconds > c.maximumSourceSeconds) return false;
    const t = source.videoTiming;
    if (!t || t.version !== 'DECODED_VIDEO_FRAMES_V1' || !positiveInteger(t.frameCount) || !positiveInteger(t.fpsNumerator) || !positiveInteger(t.fpsDenominator) ||
        t.fpsNumerator / t.fpsDenominator < c.minimumSourceFps || t.fpsNumerator / t.fpsDenominator > c.maximumSourceFps || !finitePositive(t.durationSeconds) ||
        !Number.isFinite(t.firstFrameSeconds) || t.firstFrameSeconds < 0) return false;
    const decodedDuration = t.frameCount * t.fpsDenominator / t.fpsNumerator;
    return Math.abs(decodedDuration-t.durationSeconds) <= 1e-6 && t.durationSeconds >= c.minimumSourceSeconds &&
        t.firstFrameSeconds+t.durationSeconds <= source.durationSeconds+1e-6;
}

/** Prompt-led motion guidance is a new clip, not frame-exact performance
 * transfer, masking, source-video editing, continuation or voice preservation. */
export function quotePromptMotionTransfer(model: VideoModelCapabilities, request: VideoRoutingRequest, catalogQuoteFingerprint: string): MotionQuoteCertificate | undefined {
    const c = REVIEWED_OPERATION_CONTRACTS.promptMotion;
    if (model.provider !== 'openrouter' || model.modelId !== c.modelId || model.canonicalSlug !== c.canonicalSlug ||
        (request.operation || request.task) !== 'PERFORMANCE_TRANSFER' || request.task !== 'EDIT' || request.audioPolicy !== 'SILENT' ||
        !request.hasVideoReference || request.videoReferenceCount !== 1 || !request.hasImageReferences || request.imageReferenceCount !== 1 ||
        request.hasAudioReference || request.requiresAudio || request.requiresMask || request.requiresSourceAudioPreservation ||
        request.requiresFirstFrame || request.requiresLastFrame || request.previousJobId || request.previousModelId || request.upscaleFactor !== undefined || request.creativity !== undefined ||
        request.durationSeconds !== c.outputSeconds || request.resolution !== c.outputResolution || request.aspectRatio !== c.outputAspectRatio ||
        !validMotionSource(request.motionSource)) return undefined;
    // Any pricing addition/change needs review. Never price video references as
    // output-only, nor assume an unrecognized audio/image SKU is free.
    const expected = Object.entries(c.expectedPricingSkus).sort(([a],[b])=>a.localeCompare(b));
    const actual = Object.entries(model.pricingSkus ?? {}).sort(([a],[b])=>a.localeCompare(b));
    if (JSON.stringify(expected) !== JSON.stringify(actual)) return undefined;
    // The primary formula uses output dimensions/fps for input duration too.
    // Also retain the larger native-source grid as an application safety bound;
    // this extra bound is not a claim that the provider bills native input pixels.
    const documentedInputTokens=request.motionSource.durationSeconds*c.outputWidth*c.outputHeight*c.outputFps/1024;
    const nativeInputTokens=request.motionSource.durationSeconds*request.motionSource.width*request.motionSource.height*
        request.motionSource.videoTiming.fpsNumerator/request.motionSource.videoTiming.fpsDenominator/1024;
    const estimatedInputVideoTokens=Math.ceil(Math.max(documentedInputTokens,nativeInputTokens));
    const calculatedTokens = Math.ceil(estimatedInputVideoTokens+c.outputSeconds*c.outputWidth*c.outputHeight*c.outputFps/1024);
    const estimatedVideoTokens = Math.max(calculatedTokens,c.minimumVideoTokensUpperBound);
    const estimatedCostUsd = Math.ceil(estimatedVideoTokens*c.videoInputTokenRateUsd*1e6)/1e6;
    const ordinaryReservationUsd = Math.ceil((estimatedCostUsd*1.05+.01)*1e6)/1e6;
    return {version:c.version,source:structuredClone(request.motionSource),modelId:model.modelId,canonicalSlug:c.canonicalSlug,catalogQuoteFingerprint,
        inputDurationSeconds:request.motionSource.durationSeconds,outputSeconds:c.outputSeconds,outputWidth:c.outputWidth,outputHeight:c.outputHeight,outputFps:c.outputFps,
        estimatedVideoTokens,estimatedInputVideoTokens,inputBoundBasis:'MAX_DOCUMENTED_OUTPUT_GRID_AND_NATIVE_SOURCE_GRID',minimumVideoTokensUpperBound:c.minimumVideoTokensUpperBound,estimatedCostUsd,authorizationUsd:c.authorizationUsd,
        reservedProviderUsd:Math.max(c.authorizationUsd,ordinaryReservationUsd),pricingBasis:'PUBLISHED_NARROW_CELL_AND_INPUT_OUTPUT_FORMULA',evidence:c.evidence};
}
