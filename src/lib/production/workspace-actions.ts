'use server';

import { revalidatePath } from 'next/cache';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { validateShotOperationControls, type ShotOperationControls } from './workspace-controls';
import type { ProjectResourceKind, ResourceVersionView, StorySnapshotView, WorkspaceControlData, WorkspaceResourceState } from './workspace-controls';

function object(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeError(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (/immutable|new draft version/i.test(message)) return 'This production version is immutable. Create a revised plan before changing its shots.';
    if (/resource is.*locked|only a locked|unlocking/i.test(message)) return 'This resource is locked. An owner must unlock it with a reason before requesting changes.';
    if (/not authorized|access.denied|role.denied|permission/i.test(message)) return 'Your project role does not permit this change.';
    if (/approve every|resource must be approved|needs approval/i.test(message)) return 'Approve the selected resource versions before using them.';
    if (/timeline|current approved production/i.test(message)) return 'Review and approve a final timeline for the current production version before accepting story facts.';
    if (/refresh.*continuity|preceding episode/i.test(message)) return 'Refresh this episode from the preceding approved story state first.';
    if (/does not belong|owned by|same project|not found/i.test(message)) return 'Select active resources and media from this project.';
    if (/resource changed|story state changed/i.test(message)) return 'This record changed. Reload its current version and try again.';
    return 'The change could not be saved. Check the selected project resources and try again.';
}

async function projectContext(projectExternalId: string) {
    const client = await getAuthenticatedConvexClient();
    const project = await client.query(api.projects.getByExternalId, { externalId: projectExternalId });
    if (!project) throw new Error('Project not found.');
    return { client, project };
}

type RawResourceVersion = Omit<ResourceVersionView, 'id'> & { resourceVersionId: string; archived?: boolean };
function resourceView(row: RawResourceVersion): ResourceVersionView {
    return { id: row.resourceVersionId, resourceId: row.resourceId, kind: row.kind, name: row.name,
        versionNumber: row.versionNumber, latestVersionNumber: row.latestVersionNumber, profile: object(row.profile),
        assetIds: row.assetIds, voiceId: row.voiceId, state: row.state };
}

export async function loadWorkspaceControls(projectExternalId: string, productionId: string): Promise<WorkspaceControlData> {
    const { client, project } = await projectContext(projectExternalId);
    const workspace = await client.query(api.productions.getWorkspaceByProject, { projectExternalId, productionId: productionId as Id<'productions'> });
    if (!workspace.production || workspace.production.projectId !== project._id) throw new Error('Production not found.');
    const [resourcePage, bibleRows, assets, voices, timelines, episodes, sequences] = await Promise.all([
        client.query(api.continuity.resourceVersionPage, { projectId: project._id, paginationOpts: { numItems: 50, cursor: null } }),
        client.query(api.continuity.listBibles, { projectId: project._id, limit: 50 }),
        client.query(api.assetStorage.listProjectAssets, { projectId: project._id }),
        client.query(api.voices.list, { projectId: project._id, limit: 100 }),
        client.query(api.timeline.list, { productionId: workspace.production._id }),
        client.query(api.episodes.list, { projectId: project._id, paginationOpts: { numItems: 100, cursor: null } }),
        workspace.version ? client.query(api.scenes.list, { productionId: workspace.production._id, productionVersionId: workspace.version._id }) : Promise.resolve([]),
    ]);
    let episodeRows = [...episodes.page];
    let episodePage = episodes;
    while (!episodePage.isDone && episodeRows.length < 500) {
        episodePage = await client.query(api.episodes.list, { projectId: project._id, paginationOpts: { numItems: 100, cursor: episodePage.continueCursor } });
        episodeRows = [...episodeRows, ...episodePage.page];
    }
    const episode = episodeRows.find((row) => row.productionId === workspace.production!._id);
    const resourceRows = resourcePage as { page: RawResourceVersion[]; isDone: boolean; continueCursor: string; projectRole: WorkspaceControlData['role'] };
    const snapshot = object(workspace.version?.planningContextSnapshot);
    const rawBindings = Array.isArray(snapshot.resources) ? snapshot.resources.slice(0, 100).map(object) : [];
    const [bibles, boundResources, timelineRows, accepted] = await Promise.all([
        Promise.all(bibleRows.map(async (bible) => {
            const state = await client.query(api.resourceStates.get, { projectId: project._id, resourceType: 'continuityBible', resourceId: bible.bibleId });
            return { id: bible.bibleId.toString(), versionNumber: bible.versionNumber, state: state.state as WorkspaceResourceState, snapshot: bible.snapshot };
        })),
        Promise.all(rawBindings.map(async (binding) => {
            const versionId = String(binding.resourceVersionId || '');
            const current = await client.query(api.approvals.get, { projectId: project._id, resourceType: 'projectResourceVersion', resourceId: versionId });
            const resource = current.resource as Doc<'projectResourceVersions'>;
            return { id: versionId, resourceId: String(binding.resourceId), name: String(binding.name || ''), kind: binding.kind as ProjectResourceKind, versionNumber: resource.versionNumber, state: current.currentState };
        })),
        Promise.all(timelines.slice(0, 50).map(async (timeline) => {
            const [state, manifest] = await Promise.all([
                client.query(api.approvals.get, { projectId: project._id, productionId: workspace.production!._id, resourceType: 'timeline', resourceId: timeline._id }),
                timeline.manifestId ? client.query(api.assembly.getManifest, { manifestId: timeline.manifestId }) : Promise.resolve(null),
            ]);
            const versionId = object(manifest?.manifest).productionVersionId || object(timeline.tracks).productionVersionId;
            // Original assembly timelines may not store manifestId. The backend
            // validates their indexed manifest again on explicit acceptance.
            return { id: timeline._id.toString(), versionNumber: timeline.versionNumber, state: state.currentState, matchesProductionVersion: !versionId || versionId === workspace.version?._id };
        })),
        episode?.acceptedStoryStateId ? client.query(api.approvals.get, { projectId: project._id, resourceType: 'episodeStoryState', resourceId: episode.acceptedStoryStateId }) : Promise.resolve(null),
    ]);
    const assetRows = assets as Array<Doc<'assets'> & { storageUrl?: string }>;
    const mediaById = new Map(assetRows.map((asset) => [asset._id.toString(), asset]));
    const scenes = await Promise.all(sequences.flatMap((sequence) => sequence.scenes).map(async (scene) => ({
        id: scene._id.toString(), title: scene.title, purpose: scene.purpose,
        shots: await Promise.all(scene.shots.map(async (shot) => {
            const state = await client.query(api.resourceStates.get, { projectId: project._id, resourceType: 'shot', resourceId: shot._id });
            const metadata = object(shot.metadata);
            return { id: shot._id.toString(), title: shot.title, prompt: shot.prompt, durationSeconds: shot.durationSeconds,
                state: state.state as WorkspaceResourceState,
                resourceVersionIds: Array.isArray(metadata.resourceVersionIds) ? metadata.resourceVersionIds.filter((id): id is string => typeof id === 'string') : [],
                operationControls: { operation: (typeof metadata.operation === 'string' ? metadata.operation : 'GENERATE') as ShotOperationControls['operation'], audioPolicy: (typeof metadata.audioPolicy === 'string' ? metadata.audioPolicy : 'SILENT') as ShotOperationControls['audioPolicy'], referenceAssetIds: (shot.requiredAssetIds ?? []).filter((id) => mediaById.has(id)), firstFrameAssetId: typeof metadata.firstFrameAssetId === 'string' ? metadata.firstFrameAssetId : '', lastFrameAssetId: typeof metadata.lastFrameAssetId === 'string' ? metadata.lastFrameAssetId : '' },
                takes: await Promise.all(shot.takes.map(async (take) => {
                    const approval = await client.query(api.resourceStates.get, { projectId: project._id, resourceType: 'shotVersion', resourceId: take._id });
                    const media = take.assetId ? mediaById.get(take.assetId) : undefined;
                    return { id: take._id.toString(), versionNumber: take.versionNumber, status: take.status, state: approval.state as WorkspaceResourceState,
                        ...(take.provider ? { provider: take.provider } : {}), ...(take.model ? { model: take.model } : {}),
                        ...(take.assetId ? { assetId: take.assetId.toString() } : {}), ...(media?.storageUrl ? { url: media.storageUrl, mimeType: media.mimeType } : {}) };
                })),
            };
        })),
    })));
    return {
        projectId: project._id.toString(), projectExternalId, studioExternalId: project.studioExternalId,
        productionId: workspace.production._id.toString(), versionId: workspace.version?._id.toString() ?? null,
        versionState: workspace.version?.status ?? null, episodeId: episode?._id.toString() ?? null,
        role: resourceRows.projectRole, canEdit: resourceRows.projectRole === 'OWNER' || resourceRows.projectRole === 'EDITOR',
        resources: resourceRows.page.filter((row) => !row.archived).map(resourceView), resourceCursor: resourceRows.isDone ? null : resourceRows.continueCursor,
        assets: await Promise.all(assetRows.map(async (asset) => { const state = await client.query(api.resourceStates.get, { projectId: project._id, resourceType: 'asset', resourceId: asset._id }); return { id: asset._id.toString(), name: asset.name || 'Project media', mimeType: asset.mimeType || 'application/octet-stream', url: asset.storageUrl ?? null, state: state.state as WorkspaceResourceState }; })),
        voices: await Promise.all(voices.map(async (voice) => { const state = await client.query(api.resourceStates.get, { projectId: project._id, resourceType: 'voice', resourceId: voice._id }); return { id: voice._id.toString(), name: voice.name, kind: voice.kind, status: voice.status, state: state.state as WorkspaceResourceState, hasConsent: voice.hasConsent, sampleCount: voice.sampleAssetIds?.length ?? 0 }; })), bibles,
        boundResources, plannedBibleId: typeof snapshot.continuityBibleId === 'string' ? snapshot.continuityBibleId : null,
        scenes, timelines: timelineRows, acceptedStoryStateId: episode?.acceptedStoryStateId?.toString() ?? null,
        acceptedStory: accepted ? (accepted.resource as Doc<'episodeStoryStates'>).snapshot as StorySnapshotView : null,
    };
}

export async function loadMoreResourceVersions(projectExternalId: string, cursor: string) {
    const { client, project } = await projectContext(projectExternalId);
    const result = await client.query(api.continuity.resourceVersionPage, { projectId: project._id, paginationOpts: { numItems: 50, cursor } }) as { page: RawResourceVersion[]; isDone: boolean; continueCursor: string };
    return { resources: result.page.filter((row) => !row.archived).map(resourceView), cursor: result.isDone ? null : result.continueCursor };
}

export async function saveProjectResource(input: { projectExternalId: string; kind: ProjectResourceKind; name: string; profile: Record<string, unknown>; assetIds: string[]; voiceId?: string; resourceId?: string; expectedVersionNumber?: number }) {
    try {
        const { client, project } = await projectContext(input.projectExternalId);
        const shared = { projectId: project._id, profile: input.profile, assetIds: input.assetIds as Id<'assets'>[], voiceId: input.voiceId as Id<'voices'> | undefined };
        const saved = input.resourceId
            ? await client.mutation(api.continuity.reviseResource, { ...shared, resourceId: input.resourceId as Id<'projectResources'>, expectedVersionNumber: input.expectedVersionNumber ?? 0 })
            : await client.mutation(api.continuity.createResource, { ...shared, kind: input.kind, name: input.name });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const, resourceVersionId: saved.resourceVersionId.toString() };
    } catch (error) { return { success: false as const, error: safeError(error) }; }
}

export async function saveProjectBible(input: { projectExternalId: string; sourceBibleId?: string; snapshot: { resourceBindings: Array<{ resourceId: string; resourceVersionId: string }>; rules: string[]; story: string; visualStyle: string } }) {
    try {
        const { client, project } = await projectContext(input.projectExternalId);
        const saved = await client.mutation(api.continuity.createBible, { projectId: project._id, sourceBibleId: input.sourceBibleId as Id<'continuityBibles'> | undefined,
            snapshot: { ...input.snapshot, resourceBindings: input.snapshot.resourceBindings.map((binding) => ({ resourceId: binding.resourceId as Id<'projectResources'>, resourceVersionId: binding.resourceVersionId as Id<'projectResourceVersions'> })) } });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const, bibleId: saved.bibleId.toString() };
    } catch (error) { return { success: false as const, error: safeError(error) }; }
}

export async function changeWorkspaceApproval(input: { projectExternalId: string; resourceType: 'projectResourceVersion' | 'continuityBible' | 'shotVersion' | 'timeline' | 'voice' | 'asset'; resourceId: string; operation: 'REVIEW' | 'APPROVE' | 'LOCK' | 'REVISION' | 'UNLOCK'; note?: string }) {
    try {
        const { client, project } = await projectContext(input.projectExternalId);
        const args = { projectId: project._id, resourceType: input.resourceType, resourceId: input.resourceId };
        if (input.operation === 'REVIEW') await client.mutation(api.approvals.submitForReview, { ...args, note: input.note });
        else if (input.operation === 'APPROVE') await client.mutation(api.approvals.approve, { ...args, note: input.note });
        else if (input.operation === 'LOCK') await client.mutation(api.approvals.lock, { ...args, note: input.note });
        else if (input.operation === 'REVISION') await client.mutation(api.approvals.requestRevision, { ...args, note: input.note || '' });
        else await client.mutation(api.approvals.unlock, { ...args, reason: input.note || '' });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const };
    } catch (error) { return { success: false as const, error: safeError(error) }; }
}

export async function bindShotResources(input: { projectExternalId: string; productionId: string; shotId: string; resourceVersionIds: string[] }) {
    try {
        const { client, project } = await projectContext(input.projectExternalId);
        const shot = await client.query(api.scenes.getShot, { shotId: input.shotId as Id<'shots'> });
        if (shot.projectId !== project._id || shot.productionId !== input.productionId) throw new Error('Shot does not belong to this project.');
        await client.mutation(api.scenes.updateShot, { shotId: shot._id, metadata: { ...object(shot.metadata), resourceVersionIds: input.resourceVersionIds } });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const };
    } catch (error) { return { success: false as const, error: safeError(error) }; }
}

export async function acceptEpisodeStory(input: { projectExternalId: string; productionId: string; episodeId: string; versionId: string; timelineId: string; continuityBibleId?: string; previousAcceptedStateId?: string; snapshot: StorySnapshotView }) {
    try {
        const { client, project } = await projectContext(input.projectExternalId);
        const episode = await client.query(api.episodes.get, { projectId: project._id, episodeId: input.episodeId as Id<'episodes'> });
        if (episode.productionId !== input.productionId) throw new Error('Episode does not belong to this production.');
        const saved = await client.mutation(api.continuity.acceptStoryState, { projectId: project._id, episodeId: episode._id, productionVersionId: input.versionId as Id<'productionVersions'>,
            timelineId: input.timelineId as Id<'timelines'>, continuityBibleId: input.continuityBibleId as Id<'continuityBibles'> | undefined,
            previousAcceptedStateId: input.previousAcceptedStateId as Id<'episodeStoryStates'> | undefined,
            snapshot: { ...input.snapshot, characterStates: input.snapshot.characterStates.map((character) => ({ ...character, resourceId: character.resourceId as Id<'projectResources'> })) } });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const, storyStateId: saved.storyStateId.toString() };
    } catch (error) { return { success: false as const, error: safeError(error) }; }
}

export async function saveShotOperationControls(input: { projectExternalId: string; productionId: string; shotId: string; controls: ShotOperationControls }) {
    try {
        const { client, project } = await projectContext(input.projectExternalId);
        const [shot, assets] = await Promise.all([
            client.query(api.scenes.getShot, { shotId: input.shotId as Id<'shots'> }),
            client.query(api.assetStorage.listProjectAssets, { projectId: project._id }),
        ]);
        if (shot.projectId !== project._id || shot.productionId !== input.productionId) throw new Error('Shot does not belong to this project.');
        const requiredAssetIds = validateShotOperationControls(input.controls, assets.map((asset) => ({ id: asset._id.toString(), mimeType: asset.mimeType || '' })));
        if (input.controls.operation === 'EXTEND') return { success: false as const, error: 'Extension requires an accepted provider job from this production. Select it through generation history when available.' };
        const operation = input.controls.operation;
        const videoTask = operation === 'FRAME_TO_VIDEO' ? 'FRAME_TO_VIDEO' : ['EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE', 'PERFORMANCE_TRANSFER', 'UPSCALE', 'LIP_SYNC'].includes(operation) ? 'EDIT' : 'GENERATE';
        const metadata = { ...object(shot.metadata), operation, videoTask, audioPolicy: input.controls.audioPolicy,
            generateAudio: input.controls.audioPolicy === 'GENERATE', requiresSourceAudioPreservation: input.controls.audioPolicy === 'KEEP_SOURCE',
            firstFrameAssetId: input.controls.firstFrameAssetId || null, lastFrameAssetId: input.controls.lastFrameAssetId || null,
            requiresFirstFrame: Boolean(input.controls.firstFrameAssetId), requiresLastFrame: Boolean(input.controls.lastFrameAssetId) };
        await client.mutation(api.scenes.updateShot, { shotId: shot._id, requiredAssetIds, metadata });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const };
    } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const validationMessage = /^(Choose|Select|Frames must|Lip sync needs|Keeping source audio)/.test(message) ? message : safeError(error);
        return { success: false as const, error: validationMessage };
    }
}

export async function createWorkspaceVoice(input: { projectExternalId: string; kind: 'RECORDED' | 'CLONED'; name: string; sampleAssetId: string; requestId: string }) {
    try {
        if (!/^[a-zA-Z0-9-]{16,100}$/.test(input.requestId)) throw new Error('Invalid request key.');
        const { client, project } = await projectContext(input.projectExternalId);
        const created = await client.mutation(api.voices.create, { projectId: project._id, kind: input.kind, name: input.name, idempotencyKey: `workspace-voice:${input.requestId}` });
        await client.mutation(api.voices.attachSample, { projectId: project._id, voiceId: created.voiceId, assetId: input.sampleAssetId as Id<'assets'> });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const, voiceId: created.voiceId.toString() };
    } catch { return { success: false as const, error: 'The voice could not be saved. Choose a project audio recording no larger than 15 MiB and try again.' }; }
}

export async function grantWorkspaceVoiceConsent(input: { projectExternalId: string; voiceId: string; subjectType: 'SELF' | 'AUTHORIZED_SPEAKER'; subjectDisplayName: string; proofAssetId?: string; lipsyncAllowed: boolean; consentConfirmed: boolean; disclosureAccepted: boolean; requestId: string }) {
    try {
        if (!/^[a-zA-Z0-9-]{16,100}$/.test(input.requestId)) throw new Error('Invalid request key.');
        const { client, project } = await projectContext(input.projectExternalId);
        await client.mutation(api.voices.grantConsent, { projectId: project._id, voiceId: input.voiceId as Id<'voices'>,
            subjectType: input.subjectType, subjectDisplayName: input.subjectDisplayName, proofAssetId: input.proofAssetId as Id<'assets'> | undefined,
            consentVersion: 'finalframe-project-reference-voice-v1', permittedUses: input.lipsyncAllowed ? ['TRAIN', 'SYNTHESIZE', 'AVATAR_LIPSYNC'] : ['TRAIN', 'SYNTHESIZE'],
            consentConfirmed: input.consentConfirmed, thirdPartyDisclosureAccepted: input.disclosureAccepted, idempotencyKey: `workspace-consent:${input.requestId}` });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const };
    } catch { return { success: false as const, error: 'Consent could not be recorded. Confirm both permissions and provide project-owned evidence when acting for another speaker.' }; }
}

export async function revokeWorkspaceVoiceConsent(input: { projectExternalId: string; voiceId: string; reason: string; requestId: string }) {
    try {
        if (!/^[a-zA-Z0-9-]{16,100}$/.test(input.requestId)) throw new Error('Invalid request key.');
        const { client, project } = await projectContext(input.projectExternalId);
        await client.mutation(api.voices.revokeConsent, { projectId: project._id, voiceId: input.voiceId as Id<'voices'>, reason: input.reason, idempotencyKey: `workspace-revoke:${input.requestId}` });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const };
    } catch { return { success: false as const, error: 'Consent could not be revoked. Provide a reason and verify that this voice has active consent.' }; }
}

export async function createWorkspaceTimeline(input: { projectExternalId: string; productionId: string; versionId: string; requestId: string; clips: import('./workspace-controls').CompositionClip[]; audioTracks: import('./workspace-controls').CompositionAudioTrack[] }) {
    try {
        const { client, project } = await projectContext(input.projectExternalId);
        const workspace = await client.query(api.productions.getWorkspaceByProject, { projectExternalId: project.externalId, productionId: input.productionId as Id<'productions'> });
        if (workspace.production?.projectId !== project._id) throw new Error('Production does not belong to this project.');
        if (!/^[a-zA-Z0-9-]{16,100}$/.test(input.requestId)) throw new Error('Invalid request key.');
        const clips = input.clips.map((clip) => clip.kind === 'TAKE' ? { ...clip, shotVersionId: clip.shotVersionId as Id<'shotVersions'> } : clip.kind === 'ASSET' ? { ...clip, assetId: clip.assetId as Id<'assets'> } : { ...clip, logoAssetId: clip.logoAssetId as Id<'assets'> | undefined });
        const result = await client.mutation(api.timeline.createDraft, { productionId: input.productionId as Id<'productions'>, productionVersionId: input.versionId as Id<'productionVersions'>, idempotencyKey: `workspace-timeline:${input.requestId}`, clips, audioTracks: input.audioTracks.map((track) => ({ ...track, assetId: track.assetId as Id<'assets'> })) });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const, timelineId: result.timelineId.toString() };
    } catch (error) { return { success: false as const, error: safeError(error) }; }
}

export async function buildWorkspaceTimelineManifest(input: { projectExternalId: string; productionId: string; timelineId: string }) {
    try {
        const { client, project } = await projectContext(input.projectExternalId);
        const timeline = await client.query(api.timeline.get, { timelineId: input.timelineId as Id<'timelines'> });
        if (timeline.timeline.productionId !== input.productionId || timeline.timeline.projectId !== project._id) throw new Error('Timeline does not belong to this project.');
        await client.mutation(api.assembly.createJob, { productionId: input.productionId as Id<'productions'>, timelineId: timeline.timeline._id, selectionScope: 'TIMELINE', idempotencyKey: `workspace-manifest:${timeline.timeline._id}` });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const };
    } catch (error) { return { success: false as const, error: safeError(error) }; }
}
