import { graphicsRequirements } from '../renderer/src/templates/graphics-v2-certificate';
import { FORMAT_VARIANT_VERSION, formatVariantRequirements } from '../renderer/src/output-variants';

/** Read only the small capability/acknowledgement response, never a render body. */
export async function readGraphicsHandshake(response: Response): Promise<unknown> {
  const limit = 16_384;
  if (Number(response.headers.get('content-length') ?? 0) > limit) {
    await response.body?.cancel();
    throw new Error('RENDER_GRAPHICS_HANDSHAKE_TOO_LARGE');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('RENDER_GRAPHICS_HANDSHAKE_INVALID');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('RENDER_GRAPHICS_HANDSHAKE_TOO_LARGE'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function graphicsWorkerSupports(manifest: unknown, health: unknown): boolean {
  const required = graphicsRequirements(manifest);
  const formatRequired = formatVariantRequirements(manifest);
  if (!required && !formatRequired) return true;
  const value = health && typeof health === 'object' && !Array.isArray(health) ? health as Record<string, unknown> : {};
  return value.ok === true && value.service === 'finalframe-renderer'
    && (!formatRequired || value.formatVariantVersion === FORMAT_VARIANT_VERSION)
    && (!required || Array.isArray(value.graphicsLayoutVersions) && value.graphicsLayoutVersions.includes(2)
    && Array.isArray(value.motionTemplateIds) && required.templateIds.every(id => (value.motionTemplateIds as unknown[]).includes(id)));
}
