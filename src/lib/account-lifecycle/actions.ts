'use server';

import { makeFunctionReference } from 'convex/server';
import { revalidatePath } from 'next/cache';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import type { Id } from '../../../convex/_generated/dataModel';
import type { AccountProfile, AccountExportSummary, AccountExportPart, DeactivationPreflight, DeactivationRequestRow } from './contracts';

const profileQuery = makeFunctionReference<'query', { now: number }, AccountProfile>('accountLifecycle:profile');
const updateMutation = makeFunctionReference<'mutation', { displayName: string }, { displayName: string }>('accountLifecycle:updateProfile');
const startMutation = makeFunctionReference<'mutation', { requestId: string }, AccountExportSummary>('accountLifecycle:startExport');
const partMutation = makeFunctionReference<'mutation', { requestId: Id<'accountExportRequests'>; ordinal: number }, AccountExportPart>('accountLifecycle:exportPart');
const manifestMutation = makeFunctionReference<'mutation', { requestId: Id<'accountExportRequests'> }, Record<string, unknown>>('accountLifecycle:exportManifest');
const cancelMutation = makeFunctionReference<'mutation', { requestId: Id<'accountExportRequests'> }, null>('accountLifecycle:cancelExport');
const preflightQuery = makeFunctionReference<'query', {}, DeactivationPreflight>('accountLifecycle:deactivationPreflight');
const deactivateMutation = makeFunctionReference<'mutation', { requestId: string; reason: string; confirmation: string }, { requestId: string; replayed: boolean }>('accountLifecycle:requestDeactivation');
const requestsQuery = makeFunctionReference<'query', { cursor?: string }, { requests: DeactivationRequestRow[]; isDone: boolean; continueCursor: string | null }>('accountLifecycle:deactivationRequests');
const recoverMutation = makeFunctionReference<'mutation', { requestId: Id<'accountDeactivationRequests'>; reason: string }, { requestId: string; replayed: boolean }>('accountLifecycle:recoverAccount');
type Result<T> = { success: true; data: T } | { success: false; error: string };
async function attempt<T>(run: () => Promise<T>, error: string): Promise<Result<T>> { try { return { success: true, data: await run() }; } catch { return { success: false, error }; } }

export async function getAccountProfile() { return (await getAuthenticatedConvexClient()).query(profileQuery, { now: Date.now() }); }
export async function saveAccountProfile(displayName: string) {
  return attempt(async () => { const result = await (await getAuthenticatedConvexClient()).mutation(updateMutation, { displayName }); revalidatePath('/dashboard/settings/account'); return result; }, 'Your display name was not saved. Check its length and your account access, then try again.');
}
export async function startAccountIndex(requestId: string) { return attempt(async () => (await getAuthenticatedConvexClient()).mutation(startMutation, { requestId }), 'The index request was not confirmed. Check your account access, then retry.'); }
export async function downloadAccountIndexPart(requestId: string, ordinal: number) { return attempt(async () => (await getAuthenticatedConvexClient()).mutation(partMutation, { requestId: requestId as Id<'accountExportRequests'>, ordinal }), 'This part could not be confirmed. Retry the same part number. If access or records changed, cancel and start a new index.'); }
export async function downloadAccountIndexManifest(requestId: string) { return attempt(async () => (await getAuthenticatedConvexClient()).mutation(manifestMutation, { requestId: requestId as Id<'accountExportRequests'> }), 'Finish the unexpired index before downloading its manifest.'); }
export async function cancelAccountIndex(requestId: string) { return attempt(async () => (await getAuthenticatedConvexClient()).mutation(cancelMutation, { requestId: requestId as Id<'accountExportRequests'> }), 'The index cancellation was not confirmed. Retry before starting a new request.'); }
export async function checkAccountDeactivation() { return attempt(async () => (await getAuthenticatedConvexClient()).query(preflightQuery, {}), 'Ownership review could not be completed. No deactivation was performed.'); }
export async function requestAccountDeactivation(input: { requestId: string; reason: string; confirmation: string }) {
  // Do not revalidate the guarded dashboard after disabling this account. The
  // client first receives its receipt, signs out and opens a static confirmation.
  return attempt(async () => (await getAuthenticatedConvexClient()).mutation(deactivateMutation, input), 'The deactivation request was not confirmed. Recheck ownership handoff and the confirmation text. If access has already stopped, contact support with your request details.');
}
export async function getAccountDeactivationRequests(cursor?: string) { return (await getAuthenticatedConvexClient()).query(requestsQuery, { cursor }); }
export async function recoverDeactivatedAccount(requestId: string, reason: string) {
  return attempt(async () => { const result = await (await getAuthenticatedConvexClient()).mutation(recoverMutation, { requestId: requestId as Id<'accountDeactivationRequests'>, reason }); revalidatePath('/admin/account-requests'); revalidatePath('/admin/users'); revalidatePath('/admin/audit'); return result; }, 'Recovery was not confirmed. Check your ADMIN access and the current request before retrying.');
}
