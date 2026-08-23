export const RENDER_MANIFEST_KIND = 'finalframe.render-manifest' as const;
export const RENDER_MANIFEST_VERSION = 1 as const;

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
}

export interface VideoRenderItem extends RenderItemBase {
  kind: 'video';
  src: string;
  trimStartInFrames?: number;
  volume?: number;
}

export interface MotionGraphicsRenderItem extends RenderItemBase {
  kind: 'motion-graphics';
  templateId: string;
  props: Record<string, unknown>;
}

export type RenderItem = VideoRenderItem | MotionGraphicsRenderItem;

export interface RenderManifest {
  kind: typeof RENDER_MANIFEST_KIND;
  version: typeof RENDER_MANIFEST_VERSION;
  manifestId: string;
  projectId: string;
  rendererVersion: string;
  output: RenderOutputSpec;
  items: RenderItem[];
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
