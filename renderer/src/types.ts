export const RENDER_MANIFEST_KIND = 'finalframe.render-manifest' as const;
export const RENDER_MANIFEST_VERSION = 2 as const;
export const SUPPORTED_RENDER_MANIFEST_VERSIONS = [1, 2] as const;

export type OutputCodec = 'h264' | 'vp9' | 'prores';

export interface RenderOutputSpec {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  codec: OutputCodec;
  audio?: {
    sampleRate: 44100 | 48000;
    channels: 1 | 2;
  };
}

export interface RenderItemBase {
  id: string;
  startFrame: number;
  durationInFrames: number;
  opacity?: number;
  orderIndex?: number;
  shotId?: string;
  shotVersionId?: string;
  assetId?: string;
}

export interface VideoRenderItem extends RenderItemBase {
  kind: 'video';
  src: string;
  trimStartInFrames?: number;
  volume?: number;
}

export interface ImageRenderItem extends RenderItemBase {
  kind: 'image';
  src: string;
  fit?: 'cover' | 'contain' | 'fill';
  position?: string;
}

export interface MotionGraphicsRenderItem extends RenderItemBase {
  kind: 'motion-graphics';
  templateId: string;
  props: Record<string, unknown>;
}

export type RenderItem = VideoRenderItem | ImageRenderItem | MotionGraphicsRenderItem;

export interface AudioTrack {
  id: string;
  src: string;
  startFrame: number;
  durationInFrames: number;
  trimStartInFrames?: number;
  volume?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  role?: 'dialogue' | 'voiceover' | 'music' | 'ambience' | 'sfx';
}

export interface CaptionCue {
  id: string;
  startFrame: number;
  durationInFrames: number;
  text: string;
  speaker?: string;
}

export interface CaptionTrack {
  id: string;
  language: string;
  cues: CaptionCue[];
  style?: Record<string, unknown>;
}

export interface PosterSpec {
  src: string;
  width: number;
  height: number;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface ShotManifestEntry {
  shotId: string;
  shotVersionId: string;
  assetId: string;
  orderIndex: number;
  itemId: string;
  title?: string;
  startFrame: number;
  durationInFrames: number;
  src: string;
}

export interface RenderManifest {
  kind: typeof RENDER_MANIFEST_KIND;
  version: 1 | typeof RENDER_MANIFEST_VERSION;
  manifestId: string;
  projectId: string;
  rendererVersion: string;
  output: RenderOutputSpec;
  items: RenderItem[];
  shots?: ShotManifestEntry[];
  audioTracks?: AudioTrack[];
  captionTracks?: CaptionTrack[];
  poster?: PosterSpec;
  metadata?: Record<string, unknown>;
}

export type RenderLifecycleState =
  | 'QUEUED'
  | 'RUNNING'
  | 'RENDERING'
  | 'UPLOADING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'RETRYABLE_FAILURE'
  | 'NON_RETRYABLE_FAILURE'
  | 'CANCELED'
  | 'TIMED_OUT';

export interface RenderFailure {
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
}

export interface RenderJobState {
  jobId: string;
  idempotencyKey: string;
  correlationId: string;
  attempt: number;
  maxAttempts: number;
  state: RenderLifecycleState;
  failure?: RenderFailure;
  nextRetryAt?: string;
}

export interface RenderResourceLimits {
  maxDurationInFrames?: number;
  maxItems?: number;
  maxAudioTracks?: number;
  maxCaptionCues?: number;
  maxOutputBytes?: number;
  maxConcurrency?: number;
  commandTimeoutMs?: number;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };
