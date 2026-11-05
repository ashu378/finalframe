import type { QualityTier } from '../types/database';

export const GENERATION_FINISH_OPTIONS = [
  { value: 'ECONOMY', label: 'Preview · least-cost compatible route' },
  { value: 'STANDARD', label: 'Standard · balanced quality' },
  { value: 'PREMIUM', label: 'Premium · within the approved cap' },
] as const;
export const GENERATION_RESOLUTIONS = ['480p', '720p', '1080p'] as const;
export type GenerationResolution = typeof GENERATION_RESOLUTIONS[number];
export function generationFinish(value: unknown): QualityTier {
  if (value === undefined) return 'STANDARD';
  if (!GENERATION_FINISH_OPTIONS.some(option => option.value === value)) throw new Error('GENERATION_FINISH_INVALID');
  return value as QualityTier;
}
/** Execution quality never changes the approved content or final canvas. Source
 * operations inherit their separately certified dimensions instead. */
export function generationResolution(value: unknown, operation: string, inherited?: unknown): string | undefined {
  if (value === undefined) return typeof inherited === 'string' ? inherited : undefined;
  if (!(GENERATION_RESOLUTIONS as readonly unknown[]).includes(value)) throw new Error('GENERATION_RESOLUTION_INVALID');
  if (!['GENERATE', 'FRAME_TO_VIDEO'].includes(operation)) throw new Error('GENERATION_RESOLUTION_OPERATION_UNSUPPORTED');
  return value as GenerationResolution;
}
