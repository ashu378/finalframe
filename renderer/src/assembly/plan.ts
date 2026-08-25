import { assertValidManifest } from '../manifest.js';
import type { AudioTrack, CaptionTrack, RenderItem, RenderManifest, ShotManifestEntry } from '../types.js';

export interface AssemblyPlan {
  manifestId: string;
  compositionId: 'FinalFrameAssembly';
  fps: number;
  width: number;
  height: number;
  outputCodec: RenderManifest['output']['codec'];
  durationInFrames: number;
  items: RenderItem[];
  shots: ShotManifestEntry[];
  audioTracks: AudioTrack[];
  captionTracks: CaptionTrack[];
}

/** Creates a stable, bounded render plan. No creative or ordering decisions are made here. */
export function createAssemblyPlan(input: RenderManifest): AssemblyPlan {
  const manifest = assertValidManifest(input);
  const items = [...manifest.items].sort((a, b) =>
    (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER)
    || a.startFrame - b.startFrame
    || a.id.localeCompare(b.id),
  );
  const shots = [...(manifest.shots ?? [])].sort((a, b) => a.orderIndex - b.orderIndex || a.startFrame - b.startFrame || a.shotId.localeCompare(b.shotId));
  const audioTracks = [...(manifest.audioTracks ?? [])].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));
  const captionTracks = [...(manifest.captionTracks ?? [])].map((track) => ({
    ...track,
    cues: [...track.cues].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id)),
  }));
  return {
    manifestId: manifest.manifestId,
    compositionId: 'FinalFrameAssembly',
    fps: manifest.output.fps,
    width: manifest.output.width,
    height: manifest.output.height,
    outputCodec: manifest.output.codec,
    durationInFrames: manifest.output.durationInFrames,
    items,
    shots,
    audioTracks,
    captionTracks,
  };
}
