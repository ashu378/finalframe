import { assertActionWindow, type ActionWindow } from './action-window-contract.js';

/** A stationary, explicitly reviewed rectangle. Coordinates are source pixels,
 * never a model-proposed mask or fixture-specific face location. The backend
 * must bind this selection to its source checksum and review before purchase.
 * This pure contract validates geometry; it does not grant authorization. */
export const ACTION_REGION_VERSION = 'ACTION_REGION_V1' as const;
export const ACTION_REGION_REPAIR_VERSION = 'isolated-action-region-v4' as const;
export type ActionRegion = {
  version: typeof ACTION_REGION_VERSION;
  mode: 'STATIONARY_RECTANGLE';
  window: ActionWindow;
  x: number; y: number; width: number; height: number;
};

export function assertActionRegion(value: unknown): ActionRegion {
  const p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const window = assertActionWindow(p.window);
  const { x, y, width, height } = p;
  if (p.version !== ACTION_REGION_VERSION || p.mode !== 'STATIONARY_RECTANGLE' ||
      [x, y, width, height].some(n => typeof n !== 'number' || !Number.isSafeInteger(n) || n % 2 !== 0) ||
      (x as number) < 0 || (y as number) < 0 || (width as number) < 64 || (height as number) < 64 ||
      (x as number) + (width as number) > window.width || (y as number) + (height as number) > window.height ||
      (width as number) * (height as number) > window.width * window.height / 2) {
    throw new Error('ACTION_REGION_SELECTION_INVALID');
  }
  return { version: ACTION_REGION_VERSION, mode: 'STATIONARY_RECTANGLE', window,
    x: x as number, y: y as number, width: width as number, height: height as number };
}

export function assertActionRegionProof(region: ActionRegion, value: unknown, compose: boolean) {
  const p = value && typeof value === 'object' ? value as Record<string, any> : {};
  const bound = assertActionRegion(p.region);
  if (p.version !== ACTION_REGION_VERSION || JSON.stringify(bound) !== JSON.stringify(region) ||
      p.width !== (compose ? region.window.width : region.width) ||
      p.height !== (compose ? region.window.height : region.height) || p.fps !== 24 ||
      p.outputFrames !== (compose ? region.window.sourceFrames : region.window.endFrame - region.window.startFrame) ||
      typeof p.originalAudioCopied !== 'boolean' || !compose && p.originalAudioCopied !== false) {
    throw new Error('ACTION_WINDOW_BINDING_CHANGED');
  }
  return p;
}
