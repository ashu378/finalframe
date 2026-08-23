import type OpenAI from 'openai';
import { getModelForCapability, type AICapability } from '@/lib/ai/model-registry';
import { selectOpenRouterModel } from '@/lib/ai/model-discovery';
import { AICapabilityError, type ImageGenerationRequest, type SpeechSynthesisRequest, type TranscriptionRequest, type VideoGenerationRequest, type NormalizedUsage } from '@/lib/ai/types';
import type { CameraConfig, MotionConfig } from '@/lib/types/database';

const BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterTransportOptions { apiKey?: string | null; baseUrl?: string; fetch?: typeof globalThis.fetch; timeoutMs?: number; signal?: AbortSignal; }
export interface StructuredOutputInput { name: string; schema: Record<string, unknown>; strict?: boolean; description?: string; }
export interface OpenRouterChatOptions extends OpenRouterTransportOptions { temperature?: number; topP?: number; maxTokens?: number; jsonMode?: boolean; structuredOutput?: StructuredOutputInput; responseFormat?: StructuredOutputInput; /** Compatibility alias retained from the earlier adapter. */ schema?: StructuredOutputInput; model?: string; cameraConfig?: CameraConfig; motionConfig?: MotionConfig; }
function apiKey(options?: OpenRouterTransportOptions) { return options?.apiKey === null ? undefined : options?.apiKey || process.env.OPENROUTER_API_KEY || undefined; }
function requireKey(options?: OpenRouterTransportOptions) { if (!apiKey(options)) throw new AICapabilityError({ code: 'MISSING_API_KEY', message: 'OPENROUTER_API_KEY is required to execute an OpenRouter request.', provider: 'openrouter', retryable: false }); }
function getFetch(options?: OpenRouterTransportOptions): typeof globalThis.fetch { const result = options?.fetch || globalThis.fetch; if (!result) throw new AICapabilityError({ code: 'NETWORK_ERROR', message: 'No fetch implementation is available for OpenRouter.', provider: 'openrouter', retryable: false }); return result; }

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function errorCode(status: number) { return status === 400 ? 'INVALID_REQUEST' : status === 401 || status === 403 ? 'PROVIDER_AUTHENTICATION' : status === 402 ? 'PROVIDER_PAYMENT_REQUIRED' : status === 404 ? 'UNSUPPORTED_MODEL' : status === 408 ? 'REQUEST_TIMEOUT' : status === 429 ? 'PROVIDER_RATE_LIMIT' : status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR'; }

export function extractUsageAndCost(value: unknown): { usage?: NormalizedUsage; costUsd?: number } {
    const raw = asRecord(value);
    if (!Object.keys(raw).length && !Object.keys(asRecord(asRecord(value).usage)).length) return {};
    const usage = asRecord(asRecord(value).usage);
    const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? raw.prompt_tokens ?? raw.input_tokens ?? 0);
    const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? raw.completion_tokens ?? raw.output_tokens ?? 0);
    const totalTokens = Number(usage.total_tokens ?? raw.total_tokens ?? promptTokens + completionTokens);
    const cost = Number(usage.cost ?? usage.cost_usd ?? raw.cost ?? raw.cost_usd);
    const result: NormalizedUsage = { promptTokens, completionTokens, totalTokens, inputTokens: promptTokens, outputTokens: completionTokens, ...(Number.isFinite(Number(usage.seconds)) ? { seconds: Number(usage.seconds) } : {}), ...(Number.isFinite(cost) ? { costUsd: cost, cost } : {}), raw: value, prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens };
    return { usage: result, ...(Number.isFinite(cost) ? { costUsd: cost } : {}) };
}

async function requestJson<T>(path: string, init: RequestInit, optionsOrCapability: OpenRouterTransportOptions | string = {}, capabilityOrModel?: string, legacyModel?: string): Promise<T> {
    const options = typeof optionsOrCapability === 'string' ? {} : optionsOrCapability;
    const capability = typeof optionsOrCapability === 'string' ? optionsOrCapability : capabilityOrModel;
    const model = typeof optionsOrCapability === 'string' ? capabilityOrModel : legacyModel;
    requireKey(options);
    let response: Response;
    const controller = new AbortController();
    const timer = options.timeoutMs && options.timeoutMs > 0 ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
    try {
        response = await getFetch(options)(`${(options.baseUrl || BASE_URL).replace(/\/$/, '')}${path}`, {
            ...init,
            signal: options.signal || controller.signal,
            headers: {
                ...(apiKey(options) ? { Authorization: `Bearer ${apiKey(options)}` } : {}),
                Accept: 'application/json',
                'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
                'X-Title': 'FinalFrame',
                ...(init.headers || {}),
            },
        });
    } catch (cause) {
        if (cause instanceof AICapabilityError) throw cause;
        throw new AICapabilityError({ code: 'NETWORK_ERROR', message: 'OpenRouter could not be reached.', provider: 'openrouter', capability, model, retryable: true, cause });
    } finally { if (timer) clearTimeout(timer); }
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
        const status = response.status;
        throw new AICapabilityError({ code: errorCode(status), message: typeof asRecord(body).error === 'string' ? String(asRecord(body).error) : `OpenRouter request failed (${status}).`, provider: 'openrouter', capability, model, status, retryable: status === 408 || status === 429 || status >= 500, details: body });
    }
    return body as T;
}

export interface AIResponse { content: string | null; modelUsed: string; usage?: NormalizedUsage; normalizedUsage?: NormalizedUsage; costUsd?: number; requestId?: string; raw?: unknown; }

export function buildStructuredResponseFormat(definition: StructuredOutputInput): Record<string, unknown> {
    if (definition.strict === false || !/^[A-Za-z0-9_-]{1,64}$/.test(definition.name) || !definition.schema || typeof definition.schema !== 'object' || Array.isArray(definition.schema)) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Strict structured output requires a valid schema name, JSON Schema object and strict=true.', provider: 'openrouter', retryable: false });
    return { type: 'json_schema', json_schema: { name: definition.name, ...(definition.description ? { description: definition.description } : {}), strict: true, schema: definition.schema } };
}

export function buildChatCompletionRequest(capability: AICapability, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], options: OpenRouterChatOptions = {}): Record<string, unknown> {
    const model = options.model || getModelForCapability(capability).id;
    const definition = options.structuredOutput || options.responseFormat || options.schema;
    const responseFormat = definition ? buildStructuredResponseFormat(definition) : options.jsonMode ? { type: 'json_object' } : undefined;
    return { model, messages: appendConfigs(messages, options.cameraConfig, options.motionConfig), ...(options.temperature === undefined ? {} : { temperature: options.temperature }), ...(options.topP === undefined ? {} : { top_p: options.topP }), ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }), ...(responseFormat ? { response_format: responseFormat } : {}), ...(definition ? { provider: { require_parameters: true } } : {}) };
}

export async function executeAITask(capability: AICapability, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], options: OpenRouterChatOptions = {}): Promise<AIResponse> {
    const config = getModelForCapability(capability);
    const request = buildChatCompletionRequest(capability, messages, options);
    try {
        const response = await requestJson<Record<string, unknown>>('/chat/completions', { method: 'POST', body: JSON.stringify(request) }, options, capability, String(request.model));
        const choice = Array.isArray(response.choices) ? asRecord(response.choices[0]) : {};
        const message = asRecord(choice.message);
        const content = typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.map((part) => typeof asRecord(part).text === 'string' ? asRecord(part).text : '').join('') || null : null;
        const extracted = extractUsageAndCost(response);
        return { content, modelUsed: typeof response.model === 'string' ? response.model : String(request.model), ...extracted, normalizedUsage: extracted.usage, raw: response };
    } catch (cause) {
        if (cause instanceof AICapabilityError) throw cause;
        throw new AICapabilityError({ code: 'PROVIDER_ERROR', message: `OpenRouter ${capability} request failed.`, provider: 'openrouter', capability, model: config.id, retryable: true, cause });
    }
}

function imageBody(input: ImageGenerationRequest, model: string): Record<string, unknown> { return { model, prompt: input.prompt, ...(input.n === undefined ? {} : { n: input.n }), ...(input.resolution ? { resolution: input.resolution } : {}), ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}), ...(input.size ? { size: input.size } : {}), ...(input.quality ? { quality: input.quality } : {}), ...(input.outputFormat ? { output_format: input.outputFormat } : {}), ...(input.background ? { background: input.background } : {}), ...(input.outputCompression === undefined ? {} : { output_compression: input.outputCompression }), ...(input.seed === undefined ? {} : { seed: input.seed }), ...(input.inputReferences ? { input_references: input.inputReferences } : {}), ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}) }; }
export function buildImageGenerationRequest(input: ImageGenerationRequest): Record<string, unknown> { if (!input.prompt.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Image prompt is required.', provider: 'openrouter', capability: 'IMAGE_GENERATION', retryable: false }); return imageBody(input, input.model || ''); }
export async function generateImage(input: ImageGenerationRequest, options: OpenRouterTransportOptions = {}) {
    const model = input.model || (await selectOpenRouterModel({ outputModality: 'image', options: { ...options, apiKey: apiKey(options) } })).id;
    const response = await requestJson<{ data?: Array<{ b64_json?: string; media_type?: string; url?: string }>; usage?: unknown; model?: string }>('/images', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(imageBody(input, model)) }, options, 'IMAGE_GENERATION', model);
    const images = (response.data || []).map((image) => ({ b64Json: image.b64_json, mediaType: image.media_type, url: image.url }));
    if (!images.some((image) => image.b64Json || image.url)) throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message: 'OpenRouter returned no image output.', provider: 'openrouter', capability: 'IMAGE_GENERATION', model, retryable: false, details: response });
    const first = images[0];
    return { images, b64_json: first?.b64Json, url: first?.url, modelUsed: response.model || model, ...extractUsageAndCost(response), raw: response };
}

export function buildVideoGenerationRequest(input: VideoGenerationRequest): Record<string, unknown> { if (!input.model || !input.prompt.trim()) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Video model and prompt are required.', provider: 'openrouter', capability: 'VIDEO_GENERATION', retryable: false }); return { model: input.model, prompt: input.prompt, ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}), ...(input.duration === undefined ? {} : { duration: input.duration }), ...(input.resolution ? { resolution: input.resolution } : {}), ...(input.frameImages ? { frame_images: input.frameImages } : {}), ...(input.inputReferences ? { input_references: input.inputReferences } : {}), ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}) }; }
export async function generateVideo(input: VideoGenerationRequest, options: OpenRouterTransportOptions = {}) {
    const selectedModel = !input.model || input.model === 'auto' || input.model === 'openrouter/auto'
        ? (await selectOpenRouterModel({ outputModality: 'video', options: { ...options, apiKey: apiKey(options) } })).id
        : input.model;
    const request = { ...input, model: selectedModel };
    const response = await requestJson<{ id: string; polling_url?: string; status: string; generation_id?: string; usage?: unknown; model?: string }>('/videos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildVideoGenerationRequest(request)) }, options, 'VIDEO_GENERATION', selectedModel);
    return { id: response.id, pollingUrl: response.polling_url, polling_url: response.polling_url, status: response.status, generationId: response.generation_id, generation_id: response.generation_id, modelUsed: response.model || selectedModel, ...extractUsageAndCost(response), raw: response };
}
export const submitVideo = generateVideo;

export async function pollVideo(jobId: string, options: OpenRouterTransportOptions = {}) { return requestJson<{ id: string; status: string; error?: string; unsigned_urls?: string[]; usage?: NormalizedUsage }>(`/videos/${encodeURIComponent(jobId)}`, { method: 'GET' }, options, 'VIDEO_GENERATION'); }

export async function downloadVideo(jobId: string, options: OpenRouterTransportOptions = {}) {
    const response = await requestJsonResponse(`/videos/${encodeURIComponent(jobId)}/content`, { method: 'GET' }, options, 'VIDEO_GENERATION');
    if (!response.ok) throw new AICapabilityError({ code: response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR', message: `OpenRouter video download failed (${response.status}).`, provider: 'openrouter', capability: 'VIDEO_GENERATION', status: response.status, retryable: response.status >= 500 || response.status === 429 });
    return { body: await response.arrayBuffer(), contentType: response.headers.get('content-type') || 'video/mp4' };
}

async function requestJsonResponse(path: string, init: RequestInit, options: OpenRouterTransportOptions, capability: string) { requireKey(options); try { const response = await getFetch(options)(`${(options.baseUrl || BASE_URL).replace(/\/$/, '')}${path}`, { ...init, headers: { ...(apiKey(options) ? { Authorization: `Bearer ${apiKey(options)}` } : {}), Accept: 'application/json', 'HTTP-Referer': 'https://finalframe.ai', 'X-Title': 'FinalFrame', ...(init.headers || {}) }, signal: options.signal }); if (!response.ok) throw new AICapabilityError({ code: errorCode(response.status), message: `OpenRouter ${capability} request failed (${response.status}).`, provider: 'openrouter', capability, status: response.status, retryable: response.status === 408 || response.status === 429 || response.status >= 500 }); return response; } catch (error) { if (error instanceof AICapabilityError) throw error; throw new AICapabilityError({ code: 'NETWORK_ERROR', message: `OpenRouter ${capability} request could not be reached.`, provider: 'openrouter', capability, retryable: true, cause: error }); } }
export function buildSpeechSynthesisRequest(input: SpeechSynthesisRequest): Record<string, unknown> { if (!input.model || !input.input.trim() || !input.voice) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Speech model, input and voice are required.', provider: 'openrouter', capability: 'TEXT_TO_SPEECH', retryable: false }); return { model: input.model, input: input.input, voice: input.voice, ...(input.responseFormat ? { response_format: input.responseFormat } : {}), ...(input.speed === undefined ? {} : { speed: input.speed }), ...(input.instructions ? { instructions: input.instructions } : {}), ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}) }; }
export async function synthesizeSpeech(input: SpeechSynthesisRequest, options: OpenRouterTransportOptions = {}) {
    const response = await requestJsonResponse('/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json', Accept: 'audio/*' }, body: JSON.stringify(buildSpeechSynthesisRequest(input)) }, options, 'TEXT_TO_SPEECH');
    if (!response.ok) throw new AICapabilityError({ code: response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR', message: `OpenRouter speech generation failed (${response.status}).`, provider: 'openrouter', capability: 'TEXT_TO_SPEECH', status: response.status, retryable: response.status >= 500 || response.status === 429 });
    const audio = await response.arrayBuffer();
    return { audio, body: audio, contentType: response.headers.get('content-type') || 'audio/mpeg', modelUsed: input.model };
}

export function buildTranscriptionRequest(input: TranscriptionRequest): Record<string, unknown> { if (!input.model || !input.audio.data || !input.audio.format) throw new AICapabilityError({ code: 'INVALID_REQUEST', message: 'Transcription model and base64 audio are required.', provider: 'openrouter', capability: 'TRANSCRIPTION', retryable: false }); return { model: input.model, input_audio: input.audio, ...(input.language ? { language: input.language } : {}), ...(input.temperature === undefined ? {} : { temperature: input.temperature }), ...(input.providerOptions ? { provider: { options: input.providerOptions } } : {}) }; }
export async function transcribeAudio(input: TranscriptionRequest, options: OpenRouterTransportOptions = {}) {
    const response = await requestJson<{ text: string; usage?: unknown }>('/audio/transcriptions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildTranscriptionRequest(input)) }, options, 'TRANSCRIPTION', input.model);
    return { text: response.text, modelUsed: input.model, ...extractUsageAndCost(response), raw: response };
}

export const requestImageGeneration = generateImage;
export const requestVideoGeneration = generateVideo;
export const requestSpeechSynthesis = synthesizeSpeech;
export const requestTranscription = transcribeAudio;

function appendConfigs(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], camera?: CameraConfig, motion?: MotionConfig) {
    const notes = [camera?.angle && `CAMERA ANGLE: ${camera.angle.replace('_', ' ')}`, camera?.movement && `CAMERA MOVEMENT: ${camera.movement.replace('_', ' ')}`, camera?.lens && `LENS TYPE: ${camera.lens}`, motion?.speed && `MOTION SPEED: ${motion.speed}`, motion?.stability !== undefined && `STABILITY: ${motion.stability}`].filter(Boolean).join('\n');
    if (!notes) return messages;
    const last = messages[messages.length - 1];
    if (last?.role === 'user' && typeof last.content === 'string') return [...messages.slice(0, -1), { ...last, content: `${last.content}\n\n[DIRECTING NOTES]\n${notes}` }];
    return [...messages, { role: 'system' as const, content: `[DIRECTING NOTES]\n${notes}` }];
}
