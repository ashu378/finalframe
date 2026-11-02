import type OpenAI from 'openai';
import { assertCapabilityRequest } from '../ai/capabilities';
import { getFallbackModelsForCapability, getModelForCapability, isCatalogSelectionModel, REVIEWED_OPERATION_CONTRACTS, type AICapability } from '../ai/model-registry';
import { discoverOpenRouterVideoModels, selectOpenRouterModel } from '../ai/model-discovery';
import {
    AICapabilityError,
    type CapabilityId,
    type ImageGenerationRequest,
    type NormalizedUsage,
    type SpeechSynthesisRequest,
    type TranscriptionRequest,
    type VideoGenerationRequest,
} from '../ai/types';
import type { CameraConfig, MotionConfig } from '../types/database';

const BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 10000;

export interface OpenRouterRetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    /** Injectable for tests and workers that have their own scheduler. */
    sleep?: (ms: number) => Promise<void>;
}

export interface OpenRouterTransportOptions {
    /** Optional by design: catalog discovery can work without credentials. */
    apiKey?: string | null;
    baseUrl?: string;
    fetch?: typeof globalThis.fetch;
    timeoutMs?: number;
    /** Maximum downloaded output size; defaults to 128 MiB for videos. */
    maxResponseBytes?: number;
    /** Durable submit fence, invoked after local/catalog preflight and before
     * the first and only video POST. A rejected fence must not count as a submission. */
    beforeMediaSubmit?: () => Promise<void>;
    signal?: AbortSignal;
    idempotencyKey?: string;
    retry?: OpenRouterRetryOptions;
    /** Compatibility aliases for callers that prefer flat retry settings. */
    maxRetries?: number;
    retryBaseDelayMs?: number;
    retryMaxDelayMs?: number;
    fallbackModels?: string[];
    /** The caller selected this model from the live video catalog and validated its controls. */
    allowDiscoveredModel?: boolean;
    /** Deterministic provider seam for local/CI tests. Never enabled implicitly. */
    mock?: OpenRouterMockOptions;
}

export interface OpenRouterMockRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
}

export interface OpenRouterMockResponse {
    status?: number;
    headers?: Record<string, string>;
    body?: unknown;
    binaryBody?: ArrayBuffer;
}

export interface OpenRouterMockOptions {
    seed: string;
    handler?: (request: OpenRouterMockRequest) => OpenRouterMockResponse | Promise<OpenRouterMockResponse>;
}

export function createDeterministicMockOptions(seed = 'finalframe-test'): OpenRouterTransportOptions {
    return { mock: { seed }, apiKey: null, retry: { maxRetries: 0 } };
}

export interface StructuredOutputInput {
    name: string;
    schema: Record<string, unknown>;
    /** Strict output is mandatory for this gateway. False is rejected. */
    strict?: boolean;
    description?: string;
}

export interface OpenRouterChatOptions extends OpenRouterTransportOptions {
    /** Called after local validation and key checks, immediately before POST.
     * Budgeted execution owns retries; never retry an ambiguous paid POST. */
    beforeChatSubmit?: () => Promise<void>;
    providerPriceCeiling?: { prompt: number; completion: number };
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    structuredOutput?: StructuredOutputInput;
    responseFormat?: StructuredOutputInput;
    /** Compatibility alias retained from the earlier adapter. */
    schema?: StructuredOutputInput;
    model?: string;
    cameraConfig?: CameraConfig;
    motionConfig?: MotionConfig;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
    const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    return Number.isFinite(number) ? number : undefined;
}

function apiKey(options?: OpenRouterTransportOptions): string | undefined {
    return options?.apiKey === null ? undefined : options?.apiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

function requireKey(options: OpenRouterTransportOptions | undefined, capability?: string, model?: string): void {
    if (!options?.mock && !apiKey(options)) {
        throw new AICapabilityError({
            code: 'MISSING_API_KEY',
            message: 'OPENROUTER_API_KEY is required to execute an OpenRouter request.',
            provider: 'openrouter',
            capability,
            model,
            retryable: false,
        });
    }
}

function deterministicHash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function valueFromSchema(schema: unknown, seed: string, path = '$'): unknown {
    const item = asRecord(schema);
    const union = Array.isArray(item.anyOf) ? item.anyOf : Array.isArray(item.oneOf) ? item.oneOf : undefined;
    if (union?.length) return valueFromSchema(union.find((candidate) => asRecord(candidate).type !== 'null') || union[0], seed, path);
    if (Array.isArray(item.enum) && item.enum.length) return item.enum[0];
    switch (item.type) {
        case 'object': {
            const properties = asRecord(item.properties);
            return Object.fromEntries(Object.entries(properties).map(([key, child]) => [key, valueFromSchema(child, `${seed}:${path}.${key}`, `${path}.${key}`)]));
        }
        case 'array': {
            const minimum = typeof item.minItems === 'number' ? item.minItems : 0;
            return Array.from({ length: minimum }, (_, index) => valueFromSchema(item.items, `${seed}:${path}[${index}]`, `${path}[${index}]`));
        }
        case 'number':
        case 'integer':
            return typeof item.minimum === 'number' ? item.minimum : 1;
        case 'boolean':
            return false;
        case 'null':
            return null;
        default:
            return `${path.replace(/^\$\.?/, '').replace(/[^a-zA-Z0-9]+/g, '-') || 'mock'}-${deterministicHash(seed).slice(0, 6)}`;
    }
}

function defaultMockResponse(request: OpenRouterMockRequest, seed: string): OpenRouterMockResponse {
    const path = new URL(request.url).pathname;
    const body = asRecord(request.body);
    const requestId = `mock-${deterministicHash(`${seed}:${request.method}:${path}`)}`;
    if (path.endsWith('/chat/completions')) {
        const responseFormat = asRecord(body.response_format);
        const jsonSchema = asRecord(responseFormat.json_schema);
        const schema = jsonSchema.schema;
        const content = schema ? JSON.stringify(valueFromSchema(schema, seed)) : `FinalFrame deterministic mock response (${seed})`;
        return { headers: { 'x-request-id': requestId, 'content-type': 'application/json' }, body: { id: requestId, model: body.model, choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0 } } };
    }
    if (path.endsWith('/images')) {
        return { headers: { 'x-request-id': requestId, 'content-type': 'application/json' }, body: { created: 0, data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', media_type: 'image/png' }], usage: { cost: 0 } } };
    }
    if (path.endsWith('/videos') && request.method === 'POST') {
        return { headers: { 'x-request-id': requestId, 'content-type': 'application/json' }, body: { id: requestId, status: 'succeeded', model: body.model, generation_id: requestId, usage: { cost: 0 } } };
    }
    if (path.includes('/videos/') && path.endsWith('/content')) {
        return { headers: { 'x-request-id': requestId, 'content-type': 'video/mp4' }, binaryBody: new Uint8Array([0, 0, 0, 0]).buffer };
    }
    if (path.includes('/videos/')) {
        return { headers: { 'x-request-id': requestId, 'content-type': 'application/json' }, body: { id: path.split('/').pop(), status: 'succeeded', unsigned_urls: [`mock://finalframe/${requestId}.mp4`], usage: { cost: 0 } } };
    }
    if (path.endsWith('/audio/transcriptions')) {
        return { headers: { 'x-request-id': requestId, 'content-type': 'application/json' }, body: { text: `Deterministic transcript (${seed})`, segments: [], words: [], usage: { seconds: 0, cost: 0 } } };
    }
    if (path.endsWith('/audio/speech')) {
        return { headers: { 'x-request-id': requestId, 'content-type': 'audio/mpeg', 'x-openrouter-usage': JSON.stringify({ seconds: 0, cost: 0 }) }, binaryBody: new Uint8Array([0x49, 0x44, 0x33, 0x04]).buffer };
    }
    return { status: 404, headers: { 'x-request-id': requestId, 'content-type': 'application/json' }, body: { error: { code: 'mock_not_implemented', message: `Mock route not implemented: ${path}` } } };
}

function getFetch(options?: OpenRouterTransportOptions): typeof globalThis.fetch {
    if (options?.mock) {
        const mock = options.mock;
        return (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const headers = Object.fromEntries(new Headers(init?.headers).entries());
            const rawBody = typeof init?.body === 'string' ? init.body : undefined;
            const request: OpenRouterMockRequest = { url, method: (init?.method || 'GET').toUpperCase(), headers, body: rawBody ? JSON.parse(rawBody) : undefined };
            const result = await (mock.handler ? mock.handler(request) : defaultMockResponse(request, mock.seed));
            const responseHeaders = new Headers(result.headers);
            if (result.binaryBody !== undefined) return new Response(result.binaryBody, { status: result.status || 200, headers: responseHeaders });
            return new Response(result.body === undefined ? null : JSON.stringify(result.body), { status: result.status || 200, headers: responseHeaders });
        }) as typeof globalThis.fetch;
    }
    const result = options?.fetch || globalThis.fetch;
    if (!result) {
        throw new AICapabilityError({ code: 'NETWORK_ERROR', message: 'No fetch implementation is available for OpenRouter.', provider: 'openrouter', retryable: false });
    }
    return result;
}

export function classifyOpenRouterError(status: number): { code: AICapabilityError['code']; retryable: boolean } {
    if (status === 400 || status === 422) return { code: 'INVALID_REQUEST', retryable: false };
    if (status === 401 || status === 403) return { code: 'PROVIDER_AUTHENTICATION', retryable: false };
    if (status === 402) return { code: 'PROVIDER_PAYMENT_REQUIRED', retryable: false };
    if (status === 404) return { code: 'UNSUPPORTED_MODEL', retryable: false };
    if (status === 408) return { code: 'REQUEST_TIMEOUT', retryable: true };
    if (status === 409 || status === 425 || status === 429) return { code: status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_UNAVAILABLE', retryable: true };
    if (status >= 500) return { code: 'PROVIDER_UNAVAILABLE', retryable: true };
    return { code: 'PROVIDER_ERROR', retryable: false };
}

function isFallbackEligible(error: AICapabilityError): boolean {
    if (error.code === 'UNSUPPORTED_MODEL' || error.retryable) return true;
    // OpenRouter sometimes reports an unavailable/incompatible model as a
    // 400/422 request error. Treat only those explicit availability messages
    // as model failures so ordinary malformed requests still fail fast.
    const providerMessage = asString(asRecord(error.details).providerMessage) || '';
    return /no compatible .* model|model .* (?:not available|unavailable|not found)|no endpoints? found|does not support (?:the )?requested/i.test(`${error.message} ${providerMessage}`);
}

function retryOptions(options: OpenRouterTransportOptions): Required<Pick<OpenRouterRetryOptions, 'maxRetries' | 'baseDelayMs' | 'maxDelayMs'>> & Pick<OpenRouterRetryOptions, 'sleep'> {
    return {
        maxRetries: Math.max(0, Math.floor(options.retry?.maxRetries ?? options.maxRetries ?? DEFAULT_MAX_RETRIES)),
        baseDelayMs: Math.max(0, options.retry?.baseDelayMs ?? options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS),
        maxDelayMs: Math.max(0, options.retry?.maxDelayMs ?? options.retryMaxDelayMs ?? MAX_RETRY_DELAY_MS),
        sleep: options.retry?.sleep,
    };
}

function assertFiniteRange(value: number | undefined, name: string, minimum: number, maximum?: number): void {
    if (value === undefined || !Number.isFinite(value) || value < minimum || (maximum !== undefined && value > maximum)) {
        throw new AICapabilityError({ code: 'INVALID_REQUEST', message: `${name} must be between ${minimum} and ${maximum ?? 'infinity'}.`, provider: 'openrouter', retryable: false });
    }
}

function retryAfterMs(response: Response): number | undefined {
    const value = response.headers.get('retry-after');
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function delayForAttempt(response: Response | undefined, attempt: number, options: OpenRouterTransportOptions): number {
    const retryAfter = response ? retryAfterMs(response) : undefined;
    if (retryAfter !== undefined) return Math.min(retryAfter, retryOptions(options).maxDelayMs);
    const retry = retryOptions(options);
    return Math.min(retry.maxDelayMs, retry.baseDelayMs * (2 ** attempt));
}

function stableRequestIdempotencyKey(path: string, method: string, init: RequestInit, options: OpenRouterTransportOptions): string | undefined {
    if (method === 'GET' || method === 'HEAD') return undefined;
    if (options.idempotencyKey?.trim()) return options.idempotencyKey.trim();
    const body = typeof init.body === 'string' ? init.body : '';
    const first = deterministicHash(`${method}:${path}:${body}`);
    const second = deterministicHash(`${body}:${path}:${method}:finalframe-v1`);
    return `ff-${first}-${second}`;
}

function requestHeaders(options: OpenRouterTransportOptions, init: RequestInit, method: string, idempotencyKey?: string): Headers {
    const headers = new Headers(init.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (!headers.has('HTTP-Referer')) headers.set('HTTP-Referer', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
    if (!headers.has('X-Title')) headers.set('X-Title', 'FinalFrame');
    if (apiKey(options) && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${apiKey(options)}`);
    if (method !== 'GET' && method !== 'HEAD') {
        const key = idempotencyKey || stableRequestIdempotencyKey('', method, init, options);
        if (key) headers.set('X-Idempotency-Key', key);
    }
    return headers;
}

function responseMessage(body: unknown, fallback: string): string {
    const record = asRecord(body);
    const error = asRecord(record.error);
    return asString(record.message) || asString(record.error) || asString(error.message) || fallback;
}

function normalizedProviderDetails(body: unknown): Record<string, unknown> | undefined {
    const record = asRecord(body);
    const nested = asRecord(record.error);
    const code = asString(record.code) || asString(nested.code) || asString(record.type) || asString(nested.type);
    const message = asString(record.message) || asString(nested.message);
    if (!code && !message) return undefined;
    return { ...(code ? { providerCode: code } : {}), ...(message ? { providerMessage: message } : {}) };
}

function abortError(cause: unknown, capability?: string, model?: string): AICapabilityError {
    const name = asRecord(cause).name;
    return new AICapabilityError({
        code: name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
        message: name === 'AbortError' ? 'OpenRouter request timed out.' : 'OpenRouter could not be reached.',
        provider: 'openrouter',
        capability,
        model,
        retryable: true,
        cause,
    });
}

interface JsonResponse<T> {
    body: T;
    requestId?: string;
}

async function requestJson<T>(path: string, init: RequestInit, options: OpenRouterTransportOptions, capability: string, model?: string): Promise<JsonResponse<T>> {
    requireKey(options, capability, model);
    const fetcher = getFetch(options);
    const retry = retryOptions(options);
    const method = (init.method || 'GET').toUpperCase();
    const idempotencyKey = stableRequestIdempotencyKey(path, method, init, options);

    for (let attempt = 0; attempt <= retry.maxRetries; attempt += 1) {
        let response: Response | undefined;
        const controller = new AbortController();
        const timeout = options.timeoutMs === 0 ? undefined : setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
        const abortListener = () => controller.abort();
        if (options.signal) {
            if (options.signal.aborted) controller.abort();
            else options.signal.addEventListener('abort', abortListener, { once: true });
        }
        try {
            response = await fetcher(`${(options.baseUrl || BASE_URL).replace(/\/+$/, '')}${path}`, {
                ...init,
                method,
                signal: controller.signal,
                headers: requestHeaders(options, init, method, idempotencyKey),
            });
            const body = await response.json().catch(() => null) as unknown;
            if (response.ok) {
                return { body: body as T, requestId: response.headers.get('x-request-id') || undefined };
            }
            const classification = classifyOpenRouterError(response.status);
            const error = new AICapabilityError({
                code: classification.code,
                message: responseMessage(body, `OpenRouter request failed (${response.status}).`),
                provider: 'openrouter',
                capability,
                model,
                status: response.status,
                requestId: response.headers.get('x-request-id') || undefined,
                retryable: classification.retryable,
                details: normalizedProviderDetails(body),
            });
            if (!error.retryable || attempt >= retry.maxRetries) throw error;
            if (retry.sleep) await retry.sleep(delayForAttempt(response, attempt, options));
            else if (delayForAttempt(response, attempt, options) > 0) await new Promise((resolve) => setTimeout(resolve, delayForAttempt(response, attempt, options)));
        } catch (cause) {
            const error = cause instanceof AICapabilityError ? cause : abortError(cause, capability, model);
            if (options.signal?.aborted && error.retryable) {
                const normalized = error.toJSON();
                throw new AICapabilityError({ code: normalized.code, message: normalized.message, provider: normalized.provider, capability: normalized.capability, model: normalized.model, status: normalized.status, requestId: normalized.requestId, details: normalized.details, retryable: false, cause });
            }
            if (!error.retryable || attempt >= retry.maxRetries) throw error;
            if (retry.sleep) await retry.sleep(delayForAttempt(response, attempt, options));
            else if (delayForAttempt(response, attempt, options) > 0) await new Promise((resolve) => setTimeout(resolve, delayForAttempt(response, attempt, options)));
        } finally {
            if (timeout) clearTimeout(timeout);
            options.signal?.removeEventListener('abort', abortListener);
        }
    }
    throw new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter request failed after retries.', provider: 'openrouter', capability, model, retryable: false });
}

export function extractUsageAndCost(value: unknown): { usage?: NormalizedUsage; costUsd?: number } {
    const raw = asRecord(value);
    const usage = asRecord(raw.usage);
    const costDetails = asRecord(usage.cost_details || raw.cost_details);
    const promptTokens = finiteNumber(usage.prompt_tokens ?? usage.input_tokens ?? raw.prompt_tokens ?? raw.input_tokens) ?? 0;
    const completionTokens = finiteNumber(usage.completion_tokens ?? usage.output_tokens ?? raw.completion_tokens ?? raw.output_tokens) ?? 0;
    const totalTokens = finiteNumber(usage.total_tokens ?? raw.total_tokens) ?? promptTokens + completionTokens;
    const costUsd = finiteNumber(usage.cost ?? usage.cost_usd ?? costDetails.total ?? costDetails.total_cost ?? raw.cost ?? raw.cost_usd);
    const seconds = finiteNumber(usage.seconds ?? raw.seconds);
    const cachedTokens = finiteNumber(usage.cached_tokens ?? usage.cache_read_input_tokens);
    const reasoningTokens = finiteNumber(usage.reasoning_tokens ?? asRecord(usage.completion_tokens_details).reasoning_tokens);
    const hasUsage = Object.keys(usage).length > 0 || ['prompt_tokens', 'input_tokens', 'completion_tokens', 'output_tokens', 'total_tokens', 'cost', 'cost_usd'].some((key) => key in raw);
    if (!hasUsage) return {};
    const normalized: NormalizedUsage = {
        promptTokens,
        completionTokens,
        totalTokens,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        ...(cachedTokens === undefined ? {} : { cachedTokens }),
        ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
        ...(seconds === undefined ? {} : { seconds }),
        ...(costUsd === undefined ? {} : { costUsd, cost: costUsd }),
        raw: value,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
    };
    return { usage: normalized, ...(costUsd === undefined ? {} : { costUsd }) };
}

export interface AIResponse {
    content: string | null;
    modelUsed: string;
    /** Legacy alias retained for existing pipeline consumers. */
    model?: string;
    usage?: NormalizedUsage;
    normalizedUsage?: NormalizedUsage;
    costUsd?: number;
    requestId?: string;
    raw?: unknown;
}

function isJsonSchemaObject(value: Record<string, unknown>): boolean {
    return value.type === 'object' && value.properties !== null && typeof value.properties === 'object' && !Array.isArray(value.properties) && value.additionalProperties === false && Array.isArray(value.required);
}

function assertStructuredValue(value: unknown, schema: unknown, path: string): void {
    const definition = asRecord(schema);
    const union = Array.isArray(definition.anyOf) ? definition.anyOf : Array.isArray(definition.oneOf) ? definition.oneOf : undefined;
    if (union) {
        const valid = union.some((candidate) => {
            try {
                assertStructuredValue(value, candidate, path);
                return true;
            } catch {
                return false;
            }
        });
        if (!valid) throw new Error(`${path} does not match any allowed schema branch.`);
        return;
    }
    if (Array.isArray(definition.enum) && !definition.enum.some((candidate) => Object.is(candidate, value))) throw new Error(`${path} is not an allowed enum value.`);
    if (definition.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`);
        const object = value as Record<string, unknown>;
        const properties = asRecord(definition.properties);
        const required = Array.isArray(definition.required) ? definition.required : [];
        for (const key of required) if (!(key in object)) throw new Error(`${path}.${String(key)} is required.`);
        if (definition.additionalProperties === false) for (const key of Object.keys(object)) if (!(key in properties)) throw new Error(`${path}.${key} is not allowed.`);
        for (const [key, child] of Object.entries(properties)) if (key in object) assertStructuredValue(object[key], child, `${path}.${key}`);
        return;
    }
    if (definition.type === 'array') {
        if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
        if (typeof definition.minItems === 'number' && value.length < definition.minItems) throw new Error(`${path} contains too few items.`);
        value.forEach((item, index) => assertStructuredValue(item, definition.items, `${path}[${index}]`));
        return;
    }
    if (definition.type === 'string' && (typeof value !== 'string' || (typeof definition.minLength === 'number' && value.length < definition.minLength))) throw new Error(`${path} must be a string.`);
    if (definition.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`${path} must be a number.`);
    if (definition.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) throw new Error(`${path} must be an integer.`);
    if (definition.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${path} must be a boolean.`);
    if (typeof definition.minimum === 'number' && typeof value === 'number' && value < definition.minimum) throw new Error(`${path} is below its minimum.`);
    if (typeof definition.exclusiveMinimum === 'number' && typeof value === 'number' && value <= definition.exclusiveMinimum) throw new Error(`${path} is below its exclusive minimum.`);
}

function assertStrictSchema(value: unknown, path: string): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const schema = value as Record<string, unknown>;
    if (schema.type === 'object') {
        if (!isJsonSchemaObject(schema)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: `Strict structured output schema at ${path} must close additional properties and require every property.`, provider: 'openrouter', retryable: false });
        const properties = asRecord(schema.properties);
        const required = schema.required as unknown[];
        if (Object.keys(properties).some((property) => !required.includes(property))) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: `Strict structured output schema at ${path} must require every property.`, provider: 'openrouter', retryable: false });
        Object.entries(properties).forEach(([key, child]) => assertStrictSchema(child, `${path}.${key}`));
    }
    if (schema.type === 'array' && schema.items) assertStrictSchema(schema.items, `${path}[]`);
    for (const key of ['anyOf', 'oneOf', 'allOf']) {
        if (Array.isArray(schema[key])) (schema[key] as unknown[]).forEach((child, index) => assertStrictSchema(child, `${path}.${key}[${index}]`));
    }
}

export function buildStructuredResponseFormat(definition: StructuredOutputInput): Record<string, unknown> {
    if (definition.strict === false || !/^[A-Za-z0-9_-]{1,64}$/.test(definition.name) || !isJsonSchemaObject(definition.schema)) {
        throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Strict structured output requires a valid name and an object JSON Schema with additionalProperties=false and required fields.', provider: 'openrouter', retryable: false });
    }
    const properties = asRecord(definition.schema.properties);
    const required = definition.schema.required as unknown[];
    if (Object.keys(properties).some((property) => !required.includes(property))) {
        throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Strict structured output requires every schema property to be required.', provider: 'openrouter', retryable: false });
    }
    assertStrictSchema(definition.schema, '$');
    return {
        type: 'json_schema',
        json_schema: {
            name: definition.name,
            ...(definition.description ? { description: definition.description } : {}),
            strict: true,
            schema: definition.schema,
        },
    };
}

function appendConfigs(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], camera?: CameraConfig, motion?: MotionConfig) {
    const notes = [
        camera?.angle && `CAMERA ANGLE: ${camera.angle.replace('_', ' ')}`,
        camera?.movement && `CAMERA MOVEMENT: ${camera.movement.replace('_', ' ')}`,
        camera?.lens && `LENS TYPE: ${camera.lens}`,
        motion?.speed && `MOTION SPEED: ${motion.speed}`,
        motion?.stability !== undefined && `STABILITY: ${motion.stability}`,
    ].filter(Boolean).join('\n');
    if (!notes) return messages;
    const last = messages[messages.length - 1];
    if (last?.role === 'user' && typeof last.content === 'string') return [...messages.slice(0, -1), { ...last, content: `${last.content}\n\n[DIRECTING NOTES]\n${notes}` }];
    return [...messages, { role: 'system' as const, content: `[DIRECTING NOTES]\n${notes}` }];
}

export function buildChatCompletionRequest(capability: AICapability, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], options: OpenRouterChatOptions = {}): Record<string, unknown> {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'At least one chat message is required.', provider: 'openrouter', capability, retryable: false });
    }
    if (options.temperature !== undefined) assertFiniteRange(options.temperature, 'temperature', 0, 2);
    if (options.topP !== undefined) assertFiniteRange(options.topP, 'top_p', 0, 1);
    if (options.maxTokens !== undefined) assertFiniteRange(options.maxTokens, 'max_tokens', 1);
    const definition = options.structuredOutput || options.responseFormat || options.schema;
    const validation = assertCapabilityRequest({
        capability,
        model: options.model,
        parameters: [
            ...(options.temperature === undefined ? [] : ['temperature' as const]),
            ...(options.topP === undefined ? [] : ['top_p' as const]),
            ...(options.maxTokens === undefined ? [] : ['max_tokens' as const]),
            ...(definition || options.jsonMode ? ['response_format' as const] : []),
        ],
        structuredOutput: Boolean(definition),
    });
    const responseFormat = definition ? buildStructuredResponseFormat(definition) : options.jsonMode ? { type: 'json_object' } : undefined;
    return {
        model: validation.model,
        messages: appendConfigs(messages, options.cameraConfig, options.motionConfig),
        ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
        ...(options.topP === undefined ? {} : { top_p: options.topP }),
        ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...(definition || options.providerPriceCeiling ? { provider: {
            ...(definition ? { require_parameters: true } : {}),
            ...(options.providerPriceCeiling ? { max_price: options.providerPriceCeiling } : {}),
        } } : {}),
    };
}

function parseStructuredContent(content: string | null, definition?: StructuredOutputInput): string | null {
    if (!definition || content === null) return content;
    try {
        const parsed = JSON.parse(content) as unknown;
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object.');
        assertStructuredValue(parsed, definition.schema, '$');
        return JSON.stringify(parsed);
    } catch (cause) {
        throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: 'OpenRouter returned structured output that failed the declared schema.', provider: 'openrouter', retryable: false, details: { responseType: 'structured_output' }, cause });
    }
}

async function executeChatWithModel(capability: AICapability, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], options: OpenRouterChatOptions, model: string): Promise<AIResponse> {
    const request = buildChatCompletionRequest(capability, messages, { ...options, model });
    requireKey(options, capability, model);
    if (!options.mock && !options.beforeChatSubmit) {
        throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Paid text requests require an authorized budget reservation.', provider: 'openrouter', capability, retryable: false });
    }
    await options.beforeChatSubmit?.();
    const transport = options.beforeChatSubmit ? { ...options, maxRetries: 0, retry: { ...options.retry, maxRetries: 0 } } : options;
    const response = await requestJson<Record<string, unknown>>('/chat/completions', { method: 'POST', body: JSON.stringify(request) }, transport, capability, model);
    const choice = Array.isArray(response.body.choices) ? asRecord(response.body.choices[0]) : {};
    const message = asRecord(choice.message);
    const content = typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.map((part) => asString(asRecord(part).text) || '').join('') || null : null;
    const definition = options.structuredOutput || options.responseFormat || options.schema;
    const extracted = extractUsageAndCost(response.body);
    const modelUsed = asString(response.body.model) || model;
    return { content: parseStructuredContent(content, definition), modelUsed, model: modelUsed, ...extracted, normalizedUsage: extracted.usage, requestId: response.requestId, raw: response.body };
}

export async function executeAITask(capability: AICapability, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], options: OpenRouterChatOptions = {}): Promise<AIResponse> {
    const config = getModelForCapability(capability);
    const initialModel = options.model || config.id;
    const configuredFallbacks = options.model ? [] : getFallbackModelsForCapability(capability);
    const candidates = Array.from(new Set([initialModel, ...(options.fallbackModels || configuredFallbacks)])).filter(Boolean);
    let lastError: AICapabilityError | undefined;
    for (const model of candidates) {
        try {
            assertCapabilityRequest({ capability, model, structuredOutput: Boolean(options.structuredOutput || options.responseFormat || options.schema) });
            return await executeChatWithModel(capability, messages, options, model);
        } catch (cause) {
            const error = cause instanceof AICapabilityError ? cause : new AICapabilityError({ code: 'PROVIDER_ERROR', message: `OpenRouter ${capability} request failed.`, provider: 'openrouter', capability, model, retryable: false, cause });
            lastError = error;
            if (options.beforeChatSubmit || !isFallbackEligible(error) || model === candidates[candidates.length - 1]) throw error;
        }
    }
    throw lastError || new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter request failed.', provider: 'openrouter', capability, retryable: false });
}

function imageBody(input: ImageGenerationRequest, model: string): Record<string, unknown> {
    return {
        model,
        prompt: input.prompt,
        ...(input.n === undefined ? {} : { n: input.n }),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        ...(input.size ? { size: input.size } : {}),
        ...(input.quality ? { quality: input.quality } : {}),
        ...(input.outputFormat ? { output_format: input.outputFormat } : {}),
        ...(input.background ? { background: input.background } : {}),
        ...(input.outputCompression === undefined ? {} : { output_compression: input.outputCompression }),
        ...(input.seed === undefined ? {} : { seed: input.seed }),
        ...(input.inputReferences ? { input_references: input.inputReferences.map((reference) => ({ type: 'image_url', image_url: { url: 'url' in reference ? reference.url : `data:${reference.mediaType || 'image/png'};base64,${reference.data}` } })) } : {}),
        ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}),
    };
}

export function buildImageGenerationRequest(input: ImageGenerationRequest, options: { allowDiscoveredModel?: boolean } = {}): Record<string, unknown> {
    if (!input.prompt?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Image prompt is required.', provider: 'openrouter', capability: 'IMAGE_GENERATION', retryable: false });
    if (input.n !== undefined) assertFiniteRange(input.n, 'n', 1);
    if (input.outputCompression !== undefined) assertFiniteRange(input.outputCompression, 'outputCompression', 0, 100);
    const validation = assertCapabilityRequest({ capability: 'IMAGE_GENERATION', model: input.model, parameters: [
        ...(input.n === undefined ? [] : ['n' as const]),
        ...(input.resolution ? ['resolution' as const] : []),
        ...(input.size ? ['size' as const] : []),
        ...(input.aspectRatio ? ['aspect_ratio' as const] : []),
        ...(input.quality ? ['quality' as const] : []),
        ...(input.inputReferences ? ['input_references' as const] : []),
        ...(input.providerOptions ? ['provider_options' as const] : []),
        ...(input.outputFormat ? ['output_format' as const] : []),
        ...(input.background ? ['background' as const] : []),
        ...(input.outputCompression === undefined ? [] : ['output_compression' as const]),
        ...(input.seed === undefined ? [] : ['seed' as const]),
    ], allowDiscoveredModel: options.allowDiscoveredModel });
    return imageBody(input, validation.model);
}

interface CatalogModelResolution {
    id: string;
    discovered: boolean;
    supportedVoices?: string[];
}

async function resolveCatalogModel(capability: CapabilityId, model: string | undefined, outputModality: 'image' | 'video' | 'audio' | 'transcription', options: OpenRouterTransportOptions, requiredParameters: string[] = []): Promise<CatalogModelResolution> {
    const configured = model || getModelForCapability(capability).id;
    // Deterministic transport fixtures may use local model labels. They are
    // never reachable from the live provider path, where unknown models must
    // still pass the registry/catalog boundary below.
    if (options.mock && (configured === 'auto' || configured === 'openrouter/auto' || /^(local|test)\//.test(configured))) return { id: configured, discovered: true };
    if (!options.allowDiscoveredModel && !isCatalogSelectionModel(capability, configured)) return { id: configured, discovered: false };
    if (outputModality === 'video' && options.allowDiscoveredModel) {
        const catalog = await discoverOpenRouterVideoModels({ ...options, apiKey: apiKey(options) });
        if (!catalog.some((entry) => entry.id === configured)) throw new AICapabilityError({ code: 'UNSUPPORTED_MODEL', message: 'The selected video model is not available in the current catalog.', provider: 'openrouter', model: configured, retryable: false });
        return { id: configured, discovered: true };
    }
    if (options.allowDiscoveredModel && outputModality !== 'video') {
        const path = outputModality === 'image' ? '/images/models' : `/models?output_modalities=${outputModality === 'audio' ? 'speech' : 'transcription'}`;
        const response = await requestJson<{ data?: Array<Record<string, unknown>> }>(path, { method: 'GET' }, options, capability, configured);
        const model = response.body.data?.find((entry) => entry.id === configured);
        if (!model) throw new AICapabilityError({ code: 'UNSUPPORTED_MODEL', message: 'The selected media model is not available.', provider: 'openrouter', model: configured, retryable: false });
        if (outputModality === 'image') {
            const parameters = asRecord(model.supported_parameters);
            for (const parameter of requiredParameters) if (!(parameter in parameters)) throw new AICapabilityError({ code: 'UNSUPPORTED_CAPABILITY', message: 'A required image control is unavailable.', provider: 'openrouter', model: configured, retryable: false });
        }
        if (outputModality === 'audio' && requiredParameters.includes('input_references')) {
            const endpoints = await requestJson<{ data?: { endpoints?: Array<{ supports_voice_cloning?: boolean; supports_multiple_audio_references?: boolean }> } }>(`/models/${configured}/endpoints`, { method: 'GET' }, options, capability, configured);
            if (!endpoints.body.data?.endpoints?.length || endpoints.body.data.endpoints.some((entry) => entry.supports_voice_cloning !== true)) throw new AICapabilityError({ code: 'UNSUPPORTED_CAPABILITY', message: 'Reference voice synthesis is unavailable.', provider: 'openrouter', model: configured, retryable: false });
            if (requiredParameters.includes('multiple_audio_references') && endpoints.body.data.endpoints.some((entry) => entry.supports_multiple_audio_references !== true)) throw new AICapabilityError({ code: 'UNSUPPORTED_CAPABILITY', message: 'Multiple reference recordings are unavailable for this speech route.', provider: 'openrouter', model: configured, retryable: false });
        }
        return { id: configured, discovered: true, supportedVoices: Array.isArray(model.supported_voices) ? model.supported_voices.filter((voice): voice is string => typeof voice === 'string') : undefined };
    }
    return { id: (await selectOpenRouterModel({ capability, model: isCatalogSelectionModel(capability, configured) ? undefined : configured, outputModality, requiredParameters, options: { ...options, apiKey: apiKey(options) } })).id, discovered: true };
}

export async function generateImage(input: ImageGenerationRequest, options: OpenRouterTransportOptions = {}) {
    if (!options.mock && !options.beforeMediaSubmit) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Paid media requires a reserved durable job.', provider: 'openrouter', retryable: false });
    if (!input.prompt?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Image prompt is required.', provider: 'openrouter', capability: 'IMAGE_GENERATION', retryable: false });
    const config = getModelForCapability('IMAGE_GENERATION');
    const candidates = Array.from(new Set([input.model || config.id, ...(input.model ? (options.fallbackModels || []) : options.fallbackModels || getFallbackModelsForCapability('IMAGE_GENERATION'))]));
    let lastError: AICapabilityError | undefined;
    for (const candidate of candidates) {
        try {
            const resolved = await resolveCatalogModel('IMAGE_GENERATION', candidate, 'image', options, [...(input.resolution ? ['resolution'] : []), ...(input.aspectRatio ? ['aspect_ratio'] : [])]);
            const model = resolved.id;
            const imageRequestBody = buildImageGenerationRequest({ ...input, model }, { allowDiscoveredModel: resolved.discovered });
            requireKey(options, 'IMAGE_GENERATION', model);
            await options.beforeMediaSubmit?.();
            const response = await requestJson<{ data?: Array<{ b64_json?: string; media_type?: string; url?: string }>; usage?: unknown; model?: string }>('/images', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(imageRequestBody) }, { ...options, maxRetries: 0, retry: { ...options.retry, maxRetries: 0 } }, 'IMAGE_GENERATION', model);
            const images = (response.body.data || []).map((image) => ({ b64Json: image.b64_json, mediaType: image.media_type, url: image.url }));
            if (!images.some((image) => image.b64Json || image.url)) throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: 'OpenRouter returned no image output.', provider: 'openrouter', capability: 'IMAGE_GENERATION', model, retryable: false, details: response.body });
            const first = images[0];
            return { images, b64_json: first?.b64Json, url: first?.url, modelUsed: response.body.model || model, ...extractUsageAndCost(response.body), requestId: response.requestId, raw: response.body };
        } catch (cause) {
            const error = cause instanceof AICapabilityError ? cause : new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter image generation failed.', provider: 'openrouter', capability: 'IMAGE_GENERATION', model: candidate, retryable: false, cause });
            lastError = error;
            if (options.beforeMediaSubmit || ![400, 404, 422].includes(error.status || 0) || !isFallbackEligible(error) || candidate === candidates[candidates.length - 1]) throw error;
        }
    }
    throw lastError || new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter image generation failed.', provider: 'openrouter', capability: 'IMAGE_GENERATION', retryable: false });
}

export function buildVideoGenerationRequest(input: VideoGenerationRequest, options: { allowDiscoveredModel?: boolean } = {}): Record<string, unknown> {
    if (!input.model?.trim() || !input.prompt?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video model and prompt are required.', provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false });
    if (input.duration !== undefined && (!Number.isInteger(input.duration) || input.duration < 1)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video duration must be a positive integer.', provider: 'openrouter', retryable: false });
    if (input.previousJobId && !/^gen-vid-\d+-[0-9A-Za-z]{20}$/.test(input.previousJobId)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'A valid completed provider job is required for continuation.', provider: 'openrouter', retryable: false });
    if (input.upscaleFactor !== undefined) assertFiniteRange(input.upscaleFactor, 'upscaleFactor', Number.EPSILON);
    if (input.creativity !== undefined && (!Number.isInteger(input.creativity) || input.creativity < 0)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Upscale creativity must be a non-negative integer.', provider: 'openrouter', retryable: false });
    const sourceDerived = ['black-forest-labs/flux-video-edit', 'black-forest-labs/flux-video-upscale'].includes(input.model);
    const suppliedAudioAvatar = input.model === REVIEWED_OPERATION_CONTRACTS.suppliedAudioAvatar.modelId;
    if (suppliedAudioAvatar && (input.duration !== undefined || input.generateAudio !== undefined || input.frameImages?.length || input.previousJobId || input.upscaleFactor !== undefined || input.creativity !== undefined || input.inputReferences?.length !== 2 || input.inputReferences.filter(reference=>reference.kind === 'audio').length !== 1 || input.inputReferences.filter(reference=>!reference.kind || reference.kind === 'image').length !== 1)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Supplied-audio Avatar requires exactly one portrait and recording with source-derived duration.', provider: 'openrouter', retryable: false });
    if (sourceDerived && (input.duration !== undefined || input.aspectRatio !== undefined || input.resolution !== undefined || input.frameImages?.length || input.generateAudio === true || input.previousJobId)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Source-derived video operations do not accept generation duration, framing or generated-audio controls.', provider: 'openrouter', retryable: false });
    if (sourceDerived && (input.inputReferences?.length !== 1 || input.inputReferences[0].kind !== 'video')) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Source-derived video operations require exactly one video reference.', provider: 'openrouter', retryable: false });
    if (input.model === 'black-forest-labs/flux-video-edit' && (input.upscaleFactor !== undefined || input.creativity !== undefined)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video editing does not accept upscale controls.', provider: 'openrouter', retryable: false });
    if (input.model === 'black-forest-labs/flux-video-upscale' && (input.upscaleFactor === undefined || input.upscaleFactor < 1.5 || input.upscaleFactor > 3 || ![0, 1].includes(input.creativity!))) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'FLUX upscale requires its documented factor and processing mode.', provider: 'openrouter', retryable: false });
    assertCapabilityRequest({ capability: 'VIDEO_GENERATION', model: input.model, parameters: [
        ...(input.aspectRatio ? ['aspect_ratio' as const] : []),
        ...(input.duration === undefined ? [] : ['duration' as const]),
        ...(input.resolution ? ['resolution' as const] : []),
        ...(input.inputReferences ? ['input_references' as const] : []),
        ...(input.frameImages ? ['frame_images' as const] : []),
        ...(input.generateAudio === undefined ? [] : ['generate_audio' as const]),
        ...(input.previousJobId ? ['previous_job_id' as const] : []),
        ...(input.upscaleFactor === undefined ? [] : ['upscale_factor' as const]),
        ...(input.creativity === undefined ? [] : ['creativity' as const]),
        ...(input.providerOptions ? ['provider_options' as const] : []),
    ], allowDiscoveredModel: options.allowDiscoveredModel });
    return {
        model: input.model,
        prompt: input.prompt,
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        ...(input.duration === undefined ? {} : { duration: input.duration }),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.frameImages ? { frame_images: input.frameImages.map((frame) => ({
            type: 'image_url',
            ...( 'url' in frame ? { image_url: { url: frame.url } } : { image_url: { url: `data:${frame.mediaType || 'image/png'};base64,${frame.data}` } }),
            frame_type: frame.frameType,
        })) } : {}),
        ...(input.inputReferences ? { input_references: input.inputReferences.map((reference) => {
            const kind = reference.kind || 'image';
            if (!['image', 'audio', 'video'].includes(kind)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Unsupported reference media kind.', provider: 'openrouter', retryable: false });
            const defaultMime = kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/wav' : 'image/png';
            const url = 'url' in reference ? reference.url : `data:${reference.mediaType || defaultMime};base64,${reference.data}`;
            return { type: `${kind}_url`, [`${kind}_url`]: { url } };
        }) } : {}),
        ...(input.previousJobId ? { previous_job_id: input.previousJobId } : {}),
        ...(input.upscaleFactor === undefined ? {} : { upscale_factor: input.upscaleFactor }),
        ...(input.creativity === undefined ? {} : { creativity: input.creativity }),
        // OpenRouter enables audio by default for models that support it.
        // Keep video jobs silent unless the caller explicitly opts in.
        ...(sourceDerived || suppliedAudioAvatar ? {} : { generate_audio: input.generateAudio === true }),
        ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}),
    };
}

/**
 * A media submission is never retried by the transport or silently switched to
 * another model. A timeout/5xx can occur after acceptance. The durable worker
 * must reconcile it, rather than purchasing a second generation.
 */
export async function generateVideo(input: VideoGenerationRequest, options: OpenRouterTransportOptions = {}) {
    if (!options.mock && !options.beforeMediaSubmit) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Paid media requires a reserved durable job.', provider: 'openrouter', retryable: false });
    if (!input.prompt?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video prompt is required.', provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false });
    const resolved = await resolveCatalogModel('VIDEO_GENERATION', input.model, 'video', options);
    const model = resolved.id;
    const body = buildVideoGenerationRequest({ ...input, model }, { allowDiscoveredModel: resolved.discovered });
    requireKey(options, 'VIDEO_GENERATION', model);
    await options.beforeMediaSubmit?.();
    try {
        const response = await requestJson<{ id: string; polling_url?: string; status: string; generation_id?: string; usage?: unknown; model?: string }>('/videos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, { ...options, maxRetries: 0, retry: { ...options.retry, maxRetries: 0 } }, 'VIDEO_GENERATION', model);
        if (!response.body?.id) throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: 'OpenRouter returned no video task ID.', provider: 'openrouter', capability: 'VIDEO_GENERATION', model, retryable: false, details: { submissionUnknown: true } });
        return { id: response.body.id, pollingUrl: response.body.polling_url, polling_url: response.body.polling_url, status: response.body.status, generationId: response.body.generation_id, generation_id: response.body.generation_id, modelUsed: response.body.model || model, ...extractUsageAndCost(response.body), requestId: response.requestId, raw: response.body };
    } catch (cause) {
        const error = cause instanceof AICapabilityError ? cause : abortError(cause, 'VIDEO_GENERATION', model);
        const submissionUnknown = ['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'INVALID_PROVIDER_RESPONSE'].includes(error.code) || (error.status !== undefined && (error.status >= 500 || error.status === 408));
        throw new AICapabilityError({ ...error.toJSON(), retryable: false, details: { ...asRecord(error.details), submissionUnknown }, cause });
    }
}

export const submitVideo = generateVideo;

export async function pollVideo(jobId: string, options: OpenRouterTransportOptions = {}) {
    if (!jobId?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video job ID is required.', provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false });
    const response = await requestJson<{ id: string; status: string; error?: string; unsigned_urls?: string[]; usage?: unknown }>(`/videos/${encodeURIComponent(jobId)}`, { method: 'GET' }, options, 'VIDEO_GENERATION');
    return { ...response.body, requestId: response.requestId, ...extractUsageAndCost(response.body) };
}

export interface VideoPollingOptions {
    maxAttempts?: number;
    intervalMs?: number;
}

/** Polls an accepted video job until OpenRouter reports a terminal state. */
export async function waitForVideo(jobId: string, options: OpenRouterTransportOptions = {}, polling: VideoPollingOptions = {}) {
    const maxAttempts = Math.max(1, Math.floor(polling.maxAttempts ?? 60));
    const intervalMs = Math.max(0, polling.intervalMs ?? 3000);
    let current = await pollVideo(jobId, options);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const status = String(current.status || '').toLowerCase();
        if (['completed', 'succeeded', 'success'].includes(status)) return current;
        if (['failed', 'error', 'canceled', 'cancelled', 'expired'].includes(status)) {
            throw new AICapabilityError({
                code: 'PROVIDER_ERROR',
                message: current.error || `OpenRouter video generation ended with status ${current.status}.`,
                provider: 'openrouter',
                capability: 'VIDEO_GENERATION',
                retryable: false,
                details: normalizedProviderDetails(current),
            });
        }
        if (!['pending', 'queued', 'running', 'in_progress', 'processing'].includes(status)) {
            throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: `OpenRouter returned an unknown video status: ${current.status}.`, provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false });
        }
        if (attempt === maxAttempts - 1) break;
        if (options.retry?.sleep) await options.retry.sleep(intervalMs);
        else if (intervalMs > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
        current = await pollVideo(jobId, options);
    }
    throw new AICapabilityError({ code: 'REQUEST_TIMEOUT', message: `OpenRouter video generation did not complete after ${maxAttempts} polls.`, provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: true, details: { jobId, maxAttempts } });
}

function usageFromHeaders(headers: Headers): { usage?: NormalizedUsage; costUsd?: number } {
    const raw = headers.get('x-openrouter-usage') || headers.get('x-usage');
    if (!raw) return {};
    try {
        return extractUsageAndCost(JSON.parse(raw) as unknown);
    } catch {
        return {};
    }
}

async function requestBinary(path: string, init: RequestInit, options: OpenRouterTransportOptions, capability: string, model?: string): Promise<{ response: Response; requestId?: string; generationId?: string; usage?: NormalizedUsage; costUsd?: number }> {
    requireKey(options, capability, model);
    const fetcher = getFetch(options);
    const retry = retryOptions(options);
    const method = (init.method || 'GET').toUpperCase();
    const idempotencyKey = stableRequestIdempotencyKey(path, method, init, options);
    for (let attempt = 0; attempt <= retry.maxRetries; attempt += 1) {
        const controller = new AbortController();
        const timeout = options.timeoutMs === 0 ? undefined : setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
        const abortListener = () => controller.abort();
        if (options.signal) {
            if (options.signal.aborted) controller.abort();
            else options.signal.addEventListener('abort', abortListener, { once: true });
        }
        try {
            const response = await fetcher(`${(options.baseUrl || BASE_URL).replace(/\/+$/, '')}${path}`, { ...init, method, signal: controller.signal, headers: requestHeaders(options, init, method, idempotencyKey) });
            if (response.ok) return { response, requestId: response.headers.get('x-request-id') || undefined, generationId: response.headers.get('x-generation-id') || undefined, ...usageFromHeaders(response.headers) };
            const body = await response.clone().json().catch(() => null) as unknown;
            const classification = classifyOpenRouterError(response.status);
            const error = new AICapabilityError({ code: classification.code, message: responseMessage(body, `OpenRouter ${capability} request failed (${response.status}).`), provider: 'openrouter', capability, model, status: response.status, requestId: response.headers.get('x-request-id') || undefined, retryable: classification.retryable, details: normalizedProviderDetails(body) });
            if (!error.retryable || attempt >= retry.maxRetries) throw error;
            const wait = delayForAttempt(response, attempt, options);
            if (retry.sleep) await retry.sleep(wait); else if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        } catch (cause) {
            const error = cause instanceof AICapabilityError ? cause : abortError(cause, capability, model);
            if (options.signal?.aborted && error.retryable) {
                const normalized = error.toJSON();
                throw new AICapabilityError({ code: normalized.code, message: normalized.message, provider: normalized.provider, capability: normalized.capability, model: normalized.model, status: normalized.status, requestId: normalized.requestId, details: normalized.details, retryable: false, cause });
            }
            if (!error.retryable || attempt >= retry.maxRetries) throw error;
            const wait = delayForAttempt(undefined, attempt, options);
            if (retry.sleep) await retry.sleep(wait); else if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        } finally {
            if (timeout) clearTimeout(timeout);
            options.signal?.removeEventListener('abort', abortListener);
        }
    }
    throw new AICapabilityError({ code: 'PROVIDER_ERROR', message: `OpenRouter ${capability} request failed after retries.`, provider: 'openrouter', capability, retryable: false });
}

async function boundedBinaryBody(response: Response, maxBytes: number): Promise<ArrayBuffer> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Invalid media download size limit.', provider: 'openrouter', retryable: false });
    const length = Number(response.headers.get('content-length'));
    if (length > maxBytes) { await response.body?.cancel(); throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: 'Provider media exceeds the allowed size.', provider: 'openrouter', retryable: false }); }
    const reader = response.body?.getReader();
    if (!reader) return new ArrayBuffer(0);
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) break;
            total += next.value.byteLength;
            if (total > maxBytes) { await reader.cancel(); throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: 'Provider media exceeds the allowed size.', provider: 'openrouter', retryable: false }); }
            chunks.push(next.value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes.buffer;
}

export async function downloadVideo(jobId: string, options: OpenRouterTransportOptions = {}, index = 0) {
    if (!jobId?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video job ID is required.', provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false });
    if (!Number.isInteger(index) || index < 0) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video content index must be a non-negative integer.', provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false });
    const result = await requestBinary(`/videos/${encodeURIComponent(jobId)}/content?index=${index}`, { method: 'GET' }, options, 'VIDEO_GENERATION');
    return { body: await boundedBinaryBody(result.response, options.maxResponseBytes ?? 128 * 1024 * 1024), contentType: result.response.headers.get('content-type') || 'video/mp4', requestId: result.requestId };
}

export function buildSpeechSynthesisRequest(input: SpeechSynthesisRequest, options: { allowDiscoveredModel?: boolean } = {}): Record<string, unknown> {
    if (!input.model?.trim() || !input.input?.trim() || (!input.voice?.trim() && !input.inputReferences?.length)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Speech model, text, and either a stock voice or reference sample are required.', provider: 'openrouter', capability: 'TEXT_TO_SPEECH', retryable: false });
    if (input.responseFormat !== undefined && !['mp3', 'pcm'].includes(input.responseFormat)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'The documented speech endpoint supports MP3 or PCM output.', provider: 'openrouter', retryable: false });
    assertCapabilityRequest({ capability: 'TEXT_TO_SPEECH', model: input.model, parameters: [
        ...(input.responseFormat ? ['response_format' as const] : []),
        ...(input.speed === undefined ? [] : ['speed' as const]),
        ...(input.instructions ? ['instructions' as const] : []),
        ...(input.inputReferences ? ['input_references' as const] : []),
        ...(input.providerOptions ? ['provider_options' as const] : []),
    ], allowDiscoveredModel: options.allowDiscoveredModel });
    if (input.voice && input.inputReferences?.length) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Choose a stock voice or reference cloning, not both.', provider: 'openrouter', retryable: false });
    if (input.inputReferences && (input.inputReferences.length > 3 || input.inputReferences.some((reference) => !('url' in reference ? reference.url?.trim() : reference.data?.trim())))) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'One to three non-empty reference samples are required.', provider: 'openrouter', retryable: false });
    const references = input.inputReferences?.map(reference => {
        const raw = reference as { url?: unknown; data?: unknown; format?: unknown };
        if ((raw.url !== undefined) === (raw.data !== undefined)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'A reference recording needs exactly one URL or base64 body.', provider: 'openrouter', retryable: false });
        if (raw.url !== undefined) {
            let url: URL;
            try { url = new URL(String(raw.url)); } catch { throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'A reference recording needs a valid HTTP URL.', provider: 'openrouter', retryable: false }); }
            if (typeof raw.url !== 'string' || raw.url.length > 2048 || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'A reference recording needs a public HTTP URL without credentials.', provider: 'openrouter', retryable: false });
        } else if (typeof raw.data !== 'string' || !raw.data.trim() || raw.data.length > 20 * 1024 * 1024) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Reference audio exceeds the documented base64 limit.', provider: 'openrouter', retryable: false });
        if (raw.format !== undefined && (typeof raw.format !== 'string' || !raw.format.trim())) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Reference audio format must be a non-empty string.', provider: 'openrouter', retryable: false });
        return { type: 'input_audio', input_audio: { ...(raw.url === undefined ? { data: raw.data } : { url: raw.url }), ...(raw.format === undefined ? {} : { format: raw.format }) } };
    });
    if (input.model === 'bytedance-seed/seed-audio-1-0') {
        const count = references?.length ?? 0;
        const placeholders = [...input.input.matchAll(/@Audio(\d+)/g)].map(match => Number(match[1]));
        if (placeholders.some(index => index < 1 || index > count) || (count > 1 && Array.from({ length: count }, (_, index) => index + 1).some(index => !placeholders.includes(index)))) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Seed Audio requires each supplied recording to be addressed with its matching @Audio number.', provider: 'openrouter', retryable: false });
    }
    return { model: input.model, input: input.input, ...(input.voice ? { voice: input.voice } : {}), ...(references ? { input_references: references } : {}), ...(input.responseFormat ? { response_format: input.responseFormat } : {}), ...(input.speed === undefined ? {} : { speed: input.speed }), ...(input.instructions ? { instructions: input.instructions } : {}), ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}) };
}

export async function synthesizeSpeech(input: SpeechSynthesisRequest, options: OpenRouterTransportOptions = {}) {
    if (!options.mock && !options.beforeMediaSubmit) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Paid media requires a reserved durable job.', provider: 'openrouter', retryable: false });
    const config = getModelForCapability('TEXT_TO_SPEECH');
    const candidates = input.inputReferences?.length ? [input.model || config.id] : Array.from(new Set([input.model || config.id, ...(input.model ? (options.fallbackModels || []) : options.fallbackModels || getFallbackModelsForCapability('TEXT_TO_SPEECH'))])).filter(Boolean);
    let lastError: AICapabilityError | undefined;
    for (const candidate of candidates) {
        try {
            // References require live endpoint capabilities even when a caller
            // selects a centrally registered speech model rather than discovery.
            const resolved = await resolveCatalogModel('TEXT_TO_SPEECH', candidate, 'audio', input.inputReferences?.length ? { ...options, allowDiscoveredModel: true } : options, input.inputReferences?.length ? ['input_references', ...(input.inputReferences.length > 1 ? ['multiple_audio_references'] : [])] : ['voice']);
            const model = resolved.id;
            if (input.voice && resolved.discovered && !options.mock && !resolved.supportedVoices?.includes(input.voice)) throw new AICapabilityError({ code: 'UNSUPPORTED_CAPABILITY', message: 'The selected stock voice is no longer available for this model.', provider: 'openrouter', model, retryable: false });
            const request = { ...input, model };
            const speechRequestBody = buildSpeechSynthesisRequest(request, { allowDiscoveredModel: resolved.discovered });
            requireKey(options, 'TEXT_TO_SPEECH', model);
            await options.beforeMediaSubmit?.();
            const result = await requestBinary('/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json', Accept: 'audio/*' }, body: JSON.stringify(speechRequestBody) }, { ...options, maxRetries: 0, retry: { ...options.retry, maxRetries: 0 } }, 'TEXT_TO_SPEECH', model);
            const audio = await boundedBinaryBody(result.response, options.maxResponseBytes ?? 15 * 1024 * 1024);
            return { audio, body: audio, contentType: result.response.headers.get('content-type') || 'audio/mpeg', modelUsed: model, requestId: result.requestId, generationId: result.generationId, usage: result.usage, costUsd: result.costUsd };
        } catch (cause) {
            const error = cause instanceof AICapabilityError ? cause : new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter speech synthesis failed.', provider: 'openrouter', capability: 'TEXT_TO_SPEECH', model: candidate, retryable: false });
            lastError = error;
            if (options.beforeMediaSubmit || ![400, 404, 422].includes(error.status || 0) || !isFallbackEligible(error) || candidate === candidates[candidates.length - 1]) throw error;
        }
    }
    throw lastError || new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter speech synthesis failed.', provider: 'openrouter', capability: 'TEXT_TO_SPEECH', retryable: false });
}

export function buildTranscriptionRequest(input: TranscriptionRequest, options: { allowDiscoveredModel?: boolean } = {}): Record<string, unknown> {
    if (!input.model?.trim() || !input.audio?.data || !input.audio.format) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Transcription model and base64 audio are required.', provider: 'openrouter', capability: 'TRANSCRIPTION', retryable: false });
    assertCapabilityRequest({ capability: 'TRANSCRIPTION', model: input.model, inputModality: 'audio', parameters: [
        ...(input.language ? ['language' as const] : []),
        ...(input.temperature === undefined ? [] : ['temperature' as const]),
        ...(input.providerOptions ? ['provider_options' as const] : []),
    ], allowDiscoveredModel: options.allowDiscoveredModel });
    return { model: input.model, input_audio: input.audio, ...(input.language ? { language: input.language } : {}), ...(input.temperature === undefined ? {} : { temperature: input.temperature }), ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}) };
}

export async function transcribeAudio(input: TranscriptionRequest, options: OpenRouterTransportOptions = {}) {
    if (!options.mock && !options.beforeMediaSubmit) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Paid media requires a reserved durable job.', provider: 'openrouter', retryable: false });
    const config = getModelForCapability('TRANSCRIPTION');
    const candidates = Array.from(new Set([input.model || config.id, ...(input.model ? (options.fallbackModels || []) : options.fallbackModels || getFallbackModelsForCapability('TRANSCRIPTION'))])).filter(Boolean);
    let lastError: AICapabilityError | undefined;
    for (const candidate of candidates) {
        try {
            const resolved = await resolveCatalogModel('TRANSCRIPTION', candidate, 'transcription', options);
            const model = resolved.id;
            const request = { ...input, model };
            const transcriptionRequestBody = buildTranscriptionRequest(request, { allowDiscoveredModel: resolved.discovered });
            requireKey(options, 'TRANSCRIPTION', model);
            await options.beforeMediaSubmit?.();
            const response = await requestJson<{ text: string; segments?: unknown[]; words?: unknown[]; usage?: unknown }>('/audio/transcriptions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(transcriptionRequestBody) }, { ...options, maxRetries: 0, retry: { ...options.retry, maxRetries: 0 } }, 'TRANSCRIPTION', model);
            if (typeof response.body.text !== 'string') throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: 'OpenRouter returned no transcription text.', provider: 'openrouter', capability: 'TRANSCRIPTION', model, retryable: false, details: normalizedProviderDetails(response.body) });
            return { text: response.body.text, segments: response.body.segments || [], words: response.body.words || [], modelUsed: model, ...extractUsageAndCost(response.body), requestId: response.requestId, raw: response.body };
        } catch (cause) {
            const error = cause instanceof AICapabilityError ? cause : new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter transcription failed.', provider: 'openrouter', capability: 'TRANSCRIPTION', model: candidate, retryable: false });
            lastError = error;
            if (options.beforeMediaSubmit || ![400, 404, 422].includes(error.status || 0) || !isFallbackEligible(error) || candidate === candidates[candidates.length - 1]) throw error;
        }
    }
    throw lastError || new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter transcription failed.', provider: 'openrouter', capability: 'TRANSCRIPTION', retryable: false });
}

export const requestImageGeneration = generateImage;
export const requestVideoGeneration = generateVideo;
export const requestSpeechSynthesis = synthesizeSpeech;
export const requestTranscription = transcribeAudio;

/** One fenced synchronous stream. An ambiguous failure is never retried here. */
/** One fenced synchronous stream. An ambiguous failure is never retried here. */
export async function generateMusic(input: {
    model: string;
    prompt: string;
}, options: OpenRouterTransportOptions & {
    onMusicAccepted?: (id: string) => Promise<void>;
} = {}) {
    const { MUSIC_LIMITS, parseMusicStream } = await import('../ai/music');
    const contract = REVIEWED_OPERATION_CONTRACTS.music;
    if (options.mock || options.signal?.aborted || input.model !== contract.modelId || !input.prompt.trim() || input.prompt.length > MUSIC_LIMITS.maxPromptCharacters || !options.beforeMediaSubmit || options.baseUrl && options.baseUrl !== BASE_URL)
        throw new Error('MUSIC_REQUEST_INVALID');
    assertCapabilityRequest({ capability: 'MUSIC_GENERATION', model: input.model, inputModality: 'text' });
    requireKey(options, 'MUSIC_GENERATION', input.model);
    await options.beforeMediaSubmit();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(options.timeoutMs ?? MUSIC_LIMITS.timeoutMs, MUSIC_LIMITS.timeoutMs));
    const abort = () => controller.abort();
    if (options.signal?.aborted)
        controller.abort();
    else
        options.signal?.addEventListener('abort', abort, { once: true });
    try {
        const response = await (options.fetch ?? fetch)(BASE_URL + '/chat/completions', { method: 'POST', headers: requestHeaders(options, { headers: { 'content-type': 'application/json', accept: 'text/event-stream' } }, 'POST', options.idempotencyKey), body: JSON.stringify({ model: input.model, messages: [{ role: 'user', content: input.prompt.trim() }], modalities: ['text', 'audio'], audio: { format: 'mp3' }, stream: true, provider: { only: [contract.providerTag], allow_fallbacks: false } }), redirect: 'error', signal: controller.signal });
        if (!response.ok) {
            await response.body?.cancel();
            throw Object.assign(new Error('MUSIC_HANDOFF_REJECTED'), { status: response.status });
        }
        return await parseMusicStream(response, options.onMusicAccepted);
    }
    finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abort);
    }
}
