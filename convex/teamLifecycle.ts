import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireCurrentMember, requireMemberById, requireUser } from './authorization';
import { recordedStudioOwner, studioRoleForUser, userExternalKey } from './studioMemberships';
import type { TeamContext, TeamMemberRow, WorkspaceRole } from '../src/lib/teams/contracts';

type ReadCtx = QueryCtx | MutationCtx;
const invitationRole = v.union(v.literal('admin'), v.literal('member'));
const roleValidator = v.union(v.literal('owner'), invitationRole);
const statusValidator = v.union(v.literal('PENDING'), v.literal('ACCEPTED'), v.literal('REVOKED'));
const optionalStudio = { studioId: v.optional(v.id('studios')) };
const contextValidator = v.object({ studioId: v.id('studios'), studioExternalId: v.string(), name: v.string(), role: roleValidator, recordedOwner: v.boolean(), userId: v.id('users') });
const cursorValidator = { isDone: v.boolean(), continueCursor: v.union(v.string(), v.null()) };
const note = (value: string) => { const text = value.trim(); if (text.length < 3 || text.length > 1000) throw new Error('A reason between 3 and 1000 characters is required.'); return text; };
const operation = (value: string) => { if (!/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new Error('A stable operation request ID is required.'); return value; };
const userKey = userExternalKey;
const isOwner = (member: Awaited<ReturnType<typeof requireMemberById>>) => member.role === 'owner' && recordedStudioOwner(member.studio, member.user, member.identity.externalId);
async function team(ctx: ReadCtx, studioId?: Id<'studios'>) {
  const member = studioId ? await requireMemberById(ctx, studioId) : await requireCurrentMember(ctx);
  if (member.studio.status === 'disabled' || member.studio.status === 'suspended') throw new Error('This workspace is unavailable.');
  return member;
}
function manager(member: Awaited<ReturnType<typeof team>>, adminRole = false) {
  if (adminRole ? !isOwner(member) : member.role !== 'owner' && member.role !== 'admin') throw new Error('Current workspace owner authority is required for this change.');
}
async function audit(ctx: MutationCtx, actor: Id<'users'>, studio: Doc<'studios'>, action: string, target: string, requestId: string, fingerprint: unknown, extra: Record<string, unknown> = {}) {
  const correlationId = `team:${action}:${actor}:${operation(requestId)}`;
  const existing = await ctx.db.query('audit').withIndex('by_correlation', (q) => q.eq('correlationId', correlationId)).unique();
  const data = existing?.metadata as Record<string, unknown> | undefined;
  if (existing && (existing.actorUserId !== actor || existing.entityId !== target || data?.scope !== 'STUDIO' || data?.fingerprint !== JSON.stringify(fingerprint) || existing.studioExternalId !== studio.externalId)) throw new Error('This request ID already belongs to another team change.');
  return { existing, write: async () => ctx.db.insert('audit', { studioExternalId: studio.externalId, actorUserId: actor, action, entityType: 'teamLifecycle', entityId: target, correlationId, metadata: { scope: 'STUDIO', fingerprint: JSON.stringify(fingerprint), ...extra }, createdAt: Date.now() }) };
}
async function synchronizeMember(ctx: MutationCtx, studio: Doc<'studios'>, user: Doc<'users'>, role: WorkspaceRole, status: 'active' | 'suspended' | 'removed') {
  const timestamp = Date.now();
  const legacy = await ctx.db.query('studioMembers').withIndex('by_studio_user', (q) => q.eq('studioExternalId', studio.externalId).eq('userExternalId', userKey(user))).unique();
  const aliases = await ctx.db.query('studioMembers').withIndex('by_studio_user_id', (q) => q.eq('studioId', studio._id).eq('userId', user._id)).take(3);
  if (aliases.length > 2 || (legacy?.userId && legacy.userId !== user._id)) throw new Error('This legacy membership needs migration review.');
  const canonical = await ctx.db.query('members').withIndex('by_studio_user', (q) => q.eq('studioId', studio._id).eq('userId', user._id)).unique();
  const membershipId = canonical?._id ?? await ctx.db.insert('members', { studioId: studio._id, userId: user._id, role, status, createdAt: timestamp, updatedAt: timestamp });
  if (canonical) await ctx.db.patch(canonical._id, { role, status, updatedAt: timestamp });
  const fields = { studioId: studio._id, userId: user._id, role, status: status === 'removed' ? 'suspended' as const : status, updatedAt: timestamp };
  const matches = new Map(aliases.map((row) => [row._id, row])); if (legacy) matches.set(legacy._id, legacy);
  if (matches.size) for (const row of matches.values()) await ctx.db.patch(row._id, { ...fields, ...(!legacy && row._id === aliases[0]?._id ? { userExternalId: userKey(user) } : {}) });
  else await ctx.db.insert('studioMembers', { studioExternalId: studio.externalId, userExternalId: userKey(user), ...fields, createdAt: timestamp, ...(status === 'active' ? { joinedAt: timestamp } : {}) });
  return membershipId;
}
function cursor(value: string | undefined, actor: string, scope: string) {
  if (!value) return { phase: 0, native: null as string | null };
  if (value.length > 20000) throw new Error('Invalid team continuation.');
  const parsed = JSON.parse(value);
  if (parsed.actor !== actor || parsed.scope !== scope || !Number.isInteger(parsed.phase) || parsed.phase < 0 || parsed.phase > 4 || (parsed.native !== null && typeof parsed.native !== 'string')) throw new Error('This continuation belongs to another team or user.');
  return { phase: parsed.phase as number, native: parsed.native as string | null };
}
function nextCursor(actor: string, scope: string, phase: number, native: string | null) { return JSON.stringify({ actor, scope, phase, native }); }
export const context = query({ args: optionalStudio, returns: contextValidator, handler: async (ctx, args): Promise<TeamContext> => {
  const member = await team(ctx, args.studioId); return { studioId: member.studio._id, studioExternalId: member.studio.externalId, name: member.studio.name, role: member.role, recordedOwner: isOwner(member), userId: member.user._id };
} });
export const workspaces = query({ args: { cursor: v.optional(v.string()) }, returns: v.object({ rows: v.array(v.object({ studioId: v.id('studios'), name: v.string(), role: roleValidator, selected: v.boolean() })), ...cursorValidator }), handler: async (ctx, args) => {
  const { user, identity } = await requireUser(ctx); const state = cursor(args.cursor, user._id, 'workspaces'); const options = { cursor: state.native, numItems: 20 };
  const rows: Array<{ studioId: Id<'studios'>; name: string; role: WorkspaceRole; selected: boolean }> = [];
  let isDone; let native;
  if (state.phase === 0) {
    const page = await ctx.db.query('members').withIndex('by_user_status', (q) => q.eq('userId', user._id).eq('status', 'active')).paginate(options); isDone = page.isDone; native = page.continueCursor;
    for (const row of page.page) { const studio = await ctx.db.get(row.studioId); if (studio) { const role = await studioRoleForUser(ctx, studio, user, identity.externalId); if (role) rows.push({ studioId: studio._id, name: studio.name, role, selected: user.currentStudioId === studio._id }); } }
  } else if (state.phase === 1) {
    const page = await ctx.db.query('studioMembers').withIndex('by_user_status', (q) => q.eq('userExternalId', identity.externalId).eq('status', 'active')).paginate(options); isDone = page.isDone; native = page.continueCursor;
    for (const row of page.page) { const studio = await ctx.db.query('studios').withIndex('by_external_id', (q) => q.eq('externalId', row.studioExternalId)).unique(); if (!studio) continue; const canonical = await ctx.db.query('members').withIndex('by_studio_user', (q) => q.eq('studioId', studio._id).eq('userId', user._id)).unique(); if (canonical) continue; const role = await studioRoleForUser(ctx, studio, user, identity.externalId); if (role) rows.push({ studioId: studio._id, name: studio.name, role, selected: user.currentStudioId === studio._id }); }
  } else {
    const page = state.phase === 2 ? await ctx.db.query('studios').withIndex('by_owner_user', (q) => q.eq('ownerUserId', user._id)).paginate(options) : state.phase === 3 ? await ctx.db.query('studios').withIndex('by_owner_id', (q) => q.eq('ownerId', user._id)).paginate(options) : await ctx.db.query('studios').withIndex('by_owner', (q) => q.eq('ownerExternalId', identity.externalId)).paginate(options); isDone = page.isDone; native = page.continueCursor;
    for (const studio of page.page) { if ((state.phase >= 3 && studio.ownerUserId === user._id) || (state.phase === 4 && studio.ownerId === user._id)) continue; const canonical = await ctx.db.query('members').withIndex('by_studio_user', (q) => q.eq('studioId', studio._id).eq('userId', user._id)).unique(); const legacy = await ctx.db.query('studioMembers').withIndex('by_studio_user', (q) => q.eq('studioExternalId', studio.externalId).eq('userExternalId', identity.externalId)).unique(); if (canonical || legacy) continue; const role = await studioRoleForUser(ctx, studio, user, identity.externalId); if (role) rows.push({ studioId: studio._id, name: studio.name, role, selected: user.currentStudioId === studio._id }); }
  }
  const done = state.phase === 4 && isDone;
  return { rows, isDone: done, continueCursor: done ? null : nextCursor(user._id, 'workspaces', isDone ? state.phase + 1 : state.phase, isDone ? null : native) };
} });
export const selectWorkspace = mutation({ args: { studioId: v.id('studios') }, returns: v.null(), handler: async (ctx, args) => { const member = await team(ctx, args.studioId); await ctx.db.patch(member.user._id, { currentStudioId: member.studio._id, updatedAt: Date.now() }); return null; } });
export const roster = query({ args: { studioId: v.id('studios'), cursor: v.optional(v.string()) }, returns: v.object({ rows: v.array(v.object({ key: v.string(), userId: v.union(v.id('users'), v.null()), displayName: v.string(), role: roleValidator, status: v.string(), source: v.union(v.literal('canonical'), v.literal('legacy')), recordedOwner: v.boolean() })), ...cursorValidator }), handler: async (ctx, args) => {
  const member = await team(ctx, args.studioId); manager(member); const scope = `roster:${member.studio._id}`; const state = cursor(args.cursor, member.user._id, scope); if (state.phase > 1) throw new Error('Invalid roster phase.');
  const options = { cursor: state.native, numItems: 25 }; const rows: TeamMemberRow[] = []; let isDone; let native;
  if (state.phase === 0) { const page = await ctx.db.query('members').withIndex('by_studio', (q) => q.eq('studioId', member.studio._id)).paginate(options); isDone = page.isDone; native = page.continueCursor;
    for (const row of page.page) { const user = await ctx.db.get(row.userId); rows.push({ key: row._id, userId: row.userId, displayName: user?.displayName ?? user?.name ?? 'Unavailable account', role: row.role, status: row.status, source: 'canonical', recordedOwner: Boolean(user && recordedStudioOwner(member.studio, user, userKey(user))) }); }
  } else { const page = await ctx.db.query('studioMembers').withIndex('by_studio', (q) => q.eq('studioExternalId', member.studio.externalId)).paginate(options); isDone = page.isDone; native = page.continueCursor;
    for (const row of page.page) { const user = row.userId ? await ctx.db.get(row.userId) : await ctx.db.query('users').withIndex('by_external_id', (q) => q.eq('externalId', row.userExternalId)).unique(); if (user) { const canonical = await ctx.db.query('members').withIndex('by_studio_user', (q) => q.eq('studioId', member.studio._id).eq('userId', user._id)).unique(); if (canonical) continue; } rows.push({ key: row._id, userId: user?._id ?? null, displayName: user?.displayName ?? user?.name ?? 'Legacy invitation without a canonical recipient', role: row.role, status: row.status, source: 'legacy', recordedOwner: Boolean(user && recordedStudioOwner(member.studio, user, userKey(user))) }); }
  }
  const done = state.phase === 1 && isDone; return { rows, isDone: done, continueCursor: done ? null : nextCursor(member.user._id, scope, isDone ? 1 : state.phase, isDone ? null : native) };
} });
export const invitations = query({ args: { studioId: v.id('studios'), status: statusValidator, cursor: v.optional(v.string()), now: v.number() }, returns: v.object({ rows: v.array(v.object({ invitationId: v.id('studioInvitations'), recipientUserId: v.id('users'), role: invitationRole, status: statusValidator, expiresAt: v.number(), expired: v.boolean(), createdAt: v.number() })), ...cursorValidator }), handler: async (ctx, args) => {
  const member = await team(ctx, args.studioId); manager(member); if (!Number.isFinite(args.now)) throw new Error('A display timestamp is required.'); const scope = `invitations:${args.studioId}:${args.status}`; const state = cursor(args.cursor, member.user._id, scope); if (state.phase !== 0) throw new Error('Invalid invitation phase.');
  const page = await ctx.db.query('studioInvitations').withIndex('by_studio_status', (q) => q.eq('studioId', args.studioId).eq('status', args.status)).order('desc').paginate({ cursor: state.native, numItems: 25 });
  return { rows: page.page.map((row) => ({ invitationId: row._id, recipientUserId: row.recipientUserId, role: row.role, status: row.status, expiresAt: row.expiresAt, expired: row.expiresAt <= args.now, createdAt: row.createdAt })), isDone: page.isDone, continueCursor: page.isDone ? null : nextCursor(member.user._id, scope, 0, page.continueCursor) };
} });
export const createInvitation = mutation({ args: { studioId: v.id('studios'), recipientUserId: v.id('users'), role: invitationRole, tokenHash: v.string(), expiresAt: v.number(), requestId: v.string() }, returns: v.object({ invitationId: v.id('studioInvitations'), replayed: v.boolean() }), handler: async (ctx, args) => {
  const member = await team(ctx, args.studioId); manager(member, args.role === 'admin'); if (!/^[a-f0-9]{64}$/.test(args.tokenHash)) throw new Error('A SHA-256 invitation hash is required.');
  if (args.role !== 'admin' && args.role !== 'member') throw new Error('Invitations cannot grant workspace ownership.');
  const key = `studio-invite:${member.user._id}:${operation(args.requestId)}`;
  const existing = await ctx.db.query('studioInvitations').withIndex('by_idempotency', (q) => q.eq('idempotencyKey', key)).unique();
  if (existing) { if (existing.studioId !== args.studioId || existing.recipientUserId !== args.recipientUserId || existing.role !== args.role || existing.tokenHash !== args.tokenHash || existing.expiresAt !== args.expiresAt) throw new Error('This request already belongs to another invitation.'); return { invitationId: existing._id, replayed: true }; }
  const timestamp = Date.now(); if (!Number.isFinite(args.expiresAt) || args.expiresAt < timestamp + 60_000 || args.expiresAt > timestamp + 7 * 86400_000) throw new Error('Invitation expiry must be between one minute and seven days from now.');
  const user = await ctx.db.get(args.recipientUserId); if (!user || user.status === 'disabled' || user.deactivationRequestId || user._id === member.user._id || recordedStudioOwner(member.studio, user, userKey(user))) throw new Error('This canonical recipient is unavailable.');
  const canonical = await ctx.db.query('members').withIndex('by_studio_user', (q) => q.eq('studioId', args.studioId).eq('userId', user._id)).unique();
  const legacy = await ctx.db.query('studioMembers').withIndex('by_studio_user', (q) => q.eq('studioExternalId', member.studio.externalId).eq('userExternalId', userKey(user))).unique();
  if (canonical || legacy) throw new Error('This user already has a workspace record. Use explicit member review/restoration instead of an invitation.');
  const pending = await ctx.db.query('studioInvitations').withIndex('by_studio_recipient_status', (q) => q.eq('studioId', args.studioId).eq('recipientUserId', user._id).eq('status', 'PENDING')).take(51);
  if (pending.length > 50 || pending.some((row) => row.expiresAt > timestamp)) throw new Error('Revoke prior pending invitations for this recipient before creating another.');
  if (await ctx.db.query('studioInvitations').withIndex('by_token_hash', (q) => q.eq('tokenHash', args.tokenHash)).unique()) throw new Error('Use a new secure invitation token.');
  const invitationId = await ctx.db.insert('studioInvitations', { studioId: args.studioId, studioExternalId: member.studio.externalId, recipientUserId: user._id, role: args.role, tokenHash: args.tokenHash, status: 'PENDING', idempotencyKey: key, createdByUserId: member.user._id, createdAt: timestamp, updatedAt: timestamp, expiresAt: args.expiresAt });
  const event = await audit(ctx, member.user._id, member.studio, 'STUDIO_INVITATION_CREATED', invitationId, args.requestId, { recipientUserId: user._id, role: args.role, expiresAt: args.expiresAt }); await event.write();
  return { invitationId, replayed: false };
} });
async function inviteByToken(ctx: ReadCtx, token: string) { if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null; const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))).map((byte) => byte.toString(16).padStart(2, '0')).join(''); return ctx.db.query('studioInvitations').withIndex('by_token_hash', (q) => q.eq('tokenHash', hash)).unique(); }
async function validInviter(ctx: ReadCtx, invitation: Doc<'studioInvitations'>, studio: Doc<'studios'>) {
  const user = await ctx.db.get(invitation.createdByUserId); if (!user || user.status === 'disabled' || studio.status === 'disabled' || studio.status === 'suspended') return false;
  const role = await studioRoleForUser(ctx, studio, user, userKey(user)); return invitation.role === 'admin' ? role === 'owner' && recordedStudioOwner(studio, user, userKey(user)) : role === 'owner' || role === 'admin';
}
// Read-only mutation: token/expiry inspection is uncached and never appears in
// a public URL query, persisted request, audit field or directory response.
export const previewInvitation = mutation({ args: { token: v.string() }, returns: v.union(v.null(), v.object({ invitationId: v.id('studioInvitations'), studioId: v.id('studios'), studioName: v.string(), role: invitationRole, expiresAt: v.number(), status: v.union(v.literal('PENDING'), v.literal('ACCEPTED')), canAccept: v.boolean() })), handler: async (ctx, args) => {
  const { user } = await requireUser(ctx); const invitation = await inviteByToken(ctx, args.token);
  if (!invitation || invitation.recipientUserId !== user._id || invitation.status === 'REVOKED' || invitation.expiresAt <= Date.now()) return null;
  const studio = await ctx.db.get(invitation.studioId); if (!studio || !await validInviter(ctx, invitation, studio)) return null;
  const canonical = await ctx.db.query('members').withIndex('by_studio_user', (q) => q.eq('studioId', studio._id).eq('userId', user._id)).unique();
  if (invitation.status === 'PENDING' && canonical) return null;
  if (invitation.status === 'ACCEPTED' && (!canonical || canonical.status !== 'active' || !await studioRoleForUser(ctx, studio, user, userKey(user)))) return null;
  return { invitationId: invitation._id, studioId: studio._id, studioName: studio.name, role: invitation.role, expiresAt: invitation.expiresAt, status: invitation.status, canAccept: invitation.status === 'PENDING' };
} });
export const acceptInvitation = mutation({ args: { token: v.string(), requestId: v.string(), selectWorkspace: v.boolean() }, returns: v.object({ studioId: v.id('studios'), replayed: v.boolean() }), handler: async (ctx, args) => {
  const { user } = await requireUser(ctx); operation(args.requestId); const invitation = await inviteByToken(ctx, args.token);
  if (!invitation || invitation.recipientUserId !== user._id || invitation.status === 'REVOKED') throw new Error('This invitation is unavailable.');
  const studio = await ctx.db.get(invitation.studioId); if (!studio) throw new Error('This invitation is unavailable.');
  const event = await audit(ctx, user._id, studio, 'STUDIO_INVITATION_ACCEPTED', invitation._id, args.requestId, { invitationId: invitation._id, selectWorkspace: args.selectWorkspace });
  const canonical = await ctx.db.query('members').withIndex('by_studio_user', (q) => q.eq('studioId', studio._id).eq('userId', user._id)).unique();
  if (invitation.status === 'ACCEPTED') { if (invitation.acceptedByUserId !== user._id || invitation.acceptedRequestId !== args.requestId || !canonical || canonical.status !== 'active') throw new Error('This accepted invitation cannot restore or replace a membership.'); return { studioId: studio._id, replayed: true }; }
  if (invitation.expiresAt <= Date.now() || !await validInviter(ctx, invitation, studio) || canonical) throw new Error('This invitation expired or membership/issuer authority changed.');
  const legacy = await ctx.db.query('studioMembers').withIndex('by_studio_user', (q) => q.eq('studioExternalId', studio.externalId).eq('userExternalId', userKey(user))).unique();
  if (legacy) throw new Error('This workspace membership needs explicit review before acceptance.');
  const membershipId = await synchronizeMember(ctx, studio, user, invitation.role, 'active');
  await ctx.db.patch(invitation._id, { status: 'ACCEPTED', acceptedByUserId: user._id, acceptedAt: Date.now(), acceptedRequestId: args.requestId, membershipId, updatedAt: Date.now() });
  if (args.selectWorkspace) await ctx.db.patch(user._id, { currentStudioId: studio._id, updatedAt: Date.now() });
  await event.write();
  return { studioId: studio._id, replayed: false };
} });
export const revokeInvitation = mutation({ args: { invitationId: v.id('studioInvitations'), requestId: v.string(), reason: v.string() }, returns: v.object({ replayed: v.boolean() }), handler: async (ctx, args) => {
  const invitation = await ctx.db.get(args.invitationId); if (!invitation) throw new Error('This invitation is unavailable.'); const member = await team(ctx, invitation.studioId); manager(member, invitation.role === 'admin'); const reason = note(args.reason);
  const event = await audit(ctx, member.user._id, member.studio, 'STUDIO_INVITATION_REVOKED', invitation._id, args.requestId, { reason }); if (event.existing) return { replayed: true };
  if (invitation.status !== 'PENDING') throw new Error('Only a pending invitation can be revoked.');
  await ctx.db.patch(invitation._id, { status: 'REVOKED', revokedByUserId: member.user._id, revokedAt: Date.now(), revocationReason: reason, updatedAt: Date.now() }); await event.write(); return { replayed: false };
} });

async function requireProjectHandoffBeforeRemoval(ctx: MutationCtx, studio: Doc<'studios'>, user: Doc<'users'>) {
  const failure = () => { throw new Error('Shared project ownership must be handed off before this member can be suspended or removed. No private project details are disclosed.'); };
  const incomplete = () => { throw new Error('The bounded project ownership review is incomplete. Ask for staff-assisted handoff review before changing access.'); };
  const memberships = await ctx.db.query('projectMembers').withIndex('by_user', (q) => q.eq('userId', user._id)).take(101); if (memberships.length > 100) incomplete();
  const projects = new Set<Id<'projects'>>(memberships.filter((row) => row.status === 'ACTIVE' && row.role === 'OWNER').map((row) => row.projectId));
  for (const source of [() => ctx.db.query('projects').withIndex('by_owner_user', (q) => q.eq('ownerUserId', user._id)).take(101), () => ctx.db.query('projects').withIndex('by_created_by_user', (q) => q.eq('createdByUserId', user._id)).take(101), () => ctx.db.query('projects').withIndex('by_created_by_external', (q) => q.eq('createdByExternalId', userKey(user))).take(101)]) { const rows = await source(); if (rows.length > 100) incomplete(); for (const project of rows) projects.add(project._id); }
  let scanned = projects.size + memberships.length; if (scanned > 500) incomplete();
  for (const projectId of projects) {
    const project = await ctx.db.get(projectId); if (!project || project.studioExternalId !== studio.externalId) continue;
    const explicit = await ctx.db.query('projectMembers').withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', user._id)).unique();
    if (explicit && (explicit.status !== 'ACTIVE' || explicit.role !== 'OWNER')) continue;
    const peers = await ctx.db.query('projectMembers').withIndex('by_project_status', (q) => q.eq('projectId', projectId).eq('status', 'ACTIVE')).take(51); scanned += peers.length; if (peers.length > 50 || scanned > 500) incomplete();
    let shared = false; let anotherOwner = false;
    for (const peer of peers) {
      if (peer.userId === user._id) continue; // Prospective inactive member never counts.
      const account = await ctx.db.get(peer.userId); if (!account || !await studioRoleForUser(ctx, studio, account, userKey(account))) continue;
      shared = true; if (peer.role === 'OWNER') anotherOwner = true;
    }
    if (shared && !anotherOwner) failure();
  }
}
export const changeMember = mutation({ args: { studioId: v.id('studios'), userId: v.id('users'), role: v.optional(invitationRole), status: v.optional(v.union(v.literal('active'), v.literal('suspended'), v.literal('removed'))), reason: v.string(), requestId: v.string() }, returns: v.object({ replayed: v.boolean() }), handler: async (ctx, args) => {
  const actor = await team(ctx, args.studioId); manager(actor); const reason = note(args.reason);
  const user = await ctx.db.get(args.userId); if (!user) throw new Error('This workspace member is unavailable.');
  if (recordedStudioOwner(actor.studio, user, userKey(user))) throw new Error('The recorded primary owner can change only through explicit ownership handoff.');
  const canonical = await ctx.db.query('members').withIndex('by_studio_user', (q) => q.eq('studioId', args.studioId).eq('userId', user._id)).unique();
  const legacy = await ctx.db.query('studioMembers').withIndex('by_studio_user', (q) => q.eq('studioExternalId', actor.studio.externalId).eq('userExternalId', userKey(user))).unique();
  if (!canonical && !legacy) throw new Error('This user has no workspace membership to manage.');
  const priorRole = canonical?.role ?? legacy!.role; const priorStatus = canonical?.status ?? legacy!.status;
  const role = args.role ?? (priorRole === 'owner' ? 'admin' : priorRole);
  const status = args.status ?? priorStatus;
  if (status !== 'active' && status !== 'suspended' && status !== 'removed') throw new Error('Use a recipient-ID invitation to accept invited members.');
  if (!args.role && !args.status) throw new Error('Choose a member role or access change.');
  // Only the current recorded owner can grant/manage admin authority or restore
  // a durable denial. Ordinary admins may manage existing ordinary members.
  manager(actor, role === 'admin' || priorRole !== 'member' || (status === 'active' && priorStatus !== 'active'));
  if (status === 'active' && (user.status === 'disabled' || user.deactivationRequestId)) throw new Error('Restore the account before enabling workspace access.');
  const event = await audit(ctx, actor.user._id, actor.studio, 'STUDIO_MEMBER_CHANGED', user._id, args.requestId, { role: args.role ?? null, status: args.status ?? null, reason }); if (event.existing) return { replayed: true };
  if (priorStatus === 'active' && status !== 'active') await requireProjectHandoffBeforeRemoval(ctx, actor.studio, user);
  await synchronizeMember(ctx, actor.studio, user, role, status); await event.write(); return { replayed: false };
} });
export const transferOwnership = mutation({ args: { studioId: v.id('studios'), successorUserId: v.id('users'), reason: v.string(), confirmation: v.string(), requestId: v.string() }, returns: v.object({ studioId: v.id('studios'), replayed: v.boolean() }), handler: async (ctx, args) => {
  const actor = await team(ctx, args.studioId); const reason = note(args.reason);
  if (args.confirmation !== `TRANSFER ${args.successorUserId}`) throw new Error('Type TRANSFER followed by the exact successor account ID.');
  const event = await audit(ctx, actor.user._id, actor.studio, 'STUDIO_OWNERSHIP_TRANSFERRED', args.studioId, args.requestId, { successorUserId: args.successorUserId, reason });
  if (event.existing) { if ((actor.studio.ownerUserId ?? actor.studio.ownerId) !== args.successorUserId) throw new Error('Ownership changed again after this handoff.'); return { studioId: actor.studio._id, replayed: true }; }
  manager(actor, true);
  const successor = await ctx.db.get(args.successorUserId);
  if (!successor || successor._id === actor.user._id || successor.status === 'disabled' || successor.deactivationRequestId) throw new Error('Choose another enabled canonical workspace member.');
  const membership = await ctx.db.query('members').withIndex('by_studio_user', (q) => q.eq('studioId', actor.studio._id).eq('userId', successor._id)).unique();
  if (!membership || membership.status !== 'active') throw new Error('The successor must already be an ACTIVE canonical workspace member.');
  await synchronizeMember(ctx, actor.studio, successor, 'owner', 'active');
  await synchronizeMember(ctx, actor.studio, actor.user, 'admin', 'active');
  await ctx.db.patch(actor.studio._id, { ownerUserId: successor._id, ownerId: successor._id, ownerExternalId: userKey(successor), updatedAt: Date.now() });
  await event.write(); return { studioId: actor.studio._id, replayed: false };
} });
