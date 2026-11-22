import { assertActionRegion, type ActionRegion } from './action-region-contract.js';
export const FRAME_TO_REGION_VERSION = 'FRAME_TO_REGION_V1' as const;
export type FrameToRegion = {
  version: typeof FRAME_TO_REGION_VERSION;
  region: ActionRegion;
  anchorPreparation: { method: 'LANCZOS'; width: 640; height: 640 };
  providerOutput: { width: 640; height: 640; fps: 24; frames: 96 };
  normalization: {
    method: 'UNIFORM_FRAME_SELECTION_LANCZOS';
    targetWidth: number;
    targetHeight: number;
    targetFrames: number;
    targetFps: 24;
  };
};
const object = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
export function assertFrameToRegion(value: unknown): FrameToRegion {
  const p = object(value),
    region = assertActionRegion(p.region),
    input = object(p.providerOutput),
    a = object(p.anchorPreparation),
    n = object(p.normalization);
  const frames = region.window.endFrame - region.window.startFrame;
  if (
    p.version !== FRAME_TO_REGION_VERSION ||
    region.width !== region.height ||
    region.width > 640 ||
    frames < 24 ||
    frames > 96 ||
    a.method !== 'LANCZOS' ||
    a.width !== 640 ||
    a.height !== 640 ||
    input.width !== 640 ||
    input.height !== 640 ||
    input.fps !== 24 ||
    input.frames !== 96 ||
    n.method !== 'UNIFORM_FRAME_SELECTION_LANCZOS' ||
    n.targetWidth !== region.width ||
    n.targetHeight !== region.height ||
    n.targetFrames !== frames ||
    n.targetFps !== 24
  )
    throw new Error('FRAME_TO_REGION_CONTRACT_INVALID');
  return {
    version: FRAME_TO_REGION_VERSION,
    region,
    anchorPreparation: { method: 'LANCZOS', width: 640, height: 640 },
    providerOutput: { width: 640, height: 640, fps: 24, frames: 96 },
    normalization: {
      method: 'UNIFORM_FRAME_SELECTION_LANCZOS',
      targetWidth: region.width,
      targetHeight: region.height,
      targetFrames: frames,
      targetFps: 24,
    },
  };
}
export function frameSelection(contract: FrameToRegion): number[] {
  const c = assertFrameToRegion(contract);
  return Array.from({ length: c.normalization.targetFrames }, (_, i) =>
    Math.round((i * 95) / (c.normalization.targetFrames - 1)),
  );
}
/** A reviewer marks the last required movement on the saved four-second clip.
 * The backend derives the latest safe target frame from its approved action deadline. */
export type ActionTiming = { providerFrame: number; targetFrame: number };
export function actionTimingBounds(contract: FrameToRegion, targetFrame: number) {
  const last = contract.normalization.targetFrames - 1;
  if (!Number.isInteger(targetFrame) || targetFrame < 3 || targetFrame >= last) return null;
  // Move a genuinely late pose earlier, at most 4x in either direction.
  const firstAllowed = Math.round((targetFrame * 95) / last) + 1;
  const lastAllowed = Math.min(94, targetFrame * 4, 95 - Math.ceil((last - targetFrame) / 4));
  return firstAllowed <= lastAllowed ? { firstAllowed, lastAllowed } : null;
}
export function timedFrameSelection(contract: FrameToRegion, timing: ActionTiming): number[] {
  const c = assertFrameToRegion(contract);
  const last = c.normalization.targetFrames - 1;
  const { providerFrame, targetFrame } = timing;
  const bounds = actionTimingBounds(c, targetFrame);
  if (
    !bounds ||
    !Number.isInteger(providerFrame) ||
    providerFrame < bounds.firstAllowed ||
    providerFrame > bounds.lastAllowed
  )
    throw new Error('FRAME_TO_REGION_TIMING_INVALID');
  return Array.from({ length: last + 1 }, (_, i) =>
    i <= targetFrame
      ? Math.round((i * providerFrame) / targetFrame)
      : providerFrame + Math.round(((i - targetFrame) * (95 - providerFrame)) / (last - targetFrame)),
  );
}
export function assertFrameToRegionProof(
  contract: FrameToRegion,
  value: unknown,
  phase: 'PREPARED' | 'COMPOSED',
  timing?: ActionTiming,
) {
  const c = assertFrameToRegion(contract),
    p = object(value),
    bound = assertFrameToRegion(p.frameToRegion);
  if (
    p.version !== FRAME_TO_REGION_VERSION ||
    p.phase !== phase ||
    (timing
      ? phase !== 'COMPOSED' ||
        p.actionTiming?.targetFrame !== timing.targetFrame ||
        p.actionTiming?.providerFrame !== timing.providerFrame
      : p.actionTiming !== undefined) ||
    JSON.stringify(c) !== JSON.stringify(bound)
  )
    throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
  if (phase === 'PREPARED') {
    if (
      p.firstFrame !== c.region.window.startFrame ||
      p.lastFrame !== c.region.window.endFrame - 1 ||
      p.width !== c.region.width ||
      p.height !== c.region.height ||
      p.anchorWidth !== 640 ||
      p.anchorHeight !== 640
    )
      throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
  } else if (
    !(
      (p.providerInputFrames === c.providerOutput.frames &&
        (p.trimmedTrailingFrames === undefined || p.trimmedTrailingFrames === 0)) ||
      (p.providerInputFrames === c.providerOutput.frames + 1 && p.trimmedTrailingFrames === 1)
    ) ||
    p.providerInputWidth !== 640 ||
    p.providerInputHeight !== 640 ||
    p.providerInputFps !== 24 ||
    p.normalizedFrames !== c.normalization.targetFrames ||
    p.normalizedWidth !== c.region.width ||
    p.normalizedHeight !== c.region.height ||
    JSON.stringify(p.selectedProviderFrames) !==
      JSON.stringify(timing ? timedFrameSelection(c, timing) : frameSelection(c)) ||
    p.outputFrames !== c.region.window.sourceFrames ||
    p.width !== c.region.window.width ||
    p.height !== c.region.window.height ||
    p.fps !== 24 ||
    typeof p.originalAudioCopied !== 'boolean'
  )
    throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
  return p;
}
