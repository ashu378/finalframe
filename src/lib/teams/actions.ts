'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { StudioMember, StudioRole } from '@/lib/types/database';

/**
 * Fetch all members of the studio (where the current user is also a member)
 */
export async function getTeamMembers(studioId: string): Promise<{ success: boolean; data?: StudioMember[]; error?: string }> {
    const supabase = await createClient();

    try {
        // 1. Fetch active members
        const { data: membersData, error: membersError } = await supabase.rpc('get_studio_members_v2', {
            p_studio_id: studioId
        });

        if (membersError) throw membersError;

        // 2. Fetch pending invitations
        const { data: invitationsData, error: invitesError } = await supabase
            .from('studio_invitations')
            .select('*')
            .eq('studio_id', studioId);

        if (invitesError) throw invitesError;

        const members: StudioMember[] = (membersData || []).map((item: any) => ({
            id: item.id,
            studio_id: item.studio_id,
            user_id: item.user_id,
            role: item.role,
            created_at: item.created_at,
            status: 'active',
            email: item.email || 'Unknown',
            full_name: item.full_name || 'Unnamed User',
            avatar_url: item.avatar_url
        }));

        const invitations: StudioMember[] = (invitationsData || []).map((item: any) => ({
            id: item.id,
            studio_id: item.studio_id,
            role: item.role,
            created_at: item.created_at,
            status: 'pending',
            email: item.email,
            full_name: 'Invited User',
            avatar_url: undefined
        }));

        // Combine and sort
        const allMembers = [...members, ...invitations].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        return { success: true, data: allMembers };
    } catch (e: any) {
        console.error('[getTeamMembers] Error:', JSON.stringify(e, null, 2), 'Message:', e?.message, 'Code:', e?.code);
        return { success: false, error: e?.message || 'Unknown error' };
    }
}

/**
 * Invite a user to the studio by email.
 * This now supports both existing users and pending invites for non-users.
 */
export async function inviteMember(studioId: string, email: string, role: StudioRole): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    try {
        const { data: currentUser } = await supabase.auth.getUser();
        if (!currentUser.user) throw new Error('Not authenticated');

        // Use the new invite_user_v3 RPC which handles everything
        const { data, error } = await supabase.rpc('invite_user_v3', {
            p_studio_id: studioId,
            p_email: email,
            p_role: role
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to send invite');

        revalidatePath(`/dashboard/settings/team`);
        return { success: true };
    } catch (e: any) {
        console.error("Invite Error:", e);
        return { success: false, error: e.message || 'Failed to invite user' };
    }
}

/**
 * Update a member's role (works for both members and invitations)
 */
export async function updateMemberRole(memberId: string, newRole: StudioRole, isInvitation: boolean = false): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    try {
        const table = isInvitation ? 'studio_invitations' : 'studio_members';
        const { error } = await supabase
            .from(table)
            .update({ role: newRole })
            .eq('id', memberId);

        if (error) throw error;

        revalidatePath(`/dashboard/settings/team`);
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Remove a member or cancel an invitation
 */
export async function removeMember(memberId: string, isInvitation: boolean = false): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    try {
        const table = isInvitation ? 'studio_invitations' : 'studio_members';
        const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', memberId);

        if (error) throw error;

        revalidatePath(`/dashboard/settings/team`);
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
