/** Bounds for new authoring requests on the single-worker deployment.
 * Imported historical manifests retain their original contract. */
export interface AuthoringOutputSettings { width: number; height: number }
export function validateAuthoringOutputSettings(value: unknown): AuthoringOutputSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OUTPUT_SETTINGS_INVALID');
  const settings = value as Record<string, unknown>;
  if (Object.keys(settings).some(key => key !== 'width' && key !== 'height')) throw new Error('OUTPUT_SETTINGS_INVALID');
  const { width, height } = settings;
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 16 || height < 16 || width > 1920 || height > 1920 || width % 2 || height % 2 || width * height > 1920 * 1080) throw new Error('OUTPUT_SETTINGS_INVALID');
  return { width, height };
}
