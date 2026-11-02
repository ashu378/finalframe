export const PROJECT_RESOURCE_KINDS = ['CHARACTER', 'LOCATION', 'COSTUME', 'PROP', 'PRODUCT', 'BRAND', 'STYLE'] as const;
export type ProjectResourceKind = (typeof PROJECT_RESOURCE_KINDS)[number];
export type WorkspaceResourceState = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'LOCKED' | 'REVISION_REQUESTED';

export interface ResourceVersionView {
    resourceId: string;
    id: string;
    name: string;
    kind: ProjectResourceKind;
    versionNumber: number;
    latestVersionNumber: number;
    profile: Record<string, unknown>;
    assetIds: string[];
    voiceId: string | null;
    state: WorkspaceResourceState;
}

export interface BibleSnapshotView {
    resourceBindings: Array<{ resourceId: string; resourceVersionId: string }>;
    rules: string[];
    story: string;
    visualStyle: string;
}

export interface BibleView {
    id: string;
    versionNumber: number;
    state: WorkspaceResourceState;
    snapshot: BibleSnapshotView;
}

export interface StorySnapshotView {
    summary: string;
    facts: string[];
    unresolvedThreads: string[];
    cliffhanger: string;
    nextEpisodePayoff: string;
    characterStates: Array<{ resourceId: string; knowledge: string; relationships: string }>;
}

export interface WorkspaceAssetView {
    id: string;
    name: string;
    mimeType: string;
    url: string | null;
    state: WorkspaceResourceState;
}

export interface ShotControlView {
    id: string;
    title: string;
    prompt: string;
    durationSeconds: number;
    state: WorkspaceResourceState;
    resourceVersionIds: string[];
    operationControls: ShotOperationControls;
    takes: Array<{ id: string; versionNumber: number; status: string; state: WorkspaceResourceState; model?: string; provider?: string; assetId?: string; url?: string; mimeType?: string }>;
}

export interface WorkspaceControlData {
    projectId: string;
    projectExternalId: string;
    studioExternalId: string;
    productionId: string;
    versionId: string | null;
    versionState: string | null;
    episodeId: string | null;
    role: 'OWNER' | 'EDITOR' | 'REVIEWER' | 'VIEWER';
    canEdit: boolean;
    resources: ResourceVersionView[];
    resourceCursor: string | null;
    assets: WorkspaceAssetView[];
    voices: Array<{ id: string; name: string; kind: string; status: string; state: WorkspaceResourceState; hasConsent: boolean; sampleCount: number }>;
    bibles: BibleView[];
    boundResources: Array<{ id: string; resourceId: string; name: string; kind: ProjectResourceKind; versionNumber: number; state: WorkspaceResourceState }>;
    plannedBibleId: string | null;
    scenes: Array<{ id: string; title: string; purpose: string; shots: ShotControlView[] }>;
    timelines: Array<{ id: string; versionNumber: number; state: WorkspaceResourceState; matchesProductionVersion: boolean }>;
    acceptedStoryStateId: string | null;
    acceptedStory: StorySnapshotView | null;
}

export interface ShotOperationControls {
    operation: import('../ai/video-routing').VideoOperation;
    audioPolicy: import('../ai/video-routing').VideoAudioPolicy;
    referenceAssetIds: string[];
    firstFrameAssetId: string;
    lastFrameAssetId: string;
}

export function validateShotOperationControls(controls: ShotOperationControls, assets: Array<Pick<WorkspaceAssetView, 'id' | 'mimeType'>>) {
    const operations = ['GENERATE', 'FRAME_TO_VIDEO', 'EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE', 'PERFORMANCE_TRANSFER', 'EXTEND', 'LIP_SYNC', 'UPSCALE'];
    if (!operations.includes(controls.operation)) throw new Error('Choose a supported video operation.');
    if (!['KEEP_SOURCE', 'USE_RECORDING', 'GENERATE', 'SILENT'].includes(controls.audioPolicy)) throw new Error('Choose an audio policy.');
    if (controls.referenceAssetIds.length > 100 || new Set(controls.referenceAssetIds).size !== controls.referenceAssetIds.length) throw new Error('Choose each reference once, with at most 100 references.');
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const selected = controls.referenceAssetIds.map((id) => {
        const asset = byId.get(id);
        if (!asset) throw new Error('Select media from this project.');
        return asset;
    });
    for (const frame of [controls.firstFrameAssetId, controls.lastFrameAssetId].filter(Boolean)) {
        if (!byId.get(frame)?.mimeType.startsWith('image/')) throw new Error('Frames must be project images.');
    }
    const hasVideo = selected.some((asset) => asset.mimeType.startsWith('video/'));
    const hasImage = selected.some((asset) => asset.mimeType.startsWith('image/')) || Boolean(controls.firstFrameAssetId);
    const hasAudio = selected.some((asset) => asset.mimeType.startsWith('audio/'));
    if (['EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE', 'PERFORMANCE_TRANSFER', 'UPSCALE'].includes(controls.operation) && !hasVideo) throw new Error('Select a source video for this operation.');
    if (controls.operation === 'PERFORMANCE_TRANSFER' && !hasImage) throw new Error('Select a character reference image for performance transfer.');
    if (controls.operation === 'LIP_SYNC' && (!hasAudio || (!hasImage && !hasVideo))) throw new Error('Lip sync needs a portrait or video and a project audio recording.');
    if (controls.operation === 'FRAME_TO_VIDEO' && !controls.firstFrameAssetId) throw new Error('Choose the first frame.');
    if (controls.audioPolicy === 'KEEP_SOURCE' && !hasVideo) throw new Error('Keeping source audio requires a source video.');
    if (controls.audioPolicy === 'USE_RECORDING' && !hasAudio) throw new Error('Select a project audio recording.');
    return [...new Set([...controls.referenceAssetIds, controls.firstFrameAssetId, controls.lastFrameAssetId].filter(Boolean))];
}

export type CompositionClip = { kind: 'TAKE'; shotVersionId: string }
    | { kind: 'ASSET'; assetId: string; durationSeconds: number }
    | { kind: 'GRAPHIC'; templateId: 'kinetic-title' | 'brand-card' | 'feature-callout' | 'end-card'; durationSeconds: number; props: { title: string } & Record<string, string>; logoAssetId?: string };
export interface CompositionAudioTrack { assetId: string; startSeconds: number; durationSeconds: number; volume?: number }
