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

export interface DiscoveredVideoModel {
    id: string;
    canonicalSlug?: string;
    name?: string;
    description?: string;
    supportedDurations: number[];
    supportedResolutions: string[];
    supportedAspectRatios: string[];
    supportedSizes: string[];
    allowedPassthroughParameters: string[];
    pricingSkus: Record<string, number>;
    upscaleFactor?: { min: number; max: number };
    creativityLevels?: number[];
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
    /** API-only media models are omitted from the unfiltered chat catalog. */
    outputModality?: 'image' | 'speech' | 'transcription';
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
const videoCatalogCache = new Map<string, CatalogEntry<DiscoveredVideoModel[]>>();
const videoCatalogInFlight = new Map<string, Promise<DiscoveredVideoModel[]>>();

interface CatalogEntry<T> { fetchedAt: number; expiresAt: number; models: T }

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

function normalizeModalities(value: unknown): Modality[] {
    const allowed: Modality[] = ['text', 'image', 'video', 'audio', 'file', 'transcription'];
    return asStringArray(value).map((item) => item === 'speech' ? 'audio' : item).filter((item): item is Modality => allowed.includes(item as Modality));
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
        inputModalities: normalizeModalities(architecture.input_modalities),
        outputModalities: normalizeModalities(architecture.output_modalities),
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

function asNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return value.map(asNumber).filter((number): number is number => number !== undefined && number >= 0);
}

function asNumericRecord(value: unknown): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const entries: Array<[string, number]> = [];
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        const number = asNumber(item);
        if (number !== undefined && number >= 0) entries.push([key, number]);
    }
    return Object.fromEntries(entries);
}

export function normalizeDiscoveredVideoModel(value: unknown): DiscoveredVideoModel | null {
    const item = asRecord(value);
    const id = asString(item.id);
    if (!id) return null;
    const upscale = asRecord(item.upscale_factor);
    const prices = asNumericRecord(item.pricing_skus);
    if (item.upscale_factor != null && (typeof upscale.min !== 'number' || typeof upscale.max !== 'number' || !Number.isFinite(upscale.min) || !Number.isFinite(upscale.max) || !Array.isArray(item.creativity) || item.creativity.some(level => typeof level !== 'number' || !Number.isInteger(level)) || Object.keys(prices).length !== Object.keys(asRecord(item.pricing_skus)).length)) return null;
    return {
        id,
        canonicalSlug: asString(item.canonical_slug),
        name: asString(item.name),
        description: asString(item.description),
        supportedDurations: asNumberArray(item.supported_durations),
        supportedResolutions: asStringArray(item.supported_resolutions),
        supportedAspectRatios: asStringArray(item.supported_aspect_ratios),
        supportedSizes: asStringArray(item.supported_sizes),
        allowedPassthroughParameters: asStringArray(item.allowed_passthrough_parameters),
        pricingSkus: prices,
        ...(typeof asRecord(item.upscale_factor).min === 'number' && typeof asRecord(item.upscale_factor).max === 'number' ? { upscaleFactor: { min: Number(asRecord(item.upscale_factor).min), max: Number(asRecord(item.upscale_factor).max) } } : {}),
        ...(Array.isArray(item.creativity) ? { creativityLevels: asNumberArray(item.creativity) } : {}),
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
        response = await fetcher(`${baseUrl}/models${options.outputModality ? `?output_modalities=${options.outputModality}` : ''}`, { headers: catalogHeaders(options.apiKey) });
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
    const key = `${normalizeBaseUrl(options.baseUrl)}${options.outputModality ? `?output_modalities=${options.outputModality}` : ''}`;
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

/** Refreshes OpenRouter's dedicated video catalog, including per-model limits and pricing. */
export async function discoverOpenRouterVideoModels(options: ModelDiscoveryOptions = {}): Promise<DiscoveredVideoModel[]> {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const currentTime = (options.now || Date.now)();
    const cached = videoCatalogCache.get(baseUrl);
    if (!options.force && cached && cached.expiresAt > currentTime) return cached.models;
    const pending = videoCatalogInFlight.get(baseUrl);
    if (pending && !options.force) return pending;

    const request = (async () => {
        const fetcher = options.fetch || globalThis.fetch;
        if (!fetcher) throw new AICapabilityError({ code: 'NETWORK_ERROR', message: 'No fetch implementation is available for OpenRouter video model discovery.', provider: 'openrouter', retryable: false });
        let response: Response;
        try {
            response = await fetcher(`${baseUrl}/videos/models`, { headers: catalogHeaders(options.apiKey) });
        } catch (cause) {
            if (options.staleIfError !== false && cached) return cached.models;
            throw new AICapabilityError({ code: 'NETWORK_ERROR', message: 'OpenRouter video model discovery could not be reached.', provider: 'openrouter', retryable: true, cause });
        }
        const body = await response.json().catch(() => null) as unknown;
        if (!response.ok) {
            if (options.staleIfError !== false && cached) return cached.models;
            const classification = providerError(response.status);
            const errorBody = asRecord(body);
            const nested = asRecord(errorBody.error);
            throw new AICapabilityError({
                code: classification.code,
                message: asString(errorBody.message) || asString(nested.message) || `OpenRouter video model discovery failed (${response.status}).`,
                provider: 'openrouter', status: response.status, requestId: response.headers.get('x-request-id') || undefined,
                retryable: classification.retryable, details: body,
            });
        }
        const data = asRecord(body).data;
        const models = (Array.isArray(data) ? data : []).map(normalizeDiscoveredVideoModel).filter((item): item is DiscoveredVideoModel => item !== null);
        const fetchedAt = (options.now || Date.now)();
        videoCatalogCache.set(baseUrl, { fetchedAt, expiresAt: fetchedAt + Math.max(0, options.ttlMs ?? DEFAULT_MODEL_CATALOG_TTL_MS), models });
        return models;
    })().finally(() => {
        if (videoCatalogInFlight.get(baseUrl) === request) videoCatalogInFlight.delete(baseUrl);
    });
    videoCatalogInFlight.set(baseUrl, request);
    return request;
}

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
    const result = candidates.sort((left, right) => left.id.localeCompare(right.id))[0];
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
    videoCatalogCache.clear();
    videoCatalogInFlight.clear();
}
