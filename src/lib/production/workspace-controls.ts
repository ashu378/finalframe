import type {GraphicsV2Props,GraphicsV2TemplateId} from '../../../renderer/src/templates/graphics-v2-contract';
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
    voiceVersionId?: string;
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
    durationSeconds?: number;
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
    resourceBindings?: Array<{ role: string; resourceVersionId: string; voiceVersionId?: string; characterResourceVersionId?: string }>;
    dialogueSegments?: Array<{ speakerResourceVersionId: string; voiceVersionId: string; startSeconds: number; durationSeconds: number; text: string; delivery?: string }>;
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
    graphicsV2Enabled?: boolean;
    resources: ResourceVersionView[];
    resourceCursor: string | null;
    assets: WorkspaceAssetView[];
    voices: Array<{ id: string; name: string; kind: string; status: string; state: WorkspaceResourceState; hasConsent: boolean; sampleCount: number; sampleAssetIds: string[]; voiceVersionId?: string }>;
    bibles: BibleView[];
    boundResources: Array<{ id: string; resourceId: string; name: string; kind: ProjectResourceKind; versionNumber: number; state: WorkspaceResourceState; voiceVersionId?: string }>;
    plannedBibleId: string | null;
    continuationSources: ContinuationSourceView[];
    scenes: Array<{ id: string; title: string; purpose: string; shots: ShotControlView[] }>;
    timelines: Array<{ id: string; versionNumber: number; state: WorkspaceResourceState; matchesProductionVersion: boolean; outputPreset?: string; width?: number; height?: number }>;
    acceptedStoryStateId: string | null;
    acceptedStory: StorySnapshotView | null;
}

export interface ContinuationSourceView {
    jobId: string;
    providerJobId: string;
    model: string;
    shotVersionId: string;
    label: string;
}

export interface ShotOperationControls {
    operation: import('../ai/video-routing').VideoOperation;
    audioPolicy: import('../ai/video-routing').VideoAudioPolicy;
    referenceAssetIds: string[];
    firstFrameAssetId: string;
    lastFrameAssetId: string;
    previousJobId?: string;
    upscaleFactor?: number;
    upscaleMode?: 'PRECISE' | 'CREATIVE';
    referenceBindings?: ReferenceAssetBinding[];
    editInstructions?: EditInstructions;
}

export const REFERENCE_ROLES = ['SOURCE_PERFORMANCE', 'IDENTITY', 'COSTUME', 'OBJECT', 'ENVIRONMENT', 'RECORDING'] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];
export interface ReferenceAssetBinding { assetId: string; alias: string; role: ReferenceRole }
export interface EditInstructions { change: string; preserve: string; timing: string }

/** Resolve authoring aliases only after the caller has authorized project assets.
 * Roles describe intent in the prompt; they do not invent provider API controls. */
export function resolveShotReferencePrompt(input: {
    prompt: string;
    referenceBindings?: unknown;
    editInstructions?: unknown;
    referenceAssetIds: string[];
    assets: Array<{ id: string; mimeType: string }>;
    firstFrameAssetId?: string;
    lastFrameAssetId?: string;
}) {
    const raw = input.referenceBindings ?? [];
    if (!Array.isArray(raw) || raw.length > 50) throw new Error('Choose at most 50 named references.');
    const byId = new Map(input.assets.map(asset => [asset.id, asset]));
    const selected = new Set(input.referenceAssetIds);
    const aliases = new Set<string>(); const boundAssets = new Set<string>();
    const referenceBindings: ReferenceAssetBinding[] = raw.map(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose a valid named reference.');
        const binding = value as Record<string, unknown>;
        if (typeof binding.assetId !== 'string' || !selected.has(binding.assetId) || !byId.has(binding.assetId)) throw new Error('Select named media from this project.');
        if (typeof binding.alias !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(binding.alias)) throw new Error('Choose reference names starting with a letter, using up to 40 letters, numbers, underscores or hyphens.');
        const alias = binding.alias.toLowerCase();
        if (aliases.has(alias) || boundAssets.has(binding.assetId)) throw new Error('Choose each reference name and asset only once.');
        if (!REFERENCE_ROLES.includes(binding.role as ReferenceRole)) throw new Error('Choose a supported reference role.');
        const role = binding.role as ReferenceRole; const mime = byId.get(binding.assetId)!.mimeType;
        if (role === 'SOURCE_PERFORMANCE' ? !mime.startsWith('video/') : role === 'RECORDING' ? !mime.startsWith('audio/') : !mime.startsWith('image/') && !mime.startsWith('video/')) throw new Error('Choose media matching its reference role.');
        aliases.add(alias); boundAssets.add(binding.assetId);
        return { assetId: binding.assetId, alias, role };
    });
    const frameIds = new Set([input.firstFrameAssetId, input.lastFrameAssetId].filter(Boolean));
    const counters = { image: 0, video: 0, audio: 0 };
    const labels = new Map<string, string>();
    for (const id of input.referenceAssetIds) {
        const asset = byId.get(id);
        if (!asset || frameIds.has(id)) continue;
        const kind = asset.mimeType.split('/')[0] as keyof typeof counters;
        if (kind in counters) labels.set(id, `${kind} reference ${++counters[kind]}`);
    }
    for (const binding of referenceBindings) {
        if (binding.assetId === input.firstFrameAssetId) labels.set(binding.assetId, 'first frame');
        else if (binding.assetId === input.lastFrameAssetId) labels.set(binding.assetId, 'last frame');
        if (!labels.has(binding.assetId)) throw new Error('Choose supported image, video or audio references.');
    }
    const byAlias = new Map(referenceBindings.map(binding => [binding.alias, binding]));
    const resolveMentions = (text: string) => text.replace(/(^|[^A-Za-z0-9_@])@([A-Za-z][A-Za-z0-9_-]*)/g, (match, before: string, name: string) => {
        const binding = byAlias.get(name.toLowerCase());
        if (!binding) throw new Error('Select a named project reference for every @mention.');
        return `${before}${labels.get(binding.assetId)}`;
    });
    let editInstructions: EditInstructions | undefined;
    if (input.editInstructions !== undefined && input.editInstructions !== null) {
        if (typeof input.editInstructions !== 'object' || Array.isArray(input.editInstructions)) throw new Error('Choose valid change, preservation and timing instructions.');
        const value = input.editInstructions as Record<string, unknown>;
        const read = (field: keyof EditInstructions) => {
            if (typeof value[field] !== 'string' || value[field].length > 2000) throw new Error('Choose instructions of at most 2000 characters per field.');
            return value[field].trim();
        };
        editInstructions = { change: read('change'), preserve: read('preserve'), timing: read('timing') };
    }
    // Legacy prompts stay byte-for-byte unchanged unless the creator explicitly
    // enables named references or structured editing instructions.
    const hasIntent = referenceBindings.length > 0 || Boolean(editInstructions && Object.values(editInstructions).some(Boolean));
    if (!hasIntent) return { prompt: input.prompt, referenceBindings, editInstructions };
    const sections = [resolveMentions(input.prompt)];
    if (referenceBindings.length) sections.push('Reference assignments:\n' + referenceBindings.map(binding => `${labels.get(binding.assetId)}: ${binding.role.toLowerCase().replaceAll('_', ' ')}.`).join('\n'));
    if (editInstructions?.change) sections.push(`Requested changes: ${resolveMentions(editInstructions.change)}`);
    if (editInstructions?.preserve) sections.push(`Preserve: ${resolveMentions(editInstructions.preserve)}`);
    if (editInstructions?.timing) sections.push(`Action timing: ${resolveMentions(editInstructions.timing)}`);
    return { prompt: sections.join('\n'), referenceBindings, editInstructions };
}

/** Shared by authoring and generation: requirements follow the operation,
 * rather than the legacy EDIT task (which also includes portrait lip sync). */
export function videoTaskForOperation(operation: ShotOperationControls['operation']): import('../ai/video-routing').VideoTask {
    if (operation === 'GENERATE' || operation === 'FRAME_TO_VIDEO' || operation === 'EXTEND') return operation;
    return 'EDIT';
}

export function validateVideoOperationRequirements(input: {
    operation: ShotOperationControls['operation'];
    audioPolicy?: ShotOperationControls['audioPolicy'];
    hasVideoReference: boolean;
    hasImageReferences: boolean;
    hasAudioReference: boolean;
    firstFrameAssetId?: string;
    previousJobId?: string;
    previousModelId?: string;
    upscaleFactor?: number;
    upscaleMode?: ShotOperationControls['upscaleMode'];
}) {
    if (!['GENERATE', 'FRAME_TO_VIDEO', 'EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE', 'PERFORMANCE_TRANSFER', 'EXTEND', 'LIP_SYNC', 'UPSCALE'].includes(input.operation)) throw new Error('Choose a supported video operation.');
    if (['EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE', 'PERFORMANCE_TRANSFER', 'UPSCALE'].includes(input.operation) && !input.hasVideoReference) throw new Error('Select a source video for this operation.');
    if (input.operation === 'PERFORMANCE_TRANSFER' && !input.hasImageReferences) throw new Error('Select a character reference image for performance transfer.');
    if (input.operation === 'LIP_SYNC' && (!input.hasAudioReference || (!input.hasImageReferences && !input.hasVideoReference))) throw new Error('Lip sync needs a portrait or video and a project audio recording.');
    if (input.operation === 'LIP_SYNC' && input.audioPolicy !== 'USE_RECORDING') throw new Error('Lip sync needs the selected recording audio policy.');
    if (input.operation === 'FRAME_TO_VIDEO' && !input.firstFrameAssetId) throw new Error('Choose the first frame.');
    if (input.operation === 'EXTEND' && (!input.previousJobId || !input.previousModelId)) throw new Error('Choose an approved completed clip from this production to extend.');
    if (input.audioPolicy === 'KEEP_SOURCE' && !input.hasVideoReference && input.operation !== 'EXTEND') throw new Error('Keeping source audio requires a source video.');
    if (input.audioPolicy === 'USE_RECORDING' && !input.hasAudioReference) throw new Error('Select a project audio recording.');
    if (input.operation === 'UPSCALE') {
        // Current reviewed OpenRouter upscale controls: factor 1.5–3 and
        // creativity 0 (precise) / 1 (creative). Routes still certify support.
        if (!Number.isFinite(input.upscaleFactor) || input.upscaleFactor! < 1.5 || input.upscaleFactor! > 3) throw new Error('Choose an upscale factor between 1.5 and 3.');
        if (!['PRECISE', 'CREATIVE'].includes(input.upscaleMode || '')) throw new Error('Choose precise or creative upscaling.');
    }
}

/** Public catalog facts are required for both upscale-specific controls.
 * A provider review alone must not silently accept unsupported settings. */
export function supportsCatalogUpscaleControls(raw: unknown, factor: number | undefined, creativity: number | undefined): boolean {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Number.isFinite(factor) || !Number.isInteger(creativity)) return false;
    const catalog = raw as { upscale_factor?: { min?: unknown; max?: unknown } | null; creativity?: unknown };
    const range = catalog.upscale_factor;
    return Boolean(range && typeof range.min === 'number' && typeof range.max === 'number' && Number.isFinite(range.min) && Number.isFinite(range.max) && factor! >= range.min && factor! <= range.max && Array.isArray(catalog.creativity) && catalog.creativity.includes(creativity));
}

export function validateShotOperationControls(controls: ShotOperationControls, assets: Array<Pick<WorkspaceAssetView, 'id' | 'mimeType'>>, continuationSources: ContinuationSourceView[] = []) {
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
    resolveShotReferencePrompt({ ...controls, prompt: '', assets });
    for (const frame of [controls.firstFrameAssetId, controls.lastFrameAssetId].filter(Boolean)) {
        if (!byId.get(frame)?.mimeType.startsWith('image/')) throw new Error('Frames must be project images.');
    }
    const hasVideo = selected.some((asset) => asset.mimeType.startsWith('video/'));
    const hasImage = selected.some((asset) => asset.mimeType.startsWith('image/')) || Boolean(controls.firstFrameAssetId);
    const hasAudio = selected.some((asset) => asset.mimeType.startsWith('audio/'));
    const previous = controls.operation === 'EXTEND' ? continuationSources.find(source => source.providerJobId === controls.previousJobId) : undefined;
    validateVideoOperationRequirements({ ...controls, hasVideoReference: hasVideo, hasImageReferences: hasImage, hasAudioReference: hasAudio, previousJobId: previous?.providerJobId, previousModelId: previous?.model });
    return [...new Set([...controls.referenceAssetIds, controls.firstFrameAssetId, controls.lastFrameAssetId].filter(Boolean))];
}

export type CompositionClip = { kind: 'TAKE'; shotVersionId: string; durationSeconds?: number }
    | { kind: 'ASSET'; assetId: string; durationSeconds: number }
    | { kind: 'GRAPHIC'; templateId: 'kinetic-title' | 'brand-card' | 'feature-callout' | 'end-card'; durationSeconds: number; props: { title: string } & Record<string, string>; logoAssetId?: string }
    | {kind:'GRAPHIC';templateId:GraphicsV2TemplateId;durationSeconds:number;props:GraphicsV2Props;logoAssetId?:string;screenAssetId?:string};
export interface CompositionAudioTrack { assetId: string; startSeconds: number; durationSeconds: number; volume?: number; trimStartSeconds?: number; fadeInSeconds?: number; fadeOutSeconds?: number; role?: 'dialogue' | 'voiceover' | 'music' | 'ambience' | 'sfx' }

/** Client feedback only; Convex independently authorizes and validates every lane. */
export function validateCompositionAudioTracks(tracks: CompositionAudioTrack[], totalSeconds: number) {
    if (tracks.length > 16) throw new Error('Use at most 16 audio lanes.');
    for (const track of tracks) {
        if (!track.assetId.trim()) throw new Error('Choose project audio or remove the empty audio lane.');
        if (!Number.isFinite(track.startSeconds) || track.startSeconds < 0 || !Number.isFinite(track.durationSeconds) || track.durationSeconds <= 0 || track.startSeconds + track.durationSeconds > totalSeconds) throw new Error('Audio timing must fit inside the visual timeline.');
        const volume = track.volume ?? 1;
        if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('Audio volume must be between zero and one.');
        if (!Number.isFinite(track.trimStartSeconds ?? 0) || (track.trimStartSeconds ?? 0) < 0) throw new Error('Source audio trim must be zero or greater.');
        for (const fade of [track.fadeInSeconds, track.fadeOutSeconds]) if (fade !== undefined && (!Number.isFinite(fade) || fade < 0 || fade > track.durationSeconds)) throw new Error('Audio fades must fit inside their clip.');
    }
}
