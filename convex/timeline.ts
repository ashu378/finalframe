import { synchronizeStoryboardTimeline } from './storyboardLineage';
import { mutation, query } from "./_generated/server";
import { v, type Infer } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { normalizeSha256, sha256Equal } from "../renderer/src/media/sha256";
import {resolveGraphicImage} from './graphicsAssets';
import {graphicsV2Enabled,parseGraphicsV2Authoring} from './graphicsContracts';
import { normalizeCaptionTrack } from "./finishingContracts";
import type { Doc, Id } from "./_generated/dataModel";
import { requireProjectAccess, requireProjectRole, resolveProjectAccessForActor } from "./authorization";
import { now } from "./_shared";
import { ensureResourceState, requireApprovedResource } from "./resourceStates";
import {importedOutputAudio,posterSpec,type ImportedPosterBinding} from '../renderer/src/poster';
import { validateManifest } from "../renderer/src/manifest";
import { finishingV5Enabled } from "./finishingContracts";
import { validateAuthoringOutputSettings } from '../renderer/src/output-settings';
import { AUTHORED_COPY_POLICY } from '../renderer/src/templates/contract';
import { OUTPUT_PRESETS, normalizeOutputPresetId } from '../renderer/src/output-presets';
import { createTimelineFormatVariant } from './timelineEditor';

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export const formatOptions = query({args:{},returns:v.any(),handler:async()=>({enabled:process.env.FINALFRAME_FORMAT_VARIANTS_ENABLED==='true'&&finishingV5Enabled(),presets:OUTPUT_PRESETS})});

export const createFormatVariant = mutation({
  args: { timelineId: v.id('timelines'), presetId: v.string(), expectedVersionNumber: v.number(), expectedUpdatedAt: v.union(v.number(), v.null()),
    idempotencyKey: v.string(), fit: v.optional(v.union(v.literal('contain'), v.literal('cover'))),
    focalPoint: v.optional(v.object({ x: v.number(), y: v.number() })), backgroundColor: v.optional(v.string()) },
  returns: v.object({timelineId:v.id('timelines'),operationId:v.id('productionOperations'),replayed:v.boolean()}),
  handler: createTimelineFormatVariant,
});

export const formatVariants = query({
  args:{productionId:v.id('productions')},returns:v.any(),handler:async(ctx,args)=>{
    const production=await ctx.db.get(args.productionId);
    if(!production?.projectId)throw new Error('Project production unavailable.');
    await requireProjectAccess(ctx,production.projectId);
    const timelines=await ctx.db.query('timelines').withIndex('by_production_version',q=>q.eq('productionId',production._id)).order('desc').take(201);
    return {hasMore:timelines.length>200,variants:timelines.slice(0,200).flatMap(row=>{const metadata=object(object(row.tracks).metadata);const presetId=normalizeOutputPresetId(metadata.outputPresetId);return metadata.formatVariant&&presetId?[{id:row._id,versionNumber:row.versionNumber,presetId,source:metadata.formatVariant,status:row.status}]:[];})};
  },
});

export const createVersion = mutation({
  args: { productionId: v.id("productions"), manifestId: v.id("manifests"), outputPreset: v.optional(v.string()), idempotencyKey: v.optional(v.string()), metadata: v.optional(v.any()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest || manifest.productionId !== args.productionId) throw new Error("Manifest not found.");
    if (!manifest.projectId) throw new Error("Manifest is not attached to a project.");
    const member = await requireProjectRole(ctx, manifest.projectId, ["OWNER", "EDITOR"]);
    const production = await ctx.db.get(args.productionId);
    if (!production || production.projectId !== manifest.projectId || production.studioExternalId !== member.studio.externalId) throw new Error("Manifest project ownership does not match the production.");
    const payload = object(manifest.manifest);
    if (![4, 5].includes(Number(payload.version)) || payload.version !== manifest.contractVersion || !validateManifest(payload).ok) throw new Error("Only valid canonical manifest v4/v5 can create new timeline versions.");
    if (payload.productionId !== production._id || payload.projectId !== manifest.projectId || payload.manifestId !== manifest._id) throw new Error("Manifest ownership does not match its canonical record.");
    const projectId = manifest.projectId;
    const key = args.idempotencyKey?.trim() || `timeline:${args.manifestId}`;
    if (key.length < 8 || key.length > 200) throw new Error("A bounded timeline import key is required.");
    const prior = await ctx.db.query("timelines").withIndex("by_creation_key", q => q.eq("creationKey", key)).unique();
    const items = payload.items as Array<Record<string, unknown>>;
    const audio = Array.isArray(payload.audioTracks) ? payload.audioTracks as Array<Record<string, unknown>> : [];
    const captions = Array.isArray(payload.captionTracks) ? payload.captionTracks as Array<Record<string, unknown>> : [];
    const sources = Array.isArray(payload.sources) ? payload.sources.map(object) : [];
    const bySourceId = new Map<string, Record<string, unknown>>();
    for (const source of sources) for (const id of [source.timelineClipId, source.audioId]) if (typeof id === "string") bySourceId.set(id, source);
    const output = object(payload.output); const fps = Number(output.fps);
    importedOutputAudio(output.audio);
    if(Object.prototype.hasOwnProperty.call(object(args.metadata),'importedPoster'))throw new Error('Poster bindings must come from the canonical manifest, not import metadata.');
    let importedPoster:ImportedPosterBinding|undefined;
    if(payload.poster!==undefined){
      const poster=posterSpec(payload.poster);const matches=sources.filter(source=>source.sourceUrl===poster.src&&typeof source.assetId==='string');
      const ids=[...new Set(matches.map(source=>String(source.assetId)))];const rawId=poster.assetId??(ids.length===1?ids[0]:undefined);
      if(!rawId)throw new Error('Imported poster is unbound or ambiguous. Choose an exact approved project image.');
      const image=await resolveGraphicImage(ctx,{assetId:rawId,projectId,studioExternalId:member.studio.externalId});
      const storage=await ctx.db.system.get('_storage',image.storageId!);const url=await ctx.storage.getUrl(image.storageId!);
      if(!storage||!url||url!==poster.src||!['image/jpeg','image/png','image/webp'].includes(storage.contentType??'')||poster.mimeType!==undefined&&poster.mimeType!==storage.contentType||matches.some(source=>source.assetId===image._id&&source.assetChecksum!==image.checksum))throw new Error('Imported poster no longer matches its canonical storage, checksum or media type.');
      importedPoster={assetId:image._id,assetChecksum:image.checksum!,storageId:image.storageId!,storageChecksum:storage.sha256,byteSize:storage.size,storageMimeType:storage.contentType as ImportedPosterBinding['storageMimeType'],width:poster.width,height:poster.height,...(poster.mimeType===undefined?{}:{mimeType:poster.mimeType})};
    }

    if (prior) {
      if (prior.productionId !== production._id || prior.projectId !== projectId || prior.manifestId !== manifest._id) throw new Error("This import key belongs to another manifest.");
      return prior;
    }
    const targetVersion = production.currentVersionId ? await ctx.db.get(production.currentVersionId) : null;
    if (!targetVersion || targetVersion.productionId !== production._id || targetVersion.status !== 'APPROVED' || payload.productionVersionId !== targetVersion._id) throw new Error('Historical or unbound manifests are read-only. Import the exact current approved production manifest.');
    const latest = await ctx.db.query("timelines").withIndex("by_production_version", q => q.eq("productionId", args.productionId)).order("desc").first();
    const timestamp = now();
    const metadata = { ...object(args.metadata), productionVersionId: payload.productionVersionId, fps, importedManifestVersion: payload.version, importedOutput: output,...(importedPoster?{importedPoster}:{}),...(output.presetId?{outputPresetId:output.presetId}:{}),...(object(payload.metadata).formatVariant?{formatVariant:object(payload.metadata).formatVariant}:{}) };
    const timelineId = await ctx.db.insert("timelines", { studioExternalId: member.studio.externalId, studioId: member.studio._id, projectId, productionId: args.productionId, manifestId: args.manifestId, creationKey: key, selectionScope: String(object(payload.selection).scope ?? "TIMELINE"), versionNumber: (latest?.versionNumber ?? 0) + 1, durationSeconds: Number(output.durationInFrames) / fps, tracks: { idempotencyKey: key, manifestId: args.manifestId.toString(), metadata, productionVersionId: payload.productionVersionId }, outputPreset: args.outputPreset ?? String(payload.outputPreset ?? "FULL_HD"), status: "DRAFT", createdByUserId: member.user._id, createdAt: timestamp, updatedAt: timestamp });
    const importedTracks = new Map<string, Id<"timelineTracks">>();
    const descriptors = Array.isArray(payload.tracks) ? payload.tracks.map(object) : [];
    async function trackFor(key: string, kind: string, orderIndex: number, name?: string) {
      const existing = importedTracks.get(key); if (existing) return existing;
      const descriptor = descriptors.find(row => row.id === key);
      const id = await ctx.db.insert("timelineTracks", { studioExternalId: member.studio.externalId, studioId: member.studio._id, timelineId, kind: typeof descriptor?.kind === "string" ? descriptor.kind : kind, orderIndex: typeof descriptor?.orderIndex === "number" ? descriptor.orderIndex : orderIndex, name: typeof descriptor?.name === "string" ? descriptor.name : name, metadata: { importedTrackId: key } });
      importedTracks.set(key, id); return id;
    }
    async function assetFor(item: Record<string, unknown>, mediaRequired: boolean) {
      const source = bySourceId.get(String(item.id));
      const rawId = typeof item.assetId === "string" ? item.assetId : source?.assetId;
      const assetId = typeof rawId === "string" ? ctx.db.normalizeId("assets", rawId) : null;
      if (!assetId) { if (mediaRequired) throw new Error("Imported media must resolve to a canonical project asset."); return undefined; }
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.studioExternalId !== member.studio.externalId || asset.projectId !== projectId || asset.scope === "GLOBAL" || asset.deletedAt || !asset.storageId || !asset.checksum) throw new Error("Timeline contains media outside this project.");
      if (source?.assetChecksum && source.assetChecksum !== asset.checksum) throw new Error("Imported media checksum changed.");
      await requireApprovedResource(ctx, projectId, "asset", assetId);
      return assetId;
    }
    const hasOverlap = items.some((item, index) => items.some((other, otherIndex) => index !== otherIndex && Number(item.startFrame) < Number(other.startFrame) + Number(other.durationInFrames) && Number(other.startFrame) < Number(item.startFrame) + Number(item.durationInFrames)));
    for (const [index, item] of items.entries()) {
      const kind = item.kind === "motion-graphics" ? "GRAPHIC" : item.kind === "image" ? "IMAGE" : "VIDEO";
      const laneKey = typeof item.trackId === "string" ? item.trackId : payload.version === 4 && hasOverlap ? `visual-${index}` : "visual";
      const trackId = await trackFor(laneKey, "VIDEO", index, "Imported pictures");
      const assetId = await assetFor(item, item.kind !== "motion-graphics");
      const shotVersionId = typeof item.shotVersionId === "string" ? ctx.db.normalizeId("shotVersions", item.shotVersionId) : null;
      if (shotVersionId) { const take = await ctx.db.get(shotVersionId); if (!take || take.projectId !== projectId || take.productionId !== production._id || take.productionVersionId !== targetVersion._id || take.assetId !== assetId) throw new Error("Imported take is outside this production."); await requireApprovedResource(ctx, projectId, "shotVersion", shotVersionId, production._id); }
      const transition = (Array.isArray(payload.transitions) ? payload.transitions.map(object) : []).find(row => row.fromItemId === item.id);
      const clipMetadata = { orderIndex: index, rendererOrderIndex: item.orderIndex ?? index, manifestItemId: item.id, clipKind: kind, ...(kind === "GRAPHIC" ? { motionTemplateId: item.templateId, templateProps: item.props,...(object(item.props).layoutVersion===2?{graphicAssetRole:item.templateId==='product-ui'?'screen':'logo'}:{}) } : {}), renderItem: { opacity: item.opacity, fit: item.fit, position: item.position,...(item.backgroundColor?{backgroundColor:item.backgroundColor}:{}),...(item.holdAfterFrame!==undefined?{holdAfterFrame:item.holdAfterFrame}:{}) }, ...(item.sourceAudioRestoration?{sourceAudioRestoration:item.sourceAudioRestoration}:{}), rendererTiming: { fps, startFrame: item.startFrame, durationInFrames: item.durationInFrames, trimStartInFrames: item.trimStartInFrames } };
      await ctx.db.insert("timelineClips", { studioExternalId: member.studio.externalId, studioId: member.studio._id, timelineId, trackId, assetId, shotVersionId: shotVersionId ?? undefined, startSeconds: Number(item.startFrame) / fps, durationSeconds: Number(item.durationInFrames) / fps, trimStartSeconds: typeof item.trimStartInFrames === "number" ? item.trimStartInFrames / fps : undefined, volume: typeof item.volume === "number" ? item.volume : undefined, ...(transition && payload.version === 5 ? { transition: { out: { kind: transition.kind, durationSeconds: Number(transition.durationInFrames) / fps, audioPolicy: transition.audioPolicy } } } : {}), metadata: JSON.parse(JSON.stringify(clipMetadata)) });
    }
    for (const [index, item] of audio.entries()) {
      const trackId = await trackFor(typeof item.trackId === "string" ? item.trackId : `audio-${index}`, "AUDIO", items.length + index, "Imported soundtrack");
      const assetId = await assetFor(item, true);
      await ctx.db.insert("timelineClips", { studioExternalId: member.studio.externalId, studioId: member.studio._id, timelineId, trackId, assetId, startSeconds: Number(item.startFrame) / fps, durationSeconds: item.sourceAudioRestoration?Number(object(item.sourceAudioRestoration).placedSamples)/48000:Number(item.durationInFrames) / fps, trimStartSeconds: Number(item.trimStartInFrames ?? 0) / fps, volume: typeof item.volume === "number" ? item.volume : 1, metadata: { manifestItemId: item.id, clipKind: "AUDIO",...(item.sourceAudioRestoration?{sourceAudioRestoration:item.sourceAudioRestoration}:{}), audioRole: item.role ?? "music", audio: { fadeInSeconds: Number(item.fadeInFrames ?? 0) / fps, fadeOutSeconds: Number(item.fadeOutFrames ?? 0) / fps }, rendererTiming: { fps, startFrame: item.startFrame, durationInFrames: item.durationInFrames, trimStartInFrames: item.trimStartInFrames ?? 0 } } });
    }
    for (const [index, caption] of captions.entries()) {
      const trackId = await trackFor(`caption-${index}`, "CAPTIONS", items.length + audio.length + index, `Captions · ${caption.language}`);
      await ctx.db.insert("timelineClips", { studioExternalId: member.studio.externalId, studioId: member.studio._id, timelineId, trackId, startSeconds: 0, durationSeconds: Number(output.durationInFrames) / fps, metadata: { clipKind: "CAPTIONS", captionTrack: caption, captionFps: fps } });
    }
    await ensureResourceState(ctx, { projectId, productionId: production._id, resourceType: "timeline", resourceId: timelineId });
    return await ctx.db.get(timelineId);
  },
});

export const get = query({
  args: { timelineId: v.id("timelines") },
  returns: v.any(),
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
  returns: v.any(),
  handler: async (ctx, args) => {
    const production = await ctx.db.get(args.productionId);
    if (!production) throw new Error("Production not found.");
    if (!production.projectId) throw new Error("Production project ownership is unavailable.");
    await requireProjectAccess(ctx, production.projectId);
    return await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).order("desc").take(200);
  },
});

const draftClip = v.union(
  v.object({ kind: v.literal('TAKE'), shotVersionId: v.id('shotVersions'), durationSeconds: v.optional(v.number()) }),
  v.object({ kind: v.literal('ASSET'), assetId: v.id('assets'), durationSeconds: v.number(), trimStartSeconds:v.optional(v.number()), volume:v.optional(v.number()), fit:v.optional(v.union(v.literal('contain'),v.literal('cover'))) }),
  v.object({ kind: v.literal('GRAPHIC'), templateId: v.union(v.literal('kinetic-title'), v.literal('brand-card'), v.literal('feature-callout'), v.literal('end-card'),v.literal('product-ui'),v.literal('bar-chart'),v.literal('explainer-steps')), durationSeconds: v.number(), props: v.any(), logoAssetId: v.optional(v.id('assets')),screenAssetId:v.optional(v.id('assets')) }),
);

/** Bootstrap authoring from deliberate selections. A draft does not require a
 * previous manifest: assembly freezes its approved/locked content into v4.
 * This removes the timeline -> manifest -> timeline dependency loop. */
const timelineDraftArgs={ productionId: v.id('productions'), productionVersionId: v.id('productionVersions'), idempotencyKey: v.string(), clips: v.array(draftClip), audioTracks: v.optional(v.array(v.object({ assetId: v.id('assets'), startSeconds: v.number(), durationSeconds: v.number(), volume: v.optional(v.number()), trimStartSeconds: v.optional(v.number()), fadeInSeconds: v.optional(v.number()), fadeOutSeconds: v.optional(v.number()), role: v.optional(v.union(v.literal('dialogue'), v.literal('voiceover'), v.literal('music'), v.literal('ambience'), v.literal('sfx'))) }))), fps:v.optional(v.union(v.literal(24),v.literal(25),v.literal(30),v.literal(50),v.literal(60))),captionId:v.optional(v.id('captions')) };
const timelineOutputArgs={...timelineDraftArgs,outputSettings:v.optional(v.object({width:v.number(),height:v.number()}))};
const timelineDraftValidator=v.object(timelineOutputArgs);
export const createDraft=mutation({args:timelineOutputArgs,returns:v.object({timelineId:v.id('timelines'),versionNumber:v.number(),replayed:v.boolean()}),handler:(ctx,args)=>createCanonicalTimelineDraft(ctx,args)});
export async function createCanonicalTimelineDraft(ctx:MutationCtx,args:Infer<typeof timelineDraftValidator>,actorId?:Id<'users'>){
    const production = await ctx.db.get(args.productionId);
    if (!production?.projectId) throw new Error('Production project ownership is required.');
    const access = actorId?await resolveProjectAccessForActor(ctx,production.projectId,actorId,['OWNER','EDITOR']):await requireProjectRole(ctx, production.projectId, ['OWNER', 'EDITOR']);
    const projectId = access.project._id;
    const version = await ctx.db.get(args.productionVersionId);
    if (!version || version.productionId !== production._id || version.status !== 'APPROVED' || production.currentVersionId !== version._id) throw new Error('Choose the current approved production version before composing.');
    const key = args.idempotencyKey.trim();
    if (key.length < 8 || key.length > 200) throw new Error('A valid composition request key is required.');
    const authoredOutput = args.outputSettings === undefined ? undefined : validateAuthoringOutputSettings(args.outputSettings);
    const selectedPreset = authoredOutput ? OUTPUT_PRESETS.find(preset=>preset.width===authoredOutput.width&&preset.height===authoredOutput.height)?.id : normalizeOutputPresetId(production.outputPreset);
    // Preserve creation hashes for requests authored before optional finishing
    // controls existed. Only explicit new controls change the request identity.
    const serialized = JSON.stringify({ productionId: args.productionId, productionVersionId: args.productionVersionId, clips: args.clips, audioTracks: args.audioTracks ?? [],...(args.fps===undefined?{}:{fps:args.fps}),...(args.captionId===undefined?{}:{captionId:args.captionId}),...(authoredOutput?{outputSettings:authoredOutput}:{}) });
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
      await requireApprovedResource(ctx, projectId, 'asset', id,undefined,actorId);
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
        await requireApprovedResource(ctx, projectId, 'shotVersion', take._id, production._id,actorId);
        asset = await assetFor(take.assetId);
        duration = input.durationSeconds ?? shot.durationSeconds;
        // An explicit source-bounded trim belongs to this new timeline only.
        // Preserve the approved shot/take and legacy omitted-duration behavior.
        if (input.durationSeconds !== undefined) {
          const fps = args.fps ?? 30;
          if (!Number.isFinite(duration) || duration <= 0 || duration > shot.durationSeconds || Math.abs(duration * fps - Math.round(duration * fps)) > 0.000001) throw new Error('Choose a positive take length on the output frame grid, no longer than the approved shot.');
          if (asset.mimeType?.startsWith('video/') && (!Number.isFinite(asset.durationSeconds) || duration > asset.durationSeconds! + 0.000001)) throw new Error('Choose a take length within the actual source video duration.');
        }
        takeId = take._id;
        kind = asset.mimeType?.startsWith('image/') ? 'IMAGE' : 'VIDEO';
        if (!asset.mimeType?.startsWith('image/') && !asset.mimeType?.startsWith('video/')) throw new Error('A visual take requires an image or video.');
      } else if (input.kind === 'ASSET') {
        asset = await assetFor(input.assetId);
        if (!asset.mimeType?.startsWith('image/') && !asset.mimeType?.startsWith('video/')) throw new Error('Visual clips require project images or videos.');
        duration = input.durationSeconds;
        kind = asset.mimeType.startsWith('image/') ? 'IMAGE' : 'VIDEO';
        if (input.fit !== undefined) {
          if (kind !== 'IMAGE' || !['contain', 'cover'].includes(input.fit)) throw new Error('Fit applies only to still images.');
          metadata = { renderItem: { fit: input.fit } };
        }
      } else {
        kind = 'GRAPHIC'; duration = input.durationSeconds;
        if(object(input.props).layoutVersion===2){
          if(!graphicsV2Enabled())throw new Error('Responsive graphics authoring is not enabled.');
          const spec=parseGraphicsV2Authoring({templateId:input.templateId,props:input.props,...(input.logoAssetId?{logoAssetId:input.logoAssetId}:{}),...(input.screenAssetId?{screenAssetId:input.screenAssetId}:{})},Math.round(duration*(args.fps??30)),args.fps??30);
          if(spec.assetId)asset=await resolveGraphicImage(ctx,{assetId:spec.assetId,projectId,studioExternalId:production.studioExternalId,actorId});
          metadata={motionTemplateId:spec.templateId,templateProps:spec.props,...(spec.assetRole?{graphicAssetRole:spec.assetRole}:{})};
        }else{
          if(!['kinetic-title','brand-card','feature-callout','end-card'].includes(input.templateId)||input.screenAssetId)throw new Error('This graphic requires the responsive graphics contract.');
          if(typeof object(input.props).title!=='string'||!input.props.title.trim())throw new Error('A designed title needs text.');
          const allowed=['title','subtitle','eyebrow','brandName','feature','detail','index','callToAction','url','accentColor','backgroundColor','textColor'];
          for(const [name,value]of Object.entries(object(input.props)))if(!allowed.includes(name)||typeof value!=='string'||value.length>2000||(/Color$/.test(name)&&!/^#[0-9a-f]{6}$/i.test(value)))throw new Error('Use bounded title text and hexadecimal colors.');
          if(input.logoAssetId){asset=await assetFor(input.logoAssetId);if(!asset.mimeType?.startsWith('image/'))throw new Error('Choose a project image for the exact logo.');}
          metadata={motionTemplateId:input.templateId,templateProps:{...input.props,copyPolicy:AUTHORED_COPY_POLICY}};
        }
      }
      if (!Number.isFinite(duration) || duration <= 0 || duration > 60 || elapsed + duration > 60) throw new Error('This composition must total at most 60 seconds.');
      if (kind === 'VIDEO' && asset?.durationSeconds !== undefined && duration > asset.durationSeconds + 0.05) throw new Error('Visual clip extends beyond its source media.');
      const trimStartSeconds=input.kind==='ASSET'?(input.trimStartSeconds??0):0;const volume=input.kind==='ASSET'?(input.volume??1):undefined;
      if(input.kind==='ASSET'&&(input.trimStartSeconds!==undefined||input.volume!==undefined)){
        if(!Number.isFinite(trimStartSeconds)||trimStartSeconds<0||!Number.isFinite(volume)||volume!<0||volume!>1)throw new Error('Use a valid visual source range and volume.');
        if(kind==='IMAGE'){if(trimStartSeconds!==0)throw new Error('Still images cannot be trimmed.');}
        else{const storage=asset?.storageId?await ctx.db.system.get('_storage',asset.storageId):null;const probe=asset?await ctx.db.query('verifiedMediaProbes').withIndex('by_asset',q=>q.eq('assetId',asset!._id)).unique():null;
        if(!asset||!storage||!probe||probe.projectId!==projectId||probe.storageId!==asset.storageId||!normalizeSha256(storage.sha256)||!sha256Equal(asset.checksum,storage.sha256)||!sha256Equal(probe.checksum,storage.sha256)||probe.byteSize!==storage.size||!probe.videoCodec||!Number.isFinite(probe.durationSeconds)||trimStartSeconds+duration>probe.durationSeconds+0.000001)throw new Error('Measure the current project video and choose an in-bounds source range.');}
      }
      clips.push({ kind, trimStartSeconds,volume, assetId: asset?._id, shotVersionId: takeId, startSeconds: elapsed, durationSeconds: duration, metadata });
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
    const timelineId = await ctx.db.insert('timelines', { projectId, productionId: production._id, studioId: access.studio._id, studioExternalId: access.studio.externalId, versionNumber, creationKey: key, creationHash: hash, durationSeconds: elapsed, outputPreset: selectedPreset??production.outputPreset, tracks: { metadata: { approvalStatus: 'DRAFT', productionVersionId: version._id,fps:args.fps??30,...(authoredOutput?{authoredOutput}:{}),...(selectedPreset?{outputPresetId:selectedPreset}:{}) }, productionVersionId: version._id }, status: 'DRAFT', createdByUserId: access.user._id, createdAt: timestamp, updatedAt: timestamp });
    for (const [orderIndex, kind] of (finishingV5Enabled() ? ['PICTURE', 'AUDIO'] : ['VIDEO', 'IMAGE', 'GRAPHIC', 'AUDIO']).entries()) {
      const selected = clips.filter(clip => kind === 'PICTURE' ? clip.kind !== 'AUDIO' : clip.kind === kind);
      if (!selected.length) continue;
      // Narration and music intentionally overlap. Separate lanes preserve the
      // single-lane non-overlap contract used by assembly and the editor.
      const lanes = kind === 'AUDIO' ? selected.map(clip => [clip]) : [selected];
      for (const [laneIndex, lane] of lanes.entries()) {
        const trackId = await ctx.db.insert('timelineTracks', { timelineId, studioId: access.studio._id, studioExternalId: access.studio.externalId, kind: kind === 'PICTURE' ? 'VIDEO' : kind, name: kind === 'AUDIO' ? String(lane[0].metadata.audioRole ?? 'music') : kind === 'GRAPHIC' ? 'Designed graphics' : 'Selected visuals', orderIndex: orderIndex + laneIndex });
        for (const clip of lane) {
          const { kind: _kind, ...values } = clip; void _kind;
          await ctx.db.insert('timelineClips', { ...values, ...(finishingV5Enabled() ? { metadata: { ...values.metadata, clipKind: _kind } } : {}), trackId, timelineId, studioId: access.studio._id, studioExternalId: access.studio.externalId });
        }
      }
    }
    if(args.captionId){if(!finishingV5Enabled())throw new Error('Caption export requires canonical finishing v5.');const caption=await ctx.db.get(args.captionId);if(!caption||caption.productionId!==production._id||caption.studioExternalId!==production.studioExternalId)throw new Error('Choose captions from this production.');await requireApprovedResource(ctx,projectId,'caption',caption._id,production._id,actorId);normalizeCaptionTrack({language:caption.language,style:caption.style??{},cues:caption.cues},elapsed,args.fps??30,String(caption._id));const trackId=await ctx.db.insert('timelineTracks',{timelineId,studioId:access.studio._id,studioExternalId:access.studio.externalId,kind:'CAPTIONS',name:'Reviewed captions',orderIndex:100});await ctx.db.insert('timelineClips',{timelineId,trackId,studioId:access.studio._id,studioExternalId:access.studio.externalId,startSeconds:0,durationSeconds:elapsed,metadata:{clipKind:'CAPTIONS',captionId:caption._id}});}
    await ensureResourceState(ctx, { projectId, productionId: production._id, resourceType: 'timeline', resourceId: timelineId },actorId);
    await ctx.db.insert('productionOperations', { studioId: access.studio._id, studioExternalId: access.studio.externalId, productionId: production._id, kind: 'CREATE_TIMELINE', targetType: 'timeline', targetId: timelineId, targetVersionId: String(versionNumber), idempotencyKey: `compose:${key}`, input: { productionVersionId: version._id, clipCount: args.clips.length, audioCount: args.audioTracks?.length ?? 0 }, status: 'COMPLETED', actorUserId: access.user._id, outputResourceIds: [timelineId], createdAt: timestamp, updatedAt: timestamp, completedAt: timestamp });
    await synchronizeStoryboardTimeline(ctx,timelineId,access.user._id);
    return { timelineId, versionNumber, replayed: false };
}

export const graphicsCapabilities=query({args:{projectId:v.id('projects')},returns:v.object({enabled:v.boolean()}),handler:async(ctx,args)=>{await requireProjectAccess(ctx,args.projectId);return {enabled:graphicsV2Enabled()};}});

export const graphicsImages=query({args:{projectId:v.id('projects')},returns:v.object({enabled:v.boolean(),canEdit:v.boolean(),images:v.array(v.object({id:v.id('assets'),name:v.string()}))}),handler:async(ctx,args)=>{
 const access=await requireProjectAccess(ctx,args.projectId);const canEdit=['OWNER','EDITOR'].includes(access.projectRole);if(!graphicsV2Enabled())return {enabled:false,canEdit,images:[]};
 const rows=await ctx.db.query('assets').withIndex('by_project',q=>q.eq('projectId',args.projectId)).order('desc').take(201);const images=[];
 for(const image of rows)if(image.scope==='PROJECT'&&!image.deletedAt&&image.mimeType?.startsWith('image/')){try{const approved=await resolveGraphicImage(ctx,{assetId:image._id,projectId:args.projectId,studioExternalId:access.studio.externalId});images.push({id:approved._id,name:approved.name??'Project image'});}catch{/* Only currently valid approved images are selectable. */}}
 return {enabled:true,canEdit,images};
}});
