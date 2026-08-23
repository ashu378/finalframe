import type OpenAI from 'openai';
import { assertCapabilityRequest } from '@/lib/ai/capabilities';
import { getFallbackModelsForCapability, getModelForCapability, isCatalogSelectionModel, type AICapability } from '@/lib/ai/model-registry';
import { selectOpenRouterModel } from '@/lib/ai/model-discovery';
import {
    AICapabilityError,
    type CapabilityId,
    type ImageGenerationRequest,
    type NormalizedUsage,
    type SpeechSynthesisRequest,
    type TranscriptionRequest,
    type VideoGenerationRequest,
} from '@/lib/ai/types';
import type { CameraConfig, MotionConfig } from '@/lib/types/database';

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
    signal?: AbortSignal;
    idempotencyKey?: string;
    retry?: OpenRouterRetryOptions;
    /** Compatibility aliases for callers that prefer flat retry settings. */
    maxRetries?: number;
    retryBaseDelayMs?: number;
    retryMaxDelayMs?: number;
    fallbackModels?: string[];
}

export interface StructuredOutputInput {
    name: string;
    schema: Record<string, unknown>;
    /** Strict output is mandatory for this gateway. False is rejected. */
    strict?: boolean;
    description?: string;
}

export interface OpenRouterChatOptions extends OpenRouterTransportOptions {
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
    if (!apiKey(options)) {
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

function getFetch(options?: OpenRouterTransportOptions): typeof globalThis.fetch {
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
    return error.code === 'UNSUPPORTED_MODEL' || error.retryable;
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

function createIdempotencyKey(): string {
    const randomUuid = globalThis.crypto?.randomUUID;
    if (randomUuid) return randomUuid.call(globalThis.crypto);
    return `ff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function requestHeaders(options: OpenRouterTransportOptions, init: RequestInit, method: string, idempotencyKey?: string): Headers {
    const headers = new Headers(init.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (!headers.has('HTTP-Referer')) headers.set('HTTP-Referer', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
    if (!headers.has('X-Title')) headers.set('X-Title', 'FinalFrame');
    if (apiKey(options) && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${apiKey(options)}`);
    if (method !== 'GET' && method !== 'HEAD') {
        const key = idempotencyKey || options.idempotencyKey || createIdempotencyKey();
        headers.set('X-Idempotency-Key', key);
    }
    return headers;
}

function responseMessage(body: unknown, fallback: string): string {
    const record = asRecord(body);
    const error = asRecord(record.error);
    return asString(record.message) || asString(record.error) || asString(error.message) || fallback;
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
    const idempotencyKey = method === 'GET' || method === 'HEAD' ? undefined : options.idempotencyKey || createIdempotencyKey();

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
                details: body,
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
        ...(definition ? { provider: { require_parameters: true } } : {}),
    };
}

function parseStructuredContent(content: string | null, definition?: StructuredOutputInput): string | null {
    if (!definition || content === null) return content;
    try {
        const parsed = JSON.parse(content) as unknown;
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object.');
        return JSON.stringify(parsed);
    } catch (cause) {
        throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: 'OpenRouter returned content that is not valid strict JSON.', provider: 'openrouter', retryable: false, details: { content }, cause });
    }
}

async function executeChatWithModel(capability: AICapability, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], options: OpenRouterChatOptions, model: string): Promise<AIResponse> {
    const request = buildChatCompletionRequest(capability, messages, { ...options, model });
    const response = await requestJson<Record<string, unknown>>('/chat/completions', { method: 'POST', body: JSON.stringify(request) }, options, capability, model);
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
            if (!isFallbackEligible(error) || model === candidates[candidates.length - 1]) throw error;
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
        ...(input.inputReferences ? { input_references: input.inputReferences } : {}),
        ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}),
    };
}

export function buildImageGenerationRequest(input: ImageGenerationRequest): Record<string, unknown> {
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
    ] });
    return imageBody(input, validation.model);
}

async function resolveMediaModel(capability: CapabilityId, model: string | undefined, outputModality: 'image' | 'video', options: OpenRouterTransportOptions): Promise<string> {
    const configured = model || getModelForCapability(capability).id;
    if (!isCatalogSelectionModel(capability, configured)) return configured;
    return (await selectOpenRouterModel({ capability, outputModality, options: { ...options, apiKey: apiKey(options) } })).id;
}

export async function generateImage(input: ImageGenerationRequest, options: OpenRouterTransportOptions = {}) {
    if (!input.prompt?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Image prompt is required.', provider: 'openrouter', capability: 'IMAGE_GENERATION', retryable: false });
    const config = getModelForCapability('IMAGE_GENERATION');
    const candidates = Array.from(new Set([input.model || config.id, ...(input.model ? (options.fallbackModels || []) : options.fallbackModels || getFallbackModelsForCapability('IMAGE_GENERATION'))]));
    let lastError: AICapabilityError | undefined;
    for (const candidate of candidates) {
        try {
            const model = await resolveMediaModel('IMAGE_GENERATION', candidate, 'image', options);
            const response = await requestJson<{ data?: Array<{ b64_json?: string; media_type?: string; url?: string }>; usage?: unknown; model?: string }>('/images', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildImageGenerationRequest({ ...input, model })) }, options, 'IMAGE_GENERATION', model);
            const images = (response.body.data || []).map((image) => ({ b64Json: image.b64_json, mediaType: image.media_type, url: image.url }));
            if (!images.some((image) => image.b64Json || image.url)) throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: 'OpenRouter returned no image output.', provider: 'openrouter', capability: 'IMAGE_GENERATION', model, retryable: false, details: response.body });
            const first = images[0];
            return { images, b64_json: first?.b64Json, url: first?.url, modelUsed: response.body.model || model, ...extractUsageAndCost(response.body), requestId: response.requestId, raw: response.body };
        } catch (cause) {
            const error = cause instanceof AICapabilityError ? cause : new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter image generation failed.', provider: 'openrouter', capability: 'IMAGE_GENERATION', model: candidate, retryable: false, cause });
            lastError = error;
            if (!isFallbackEligible(error) || candidate === candidates[candidates.length - 1]) throw error;
        }
    }
    throw lastError || new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter image generation failed.', provider: 'openrouter', capability: 'IMAGE_GENERATION', retryable: false });
}

export function buildVideoGenerationRequest(input: VideoGenerationRequest): Record<string, unknown> {
    if (!input.model?.trim() || !input.prompt?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video model and prompt are required.', provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false });
    assertCapabilityRequest({ capability: 'VIDEO_GENERATION', model: input.model, parameters: [
        ...(input.aspectRatio ? ['aspect_ratio' as const] : []),
        ...(input.duration === undefined ? [] : ['duration' as const]),
        ...(input.resolution ? ['resolution' as const] : []),
        ...(input.inputReferences || input.frameImages ? ['input_references' as const] : []),
        ...(input.providerOptions ? ['provider_options' as const] : []),
    ] });
    return {
        model: input.model,
        prompt: input.prompt,
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        ...(input.duration === undefined ? {} : { duration: input.duration }),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.frameImages ? { frame_images: input.frameImages } : {}),
        ...(input.inputReferences ? { input_references: input.inputReferences } : {}),
        ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}),
    };
}

export async function generateVideo(input: VideoGenerationRequest, options: OpenRouterTransportOptions = {}) {
    if (!input.prompt?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video prompt is required.', provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false });
    const config = getModelForCapability('VIDEO_GENERATION');
    const candidates = Array.from(new Set([input.model || config.id, ...(input.model ? (options.fallbackModels || []) : options.fallbackModels || getFallbackModelsForCapability('VIDEO_GENERATION'))]));
    let lastError: AICapabilityError | undefined;
    for (const candidate of candidates) {
        try {
            const model = await resolveMediaModel('VIDEO_GENERATION', candidate, 'video', options);
            const request = { ...input, model };
            const response = await requestJson<{ id: string; polling_url?: string; status: string; generation_id?: string; usage?: unknown; model?: string }>('/videos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildVideoGenerationRequest(request)) }, options, 'VIDEO_GENERATION', model);
            if (!response.body.id) throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: 'OpenRouter returned no video task ID.', provider: 'openrouter', capability: 'VIDEO_GENERATION', model, retryable: false, details: response.body });
            return { id: response.body.id, pollingUrl: response.body.polling_url, polling_url: response.body.polling_url, status: response.body.status, generationId: response.body.generation_id, generation_id: response.body.generation_id, modelUsed: response.body.model || model, ...extractUsageAndCost(response.body), requestId: response.requestId, raw: response.body };
        } catch (cause) {
            const error = cause instanceof AICapabilityError ? cause : new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter video generation failed.', provider: 'openrouter', capability: 'VIDEO_GENERATION', model: candidate, retryable: false, cause });
            lastError = error;
            if (!isFallbackEligible(error) || candidate === candidates[candidates.length - 1]) throw error;
        }
    }
    throw lastError || new AICapabilityError({ code: 'PROVIDER_ERROR', message: 'OpenRouter video generation failed.', provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false });
}

export const submitVideo = generateVideo;

export async function pollVideo(jobId: string, options: OpenRouterTransportOptions = {}) {
    if (!jobId?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video job ID is required.', provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false });
    const response = await requestJson<{ id: string; status: string; error?: string; unsigned_urls?: string[]; usage?: unknown }>(`/videos/${encodeURIComponent(jobId)}`, { method: 'GET' }, options, 'VIDEO_GENERATION');
    return { ...response.body, requestId: response.requestId, ...extractUsageAndCost(response.body) };
}

async function requestBinary(path: string, init: RequestInit, options: OpenRouterTransportOptions, capability: string, model?: string): Promise<{ response: Response; requestId?: string }> {
    requireKey(options, capability, model);
    const fetcher = getFetch(options);
    const retry = retryOptions(options);
    const method = (init.method || 'GET').toUpperCase();
    const idempotencyKey = method === 'GET' || method === 'HEAD' ? undefined : options.idempotencyKey || createIdempotencyKey();
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
            if (response.ok) return { response, requestId: response.headers.get('x-request-id') || undefined };
            const classification = classifyOpenRouterError(response.status);
            const error = new AICapabilityError({ code: classification.code, message: `OpenRouter ${capability} request failed (${response.status}).`, provider: 'openrouter', capability, model, status: response.status, requestId: response.headers.get('x-request-id') || undefined, retryable: classification.retryable });
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

export async function downloadVideo(jobId: string, options: OpenRouterTransportOptions = {}) {
    if (!jobId?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video job ID is required.', provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false });
    const result = await requestBinary(`/videos/${encodeURIComponent(jobId)}/content`, { method: 'GET' }, options, 'VIDEO_GENERATION');
    return { body: await result.response.arrayBuffer(), contentType: result.response.headers.get('content-type') || 'video/mp4', requestId: result.requestId };
}

export function buildSpeechSynthesisRequest(input: SpeechSynthesisRequest): Record<string, unknown> {
    if (!input.model?.trim() || !input.input?.trim() || !input.voice?.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Speech model, input and voice are required.', provider: 'openrouter', capability: 'TEXT_TO_SPEECH', retryable: false });
    assertCapabilityRequest({ capability: 'TEXT_TO_SPEECH', model: input.model, parameters: [
        ...(input.responseFormat ? ['response_format' as const] : []),
        ...(input.speed === undefined ? [] : ['speed' as const]),
        ...(input.instructions ? ['instructions' as const] : []),
        ...(input.providerOptions ? ['provider_options' as const] : []),
    ] });
    return { model: input.model, input: input.input, voice: input.voice, ...(input.responseFormat ? { response_format: input.responseFormat } : {}), ...(input.speed === undefined ? {} : { speed: input.speed }), ...(input.instructions ? { instructions: input.instructions } : {}), ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}) };
}

export async function synthesizeSpeech(input: SpeechSynthesisRequest, options: OpenRouterTransportOptions = {}) {
    const result = await requestBinary('/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json', Accept: 'audio/*' }, body: JSON.stringify(buildSpeechSynthesisRequest(input)) }, options, 'TEXT_TO_SPEECH', input.model);
    const audio = await result.response.arrayBuffer();
    return { audio, body: audio, contentType: result.response.headers.get('content-type') || 'audio/mpeg', modelUsed: input.model, requestId: result.requestId };
}

export function buildTranscriptionRequest(input: TranscriptionRequest): Record<string, unknown> {
    if (!input.model?.trim() || !input.audio?.data || !input.audio.format) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Transcription model and base64 audio are required.', provider: 'openrouter', capability: 'TRANSCRIPTION', retryable: false });
    assertCapabilityRequest({ capability: 'TRANSCRIPTION', model: input.model, inputModality: 'audio', parameters: [
        ...(input.language ? ['language' as const] : []),
        ...(input.temperature === undefined ? [] : ['temperature' as const]),
        ...(input.providerOptions ? ['provider_options' as const] : []),
    ] });
    return { model: input.model, input_audio: input.audio, ...(input.language ? { language: input.language } : {}), ...(input.temperature === undefined ? {} : { temperature: input.temperature }), ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}) };
}

export async function transcribeAudio(input: TranscriptionRequest, options: OpenRouterTransportOptions = {}) {
    const response = await requestJson<{ text: string; usage?: unknown }>('/audio/transcriptions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildTranscriptionRequest(input)) }, options, 'TRANSCRIPTION', input.model);
    if (typeof response.body.text !== 'string') throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: 'OpenRouter returned no transcription text.', provider: 'openrouter', capability: 'TRANSCRIPTION', model: input.model, retryable: false, details: response.body });
    return { text: response.body.text, modelUsed: input.model, ...extractUsageAndCost(response.body), requestId: response.requestId, raw: response.body };
}

export const requestImageGeneration = generateImage;
export const requestVideoGeneration = generateVideo;
export const requestSpeechSynthesis = synthesizeSpeech;
export const requestTranscription = transcribeAudio;
