export type CutawayRange = {
  targetStartFrame: number; targetEndFrame: number;
  donorStartFrame: number; donorEndFrame: number;
};

/** Both ranges are half-open. The first and last selected donor frames survive
 * the fit. Reordering, looping and synthesized frames require another contract. */
export function selectCutawayFrames(r: CutawayRange) {
  const values = [r.targetStartFrame, r.targetEndFrame, r.donorStartFrame, r.donorEndFrame];
  const target = r.targetEndFrame - r.targetStartFrame;
  const donor = r.donorEndFrame - r.donorStartFrame;
  if (values.some(n => !Number.isSafeInteger(n) || n < 0 || n > 360) ||
      target < 1 || donor < target || donor > 3 * target ||
      (target === 1 && donor !== 1)) throw new Error('CUTAWAY_RANGE_INVALID');
  return Array.from({ length: target }, (_, i) => r.donorStartFrame +
    (target === 1 ? 0 : Math.round(i * (donor - 1) / (target - 1))));
}
