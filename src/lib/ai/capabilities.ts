import { getModelForCapability, type AICapability } from '@/lib/ai/model-registry';

export type GenerationCapability = {
    capability: AICapability | 'VIDEO_GENERATION' | 'TRANSCRIPTION' | 'TEXT_TO_SPEECH';
    provider: string;
    model: string;
    inputModalities: string[];
    outputModalities: string[];
    supportedParameters: string[];
    enabled: boolean;
};

const FALLBACK_CAPABILITIES: GenerationCapability[] = [
    { capability: 'AI_BRAIN', provider: 'openrouter', model: getModelForCapability('AI_BRAIN').id, inputModalities: ['text', 'image', 'audio', 'file'], outputModalities: ['text'], supportedParameters: ['temperature', 'response_format'], enabled: true },
    { capability: 'IMAGE_ENGINE', provider: 'openrouter', model: getModelForCapability('IMAGE_ENGINE').id, inputModalities: ['text', 'image'], outputModalities: ['image'], supportedParameters: [], enabled: true },
    { capability: 'VIDEO_GENERATION', provider: 'runway', model: 'gen4_turbo', inputModalities: ['text', 'image', 'video'], outputModalities: ['video'], supportedParameters: ['duration', 'ratio'], enabled: Boolean(process.env.RUNWAY_API_KEY) },
    { capability: 'TRANSCRIPTION', provider: 'openrouter', model: 'auto', inputModalities: ['audio'], outputModalities: ['text'], supportedParameters: [], enabled: true },
    { capability: 'TEXT_TO_SPEECH', provider: 'openrouter', model: 'auto', inputModalities: ['text'], outputModalities: ['audio'], supportedParameters: [], enabled: true },
];

export function getCapability(capability: GenerationCapability['capability'], inputModality?: string) {
    const candidates = FALLBACK_CAPABILITIES.filter((item) => item.capability === capability && item.enabled);
    return candidates.find((item) => !inputModality || item.inputModalities.includes(inputModality)) || null;
}

export function assertCapability(capability: GenerationCapability['capability'], inputModality?: string) {
    const result = getCapability(capability, inputModality);
    if (!result) throw new Error(`Unsupported capability: ${capability}${inputModality ? ` for ${inputModality}` : ''}`);
    return result;
}
