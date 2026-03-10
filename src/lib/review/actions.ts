'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { type ReviewLink, type ReviewComment } from '@/lib/types/database';

/**
 * Creates a new secure review link for a project snapshot.
 */
export async function createReviewLink(
    projectId: string,
    snapshotId: string,
    label?: string,
    expiresAt?: string
): Promise<{ success: boolean; link?: ReviewLink; error?: string }> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('review_links')
        .insert({
            project_id: projectId,
            snapshot_id: snapshotId,
            label,
            expires_at: expiresAt || null
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating review link:', error);
        return { success: false, error: error.message };
    }

    revalidatePath(`/dashboard/projects/${projectId}`);
    return { success: true, link: data as ReviewLink };
}

/**
 * Fetches all review links for a project.
 */
export async function getReviewLinks(projectId: string): Promise<ReviewLink[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('review_links')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching review links:', error);
        return [];
    }

    return data as ReviewLink[];
}

/**
 * Deletes a review link.
 */
export async function deleteReviewLink(id: string, projectId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('review_links')
        .delete()
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath(`/dashboard/projects/${projectId}`);
    return { success: true };
}

/**
 * Adds a comment to a review link (Public Action).
 */
export async function addComment(
    reviewLinkId: string,
    authorName: string,
    content: string,
    timestamp: number = 0,
    sceneId?: string
): Promise<{ success: boolean; comment?: ReviewComment; error?: string }> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('review_comments')
        .insert({
            review_link_id: reviewLinkId,
            author_name: authorName,
            content,
            timestamp,
            scene_id: sceneId || null
        })
        .select()
        .single();

    if (error) {
        console.error('Error adding comment:', error);
        return { success: false, error: error.message };
    }

    return { success: true, comment: data as ReviewComment };
}

/**
 * Resolves or unresolves a comment.
 */
export async function resolveComment(
    commentId: string,
    isResolved: boolean,
    projectId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('review_comments')
        .update({ is_resolved: isResolved })
        .eq('id', commentId);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath(`/dashboard/projects/${projectId}`);
    return { success: true };
}

/**
 * Fetches full review data via public token (Public Action).
 */
export async function getPublicReviewData(token: string): Promise<any> {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_review_data', { p_token: token });

    if (error) {
        console.error('Error fetching public review data:', error);
        return null;
    }

    return data;
}
