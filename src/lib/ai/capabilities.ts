import { getModelForCapability, type AICapability } from './model-registry';
import { AICapabilityError, type CapabilityDescriptor, type CapabilityId, type CapabilityParameter, type Modality } from './types';

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
    options: Partial<Pick<CapabilityDescriptor, 'provider' | 'model' | 'supportsStructuredOutput' | 'discovery' | 'enabled'>> = {},
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

const modelId = (capability: CapabilityId) => getModelForCapability(capability).id;

export const CAPABILITY_REGISTRY: Record<CapabilityId, CapabilityDescriptor> = {
    AI_BRAIN: descriptor('AI_BRAIN', ['text', 'image', 'audio', 'video', 'file'], ['text'], ['temperature', 'top_p', 'max_tokens', 'response_format'], {
        model: modelId('AI_BRAIN'),
        supportsStructuredOutput: true,
    }),
    IMAGE_ENGINE: descriptor('IMAGE_ENGINE', ['text', 'image'], ['text', 'image'], ['resolution', 'size', 'aspect_ratio', 'quality', 'input_references'], {
        model: modelId('IMAGE_ENGINE'),
        discovery: 'images',
    }),
    VIDEO_ENGINE: descriptor('VIDEO_ENGINE', ['text', 'image', 'video'], ['video'], ['duration', 'aspect_ratio', 'resolution', 'input_references'], {
        model: modelId('VIDEO_ENGINE'),
        discovery: 'videos',
    }),
    VALIDATOR_ENGINE: descriptor('VALIDATOR_ENGINE', ['text', 'image', 'audio', 'video', 'file'], ['text'], ['temperature', 'top_p', 'max_tokens', 'response_format'], {
        model: modelId('VALIDATOR_ENGINE'),
        supportsStructuredOutput: true,
    }),
    IMAGE_GENERATION: descriptor('IMAGE_GENERATION', ['text', 'image'], ['image'], ['resolution', 'size', 'aspect_ratio', 'quality', 'input_references', 'provider_options', 'output_format', 'background', 'output_compression', 'seed', 'n'], {
        model: modelId('IMAGE_GENERATION'),
        discovery: 'images',
    }),
    VIDEO_GENERATION: descriptor('VIDEO_GENERATION', ['text', 'image', 'video'], ['video'], ['duration', 'aspect_ratio', 'resolution', 'input_references', 'provider_options'], {
        model: modelId('VIDEO_GENERATION'),
        discovery: 'videos',
    }),
    TEXT_TO_SPEECH: descriptor('TEXT_TO_SPEECH', ['text'], ['audio'], ['voice', 'speed', 'response_format', 'instructions', 'provider_options'], {
        model: modelId('TEXT_TO_SPEECH'),
    }),
    TRANSCRIPTION: descriptor('TRANSCRIPTION', ['audio'], ['transcription'], ['language', 'temperature', 'provider_options'], {
        model: modelId('TRANSCRIPTION'),
    }),
};

function asGenerationCapability(item: CapabilityDescriptor): GenerationCapability {
    if (!item.model) {
        throw new AICapabilityError({
            code: 'UNSUPPORTED_MODEL',
            message: `No model is configured for capability ${item.capability}.`,
            provider: item.provider,
            capability: item.capability,
            retryable: false,
        });
    }
    return {
        ...item,
        model: item.model,
        inputModalities: [...item.inputModalities],
        outputModalities: [...item.outputModalities],
        supportedParameters: [...item.supportedParameters],
    };
}

export interface CapabilityValidationInput {
    capability: CapabilityId;
    model?: string;
    inputModality?: Modality;
    outputModality?: Modality;
    parameters?: readonly CapabilityParameter[];
    structuredOutput?: boolean;
}

export interface CapabilityValidationResult {
    valid: true;
    descriptor: CapabilityDescriptor;
    model: string;
}

export function validateCapabilityRequest(input: CapabilityValidationInput): CapabilityValidationResult {
    const descriptor = CAPABILITY_REGISTRY[input.capability];
    if (!descriptor || !descriptor.enabled) {
        throw new AICapabilityError({
            code: 'UNSUPPORTED_CAPABILITY',
            message: `Capability ${input.capability} is not enabled.`,
            provider: descriptor?.provider || 'openrouter',
            capability: input.capability,
            retryable: false,
        });
    }
    if (input.inputModality && !descriptor.inputModalities.includes(input.inputModality)) {
        throw new AICapabilityError({
            code: 'UNSUPPORTED_CAPABILITY',
            message: `${input.capability} does not accept ${input.inputModality} input.`,
            provider: descriptor.provider,
            capability: input.capability,
            retryable: false,
        });
    }
    if (input.outputModality && !descriptor.outputModalities.includes(input.outputModality)) {
        throw new AICapabilityError({
            code: 'UNSUPPORTED_CAPABILITY',
            message: `${input.capability} cannot produce ${input.outputModality} output.`,
            provider: descriptor.provider,
            capability: input.capability,
            retryable: false,
        });
    }
    const unsupported = (input.parameters || []).filter((parameter) => !descriptor.supportedParameters.includes(parameter));
    if (unsupported.length) {
        throw new AICapabilityError({
            code: 'INVALID_REQUEST',
            message: `${input.capability} does not support parameter(s): ${unsupported.join(', ')}.`,
            provider: descriptor.provider,
            capability: input.capability,
            retryable: false,
            details: { unsupportedParameters: unsupported },
        });
    }
    if (input.structuredOutput && !descriptor.supportsStructuredOutput) {
        throw new AICapabilityError({
            code: 'UNSUPPORTED_CAPABILITY',
            message: `${input.capability} does not support structured output.`,
            provider: descriptor.provider,
            capability: input.capability,
            retryable: false,
        });
    }
    const model = input.model || descriptor.model;
    if (!model?.trim()) {
        throw new AICapabilityError({
            code: 'UNSUPPORTED_MODEL',
            message: `No model is configured for capability ${input.capability}.`,
            provider: descriptor.provider,
            capability: input.capability,
            retryable: false,
        });
    }
    return { valid: true, descriptor, model };
}

export function assertCapabilityRequest(input: CapabilityValidationInput): CapabilityValidationResult {
    return validateCapabilityRequest(input);
}

export function getCapability(capability: CapabilityId, inputModality?: Modality): GenerationCapability | null {
    try {
        return asGenerationCapability(validateCapabilityRequest({ capability, inputModality }).descriptor);
    } catch {
        return null;
    }
}

export function assertCapability(capability: CapabilityId, inputModality?: Modality): GenerationCapability {
    const result = getCapability(capability, inputModality);
    if (!result) {
        throw new AICapabilityError({
            code: 'UNSUPPORTED_CAPABILITY',
            message: `Unsupported capability: ${capability}${inputModality ? ` for ${inputModality}` : ''}`,
            provider: 'openrouter',
            capability,
            retryable: false,
        });
    }
    return result;
}

export function getCapabilityDescriptor(capability: CapabilityId): CapabilityDescriptor {
    const result = CAPABILITY_REGISTRY[capability];
    if (!result) {
        throw new AICapabilityError({ code: 'UNSUPPORTED_CAPABILITY', message: `Unsupported capability: ${capability}`, provider: 'openrouter', capability, retryable: false });
    }
    return result;
}

export type { CapabilityDescriptor, CapabilityId, Modality } from './types';
export type { AICapability } from './model-registry';
