'use server';

import { revalidatePath } from 'next/cache';
import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import type { StudioMember, StudioRole } from '@/lib/types/database';

export async function getTeamMembers(_studioId: string): Promise<{ success: boolean; data?: StudioMember[]; error?: string }> {
  try {
    const rows = await (await getAuthenticatedConvexClient()).query(api.app.team, {});
    const data = rows.map((row: any) => ({ id: row._id, studio_id: row.studioExternalId, user_id: row.userExternalId, role: row.role, created_at: new Date(row.createdAt).toISOString(), status: row.status === 'invited' ? 'pending' : row.status, email: row.userExternalId, full_name: row.userExternalId, avatar_url: undefined })) as StudioMember[];
    return { success: true, data };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to load team' }; }
}

export async function inviteMember(_studioId: string, email: string, role: StudioRole): Promise<{ success: boolean; error?: string }> {
  try { await (await getAuthenticatedConvexClient()).mutation(api.app.inviteTeamMember, { email, role: role === 'owner' || role === 'editor' ? 'admin' : 'member' }); revalidatePath('/dashboard/settings/team'); return { success: true }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to invite team member' }; }
}

export async function updateMemberRole(memberId: string, newRole: StudioRole, _isInvitation = false): Promise<{ success: boolean; error?: string }> {
  try { await (await getAuthenticatedConvexClient()).mutation(api.app.updateTeamMember, { memberId: memberId as never, role: newRole === 'owner' ? 'owner' : newRole === 'editor' ? 'admin' : 'member' }); revalidatePath('/dashboard/settings/team'); return { success: true }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to update team member' }; }
}

export async function removeMember(memberId: string, _isInvitation = false): Promise<{ success: boolean; error?: string }> {
  try { await (await getAuthenticatedConvexClient()).mutation(api.app.removeTeamMember, { memberId: memberId as never }); revalidatePath('/dashboard/settings/team'); return { success: true }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to remove team member' }; }
}
