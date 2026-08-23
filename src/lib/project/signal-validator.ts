import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import type { ProjectSignals, ProjectContentType, Platform, ContentContext, OutcomeGoal, IdentityPresence, StudioAsset, MessageBlocksSnapshot } from '@/lib/types/database';

export interface ValidationResult {
    success: boolean;
    signals?: ProjectSignals;
    error?: string;
    auditLog: string[];
}
/** Validate project signals through the authenticated Convex project and media views. */
export async function validateProjectSignals(projectId: string, _legacyClient?: unknown): Promise<ValidationResult> {
    const auditLog: string[] = [`[Signal Gate] Starting validation for project: ${projectId}`];
    try {
        const convex = await getAuthenticatedConvexClient();
        const current = await convex.query(api.account.current, {});
        if (!current.studio) return { success: false, error: 'Studio not found', auditLog };
        const [projects, assets] = await Promise.all([
            convex.query(api.projects.list, { studioExternalId: current.studio.externalId }),
            convex.query(api.app.listAssets, {}),
        ]);
        const project = projects.find((row) => row.externalId === projectId || row._id === projectId);
        if (!project) return { success: false, error: 'Project not found', auditLog };
        const metadata = (project.metadata || {}) as Record<string, unknown>;
        const studioAssets = assets.filter((asset) => !asset.deletedAt).map((asset) => ({
            id: asset.externalId || asset._id,
            studio_id: asset.studioExternalId,
            name: asset.name || 'Untitled media',
            type: asset.mimeType?.startsWith('video/') ? 'video' : asset.mimeType?.startsWith('audio/') ? 'audio' : 'image',
            tags: asset.roles,
            mime_type: asset.mimeType || null,
            size: asset.byteSize || 0,
            url: asset.storageUrl || '',
        })) as StudioAsset[];
        auditLog.push(`[Signal Gate] Found ${studioAssets.length} studio assets.`);
        const signals: ProjectSignals = {
            video_type: metadata.contentType as ProjectContentType,
            platform: metadata.platform as Platform,
            context: metadata.context as ContentContext,
            goal: metadata.outcomeGoal as OutcomeGoal,
            description: project.description || '',
            creative_dna_snapshot: metadata.creativeDnaSnapshot as ProjectSignals['creative_dna_snapshot'],
            identity_presence: metadata.identityPresence as IdentityPresence,
            uploaded_assets: studioAssets,
            message_blocks: metadata.messageBlocksSnapshot as MessageBlocksSnapshot,
        };
        const failures: string[] = [];
        if (!signals.video_type) failures.push('Missing video_type (Content Type)');
        if (!signals.platform) failures.push('Missing platform');
        if (!signals.goal) failures.push('Missing outcome_goal');
        if (!signals.description || signals.description.length < 10) failures.push('Missing or insufficient description');
        if (!signals.identity_presence) failures.push('Missing identity_presence selection');
        if (!signals.creative_dna_snapshot) failures.push('Missing Creative DNA snapshot (Brand DNA is required)');
        const hasLogo = studioAssets.some((asset) => asset.tags?.includes('logo'));
        const hasProductVisual = studioAssets.some((asset) => asset.type === 'image' || asset.type === 'video');
        if (!hasLogo) auditLog.push('[Signal Gate] WARNING: No explicit logo asset found.');
        if (!hasProductVisual) failures.push('MANDATORY ASSET MISSING: At least one product visual is required');
        if (failures.length) {
            const error = `SIGNAL VALIDATION FAILED: ${failures.join('; ')}`;
            auditLog.push(`[Signal Gate] REJECTED: ${error}`);
            return { success: false, error, auditLog };
        }
        auditLog.push('[Signal Gate] PASSED: All mandatory signals validated.');
        return { success: true, signals, auditLog };
    } catch (error) {
        console.error('Convex signal validation failed:', error);
        return { success: false, error: 'Unable to validate project signals', auditLog };
    }
}
