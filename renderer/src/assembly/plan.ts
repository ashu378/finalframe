import { assertValidManifest } from '../manifest.js';
import type { AudioTrack, CaptionTrack, ManifestTrack, RenderItem, RenderManifest, ShotManifestEntry, VisualTransition } from '../types.js';

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
  tracks: ManifestTrack[];
  transitions: PlannedTransition[];
  version: RenderManifest['version'];
}

export interface PlannedTransition extends VisualTransition { startFrame: number }

/** Creates a stable, bounded render plan. No creative or ordering decisions are made here. */
export function createAssemblyPlan(input: RenderManifest): AssemblyPlan {
  const manifest = assertValidManifest(input);
  const tracks = manifest.version === 5 ? [...(manifest.tracks ?? [])].sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id)) : [];
  const trackOrder = new Map(tracks.map((track, index) => [track.id, index]));
  const items = [...manifest.items].sort((a, b) =>
    (manifest.version === 5 ? (trackOrder.get(a.trackId ?? '') ?? 0) - (trackOrder.get(b.trackId ?? '') ?? 0) : 0)
    || (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER)
    || a.startFrame - b.startFrame
    || a.id.localeCompare(b.id),
  );
  const shots = [...(manifest.shots ?? [])].sort((a, b) => a.orderIndex - b.orderIndex || a.startFrame - b.startFrame || a.shotId.localeCompare(b.shotId));
  const audioTracks = [...(manifest.audioTracks ?? [])].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));
  const captionTracks = [...(manifest.captionTracks ?? [])].map((track) => ({
    ...track,
    cues: [...track.cues].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id)),
  }));
  const byId = new Map(items.map(item => [item.id, item]));
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
    tracks,
    transitions: manifest.version === 5 ? (manifest.transitions ?? []).map(transition => ({ ...transition, startFrame: byId.get(transition.toItemId)!.startFrame })) : [],
    version: manifest.version,
  };
}
