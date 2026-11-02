import type { PlannedTransition } from './plan.js';
import type { RenderItem } from '../types.js';

const progress = (transition: PlannedTransition, frame: number) => Math.max(0, Math.min(1, (frame - transition.startFrame) / transition.durationInFrames));

/** All coordinates are explicit output frames; readers never retime a source. */
export function visualPresentation(item: RenderItem, frame: number, incoming?: PlannedTransition, outgoing?: PlannedTransition) {
  let opacity = item.opacity ?? 1;
  let translateX = 0;
  let clipPath: string | undefined;
  if (outgoing) {
    const p = progress(outgoing, frame);
    if (outgoing.kind === 'FADE') opacity *= Math.max(0, 1 - p * 2);
    if (outgoing.kind === 'SLIDE') translateX -= p * 100;
  }
  if (incoming) {
    const p = progress(incoming, frame);
    if (incoming.kind === 'DISSOLVE') opacity *= p;
    if (incoming.kind === 'FADE') opacity *= Math.max(0, p * 2 - 1);
    if (incoming.kind === 'WIPE') clipPath = `inset(0 ${100 * (1 - p)}% 0 0)`;
    if (incoming.kind === 'SLIDE') translateX += (1 - p) * 100;
  }
  return { opacity, transform: translateX ? `translateX(${translateX}%)` : undefined, clipPath };
}

/** Independent soundtrack lanes are deliberately unaffected. Only explicitly
 * selected native video audio participates in these linear gain envelopes. */
export function nativeVideoVolume(baseVolume: number, frame: number, incoming?: PlannedTransition, outgoing?: PlannedTransition): number {
  const fadeIn = incoming?.audioPolicy === 'CROSSFADE' ? progress(incoming, frame) : 1;
  const fadeOut = outgoing?.audioPolicy === 'CROSSFADE' ? 1 - progress(outgoing, frame) : 1;
  return baseVolume * fadeIn * fadeOut;
}
