import { REVIEWED_OPERATION_CONTRACTS } from './model-registry';
const row = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const json = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const MUSIC_LIMITS = { maxPromptCharacters: 4000, maxDecodedBytes: 3 * 1024 * 1024, maxSseBytes: 5 * 1024 * 1024, maxTextBytes: 64 * 1024, maxEvents: 4096, timeoutMs: 180000 } as const;
export interface MusicQuoteCertificate {
    version: string;
    model: string;
    canonicalSlug: string;
    providerTag: string;
    endpointName: string;
    endpointFingerprint: string;
    sku: 'song';
    quantity: 1;
    nominalDurationSeconds: 30;
    format: 'mp3';
    advertisedSongUsd: number;
    reservedProviderUsd: number;
    checkedAt: number;
}
export function certifyMusicQuote(models: unknown, endpoints: unknown, checkedAt = Date.now()): MusicQuoteCertificate {
    const contract = REVIEWED_OPERATION_CONTRACTS.music;
    const catalog = row(models);
    const list = Array.isArray(catalog.data) ? catalog.data : [];
    const model = row(list.find((entry: any) => entry.id === contract.modelId));
    const detail = row(row(endpoints).data);
    const values = Array.isArray(detail.endpoints) ? detail.endpoints : [];
    const endpoint = row(values[0]);
    const architecture = row(model.architecture);
    const pricing = row(model.pricing), cost = row(endpoint.pricing);
    if (model.id !== contract.modelId || model.canonical_slug !== contract.canonicalSlug || !String(model.description ?? '').startsWith(contract.priceEvidencePrefix) || json(architecture.input_modalities) !== json(['text', 'image']) || json(architecture.output_modalities) !== json(['text', 'audio']) || model.supported_voices !== null || detail.id !== contract.modelId || values.length !== 1 || endpoint.name !== contract.endpointName || endpoint.tag !== contract.providerTag || endpoint.provider_name !== 'Google AI Studio' || endpoint.model_id !== contract.modelId || endpoint.status !== 0 || json(Object.keys(pricing).sort()) !== json(['completion', 'prompt']) || Object.values(pricing).some(value => value !== 0 && value !== '0') || json(Object.keys(cost).sort()) !== json(['completion', 'discount', 'prompt']) || Object.values(cost).some(value => value !== 0 && value !== '0') || json([...(endpoint.supported_parameters ?? [])].sort()) !== json(['max_tokens', 'response_format', 'seed', 'temperature', 'top_p']))
        throw new Error('MUSIC_CATALOG_CHANGED');
    const facts = { model: { id: model.id, canonical_slug: model.canonical_slug, description: contract.priceEvidencePrefix, architecture: { input_modalities: architecture.input_modalities, output_modalities: architecture.output_modalities }, supported_voices: null, pricing }, endpoints: { id: detail.id, endpoints: [{ name: endpoint.name, tag: endpoint.tag, provider_name: endpoint.provider_name, model_id: endpoint.model_id, status: endpoint.status, supported_parameters: endpoint.supported_parameters, pricing: cost }] } };
    return { version: contract.version, model: contract.modelId, canonicalSlug: contract.canonicalSlug, providerTag: contract.providerTag, endpointName: contract.endpointName, endpointFingerprint: json(facts), sku: 'song', quantity: 1, nominalDurationSeconds: 30, format: 'mp3', advertisedSongUsd: contract.songUsd, reservedProviderUsd: contract.reservationUsd, checkedAt };
}
export function assertMusicQuote(value: unknown): MusicQuoteCertificate { const quote = row(value); if (typeof quote.endpointFingerprint !== 'string' || quote.endpointFingerprint.length > 16000 || typeof quote.checkedAt !== 'number' || !Number.isFinite(quote.checkedAt))
    throw new Error('MUSIC_QUOTE_INVALID'); let facts; try {
    facts = JSON.parse(quote.endpointFingerprint);
}
catch {
    throw new Error('MUSIC_QUOTE_INVALID');
} const expected = certifyMusicQuote({ data: [row(facts).model] }, { data: row(facts).endpoints }, quote.checkedAt); if (json(quote) !== json(expected))
    throw new Error('MUSIC_QUOTE_INVALID'); return expected; }
export function sameMusicQuote(a: unknown, b: unknown) { const left = assertMusicQuote(a), right = assertMusicQuote(b); return json({ ...left, checkedAt: 0 }) === json({ ...right, checkedAt: 0 }); }
export function freshMusicQuote(value: unknown, timestamp = Date.now()) { const quote = assertMusicQuote(value); if (timestamp - quote.checkedAt > 30000 || quote.checkedAt > timestamp + 1000)
    throw new Error('MUSIC_QUOTE_STALE'); return quote; }
/** No paid request here. Token-zero metadata is explicitly NOT a free SKU. */
export async function quoteMusic(fetcher: typeof fetch = fetch) { const model = REVIEWED_OPERATION_CONTRACTS.music.modelId; const results = await Promise.all([fetcher('https://openrouter.ai/api/v1/models?output_modalities=audio', { redirect: 'error', signal: AbortSignal.timeout(15000) }), fetcher('https://openrouter.ai/api/v1/models/' + model + '/endpoints', { redirect: 'error', signal: AbortSignal.timeout(15000) })]); const bodies = []; for (const response of results) {
    if (!response.ok)
        throw new Error('MUSIC_CATALOG_UNAVAILABLE');
    const reader = response.body?.getReader();
    if (!reader)
        throw new Error('MUSIC_CATALOG_UNAVAILABLE');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.length;
            if (size > 1024 * 1024)
                throw new Error('MUSIC_CATALOG_TOO_LARGE');
            chunks.push(part.value);
        }
    }
    finally {
        await reader.cancel().catch(() => undefined);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
    }
    bodies.push(JSON.parse(new TextDecoder().decode(bytes)));
} return certifyMusicQuote(bodies[0], bodies[1]); }
export interface MusicStreamResult {
    audio: Uint8Array;
    contentType: 'audio/mpeg';
    modelUsed: string;
    providerRequestId?: string;
    generatedText: string;
    costUsd?: number;
    usage?: unknown;
}
/** Strict framing and completion: an HTTP200 or a playable prefix is never
 * proof of a completed song. Only a complete stream can reach private QC. */
export async function parseMusicStream(response: Response, onAccepted?: (id: string) => Promise<void>): Promise<MusicStreamResult> {
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream') || !response.body)
        throw new Error('MUSIC_STREAM_INVALID');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let buffer = '', data: string[] = [], base64 = '', text = '', total = 0, events = 0, done = false, stopped = false, id: string | undefined, costUsd: number | undefined, usage: unknown;
    const accept = async (candidate: unknown) => { if (typeof candidate !== 'string' || !/^gen-[A-Za-z0-9._-]{1,180}$/.test(candidate))
        throw new Error('MUSIC_RECEIPT_INVALID'); if (id && id !== candidate)
        throw new Error('MUSIC_RECEIPT_CONFLICT'); if (!id) {
        id = candidate;
        await onAccepted?.(candidate);
    } };
    const header = response.headers.get('x-generation-id');
    const event = async () => {
        if (!data.length)
            return;
        const value = data.join('\n');
        data = [];
        if (++events > MUSIC_LIMITS.maxEvents)
            throw new Error('MUSIC_STREAM_TOO_LARGE');
        if (done)
            throw new Error('MUSIC_STREAM_TRAILING_DATA');
        if (value.trim() === '[DONE]') {
            done = true;
            return;
        }
        const chunk = row(JSON.parse(value));
        if (chunk.error)
            throw new Error('MUSIC_STREAM_PROVIDER_ERROR');
        if (chunk.id !== undefined)
            await accept(chunk.id);
        const contract = REVIEWED_OPERATION_CONTRACTS.music;
        if (chunk.model !== undefined && ![contract.modelId, contract.canonicalSlug].includes(chunk.model))
            throw new Error('MUSIC_MODEL_CHANGED');
        const choices = chunk.choices;
        if (!Array.isArray(choices) || choices.length > 1)
            throw new Error('MUSIC_STREAM_INVALID');
        for (const raw of choices) {
            const choice = row(raw);
            const wasStopped = stopped;
            if (choice.index !== undefined && choice.index !== 0)
                throw new Error('MUSIC_STREAM_INVALID');
            if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
                if (choice.finish_reason !== 'stop')
                    throw new Error('MUSIC_STREAM_INCOMPLETE');
                stopped = true;
            }
            const audio = row(row(choice.delta).audio);
            if (wasStopped && [audio.data, audio.transcript, row(choice.delta).content].some(value => typeof value === 'string' && value.length > 0))
                throw new Error('MUSIC_STREAM_TRAILING_DATA');
            if (audio.data !== undefined) {
                if (typeof audio.data !== 'string' || stopped && base64.length > 0 && audio.data.length > 0 && chunk.usage)
                    throw new Error('MUSIC_STREAM_INVALID');
                base64 += audio.data;
                if (base64.length > Math.ceil(MUSIC_LIMITS.maxDecodedBytes / 3) * 4 || !/^[A-Za-z0-9+/=]*$/.test(audio.data))
                    throw new Error('MUSIC_AUDIO_TOO_LARGE');
            }
            for (const item of [audio.transcript, row(choice.delta).content])
                if (item !== undefined && item !== null) {
                    if (typeof item !== 'string')
                        throw new Error('MUSIC_STREAM_INVALID');
                    text += item;
                    if (new TextEncoder().encode(text).length > MUSIC_LIMITS.maxTextBytes)
                        throw new Error('MUSIC_TEXT_TOO_LARGE');
                }
        }
        if (chunk.usage !== undefined) {
            const rawUsage = row(chunk.usage);
            usage = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens', 'cost'].filter(key => typeof rawUsage[key] === 'number' && Number.isFinite(rawUsage[key]) && rawUsage[key] >= 0).map(key => [key, rawUsage[key]]));
            const amount = rawUsage.cost;
            if (amount !== undefined) {
                if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)
                    throw new Error('MUSIC_RECEIPT_INVALID');
                if (costUsd !== undefined && costUsd !== amount)
                    throw new Error('MUSIC_RECEIPT_CONFLICT');
                costUsd = amount;
            }
        }
    };
    try {
        if (header)
            await accept(header);
        for (;;) {
            const part = await reader.read();
            if (part.done)
                break;
            total += part.value.length;
            if (total > MUSIC_LIMITS.maxSseBytes)
                throw new Error('MUSIC_STREAM_TOO_LARGE');
            buffer += decoder.decode(part.value, { stream: true });
            for (;;) {
                const match = /\r\n|\n|\r/.exec(buffer);
                if (!match)
                    break;
                if (match[0] === '\r' && match.index === buffer.length - 1)
                    break;
                const line = buffer.slice(0, match.index);
                buffer = buffer.slice(match.index + match[0].length);
                if (!line)
                    await event();
                else if (line.startsWith('data:'))
                    data.push(line.slice(5).replace(/^ /, ''));
            }
            if (buffer.length > MUSIC_LIMITS.maxSseBytes)
                throw new Error('MUSIC_STREAM_TOO_LARGE');
            if (done)
                break;
        }
        buffer += decoder.decode();
        if (buffer.trim() || data.length)
            throw new Error('MUSIC_STREAM_INCOMPLETE');
        if (!done || !stopped || !id || !base64 || base64.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))
            throw new Error('MUSIC_STREAM_INCOMPLETE');
        const binary = atob(base64);
        const audio = Uint8Array.from(binary, char => char.charCodeAt(0));
        if (!audio.length || audio.length > MUSIC_LIMITS.maxDecodedBytes || btoa(binary) !== base64)
            throw new Error('MUSIC_AUDIO_INVALID');
        return { audio, contentType: 'audio/mpeg', modelUsed: REVIEWED_OPERATION_CONTRACTS.music.modelId, providerRequestId: id, generatedText: text, ...(costUsd !== undefined ? { costUsd } : {}), ...(usage !== undefined ? { usage } : {}) };
    }
    finally {
        await reader.cancel().catch(() => undefined);
    }
}
