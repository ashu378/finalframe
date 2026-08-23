import { getModelForCapability, type AICapability } from './model-registry';
import type { CapabilityDescriptor, CapabilityId, CapabilityParameter, Modality } from './types';

/** Backwards-compatible shape used by generation job creation. */
export type GenerationCapability = Omit<CapabilityDescriptor, 'inputModalities' | 'outputModalities' | 'supportedParameters'> & {
    capability: CapabilityId;
    model: string;
    inputModalities: Modality[];
    outputModalities: Modality[];
    supportedParameters: CapabilityParameter[];
};

const descriptor = (
    capability: CapabilityId,
    inputModalities: Modality[],
    outputModalities: Modality[],
    supportedParameters: CapabilityParameter[],
    options: Partial<Pick<CapabilityDescriptor, 'provider' | 'model' | 'supportsStructuredOutput' | 'discovery' | 'enabled'>> = {}
): CapabilityDescriptor => ({
    capability,
    provider: options.provider || 'openrouter',
    model: options.model,
    inputModalities,
    outputModalities,
    supportedParameters,
    supportsStructuredOutput: options.supportsStructuredOutput ?? false,
    enabled: options.enabled ?? true,
    discovery: options.discovery || 'models',
});

/**
 * Capability declarations are provider-neutral. Model availability is
 * discovered at request time where the provider exposes a capability catalog.
 */
export const CAPABILITY_REGISTRY: Record<CapabilityId, CapabilityDescriptor> = {
    AI_BRAIN: descriptor('AI_BRAIN', ['text', 'image', 'audio', 'video', 'file'], ['text'], ['temperature', 'top_p', 'max_tokens', 'response_format'], {
        model: getModelForCapability('AI_BRAIN').id,
        supportsStructuredOutput: true,
    }),
    IMAGE_ENGINE: descriptor('IMAGE_ENGINE', ['text', 'image'], ['text', 'image'], ['resolution', 'size', 'aspect_ratio', 'quality', 'input_references'], {
        model: getModelForCapability('IMAGE_ENGINE').id,
        discovery: 'images',
    }),
    VIDEO_ENGINE: descriptor('VIDEO_ENGINE', ['text', 'image', 'video'], ['video'], ['duration', 'aspect_ratio', 'resolution', 'input_references'], {
        model: getModelForCapability('VIDEO_ENGINE').id,
        discovery: 'videos',
    }),
    VALIDATOR_ENGINE: descriptor('VALIDATOR_ENGINE', ['text', 'image', 'audio', 'video', 'file'], ['text'], ['temperature', 'top_p', 'max_tokens', 'response_format'], {
        model: getModelForCapability('VALIDATOR_ENGINE').id,
        supportsStructuredOutput: true,
    }),
    IMAGE_GENERATION: descriptor('IMAGE_GENERATION', ['text', 'image'], ['image'], ['resolution', 'size', 'aspect_ratio', 'quality', 'input_references'], { discovery: 'images' }),
    VIDEO_GENERATION: descriptor('VIDEO_GENERATION', ['text', 'image', 'video'], ['video'], ['duration', 'aspect_ratio', 'resolution', 'input_references'], { discovery: 'videos' }),
    TEXT_TO_SPEECH: descriptor('TEXT_TO_SPEECH', ['text'], ['audio'], ['voice', 'speed', 'provider_options'], { discovery: 'models' }),
    TRANSCRIPTION: descriptor('TRANSCRIPTION', ['audio'], ['transcription'], ['language', 'temperature', 'provider_options'], { discovery: 'models' }),
};

function asGenerationCapability(item: CapabilityDescriptor): GenerationCapability {
    return {
        ...item,
        model: item.model || 'auto',
        inputModalities: [...item.inputModalities],
        outputModalities: [...item.outputModalities],
        supportedParameters: [...item.supportedParameters],
    };
}

export function getCapability(capability: CapabilityId, inputModality?: Modality): GenerationCapability | null {
    const item = CAPABILITY_REGISTRY[capability];
    if (!item || !item.enabled) return null;
    if (inputModality && !item.inputModalities.includes(inputModality)) return null;
    return asGenerationCapability(item);
}

export function assertCapability(capability: CapabilityId, inputModality?: Modality): GenerationCapability {
    const result = getCapability(capability, inputModality);
    if (!result) throw new Error(`Unsupported capability: ${capability}${inputModality ? ` for ${inputModality}` : ''}`);
    return result;
}

export function getCapabilityDescriptor(capability: CapabilityId): CapabilityDescriptor {
    const result = CAPABILITY_REGISTRY[capability];
    if (!result) throw new Error(`Unsupported capability: ${capability}`);
    return result;
}

export type { CapabilityDescriptor, CapabilityId, Modality } from './types';
export type { AICapability } from './model-registry';
