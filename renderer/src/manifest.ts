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
} from './types.js';
import { SUPPORTED_MOTION_TEMPLATE_IDS } from './templates/contract.js';

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

function isSafeMediaSource(value: unknown): value is string {
  if (!isBoundedString(value, 2_048) || /[\u0000\r\n]/.test(value)) return false;
  // Successful renders may only reference user/provider media, never test fixtures or placeholders.
  if (/(?:^|[/:._-])(mock|sample|placeholder)(?:[/:._-]|$)|example\.(?:com|test)(?:[/:?#]|$)/i.test(value)) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return /^(https?|file):/i.test(value);
  return true;
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

function validateItem(value: unknown, index: number, outputDuration: number): { item?: RenderItem; issues: ValidationIssue[] } {
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
    if (!isSafeMediaSource(value.src)) issues.push({ path: `${path}.src`, message: 'must be a safe HTTP(S), file, or local source without control characters' });
    if (value.trimStartInFrames !== undefined && (!isFiniteInteger(value.trimStartInFrames) || value.trimStartInFrames < 0)) {
      issues.push({ path: `${path}.trimStartInFrames`, message: 'must be a non-negative integer' });
    }
    if (value.kind === 'video' && value.volume !== undefined && (typeof value.volume !== 'number' || value.volume < 0 || value.volume > 1)) {
      issues.push({ path: `${path}.volume`, message: 'must be between 0 and 1' });
    }
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
    if (isRecord(value.props)) issues.push(...validateTemplateProps(value.props, `${path}.props`));
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

function validateCaptionTrack(value: unknown, index: number, outputDuration: number): { value?: CaptionTrack; issues: ValidationIssue[] } {
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
    if (cue.speaker !== undefined && !isBoundedString(cue.speaker, 128)) issues.push({ path: `${cuePath}.speaker`, message: 'must be a bounded string' });
  });
  if (value.style !== undefined && !isRecord(value.style)) issues.push({ path: `${path}.style`, message: 'must be a JSON object' });
  return issues.length ? { issues } : { value: value as unknown as CaptionTrack, issues };
}

function validatePoster(value: unknown): { value?: PosterSpec; issues: ValidationIssue[] } {
  const path = 'poster';
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return { issues: [{ path, message: 'must be an object' }] };
  if (!isSafeMediaSource(value.src)) issues.push({ path: `${path}.src`, message: 'must be a safe HTTP(S), file, or local source without control characters' });
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
  if (!SUPPORTED_RENDER_MANIFEST_VERSIONS.includes(input.version as 1 | 2)) issues.push({ path: '$.version', message: `must be one of: ${SUPPORTED_RENDER_MANIFEST_VERSIONS.join(', ')}` });
  for (const key of ['manifestId', 'projectId', 'rendererVersion']) {
    if (!isBoundedString(input[key])) issues.push({ path: `$.${key}`, message: 'must be a non-empty bounded string' });
  }

  const output = input.output;
  if (!isRecord(output)) {
    issues.push({ path: '$.output', message: 'must be an object' });
  } else {
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
      const result = validateItem(value, index, outputDuration);
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
    input.captionTracks.forEach((value, index) => issues.push(...validateCaptionTrack(value, index, isRecord(output) && isFiniteInteger(output.durationInFrames) ? output.durationInFrames : 0).issues));
  } else if (input.captionTracks !== undefined) issues.push({ path: '$.captionTracks', message: 'must be an array' });

  if (Array.isArray(input.shots)) {
    if (input.shots.length > RENDER_LIMITS.maxShots) issues.push({ path: '$.shots', message: `must contain at most ${RENDER_LIMITS.maxShots} shots` });
    const ids = new Set<string>();
    input.shots.forEach((value, index) => {
      const result = validateShotManifest(value, index, isRecord(output) && isFiniteInteger(output.durationInFrames) ? output.durationInFrames : 0);
      issues.push(...result.issues);
      if (result.value && ids.has(result.value.shotId)) issues.push({ path: `shots[${index}].shotId`, message: 'must be unique within the manifest' });
      if (result.value) ids.add(result.value.shotId);
    });
  } else if (input.shots !== undefined) issues.push({ path: '$.shots', message: 'must be an array' });

  if (input.poster !== undefined) issues.push(...validatePoster(input.poster).issues);
  if (input.metadata !== undefined && !isRecord(input.metadata)) issues.push({ path: '$.metadata', message: 'must be a JSON object' });

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
