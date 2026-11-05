import type { TimelineClip, TimelineTrack, TimelineVersion, TrackKind } from '../render/contracts';
import { getOutputPreset, normalizeOutputPresetId } from '../../../renderer/src/output-presets';

/** Adapt the authenticated timeline editor's normalized view; legacy raw rows
 * remain readable. Never invent clip IDs or silently drop normalized clips. */
export function toTimelineVersion(draft: any, resourceState?: string): TimelineVersion | undefined {
  if (!draft?.timeline) return undefined;
  const tracks: TimelineTrack[] = (draft.tracks ?? []).map((track: any) => {
    const kind = String(track.kind || 'VIDEO') as TrackKind;
    const trackId = String(track.id ?? track._id);
    const sourceClips = Array.isArray(track.clips) ? track.clips : (draft.clips ?? []).filter((clip: any) => String(clip.trackId) === trackId);
    const clips: TimelineClip[] = sourceClips.map((clip: any) => {
      const clipKind = String(clip.kind ?? clip.metadata?.clipKind ?? kind) as TrackKind;
      const base = { id: String(clip.id ?? clip._id), trackId, kind: clipKind, startSeconds: clip.startSeconds, durationSeconds: clip.durationSeconds, sourceStartSeconds: clip.trimStartSeconds ?? 0, sourceDurationSeconds: clip.durationSeconds, metadata: clip.metadata ?? {}, transitionIn: clip.transition?.in, transitionOut: clip.transition?.out, opacity: clip.metadata?.renderItem?.opacity };
      if (clipKind === 'GRAPHIC') {
        const metadata = clip.metadata ?? {};
        const templateId = typeof metadata.motionTemplateId === 'string' ? metadata.motionTemplateId : typeof metadata.templateId === 'string' ? metadata.templateId : 'kinetic-title';
        const props = metadata.templateProps && typeof metadata.templateProps === 'object' && !Array.isArray(metadata.templateProps) ? metadata.templateProps : metadata.props && typeof metadata.props === 'object' && !Array.isArray(metadata.props) ? metadata.props : metadata;
        return { ...base, kind: 'GRAPHIC', templateId, props } as TimelineClip;
      }
      if (clipKind === 'CAPTIONS') return { ...base, kind: 'CAPTIONS', captionTrackId: String(clip.metadata?.captionTrack?.id ?? clip.metadata?.captionTrackId ?? clip.id ?? clip._id) } as TimelineClip;
      const audio = ['VIDEO', 'AUDIO'].includes(clipKind) ? { volumeDb: clip.volume === undefined ? 0 : clip.volume > 0 ? 20 * Math.log10(clip.volume) : undefined, muted: clip.volume === 0 || clip.metadata?.audio?.muted === true } : {};
      return { ...base, kind: clipKind, media: { assetId: String(clip.assetId ?? 'unresolved') }, ...audio, ...(clipKind === 'IMAGE' ? { fit: clip.metadata?.renderItem?.fit } : {}), ...(clipKind === 'AUDIO' ? { fadeInSeconds: clip.metadata?.audio?.fadeInSeconds, fadeOutSeconds: clip.metadata?.audio?.fadeOutSeconds } : {}) } as TimelineClip;
    });
    return { id: trackId, kind, name: track.name ?? 'Track', orderIndex: track.orderIndex, muted: false, locked: false, clips };
  });
  const rawStatus = resourceState || String(draft.timeline.status);
  const status: TimelineVersion['status'] = rawStatus === 'APPROVED' ? 'APPROVED' : rawStatus === 'LOCKED' ? 'LOCKED' : rawStatus === 'SUPERSEDED' ? 'SUPERSEDED' : 'DRAFT';
  const preset = String(draft.timeline.outputPreset || '').toLowerCase();
  const portrait = /vertical|9:16|1080x1920|tiktok|reel/.test(preset);
  const square = /square|1:1|1080x1080/.test(preset);
  const presetId=normalizeOutputPresetId(draft.metadata?.outputPresetId??draft.timeline.outputPreset);
  const output=presetId?getOutputPreset(presetId):null;
  const width = Number(draft.metadata?.authoredOutput?.width ?? draft.metadata?.importedOutput?.width ?? output?.width ?? (portrait || square ? 1080 : 1920));
  const height = Number(draft.metadata?.authoredOutput?.height ?? draft.metadata?.importedOutput?.height ?? output?.height ?? (portrait ? 1920 : 1080));
  const configuredFps = draft.metadata?.fps ?? draft.timeline.tracks?.metadata?.fps;
  const frameRate = [24, 25, 30, 50, 60].includes(configuredFps) ? configuredFps : 30;
  return { id: String(draft.timeline._id), productionId: String(draft.timeline.productionId), version: draft.timeline.versionNumber, status, width, height, frameRate, durationSeconds: draft.timeline.durationSeconds, tracks, captionTrackIds: [], createdAt: new Date(draft.timeline.createdAt).toISOString(), createdBy: String(draft.timeline.createdByUserId ?? 'FinalFrame') };
}
