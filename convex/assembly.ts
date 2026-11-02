import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireMember, requireProjectRole } from "./authorization";
import { getEffectiveResourceState, requireApprovedResource } from "./resourceStates";
import { getProduction, now } from "./_shared";
import { cropCaptionTrack, finishingV5Enabled, normalizeCaptionTrack } from './finishingContracts';
import { validateManifest } from '../renderer/src/manifest';
import { serializeCaptionSidecars } from '../renderer/src/captions';
import type { CaptionTrack } from '../renderer/src/types';
import { assertStoredRenderMediaType } from '../renderer/src/output-format';

type ReadCtx = QueryCtx | MutationCtx;
type Production = Doc<"productions">;
type Timeline = Doc<"timelines">;

type RenderPreset = { name: string; width: number; height: number; fps: number; codec: "h264" };
type SelectionScope = "FULL_PROJECT" | "TIMELINE" | "SCENES" | "SHOTS";

type SourceItem = {
  orderIndex: number;
  timelineClipId: string;
  trackId: string;
  trackKind: string;
  startSeconds: number;
  durationSeconds: number;
  trimStartSeconds?: number;
  volume?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  audioRole?: 'dialogue' | 'voiceover' | 'music' | 'ambience' | 'sfx';
  hasAudio?: boolean;
  assetId?: string;
  assetChecksum?: string;
  shotId?: string;
  sceneId?: string;
  shotVersionId?: string;
  shotVersionNumber?: number;
  captionId?: string;
  captionUpdatedAt?: number;
  audioId?: string;
  audioVersion?: number;
  sourceUrl?: string;
  graphicTemplateId?: string;
  graphicProps?: Record<string, unknown>;
  renderItem?: Record<string, unknown>;
  rendererTiming?: Record<string, unknown>;
  captionTracks?: CaptionTrack[];
  captionFps?: number;
  transitionOut?: Record<string, unknown>;
  transitionToClipId?: string;
  originalTimelineClipId?: string;
  originalDurationSeconds?: number;
  sourceKind: "MEDIA" | "GRAPHIC" | "TEXT" | "CAPTIONS";
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireSupportedClipEffects(clip: { transition?: unknown; metadata?: unknown }, v5 = process.env.FINALFRAME_MANIFEST_V5_ENABLED === 'true') {
  const metadata = record(clip.metadata);
  const transitions = record(clip.transition);
  if (v5 && (Array.isArray(metadata.cues) && metadata.cues.length || record(transitions.in).kind && record(transitions.in).kind !== 'CUT')) throw new Error('This timeline contains ambiguous legacy caption or incoming-transition data. Re-save the exact cues and outgoing transition in a new timeline before export.');
  if (!v5 && Object.values(transitions).some(value => record(value).kind && record(value).kind !== "CUT")) throw new Error("Non-cut transition export is not implemented. Create a revised timeline with cuts before exporting.");
  if (!v5 && (metadata.captionId || metadata.captionTrackId || metadata.captionsId || Array.isArray(metadata.cues) && metadata.cues.length || Array.isArray(record(metadata.captionTrack).cues) && (record(metadata.captionTrack).cues as unknown[]).length)) throw new Error("Caption authoring is not connected to canonical export. This assembly cannot silently omit captions.");
}

function stableHash(value: unknown) {
  const text = JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.keys(item).sort().reduce((out, key) => ({ ...out, [key]: item[key] }), {})
    : item);
  let hash = 2166136261;
  for (const character of text) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}

function timelineMetadata(timeline: Timeline) {
  return record(record(timeline.tracks).metadata);
}

function outputPreset(name: string, metadata: Record<string, unknown>): RenderPreset {
  const normalized = name.trim().toLowerCase();
  const dimensions = normalized.includes("1080x1920") || normalized.includes("9:16") || normalized.includes("vertical") || normalized.includes("tiktok") || normalized.includes("reel")
    ? { width: 1080, height: 1920 }
    : normalized.includes("1080x1080") || normalized.includes("1:1") || normalized.includes("square")
      ? { width: 1080, height: 1080 }
      : normalized.includes("1920x1080") || normalized.includes("16:9") || normalized.includes("landscape") || normalized.includes("youtube") || ["hd", "full_hd", "full-hd", "social"].includes(normalized)
        ? { width: 1920, height: 1080 }
        : null;
  const imported = record(metadata.importedOutput);
  const exactDimensions = Number.isInteger(imported.width) && Number.isInteger(imported.height) && Number(imported.width) > 0 && Number(imported.width) <= 7680 && Number(imported.height) > 0 && Number(imported.height) <= 4320 ? { width: Number(imported.width), height: Number(imported.height) } : dimensions;
  if (!exactDimensions) throw new Error(`Render preset “${name}” is not supported yet.`);
  if (imported.codec && imported.codec !== 'h264') throw new Error('This imported codec needs an explicit supported output conversion before re-export.');
  const fps = numberValue(metadata.fps) ?? 30;
  if (![24, 25, 30, 50, 60].includes(fps)) throw new Error(`Frame rate ${fps} is not supported for this export.`);
  return { name, ...exactDimensions, fps, codec: "h264" };
}

function hasDeniedRights(value: unknown) {
  const rights = record(value);
  const state = String(rights.status ?? rights.state ?? "").toUpperCase();
  return rights.approved === false || rights.consent === false || ["DENIED", "REJECTED", "EXPIRED", "REVOKED"].includes(state);
}

function hasReviewedTake(version: Doc<"shotVersions">, approvedTakeIds: Set<string>) {
  if (approvedTakeIds.has(version._id.toString())) return true;
  const context = record(version.contextSnapshot);
  const quality = String(context.qualityGateStatus ?? context.qualityStatus ?? "").toUpperCase();
  return context.reviewed === true || String(context.reviewStatus ?? "").toUpperCase() === "APPROVED" || ["PASS", "PASS_WITH_WARNINGS"].includes(quality);
}

async function authorizedTimeline(ctx: ReadCtx, production: Production, requestedId?: Id<"timelines">) {
  const candidates = requestedId
    ? [await ctx.db.get(requestedId)]
    : await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", production._id)).order("desc").take(200);
  const timeline = candidates.find((candidate) => candidate !== null && candidate.productionId === production._id && candidate.studioExternalId === production.studioExternalId);
  if (!timeline) throw new Error("Create a timeline version before assembling this video.");
  await requireMember(ctx, timeline.studioExternalId);
  if (!production.projectId) throw new Error("Production is not attached to a project.");
  const tracks = record(timeline.tracks);
  let boundVersion = stringValue(tracks.productionVersionId) ?? stringValue(record(tracks.metadata).productionVersionId);
  if (!boundVersion && timeline.manifestId) {
    const original = await ctx.db.get(timeline.manifestId);
    if (original?.productionId === production._id && original.projectId === production.projectId) boundVersion = stringValue(record(original.manifest).productionVersionId);
  }
  if (!boundVersion || boundVersion !== production.currentVersionId) throw new Error("Create a timeline for the current approved production version before assembly.");
  const approval = await requireApprovedResource(ctx, production.projectId, "timeline", timeline._id.toString(), production._id);
  if (approval.currentState !== "LOCKED") throw new Error("Lock the approved timeline before building its canonical manifest.");
  return timeline;
}

async function assertDependenciesAreCurrent(ctx: ReadCtx, production: Production, timeline: Timeline, sourceIds: Set<string>) {
  const dependencies = await ctx.db.query("productionDependencies").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
  const stale = dependencies.find((dependency) => dependency.state !== "ACTIVE" && (
    sourceIds.has(dependency.sourceId) || sourceIds.has(dependency.targetId) || sourceIds.has(String(dependency.sourceVersionId ?? "")) || sourceIds.has(String(dependency.targetVersionId ?? "")) || dependency.sourceId === timeline._id.toString() || dependency.targetId === timeline._id.toString()
  ));
  if (stale) throw new Error(`Assembly is blocked because a production dependency is ${stale.state.toLowerCase()}. Refresh the affected take first.`);
}

async function clipMatchesSelection(ctx: ReadCtx, clip: Doc<"timelineClips">, scope: SelectionScope, selectedIds: Set<string>) {
  if (scope === "FULL_PROJECT" || scope === "TIMELINE") return true;
  if (scope === "SHOTS") return Boolean(clip.shotVersionId && selectedIds.has(clip.shotVersionId.toString()));
  if (clip.shotVersionId) {
    const shotVersion = await ctx.db.get(clip.shotVersionId);
    const shot = shotVersion ? await ctx.db.get(shotVersion.shotId) : null;
    return Boolean(shot && selectedIds.has(shot.sceneId.toString()));
  }
  return selectedIds.has(String(record(clip.metadata).sceneId ?? ""));
}

/** Pack selected picture ranges and crop their soundtrack to the same edit. */
function scopeSourceItems(sources: SourceItem[], scope: SelectionScope): SourceItem[] {
  if (scope === "FULL_PROJECT" || scope === "TIMELINE") return sources;
  const ranges: Array<{ start: number; end: number; offset: number }> = [];
  for (const source of sources.filter(item => !["AUDIO", "CAPTIONS"].includes(item.trackKind.toUpperCase())).sort((a, b) => a.startSeconds - b.startSeconds)) {
    const last = ranges.at(-1);
    const end = source.startSeconds + source.durationSeconds;
    if (last && source.startSeconds <= last.end) last.end = Math.max(last.end, end);
    else ranges.push({ start: source.startSeconds, end, offset: 0 });
  }
  if (!ranges.length) throw new Error("The requested assembly selection contains no picture clips.");
  let offset = 0;
  for (const range of ranges) { range.offset = offset; offset += range.end - range.start; }
  const selected: SourceItem[] = [];
  for (const source of sources) {
    const sourceEnd = source.startSeconds + source.durationSeconds;
    const pieces = ranges.flatMap((range, index) => {
      const start = Math.max(range.start, source.startSeconds);
      const end = Math.min(range.end, sourceEnd);
      if (end <= start) return [];
      const croppedStart = start - source.startSeconds;
      const croppedEnd = sourceEnd - end;
      const fadeIn = source.fadeInSeconds ?? 0;
      const fadeOut = source.fadeOutSeconds ?? 0;
      // A partial ramp needs an envelope, which the current contract does not
      // represent. Reject it instead of changing the approved audio silently.
      if (source.trackKind.toUpperCase() === "AUDIO" && ((fadeIn > 0 && croppedStart > 0 && croppedStart < fadeIn) || (fadeIn > 0 && croppedStart === 0 && end - start < fadeIn) || (fadeOut > 0 && croppedEnd > 0 && croppedEnd < fadeOut) || (fadeOut > 0 && croppedEnd === 0 && end - start < fadeOut))) {
        throw new Error("This selection cuts through an audio fade. Create a dedicated approved timeline for the selection.");
      }
      const captions = source.captionTracks?.map(track => cropCaptionTrack(track, croppedStart, croppedStart + end - start, source.captionFps ?? 30));
      return [{ ...source, ...(captions ? { captionTracks: captions } : {}), originalTimelineClipId: source.originalTimelineClipId ?? source.timelineClipId, originalDurationSeconds: source.originalDurationSeconds ?? source.durationSeconds, timelineClipId: `${source.timelineClipId}:selection:${index}`, startSeconds: range.offset + start - range.start, durationSeconds: end - start, trimStartSeconds: (source.trimStartSeconds ?? 0) + croppedStart, fadeInSeconds: croppedStart === 0 ? source.fadeInSeconds : undefined, fadeOutSeconds: croppedEnd === 0 ? source.fadeOutSeconds : undefined }];
    });
    selected.push(...pieces);
  }
  return selected.sort((a, b) => a.startSeconds - b.startSeconds || a.orderIndex - b.orderIndex).map((source, orderIndex) => ({ ...source, orderIndex }));
}

async function buildSourceItems(ctx: ReadCtx, production: Production, timeline: Timeline, preset: RenderPreset, selectionScope: SelectionScope, selectedIds: Set<string>) {
  const tracks = await ctx.db.query("timelineTracks").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).take(501);
  const clips = (await ctx.db.query("timelineClips").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).take(501)).sort((a, b) => {
    const startOrder = a.startSeconds - b.startSeconds;
    if (startOrder !== 0) return startOrder;
    const aOrder = numberValue(record(a.metadata).orderIndex) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = numberValue(record(b.metadata).orderIndex) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || a._id.toString().localeCompare(b._id.toString());
  });
  if (tracks.length > 500 || clips.length > 500) throw new Error('This timeline exceeds the bounded finishing graph. Split it into shorter components.');
  const selectedClips: Doc<"timelineClips">[] = [];
  for (const clip of clips) if (await clipMatchesSelection(ctx, clip, selectionScope, selectedIds) || tracks.some(track => track._id === clip.trackId && ["AUDIO", "CAPTIONS"].includes(track.kind.toUpperCase()))) selectedClips.push(clip);
  if (!selectedClips.length) throw new Error("The requested assembly selection contains no timeline clips.");
  const transitionTargets = new Map<string, string>();
  for (const track of tracks) {
    const lane = clips.filter(clip => clip.trackId === track._id);
    for (let index = 0; index < lane.length; index++) {
      const out = record(record(lane[index].transition).out);
      if (!out.kind || out.kind === 'CUT') continue;
      const to = lane[index + 1];
      if (!to) throw new Error('A transition is missing its adjacent picture clip.');
      transitionTargets.set(lane[index]._id, to._id);
      if (selectedClips.includes(lane[index]) !== selectedClips.includes(to)) throw new Error('This selection includes only part of a transition. Select both adjacent clips or create a dedicated cut timeline.');
    }
  }

  const timelineMeta = timelineMetadata(timeline);
  const approvedTakeIds = new Set((Array.isArray(timelineMeta.approvedShotVersionIds) ? timelineMeta.approvedShotVersionIds : []).map(String));
  const sourceIds = new Set<string>([timeline._id.toString(), production.currentVersionId?.toString() ?? ""]);
  const sources: SourceItem[] = [];
  const trackEnds = new Map<string, number>();

  for (const [orderIndex, clip] of selectedClips.entries()) {
    requireSupportedClipEffects(clip);
    const track = tracks.find((candidate) => candidate._id === clip.trackId);
    if (!track) throw new Error("Assembly is blocked because a timeline track is missing.");
    const start = numberValue(clip.startSeconds);
    const duration = numberValue(clip.durationSeconds);
    if (start === undefined || duration === undefined || start < 0 || duration <= 0) throw new Error("Assembly is blocked by an invalid clip duration or start time.");
    const previousEnd = trackEnds.get(clip.trackId.toString()) ?? 0;
    const clipKind = stringValue(record(clip.metadata).clipKind) ?? track.kind.toUpperCase();
    if (start < previousEnd - 0.000001 && (!finishingV5Enabled() || ['AUDIO', 'CAPTIONS'].includes(clipKind))) throw new Error("Assembly is blocked because timeline clips overlap.");
    trackEnds.set(clip.trackId.toString(), start + duration);
    sourceIds.add(clip._id.toString());

    const clipMeta = record(clip.metadata);
    const audioSettings = record(clipMeta.audio);
    const audioRole = stringValue(clipMeta.audioRole);
    const source: SourceItem = {
      orderIndex: finishingV5Enabled() ? orderIndex : numberValue(clipMeta.rendererOrderIndex) ?? orderIndex,
      timelineClipId: clip._id.toString(),
      trackId: clip.trackId.toString(),
      trackKind: clipKind,
      startSeconds: start,
      durationSeconds: duration,
      trimStartSeconds: numberValue(clip.trimStartSeconds),
      volume: audioSettings.muted === true ? 0 : numberValue(clip.volume),
      fadeInSeconds: numberValue(audioSettings.fadeInSeconds),
      fadeOutSeconds: numberValue(audioSettings.fadeOutSeconds),
      audioRole: ['dialogue', 'voiceover', 'music', 'ambience', 'sfx'].includes(audioRole ?? '') ? audioRole as SourceItem['audioRole'] : 'music',
      sourceKind: clipKind === "GRAPHIC" ? "GRAPHIC" : clipKind === "TEXT" ? "TEXT" : clipKind === 'CAPTIONS' ? 'CAPTIONS' : "MEDIA",
      graphicTemplateId: stringValue(clipMeta.motionTemplateId ?? clipMeta.templateId),
      graphicProps: record(clipMeta.templateProps ?? clipMeta.props),
      renderItem: record(clipMeta.renderItem), rendererTiming: record(clipMeta.rendererTiming),
      transitionOut: record(record(clip.transition).out), transitionToClipId: transitionTargets.get(clip._id),
    };
    const inlineCaption = record(clipMeta.captionTrack);
    if (Array.isArray(inlineCaption.cues)) { source.captionTracks = [normalizeCaptionTrack(inlineCaption, duration, preset.fps, `${clip._id}:captions`)]; source.captionFps = preset.fps; }

    if (clip.assetId) {
      const asset = await ctx.db.get(clip.assetId);
      if (!asset || asset.studioExternalId !== production.studioExternalId || asset.deletedAt || !asset.storageId) throw new Error("Assembly is blocked because a timeline media source is missing or unauthorized.");
      if (!production.projectId || asset.projectId !== production.projectId || asset.scope === "GLOBAL") throw new Error("Assembly is blocked because a media source is outside this project.");
      await requireApprovedResource(ctx, production.projectId, "asset", asset._id.toString());
      if (!asset.checksum) throw new Error(`Media “${asset.name ?? asset._id}” has no checksum and cannot be exported safely.`);
      if (hasDeniedRights(asset.rights) || hasDeniedRights(asset.provenance)) throw new Error(`Media “${asset.name ?? asset._id}” is missing rights or consent approval.`);
      const sourceUrl = await ctx.storage.getUrl(asset.storageId);
      if (!sourceUrl) throw new Error(`Media “${asset.name ?? asset._id}” is no longer available in canonical storage.`);
      source.assetId = asset._id.toString();
      source.assetChecksum = asset.checksum;
      source.hasAudio = record(record(asset.metadata).technicalProbe).hasAudio === true;
      source.sourceUrl = sourceUrl;
      sourceIds.add(asset._id.toString());
    } else if (source.sourceKind === "MEDIA") {
      throw new Error("Assembly is blocked because a media clip has no source asset.");
    }

    if (clip.shotVersionId) {
      const shotVersion = await ctx.db.get(clip.shotVersionId);
      if (!shotVersion || shotVersion.productionId !== production._id || shotVersion.studioExternalId !== production.studioExternalId || shotVersion.status !== "COMPLETED") throw new Error("Assembly is blocked because a take failed or is incomplete.");
      if (!production.projectId) throw new Error("Production is not attached to a project.");
      await requireApprovedResource(ctx, production.projectId, "shotVersion", shotVersion._id.toString(), production._id);
      const shot = await ctx.db.get(shotVersion.shotId);
      const scene = shot ? await ctx.db.get(shot.sceneId) : null;
      const sequence = scene ? await ctx.db.get(scene.sequenceId) : null;
      if (!shot || !scene || !sequence || sequence.productionVersionId !== production.currentVersionId) throw new Error("Assembly is blocked because a take belongs to an outdated production version.");
      const approvals = await ctx.db.query("approvals").withIndex("by_resource", (q) => q.eq("resourceType", "shotVersion").eq("resourceId", shotVersion._id.toString())).collect();
      if (!hasReviewedTake(shotVersion, approvedTakeIds) && !approvals.some((approval) => approval.productionId === production._id && String(approval.decision).toUpperCase() === "APPROVED")) throw new Error("Assembly is blocked until every selected take has been reviewed and approved.");
      source.shotId = shot._id.toString();
      source.sceneId = scene._id.toString();
      source.shotVersionId = shotVersion._id.toString();
      source.shotVersionNumber = shotVersion.versionNumber;
      sourceIds.add(shot._id.toString());
      sourceIds.add(shotVersion._id.toString());
    }

    const captionId = stringValue(clipMeta.captionId ?? clipMeta.captionTrackId ?? clipMeta.captionsId);
    if (captionId) {
      const caption = await ctx.db.get(captionId as Id<"captions">);
      if (!caption || caption.studioExternalId !== production.studioExternalId || caption.productionId !== production._id || ["FAILED", "REJECTED"].includes(String(caption.status))) throw new Error("Assembly is blocked because the selected caption version is unavailable.");
      await requireApprovedResource(ctx, production.projectId!, 'caption', caption._id, production._id);
      source.captionId = caption._id.toString();
      source.captionUpdatedAt = caption.updatedAt ?? caption.createdAt;
      source.captionTracks = [normalizeCaptionTrack({ language: caption.language, style: caption.style ?? {}, cues: caption.cues }, duration, preset.fps, `${clip._id}:captions`)];
      source.captionFps = preset.fps;
      sourceIds.add(caption._id.toString());
    }

    const audioId = stringValue(clipMeta.audioId ?? clipMeta.audioTrackId);
    if (audioId) {
      const audio = await ctx.db.get(audioId as Id<"audio">);
      if (!audio || audio.studioExternalId !== production.studioExternalId || audio.productionId !== production._id || !audio.assetId) throw new Error("Assembly is blocked because the selected audio version is unavailable.");
      const audioAsset = await ctx.db.get(audio.assetId);
      if (!audioAsset || audioAsset.studioExternalId !== production.studioExternalId || !audioAsset.storageId || !audioAsset.checksum || hasDeniedRights(audioAsset.rights)) throw new Error("Assembly is blocked because the selected audio has missing rights or canonical media.");
      if (!production.projectId || audioAsset.projectId !== production.projectId || audioAsset.scope === "GLOBAL") throw new Error("Assembly is blocked because the selected audio is outside this project.");
      const audioUrl = await ctx.storage.getUrl(audioAsset.storageId);
      if (!audioUrl) throw new Error("Assembly is blocked because the selected audio is no longer available in canonical storage.");
      source.audioId = audio._id.toString();
      source.audioVersion = audio.updatedAt ?? audio.createdAt;
      source.assetId = audioAsset._id.toString();
      source.assetChecksum = audioAsset.checksum;
      source.sourceUrl = audioUrl;
      sourceIds.add(audio._id.toString());
      sourceIds.add(audio.assetId.toString());
    }
    sources.push(source);
  }

  await assertDependenciesAreCurrent(ctx, production, timeline, sourceIds);
  const scopedSources = scopeSourceItems(sources, selectionScope);
  const end = Math.max(...scopedSources.map(source => source.startSeconds + source.durationSeconds), ['FULL_PROJECT', 'TIMELINE'].includes(selectionScope) ? timeline.durationSeconds : 0);
  const durationInFrames = Math.max(1, finishingV5Enabled() ? Math.round(end * preset.fps) : Math.ceil(end * preset.fps));
  if (scopedSources.length > 200) throw new Error('This export exceeds the configured 200-source worker limit. Use shorter approved components.');
  return { sources: scopedSources, sourceIds, durationInFrames, tracks };
}

function sourceFrame(source: SourceItem, key: string, seconds: number, fps: number, mode: 'floor' | 'ceil' | 'round'): number {
  const exact = source.rendererTiming;
  return exact?.fps === fps && typeof exact[key] === 'number' && Math.abs(Number(exact[key]) / fps - seconds) < 0.000001 ? Number(exact[key]) : Math[mode](seconds * fps);
}

function rendererItems(sources: SourceItem[], fps: number, version = 4) {
  return sources.filter((source) => !["AUDIO", "CAPTIONS"].includes(source.trackKind.toUpperCase())).map((source) => {
    const startFrame = Math.max(0, sourceFrame(source, 'startFrame', source.startSeconds, fps, version === 5 ? 'round' : 'floor'));
    const durationInFrames = Math.max(1, sourceFrame(source, 'durationInFrames', source.durationSeconds, fps, version === 5 ? 'round' : 'ceil'));
    const base = { id: source.timelineClipId, startFrame, durationInFrames, orderIndex: source.orderIndex, shotId: source.shotId, shotVersionId: source.shotVersionId, assetId: source.assetId, ...(version === 5 ? { trackId: source.trackId } : {}), ...(source.renderItem?.opacity !== undefined ? { opacity: Number(source.renderItem.opacity) } : {}) };
    if (source.sourceKind === "GRAPHIC" || source.sourceKind === "TEXT") {
      const supportedTemplates = ["kinetic-title", "brand-card", "feature-callout", "end-card"];
      const requestedTemplate = source.graphicTemplateId;
      const templateId = requestedTemplate && supportedTemplates.includes(requestedTemplate) ? requestedTemplate : "kinetic-title";
      const props = { ...(source.graphicProps ?? {}) };
      delete props.logoUrl;
      if (source.sourceUrl && source.assetId) props.logoUrl = source.sourceUrl;
      if (typeof props.title !== "string") props.title = typeof props.text === "string" ? props.text : "";
      if (templateId === "feature-callout" && typeof props.feature !== "string") props.feature = props.title;
      return { ...base, kind: "motion-graphics" as const, templateId, props };
    }
    if (!source.sourceUrl) throw new Error("Assembly is blocked because a media source has no canonical URL.");
    if (source.trackKind.toUpperCase() === "IMAGE") return { ...base, kind: "image" as const, src: source.sourceUrl, ...(source.renderItem?.fit ? { fit: String(source.renderItem.fit) } : {}), ...(source.renderItem?.position ? { position: String(source.renderItem.position) } : {}) };
    return { ...base, kind: "video" as const, src: source.sourceUrl, trimStartInFrames: Math.max(0, sourceFrame(source, 'trimStartInFrames', source.trimStartSeconds ?? 0, fps, version === 5 ? 'round' : 'floor')), volume: source.volume ?? 1 };
  });
}

function rendererAudioTracks(sources: SourceItem[], fps: number, version = 4) {
  return sources.filter((source) => source.trackKind.toUpperCase() === "AUDIO" && source.sourceUrl).map((source) => ({
    id: version === 5 ? source.timelineClipId : source.audioId ?? source.timelineClipId,
    ...(version === 5 ? { trackId: source.trackId } : {}),
    src: source.sourceUrl as string,
    startFrame: Math.max(0, version === 5 || source.rendererTiming ? sourceFrame(source, "startFrame", source.startSeconds, fps, version === 5 ? "round" : "floor") : Math.floor(source.startSeconds * fps)),
    durationInFrames: Math.max(1, version === 5 || source.rendererTiming ? sourceFrame(source, "durationInFrames", source.durationSeconds, fps, version === 5 ? "round" : "ceil") : Math.ceil(source.durationSeconds * fps)),
    trimStartInFrames: Math.max(0, version === 5 || source.rendererTiming ? sourceFrame(source, "trimStartInFrames", source.trimStartSeconds ?? 0, fps, version === 5 ? "round" : "floor") : Math.floor((source.trimStartSeconds ?? 0) * fps)),
    volume: source.volume ?? 1,
    fadeInFrames: Math.max(0, Math[version === 5 ? 'round' : 'floor']((source.fadeInSeconds ?? 0) * fps)),
    fadeOutFrames: Math.max(0, Math[version === 5 ? 'round' : 'floor']((source.fadeOutSeconds ?? 0) * fps)),
    role: source.audioRole ?? 'music',
  }));
}

function rendererCaptionTracks(sources: SourceItem[], fps: number): CaptionTrack[] {
  return sources.flatMap(source => (source.captionTracks ?? []).flatMap((track, index) => track.cues.length ? [{ ...track, id: `${source.timelineClipId}:caption:${index}`, cues: track.cues.map(cue => ({ ...cue, startFrame: Math.round(source.startSeconds * fps) + cue.startFrame })) }] : []));
}

function rendererTransitions(sources: SourceItem[], fps: number) {
  return sources.flatMap(source => {
    const out = source.transitionOut;
    if (!out?.kind || out.kind === 'CUT') return [];
    const candidates = sources.filter(candidate => (candidate.originalTimelineClipId ?? candidate.timelineClipId) === source.transitionToClipId);
    if (candidates.length !== 1 || source.originalDurationSeconds !== undefined && Math.abs(source.durationSeconds - source.originalDurationSeconds) > 0.000001 || candidates[0].originalDurationSeconds !== undefined && Math.abs(candidates[0].durationSeconds - candidates[0].originalDurationSeconds) > 0.000001) throw new Error('This selection cuts through part of a transition. Create a dedicated approved cut timeline.');
    return [{ id: `${source.timelineClipId}:transition`, fromItemId: source.timelineClipId, toItemId: candidates[0].timelineClipId, kind: out.kind, durationInFrames: Math.round(Number(out.durationSeconds) * fps), audioPolicy: out.audioPolicy ?? 'PRESERVE' }];
  });
}

function rendererOutputAudio(sources: SourceItem[]) {
  return sources.some(source => source.volume !== 0 && (source.trackKind.toUpperCase() === "AUDIO" || source.trackKind.toUpperCase() === "VIDEO" && source.hasAudio))
    ? { sampleRate: 48000 as const, channels: 2 as const }
    : undefined;
}

export const createJob = mutation({
  args: { productionId: v.id("productions"), timelineId: v.optional(v.id("timelines")), idempotencyKey: v.optional(v.string()), selectionScope: v.optional(v.union(v.literal("FULL_PROJECT"), v.literal("TIMELINE"), v.literal("SCENES"), v.literal("SHOTS"))), selectedSceneIds: v.optional(v.array(v.id("scenes"))), shotVersionIds: v.optional(v.array(v.id("shotVersions"))), confirmOlderVersions: v.optional(v.boolean()), correlationId: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const production = await getProduction(ctx, args.productionId.toString());
    await requireMember(ctx, production.studioExternalId);
    const projectId = production.projectId;
    if (!projectId) throw new Error("Production is not attached to a project.");
    await requireProjectRole(ctx, projectId, ["OWNER", "EDITOR"]);
    const timeline = await authorizedTimeline(ctx, production, args.timelineId);
    const timelineState = await getEffectiveResourceState(ctx, projectId, "timeline", timeline._id.toString(), production._id);
    const preset = outputPreset(timeline.outputPreset || production.outputPreset, timelineMetadata(timeline));
    const selectionScope: SelectionScope = args.selectionScope ?? (args.shotVersionIds?.length ? "SHOTS" : args.selectedSceneIds?.length ? "SCENES" : "FULL_PROJECT");
    const selectedIds = new Set<string>(selectionScope === "SHOTS" ? (args.shotVersionIds ?? []).map(String) : selectionScope === "SCENES" ? (args.selectedSceneIds ?? []).map(String) : []);
    if ((selectionScope === "SHOTS" || selectionScope === "SCENES") && selectedIds.size === 0) throw new Error(`A ${selectionScope.toLowerCase()} assembly requires selected IDs.`);
    const idempotencyKey = args.idempotencyKey?.trim() || `assembly:${production._id}:${timeline._id}:${selectionScope}:${[...selectedIds].sort().join(",") || "all"}`;
    const existingManifest = (await ctx.db.query("manifests").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).find((manifest) => {
      const manifestData = record(manifest.manifest);
      return [4, 5].includes(Number(manifestData.version)) && manifestData.idempotencyKey === idempotencyKey && manifestData.timelineId === timeline._id.toString();
    });
    if (existingManifest) {
      const legacy = (await ctx.db.query("assemblyJobs").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).find((job) => record(job.manifest).manifestId === existingManifest._id.toString());
      return { jobId: legacy?._id, manifestId: existingManifest._id, manifest: existingManifest.manifest };
    }

    const built = await buildSourceItems(ctx, production, timeline, preset, selectionScope, selectedIds);
    const olderSources: string[] = [];
    for (const source of built.sources) {
      if (!source.shotId || !source.shotVersionId) continue;
      const versions = await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", source.shotId as Id<"shots">)).collect();
      const latest = versions.reduce((current, candidate) => !current || candidate.versionNumber > current.versionNumber ? candidate : current, null as Doc<"shotVersions"> | null);
      if (latest && latest._id.toString() !== source.shotVersionId && latest.versionNumber > (source.shotVersionNumber ?? 0)) olderSources.push(source.shotVersionId);
    }
    if (olderSources.length > 0 && args.confirmOlderVersions !== true) {
      throw new Error("This timeline keeps an older take. Confirm older version use before assembling the video.");
    }
    const timestamp = now();
    const previous = await ctx.db.query("manifests").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    const version = finishingV5Enabled() ? 5 : 4;
    const items = rendererItems(built.sources, preset.fps, version);
    const audioTracks = rendererAudioTracks(built.sources, preset.fps, version);
    const itemById = new Map(items.map(item => [item.id, item]));
    const shots = built.sources.filter((source) => source.shotId && source.shotVersionId && source.assetId && source.sourceUrl).map((source) => ({ shotId: source.shotId as string, shotVersionId: source.shotVersionId as string, assetId: source.assetId as string, orderIndex: source.orderIndex, itemId: source.timelineClipId, startFrame: itemById.get(source.timelineClipId)!.startFrame, durationInFrames: itemById.get(source.timelineClipId)!.durationInFrames, src: source.sourceUrl as string }));
    const manifestPayload = {
      kind: "finalframe.render-manifest",
      version,
      manifestId: `assembly:${production._id.toString()}:${previous.length + 1}`,
      projectId: projectId.toString(),
      productionId: production._id.toString(),
      productionVersionId: production.currentVersionId?.toString(),
      timelineId: timeline._id.toString(),
      timelineVersionNumber: timeline.versionNumber,
      rendererVersion: "finalframe-renderer-v1",
      idempotencyKey,
      correlationId: args.correlationId,
      selection: { scope: selectionScope, ids: [...selectedIds].sort() },
      export: { scope: selectionScope, format: "MP4" },
      metadata: timelineState.currentState === "LOCKED" ? { lockState: "LOCKED", lockId: timeline._id.toString(), lockedAt: new Date(timelineState.state?.lockedAt ?? timestamp).toISOString(), lockedBy: timelineState.state?.lockedByUserId?.toString() ?? "FinalFrame" } : { lockState: "APPROVED" },
      preset,
      output: { width: preset.width, height: preset.height, fps: preset.fps, durationInFrames: built.durationInFrames, codec: preset.codec, audio: rendererOutputAudio(built.sources) },
      totalDurationSeconds: built.durationInFrames / preset.fps,
      items,
      audioTracks,
      ...(version === 5 ? { tracks: built.tracks.map(track => ({ id: track._id.toString(), kind: track.kind === 'TEXT' ? 'GRAPHIC' : track.kind, orderIndex: track.orderIndex, ...(track.name ? { name: track.name } : {}) })), captionTracks: rendererCaptionTracks(built.sources, preset.fps), transitions: rendererTransitions(built.sources, preset.fps) } : {}),
      shots,
      sourceIds: [...built.sourceIds],
      sourceChecksums: built.sources.flatMap((source) => source.assetChecksum ? [source.assetChecksum] : []),
      sources: built.sources,
      createdAt: timestamp,
    };
    const validated = validateManifest(manifestPayload);
    if (!validated.ok) throw new Error(`The approved timeline cannot be exported: ${validated.issues.slice(0, 3).map(issue => issue.message).join('; ')}`);
    if (new TextEncoder().encode(JSON.stringify(manifestPayload)).length > 900 * 1024) throw new Error('This export manifest is too large. Use shorter approved components.');
    const manifestId = await ctx.db.insert("manifests", { studioExternalId: production.studioExternalId, studioId: production.studioId, projectId, productionId: production._id, timelineId: timeline._id, contractVersion: version, selectionScope, exportScope: selectionScope, selectionIds: [...selectedIds].sort(), versionNumber: previous.length + 1, manifest: manifestPayload, sourceHashes: [stableHash({ timelineId: timeline._id, sources: built.sources, items, selectionScope, selectedIds: [...selectedIds].sort(), preset })], rendererVersion: "finalframe-renderer-v1", createdAt: timestamp });
    const persistedPayload = { ...manifestPayload, manifestId: manifestId.toString() };
    await ctx.db.patch(manifestId, { manifest: persistedPayload });
    const jobId = await ctx.db.insert("assemblyJobs", { projectId, productionId: production._id, manifestId, selectionScope, exportScope: selectionScope, idempotencyKey, progress: 100, status: "QUEUED", manifest: persistedPayload, correlationId: args.correlationId, createdAt: timestamp, updatedAt: timestamp });
    return { jobId, manifestId, manifest: persistedPayload };
  },
});

export const getManifest = query({
  args: { manifestId: v.id("manifests") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest) throw new Error("Assembly manifest not found.");
    await requireMember(ctx, manifest.studioExternalId);
    if (manifest.projectId) await requireProjectRole(ctx, manifest.projectId, ["OWNER", "EDITOR", "REVIEWER", "VIEWER"]);
    return manifest;
  },
});

export const captionSidecars = query({
  args: { manifestId: v.id('manifests'), exportId: v.optional(v.id('exports')) },
  returns: v.array(v.object({ trackId: v.string(), language: v.string(), srt: v.string(), vtt: v.string() })),
  handler: async (ctx, args) => {
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest?.projectId) throw new Error('Choose a completed project export.');
    await requireProjectRole(ctx, manifest.projectId, ['OWNER', 'EDITOR', 'REVIEWER', 'VIEWER']);
    const production = await ctx.db.get(manifest.productionId);
    if (!production || production.projectId !== manifest.projectId) throw new Error('This export does not belong to the project.');
    const record = args.exportId ? await ctx.db.get(args.exportId) : (await ctx.db.query('exports').withIndex('by_production', q => q.eq('productionId', manifest.productionId)).order('desc').take(200)).find(row => row.manifestId === manifest._id && row.status === 'COMPLETED');
    if (!record || record.manifestId !== manifest._id || record.projectId !== manifest.projectId || record.productionId !== manifest.productionId || record.status !== 'COMPLETED' || !record.storageId || !record.renderJobId) throw new Error('Captions are downloadable only for this exact completed export.');
    const job = await ctx.db.get(record.renderJobId);
    const storage = await ctx.db.system.get('_storage', record.storageId);
    if (!job || job.status !== 'COMPLETED' || job.projectId !== manifest.projectId || job.manifestId !== manifest._id || !storage || storage.size < 1 || !storage.contentType?.startsWith('video/')) throw new Error('The verified video for these captions is unavailable.');
    const payload = manifest.manifest as import('../renderer/src/types').RenderManifest;
    if (!validateManifest(payload).ok || ![4, 5].includes(payload.version) || payload.version !== manifest.contractVersion || payload.projectId !== manifest.projectId || payload.productionId !== manifest.productionId || payload.manifestId !== manifest._id) throw new Error('This caption manifest is unavailable.');
    assertStoredRenderMediaType(payload, manifest.contractVersion, storage.contentType, record.mimeType);
    return (payload.captionTracks ?? []).map(track => ({ trackId: track.id, language: track.language, ...serializeCaptionSidecars(track, payload.output.fps) }));
  },
});
