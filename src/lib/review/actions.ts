'use server';

import { randomBytes, createHash } from 'node:crypto';
import { getAuthenticatedConvexClient, getConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { ReviewLink, ReviewComment } from '@/lib/types/database';

async function ownedProject(externalId: string) {
    const client = await getAuthenticatedConvexClient();
    const project = await client.query(api.projects.getByExternalId, { externalId });
    if (!project) throw new Error('Project unavailable.');
    return { client, project };
}
function linkView(row: any, token = ''): ReviewLink {
    return { id: String(row.id), project_id: String(row.projectId), snapshot_id: row.exportId ? String(row.exportId) : null, access_token: token, label: row.label ?? 'Client review', is_active: row.active ?? true, expires_at: new Date(row.expiresAt).toISOString(), created_at: new Date(row.createdAt).toISOString(), updated_at: new Date(row.createdAt).toISOString() };
}
export async function getReviewCandidates(projectId: string) {
    const { client, project } = await ownedProject(projectId);
    return await client.query(api.reviewExport.shareCandidates, { projectId: project._id });
}
export async function createReviewLink(projectId: string, snapshotId: string, label?: string, expiresAt?: string): Promise<{ success: boolean; link?: ReviewLink; error?: string }> {
    try {
        const { client, project } = await ownedProject(projectId);
        const token = randomBytes(32).toString('base64url');
        const row = await client.mutation(api.reviewExport.createShareLink, { projectId: project._id, exportId: snapshotId as Id<'exports'>, tokenHash: createHash('sha256').update(token).digest('hex'), label, expiresAt: expiresAt ? Date.parse(expiresAt) : undefined });
        return { success: true, link: linkView(row, token) };
    } catch { return { success: false, error: 'Choose a completed project export and an expiry within the next 30 days.' }; }
}
export async function getReviewLinks(projectId: string): Promise<ReviewLink[]> {
    const { client, project } = await ownedProject(projectId);
    const rows = await client.query(api.reviewExport.listShareLinks, { projectId: project._id });
    // Raw tokens are returned once at creation. Existing links can be revoked,
    // but their bearer credentials cannot be recovered from the database.
    return rows.map((row: any) => linkView(row));
}
export async function getReviewFeedback(projectId: string, linkId: string) {
    const { client, project } = await ownedProject(projectId);
    return await client.query(api.reviewExport.getShareFeedback, { projectId: project._id, linkId: linkId as Id<'reviewLinks'> });
}
export async function deleteReviewLink(id: string, projectId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { client, project } = await ownedProject(projectId);
        await client.mutation(api.reviewExport.revokeShareLink, { projectId: project._id, linkId: id as Id<'reviewLinks'> });
        return { success: true };
    } catch { return { success: false, error: 'This review link could not be revoked.' }; }
}
export async function addComment(token: string, authorName: string, content: string, timestamp = 0, sceneId?: string): Promise<{ success: boolean; comment?: ReviewComment; error?: string }> {
    void sceneId;
    const result = await postPublicReviewComment({ token, authorName, body: content, timeSeconds: timestamp, requestId: randomBytes(16).toString('hex') });
    if (!result.success) return result;
    return { success: true, comment: { id: result.id!, review_link_id: '', author_name: authorName, content, timestamp, scene_id: null, is_resolved: false, created_at: new Date().toISOString() } };
}
export async function resolveComment(commentId: string, isResolved: boolean, projectId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { client, project } = await ownedProject(projectId);
        await client.mutation(api.reviewExport.resolveSharedComment, { projectId: project._id, commentId: commentId as Id<'comments'>, resolved: isResolved });
        return { success: true };
    } catch { return { success: false, error: 'This comment could not be updated.' }; }
}
export async function getPublicReviewData(token: string): Promise<any> {
    try { return await getConvexClient().query(api.reviewExport.getSharedReview, { token }); } catch { return null; }
}
export async function postPublicReviewComment(input: { token: string; authorName: string; body: string; timeSeconds?: number; requestId: string }) {
    try {
        const result = await getConvexClient().mutation(api.reviewExport.addSharedComment, input);
        return { success: true as const, id: String(result.id) };
    } catch { return { success: false as const, error: 'Comment could not be saved. Check that the link is active and the timestamp is inside this video.' }; }
}
export async function decidePublicReview(input: { token: string; authorName: string; decision: 'APPROVED' | 'CHANGES_REQUESTED'; note?: string }) {
    try {
        await getConvexClient().mutation(api.reviewExport.decideSharedReview, input);
        return { success: true as const };
    } catch { return { success: false as const, error: 'The review decision could not be saved. This link may have expired or this version may already have a decision.' }; }
}
