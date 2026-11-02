import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireProjectAccess, requireProjectRole } from "./authorization";
import { now } from "./_shared";
import { ensureResourceState, requireApprovedResource } from "./resourceStates";

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export const createVersion = mutation({
  args: { productionId: v.id("productions"), manifestId: v.id("manifests"), outputPreset: v.optional(v.string()), idempotencyKey: v.optional(v.string()), metadata: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest || manifest.productionId !== args.productionId) throw new Error("Manifest not found.");
    if (!manifest.projectId) throw new Error("Manifest is not attached to a project.");
    const member = await requireProjectRole(ctx, manifest.projectId, ["OWNER", "EDITOR"]);
    const production = await ctx.db.get(args.productionId);
    if (!production || production.projectId !== manifest.projectId || production.studioExternalId !== member.studio.externalId) throw new Error("Manifest project ownership does not match the production.");
    const payload = object(manifest.manifest);
    if (payload.version !== 4 || manifest.contractVersion !== 4) throw new Error("Only canonical manifest v4 can create new timeline versions.");
    const projectId = manifest.projectId;
    if (!projectId) throw new Error("Manifest is not attached to a project.");
    const idempotencyKey = args.idempotencyKey?.trim() || `timeline:${args.manifestId}`;
    const existing = (await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).order("desc").take(200)).find((timeline) => object(timeline.tracks).idempotencyKey === idempotencyKey);
    if (existing) return existing;
    const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
    if (!items.length) throw new Error("Cannot create a timeline without manifest items.");
    const latest = await ctx.db.query("timelines").withIndex("by_production_version", (q) => q.eq("productionId", args.productionId)).order("desc").first();
    const timestamp = now();
    const output = object(payload.output);
    const fps = typeof output.fps === "number" && output.fps > 0 ? output.fps : 30;
    const durationSeconds = typeof payload.totalDurationSeconds === "number" ? payload.totalDurationSeconds : typeof output.durationInFrames === "number" ? output.durationInFrames / fps : items.reduce((sum, item) => sum + (typeof item.durationSeconds === "number" ? item.durationSeconds : 0), 0);
    const selection = object(payload.selection);
    const selectionScope = typeof selection.scope === "string" ? selection.scope : undefined;
    const timelineId = await ctx.db.insert("timelines", { studioExternalId: member.studio.externalId, studioId: member.studio._id, projectId, productionId: args.productionId, manifestId: args.manifestId, selectionScope, versionNumber: (latest?.versionNumber ?? 0) + 1, durationSeconds, tracks: { idempotencyKey, manifestId: args.manifestId.toString(), metadata: { ...object(args.metadata), productionVersionId: payload.productionVersionId }, productionVersionId: payload.productionVersionId, items }, outputPreset: args.outputPreset ?? String(payload.outputPreset ?? "SOCIAL_VERTICAL"), status: "DRAFT", createdByUserId: member.user._id, createdAt: timestamp, updatedAt: timestamp });
    const trackId = await ctx.db.insert("timelineTracks", { studioExternalId: member.studio.externalId, studioId: member.studio._id, timelineId, kind: "VIDEO", name: "Ordered takes", orderIndex: 0, metadata: { manifestId: args.manifestId.toString() } });
    for (const [index, item] of items.entries()) {
      const assetId = typeof item.assetId === "string" ? item.assetId as Id<"assets"> : undefined;
      const shotVersionId = typeof item.shotVersionId === "string" ? item.shotVersionId as Id<"shotVersions"> : undefined;
      if (assetId) {
        const asset = await ctx.db.get(assetId);
        if (!asset || asset.studioExternalId !== member.studio.externalId || asset.projectId !== projectId || asset.scope === "GLOBAL" || asset.deletedAt) throw new Error("Timeline contains media outside this project.");
      }
      const duration = typeof item.durationInFrames === "number" ? item.durationInFrames / fps : typeof item.durationSeconds === "number" ? item.durationSeconds : 0;
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("Manifest contains an invalid clip duration.");
      const startSeconds = typeof item.startFrame === "number" ? item.startFrame / fps : typeof item.startSeconds === "number" ? item.startSeconds : index === 0 ? 0 : undefined;
      if (startSeconds === undefined || !Number.isFinite(startSeconds) || startSeconds < 0) throw new Error("Manifest contains an invalid clip start time.");
      await ctx.db.insert("timelineClips", { studioExternalId: member.studio.externalId, studioId: member.studio._id, timelineId, trackId, assetId, shotVersionId, startSeconds, durationSeconds: duration, metadata: { orderIndex: index, manifestItemId: String(item.id ?? index), selectionScope } });
    }
    return await ctx.db.get(timelineId);
  },
});

export const get = query({
  args: { timelineId: v.id("timelines") },
  handler: async (ctx, args) => {
    const timeline = await ctx.db.get(args.timelineId);
    if (!timeline) throw new Error("Timeline not found.");
    const production = await ctx.db.get(timeline.productionId);
    if (!production?.projectId || timeline.projectId && timeline.projectId !== production.projectId) throw new Error("Timeline project ownership is unavailable.");
    await requireProjectAccess(ctx, production.projectId);
    const tracks = await ctx.db.query("timelineTracks").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).collect();
    const clips = await ctx.db.query("timelineClips").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).collect();
    return { timeline, tracks, clips: clips.sort((a, b) => a.startSeconds - b.startSeconds) };
  },
});

export const list = query({
  args: { productionId: v.id("productions") },
  handler: async (ctx, args) => {
    const production = await ctx.db.get(args.productionId);
    if (!production) throw new Error("Production not found.");
    if (!production.projectId) throw new Error("Production project ownership is unavailable.");
    await requireProjectAccess(ctx, production.projectId);
    return await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).order("desc").take(200);
  },
});

const graphicProps = v.object({
  title: v.string(), subtitle: v.optional(v.string()), eyebrow: v.optional(v.string()), brandName: v.optional(v.string()),
  feature: v.optional(v.string()), detail: v.optional(v.string()), index: v.optional(v.string()), callToAction: v.optional(v.string()),
  url: v.optional(v.string()), accentColor: v.optional(v.string()), backgroundColor: v.optional(v.string()), textColor: v.optional(v.string()),
});
const draftClip = v.union(
  v.object({ kind: v.literal('TAKE'), shotVersionId: v.id('shotVersions') }),
  v.object({ kind: v.literal('ASSET'), assetId: v.id('assets'), durationSeconds: v.number() }),
  v.object({ kind: v.literal('GRAPHIC'), templateId: v.union(v.literal('kinetic-title'), v.literal('brand-card'), v.literal('feature-callout'), v.literal('end-card')), durationSeconds: v.number(), props: graphicProps, logoAssetId: v.optional(v.id('assets')) }),
);

/** Bootstrap authoring from deliberate selections. A draft does not require a
 * previous manifest: assembly freezes its approved/locked content into v4.
 * This removes the timeline -> manifest -> timeline dependency loop. */
export const createDraft = mutation({
  args: { productionId: v.id('productions'), productionVersionId: v.id('productionVersions'), idempotencyKey: v.string(), clips: v.array(draftClip), audioTracks: v.optional(v.array(v.object({ assetId: v.id('assets'), startSeconds: v.number(), durationSeconds: v.number(), volume: v.optional(v.number()), trimStartSeconds: v.optional(v.number()), fadeInSeconds: v.optional(v.number()), fadeOutSeconds: v.optional(v.number()), role: v.optional(v.union(v.literal('dialogue'), v.literal('voiceover'), v.literal('music'), v.literal('ambience'), v.literal('sfx'))) }))) },
  returns: v.object({ timelineId: v.id('timelines'), versionNumber: v.number(), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const production = await ctx.db.get(args.productionId);
    if (!production?.projectId) throw new Error('Production project ownership is required.');
    const access = await requireProjectRole(ctx, production.projectId, ['OWNER', 'EDITOR']);
    const projectId = access.project._id;
    const version = await ctx.db.get(args.productionVersionId);
    if (!version || version.productionId !== production._id || version.status !== 'APPROVED' || production.currentVersionId !== version._id) throw new Error('Choose the current approved production version before composing.');
    const key = args.idempotencyKey.trim();
    if (key.length < 8 || key.length > 200) throw new Error('A valid composition request key is required.');
    const serialized = JSON.stringify({ productionId: args.productionId, productionVersionId: args.productionVersionId, clips: args.clips, audioTracks: args.audioTracks ?? [] });
    if (new TextEncoder().encode(serialized).length > 64 * 1024) throw new Error('Composition settings are too large.');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized)))).map(n => n.toString(16).padStart(2, '0')).join('');
    const previous = await ctx.db.query('timelines').withIndex('by_creation_key', q => q.eq('creationKey', key)).unique();
    if (previous) {
      if (previous.productionId !== production._id || previous.projectId !== projectId || previous.creationHash !== hash) throw new Error('This composition key belongs to a different selection.');
      return { timelineId: previous._id, versionNumber: previous.versionNumber, replayed: true };
    }
    if (!args.clips.length || args.clips.length > 200 || (args.audioTracks?.length ?? 0) > 16) throw new Error('Select one to 200 visual clips and at most 16 audio clips.');
    async function assetFor(id: Id<'assets'>) {
      const asset = await ctx.db.get(id);
      if (!asset || asset.projectId !== projectId || asset.studioExternalId !== production!.studioExternalId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !asset.checksum) throw new Error('Select active, checksummed project assets. Import global assets first.');
      await requireApprovedResource(ctx, projectId, 'asset', id);
      return asset;
    }
    const clips: Array<{ kind: 'VIDEO' | 'IMAGE' | 'GRAPHIC' | 'AUDIO'; assetId?: Id<'assets'>; shotVersionId?: Id<'shotVersions'>; durationSeconds: number; startSeconds: number; trimStartSeconds?: number; volume?: number; metadata: Record<string, unknown> }> = [];
    let elapsed = 0;
    for (const input of args.clips) {
      let asset: Doc<'assets'> | undefined;
      let duration: number;
      let takeId: Id<'shotVersions'> | undefined;
      let kind: 'VIDEO' | 'IMAGE' | 'GRAPHIC';
      let metadata: Record<string, unknown> = {};
      if (input.kind === 'TAKE') {
        const take = await ctx.db.get(input.shotVersionId);
        const shot = take ? await ctx.db.get(take.shotId) : null;
        if (!take || !shot || take.productionId !== production._id || take.productionVersionId !== version._id || shot.productionId !== production._id || !take.assetId || take.status !== 'COMPLETED') throw new Error('Choose completed takes from this approved production version.');
        await requireApprovedResource(ctx, projectId, 'shotVersion', take._id, production._id);
        asset = await assetFor(take.assetId);
        duration = shot.durationSeconds;
        takeId = take._id;
        kind = asset.mimeType?.startsWith('image/') ? 'IMAGE' : 'VIDEO';
        if (!asset.mimeType?.startsWith('image/') && !asset.mimeType?.startsWith('video/')) throw new Error('A visual take requires an image or video.');
      } else if (input.kind === 'ASSET') {
        asset = await assetFor(input.assetId);
        if (!asset.mimeType?.startsWith('image/') && !asset.mimeType?.startsWith('video/')) throw new Error('Visual clips require project images or videos.');
        duration = input.durationSeconds;
        kind = asset.mimeType.startsWith('image/') ? 'IMAGE' : 'VIDEO';
      } else {
        kind = 'GRAPHIC'; duration = input.durationSeconds;
        if (!input.props.title.trim()) throw new Error('A designed title needs text.');
        for (const [name, value] of Object.entries(input.props)) {
          if (typeof value !== 'string' || value.length > 2000 || (/Color$/.test(name) && !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value))) throw new Error('Use bounded title text and hexadecimal colors.');
        }
        if (input.logoAssetId) {
          asset = await assetFor(input.logoAssetId);
          if (!asset.mimeType?.startsWith('image/')) throw new Error('Choose a project image for the exact logo.');
        }
        metadata = { motionTemplateId: input.templateId, templateProps: input.props };
      }
      if (!Number.isFinite(duration) || duration <= 0 || duration > 60 || elapsed + duration > 60) throw new Error('This composition must total at most 60 seconds.');
      if (kind === 'VIDEO' && asset?.durationSeconds !== undefined && duration > asset.durationSeconds + 0.05) throw new Error('Visual clip extends beyond its source media.');
      clips.push({ kind, assetId: asset?._id, shotVersionId: takeId, startSeconds: elapsed, durationSeconds: duration, metadata });
      elapsed += duration;
    }
    for (const audio of args.audioTracks ?? []) {
      const asset = await assetFor(audio.assetId);
      if (!asset.mimeType?.startsWith('audio/')) throw new Error('Select project audio for the soundtrack.');
      if (!Number.isFinite(audio.startSeconds) || audio.startSeconds < 0 || !Number.isFinite(audio.durationSeconds) || audio.durationSeconds <= 0 || audio.startSeconds + audio.durationSeconds > elapsed || (audio.volume !== undefined && (!Number.isFinite(audio.volume) || audio.volume < 0 || audio.volume > 1))) throw new Error('Audio clips must fit inside the composition with volume between zero and one.');
      const trimStartSeconds = audio.trimStartSeconds ?? 0;
      if (!Number.isFinite(trimStartSeconds) || trimStartSeconds < 0 || (asset.durationSeconds !== undefined && trimStartSeconds + audio.durationSeconds > asset.durationSeconds + 0.05)) throw new Error('Audio trim exceeds the source recording.');
      for (const fade of [audio.fadeInSeconds, audio.fadeOutSeconds]) if (fade !== undefined && (!Number.isFinite(fade) || fade < 0 || fade > audio.durationSeconds)) throw new Error('Audio fades must fit inside the clip.');
      clips.push({ kind: 'AUDIO', assetId: asset._id, startSeconds: audio.startSeconds, durationSeconds: audio.durationSeconds, trimStartSeconds, volume: audio.volume ?? 1, metadata: { audioRole: audio.role ?? 'music', audio: { fadeInSeconds: audio.fadeInSeconds ?? 0, fadeOutSeconds: audio.fadeOutSeconds ?? 0 } } });
    }
    const latest = await ctx.db.query('timelines').withIndex('by_production_version', q => q.eq('productionId', production._id)).order('desc').first();
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const timestamp = now();
    const timelineId = await ctx.db.insert('timelines', { projectId, productionId: production._id, studioId: access.studio._id, studioExternalId: access.studio.externalId, versionNumber, creationKey: key, creationHash: hash, durationSeconds: elapsed, outputPreset: production.outputPreset, tracks: { metadata: { approvalStatus: 'DRAFT', productionVersionId: version._id }, productionVersionId: version._id }, status: 'DRAFT', createdByUserId: access.user._id, createdAt: timestamp, updatedAt: timestamp });
    for (const [orderIndex, kind] of ['VIDEO', 'IMAGE', 'GRAPHIC', 'AUDIO'].entries()) {
      const selected = clips.filter(clip => clip.kind === kind);
      if (!selected.length) continue;
      // Narration and music intentionally overlap. Separate lanes preserve the
      // single-lane non-overlap contract used by assembly and the editor.
      const lanes = kind === 'AUDIO' ? selected.map(clip => [clip]) : [selected];
      for (const [laneIndex, lane] of lanes.entries()) {
        const trackId = await ctx.db.insert('timelineTracks', { timelineId, studioId: access.studio._id, studioExternalId: access.studio.externalId, kind, name: kind === 'AUDIO' ? String(lane[0].metadata.audioRole ?? 'music') : kind === 'GRAPHIC' ? 'Designed graphics' : 'Selected visuals', orderIndex: orderIndex + laneIndex });
        for (const clip of lane) {
          const { kind: _kind, ...values } = clip; void _kind;
          await ctx.db.insert('timelineClips', { ...values, trackId, timelineId, studioId: access.studio._id, studioExternalId: access.studio.externalId });
        }
      }
    }
    await ensureResourceState(ctx, { projectId, productionId: production._id, resourceType: 'timeline', resourceId: timelineId });
    await ctx.db.insert('productionOperations', { studioId: access.studio._id, studioExternalId: access.studio.externalId, productionId: production._id, kind: 'CREATE_TIMELINE', targetType: 'timeline', targetId: timelineId, targetVersionId: String(versionNumber), idempotencyKey: `compose:${key}`, input: { productionVersionId: version._id, clipCount: args.clips.length, audioCount: args.audioTracks?.length ?? 0 }, status: 'COMPLETED', actorUserId: access.user._id, outputResourceIds: [timelineId], createdAt: timestamp, updatedAt: timestamp, completedAt: timestamp });
    return { timelineId, versionNumber, replayed: false };
  },
});
