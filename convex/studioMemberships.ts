import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
type ReadCtx = QueryCtx | MutationCtx;
export type StudioRole = 'owner' | 'admin' | 'member';
export const userExternalKey = (user: Doc<'users'>) => user.authSubject?.split('|', 1)[0] || user.externalId || String(user._id);
export function recordedStudioOwner(studio: Doc<'studios'>, user: Doc<'users'>, externalId: string) {
  const primary = studio.ownerUserId ?? studio.ownerId;
  return primary ? primary === user._id : studio.ownerExternalId === externalId;
}
/** Inspection only: callers supply a user resolved from their verified session,
 * or inspect a stored invitation actor. No public function accepts this user. */
export async function studioRoleForUser(ctx: ReadCtx, studio: Doc<'studios'>, user: Doc<'users'>, externalId: string): Promise<StudioRole | null> {
  if (user.status === 'disabled') return null;
  const canonical = await ctx.db.query('members').withIndex('by_studio_user', (q) => q.eq('studioId', studio._id).eq('userId', user._id)).unique();
  // Every explicit state is authoritative, including invited/suspended/removed.
  if (canonical) return canonical.status === 'active' ? canonical.role : null;
  const legacy = await ctx.db.query('studioMembers').withIndex('by_studio_user', (q) => q.eq('studioExternalId', studio.externalId).eq('userExternalId', externalId)).unique();
  if (legacy) return legacy.status === 'active' && (!legacy.userId || legacy.userId === user._id) ? legacy.role : null;
  return recordedStudioOwner(studio, user, externalId) ? 'owner' : null;
}
export async function ownedStudioCandidates(ctx: ReadCtx, user: Doc<'users'>, externalId: string) {
  const studios = new Map<string, Doc<'studios'>>();
  const sources = [
    () => ctx.db.query('studios').withIndex('by_owner_user', (q) => q.eq('ownerUserId', user._id)).take(101),
    () => ctx.db.query('studios').withIndex('by_owner_id', (q) => q.eq('ownerId', user._id)).take(101),
    () => ctx.db.query('studios').withIndex('by_owner', (q) => q.eq('ownerExternalId', externalId)).take(101),
  ];
  for (const source of sources) {
    const rows = await source();
    if (rows.length > 100) throw new Error('Workspace ownership scan is incomplete; select an authorized workspace explicitly or request migration assistance.');
    for (const studio of rows) if (recordedStudioOwner(studio, user, externalId)) studios.set(studio._id, studio);
  }
  return [...studios.values()];
}
export async function currentStudioForUser(ctx: ReadCtx, user: Doc<'users'>, externalId: string) {
  if (user.status === 'disabled') return null;
  if (user.currentStudioId) {
    const studio = await ctx.db.get(user.currentStudioId);
    if (studio) { const role = await studioRoleForUser(ctx, studio, user, externalId); if (role) return { studio, role }; }
  }
  const canonical = await ctx.db.query('members').withIndex('by_user_status', (q) => q.eq('userId', user._id).eq('status', 'active')).take(101);
  for (const row of canonical.slice(0, 100)) { const studio = await ctx.db.get(row.studioId); if (studio) { const role = await studioRoleForUser(ctx, studio, user, externalId); if (role) return { studio, role }; } }
  if (canonical.length > 100) throw new Error('Active workspace scan is incomplete; choose a workspace explicitly.');
  const legacy = await ctx.db.query('studioMembers').withIndex('by_user_status', (q) => q.eq('userExternalId', externalId).eq('status', 'active')).take(101);
  for (const row of legacy.slice(0, 100)) { const studio = await ctx.db.query('studios').withIndex('by_external_id', (q) => q.eq('externalId', row.studioExternalId)).unique(); if (studio) { const role = await studioRoleForUser(ctx, studio, user, externalId); if (role) return { studio, role }; } }
  if (legacy.length > 100) throw new Error('Legacy workspace scan is incomplete; request migration assistance.');
  for (const studio of await ownedStudioCandidates(ctx, user, externalId)) { const role = await studioRoleForUser(ctx, studio, user, externalId); if (role) return { studio, role }; }
  return null;
}
