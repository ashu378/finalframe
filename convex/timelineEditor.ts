import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireMember, requireProjectAccess, requireProjectRole } from "./authorization";
import { transitionResourceState } from "./approvals";
import { ensureResourceState, getEffectiveResourceState, requireEditable, requireApprovedResource } from "./resourceStates";
import { cropCaptionTrack, finishingFps, finishingV5Enabled, normalizeCaptionTrack } from './finishingContracts';
import type { CaptionTrack } from '../renderer/src/types';
import { approvedBeatSource } from './beatAnalysis';
import { planBeatCuts } from './beatCutContracts';

type ReadCtx = QueryCtx | MutationCtx;
type Timeline = Doc<"timelines">;
type TimelineTrack = Doc<"timelineTracks">;
type TimelineClip = Doc<"timelineClips">;
type Operation = Doc<"productionOperations">;

type JsonRecord = Record<string, unknown>;

type ClipState = {
  id: string;
  trackId: string;
  kind: string;
  assetId?: string;
  shotVersionId?: string;
  startSeconds: number;
  durationSeconds: number;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  volume?: number;
  transition?: unknown;
  metadata: JsonRecord;
  [key: string]: unknown;
};

type TrackState = {
  id: string;
  kind: string;
  name?: string;
  orderIndex: number;
  metadata: JsonRecord;
  clips: ClipState[];
};

type TimelineState = {
  tracks: TrackState[];
  metadata: JsonRecord;
};

const editKind = v.union(
  v.literal("trim"),
  v.literal("split"),
  v.literal("reorder"),
  v.literal("replace"),
  v.literal("updateText"),
  v.literal("updateCaptions"),
  v.literal("adjustAudio"),
  v.literal("addTransition"),
);

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return stringValue(value, label);
}

function numberValue(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be a finite number greater than or equal to ${minimum}.`);
  }
  return value;
}

function optionalNumber(value: unknown, label: string, minimum = 0): number | undefined {
  if (value === undefined || value === null) return undefined;
  return numberValue(value, label, minimum);
}

function idempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length < 8 || key.length > 200) {
    throw new Error("Idempotency key must be between 8 and 200 characters.");
  }
  return key;
}

function now() {
  return Date.now();
}

function timelineKey(id: Id<"timelines">): string {
  return id.toString();
}

function decodeJsonTracks(value: unknown): TrackState[] {
  const payload = record(value);
  const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  return tracks.flatMap((rawTrack, trackIndex) => {
    const input = record(rawTrack);
    const rawClips = Array.isArray(input.clips) ? input.clips : [];
    const id = typeof input.id === "string" ? input.id : `json-track-${trackIndex}`;
    const kind = typeof input.kind === "string" ? input.kind : "VIDEO";
    const clips = rawClips.flatMap((rawClip, clipIndex) => {
      const clip = record(rawClip);
      if (typeof clip.id !== "string") return [];
      return [{
        ...clip,
        id: clip.id,
        trackId: typeof clip.trackId === "string" ? clip.trackId : id,
        kind: typeof clip.kind === "string" ? clip.kind : kind,
        startSeconds: typeof clip.startSeconds === "number" ? clip.startSeconds : clipIndex,
        durationSeconds: typeof clip.durationSeconds === "number" ? clip.durationSeconds : 0,
        metadata: record(clip.metadata),
      } as ClipState];
    });
    return [{
      id,
      kind,
      name: typeof input.name === "string" ? input.name : undefined,
      orderIndex: typeof input.orderIndex === "number" ? input.orderIndex : trackIndex,
      metadata: record(input.metadata),
      clips,
    }];
  });
}

function normalizedState(tracks: TimelineTrack[], clips: TimelineClip[]): TrackState[] {
  const clipsByTrack = new Map<string, TimelineClip[]>();
  for (const clip of clips) {
    const existing = clipsByTrack.get(clip.trackId.toString()) ?? [];
    existing.push(clip);
    clipsByTrack.set(clip.trackId.toString(), existing);
  }

  return tracks
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((track) => ({
      id: track._id.toString(),
      kind: track.kind,
      name: track.name,
      orderIndex: track.orderIndex,
      metadata: record(track.metadata),
      clips: (clipsByTrack.get(track._id.toString()) ?? [])
        .slice()
        .sort((a, b) => a.startSeconds - b.startSeconds)
        .map((clip) => ({
          id: clip._id.toString(),
          trackId: track._id.toString(),
          kind: typeof record(clip.metadata).clipKind === 'string' ? String(record(clip.metadata).clipKind) : track.kind,
          assetId: clip.assetId?.toString(),
          shotVersionId: clip.shotVersionId?.toString(),
          startSeconds: clip.startSeconds,
          durationSeconds: clip.durationSeconds,
          trimStartSeconds: clip.trimStartSeconds,
          trimEndSeconds: clip.trimEndSeconds,
          volume: clip.volume,
          transition: clip.transition,
          metadata: record(clip.metadata),
        })),
    }));
}

async function loadState(ctx: ReadCtx, timeline: Timeline, tracks: TimelineTrack[], clips: TimelineClip[]): Promise<TimelineState> {
  for (const track of tracks) {
    if (track.studioExternalId !== timeline.studioExternalId || track.timelineId !== timeline._id) {
      throw new Error("Timeline track ownership is invalid.");
    }
  }
  for (const clip of clips) {
    if (clip.studioExternalId !== timeline.studioExternalId || clip.timelineId !== timeline._id) {
      throw new Error("Timeline clip ownership is invalid.");
    }
  }

  const normalized = normalizedState(tracks, clips);
  const jsonTracks = decodeJsonTracks(timeline.tracks);
  if (normalized.length > 0) {
    const jsonById = new Map(jsonTracks.map((track) => [track.id, track]));
    const jsonByOrder = jsonTracks.slice().sort((a, b) => a.orderIndex - b.orderIndex);
    return {
      metadata: record(record(timeline.tracks).metadata),
      tracks: normalized.map((track, index) => {
        const rich = jsonById.get(track.id) ?? jsonByOrder[index];
        if (!rich) return track;
        const richById = new Map(rich.clips.map((clip) => [clip.id, clip]));
        return {
          ...track,
          metadata: { ...track.metadata, ...rich.metadata },
          clips: track.clips.map((clip, clipIndex) => {
            const richClip = richById.get(clip.id) ?? rich.clips[clipIndex];
            return richClip ? { ...clip, ...richClip, id: clip.id, trackId: track.id, metadata: { ...clip.metadata, ...richClip.metadata } } : clip;
          }),
        };
      }),
    };
  }

  if (jsonTracks.length === 0) throw new Error("Timeline has no editable track data.");
  return { metadata: record(record(timeline.tracks).metadata), tracks: jsonTracks };
}

function assertEditable(timeline: Timeline) {
  const status = timeline.status as string;
  const lockState = record(record(timeline.tracks).metadata).lockState;
  if (status === "LOCKED" || status === "APPROVED" || lockState === "LOCKED") {
    throw new Error("This timeline is locked and cannot be edited. Create a new version first.");
  }
  if (timeline.status === "SUPERSEDED") {
    throw new Error("This timeline version is superseded and cannot be edited.");
  }
}

function findClip(state: TimelineState, clipId: string): { track: TrackState; clip: ClipState } {
  for (const track of state.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return { track, clip };
  }
  throw new Error("The selected timeline clip was not found in the current version.");
}

function ensureChanged(before: string, after: TimelineState) {
  if (before === JSON.stringify(after)) throw new Error("The requested edit does not change the timeline.");
}

function applyEdit(state: TimelineState, kind: string, rawInput: unknown): TimelineState {
  const input = record(rawInput);
  const clipId = optionalString(input.clipId, "Clip ID");

  if (kind === "trim") {
    if (!clipId) throw new Error("A clip ID is required for trimming.");
    const { clip, track } = findClip(state, clipId);
    if (track.clips.some(candidate => Object.values(record(candidate.transition)).some(value => record(value).kind && record(value).kind !== 'CUT'))) throw new Error('Remove the transition on this picture lane before trimming or splitting its clips.');
    const oldTrim = clip.trimStartSeconds ?? 0;
    const trimStart = optionalNumber(input.trimStartSeconds, "Trim start", 0) ?? clip.trimStartSeconds ?? 0;
    const trimEnd = optionalNumber(input.trimEndSeconds, "Trim end", 0) ?? clip.trimEndSeconds ?? (clip.trimStartSeconds ?? 0) + clip.durationSeconds;
    if (trimEnd <= trimStart) throw new Error("Trim end must be after trim start.");
    const duration = optionalNumber(input.durationSeconds, "Duration", 0) ?? trimEnd - trimStart;
    if (duration <= 0 || duration > trimEnd - trimStart + 0.000001) throw new Error("Trimmed duration must fit between the source trim bounds.");
    clip.trimStartSeconds = trimStart;
    clip.trimEndSeconds = trimStart + duration;
    clip.durationSeconds = duration;
    if (record(clip.metadata.captionTrack).cues) clip.metadata.captionTrack = cropCaptionTrack(clip.metadata.captionTrack as unknown as CaptionTrack, trimStart - oldTrim, trimStart - oldTrim + duration, finishingFps(state.metadata));
    const start = optionalNumber(input.startSeconds, "Timeline start", 0);
    if (start !== undefined) clip.startSeconds = start;
    return state;
  }

  if (kind === "split") {
    if (!clipId) throw new Error("A clip ID is required for splitting.");
    const { track, clip } = findClip(state, clipId);
    if (track.clips.some(candidate => Object.values(record(candidate.transition)).some(value => record(value).kind && record(value).kind !== 'CUT'))) throw new Error('Remove the transition on this picture lane before trimming or splitting its clips.');
    const splitAt = optionalNumber(input.splitAtSeconds, "Split position", 0) ?? optionalNumber(input.atSeconds, "Split position", 0);
    if (splitAt === undefined || splitAt <= 0 || splitAt >= clip.durationSeconds) throw new Error("Split position must be inside the clip.");
    const first: ClipState = { ...clip, metadata: { ...clip.metadata, splitPart: 1 } };
    first.durationSeconds = splitAt;
    first.trimEndSeconds = (clip.trimStartSeconds ?? 0) + splitAt;
    const second: ClipState = {
      ...clip,
      id: `${clip.id}:split:${splitAt}`,
      startSeconds: clip.startSeconds + splitAt,
      durationSeconds: clip.durationSeconds - splitAt,
      trimStartSeconds: (clip.trimStartSeconds ?? 0) + splitAt,
      metadata: { ...clip.metadata, splitPart: 2, splitFrom: clip.id },
    };
    if (record(clip.metadata.captionTrack).cues) {
      const fps = finishingFps(state.metadata);
      first.metadata.captionTrack = cropCaptionTrack(clip.metadata.captionTrack as unknown as CaptionTrack, 0, splitAt, fps);
      second.metadata.captionTrack = cropCaptionTrack(clip.metadata.captionTrack as unknown as CaptionTrack, splitAt, clip.durationSeconds, fps);
    }
    track.clips.splice(track.clips.indexOf(clip), 1, first, second);
    return state;
  }

  if (kind === "reorder") {
    if (!clipId) throw new Error("A clip ID is required for reordering.");
    const { track, clip } = findClip(state, clipId);
    if (track.clips.some(candidate => Object.values(record(candidate.transition)).some(value => record(value).kind && record(value).kind !== 'CUT'))) throw new Error('Remove transitions on this lane before changing clip order.');
    if (state.tracks.some(lane => lane.kind === 'CAPTIONS' && lane.clips.some(candidate => Array.isArray(record(candidate.metadata.captionTrack).cues) && (record(candidate.metadata.captionTrack).cues as unknown[]).length))) throw new Error('Revise standalone imported captions before reordering pictures. Clip-bound captions can follow their clips.');
    const targetTrackId = optionalString(input.targetTrackId, "Target track ID") ?? track.id;
    const targetTrack = state.tracks.find((candidate) => candidate.id === targetTrackId);
    if (!targetTrack) throw new Error("The target timeline track was not found.");
    if (targetTrack.kind !== track.kind) throw new Error("A clip cannot be moved between different media track types.");
    const index = numberValue(input.toIndex, "Target clip index", 0);
    if (!Number.isInteger(index)) throw new Error("Target clip index must be a whole number.");
    track.clips = track.clips.filter((candidate) => candidate !== clip);
    targetTrack.clips.splice(Math.min(index, targetTrack.clips.length), 0, { ...clip, trackId: targetTrack.id });
    targetTrack.clips.forEach((candidate, candidateIndex) => {
      candidate.metadata = { ...candidate.metadata, orderIndex: candidateIndex };
    });
    // Reordering must move content in time, not only change display metadata.
    for (const lane of new Set([track, targetTrack])) {
      let elapsed = 0;
      for (const candidate of lane.clips) { candidate.startSeconds = elapsed; elapsed += candidate.durationSeconds; }
    }
    return state;
  }

  if (!clipId) throw new Error("A clip ID is required for this edit.");
  const { clip } = findClip(state, clipId);

  if (kind === "replace") {
    clip.assetId = stringValue(input.assetId, "Replacement asset ID");
    // A deliberate asset replacement must not retain the old take's identity.
    clip.shotVersionId = optionalString(input.shotVersionId, "Shot version ID");
    return state;
  }

  if (kind === "updateText") {
    const text = stringValue(input.text, "Text");
    const field = optionalString(input.field, "Text field") ?? "text";
    clip.metadata = { ...clip.metadata, [field]: text };
    if (clip.kind === "GRAPHIC") {
      const props = record(clip.props);
      clip.props = { ...props, [field]: text };
    }
    return state;
  }

  if (kind === "updateCaptions") {
    const captionTrackId = optionalString(input.captionTrackId, "Caption track ID");
    const cues = input.cues;
    if (cues !== undefined && !Array.isArray(cues)) throw new Error("Caption cues must be an array.");
    if (captionTrackId === undefined && cues === undefined) throw new Error("Caption track ID or cues are required.");
    if (process.env.FINALFRAME_MANIFEST_V5_ENABLED !== 'true') {
      if (captionTrackId || Array.isArray(cues) && cues.length) throw new Error("Caption authoring is not connected to canonical export yet. No edit was saved.");
      clip.metadata = { ...clip.metadata, ...(cues !== undefined ? { cues } : {}) }; return state;
    }
    if (captionTrackId) throw new Error('Load the exact authorized caption cue snapshot before editing; raw caption IDs are not accepted.');
    if (!['VIDEO', 'IMAGE', 'GRAPHIC', 'CAPTIONS'].includes(clip.kind)) throw new Error('Attach captions to picture clips or a caption lane.');
    const caption = normalizeCaptionTrack(input, clip.durationSeconds, finishingFps(state.metadata), `${clip.id}:captions`);
    const metadata = { ...clip.metadata };
    for (const key of ['captionId', 'captionTrackId', 'captionsId', 'cues']) delete metadata[key];
    clip.metadata = { ...metadata, captionTrack: caption, captionFps: finishingFps(state.metadata) };
    return state;
  }

  if (kind === "adjustAudio") {
    if (input.volume !== undefined && input.volumeDb !== undefined) throw new Error("Choose linear volume or decibels, not both.");
    let volume = optionalNumber(input.volume, "Volume") ?? clip.volume;
    if (input.volumeDb !== undefined) {
      if (typeof input.volumeDb !== "number" || !Number.isFinite(input.volumeDb)) throw new Error("Decibel volume must be finite.");
      volume = Math.pow(10, input.volumeDb / 20);
    }
    if (volume !== undefined && (!Number.isFinite(volume) || volume < 0 || volume > (clip.kind === "AUDIO" ? 2 : 1))) throw new Error("Volume exceeds the supported playback range.");
    if (input.pan !== undefined && input.pan !== 0) throw new Error("Stereo panning is not supported by the current renderer.");
    if (input.muted !== undefined && typeof input.muted !== "boolean") throw new Error("Muted must be true or false.");
    for (const value of [input.fadeInSeconds, input.fadeOutSeconds]) if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > clip.durationSeconds)) throw new Error("Audio fades must fit inside the clip.");
    if (clip.kind !== "AUDIO" && (input.fadeInSeconds !== undefined || input.fadeOutSeconds !== undefined)) throw new Error("Add a soundtrack lane to use audio fades.");
    if (volume !== undefined) clip.volume = volume;
    const audio = {
      ...(record(clip.metadata).audio as JsonRecord | undefined),
      ...(input.pan !== undefined ? { pan: numberValue(input.pan, "Pan", -1) } : {}),
      ...(input.fadeInSeconds !== undefined ? { fadeInSeconds: numberValue(input.fadeInSeconds, "Fade in") } : {}),
      ...(input.fadeOutSeconds !== undefined ? { fadeOutSeconds: numberValue(input.fadeOutSeconds, "Fade out") } : {}),
      ...(input.muted !== undefined ? { muted: Boolean(input.muted) } : {}),
    };
    clip.metadata = { ...clip.metadata, audio };
    return state;
  }

  if (kind === "addTransition") {
    const position = optionalString(input.position, "Transition position") ?? "out";
    if (position !== "in" && position !== "out") throw new Error("Transition position must be 'in' or 'out'.");
    const transitionKind = stringValue(input.transitionKind ?? input.type, "Transition type");
    if (!["CUT", "DISSOLVE", "FADE", "WIPE", "SLIDE"].includes(transitionKind)) throw new Error("Transition type is not supported.");
    if (process.env.FINALFRAME_MANIFEST_V5_ENABLED !== 'true') {
      if (transitionKind !== "CUT") throw new Error("Only cut transitions are connected to canonical export yet. No edit was saved.");
      const durationSeconds = numberValue(input.durationSeconds, "Transition duration");
      if (durationSeconds > clip.durationSeconds) throw new Error("Transition cannot be longer than the clip.");
      clip.transition = { ...record(clip.transition), [position]: { kind: transitionKind, durationSeconds } }; return state;
    }
    const { track } = findClip(state, clipId);
    if (!['VIDEO', 'IMAGE', 'GRAPHIC'].includes(clip.kind)) throw new Error('Transitions require two adjacent picture clips on the same lane.');
    const ordered = track.clips.slice().sort((a, b) => a.startSeconds - b.startSeconds);
    const selectedIndex = ordered.indexOf(clip); const fromIndex = position === 'out' ? selectedIndex : selectedIndex - 1;
    const from = ordered[fromIndex]; const to = ordered[fromIndex + 1];
    if (!from || !to) throw new Error('Choose a boundary with a following picture clip on the same lane.');
    const fps = finishingFps(state.metadata);
    const durationSeconds = numberValue(input.durationSeconds, "Transition duration");
    const duration = transitionKind === 'CUT' ? 0 : Math.round(durationSeconds * fps) / fps;
    if (transitionKind !== 'CUT' && (duration <= 0 || duration > 2 || duration > Math.min(from.durationSeconds, to.durationSeconds) / 2)) throw new Error('Transition overlap must fit within two seconds and half of each adjacent picture clip.');
    const previous = record(record(from.transition).out);
    const previousDuration = previous.kind && previous.kind !== 'CUT' ? Number(previous.durationSeconds) : 0;
    if (!Number.isFinite(previousDuration) || Math.abs(to.startSeconds - (from.startSeconds + from.durationSeconds - previousDuration)) > 1 / fps / 100) throw new Error('Close the gap or remove the ambiguous overlap between these picture clips first.');
    const audioPolicy = input.audioPolicy ?? 'PRESERVE';
    if (!['PRESERVE', 'CROSSFADE'].includes(String(audioPolicy))) throw new Error('Choose preserve audio or an explicit native-audio crossfade.');
    if (input.trimSoundtrackToPicture !== undefined && typeof input.trimSoundtrackToPicture !== 'boolean') throw new Error('Soundtrack tail trimming requires an explicit choice.');
    const boundary = to.startSeconds; const delta = previousDuration - duration;
    for (let index = fromIndex + 1; index < ordered.length; index++) { ordered[index].startSeconds = Math.round((ordered[index].startSeconds + delta) * fps) / fps; delete ordered[index].metadata.rendererOrderIndex; }
    const pictureEnd = Math.max(...state.tracks.flatMap(lane => lane.clips.filter(candidate => ['VIDEO', 'IMAGE', 'GRAPHIC'].includes(candidate.kind)).map(candidate => candidate.startSeconds + candidate.durationSeconds)));
    for (const lane of state.tracks) for (const candidate of lane.clips) {
      if (candidate.kind === 'AUDIO' && candidate.startSeconds + candidate.durationSeconds > pictureEnd + 0.000001) {
        const role = String(candidate.metadata.audioRole ?? '');
        if (input.trimSoundtrackToPicture !== true || !['music', 'ambience'].includes(role)) throw new Error('This edit shortens the picture. Explicitly allow music/ambience tail trimming, or trim/move dialogue, voiceover and SFX first.');
        const remaining = pictureEnd - candidate.startSeconds; const audio = record(candidate.metadata.audio);
        if (remaining <= 0 || Number(audio.fadeInSeconds ?? 0) > remaining) throw new Error('Move this soundtrack or revise its fade before shortening the picture.');
        candidate.durationSeconds = remaining; candidate.trimEndSeconds = (candidate.trimStartSeconds ?? 0) + remaining;
        candidate.metadata.audio = { ...audio, fadeOutSeconds: Math.min(Number(audio.fadeOutSeconds ?? 0), remaining) };
      }
      if (candidate.kind === 'CAPTIONS' && Array.isArray(record(candidate.metadata.captionTrack).cues)) {
        const original = candidate.metadata.captionTrack as unknown as CaptionTrack;
        const cues = original.cues.map(cue => {
          const start = candidate.startSeconds + cue.startFrame / fps; const end = start + cue.durationInFrames / fps;
          const shiftedStart = start >= boundary ? start + delta : start; const shiftedEnd = end >= boundary ? end + delta : end;
          return { ...cue, startSeconds: shiftedStart - candidate.startSeconds, durationSeconds: shiftedEnd - shiftedStart };
        });
        candidate.durationSeconds = pictureEnd - candidate.startSeconds;
        candidate.metadata.captionTrack = normalizeCaptionTrack({ ...original, cues }, candidate.durationSeconds, fps, original.id);
      }
    }
    const captions = state.tracks.flatMap(lane => lane.clips.flatMap(candidate => {
      const caption = candidate.metadata.captionTrack as unknown as CaptionTrack | undefined;
      return caption?.cues?.map(cue => ({ start: candidate.startSeconds + cue.startFrame / fps, end: candidate.startSeconds + (cue.startFrame + cue.durationInFrames) / fps, key: `${caption.language}:${String(caption.style?.position ?? 'BOTTOM')}` })) ?? [];
    }));
    for (const key of new Set(captions.map(cue => cue.key))) {
      const cues = captions.filter(cue => cue.key === key).sort((a, b) => a.start - b.start);
      for (let index = 1; index < cues.length; index++) if (cues[index].start < cues[index - 1].end - 0.000001) throw new Error('Caption cues collide after this transition. Revise their timing or placement first.');
    }
    from.transition = { ...record(from.transition), out: { kind: transitionKind, durationSeconds: duration, audioPolicy } };
    state.metadata = { ...state.metadata, fps, finishingVersion: 5, soundtrackRetiming: { mode: 'ABSOLUTE', trimMusicTail: input.trimSoundtrackToPicture === true } };
    return state;
  }

  throw new Error("This timeline edit is not supported.");
}

function encodeState(state: TimelineState, sourceTimelineId: string, sourceVersionNumber: number, maps: { tracks: Map<string, string>; clips: Map<string, string> }) {
  return {
    format: "FINALFRAME_TIMELINE_V2",
    sourceTimelineId,
    sourceVersionNumber,
    metadata: state.metadata,
    tracks: state.tracks.map((track) => ({
      ...track,
      id: maps.tracks.get(track.id) ?? track.id,
      clips: track.clips.map((clip) => ({
        ...clip,
        id: maps.clips.get(clip.id) ?? clip.id,
        trackId: maps.tracks.get(track.id) ?? track.id,
      })),
    })),
  };
}

async function getTimelineForMember(ctx: ReadCtx, timelineId: Id<"timelines">) {
  const timeline = await ctx.db.get(timelineId);
  if (!timeline) throw new Error("Timeline not found.");
  const member = await requireMember(ctx, timeline.studioExternalId);
  const production = await ctx.db.get(timeline.productionId);
  if (!production?.projectId) throw new Error("Timeline is not attached to a project.");
  if (timeline.projectId && timeline.projectId !== production.projectId) throw new Error('Timeline project ownership is invalid.');
  await requireProjectRole(ctx, production.projectId, ["OWNER", "EDITOR"]);
  const resourceState = await getEffectiveResourceState(ctx, production.projectId, "timeline", timeline._id.toString(), production._id);
  return { timeline, member, production, resourceState };
}

async function getTimelineState(ctx: ReadCtx, timeline: Timeline): Promise<TimelineState> {
  const tracks = await ctx.db.query("timelineTracks").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).take(501);
  const clips = await ctx.db.query("timelineClips").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).take(501);
  if (tracks.length > 500 || clips.length > 500) throw new Error('This timeline exceeds the bounded editing graph. Use shorter components.');
  return await loadState(ctx, timeline, tracks, clips);
}

async function findOperationByKey(ctx: ReadCtx, key: string): Promise<Operation | null> {
  const operations = await ctx.db.query("productionOperations").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key)).take(2);
  return operations[0] ?? null;
}

function operationInput(operation: Operation): JsonRecord {
  return record(operation.input);
}

async function persistDraft(
  ctx: MutationCtx,
  source: Timeline,
  state: TimelineState,
  member: Awaited<ReturnType<typeof requireMember>>,
  sourceTimelineId: Id<"timelines">,
  projectId: Id<"projects">,
  options: { preserveAudioTiming?: boolean } = {},
) {
  const latest = await ctx.db.query("timelines").withIndex("by_production_version", q => q.eq('productionId', source.productionId)).order('desc').first();
  const timestamp = now();
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const provisional = await ctx.db.insert("timelines", {
    studioExternalId: member.studio.externalId,
    studioId: member.studio._id,
    projectId,
    manifestId: source.manifestId,
    selectionScope: source.selectionScope,
    productionId: source.productionId,
    versionNumber,
    durationSeconds: 0,
    tracks: { format: "FINALFRAME_TIMELINE_V2", sourceTimelineId: timelineKey(sourceTimelineId), sourceVersionNumber: source.versionNumber, metadata: state.metadata, tracks: [] },
    outputPreset: source.outputPreset,
    status: "DRAFT",
    createdByUserId: member.user._id,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await ensureResourceState(ctx, { projectId, productionId: source.productionId, resourceType: "timeline", resourceId: provisional.toString() });

  const trackMap = new Map<string, string>();
  const clipMap = new Map<string, string>();
  const createdTrackIds: string[] = [];
  const createdClipIds: string[] = [];
  const normalizedTracks: Array<{ id: string; kind: string; name?: string; orderIndex: number; metadata: JsonRecord; clips: ClipState[] }> = [];
  let durationSeconds = 0;

  for (const [trackIndex, track] of state.tracks.entries()) {
    const trackId = await ctx.db.insert("timelineTracks", {
      studioExternalId: member.studio.externalId,
      studioId: member.studio._id,
      timelineId: provisional,
      kind: track.kind,
      name: track.name,
      orderIndex: trackIndex,
      metadata: track.metadata,
    });
    trackMap.set(track.id, trackId.toString());
    createdTrackIds.push(trackId.toString());
    const nextClips: ClipState[] = [];

    for (const [clipIndex, clip] of track.clips.entries()) {
      if (finishingV5Enabled() && !(options.preserveAudioTiming && clip.kind === 'AUDIO')) {
        const fps = finishingFps(state.metadata);
        clip.startSeconds = Math.round(clip.startSeconds * fps) / fps;
        clip.durationSeconds = Math.round(clip.durationSeconds * fps) / fps;
        if (clip.trimStartSeconds !== undefined) clip.trimStartSeconds = Math.round(clip.trimStartSeconds * fps) / fps;
        if (clip.trimEndSeconds !== undefined) clip.trimEndSeconds = (clip.trimStartSeconds ?? 0) + clip.durationSeconds;
      }
      const trimStart = clip.trimStartSeconds ?? 0;
      if (!Number.isFinite(clip.startSeconds) || clip.startSeconds < 0 || !Number.isFinite(clip.durationSeconds) || clip.durationSeconds <= 0 || clip.startSeconds + clip.durationSeconds > 60 || !Number.isFinite(trimStart) || trimStart < 0 || (clip.trimEndSeconds !== undefined && (!Number.isFinite(clip.trimEndSeconds) || clip.trimEndSeconds < trimStart + clip.durationSeconds - 0.000001))) throw new Error("Edited clip timing exceeds the supported source or 60-second composition.");
      const assetId = clip.assetId ? clip.assetId as Id<"assets"> : undefined;
      if (assetId) {
        const asset = await ctx.db.get(assetId);
        if (!asset || asset.studioExternalId !== member.studio.externalId || asset.projectId !== projectId || asset.scope === "GLOBAL" || asset.deletedAt) throw new Error("An edited clip references media outside this project.");
        const expectedMedia = ({ VIDEO: 'video/', IMAGE: 'image/', AUDIO: 'audio/' } as Record<string, string>)[clip.kind];
        if (expectedMedia && !asset.mimeType?.startsWith(expectedMedia)) throw new Error("Replacement media must match the clip's media type.");
        if (asset.durationSeconds !== undefined && (asset.mimeType?.startsWith("video/") || asset.mimeType?.startsWith("audio/")) && trimStart + clip.durationSeconds > asset.durationSeconds + 0.05) throw new Error("Edited clip extends beyond its source media.");
      }
      const shotVersionId = clip.shotVersionId ? clip.shotVersionId as Id<"shotVersions"> : undefined;
      if (shotVersionId) {
        const shotVersion = await ctx.db.get(shotVersionId);
        if (!shotVersion || shotVersion.studioExternalId !== member.studio.externalId || shotVersion.projectId !== projectId || shotVersion.productionId !== source.productionId || shotVersion.assetId !== assetId) throw new Error("An edited clip references a take outside this production or its media.");
      }
      const clipId = await ctx.db.insert("timelineClips", {
        studioExternalId: member.studio.externalId,
        studioId: member.studio._id,
        timelineId: provisional,
        trackId,
        assetId,
        shotVersionId,
        startSeconds: clip.startSeconds,
        durationSeconds: clip.durationSeconds,
        trimStartSeconds: clip.trimStartSeconds,
        trimEndSeconds: clip.trimEndSeconds,
        volume: clip.volume,
        transition: clip.transition,
        metadata: { ...clip.metadata, clipKind: clip.kind, orderIndex: clipIndex },
      });
      clipMap.set(clip.id, clipId.toString());
      createdClipIds.push(clipId.toString());
      nextClips.push({ ...clip, id: clipId.toString(), trackId: trackId.toString() });
      durationSeconds = Math.max(durationSeconds, clip.startSeconds + clip.durationSeconds);
    }
    normalizedTracks.push({ ...track, id: trackId.toString(), clips: nextClips });
  }

  const encoded = encodeState({ ...state, tracks: normalizedTracks }, timelineKey(sourceTimelineId), source.versionNumber, { tracks: trackMap, clips: clipMap });
  if (new TextEncoder().encode(JSON.stringify(encoded)).length > 512 * 1024) throw new Error('This edit is too large for one timeline. Split it into shorter components.');
  await ctx.db.patch(provisional, { durationSeconds, tracks: encoded, updatedAt: timestamp });
  return { timelineId: provisional, createdTrackIds, createdClipIds, durationSeconds };
}

async function insertOperation(
  ctx: MutationCtx,
  member: Awaited<ReturnType<typeof requireMember>>,
  timeline: Timeline,
  kind: string,
  idempotency: string,
  input: JsonRecord,
  outputResourceIds: string[],
  links: { undoOfId?: Id<"productionOperations">; redoOfId?: Id<"productionOperations"> } = {},
) {
  const timestamp = now();
  return await ctx.db.insert("productionOperations", {
    studioExternalId: member.studio.externalId,
    studioId: member.studio._id,
    productionId: timeline.productionId,
    kind,
    targetType: "timeline",
    targetId: timelineKey(timeline._id),
    targetVersionId: String(timeline.versionNumber),
    input,
    idempotencyKey: idempotency,
    status: "COMPLETED",
    actorUserId: member.user._id,
    actorExternalId: member.identity.externalId,
    outputResourceIds,
    ...links,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
  });
}

export const getDraft = query({
  args: { productionId: v.id("productions"), timelineId: v.optional(v.id("timelines")) },
  returns: v.union(v.null(), v.object({ timeline: v.any(), tracks: v.array(v.any()), metadata: v.any(), finishingV5Enabled: v.boolean(), operations: v.array(v.any()) })),
  handler: async (ctx, args) => {
    const production = await ctx.db.get(args.productionId);
    if (!production) throw new Error("Production not found.");
    if (!production.projectId) throw new Error("Production is not attached to a project.");
    await requireProjectAccess(ctx, production.projectId);
    const timeline = args.timelineId
      ? await ctx.db.get(args.timelineId)
      : (await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).order("desc").take(200)).find((candidate) => candidate.status === "DRAFT");
    if (!timeline) return null;
    if (timeline.productionId !== args.productionId || timeline.studioExternalId !== production.studioExternalId) throw new Error("Timeline does not belong to this production.");
    const state = await getTimelineState(ctx, timeline);
    const operations = await ctx.db.query("productionOperations").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).order("desc").take(200);
    return { timeline, ...state, finishingV5Enabled: finishingV5Enabled(), operations: operations.slice(0, 50) };
  },
});

export const apply = mutation({
  args: { timelineId: v.id("timelines"), kind: editKind, input: v.any(), idempotencyKey: v.string(), correlationId: v.optional(v.string()) },
  returns: v.object({ timelineId: v.id("timelines"), operationId: v.id("productionOperations"), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const key = idempotencyKey(args.idempotencyKey);
    const existing = await findOperationByKey(ctx, key);
    const { timeline, member, production } = await getTimelineForMember(ctx, args.timelineId);
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.productionId !== timeline.productionId) throw new Error("This idempotency key belongs to another operation.");
      return { timelineId: existing.outputResourceIds[0] as Id<"timelines">, operationId: existing._id, replayed: true };
    }
    if (args.input === undefined || args.input === null) throw new Error("Edit input is required.");
    if (new TextEncoder().encode(JSON.stringify(args.input)).length > 128 * 1024) throw new Error('This edit input is too large. Use shorter caption or timing edits.');
    await requireEditable(ctx, production.projectId!, "timeline", timeline._id.toString());
    assertEditable(timeline);
    const state = await getTimelineState(ctx, timeline);
    const before = JSON.stringify(state);
    const next = structuredClone(state);
    applyEdit(next, args.kind, args.input);
    ensureChanged(before, next);
    const draft = await persistDraft(ctx, timeline, next, member, timeline._id, production.projectId!);
    const operation = await insertOperation(ctx, member, timeline, args.kind.toUpperCase(), key, { editKind: args.kind, editInput: args.input, sourceTimelineId: timelineKey(timeline._id), createdTimelineId: timelineKey(draft.timelineId), correlationId: args.correlationId }, [timelineKey(draft.timelineId), ...draft.createdTrackIds, ...draft.createdClipIds]);
    return { timelineId: draft.timelineId, operationId: operation, replayed: false };
  },
});

async function lastOperationForTimeline(ctx: ReadCtx, timeline: Timeline, kinds: string[]) {
  const operations = await ctx.db.query("productionOperations").withIndex("by_production", (q) => q.eq("productionId", timeline.productionId)).order("desc").take(200);
  return operations.find((operation) => kinds.includes(operation.kind) && operation.outputResourceIds.includes(timelineKey(timeline._id))) ?? null;
}

export const undo = mutation({
  args: { timelineId: v.id("timelines"), idempotencyKey: v.string() },
  returns: v.object({ timelineId: v.id("timelines"), operationId: v.id("productionOperations"), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const key = idempotencyKey(args.idempotencyKey);
    const { timeline, member, production } = await getTimelineForMember(ctx, args.timelineId);
    const existing = await findOperationByKey(ctx, key);
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.productionId !== timeline.productionId) throw new Error("This idempotency key belongs to another operation.");
      return { timelineId: existing.outputResourceIds[0] as Id<"timelines">, operationId: existing._id, replayed: true };
    }
    await requireEditable(ctx, production.projectId!, "timeline", timeline._id.toString());
    assertEditable(timeline);
    const original = await lastOperationForTimeline(ctx, timeline, ["TRIM", "SPLIT", "REORDER", "REPLACE", "UPDATETEXT", "UPDATECAPTIONS", "ADJUSTAUDIO", "ADDTRANSITION", "APPLY_BEAT_CUTS", "UNDO", "REDO"]);
    if (!original) throw new Error("There is no completed edit to undo for this timeline.");
    const sourceTimelineId = optionalString(operationInput(original).sourceTimelineId, "Source timeline ID");
    if (!sourceTimelineId) throw new Error("The previous edit does not contain a recoverable source version.");
    const source = await ctx.db.get(sourceTimelineId as Id<"timelines">);
    if (!source || source.productionId !== timeline.productionId || source.studioExternalId !== member.studio.externalId) throw new Error("The previous timeline version is unavailable.");
    const state = await getTimelineState(ctx, source);
    const draft = await persistDraft(ctx, source, state, member, source._id, production.projectId!);
    const operation = await insertOperation(ctx, member, timeline, "UNDO", key, { sourceTimelineId: timelineKey(timeline._id), restoredTimelineId: timelineKey(source._id), createdTimelineId: timelineKey(draft.timelineId), originalOperationId: original._id.toString() }, [timelineKey(draft.timelineId), ...draft.createdTrackIds, ...draft.createdClipIds], { undoOfId: original._id });
    return { timelineId: draft.timelineId, operationId: operation, replayed: false };
  },
});

export const redo = mutation({
  args: { timelineId: v.id("timelines"), idempotencyKey: v.string() },
  returns: v.object({ timelineId: v.id("timelines"), operationId: v.id("productionOperations"), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const key = idempotencyKey(args.idempotencyKey);
    const { timeline, member, production } = await getTimelineForMember(ctx, args.timelineId);
    const existing = await findOperationByKey(ctx, key);
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.productionId !== timeline.productionId) throw new Error("This idempotency key belongs to another operation.");
      return { timelineId: existing.outputResourceIds[0] as Id<"timelines">, operationId: existing._id, replayed: true };
    }
    await requireEditable(ctx, production.projectId!, "timeline", timeline._id.toString());
    assertEditable(timeline);
    const undoOperation = await lastOperationForTimeline(ctx, timeline, ["UNDO"]);
    if (!undoOperation) throw new Error("There is no undone edit to redo for this timeline.");
    const originalOperationId = optionalString(operationInput(undoOperation).originalOperationId, "Original operation ID");
    if (!originalOperationId) throw new Error("The undone edit cannot be restored.");
    const original = await ctx.db.get(originalOperationId as Id<"productionOperations">);
    const editedTimelineId = original ? optionalString(operationInput(original).createdTimelineId, "Edited timeline ID") : undefined;
    if (!original || !editedTimelineId) throw new Error("The original edit version is unavailable.");
    const editedTimeline = await ctx.db.get(editedTimelineId as Id<"timelines">);
    if (!editedTimeline || editedTimeline.productionId !== timeline.productionId || editedTimeline.studioExternalId !== member.studio.externalId) throw new Error("The original edit version is unavailable.");
    const state = await getTimelineState(ctx, editedTimeline);
    const draft = await persistDraft(ctx, editedTimeline, state, member, editedTimeline._id, production.projectId!);
    const operation = await insertOperation(ctx, member, timeline, "REDO", key, { sourceTimelineId: timelineKey(timeline._id), restoredTimelineId: timelineKey(editedTimeline._id), createdTimelineId: timelineKey(draft.timelineId), originalOperationId: original._id.toString() }, [timelineKey(draft.timelineId), ...draft.createdTrackIds, ...draft.createdClipIds], { redoOfId: original._id });
    return { timelineId: draft.timelineId, operationId: operation, replayed: false };
  },
});

export const lockVersion = mutation({
  args: { timelineId: v.id("timelines"), idempotencyKey: v.string() },
  returns: v.object({ timelineId: v.id("timelines"), operationId: v.id("productionOperations"), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const key = idempotencyKey(args.idempotencyKey);
    const { timeline, member, production, resourceState } = await getTimelineForMember(ctx, args.timelineId);
    const existing = await findOperationByKey(ctx, key);
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.productionId !== timeline.productionId) throw new Error("This idempotency key belongs to another operation.");
      return { timelineId: args.timelineId, operationId: existing._id, replayed: true };
    }
    const status = timeline.status as string;
    const lockState = record(record(timeline.tracks).metadata).lockState;
    if (resourceState.currentState === "LOCKED" || status === "LOCKED" || lockState === "LOCKED") throw new Error("This timeline version is already locked.");
    if (resourceState.currentState !== "APPROVED") throw new Error("Approve the timeline before locking it.");
    if (timeline.status === "SUPERSEDED") throw new Error("A superseded timeline cannot be locked.");
    await transitionResourceState(ctx, {
      projectId: production.projectId!, productionId: production._id, resourceType: "timeline", resourceId: timeline._id.toString(),
      targetState: "LOCKED", roles: ["OWNER", "EDITOR"], decision: "LOCKED",
    });
    const payload = record(timeline.tracks);
    await ctx.db.patch(timeline._id, {
      // The current schema has no LOCKED literal. APPROVED is the existing
      // immutable terminal state; lockState preserves the more precise
      // editor meaning without changing schema.ts in this isolated phase.
      status: "APPROVED",
      tracks: { ...payload, metadata: { ...record(payload.metadata), lockState: "LOCKED" } },
      updatedAt: now(),
    });
    const operation = await insertOperation(ctx, member, timeline, "LOCK_VERSION", key, { sourceTimelineId: timelineKey(timeline._id), createdTimelineId: timelineKey(timeline._id) }, [timelineKey(timeline._id)]);
    return { timelineId: timeline._id, operationId: operation, replayed: false };
  },
});

const beatCutArgs = { timelineId: v.id('timelines'), analysisVersionId: v.id('beatAnalysisVersions'), audioClipId: v.string(), pictureTrackId: v.string(), beatIndices: v.optional(v.array(v.number())) };

async function beatCutContext(ctx: ReadCtx, args: { timelineId: Id<'timelines'>; analysisVersionId: Id<'beatAnalysisVersions'>; audioClipId: string; pictureTrackId: string; beatIndices?: number[] }) {
  if (process.env.FINALFRAME_BEAT_ANALYSIS_ENABLED !== 'true') throw new Error('Beat-aligned editing is not enabled yet.');
  const access = await getTimelineForMember(ctx, args.timelineId);
  if (access.timeline.status === 'SUPERSEDED' || !['DRAFT','REVISION_REQUESTED','APPROVED','LOCKED'].includes(access.resourceState.currentState)) throw new Error('Choose an editable or retained approved timeline for a new beat edit.');
  const state = await getTimelineState(ctx, access.timeline); const analysis = await ctx.db.get(args.analysisVersionId);
  if (!analysis || analysis.projectId !== access.production.projectId || !(analysis.origin === 'AUTO' && analysis.outcome === 'RELIABLE' && analysis.confidence >= 0.7 || analysis.origin === 'MANUAL' && analysis.outcome === 'MANUAL')) throw new Error('Choose a reliable automatic beat map or an explicitly reviewed manual version from this project.');
  const source = await approvedBeatSource(ctx, analysis.projectId, analysis.assetId);
  if (analysis.storageId !== source.storageId || analysis.sourceChecksum !== source.sourceChecksum || analysis.assetChecksum !== source.assetChecksum) throw new Error('The audio bytes changed after this analysis. Analyze the current source first.');
  const sourceManifest = !state.metadata.productionVersionId && access.timeline.manifestId ? await ctx.db.get(access.timeline.manifestId) : null;
  const boundVersion = state.metadata.productionVersionId ?? record(sourceManifest?.manifest).productionVersionId;
  if (!access.production.currentVersionId || boundVersion !== access.production.currentVersionId) throw new Error('Use a timeline from the current approved production version.');
  const version = await ctx.db.get(access.production.currentVersionId); if (!version || version.status !== 'APPROVED') throw new Error('Approve the current production before applying a beat edit.');
  const { clip: audio } = findClip(state, args.audioClipId);
  if (audio.kind !== 'AUDIO' || audio.assetId !== analysis.assetId) throw new Error('The selected soundtrack clip must use the exact analyzed project audio.');
  const fps = finishingFps(state.metadata);
  if ((audio.trimStartSeconds ?? 0) + audio.durationSeconds > analysis.durationSeconds + 1 / fps + 0.01) throw new Error('The soundtrack window extends beyond the measured source.');
  const pictureTrack = state.tracks.find(track => track.id === args.pictureTrackId);
  if (!pictureTrack || !pictureTrack.clips.length || pictureTrack.clips.some(clip => !['VIDEO','IMAGE','GRAPHIC'].includes(clip.kind))) throw new Error('Choose one ordered picture lane for the beat cut.');
  const pictures = pictureTrack.clips.slice().sort((a,b)=>a.startSeconds-b.startSeconds);
  for (const track of state.tracks) for (const clip of track.clips) {
    if (record(clip.transition).kind && record(clip.transition).kind !== 'CUT' || Object.values(record(clip.transition)).some(value=>record(value).kind&&record(value).kind!=='CUT')) throw new Error('Remove non-cut transitions before aligning picture cuts to a beat map.');
    const metadata = clip.metadata;
    if (clip.kind === 'CAPTIONS' || Array.isArray(record(metadata.captionTrack).cues) && (record(metadata.captionTrack).cues as unknown[]).length || metadata.captionId || metadata.captionTrackId || metadata.captionsId || Array.isArray(metadata.cues) && metadata.cues.length) throw new Error('Re-time captions explicitly after the beat edit; use a dedicated picture-and-soundtrack timeline first.');
    if (track !== pictureTrack && clip.startSeconds + clip.durationSeconds > audio.startSeconds + audio.durationSeconds + 0.000001) throw new Error('Other audio or overlays extend beyond this soundtrack. Revise them explicitly before applying cuts.');
  }
  for (const clip of pictures) {
    if (clip.assetId) {
      const asset = await ctx.db.get(clip.assetId as Id<'assets'>);
      if (!asset || asset.projectId !== analysis.projectId || asset.studioExternalId !== access.member.studio.externalId || asset.deletedAt || !asset.storageId || !asset.checksum || [asset.rights,asset.provenance,asset.moderation].some(value=>{const rights=record(value);return rights.approved===false||rights.consent===false||['DENIED','REJECTED','EXPIRED','REVOKED'].includes(String(rights.status??rights.state??'').toUpperCase());})) throw new Error('A picture source is unavailable or its rights changed.');
      await requireApprovedResource(ctx, analysis.projectId, 'asset', clip.assetId);
    }
    if (clip.shotVersionId) await requireApprovedResource(ctx, analysis.projectId, 'shotVersion', clip.shotVersionId, access.production._id);
  }
  const plan = planBeatCuts({ pictures, beatsSeconds: analysis.beatsSeconds, fps, audioStartSeconds: audio.startSeconds, audioDurationSeconds: audio.durationSeconds, audioTrimStartSeconds: audio.trimStartSeconds ?? 0, beatIndices: args.beatIndices });
  const hashInput = { sourceTimelineId: access.timeline._id, sourceVersionNumber: access.timeline.versionNumber, sourceUpdatedAt: access.timeline.updatedAt, analysisVersionId: analysis._id, sourceChecksum: source.sourceChecksum, audio, pictureTrackId: pictureTrack.id, plan };
  const planHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(hashInput))))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  return { ...access, state, analysis, source, plan, planHash, fps, pictureTrack };
}

export const previewBeatCuts = query({ args: beatCutArgs, returns: v.any(), handler: async(ctx,args)=>{
  const context=await beatCutContext(ctx,args);
  return {planHash:context.planHash,sourceTimelineId:context.timeline._id,sourceVersionNumber:context.timeline.versionNumber,analysisVersionId:context.analysis._id,origin:context.analysis.origin,confidence:context.analysis.confidence,fps:context.fps,...context.plan};
}});

export const applyBeatCuts = mutation({
  args: {...beatCutArgs,expectedPlanHash:v.string(),idempotencyKey:v.string()},returns:v.object({timelineId:v.id('timelines'),operationId:v.id('productionOperations'),replayed:v.boolean()}),
  handler:async(ctx,args)=>{
    const context=await beatCutContext(ctx,args);const key=idempotencyKey(args.idempotencyKey);const previous=await findOperationByKey(ctx,key);
    if(args.expectedPlanHash!==context.planHash)throw new Error('The beat plan changed. Preview the current source and map again.');
    if(previous){if(previous.kind!=='APPLY_BEAT_CUTS'||previous.productionId!==context.production._id||previous.targetId!==context.timeline._id||previous.actorUserId!==context.member.user._id||operationInput(previous).planHash!==args.expectedPlanHash)throw new Error('This beat-edit key belongs to another source, plan or user.');return {timelineId:previous.outputResourceIds[0] as Id<'timelines'>,operationId:previous._id,replayed:true};}
    const state=structuredClone(context.state);const track=state.tracks.find(candidate=>candidate.id===args.pictureTrackId)!;const byId=new Map(context.plan.clips.map(clip=>[clip.clipId,clip]));
    for(const clip of track.clips){const planned=byId.get(clip.id)!;clip.startSeconds=planned.startFrame/context.fps;clip.durationSeconds=planned.durationInFrames/context.fps;clip.trimEndSeconds=(clip.trimStartSeconds??0)+clip.durationSeconds;clip.transition=undefined;clip.metadata={...clip.metadata,rendererTiming:{fps:context.fps,startFrame:planned.startFrame,durationInFrames:planned.durationInFrames,trimStartInFrames:Math.round((clip.trimStartSeconds??0)*context.fps)}};delete clip.metadata.rendererOrderIndex;}
    state.metadata={...state.metadata,beatEdit:{analysisVersionId:context.analysis._id,sourceChecksum:context.source.sourceChecksum,sourceAudioClipId:args.audioClipId,sourcePictureTrackId:args.pictureTrackId,boundaryFrames:context.plan.boundaryFrames,beatIndices:context.plan.beatIndices,planHash:context.planHash}};
    const draft=await persistDraft(ctx,context.timeline,state,context.member,context.timeline._id,context.analysis.projectId,{preserveAudioTiming:true});
    const operation=await insertOperation(ctx,context.member,context.timeline,'APPLY_BEAT_CUTS',key,{sourceTimelineId:context.timeline._id,createdTimelineId:draft.timelineId,analysisVersionId:context.analysis._id,sourceChecksum:context.source.sourceChecksum,audioClipId:args.audioClipId,pictureTrackId:args.pictureTrackId,planHash:context.planHash,beatIndices:context.plan.beatIndices,boundaryFrames:context.plan.boundaryFrames},[draft.timelineId,...draft.createdTrackIds,...draft.createdClipIds]);
    return {timelineId:draft.timelineId,operationId:operation,replayed:false};
  },
});
