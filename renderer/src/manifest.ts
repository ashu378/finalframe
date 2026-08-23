import {
  RENDER_MANIFEST_KIND,
  RENDER_MANIFEST_VERSION,
  type MotionGraphicsRenderItem,
  type RenderItem,
  type RenderManifest,
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
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);

const isBoundedString = (value: unknown, max: number = RENDER_LIMITS.maxStringLength): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

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

  if (value.kind === 'video') {
    if (!isBoundedString(value.src, 2048)) issues.push({ path: `${path}.src`, message: 'must be a non-empty source URL or path' });
    if (value.trimStartInFrames !== undefined && (!isFiniteInteger(value.trimStartInFrames) || value.trimStartInFrames < 0)) {
      issues.push({ path: `${path}.trimStartInFrames`, message: 'must be a non-negative integer' });
    }
    if (value.volume !== undefined && (typeof value.volume !== 'number' || value.volume < 0 || value.volume > 1)) {
      issues.push({ path: `${path}.volume`, message: 'must be between 0 and 1' });
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

  issues.push({ path: `${path}.kind`, message: 'must be either video or motion-graphics' });
  return { issues };
}

export function validateManifest(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) return { ok: false, issues: [{ path: '$', message: 'manifest must be an object' }] };

  if (input.kind !== RENDER_MANIFEST_KIND) issues.push({ path: '$.kind', message: `must equal ${RENDER_MANIFEST_KIND}` });
  if (input.version !== RENDER_MANIFEST_VERSION) issues.push({ path: '$.version', message: `must equal ${RENDER_MANIFEST_VERSION}` });
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
