'use server';

import { type ReviewLink, type ReviewComment } from '@/lib/types/database';

const unsupported = (operation: string): never => {
    throw new Error(`UNSUPPORTED_CONVEX_OPERATION: ${operation} is not exposed by the current Convex API.`);
};

export async function createReviewLink(
    projectId: string,
    snapshotId: string,
    label?: string,
    expiresAt?: string
): Promise<{ success: boolean; link?: ReviewLink; error?: string }> {
    void projectId;
    void snapshotId;
    void label;
    void expiresAt;
    return unsupported('Review link creation');
}

export async function getReviewLinks(projectId: string): Promise<ReviewLink[]> {
    void projectId;
    return unsupported('Review link listing');
}

export async function deleteReviewLink(id: string, projectId: string): Promise<{ success: boolean; error?: string }> {
    void id;
    void projectId;
    return unsupported('Review link deletion');
}

export async function addComment(
    reviewLinkId: string,
    authorName: string,
    content: string,
    timestamp: number = 0,
    sceneId?: string
): Promise<{ success: boolean; comment?: ReviewComment; error?: string }> {
    void reviewLinkId;
    void authorName;
    void content;
    void timestamp;
    void sceneId;
    return unsupported('Review comment creation');
}

export async function resolveComment(
    commentId: string,
    isResolved: boolean,
    projectId: string
): Promise<{ success: boolean; error?: string }> {
    void commentId;
    void isResolved;
    void projectId;
    return unsupported('Review comment resolution');
}

export async function getPublicReviewData(token: string): Promise<any> {
    void token;
    return unsupported('Public review lookup');
}
