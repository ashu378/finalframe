import type { FeatureFlagSet, GenerationRequest, ProviderTask, QCResult } from '../../src/lib/ai/types';

export const validGenerationRequest: GenerationRequest = {
    capability: 'VIDEO_GENERATION',
    provider: 'openrouter',
    modality: 'video',
    prompt: 'Original 2D animated characters perform a specific visual comedy beat.',
    parameters: { duration: 6, aspectRatio: '9:16' },
    idempotencyKey: 'production-1-shot-1-v1',
    productionId: 'production-1',
    shotId: 'shot-1',
    reservationId: 'reservation-1',
    requestHash: 'sha256-request-hash',
    correlationId: 'corr-1',
};

export const validQC: QCResult = {
    status: 'PASS',
    qualityVersion: 'qc-v1',
    checkedAt: '2026-08-25T00:00:00.000Z',
    blockingReasons: [],
    checks: [
        { check: 'MEDIA_INTEGRITY', status: 'PASS', score: 1, explanation: 'The output decodes and contains the requested media stream.' },
        { check: 'CONTENT_SAFETY', status: 'PASS', score: 1, explanation: 'No blocking safety issue was detected.' },
    ],
};

export const validProviderTask: ProviderTask = {
    taskId: 'task-1',
    provider: 'openrouter',
    providerTaskId: 'provider-task-1',
    capability: 'VIDEO_GENERATION',
    status: 'SUCCEEDED',
    idempotencyKey: 'production-1-shot-1-v1',
    requestHash: 'sha256-request-hash',
    attempt: 1,
    maxAttempts: 3,
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:01:00.000Z',
    completedAt: '2026-08-25T00:01:00.000Z',
    output: {
        outputId: 'output-1',
        kind: 'VIDEO',
        provider: 'openrouter',
        model: 'verified-video-model',
        providerTaskId: 'provider-task-1',
        contentType: 'video/mp4',
        remoteUrl: 'https://provider.example/output.mp4',
        byteSize: 1024,
        durationSeconds: 6,
        width: 1080,
        height: 1920,
        metadata: { source: 'provider-fixture' },
    },
    qc: validQC,
};

export const validFeatureFlags: FeatureFlagSet = {
    'generation.real_provider': { key: 'generation.real_provider', state: 'INTERNAL', updatedAt: '2026-08-25T00:00:00.000Z' },
    'generation.qc': { key: 'generation.qc', state: 'ENABLED', updatedAt: '2026-08-25T00:00:00.000Z' },
    'workflow.animated_comedy_2d': { key: 'workflow.animated_comedy_2d', state: 'BETA', rolloutPercent: 10, updatedAt: '2026-08-25T00:00:00.000Z' },
};
