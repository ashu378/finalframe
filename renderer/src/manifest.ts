import {
  RENDER_MANIFEST_KIND,
  RENDER_MANIFEST_VERSION,
  SUPPORTED_RENDER_MANIFEST_VERSIONS,
  type AudioTrack,
  type CaptionTrack,
  type ImageRenderItem,
  type MotionGraphicsRenderItem,
  type PosterSpec,
  type RenderItem,
  type RenderManifest,
  type ShotManifestEntry,
  type ValidationIssue,
  type ValidationResult,
  type Validated,
  type VideoRenderItem,
  type LockedManifestMetadata,
  type RenderSelectionScope,
} from './types.js';
import { parseGraphicsV2Render } from './templates/graphics-v2-contract.js';
import { SUPPORTED_MOTION_TEMPLATE_IDS } from './templates/contract.js';
import { getOutputPreset, OUTPUT_FPS } from './output-presets.js';
import { FORMAT_VARIANT_VERSION, variantFraming } from './output-variants.js';

export const RENDER_LIMITS = {
  maxWidth: 7680,
  maxHeight: 4320,
  maxFps: 120,
  maxDurationInFrames: 216_000,
  maxItems: 500,
  maxStringLength: 512,
  maxPropsKeys: 64,
  maxPropsDepth: 4,
  maxPropsArrayLength: 32,
  maxAudioTracks: 64,
  maxCaptionTracks: 32,
  maxCaptionCues: 2_000,
  maxShots: 500,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);

const isBoundedString = (value: unknown, max: number = RENDER_LIMITS.maxStringLength): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

const SELECTION_SCOPES: readonly RenderSelectionScope[] = ['FULL_PROJECT', 'TIMELINE', 'SCENES', 'SHOTS'];

function isSafeMediaSource(value: unknown): value is string {
  if (!isBoundedString(value, 2_048) || /[\u0000\r\n]/.test(value)) return false;
  // Successful renders may only reference user/provider media, never test fixtures or placeholders.
  if (/(?:^|[/:._-])(mock|sample|placeholder)(?:[/:._-]|$)|example\.(?:com|test)(?:[/:?#]|$)/i.test(value)) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return /^(https?|file):/i.test(value);
  return true;
}

export function validateLockedManifest(input: unknown): ValidationResult {
  const base = validateManifest(input);
  if (!base.ok) return base;
  const metadata = baseValue(input).metadata;
  const issues: ValidationIssue[] = [];
  if (!isRecord(metadata)) {
    issues.push({ path: '$.metadata', message: 'a locked production manifest requires metadata.lockState, lockId, lockedAt, and lockedBy' });
  } else {
    if (metadata.lockState !== 'LOCKED') issues.push({ path: '$.metadata.lockState', message: 'must equal LOCKED before production rendering' });
    for (const key of ['lockId', 'lockedBy']) {
      if (!isBoundedString(metadata[key], 256)) issues.push({ path: `$.metadata.${key}`, message: 'must be a non-empty bounded string' });
    }
    if (!isBoundedString(metadata.lockedAt, 64) || !Number.isFinite(Date.parse(metadata.lockedAt as string))) {
      issues.push({ path: '$.metadata.lockedAt', message: 'must be an ISO timestamp' });
    }
    if (metadata.sourceVersionId !== undefined && !isBoundedString(metadata.sourceVersionId, 256)) {
      issues.push({ path: '$.metadata.sourceVersionId', message: 'must be a bounded string when provided' });
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, issues: [] };
}

function baseValue(input: unknown): RenderManifest {
  return input as RenderManifest;
}

function validateTemplateProps(value: unknown, path: string, depth = 0): ValidationIssue[] {
  if (depth > RENDER_LIMITS.maxPropsDepth) return [{ path, message: `must not exceed ${RENDER_LIMITS.maxPropsDepth} nested levels` }];
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return [];
  if (typeof value === 'string') return isBoundedString(value) ? [] : [{ path, message: `string must be at most ${RENDER_LIMITS.maxStringLength} characters` }];
  if (Array.isArray(value)) {
    if (value.length > RENDER_LIMITS.maxPropsArrayLength) return [{ path, message: `array must contain at most ${RENDER_LIMITS.maxPropsArrayLength} values` }];
    return value.flatMap((item, index) => validateTemplateProps(item, `${path}[${index}]`, depth + 1));
  }
  if (!isRecord(value)) return [{ path, message: 'must contain only JSON-compatible values' }];
  const keys = Object.keys(value);
  if (keys.length > RENDER_LIMITS.maxPropsKeys) return [{ path, message: `object must contain at most ${RENDER_LIMITS.maxPropsKeys} keys` }];
  return keys.flatMap((key) => validateTemplateProps(value[key], `${path}.${key}`, depth + 1));
}

function validateItem(value: unknown, index: number, outputDuration: number, fps: number): { item?: RenderItem; issues: ValidationIssue[] } {
  const path = `items[${index}]`;
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { issues: [{ path, message: 'must be an object' }] };

  if (!isBoundedString(value.id, 128)) issues.push({ path: `${path}.id`, message: 'must be a non-empty string of at most 128 characters' });
  if (!isFiniteInteger(value.startFrame) || value.startFrame < 0) issues.push({ path: `${path}.startFrame`, message: 'must be a non-negative integer' });
  if (!isFiniteInteger(value.durationInFrames) || value.durationInFrames <= 0) issues.push({ path: `${path}.durationInFrames`, message: 'must be a positive integer' });
  if (isFiniteInteger(value.startFrame) && isFiniteInteger(value.durationInFrames) && value.startFrame + value.durationInFrames > outputDuration) {
    issues.push({ path, message: 'frame window must fit inside output.durationInFrames' });
  }
  if (value.opacity !== undefined && (typeof value.opacity !== 'number' || value.opacity < 0 || value.opacity > 1)) {
    issues.push({ path: `${path}.opacity`, message: 'must be between 0 and 1' });
  }

  if (value.kind === 'video' || value.kind === 'image') {
    if (value.backgroundColor !== undefined && (typeof value.backgroundColor !== 'string' || !/^#[a-f0-9]{6}$/i.test(value.backgroundColor))) issues.push({path:`${path}.backgroundColor`,message:'must be a six-digit hexadecimal color'});
    if (!isSafeMediaSource(value.src)) issues.push({ path: `${path}.src`, message: 'must be a safe HTTP(S), file, or local source without control characters' });
    if (value.trimStartInFrames !== undefined && (!isFiniteInteger(value.trimStartInFrames) || value.trimStartInFrames < 0)) {
      issues.push({ path: `${path}.trimStartInFrames`, message: 'must be a non-negative integer' });
    }
    if (value.kind === 'video' && value.volume !== undefined && (typeof value.volume !== 'number' || value.volume < 0 || value.volume > 1)) {
      issues.push({ path: `${path}.volume`, message: 'must be between 0 and 1' });
    }
    if (value.kind === 'video' && value.fit !== undefined && !['cover', 'contain'].includes(String(value.fit))) issues.push({path:`${path}.fit`,message:'must be cover or contain'});
    if (value.kind === 'video' && value.position !== undefined && (typeof value.position !== 'string' || !/^\d+(?:\.\d+)?% \d+(?:\.\d+)?%$/.test(value.position) || value.position.split(' ').some(part=>Number.parseFloat(part)>100))) issues.push({path:`${path}.position`,message:'must be bounded percentage coordinates'});
    if (value.kind === 'image') {
      if (value.fit !== undefined && !['cover', 'contain', 'fill'].includes(value.fit as string)) issues.push({ path: `${path}.fit`, message: 'must be cover, contain, or fill' });
      if (value.position !== undefined && !isBoundedString(value.position, 128)) issues.push({ path: `${path}.position`, message: 'must be a bounded position string' });
      return issues.length ? { issues } : { item: value as unknown as ImageRenderItem, issues };
    }
    return issues.length ? { issues } : { item: value as unknown as VideoRenderItem, issues };
  }

  if (value.kind === 'motion-graphics') {
    if (!isBoundedString(value.templateId, 128)) issues.push({ path: `${path}.templateId`, message: 'must be a non-empty template identifier' });
    if (!isRecord(value.props)) issues.push({ path: `${path}.props`, message: 'must be a JSON object' });
    if (isBoundedString(value.templateId, 128) && !(SUPPORTED_MOTION_TEMPLATE_IDS as readonly string[]).includes(value.templateId)) {
      issues.push({ path: `${path}.templateId`, message: `must be one of: ${SUPPORTED_MOTION_TEMPLATE_IDS.join(', ')}` });
    }
    if (isRecord(value.props) && value.props.layoutVersion === 2) {
      try { parseGraphicsV2Render(value.templateId, value.props, Number(value.durationInFrames), fps); } catch (error) { issues.push({ path: `${path}.props`, message: error instanceof Error ? error.message : 'Invalid responsive graphic.' }); }
    } else {
      if (['product-ui', 'bar-chart', 'explainer-steps'].includes(String(value.templateId))) issues.push({ path: `${path}.props.layoutVersion`, message: 'requires layoutVersion2' });
      if (isRecord(value.props)) issues.push(...validateTemplateProps(value.props, `${path}.props`));
    }
    if (isRecord(value.props) && isBoundedString(value.templateId, 128)) {
      const props = value.props;
      if (['kinetic-title', 'brand-card', 'feature-callout', 'end-card'].includes(value.templateId) && !isBoundedString(props.title, 240)) {
        issues.push({ path: `${path}.props.title`, message: 'must be a non-empty string of at most 240 characters' });
      }
      if (value.templateId === 'feature-callout' && !isBoundedString(props.feature, 240)) {
        issues.push({ path: `${path}.props.feature`, message: 'must be a non-empty string of at most 240 characters' });
      }
      for (const key of ['accentColor', 'backgroundColor', 'textColor']) {
        if (props[key] !== undefined && (typeof props[key] !== 'string' || !/^#[\da-f]{6}$/i.test(props[key] as string))) {
          issues.push({ path: `${path}.props.${key}`, message: 'must be a six-digit hex color' });
        }
      }
      if (props.logoUrl !== undefined && !isSafeMediaSource(props.logoUrl)) {
        issues.push({ path: `${path}.props.logoUrl`, message: 'must be a safe stored media URL' });
      }
    }
    return issues.length ? { issues } : { item: value as unknown as MotionGraphicsRenderItem, issues };
  }

  issues.push({ path: `${path}.kind`, message: 'must be video, image, or motion-graphics' });
  return { issues };
}

function validateAudioTrack(value: unknown, index: number, outputDuration: number): { value?: AudioTrack; issues: ValidationIssue[] } {
  const path = `audioTracks[${index}]`;
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { issues: [{ path, message: 'must be an object' }] };
  if (!isBoundedString(value.id, 128)) issues.push({ path: `${path}.id`, message: 'must be a non-empty bounded string' });
  if (!isSafeMediaSource(value.src)) issues.push({ path: `${path}.src`, message: 'must be a safe HTTP(S), file, or local source without control characters' });
  if (!isFiniteInteger(value.startFrame) || value.startFrame < 0) issues.push({ path: `${path}.startFrame`, message: 'must be a non-negative integer' });
  if (!isFiniteInteger(value.durationInFrames) || value.durationInFrames <= 0) issues.push({ path: `${path}.durationInFrames`, message: 'must be a positive integer' });
  if (isFiniteInteger(value.startFrame) && isFiniteInteger(value.durationInFrames) && value.startFrame + value.durationInFrames > outputDuration) issues.push({ path, message: 'frame window must fit inside output.durationInFrames' });
  for (const key of ['trimStartInFrames', 'fadeInFrames', 'fadeOutFrames']) {
    if (value[key] !== undefined && (!isFiniteInteger(value[key]) || (value[key] as number) < 0)) issues.push({ path: `${path}.${key}`, message: 'must be a non-negative integer' });
  }
  if (value.volume !== undefined && (typeof value.volume !== 'number' || value.volume < 0 || value.volume > 2)) issues.push({ path: `${path}.volume`, message: 'must be between 0 and 2' });
  if (value.role !== undefined && !['dialogue', 'voiceover', 'music', 'ambience', 'sfx'].includes(value.role as string)) issues.push({ path: `${path}.role`, message: 'must be a supported audio role' });
  return issues.length ? { issues } : { value: value as unknown as AudioTrack, issues };
}

export function validateCaptionStyle(style: unknown, path = 'caption.style'): ValidationIssue[] {
  if (!isRecord(style)) return [{ path, message: 'must be a caption style object' }];
  const issues: ValidationIssue[] = [];
  const keys = ['fontSize', 'color', 'backgroundColor', 'position', 'maxLines'];
  for (const key of Object.keys(style)) if (!keys.includes(key)) issues.push({ path: `${path}.${key}`, message: 'is not an allowed caption style property' });
  if (style.fontSize !== undefined && (!isFiniteInteger(style.fontSize) || style.fontSize < 12 || style.fontSize > 120)) issues.push({ path: `${path}.fontSize`, message: 'must be an integer from 12 to 120 pixels' });
  if (style.color !== undefined && (typeof style.color !== 'string' || !/^#[\da-f]{6}$/i.test(style.color))) issues.push({ path: `${path}.color`, message: 'must be a six-digit hex color' });
  if (style.backgroundColor !== undefined && (typeof style.backgroundColor !== 'string' || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(style.backgroundColor))) issues.push({ path: `${path}.backgroundColor`, message: 'must be a six- or eight-digit hex color' });
  if (style.position !== undefined && !['TOP', 'CENTER', 'BOTTOM'].includes(String(style.position))) issues.push({ path: `${path}.position`, message: 'must be TOP, CENTER, or BOTTOM' });
  if (style.maxLines !== undefined && (!isFiniteInteger(style.maxLines) || style.maxLines < 1 || style.maxLines > 4)) issues.push({ path: `${path}.maxLines`, message: 'must be an integer from 1 to 4' });
  return issues;
}

export function validateCaptionText(text: unknown, path = 'caption.text'): ValidationIssue[] {
  if (typeof text !== 'string' || !text.trim() || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) || /\r(?!\n)/.test(text) || text.replace(/\r\n/g, '\n').split('\n').some(line => !line.trim())) return [{ path, message: 'must be complete plain caption text without markup, control characters, or blank separator lines' }];
  return [];
}

function validateCaptionTrack(value: unknown, index: number, outputDuration: number, version: unknown): { value?: CaptionTrack; issues: ValidationIssue[] } {
  const path = `captionTracks[${index}]`;
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { issues: [{ path, message: 'must be an object' }] };
  if (!isBoundedString(value.id, 128)) issues.push({ path: `${path}.id`, message: 'must be a non-empty bounded string' });
  if (!isBoundedString(value.language, 32)) issues.push({ path: `${path}.language`, message: 'must be a non-empty language tag' });
  if (!Array.isArray(value.cues) || value.cues.length === 0) issues.push({ path: `${path}.cues`, message: 'must contain at least one cue' });
  if (Array.isArray(value.cues) && value.cues.length > RENDER_LIMITS.maxCaptionCues) issues.push({ path: `${path}.cues`, message: `must contain at most ${RENDER_LIMITS.maxCaptionCues} cues` });
  const cueIds = new Set<string>();
  if (Array.isArray(value.cues)) value.cues.forEach((cue, cueIndex) => {
    const cuePath = `${path}.cues[${cueIndex}]`;
    if (!isRecord(cue)) { issues.push({ path: cuePath, message: 'must be an object' }); return; }
    if (!isBoundedString(cue.id, 128)) issues.push({ path: `${cuePath}.id`, message: 'must be a non-empty bounded string' });
    if (typeof cue.id === 'string' && cueIds.has(cue.id)) issues.push({ path: `${cuePath}.id`, message: 'must be unique within the caption track' });
    if (typeof cue.id === 'string') cueIds.add(cue.id);
    if (!isFiniteInteger(cue.startFrame) || cue.startFrame < 0) issues.push({ path: `${cuePath}.startFrame`, message: 'must be a non-negative integer' });
    if (!isFiniteInteger(cue.durationInFrames) || cue.durationInFrames <= 0) issues.push({ path: `${cuePath}.durationInFrames`, message: 'must be a positive integer' });
    if (isFiniteInteger(cue.startFrame) && isFiniteInteger(cue.durationInFrames) && cue.startFrame + cue.durationInFrames > outputDuration) issues.push({ path: cuePath, message: 'frame window must fit inside output.durationInFrames' });
    if (!isBoundedString(cue.text, 1_024)) issues.push({ path: `${cuePath}.text`, message: 'must be a non-empty string of at most 1024 characters' });
    if (version === 5) issues.push(...validateCaptionText(cue.text, `${cuePath}.text`));
    if (cue.speaker !== undefined && !isBoundedString(cue.speaker, 128)) issues.push({ path: `${cuePath}.speaker`, message: 'must be a bounded string' });
  });
  if (value.style !== undefined && !isRecord(value.style)) issues.push({ path: `${path}.style`, message: 'must be a JSON object' });
  else if (value.style !== undefined && version === 5) issues.push(...validateCaptionStyle(value.style, `${path}.style`));
  return issues.length ? { issues } : { value: value as unknown as CaptionTrack, issues };
}

function validateV5Composition(input: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const tracks = new Map<string, Record<string, unknown>>();
  const kinds = ['VIDEO', 'IMAGE', 'GRAPHIC', 'AUDIO', 'CAPTIONS'];
  if (input.tracks !== undefined && !Array.isArray(input.tracks)) issues.push({ path: '$.tracks', message: 'must be an array' });
  if (Array.isArray(input.tracks)) {
    if (input.tracks.length > RENDER_LIMITS.maxItems + RENDER_LIMITS.maxAudioTracks + RENDER_LIMITS.maxCaptionTracks) issues.push({ path: '$.tracks', message: 'exceeds the bounded track count' });
    input.tracks.forEach((track, index) => {
      const path = `tracks[${index}]`;
      if (!isRecord(track)) { issues.push({ path, message: 'must be a track object' }); return; }
      if (!isBoundedString(track.id, 128)) issues.push({ path: `${path}.id`, message: 'must be a bounded track ID' });
      if (!kinds.includes(String(track.kind))) issues.push({ path: `${path}.kind`, message: 'must be a supported track kind' });
      if (!isFiniteInteger(track.orderIndex) || track.orderIndex < 0) issues.push({ path: `${path}.orderIndex`, message: 'must be a non-negative integer' });
      if (track.name !== undefined && !isBoundedString(track.name, 160)) issues.push({ path: `${path}.name`, message: 'must be a bounded track name' });
      if (typeof track.id === 'string') {
        if (tracks.has(track.id)) issues.push({ path: `${path}.id`, message: 'must be unique within the manifest' });
        tracks.set(track.id, track);
      }
    });
  }
  function checkTrack(row: Record<string, unknown>, path: string, audio: boolean) {
    if (row.trackId === undefined) return;
    if (!isBoundedString(row.trackId, 128)) { issues.push({ path: `${path}.trackId`, message: 'must be a bounded track ID' }); return; }
    const track = tracks.get(row.trackId);
    if (!track || (audio ? track.kind !== 'AUDIO' : !['VIDEO', 'IMAGE', 'GRAPHIC'].includes(String(track.kind)))) issues.push({ path: `${path}.trackId`, message: audio ? 'must resolve to an AUDIO track' : 'must resolve to a visual track' });
  }
  const items = (Array.isArray(input.items) ? input.items : []).filter(isRecord);
  items.forEach((item, index) => {
    checkTrack(item, `items[${index}]`, false);
    if (item.orderIndex !== undefined && (!isFiniteInteger(item.orderIndex) || item.orderIndex < 0)) issues.push({ path: `items[${index}].orderIndex`, message: 'must be a non-negative integer' });
  });
  if (Array.isArray(input.audioTracks)) input.audioTracks.forEach((track, index) => {
    if (!isRecord(track)) return;
    checkTrack(track, `audioTracks[${index}]`, true);
    for (const key of ['fadeInFrames', 'fadeOutFrames']) if (isFiniteInteger(track[key]) && isFiniteInteger(track.durationInFrames) && track[key] > track.durationInFrames) issues.push({ path: `audioTracks[${index}].${key}`, message: 'must fit inside the audio clip duration' });
  });
  const byId = new Map(items.map(item => [item.id, item]));
  const lanes = new Map<unknown, Record<string, unknown>[]>();
  for (const item of items) {
    const lane = lanes.get(item.trackId) ?? [];
    lane.push(item); lanes.set(item.trackId, lane);
  }
  for (const lane of lanes.values()) lane.sort((a, b) => Number(a.startFrame) - Number(b.startFrame) || Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0));
  const transitionIds = new Set<string>();
  const incoming = new Set<unknown>();
  const outgoing = new Set<unknown>();
  const pairs = new Set<string>();
  if (input.transitions !== undefined && !Array.isArray(input.transitions)) issues.push({ path: '$.transitions', message: 'must be an array' });
  if (Array.isArray(input.transitions)) {
    if (input.transitions.length > RENDER_LIMITS.maxItems) issues.push({ path: '$.transitions', message: 'exceeds the bounded transition count' });
    input.transitions.forEach((transition, index) => {
      const path = `transitions[${index}]`;
      if (!isRecord(transition)) { issues.push({ path, message: 'must be a transition object' }); return; }
      if (!isBoundedString(transition.id, 128) || transitionIds.has(String(transition.id))) issues.push({ path: `${path}.id`, message: 'must be a unique bounded transition ID' });
      transitionIds.add(String(transition.id));
      if (!['DISSOLVE', 'FADE', 'WIPE', 'SLIDE'].includes(String(transition.kind))) issues.push({ path: `${path}.kind`, message: 'must be DISSOLVE, FADE, WIPE, or SLIDE; CUT is represented by no transition' });
      if (!['PRESERVE', 'CROSSFADE'].includes(String(transition.audioPolicy))) issues.push({ path: `${path}.audioPolicy`, message: 'must explicitly specify PRESERVE or CROSSFADE' });
      const from = byId.get(transition.fromItemId);
      const to = byId.get(transition.toItemId);
      const duration = transition.durationInFrames;
      const fps = isRecord(input.output) ? input.output.fps : undefined;
      if (!isFiniteInteger(duration) || duration < 1 || !isFiniteInteger(fps) || duration > 2 * fps) issues.push({ path: `${path}.durationInFrames`, message: 'must be a positive integer of at most two seconds' });
      if (!from || !to || from === to) { issues.push({ path, message: 'must reference two distinct visual item IDs' }); return; }
      if (from.trackId !== to.trackId) issues.push({ path, message: 'transition items must be on the same visual track' });
      const lane = lanes.get(from.trackId) ?? [];
      if (lane.indexOf(to) !== lane.indexOf(from) + 1 || (isFiniteInteger(from.orderIndex) && isFiniteInteger(to.orderIndex) && from.orderIndex >= to.orderIndex)) issues.push({ path, message: 'transition items must be adjacent in forward timeline order' });
      if (!isFiniteInteger(duration) || !isFiniteInteger(from.durationInFrames) || !isFiniteInteger(to.durationInFrames) || duration > from.durationInFrames / 2 || duration > to.durationInFrames / 2) issues.push({ path: `${path}.durationInFrames`, message: 'must not exceed half of either item duration' });
      if (!isFiniteInteger(from.startFrame) || !isFiniteInteger(from.durationInFrames) || !isFiniteInteger(to.startFrame) || to.startFrame !== from.startFrame + from.durationInFrames - Number(duration)) issues.push({ path, message: 'explicit item overlap must equal the transition duration' });
      if (outgoing.has(from.id) || incoming.has(to.id)) issues.push({ path, message: 'an item may have at most one incoming and one outgoing transition' });
      outgoing.add(from.id); incoming.add(to.id);
      pairs.add(JSON.stringify([from.id, to.id]));
    });
  }
  for (const lane of lanes.values()) for (let index = 1; index < lane.length; index++) {
    const from = lane[index - 1]; const to = lane[index];
    if (Number(from.startFrame) + Number(from.durationInFrames) > Number(to.startFrame) && !pairs.has(JSON.stringify([from.id, to.id]))) issues.push({ path: '$.items', message: 'same-track picture overlaps require an explicit transition' });
  }
  return issues;
}

function validatePoster(value: unknown): { value?: PosterSpec; issues: ValidationIssue[] } {
  const path = 'poster';
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { issues: [{ path, message: 'must be an object' }] };
  if (!isSafeMediaSource(value.src)) issues.push({ path: `${path}.src`, message: 'must be a safe HTTP(S), file, or local source without control characters' });
  if(value.assetId!==undefined&&(typeof value.assetId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(value.assetId)))issues.push({path:`${path}.assetId`,message:'must be a bounded canonical asset identifier'});
  if (!isFiniteInteger(value.width) || value.width < 1 || value.width > RENDER_LIMITS.maxWidth) issues.push({ path: `${path}.width`, message: 'must be a positive bounded integer' });
  if (!isFiniteInteger(value.height) || value.height < 1 || value.height > RENDER_LIMITS.maxHeight) issues.push({ path: `${path}.height`, message: 'must be a positive bounded integer' });
  if (value.mimeType !== undefined && !['image/jpeg', 'image/png', 'image/webp'].includes(value.mimeType as string)) issues.push({ path: `${path}.mimeType`, message: 'must be jpeg, png, or webp' });
  return issues.length ? { issues } : { value: value as unknown as PosterSpec, issues };
}

function validateShotManifest(value: unknown, index: number, outputDuration: number): { value?: ShotManifestEntry; issues: ValidationIssue[] } {
  const path = `shots[${index}]`;
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { issues: [{ path, message: 'must be an object' }] };
  for (const key of ['shotId', 'shotVersionId', 'assetId', 'itemId', 'src']) if (!isBoundedString(value[key], 2048)) issues.push({ path: `${path}.${key}`, message: 'must be a non-empty bounded string' });
  if (!isFiniteInteger(value.orderIndex) || value.orderIndex < 0) issues.push({ path: `${path}.orderIndex`, message: 'must be a non-negative integer' });
  if (!isFiniteInteger(value.startFrame) || value.startFrame < 0) issues.push({ path: `${path}.startFrame`, message: 'must be a non-negative integer' });
  if (!isFiniteInteger(value.durationInFrames) || value.durationInFrames <= 0) issues.push({ path: `${path}.durationInFrames`, message: 'must be a positive integer' });
  if (isFiniteInteger(value.startFrame) && isFiniteInteger(value.durationInFrames) && value.startFrame + value.durationInFrames > outputDuration) issues.push({ path, message: 'frame window must fit inside output.durationInFrames' });
  if (value.title !== undefined && !isBoundedString(value.title, 256)) issues.push({ path: `${path}.title`, message: 'must be a bounded string' });
  return issues.length ? { issues } : { value: value as unknown as ShotManifestEntry, issues };
}

export function validateManifest(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) return { ok: false, issues: [{ path: '$', message: 'manifest must be an object' }] };

  if (input.kind !== RENDER_MANIFEST_KIND) issues.push({ path: '$.kind', message: `must equal ${RENDER_MANIFEST_KIND}` });
  if (!SUPPORTED_RENDER_MANIFEST_VERSIONS.includes(input.version as 1 | 2 | 4 | 5)) issues.push({ path: '$.version', message: `must be one of: ${SUPPORTED_RENDER_MANIFEST_VERSIONS.join(', ')}` });
  for (const key of ['manifestId', 'projectId', 'rendererVersion']) {
    if (!isBoundedString(input[key])) issues.push({ path: `$.${key}`, message: 'must be a non-empty bounded string' });
  }

  if (input.version === 4 || input.version === 5) {
    if (!isRecord(input.selection)) issues.push({ path: '$.selection', message: 'manifest v4 requires a selection object' });
    else {
      if (!SELECTION_SCOPES.includes(input.selection.scope as RenderSelectionScope)) issues.push({ path: '$.selection.scope', message: 'must be a supported selection scope' });
      if (!Array.isArray(input.selection.ids) || input.selection.ids.some((id) => !isBoundedString(id, 256))) issues.push({ path: '$.selection.ids', message: 'must be an array of bounded IDs' });
      if (['SCENES', 'SHOTS'].includes(String(input.selection.scope)) && Array.isArray(input.selection.ids) && input.selection.ids.length === 0) issues.push({ path: '$.selection.ids', message: 'must contain selected IDs for a scoped manifest' });
    }
    if (!isRecord(input.export)) issues.push({ path: '$.export', message: 'manifest v4 requires an export object' });
    else {
      if (!SELECTION_SCOPES.includes(input.export.scope as RenderSelectionScope)) issues.push({ path: '$.export.scope', message: 'must be a supported export scope' });
      if (!['MP4', 'WEBM', 'MOV'].includes(input.export.format as string)) issues.push({ path: '$.export.format', message: 'must be MP4, WEBM, or MOV' });
    }
  }

  const output = input.output;
  if (isRecord(input.metadata) && input.metadata.formatVariant !== undefined) {
    const variant=input.metadata.formatVariant;
    try {
      if(input.version!==5||!isRecord(variant)||variant.version!==FORMAT_VARIANT_VERSION||
        !isBoundedString(variant.sourceTimelineId,256)||!isBoundedString(variant.rootTimelineId,256)||
        !isFiniteInteger(variant.sourceVersionNumber)||variant.sourceVersionNumber<1||
        !(variant.sourceUpdatedAt===null||typeof variant.sourceUpdatedAt==='number'&&Number.isFinite(variant.sourceUpdatedAt))) throw new Error('Invalid variant lineage');
      variantFraming(variant);
      const selected=getOutputPreset(variant.presetId);
      if(!isRecord(output)||output.presetId!==selected.id)throw new Error('Invalid variant output');
    }catch{issues.push({path:'$.metadata.formatVariant',message:'requires exact v5 format lineage, framing and output preset'});}
  }
  if (!isRecord(output)) {
    issues.push({ path: '$.output', message: 'must be an object' });
  } else {
    if (output.presetId !== undefined) {
      try {
        const preset=getOutputPreset(output.presetId);
        if (input.version!==5 || preset.id!==output.presetId || preset.width!==output.width || preset.height!==output.height || !OUTPUT_FPS.includes(output.fps as typeof OUTPUT_FPS[number])) throw new Error('Invalid preset');
      } catch { issues.push({path:'$.output.presetId',message:'must match an exact supported v5 output preset and frame rate'}); }
    }
    if (!isFiniteInteger(output.width) || output.width < 1 || output.width > RENDER_LIMITS.maxWidth) issues.push({ path: '$.output.width', message: `must be an integer from 1 to ${RENDER_LIMITS.maxWidth}` });
    if (!isFiniteInteger(output.height) || output.height < 1 || output.height > RENDER_LIMITS.maxHeight) issues.push({ path: '$.output.height', message: `must be an integer from 1 to ${RENDER_LIMITS.maxHeight}` });
    if (!isFiniteInteger(output.fps) || output.fps < 1 || output.fps > RENDER_LIMITS.maxFps) issues.push({ path: '$.output.fps', message: `must be an integer from 1 to ${RENDER_LIMITS.maxFps}` });
    if (!isFiniteInteger(output.durationInFrames) || output.durationInFrames < 1 || output.durationInFrames > RENDER_LIMITS.maxDurationInFrames) issues.push({ path: '$.output.durationInFrames', message: `must be an integer from 1 to ${RENDER_LIMITS.maxDurationInFrames}` });
    if (!['h264', 'vp9', 'prores'].includes(output.codec as string)) issues.push({ path: '$.output.codec', message: 'must be h264, vp9, or prores' });
    if (output.audio !== undefined && (!isRecord(output.audio) || ![44100, 48000].includes(output.audio.sampleRate as number) || ![1, 2].includes(output.audio.channels as number))) {
      issues.push({ path: '$.output.audio', message: 'must specify sampleRate 44100/48000 and channels 1/2' });
    }
  }

  if (!Array.isArray(input.items)) {
    issues.push({ path: '$.items', message: 'must be an array' });
  } else if (input.items.length === 0) {
    issues.push({ path: '$.items', message: 'must contain at least one item' });
  } else if (input.items.length > RENDER_LIMITS.maxItems) {
    issues.push({ path: '$.items', message: `must contain at most ${RENDER_LIMITS.maxItems} items` });
  } else {
    const outputDuration = isRecord(output) && isFiniteInteger(output.durationInFrames) ? output.durationInFrames : 0;
    const ids = new Set<string>();
    input.items.forEach((value, index) => {
      if(input.version!==5&&isRecord(value)&&value.kind==='motion-graphics'&&(isRecord(value.props)&&value.props.layoutVersion===2||['product-ui','bar-chart','explainer-steps'].includes(String(value.templateId))))issues.push({path:`items[${index}]`,message:'Responsive graphics require manifest v5.'});
      const result = validateItem(value, index, outputDuration, isRecord(output)?Number(output.fps):0);
      issues.push(...result.issues);
      if (result.item) {
        if (ids.has(result.item.id)) issues.push({ path: `items[${index}].id`, message: 'must be unique within the manifest' });
        ids.add(result.item.id);
      }
    });
  }

  if (Array.isArray(input.audioTracks)) {
    if (input.audioTracks.length > RENDER_LIMITS.maxAudioTracks) issues.push({ path: '$.audioTracks', message: `must contain at most ${RENDER_LIMITS.maxAudioTracks} tracks` });
    const ids = new Set<string>();
    input.audioTracks.forEach((value, index) => {
      const result = validateAudioTrack(value, index, isRecord(output) && isFiniteInteger(output.durationInFrames) ? output.durationInFrames : 0);
      issues.push(...result.issues);
      if (result.value && ids.has(result.value.id)) issues.push({ path: `audioTracks[${index}].id`, message: 'must be unique within the manifest' });
      if (result.value) ids.add(result.value.id);
    });
  } else if (input.audioTracks !== undefined) issues.push({ path: '$.audioTracks', message: 'must be an array' });

  if (Array.isArray(input.captionTracks)) {
    if (input.captionTracks.length > RENDER_LIMITS.maxCaptionTracks) issues.push({ path: '$.captionTracks', message: `must contain at most ${RENDER_LIMITS.maxCaptionTracks} tracks` });
    const trackIds = new Set<string>();
    input.captionTracks.forEach((value, index) => {
      issues.push(...validateCaptionTrack(value, index, isRecord(output) && isFiniteInteger(output.durationInFrames) ? output.durationInFrames : 0, input.version).issues);
      if (input.version === 5 && isRecord(value) && typeof value.id === 'string') {
        if (trackIds.has(value.id)) issues.push({ path: `captionTracks[${index}].id`, message: 'must be unique within the manifest' });
        trackIds.add(value.id);
      }
    });
  } else if (input.captionTracks !== undefined) issues.push({ path: '$.captionTracks', message: 'must be an array' });

  if (Array.isArray(input.shots)) {
    if (input.shots.length > RENDER_LIMITS.maxShots) issues.push({ path: '$.shots', message: `must contain at most ${RENDER_LIMITS.maxShots} shots` });
    const ids = new Set<string>();
    input.shots.forEach((value, index) => {
      const result = validateShotManifest(value, index, isRecord(output) && isFiniteInteger(output.durationInFrames) ? output.durationInFrames : 0);
      issues.push(...result.issues);
      // Splitting/reusing a take creates several legitimate occurrences of
      // one shot. Timeline item identity, rather than shot identity, is unique.
      if (result.value && ids.has(result.value.itemId)) issues.push({ path: `shots[${index}].itemId`, message: 'must be unique within the manifest' });
      if (result.value) {
        ids.add(result.value.itemId);
        if (input.version === 4 || input.version === 5) {
          const item = Array.isArray(input.items) ? input.items.find(value => isRecord(value) && value.id === result.value?.itemId) : undefined;
          if (!isRecord(item) || item.shotId !== result.value.shotId || item.shotVersionId !== result.value.shotVersionId || item.assetId !== result.value.assetId) issues.push({ path: `shots[${index}].itemId`, message: 'must resolve to the same shot, take, and asset as its timeline item' });
        }
      }
    });
  } else if (input.shots !== undefined) issues.push({ path: '$.shots', message: 'must be an array' });

  if (input.poster !== undefined) issues.push(...validatePoster(input.poster).issues);
  if (input.metadata !== undefined && !isRecord(input.metadata)) issues.push({ path: '$.metadata', message: 'must be a JSON object' });
  if (input.version === 5) issues.push(...validateV5Composition(input));

  return { ok: issues.length === 0, issues };
}

export function parseManifest(input: unknown): Validated<RenderManifest> {
  const result = validateManifest(input);
  return result.ok ? { ok: true, value: input as RenderManifest } : { ok: false, issues: result.issues };
}

export function assertValidManifest(input: unknown): RenderManifest {
  const result = parseManifest(input);
  if (!result.ok) {
    throw new Error(`Invalid render manifest:\n${result.issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`);
  }
  return result.value;
}

export function assertLockedManifest(input: unknown): RenderManifest {
  const manifest = assertValidManifest(input);
  const result = validateLockedManifest(manifest);
  if (!result.ok) {
    throw new Error(`Render manifest is not locked for production:\n${result.issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`);
  }
  return manifest;
}

export function getLockedManifestMetadata(manifest: RenderManifest): LockedManifestMetadata {
  assertLockedManifest(manifest);
  return manifest.metadata as unknown as LockedManifestMetadata;
}
