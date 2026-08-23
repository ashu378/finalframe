import { AICapabilityError, type AIProvider, type Modality } from './types';

export interface DiscoveredModel {
    id: string;
    name?: string;
    description?: string;
    contextLength?: number;
    inputModalities: Modality[];
    outputModalities: Modality[];
    supportedParameters: string[];
    pricing?: {
        input?: number;
        output?: number;
        image?: number;
        request?: number;
    };
    raw: unknown;
}

export interface ModelDiscoveryOptions {
    apiKey?: string;
    baseUrl?: string;
    fetch?: typeof globalThis.fetch;
    ttlMs?: number;
    now?: () => number;
    force?: boolean;
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; models: DiscoveredModel[] }>();
const inFlight = new Map<string, Promise<DiscoveredModel[]>>();

function asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
    if (value && typeof value === 'object') return Object.keys(value as object);
    return [];
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeDiscoveredModel(value: unknown): DiscoveredModel | null {
    const item = asRecord(value);
    if (typeof item.id !== 'string' || item.id.length === 0) return null;
    const architecture = asRecord(item.architecture);
    const pricing = asRecord(item.pricing);
    const inputModalities = asStringArray(architecture.input_modalities) as Modality[];
    const outputModalities = asStringArray(architecture.output_modalities) as Modality[];
    return {
        id: item.id,
        name: typeof item.name === 'string' ? item.name : undefined,
        description: typeof item.description === 'string' ? item.description : undefined,
        contextLength: asNumber(item.context_length),
        inputModalities,
        outputModalities,
        supportedParameters: asStringArray(item.supported_parameters),
        pricing: {
            input: asNumber(pricing.prompt),
            output: asNumber(pricing.completion),
            image: asNumber(pricing.image),
            request: asNumber(pricing.request),
        },
        raw: value,
    };
}

function makeHeaders(apiKey?: string): HeadersInit {
    return {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
}

async function fetchModels(options: ModelDiscoveryOptions): Promise<DiscoveredModel[]> {
    const fetcher = options.fetch || globalThis.fetch;
    if (!fetcher) {
        throw new AICapabilityError({
            code: 'NETWORK_ERROR',
            message: 'No fetch implementation is available for OpenRouter model discovery.',
            provider: 'openrouter',
            retryable: false,
        });
    }
    const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    const response = await fetcher(`${baseUrl}/models`, { headers: makeHeaders(options.apiKey) });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
        const errorBody = asRecord(body);
        throw new AICapabilityError({
            code: response.status === 429 ? 'PROVIDER_RATE_LIMIT' : response.status === 401 ? 'PROVIDER_AUTHENTICATION' : 'PROVIDER_ERROR',
            message: typeof errorBody.message === 'string' ? errorBody.message : `OpenRouter model discovery failed (${response.status}).`,
            provider: 'openrouter',
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
            details: body,
        });
    }
    const data = asRecord(body).data;
    return (Array.isArray(data) ? data : []).map(normalizeDiscoveredModel).filter((item): item is DiscoveredModel => item !== null);
}

/** Discover and cache OpenRouter's general model catalog. No API key is required by this endpoint. */
export async function discoverOpenRouterModels(options: ModelDiscoveryOptions = {}): Promise<DiscoveredModel[]> {
    const key = options.baseUrl || DEFAULT_BASE_URL;
    const now = options.now || Date.now;
    const cached = cache.get(key);
    if (!options.force && cached && cached.expiresAt > now()) return cached.models;
    const pending = inFlight.get(key);
    if (pending && !options.force) return pending;
    const request = fetchModels(options).then((models) => {
        cache.set(key, { models, expiresAt: now() + (options.ttlMs ?? DEFAULT_TTL_MS) });
        return models;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
}

export async function discoverOpenRouterModelsForModality(modality: Modality, options: ModelDiscoveryOptions = {}): Promise<DiscoveredModel[]> {
    const models = await discoverOpenRouterModels(options);
    return models.filter((model) => model.outputModalities.includes(modality) || model.inputModalities.includes(modality));
}

export async function findOpenRouterModel(modelId: string, options: ModelDiscoveryOptions = {}): Promise<DiscoveredModel | null> {
    const models = await discoverOpenRouterModels(options);
    return models.find((model) => model.id === modelId) || null;
}

export async function selectOpenRouterModel(input: {
    model?: string;
    outputModality?: Modality;
    requiredParameters?: string[];
    options?: ModelDiscoveryOptions;
}): Promise<DiscoveredModel> {
    const models = await discoverOpenRouterModels(input.options);
    const candidates = models.filter((model) => {
        if (input.model && model.id !== input.model) return false;
        if (input.outputModality && !model.outputModalities.includes(input.outputModality)) return false;
        return (input.requiredParameters || []).every((parameter) => model.supportedParameters.includes(parameter));
    });
    const result = candidates[0];
    if (!result) {
        throw new AICapabilityError({
            code: input.model ? 'UNSUPPORTED_MODEL' : 'UNSUPPORTED_CAPABILITY',
            message: input.model ? `OpenRouter model does not satisfy the requested capability: ${input.model}` : 'No OpenRouter model satisfies the requested capability.',
            provider: 'openrouter' as AIProvider,
            model: input.model,
            retryable: false,
        });
    }
    return result;
}

export function clearOpenRouterModelCache(): void {
    cache.clear();
    inFlight.clear();
}

