import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireMember } from "./authorization";

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
          kind: track.kind,
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
    const { clip } = findClip(state, clipId);
    const trimStart = optionalNumber(input.trimStartSeconds, "Trim start", 0) ?? clip.trimStartSeconds;
    const trimEnd = optionalNumber(input.trimEndSeconds, "Trim end", 0) ?? clip.trimEndSeconds;
    if (trimEnd !== undefined && trimStart !== undefined && trimEnd <= trimStart) throw new Error("Trim end must be after trim start.");
    const duration = optionalNumber(input.durationSeconds, "Duration", 0);
    if (duration !== undefined && duration <= 0) throw new Error("Trimmed duration must be greater than zero.");
    clip.trimStartSeconds = trimStart;
    clip.trimEndSeconds = trimEnd;
    if (duration !== undefined) clip.durationSeconds = duration;
    const start = optionalNumber(input.startSeconds, "Timeline start", 0);
    if (start !== undefined) clip.startSeconds = start;
    return state;
  }

  if (kind === "split") {
    if (!clipId) throw new Error("A clip ID is required for splitting.");
    const { track, clip } = findClip(state, clipId);
    const splitAt = optionalNumber(input.splitAtSeconds, "Split position", 0) ?? optionalNumber(input.atSeconds, "Split position", 0);
    if (splitAt === undefined || splitAt <= 0 || splitAt >= clip.durationSeconds) throw new Error("Split position must be inside the clip.");
    const first: ClipState = { ...clip, metadata: { ...clip.metadata, splitPart: 1 } };
    first.durationSeconds = splitAt;
    const second: ClipState = {
      ...clip,
      id: `${clip.id}:split:${splitAt}`,
      startSeconds: clip.startSeconds + splitAt,
      durationSeconds: clip.durationSeconds - splitAt,
      trimStartSeconds: clip.trimStartSeconds === undefined ? undefined : clip.trimStartSeconds + splitAt,
      metadata: { ...clip.metadata, splitPart: 2, splitFrom: clip.id },
    };
    track.clips.splice(track.clips.indexOf(clip), 1, first, second);
    return state;
  }

  if (kind === "reorder") {
    if (!clipId) throw new Error("A clip ID is required for reordering.");
    const { track, clip } = findClip(state, clipId);
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
    return state;
  }

  if (!clipId) throw new Error("A clip ID is required for this edit.");
  const { clip } = findClip(state, clipId);

  if (kind === "replace") {
    clip.assetId = stringValue(input.assetId, "Replacement asset ID");
    const shotVersionId = optionalString(input.shotVersionId, "Shot version ID");
    if (shotVersionId !== undefined) clip.shotVersionId = shotVersionId;
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
    clip.metadata = { ...clip.metadata, ...(captionTrackId ? { captionTrackId } : {}), ...(cues !== undefined ? { cues } : {}) };
    if (captionTrackId) clip.captionTrackId = captionTrackId;
    return state;
  }

  if (kind === "adjustAudio") {
    const volume = optionalNumber(input.volume, "Volume") ?? optionalNumber(input.volumeDb, "Volume") ?? clip.volume;
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
    const durationSeconds = numberValue(input.durationSeconds, "Transition duration");
    if (durationSeconds > clip.durationSeconds) throw new Error("Transition cannot be longer than the clip.");
    const transition = { kind: transitionKind, durationSeconds };
    const existing = record(clip.transition);
    clip.transition = { ...existing, [position]: transition };
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
  return { timeline, member };
}

async function getTimelineState(ctx: ReadCtx, timeline: Timeline): Promise<TimelineState> {
  const tracks = await ctx.db.query("timelineTracks").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).collect();
  const clips = await ctx.db.query("timelineClips").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).collect();
  return await loadState(ctx, timeline, tracks, clips);
}

async function findOperationByKey(ctx: ReadCtx, key: string): Promise<Operation | null> {
  const operations = await ctx.db.query("productionOperations").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key)).collect();
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
) {
  const timelines = await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", source.productionId)).collect();
  const timestamp = now();
  const versionNumber = Math.max(0, ...timelines.map((timeline) => timeline.versionNumber)) + 1;
  const provisional = await ctx.db.insert("timelines", {
    studioExternalId: member.studio.externalId,
    studioId: member.studio._id,
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
      const assetId = clip.assetId ? clip.assetId as Id<"assets"> : undefined;
      if (assetId) {
        const asset = await ctx.db.get(assetId);
        if (!asset || asset.studioExternalId !== member.studio.externalId) throw new Error("An edited clip references media outside this studio.");
      }
      const shotVersionId = clip.shotVersionId ? clip.shotVersionId as Id<"shotVersions"> : undefined;
      if (shotVersionId) {
        const shotVersion = await ctx.db.get(shotVersionId);
        if (!shotVersion || shotVersion.studioExternalId !== member.studio.externalId) throw new Error("An edited clip references a take outside this studio.");
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
        metadata: { ...clip.metadata, orderIndex: clipIndex },
      });
      clipMap.set(clip.id, clipId.toString());
      createdClipIds.push(clipId.toString());
      nextClips.push({ ...clip, id: clipId.toString(), trackId: trackId.toString() });
      durationSeconds = Math.max(durationSeconds, clip.startSeconds + clip.durationSeconds);
    }
    normalizedTracks.push({ ...track, id: trackId.toString(), clips: nextClips });
  }

  const encoded = encodeState({ ...state, tracks: normalizedTracks }, timelineKey(sourceTimelineId), source.versionNumber, { tracks: trackMap, clips: clipMap });
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
  handler: async (ctx, args) => {
    const production = await ctx.db.get(args.productionId);
    if (!production) throw new Error("Production not found.");
    await requireMember(ctx, production.studioExternalId);
    const timeline = args.timelineId
      ? await ctx.db.get(args.timelineId)
      : (await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).order("desc").collect()).find((candidate) => candidate.status === "DRAFT");
    if (!timeline) return null;
    if (timeline.productionId !== args.productionId || timeline.studioExternalId !== production.studioExternalId) throw new Error("Timeline does not belong to this production.");
    const state = await getTimelineState(ctx, timeline);
    const operations = await ctx.db.query("productionOperations").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).order("desc").collect();
    return { timeline, ...state, operations: operations.slice(0, 50) };
  },
});

export const apply = mutation({
  args: { timelineId: v.id("timelines"), kind: editKind, input: v.any(), idempotencyKey: v.string(), correlationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const key = idempotencyKey(args.idempotencyKey);
    const existing = await findOperationByKey(ctx, key);
    const { timeline, member } = await getTimelineForMember(ctx, args.timelineId);
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.productionId !== timeline.productionId) throw new Error("This idempotency key belongs to another operation.");
      return { timelineId: existing.outputResourceIds[0], operationId: existing._id, replayed: true };
    }
    if (args.input === undefined || args.input === null) throw new Error("Edit input is required.");
    assertEditable(timeline);
    const state = await getTimelineState(ctx, timeline);
    const before = JSON.stringify(state);
    const next = structuredClone(state);
    applyEdit(next, args.kind, args.input);
    ensureChanged(before, next);
    const draft = await persistDraft(ctx, timeline, next, member, timeline._id);
    const operation = await insertOperation(ctx, member, timeline, args.kind.toUpperCase(), key, { editKind: args.kind, editInput: args.input, sourceTimelineId: timelineKey(timeline._id), createdTimelineId: timelineKey(draft.timelineId), correlationId: args.correlationId }, [timelineKey(draft.timelineId), ...draft.createdTrackIds, ...draft.createdClipIds]);
    return { timelineId: draft.timelineId, operationId: operation, replayed: false };
  },
});

async function lastOperationForTimeline(ctx: ReadCtx, timeline: Timeline, kinds: string[]) {
  const operations = await ctx.db.query("productionOperations").withIndex("by_production", (q) => q.eq("productionId", timeline.productionId)).order("desc").collect();
  return operations.find((operation) => kinds.includes(operation.kind) && operation.outputResourceIds.includes(timelineKey(timeline._id))) ?? null;
}

export const undo = mutation({
  args: { timelineId: v.id("timelines"), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const key = idempotencyKey(args.idempotencyKey);
    const { timeline, member } = await getTimelineForMember(ctx, args.timelineId);
    const existing = await findOperationByKey(ctx, key);
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.productionId !== timeline.productionId) throw new Error("This idempotency key belongs to another operation.");
      return { timelineId: existing.outputResourceIds[0], operationId: existing._id, replayed: true };
    }
    assertEditable(timeline);
    const original = await lastOperationForTimeline(ctx, timeline, ["TRIM", "SPLIT", "REORDER", "REPLACE", "UPDATETEXT", "UPDATECAPTIONS", "ADJUSTAUDIO", "ADDTRANSITION", "UNDO", "REDO"]);
    if (!original) throw new Error("There is no completed edit to undo for this timeline.");
    const sourceTimelineId = optionalString(operationInput(original).sourceTimelineId, "Source timeline ID");
    if (!sourceTimelineId) throw new Error("The previous edit does not contain a recoverable source version.");
    const source = await ctx.db.get(sourceTimelineId as Id<"timelines">);
    if (!source || source.productionId !== timeline.productionId || source.studioExternalId !== member.studio.externalId) throw new Error("The previous timeline version is unavailable.");
    const state = await getTimelineState(ctx, source);
    const draft = await persistDraft(ctx, source, state, member, source._id);
    const operation = await insertOperation(ctx, member, timeline, "UNDO", key, { sourceTimelineId: timelineKey(timeline._id), restoredTimelineId: timelineKey(source._id), createdTimelineId: timelineKey(draft.timelineId), originalOperationId: original._id.toString() }, [timelineKey(draft.timelineId), ...draft.createdTrackIds, ...draft.createdClipIds], { undoOfId: original._id });
    return { timelineId: draft.timelineId, operationId: operation, replayed: false };
  },
});

export const redo = mutation({
  args: { timelineId: v.id("timelines"), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const key = idempotencyKey(args.idempotencyKey);
    const { timeline, member } = await getTimelineForMember(ctx, args.timelineId);
    const existing = await findOperationByKey(ctx, key);
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.productionId !== timeline.productionId) throw new Error("This idempotency key belongs to another operation.");
      return { timelineId: existing.outputResourceIds[0], operationId: existing._id, replayed: true };
    }
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
    const draft = await persistDraft(ctx, editedTimeline, state, member, editedTimeline._id);
    const operation = await insertOperation(ctx, member, timeline, "REDO", key, { sourceTimelineId: timelineKey(timeline._id), restoredTimelineId: timelineKey(editedTimeline._id), createdTimelineId: timelineKey(draft.timelineId), originalOperationId: original._id.toString() }, [timelineKey(draft.timelineId), ...draft.createdTrackIds, ...draft.createdClipIds], { redoOfId: original._id });
    return { timelineId: draft.timelineId, operationId: operation, replayed: false };
  },
});

export const lockVersion = mutation({
  args: { timelineId: v.id("timelines"), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const key = idempotencyKey(args.idempotencyKey);
    const { timeline, member } = await getTimelineForMember(ctx, args.timelineId);
    const existing = await findOperationByKey(ctx, key);
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.productionId !== timeline.productionId) throw new Error("This idempotency key belongs to another operation.");
      return { timelineId: args.timelineId, operationId: existing._id, replayed: true };
    }
    const status = timeline.status as string;
    const lockState = record(record(timeline.tracks).metadata).lockState;
    if (status === "LOCKED" || lockState === "LOCKED") throw new Error("This timeline version is already locked.");
    if (status === "APPROVED") throw new Error("An approved timeline cannot be locked again.");
    if (timeline.status === "SUPERSEDED") throw new Error("A superseded timeline cannot be locked.");
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
