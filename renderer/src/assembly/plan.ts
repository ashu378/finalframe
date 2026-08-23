import { assertValidManifest } from '../manifest.js';
import type { RenderItem, RenderManifest } from '../types.js';

export interface AssemblyPlan {
  manifestId: string;
  compositionId: 'FinalFrameAssembly';
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  items: RenderItem[];
}

/** Creates a stable, bounded render plan. No creative or ordering decisions are made here. */
export function createAssemblyPlan(input: RenderManifest): AssemblyPlan {
  const manifest = assertValidManifest(input);
  const items = [...manifest.items].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));
  return {
    manifestId: manifest.manifestId,
    compositionId: 'FinalFrameAssembly',
    fps: manifest.output.fps,
    width: manifest.output.width,
    height: manifest.output.height,
    durationInFrames: manifest.output.durationInFrames,
    items,
  };
}
