'use server';

import { makeFunctionReference } from 'convex/server';
import { revalidatePath } from 'next/cache';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import type { Id } from '../../../convex/_generated/dataModel';
import type { PlatformInventoryKind, PlatformInventoryPage, PlatformRole } from './contracts';

const inventoryQuery = makeFunctionReference<'query', { kind: PlatformInventoryKind; cursor?: string; reportStatus?: 'OPEN' | 'RESOLVED' | 'DISMISSED' }, PlatformInventoryPage>('platformAdministration:inventory');
const statusMutation = makeFunctionReference<'mutation', { userId: Id<'users'>; status: 'active' | 'disabled'; reason: string; requestId: string }>('platformAdministration:setUserStatus');
const roleMutation = makeFunctionReference<'mutation', { userId: Id<'users'>; role: PlatformRole; status: 'ACTIVE' | 'REVOKED'; reason: string; requestId: string }>('platformAdministration:setRole');
const decisionMutation = makeFunctionReference<'mutation', { reportId: Id<'moderationReports'>; decision: 'DISMISSED' | 'QUARANTINED'; reason: string; requestId: string }>('platformAdministration:decideReport');
const clearMutation = makeFunctionReference<'mutation', { projectId: Id<'projects'>; reason: string; requestId: string }>('platformAdministration:clearRestriction');
const modelMutation = makeFunctionReference<'mutation', { modelId: Id<'videoModelCatalog'>; reason: string; requestId: string }>('platformAdministration:quarantineModel');
const clearModelMutation = makeFunctionReference<'mutation', { modelId: Id<'videoModelCatalog'>; reason: string; requestId: string }>('platformAdministration:clearModelQuarantine');
const reportMutation = makeFunctionReference<'mutation', { projectId: Id<'projects'>; category: 'CONSENT' | 'RIGHTS' | 'HARMFUL_CONTENT' | 'OTHER'; reason: string; requestId: string }, { reportId: Id<'moderationReports'> }>('platformAdministration:createReport');
const contextQuery = makeFunctionReference<'query', { projectExternalId: string }, { projectId: Id<'projects'>; name: string; moderationStatus: 'CLEAR' | 'RESTRICTED' }>('platformAdministration:reportContext');
const ownReportsQuery = makeFunctionReference<'query', { cursor?: string }, { reports: Array<{ reportId: string; projectId: string; category: string; reason: string; status: string; decisionReason: string | null; createdAt: number }>; continueCursor: string | null; isDone: boolean }>('platformAdministration:myReports');

export async function getPlatformInventory(options: { kind: PlatformInventoryKind; cursor?: string; reportStatus?: 'OPEN' | 'RESOLVED' | 'DISMISSED' }) {
  return (await getAuthenticatedConvexClient()).query(inventoryQuery, options);
}

export async function changePlatformRecord(input: { action: 'DISABLE_USER' | 'ENABLE_USER' | 'ROLE' | 'DECIDE_REPORT' | 'CLEAR_RESTRICTION' | 'QUARANTINE_MODEL' | 'CLEAR_MODEL_QUARANTINE'; targetId: string; reason: string; requestId: string; role?: PlatformRole; roleStatus?: 'ACTIVE' | 'REVOKED'; decision?: 'DISMISSED' | 'QUARANTINED' }): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getAuthenticatedConvexClient();
    const common = { reason: input.reason, requestId: input.requestId };
    switch (input.action) {
      case 'DISABLE_USER': case 'ENABLE_USER': await client.mutation(statusMutation, { ...common, userId: input.targetId as Id<'users'>, status: input.action === 'DISABLE_USER' ? 'disabled' : 'active' }); break;
      case 'ROLE':
        if (!input.role || !input.roleStatus) throw new Error('Choose the role and access state.');
        await client.mutation(roleMutation, { ...common, userId: input.targetId as Id<'users'>, role: input.role, status: input.roleStatus }); break;
      case 'DECIDE_REPORT':
        if (!input.decision) throw new Error('Choose a moderation decision.');
        await client.mutation(decisionMutation, { ...common, reportId: input.targetId as Id<'moderationReports'>, decision: input.decision }); break;
      case 'CLEAR_RESTRICTION': await client.mutation(clearMutation, { ...common, projectId: input.targetId as Id<'projects'> }); break;
      case 'QUARANTINE_MODEL': await client.mutation(modelMutation, { ...common, modelId: input.targetId as Id<'videoModelCatalog'> }); break;
      case 'CLEAR_MODEL_QUARANTINE': await client.mutation(clearModelMutation, { ...common, modelId: input.targetId as Id<'videoModelCatalog'> }); break;
      default: throw new Error('Choose an available action.');
    }
    for (const path of ['/admin', '/admin/users', '/admin/roles', '/admin/moderation', '/admin/audit', '/admin/video-routing', '/dashboard/projects', '/dashboard/settings/reports']) revalidatePath(path);
    return { success: true };
  } catch {
    return { success: false, error: 'This change was not confirmed. Check your role, the required reason, and the current record before retrying.' };
  }
}

export async function getReportContext(projectExternalId: string) {
  return (await getAuthenticatedConvexClient()).query(contextQuery, { projectExternalId });
}

export async function submitModerationReport(input: { projectId: string; category: 'CONSENT' | 'RIGHTS' | 'HARMFUL_CONTENT' | 'OTHER'; reason: string; requestId: string }): Promise<{ success: boolean; reportId?: string; error?: string }> {
  try {
    const result = await (await getAuthenticatedConvexClient()).mutation(reportMutation, { ...input, projectId: input.projectId as Id<'projects'> });
    revalidatePath('/dashboard/settings/reports'); revalidatePath('/admin/moderation');
    return { success: true, reportId: result.reportId };
  } catch { return { success: false, error: 'The report could not be confirmed. Check your project access and details, then try again.' }; }
}

export async function getMyModerationReports(cursor?: string) {
  return (await getAuthenticatedConvexClient()).query(ownReportsQuery, { cursor });
}
