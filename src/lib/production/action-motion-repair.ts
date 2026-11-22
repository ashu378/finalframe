import { assertFrameToRegion } from '../../../renderer/src/media/frame-to-region-contract';
export const ACTION_MOTION_REPAIR_VERSION = 'animated-action-region-v5';
export const motionRepairKey = (takeId: string) => `story-motion-repair:${takeId}`;
const object = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' ? (value as Record<string, any>) : {};
/** The provider's native clip is already measured by the exact composition
 * proof. Final take QC measures the restored source canvas, timing and audio. */
export function motionOutputValidationRequest(request: Record<string, unknown>) {
  const repair = object(request.storyRepair),
    source = object(repair.source),
    contract = assertFrameToRegion(repair.frameToRegion);
  if (
    repair.approachVersion !== ACTION_MOTION_REPAIR_VERSION ||
    source.width !== contract.region.window.width ||
    source.height !== contract.region.window.height ||
    !Number.isFinite(source.durationSeconds) ||
    source.durationSeconds <= 0 ||
    typeof source.hasAudio !== 'boolean'
  )
    throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
  return {
    ...request,
    operation: 'EDIT',
    duration: source.durationSeconds,
    ratio: `${source.width}:${source.height}`,
    resolution: undefined,
    expectedNativeOutput: undefined,
    requiresAudio: source.hasAudio,
    requiresSourceAudioPreservation: source.hasAudio,
    constraints: undefined,
  };
}
