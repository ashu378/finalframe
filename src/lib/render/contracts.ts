/**
 * Provider- and renderer-neutral contracts for assembling FinalFrame media.
 *
 * These contracts describe the immutable inputs to a renderer. They do not
 * call Convex, FFmpeg, Remotion, or a provider. The renderer may evolve
 * independently as long as it continues to accept these shapes.
 */

export type TimelineVersionStatus =
    | 'DRAFT'
    | 'READY_FOR_REVIEW'
    | 'APPROVED'
    | 'LOCKED'
    | 'SUPERSEDED';

export type TrackKind = 'VIDEO' | 'IMAGE' | 'GRAPHIC' | 'AUDIO' | 'CAPTIONS';
export type ClipKind = TrackKind;
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add';
export type FitMode = 'contain' | 'cover' | 'stretch' | 'none';
export type TransitionKind = 'CUT' | 'DISSOLVE' | 'FADE' | 'WIPE' | 'SLIDE';

export interface TimelineTimeRange {
    startSeconds: number;
    durationSeconds: number;
}

export interface MediaSourceRef {
    assetId: string;
    storageId?: string;
    url?: string;
    mimeType?: string;
    checksum?: string;
}

export interface Transform2D {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotationDegrees: number;
    anchorX: number;
    anchorY: number;
}

export interface ClipTransition {
    kind: TransitionKind;
    durationSeconds: number;
}

export interface TimelineClipBase extends TimelineTimeRange {
    id: string;
    trackId: string;
    kind: ClipKind;
    sourceStartSeconds?: number;
    sourceDurationSeconds?: number;
    opacity?: number;
    blendMode?: BlendMode;
    transform?: Transform2D;
    transitionIn?: ClipTransition;
    transitionOut?: ClipTransition;
    metadata?: Record<string, unknown>;
}

export interface VideoClip extends TimelineClipBase {
    kind: 'VIDEO';
    media: MediaSourceRef;
    fit?: FitMode;
    playbackRate?: number;
}

export interface ImageClip extends TimelineClipBase {
    kind: 'IMAGE';
    media: MediaSourceRef;
    fit?: FitMode;
}

export interface GraphicClip extends TimelineClipBase {
    kind: 'GRAPHIC';
    templateId: string;
    props: Record<string, unknown>;
}

export interface AudioClip extends TimelineClipBase {
    kind: 'AUDIO';
    media: MediaSourceRef;
    volumeDb?: number;
    pan?: number;
    fadeInSeconds?: number;
    fadeOutSeconds?: number;
    duckingGroup?: string;
}

export interface CaptionClip extends TimelineClipBase {
    kind: 'CAPTIONS';
    captionTrackId: string;
}

export type TimelineClip = VideoClip | ImageClip | GraphicClip | AudioClip | CaptionClip;

export interface TimelineTrack {
    id: string;
    kind: TrackKind;
    name: string;
    orderIndex: number;
    muted: boolean;
    locked: boolean;
    clips: TimelineClip[];
}

export interface TimelineVersion {
    id: string;
    productionId: string;
    version: number;
    status: TimelineVersionStatus;
    width: number;
    height: number;
    frameRate: number;
    durationSeconds: number;
    tracks: TimelineTrack[];
    captionTrackIds: string[];
    audioMixId?: string;
    sourceVersionId?: string;
    createdAt: string;
    createdBy: string;
    approvedAt?: string;
}

export type CaptionFormat = 'WEBVTT' | 'SRT' | 'ASS' | 'BURN_IN';

export interface CaptionCue {
    id: string;
    startSeconds: number;
    endSeconds: number;
    text: string;
    speakerLabel?: string;
    confidence?: number;
}

export interface CaptionStyle {
    fontFamily: string;
    fontSize: number;
    color: string;
    backgroundColor?: string;
    outlineColor?: string;
    outlineWidth?: number;
    position: 'TOP' | 'CENTER' | 'BOTTOM';
    safeAreaPercent: number;
}

export interface CaptionTrack {
    id: string;
    language: string;
    format: CaptionFormat;
    cues: CaptionCue[];
    style?: CaptionStyle;
    source: 'TRANSCRIPT' | 'USER_EDIT' | 'IMPORTED';
    version: number;
}

export interface AudioMixTrack {
    id: string;
    sourceClipId: string;
    media: MediaSourceRef;
    role: 'DIALOGUE' | 'VOICEOVER' | 'MUSIC' | 'SFX' | 'AMBIENCE' | 'ORIGINAL';
    gainDb: number;
    pan: number;
    muted: boolean;
    fadeInSeconds?: number;
    fadeOutSeconds?: number;
    duckingGroup?: string;
    duckingAmountDb?: number;
}

export interface AudioMix {
    id: string;
    sampleRateHz: number;
    channels: 1 | 2 | 'surround';
    loudnessTargetLufs?: number;
    truePeakLimitDbtp?: number;
    tracks: AudioMixTrack[];
}

export type RenderPlatform = 'GENERIC' | 'YOUTUBE' | 'SHORTS' | 'REELS' | 'TIKTOK' | 'LINKEDIN';
export type RenderContainer = 'MP4' | 'WEBM' | 'MOV';
export type VideoCodec = 'H264' | 'H265' | 'VP9' | 'AV1' | 'PRORES';
export type AudioCodec = 'AAC' | 'OPUS' | 'PCM' | 'FLAC';

export interface RenderPreset {
    id: string;
    name: string;
    platform: RenderPlatform;
    width: number;
    height: number;
    frameRate: number;
    container: RenderContainer;
    videoCodec: VideoCodec;
    audioCodec: AudioCodec;
    audioSampleRateHz: number;
    audioChannels: 1 | 2 | 'surround';
    videoBitrateKbps?: number;
    maxDurationSeconds?: number;
    includeCaptions: boolean;
    burnInCaptions: boolean;
}

export type MediaStreamKind = 'VIDEO' | 'AUDIO' | 'SUBTITLE' | 'DATA';

export interface VideoStreamProbe {
    codec: string;
    width: number;
    height: number;
    frameRate: number;
    pixelFormat?: string;
    bitrateKbps?: number;
}

export interface AudioStreamProbe {
    codec: string;
    sampleRateHz: number;
    channels: number;
    channelLayout?: string;
    bitrateKbps?: number;
}

export interface MediaStreamProbe {
    index: number;
    kind: MediaStreamKind;
    codec: string;
    durationSeconds?: number;
    video?: VideoStreamProbe;
    audio?: AudioStreamProbe;
}

export interface MediaProbe {
    probeVersion: string;
    source: MediaSourceRef;
    container: string;
    mimeType: string;
    byteSize: number;
    durationSeconds: number;
    streams: MediaStreamProbe[];
    formatName?: string;
    bitrateKbps?: number;
    warnings: string[];
    probedAt: string;
}

export interface AssemblyManifest {
    id: string;
    productionId: string;
    timelineVersionId: string;
    version: number;
    tracks: TimelineTrack[];
    captionTracks: CaptionTrack[];
    audioMix?: AudioMix;
    renderPreset: RenderPreset;
    sourceAssetIds: string[];
    durationSeconds: number;
    createdAt: string;
    createdBy: string;
    manifestChecksum?: string;
}

export type RenderJobState =
    | 'QUEUED'
    | 'LEASED'
    | 'RUNNING'
    | 'RENDERING'
    | 'UPLOADING'
    | 'VERIFYING'
    | 'COMPLETED'
    | 'FAILED'
    | 'RETRYABLE_FAILURE'
    | 'CANCELED'
    | 'TIMED_OUT'
    | 'RECONCILIATION_REQUIRED';

export interface RenderJobError {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
}

export interface RenderJob {
    id: string;
    productionId: string;
    assemblyManifestId: string;
    presetId: string;
    state: RenderJobState;
    idempotencyKey: string;
    attempt: number;
    maxAttempts: number;
    correlationId: string;
    createdAt: string;
    updatedAt: string;
    leaseExpiresAt?: string;
    startedAt?: string;
    completedAt?: string;
    outputAssetId?: string;
    outputProbe?: MediaProbe;
    error?: RenderJobError;
}

export type ExportDestination = 'DOWNLOAD' | 'REVIEW_PORTAL';
export type ExportStatus = 'REQUESTED' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED' | 'CANCELED';

export interface ExportRequest {
    productionId: string;
    timelineVersionId: string;
    assemblyManifestId: string;
    presetId: string;
    destination: ExportDestination;
    requestedBy: string;
    idempotencyKey: string;
    reviewId?: string;
}

export interface ExportArtifact {
    assetId: string;
    media: MediaSourceRef;
    probe: MediaProbe;
    expiresAt?: string;
    downloadFileName: string;
}

export interface ExportRecord {
    id: string;
    request: ExportRequest;
    renderJobId: string;
    status: ExportStatus;
    artifact?: ExportArtifact;
    error?: RenderJobError;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
}

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown, field: string): RecordValue {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${field} must be an object.`);
    return value as RecordValue;
}

function stringValue(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} must be a non-empty string.`);
    return value;
}

function numberValue(value: unknown, field: string, minimum = 0): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) throw new Error(`${field} must be a finite number >= ${minimum}.`);
    return value;
}

function booleanValue(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean.`);
    return value;
}

function enumValue<T extends string>(value: unknown, field: string, values: readonly T[]): T {
    if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`${field} has an unsupported value.`);
    return value as T;
}

function arrayValue(value: unknown, field: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
    return value;
}

function sourceValue(value: unknown, field: string): MediaSourceRef {
    const source = asRecord(value, field);
    return { assetId: stringValue(source.assetId, `${field}.assetId`), storageId: source.storageId as string | undefined, url: source.url as string | undefined, mimeType: source.mimeType as string | undefined, checksum: source.checksum as string | undefined };
}

const TRACK_KINDS: readonly TrackKind[] = ['VIDEO', 'IMAGE', 'GRAPHIC', 'AUDIO', 'CAPTIONS'];
const RENDER_STATES: readonly RenderJobState[] = ['QUEUED', 'LEASED', 'RUNNING', 'RENDERING', 'UPLOADING', 'VERIFYING', 'COMPLETED', 'FAILED', 'RETRYABLE_FAILURE', 'CANCELED', 'TIMED_OUT', 'RECONCILIATION_REQUIRED'];
const EXPORT_STATUSES: readonly ExportStatus[] = ['REQUESTED', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED', 'CANCELED'];

export function validateRenderPreset(value: unknown): RenderPreset {
    const input = asRecord(value, 'preset');
    return {
        id: stringValue(input.id, 'preset.id'), name: stringValue(input.name, 'preset.name'), platform: enumValue(input.platform, 'preset.platform', ['GENERIC', 'YOUTUBE', 'SHORTS', 'REELS', 'TIKTOK', 'LINKEDIN']),
        width: numberValue(input.width, 'preset.width', 1), height: numberValue(input.height, 'preset.height', 1), frameRate: numberValue(input.frameRate, 'preset.frameRate', 1), container: enumValue(input.container, 'preset.container', ['MP4', 'WEBM', 'MOV']), videoCodec: enumValue(input.videoCodec, 'preset.videoCodec', ['H264', 'H265', 'VP9', 'AV1', 'PRORES']), audioCodec: enumValue(input.audioCodec, 'preset.audioCodec', ['AAC', 'OPUS', 'PCM', 'FLAC']), audioSampleRateHz: numberValue(input.audioSampleRateHz, 'preset.audioSampleRateHz', 1), audioChannels: input.audioChannels === 'surround' ? 'surround' : numberValue(input.audioChannels, 'preset.audioChannels', 1) as 1 | 2, includeCaptions: booleanValue(input.includeCaptions, 'preset.includeCaptions'), burnInCaptions: booleanValue(input.burnInCaptions, 'preset.burnInCaptions'),
        videoBitrateKbps: input.videoBitrateKbps === undefined ? undefined : numberValue(input.videoBitrateKbps, 'preset.videoBitrateKbps', 1), maxDurationSeconds: input.maxDurationSeconds === undefined ? undefined : numberValue(input.maxDurationSeconds, 'preset.maxDurationSeconds', 0),
    };
}

export function validateTimelineVersion(value: unknown): TimelineVersion {
    const input = asRecord(value, 'timeline');
    const tracks = arrayValue(input.tracks, 'timeline.tracks').map((item, index) => validateTimelineTrack(item, `timeline.tracks[${index}]`));
    return { id: stringValue(input.id, 'timeline.id'), productionId: stringValue(input.productionId, 'timeline.productionId'), version: numberValue(input.version, 'timeline.version', 1), status: enumValue(input.status, 'timeline.status', ['DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'LOCKED', 'SUPERSEDED']), width: numberValue(input.width, 'timeline.width', 1), height: numberValue(input.height, 'timeline.height', 1), frameRate: numberValue(input.frameRate, 'timeline.frameRate', 1), durationSeconds: numberValue(input.durationSeconds, 'timeline.durationSeconds', 0), tracks, captionTrackIds: arrayValue(input.captionTrackIds, 'timeline.captionTrackIds').map((id, index) => stringValue(id, `timeline.captionTrackIds[${index}]`)), audioMixId: input.audioMixId as string | undefined, sourceVersionId: input.sourceVersionId as string | undefined, createdAt: stringValue(input.createdAt, 'timeline.createdAt'), createdBy: stringValue(input.createdBy, 'timeline.createdBy'), approvedAt: input.approvedAt as string | undefined };
}

function validateTimelineTrack(value: unknown, field: string): TimelineTrack {
    const input = asRecord(value, field);
    const kind = enumValue(input.kind, `${field}.kind`, TRACK_KINDS);
    const clips = arrayValue(input.clips, `${field}.clips`).map((clip, index) => validateTimelineClip(clip, `${field}.clips[${index}]`, kind));
    return { id: stringValue(input.id, `${field}.id`), kind, name: stringValue(input.name, `${field}.name`), orderIndex: numberValue(input.orderIndex, `${field}.orderIndex`, 0), muted: booleanValue(input.muted, `${field}.muted`), locked: booleanValue(input.locked, `${field}.locked`), clips };
}

function validateTimelineClip(value: unknown, field: string, trackKind: TrackKind): TimelineClip {
    const input = asRecord(value, field);
    const kind = enumValue(input.kind, `${field}.kind`, TRACK_KINDS);
    if (kind !== trackKind) throw new Error(`${field}.kind must match its track kind.`);
    const base = { id: stringValue(input.id, `${field}.id`), trackId: stringValue(input.trackId, `${field}.trackId`), kind, startSeconds: numberValue(input.startSeconds, `${field}.startSeconds`, 0), durationSeconds: numberValue(input.durationSeconds, `${field}.durationSeconds`, 0) };
    if (kind === 'GRAPHIC') return { ...base, kind, templateId: stringValue(input.templateId, `${field}.templateId`), props: asRecord(input.props, `${field}.props`) };
    if (kind === 'CAPTIONS') return { ...base, kind, captionTrackId: stringValue(input.captionTrackId, `${field}.captionTrackId`) };
    return { ...base, kind, media: sourceValue(input.media, `${field}.media`), fit: input.fit as FitMode | undefined } as VideoClip | ImageClip | AudioClip;
}

export function validateMediaProbe(value: unknown): MediaProbe {
    const input = asRecord(value, 'probe');
    const streams = arrayValue(input.streams, 'probe.streams').map((stream, index) => {
        const item = asRecord(stream, `probe.streams[${index}]`);
        return { index: numberValue(item.index, `probe.streams[${index}].index`, 0), kind: enumValue(item.kind, `probe.streams[${index}].kind`, ['VIDEO', 'AUDIO', 'SUBTITLE', 'DATA']), codec: stringValue(item.codec, `probe.streams[${index}].codec`), durationSeconds: item.durationSeconds === undefined ? undefined : numberValue(item.durationSeconds, `probe.streams[${index}].durationSeconds`, 0), video: item.video as VideoStreamProbe | undefined, audio: item.audio as AudioStreamProbe | undefined };
    });
    return { probeVersion: stringValue(input.probeVersion, 'probe.probeVersion'), source: sourceValue(input.source, 'probe.source'), container: stringValue(input.container, 'probe.container'), mimeType: stringValue(input.mimeType, 'probe.mimeType'), byteSize: numberValue(input.byteSize, 'probe.byteSize', 0), durationSeconds: numberValue(input.durationSeconds, 'probe.durationSeconds', 0), streams, formatName: input.formatName as string | undefined, bitrateKbps: input.bitrateKbps === undefined ? undefined : numberValue(input.bitrateKbps, 'probe.bitrateKbps', 0), warnings: arrayValue(input.warnings, 'probe.warnings').map((warning, index) => stringValue(warning, `probe.warnings[${index}]`)), probedAt: stringValue(input.probedAt, 'probe.probedAt') };
}

export function validateAssemblyManifest(value: unknown): AssemblyManifest {
    const input = asRecord(value, 'manifest');
    const tracks = arrayValue(input.tracks, 'manifest.tracks').map((item, index) => validateTimelineTrack(item, `manifest.tracks[${index}]`));
    const renderPreset = validateRenderPreset(input.renderPreset);
    return { id: stringValue(input.id, 'manifest.id'), productionId: stringValue(input.productionId, 'manifest.productionId'), timelineVersionId: stringValue(input.timelineVersionId, 'manifest.timelineVersionId'), version: numberValue(input.version, 'manifest.version', 1), tracks, captionTracks: arrayValue(input.captionTracks, 'manifest.captionTracks') as CaptionTrack[], audioMix: input.audioMix as AudioMix | undefined, renderPreset, sourceAssetIds: arrayValue(input.sourceAssetIds, 'manifest.sourceAssetIds').map((id, index) => stringValue(id, `manifest.sourceAssetIds[${index}]`)), durationSeconds: numberValue(input.durationSeconds, 'manifest.durationSeconds', 0), createdAt: stringValue(input.createdAt, 'manifest.createdAt'), createdBy: stringValue(input.createdBy, 'manifest.createdBy'), manifestChecksum: input.manifestChecksum as string | undefined };
}

export function validateRenderJobState(value: unknown): RenderJobState {
    return enumValue(value, 'render.state', RENDER_STATES);
}

export function validateExportRequest(value: unknown): ExportRequest {
    const input = asRecord(value, 'export');
    return { productionId: stringValue(input.productionId, 'export.productionId'), timelineVersionId: stringValue(input.timelineVersionId, 'export.timelineVersionId'), assemblyManifestId: stringValue(input.assemblyManifestId, 'export.assemblyManifestId'), presetId: stringValue(input.presetId, 'export.presetId'), destination: enumValue(input.destination, 'export.destination', ['DOWNLOAD', 'REVIEW_PORTAL']), requestedBy: stringValue(input.requestedBy, 'export.requestedBy'), idempotencyKey: stringValue(input.idempotencyKey, 'export.idempotencyKey'), reviewId: input.reviewId as string | undefined };
}

export function validateExportStatus(value: unknown): ExportStatus {
    return enumValue(value, 'export.status', EXPORT_STATUSES);
}
