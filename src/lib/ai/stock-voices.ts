import { PREPARATION_MODELS } from './model-registry';

export interface StockVoiceChoice { selectionKey: string; label: string }
export interface VerifiedStockVoice extends StockVoiceChoice { providerVoiceId: string }
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
/** Public catalog GET only. IDs remain private to the binding action; browser
 * selections are stable opaque keys tied to the currently configured model. */
export async function discoverStockVoices(fetcher: typeof fetch = fetch) {
  const modelId = PREPARATION_MODELS.narration.id;
  const response = await fetcher('https://openrouter.ai/api/v1/models?output_modalities=speech', { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('Stock voice catalog is unavailable.');
  const body = object(await response.json());
  const model = Array.isArray(body.data) ? body.data.map(object).find(row => row.id === modelId) : undefined;
  const output = object(model?.architecture).output_modalities;
  if (!model || !Array.isArray(output) || !output.some(value => value === 'speech' || value === 'audio') || !Array.isArray(model.supported_voices) || !model.supported_voices.length || model.supported_voices.length > 500) throw new Error('The configured narration model has no verified stock voice catalog.');
  const ids = model.supported_voices;
  if (ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(id))) throw new Error('Stock voice catalog format needs review.');
  const unique = [...new Set(ids as string[])].sort();
  const voices: VerifiedStockVoice[] = await Promise.all(unique.map(async providerVoiceId => ({
    providerVoiceId,
    selectionKey: await digest(`${modelId}\n${providerVoiceId}`),
    label: providerVoiceId.replace(/^voice_/, 'Preset voice ').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
  })));
  return { modelId, modelName: typeof model.name === 'string' ? model.name : 'Narration model', fingerprint: await digest(`${modelId}\n${unique.join('\n')}`), checkedAt: Date.now(), voices };
}
export function selectStockVoice(catalog: Awaited<ReturnType<typeof discoverStockVoices>>, selectionKey: string) {
  const voice = catalog.voices.find(entry => entry.selectionKey === selectionKey);
  if (!voice) throw new Error('Select a voice from the current verified catalog.');
  return voice;
}
