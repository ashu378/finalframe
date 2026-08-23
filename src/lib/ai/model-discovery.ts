import { AICapabilityError, type AIProvider, type CapabilityId, type Modality } from './types';

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
    /** OpenRouter's catalog endpoint is public, so this remains optional. */
    apiKey?: string | null;
    baseUrl?: string;
    fetch?: typeof globalThis.fetch;
    ttlMs?: number;
    now?: () => number;
    force?: boolean;
    staleIfError?: boolean;
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_MODEL_CATALOG_TTL_MS = 5 * 60 * 1000;

interface CatalogCacheEntry {
    fetchedAt: number;
    expiresAt: number;
    models: DiscoveredModel[];
}

const cache = new Map<string, CatalogCacheEntry>();
const inFlight = new Map<string, Promise<DiscoveredModel[]>>();

function asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
    if (value && typeof value === 'object') return Object.keys(value as object);
    return [];
}

function asNumber(value: unknown): number | undefined {
    const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    return Number.isFinite(number) ? number : undefined;
}

function normalizeBaseUrl(baseUrl?: string): string {
    return (baseUrl || OPENROUTER_BASE_URL).replace(/\/+$/, '');
}

export function normalizeDiscoveredModel(value: unknown): DiscoveredModel | null {
    const item = asRecord(value);
    const id = asString(item.id);
    if (!id) return null;
    const architecture = asRecord(item.architecture);
    const pricing = asRecord(item.pricing);
    return {
        id,
        name: asString(item.name),
        description: asString(item.description),
        contextLength: asNumber(item.context_length),
        inputModalities: asStringArray(architecture.input_modalities) as Modality[],
        outputModalities: asStringArray(architecture.output_modalities) as Modality[],
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

function catalogHeaders(apiKey?: string | null): HeadersInit {
    return {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
}

function providerError(status: number): { code: AICapabilityError['code']; retryable: boolean } {
    if (status === 401 || status === 403) return { code: 'PROVIDER_AUTHENTICATION', retryable: false };
    if (status === 408) return { code: 'REQUEST_TIMEOUT', retryable: true };
    if (status === 429) return { code: 'PROVIDER_RATE_LIMIT', retryable: true };
    if (status >= 500) return { code: 'PROVIDER_UNAVAILABLE', retryable: true };
    return { code: 'PROVIDER_ERROR', retryable: false };
}

async function fetchModels(options: ModelDiscoveryOptions): Promise<DiscoveredModel[]> {
    const fetcher = options.fetch || globalThis.fetch;
    if (!fetcher) {
        throw new AICapabilityError({ code: 'NETWORK_ERROR', message: 'No fetch implementation is available for OpenRouter model discovery.', provider: 'openrouter', retryable: false });
    }
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    let response: Response;
    try {
        response = await fetcher(`${baseUrl}/models`, { headers: catalogHeaders(options.apiKey) });
    } catch (cause) {
        throw new AICapabilityError({ code: 'NETWORK_ERROR', message: 'OpenRouter model discovery could not be reached.', provider: 'openrouter', retryable: true, cause });
    }
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
        const classification = providerError(response.status);
        const errorBody = asRecord(body);
        const nested = asRecord(errorBody.error);
        throw new AICapabilityError({
            code: classification.code,
            message: asString(errorBody.message) || asString(nested.message) || `OpenRouter model discovery failed (${response.status}).`,
            provider: 'openrouter',
            status: response.status,
            requestId: response.headers.get('x-request-id') || undefined,
            retryable: classification.retryable,
            details: body,
        });
    }
    const data = asRecord(body).data;
    return (Array.isArray(data) ? data : [])
        .map(normalizeDiscoveredModel)
        .filter((item): item is DiscoveredModel => item !== null);
}

/** Discover and cache OpenRouter's general model catalog. No API key is required. */
export async function discoverOpenRouterModels(options: ModelDiscoveryOptions = {}): Promise<DiscoveredModel[]> {
    const key = normalizeBaseUrl(options.baseUrl);
    const now = options.now || Date.now;
    const cached = cache.get(key);
    if (!options.force && cached && cached.expiresAt > now()) return cached.models;
    if (!options.force) {
        const pending = inFlight.get(key);
        if (pending) return pending;
    }

    const request = fetchModels(options)
        .then((models) => {
            const fetchedAt = now();
            cache.set(key, { fetchedAt, expiresAt: fetchedAt + Math.max(0, options.ttlMs ?? DEFAULT_MODEL_CATALOG_TTL_MS), models });
            return models;
        })
        .catch((error: unknown) => {
            if (options.staleIfError !== false && cached) return cached.models;
            throw error;
        })
        .finally(() => {
            if (inFlight.get(key) === request) inFlight.delete(key);
        });
    inFlight.set(key, request);
    return request;
}

export const getOpenRouterModelCatalog = discoverOpenRouterModels;

export function getCachedOpenRouterModels(baseUrl?: string, now: () => number = Date.now): DiscoveredModel[] | null {
    const entry = cache.get(normalizeBaseUrl(baseUrl));
    return entry && entry.expiresAt > now() ? entry.models : null;
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
    capability?: CapabilityId;
    model?: string;
    inputModality?: Modality;
    outputModality?: Modality;
    requiredParameters?: string[];
    options?: ModelDiscoveryOptions;
}): Promise<DiscoveredModel> {
    const models = await discoverOpenRouterModels(input.options);
    const candidates = models.filter((model) => {
        if (input.model && model.id !== input.model) return false;
        if (input.inputModality && !model.inputModalities.includes(input.inputModality)) return false;
        if (input.outputModality && !model.outputModalities.includes(input.outputModality)) return false;
        return (input.requiredParameters || []).every((parameter) => model.supportedParameters.includes(parameter));
    });
    const result = candidates[0];
    if (!result) {
        throw new AICapabilityError({
            code: input.model ? 'UNSUPPORTED_MODEL' : 'UNSUPPORTED_CAPABILITY',
            message: input.model ? `OpenRouter model does not satisfy the requested capability: ${input.model}` : 'No OpenRouter model satisfies the requested capability.',
            provider: 'openrouter' as AIProvider,
            capability: input.capability,
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
