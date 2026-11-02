import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUser, requireUser, requireProjectAccess } from './authorization';
import { ConvexAuthError, ConvexAuthorizationError } from './auth';
import { requirePlatformRole } from './platformAdministration';
import { ACCOUNT_INDEX_SCOPE, ACCOUNT_INDEX_VERSION, type DeactivationPreflight } from '../src/lib/account-lifecycle/contracts';
import { exportPayload, sha256, type ExportRecord, type FragmentProgress } from '../src/lib/account-lifecycle/export-format';

type ReadCtx = QueryCtx | MutationCtx;
type Actor = Awaited<ReturnType<typeof requireUser>>;
type IndexCursor = FragmentProgress & { version: 1; stage: number; native: string | null };
const initialCursor = (): IndexCursor => ({ version: 1, stage: 0, native: null, itemOffset: 0, fragmentOffset: 0 });
const encode = (state: IndexCursor) => JSON.stringify(state);
const STAGES = 9;
const PAGE_ROWS = 5;
const EXPORT_TTL = 24 * 60 * 60 * 1000;
const exportSummaryValidator = v.object({ requestId: v.id('accountExportRequests'), status: v.union(v.literal('OPEN'), v.literal('COMPLETED'), v.literal('CANCELED')), nextOrdinal: v.number(), recordCount: v.number(), expiresAt: v.number(), expired: v.boolean() });
const preflightValidator = v.object({ allowed: v.boolean(), blockers: v.array(v.object({ code: v.union(v.literal('LAST_PLATFORM_ADMIN'), v.literal('SHARED_STUDIO_OWNER'), v.literal('SHARED_PROJECT_OWNER'), v.literal('SCAN_LIMIT')), message: v.string() })) });

function operationKey(value: string) { if (!/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new Error('A stable operation request ID is required.'); return value; }
function note(value: string) { const result = value.trim(); if (result.length < 3 || result.length > 1000) throw new Error('Provide a reason between 3 and 1000 characters.'); return result; }
function summary(request: Doc<'accountExportRequests'>, now: number) { return { requestId: request._id, status: request.status, nextOrdinal: request.nextOrdinal, recordCount: request.recordCount, expiresAt: request.expiresAt, expired: request.expiresAt <= now }; }
async function log(ctx: MutationCtx, userId: Id<'users'>, action: string, entityId: string, details: Record<string, unknown> = {}, platform = false) {
  await ctx.db.insert('audit', { actorUserId: userId, action, entityType: 'accountLifecycle', entityId, metadata: { scope: platform ? 'PLATFORM' : 'ACCOUNT', ...details }, createdAt: Date.now() });
}
async function authorizedProject(ctx: ReadCtx, projectId: Id<'projects'>) {
  try { return await requireProjectAccess(ctx, projectId, undefined, { includeInactive: true, allowRestrictedRead: true }); }
  catch (error) {
    if (error instanceof ConvexAuthorizationError && ['PROJECT_ACCESS_DENIED', 'PROJECT_NOT_FOUND', 'STUDIO_ACCESS_DENIED', 'STUDIO_NOT_FOUND'].includes(error.code)) return null;
    throw error;
  }
}
function projectRecord(access: NonNullable<Awaited<ReturnType<typeof authorizedProject>>>): ExportRecord | null {
  if (access.projectRole !== 'OWNER' && access.projectRole !== 'EDITOR') return null;
  const project = access.project;
  const minimal = { projectId: project._id, name: project.name, status: project.status ?? 'DRAFT', moderationStatus: project.moderationStatus ?? 'CLEAR', yourRole: access.projectRole };
  return { kind: 'projects', id: project._id, value: project.moderationStatus === 'RESTRICTED' ? minimal : { ...minimal, description: project.description ?? null, projectType: project.projectType ?? null, createdAt: project.createdAt, updatedAt: project.updatedAt, archivedAt: project.archivedAt ?? null, deletedAt: project.deletedAt ?? null } };
}

export const profile = query({
  args: { now: v.number() }, returns: v.object({ userId: v.id('users'), displayName: v.string(), email: v.string(), latestExport: v.union(v.null(), exportSummaryValidator) }), handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    if (!Number.isFinite(args.now)) throw new Error('A finite display timestamp is required.');
    const latest = await ctx.db.query('accountExportRequests').withIndex('by_user', (q) => q.eq('userId', user._id)).order('desc').first();
    return { userId: user._id, displayName: user.displayName ?? user.name ?? '', email: user.email ?? '', latestExport: latest ? summary(latest, args.now) : null };
  },
});
export const updateProfile = mutation({
  args: { displayName: v.string() }, returns: v.object({ displayName: v.string() }), handler: async (ctx, args) => {
    const { user } = await requireUser(ctx); const displayName = args.displayName.trim();
    if (!displayName || displayName.length > 100 || /[\u0000-\u001f\u007f]/.test(displayName)) throw new Error('Use a display name between 1 and 100 characters without control characters.');
    if (displayName !== user.displayName) { await ctx.db.patch(user._id, { displayName, updatedAt: Date.now() }); await log(ctx, user._id, 'ACCOUNT_PROFILE_UPDATED', user._id, { fields: ['displayName'] }); }
    return { displayName };
  },
});

async function sourcePage(ctx: ReadCtx, actor: Actor, state: IndexCursor): Promise<{ records: Array<ExportRecord | null>; isDone: boolean; continueCursor: string | null }> {
  const options = { cursor: state.native, numItems: PAGE_ROWS };
  const { user, identity } = actor;
  if (state.stage === 0) return { records: [{ kind: 'profile', id: user._id, value: { userId: user._id, displayName: user.displayName ?? user.name ?? null, email: user.email ?? null, createdAt: user.createdAt ?? user._creationTime, updatedAt: user.updatedAt ?? null } }], isDone: true, continueCursor: null };
  if (state.stage === 1) {
    const page = await ctx.db.query('members').withIndex('by_user', (q) => q.eq('userId', user._id)).paginate(options);
    return { ...page, records: page.page.map((row) => ({ kind: 'studioMemberships', id: row._id, value: { membershipId: row._id, studioId: row.studioId, role: row.role, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt } })) };
  }
  if (state.stage === 2 || state.stage === 3) {
    const page = state.stage === 2 ? await ctx.db.query('studioMembers').withIndex('by_user_id', (q) => q.eq('userId', user._id)).paginate(options) : await ctx.db.query('studioMembers').withIndex('by_user', (q) => q.eq('userExternalId', identity.externalId)).paginate(options);
    return { ...page, records: page.page.map((row) => state.stage === 3 && row.userId ? null : { kind: 'legacyStudioMemberships', id: row._id, value: { membershipId: row._id, studioId: row.studioId ?? null, studioExternalId: row.studioExternalId, role: row.role, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt } }) };
  }
  if (state.stage === 4 || state.stage === 5) {
    const page = await ctx.db.query('projectMembers').withIndex('by_user', (q) => q.eq('userId', user._id)).paginate(options);
    const records: Array<ExportRecord | null> = [];
    for (const row of page.page) {
      const access = row.status === 'ACTIVE' ? await authorizedProject(ctx, row.projectId) : null;
      records.push(state.stage === 5 ? access ? projectRecord(access) : null : { kind: 'projectMemberships', id: row._id, value: { membershipId: row._id, ...(access ? { projectId: row.projectId } : {}), role: row.role, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt } });
    }
    return { ...page, records };
  }
  const page = state.stage === 6 ? await ctx.db.query('projects').withIndex('by_owner_user', (q) => q.eq('ownerUserId', user._id)).paginate(options) : state.stage === 7 ? await ctx.db.query('projects').withIndex('by_created_by_user', (q) => q.eq('createdByUserId', user._id)).paginate(options) : await ctx.db.query('projects').withIndex('by_created_by_external', (q) => q.eq('createdByExternalId', identity.externalId)).paginate(options);
  const records: Array<ExportRecord | null> = [];
  for (const project of page.page) {
    const membership = await ctx.db.query('projectMembers').withIndex('by_project_user', (q) => q.eq('projectId', project._id).eq('userId', user._id)).unique();
    if (membership || (state.stage >= 7 && project.ownerUserId === user._id) || (state.stage === 8 && project.createdByUserId === user._id)) { records.push(null); continue; }
    const access = await authorizedProject(ctx, project._id); records.push(access ? projectRecord(access) : null);
  }
  return { ...page, records };
}
async function buildPart(ctx: ReadCtx, actor: Actor, cursor: string) {
  const state = JSON.parse(cursor) as IndexCursor;
  if (state.version !== 1 || !Number.isSafeInteger(state.stage) || state.stage < 0 || state.stage >= STAGES || (state.native !== null && typeof state.native !== 'string')) throw new Error('Invalid account-index continuation.');
  const page = await sourcePage(ctx, actor, state);
  const payload = await exportPayload(page.records, state);
  const next = payload.consumed ? { ...initialCursor(), stage: page.isDone ? state.stage + 1 : state.stage, native: page.isDone ? null : page.continueCursor } : { version: 1 as const, stage: state.stage, native: state.native, ...payload.progress };
  return { ...payload, nextCursor: encode(next), isDone: next.stage === STAGES, sha256: await sha256(new TextEncoder().encode(payload.body)) };
}
async function ownExport(ctx: ReadCtx, requestId: Id<'accountExportRequests'>, userId: Id<'users'>) {
  const request = await ctx.db.get(requestId);
  if (!request || request.userId !== userId) throw new Error('This account-index request is unavailable.');
  return request;
}
export const startExport = mutation({
  args: { requestId: v.string() }, returns: exportSummaryValidator, handler: async (ctx, args) => {
    const { user } = await requireUser(ctx); const idempotencyKey = `account-index:${user._id}:${operationKey(args.requestId)}`;
    const previous = await ctx.db.query('accountExportRequests').withIndex('by_idempotency', (q) => q.eq('idempotencyKey', idempotencyKey)).unique();
    if (previous) return summary(previous, Date.now());
    const latest = await ctx.db.query('accountExportRequests').withIndex('by_user', (q) => q.eq('userId', user._id)).order('desc').first();
    if (latest?.status === 'OPEN' && latest.expiresAt > Date.now()) return summary(latest, Date.now());
    const timestamp = Date.now();
    const requestId = await ctx.db.insert('accountExportRequests', { userId: user._id, formatVersion: 1, status: 'OPEN', idempotencyKey, createdAt: timestamp, updatedAt: timestamp, expiresAt: timestamp + EXPORT_TTL, nextOrdinal: 0, cursor: encode(initialCursor()), recordCount: 0 });
    await log(ctx, user._id, 'ACCOUNT_INDEX_STARTED', requestId);
    return summary((await ctx.db.get(requestId))!, timestamp);
  },
});
export const exportStatus = query({
  args: { requestId: v.id('accountExportRequests'), now: v.number() }, returns: exportSummaryValidator, handler: async (ctx, args) => {
    const { user } = await requireUser(ctx); if (!Number.isFinite(args.now)) throw new Error('A finite display timestamp is required.');
    return summary(await ownExport(ctx, args.requestId, user._id), args.now);
  },
});
export const exportPart = mutation({
  args: { requestId: v.id('accountExportRequests'), ordinal: v.number() }, returns: v.object({ requestId: v.id('accountExportRequests'), ordinal: v.number(), filename: v.string(), content: v.string(), isDone: v.boolean(), nextOrdinal: v.number(), recordCount: v.number(), replayed: v.boolean() }), handler: async (ctx, args) => {
    const actor = await requireUser(ctx); const request = await ownExport(ctx, args.requestId, actor.user._id);
    if (request.status === 'CANCELED' || request.expiresAt <= Date.now()) throw new Error('This account-index request ended or expired. Start a new request.');
    if (!Number.isSafeInteger(args.ordinal) || args.ordinal < 0 || args.ordinal > request.nextOrdinal) throw new Error('Download the next available account-index part.');
    const existing = await ctx.db.query('accountExportPages').withIndex('by_request_ordinal', (q) => q.eq('requestId', request._id).eq('ordinal', args.ordinal)).unique();
    if (!existing && (request.status !== 'OPEN' || args.ordinal !== request.nextOrdinal)) throw new Error('This account-index part is unavailable.');
    const part = await buildPart(ctx, actor, existing?.cursor ?? request.cursor);
    if (existing && (existing.userId !== actor.user._id || existing.sha256 !== part.sha256 || existing.nextCursor !== part.nextCursor || existing.recordCount !== part.recordCount)) throw new Error('Account-index content or access changed. Cancel this request and start a new one.');
    if (!existing) {
      await ctx.db.insert('accountExportPages', { requestId: request._id, userId: actor.user._id, ordinal: args.ordinal, cursor: request.cursor, nextCursor: part.nextCursor, isDone: part.isDone, recordCount: part.recordCount, byteCount: part.byteCount, sha256: part.sha256, createdAt: Date.now() });
      await ctx.db.patch(request._id, { status: part.isDone ? 'COMPLETED' : 'OPEN', nextOrdinal: args.ordinal + 1, cursor: part.nextCursor, recordCount: request.recordCount + part.recordCount, updatedAt: Date.now() });
      if (part.isDone) await log(ctx, actor.user._id, 'ACCOUNT_INDEX_COMPLETED', request._id, { pageCount: args.ordinal + 1, recordCount: request.recordCount + part.recordCount });
    }
    const header = { type: 'part_manifest', formatVersion: ACCOUNT_INDEX_VERSION, title: ACCOUNT_INDEX_SCOPE.title, requestId: request._id, ordinal: args.ordinal, payloadSha256: part.sha256, payloadBytes: part.byteCount, recordCount: part.recordCount, isLastPart: part.isDone };
    return { requestId: request._id, ordinal: args.ordinal, filename: `account-index-${request._id}-${args.ordinal}.jsonl`, content: JSON.stringify(header) + '\n' + part.body, isDone: part.isDone, nextOrdinal: existing ? request.nextOrdinal : args.ordinal + 1, recordCount: existing ? request.recordCount : request.recordCount + part.recordCount, replayed: Boolean(existing) };
  },
});
// Read-only mutation: the server clock enforces expiry on every download,
// without a cached query result outliving the download window.
export const exportManifest = mutation({
  args: { requestId: v.id('accountExportRequests') }, returns: v.object({ title: v.string(), formatVersion: v.literal(1), requestId: v.id('accountExportRequests'), generatedAt: v.number(), expiresAt: v.number(), pageCount: v.number(), recordCount: v.number(), filenamePattern: v.string(), ordinals: v.string(), included: v.array(v.string()), excluded: v.array(v.string()), integrity: v.string(), fragments: v.string(), consistency: v.string() }), handler: async (ctx, args) => {
    const request = await ownExport(ctx, args.requestId, (await requireUser(ctx)).user._id);
    if (request.status !== 'COMPLETED' || request.expiresAt <= Date.now()) throw new Error('Finish the unexpired account-index request before downloading its manifest.');
    return { title: ACCOUNT_INDEX_SCOPE.title, formatVersion: ACCOUNT_INDEX_VERSION, requestId: request._id, generatedAt: request.updatedAt, expiresAt: request.expiresAt, pageCount: request.nextOrdinal, recordCount: request.recordCount, filenamePattern: `account-index-${request._id}-{ordinal}.jsonl`, ordinals: 'Zero-based, contiguous through pageCount - 1.', included: [...ACCOUNT_INDEX_SCOPE.included], excluded: [...ACCOUNT_INDEX_SCOPE.excluded], integrity: 'Each part manifest hashes the UTF-8 JSONL payload after its first line using SHA-256.', fragments: 'For each record_fragment, base64-decode data, concatenate bytes in offset order, verify totalBytes and SHA-256, then decode UTF-8 JSON. Do not decode fragments individually.', consistency: 'A live authorized index, not an immutable archive. Each part is authorized when downloaded; replay refuses changed content. Previously downloaded files remain on your device.' };
  },
});
export const cancelExport = mutation({
  args: { requestId: v.id('accountExportRequests') }, returns: v.null(), handler: async (ctx, args) => {
    const { user } = await requireUser(ctx); const request = await ownExport(ctx, args.requestId, user._id);
    if (request.status !== 'CANCELED') { await ctx.db.patch(request._id, { status: 'CANCELED', updatedAt: Date.now() }); await log(ctx, user._id, 'ACCOUNT_INDEX_CANCELED', request._id); }
    return null;
  },
});

async function preflight(ctx: ReadCtx, actor: Actor): Promise<DeactivationPreflight> {
  const { user, identity } = actor;
  const deny = (code: DeactivationPreflight['blockers'][number]['code'], message: string): DeactivationPreflight => ({ allowed: false, blockers: [{ code, message }] });
  const limit = () => deny('SCAN_LIMIT', 'This account needs a staff-assisted ownership review because the bounded safety scan is incomplete. No deactivation was performed.');
  const grant = await ctx.db.query('platformRoles').withIndex('by_user', (q) => q.eq('userId', user._id)).unique();
  if (grant?.role === 'ADMIN' && grant.status === 'ACTIVE') {
    const admins = await ctx.db.query('platformRoles').withIndex('by_role_status', (q) => q.eq('role', 'ADMIN').eq('status', 'ACTIVE')).take(101);
    let another = false;
    for (const admin of admins) if (admin.userId !== user._id) { const account = await ctx.db.get(admin.userId); if (account && account.status !== 'disabled') { another = true; break; } }
    if (!another) return admins.length > 100 ? limit() : deny('LAST_PLATFORM_ADMIN', 'Another enabled platform ADMIN must be appointed before this account can deactivate.');
  }
  const studios = new Map<string, Doc<'studios'>>();
  for (const rows of [await ctx.db.query('studios').withIndex('by_owner_user', (q) => q.eq('ownerUserId', user._id)).take(26), await ctx.db.query('studios').withIndex('by_owner_id', (q) => q.eq('ownerId', user._id)).take(26), await ctx.db.query('studios').withIndex('by_owner', (q) => q.eq('ownerExternalId', identity.externalId)).take(26)]) {
    if (rows.length > 25) return limit();
    for (const studio of rows) { const primary = studio.ownerUserId ?? studio.ownerId; if (primary ? primary === user._id : studio.ownerExternalId === identity.externalId) studios.set(studio._id, studio); }
  }
  let scanned = studios.size;
  for (const studio of studios.values()) {
    const members = await ctx.db.query('members').withIndex('by_studio', (q) => q.eq('studioId', studio._id)).take(51);
    const legacy = await ctx.db.query('studioMembers').withIndex('by_studio', (q) => q.eq('studioExternalId', studio.externalId)).take(51);
    scanned += members.length + legacy.length; if (members.length > 50 || legacy.length > 50 || scanned > 500) return limit();
    for (const member of members) if (member.userId !== user._id && member.status === 'active') { const peer = await ctx.db.get(member.userId); if (peer && peer.status !== 'disabled') return deny('SHARED_STUDIO_OWNER', `Transfer primary ownership of shared studio “${studio.name}” before requesting deactivation. Studio handoff needs a separate authorized workflow.`); }
    for (const member of legacy) if (member.status === 'active' && member.userId !== user._id && member.userExternalId !== identity.externalId) {
      const peer = member.userId ? await ctx.db.get(member.userId) : await ctx.db.query('users').withIndex('by_external_id', (q) => q.eq('externalId', member.userExternalId)).unique();
      if (!peer || peer.status !== 'disabled') return deny('SHARED_STUDIO_OWNER', `Transfer primary ownership of shared studio “${studio.name}” before requesting deactivation. Studio handoff needs a separate authorized workflow.`);
    }
  }
  const memberships = await ctx.db.query('projectMembers').withIndex('by_user', (q) => q.eq('userId', user._id)).take(101);
  if (memberships.length > 100) return limit();
  const projectIds = new Set<Id<'projects'>>(memberships.filter((row) => row.status === 'ACTIVE' && row.role === 'OWNER').map((row) => row.projectId));
  for (const rows of [await ctx.db.query('projects').withIndex('by_owner_user', (q) => q.eq('ownerUserId', user._id)).take(101), await ctx.db.query('projects').withIndex('by_created_by_user', (q) => q.eq('createdByUserId', user._id)).take(101), await ctx.db.query('projects').withIndex('by_created_by_external', (q) => q.eq('createdByExternalId', identity.externalId)).take(101)]) { if (rows.length > 100) return limit(); for (const project of rows) projectIds.add(project._id); }
  scanned += memberships.length + projectIds.size; if (scanned > 500) return limit();
  for (const projectId of projectIds) {
    const access = await authorizedProject(ctx, projectId); if (!access || access.projectRole !== 'OWNER') continue;
    const peers = await ctx.db.query('projectMembers').withIndex('by_project_status', (q) => q.eq('projectId', projectId).eq('status', 'ACTIVE')).take(51);
    scanned += peers.length; if (peers.length > 50 || scanned > 500) return limit();
    let shared = false; let enabledOwner = false;
    for (const member of peers) {
      if (member.userId === user._id) continue;
      const peer = await ctx.db.get(member.userId); if (!peer || peer.status === 'disabled') continue;
      shared = true;
      if (member.role === 'OWNER') {
        const canonical = await ctx.db.query('members').withIndex('by_studio_user', (q) => q.eq('studioId', access.studio._id).eq('userId', peer._id)).unique();
        if (canonical?.status === 'active' || (access.studio.ownerUserId ?? access.studio.ownerId) === peer._id) enabledOwner = true;
      }
    }
    if (shared && !enabledOwner) return deny('SHARED_PROJECT_OWNER', `Shared project “${access.project.name}” needs another enabled OWNER with active studio access before this account can deactivate.`);
  }
  return { allowed: true, blockers: [] };
}
export const deactivationPreflight = query({ args: {}, returns: preflightValidator, handler: async (ctx) => preflight(ctx, await requireUser(ctx)) });
export const requestDeactivation = mutation({
  args: { requestId: v.string(), reason: v.string(), confirmation: v.string() }, returns: v.object({ requestId: v.id('accountDeactivationRequests'), replayed: v.boolean() }), handler: async (ctx, args) => {
    const actor = await getUser(ctx); if (!actor) throw new ConvexAuthError('USER_NOT_FOUND', 'A provisioned verified account is required.');
    const idempotencyKey = `account-deactivation:${actor.user._id}:${operationKey(args.requestId)}`; const reason = note(args.reason);
    if (args.confirmation !== 'DEACTIVATE') throw new Error('Type DEACTIVATE to confirm the retained-data request.');
    const existing = await ctx.db.query('accountDeactivationRequests').withIndex('by_idempotency', (q) => q.eq('idempotencyKey', idempotencyKey)).unique();
    if (existing) {
      if (existing.userId !== actor.user._id || existing.reason !== reason || existing.status !== 'REQUESTED' || actor.user.deactivationRequestId !== existing._id || actor.user.status !== 'disabled') throw new Error('This request ID already belongs to another account lifecycle change.');
      return { requestId: existing._id, replayed: true };
    }
    await requireUser(ctx); if (actor.user.deactivationRequestId) throw new Error('Resolve the existing account request before creating another.');
    const safety = await preflight(ctx, actor); if (!safety.allowed) throw new Error(safety.blockers[0].message);
    const timestamp = Date.now(); const requestId = await ctx.db.insert('accountDeactivationRequests', { userId: actor.user._id, status: 'REQUESTED', reason, idempotencyKey, createdAt: timestamp, updatedAt: timestamp });
    await ctx.db.patch(actor.user._id, { status: 'disabled', deactivationRequestId: requestId, updatedAt: timestamp });
    await log(ctx, actor.user._id, 'ACCOUNT_DEACTIVATION_REQUESTED', requestId, { retainedData: true });
    return { requestId, replayed: false };
  },
});
export const deactivationRequests = query({
  args: { cursor: v.optional(v.string()) }, returns: v.object({ requests: v.array(v.object({ requestId: v.id('accountDeactivationRequests'), userId: v.id('users'), displayName: v.string(), email: v.string(), reason: v.string(), status: v.union(v.literal('REQUESTED'), v.literal('CANCELED')), createdAt: v.number() })), isDone: v.boolean(), continueCursor: v.union(v.string(), v.null()) }), handler: async (ctx, args) => {
    await requirePlatformRole(ctx, ['ADMIN']);
    if (args.cursor && args.cursor.length > 20000) throw new Error('Invalid account-request continuation.');
    const page = await ctx.db.query('accountDeactivationRequests').withIndex('by_status', (q) => q.eq('status', 'REQUESTED')).order('desc').paginate({ cursor: args.cursor ?? null, numItems: 25 });
    const requests = [];
    for (const request of page.page) { const user = await ctx.db.get(request.userId); requests.push({ requestId: request._id, userId: request.userId, displayName: user?.displayName ?? user?.name ?? 'Unavailable account', email: user?.email ?? '', reason: request.reason, status: request.status, createdAt: request.createdAt }); }
    return { requests, isDone: page.isDone, continueCursor: page.isDone ? null : page.continueCursor };
  },
});
export const recoverAccount = mutation({
  args: { requestId: v.id('accountDeactivationRequests'), reason: v.string() }, returns: v.object({ requestId: v.id('accountDeactivationRequests'), replayed: v.boolean() }), handler: async (ctx, args) => {
    const actor = await requirePlatformRole(ctx, ['ADMIN']); const reason = note(args.reason); const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error('This account request is unavailable.');
    if (request.status === 'CANCELED') { if (request.canceledByUserId !== actor.user._id || request.cancellationReason !== reason) throw new Error('This request was already resolved by a different recovery decision.'); return { requestId: request._id, replayed: true }; }
    const user = await ctx.db.get(request.userId);
    if (!user || user.deactivationRequestId !== request._id || user.status !== 'disabled') throw new Error('The account state no longer matches this recovery request.');
    const timestamp = Date.now();
    await ctx.db.patch(user._id, { status: 'active', deactivationRequestId: undefined, updatedAt: timestamp });
    await ctx.db.patch(request._id, { status: 'CANCELED', canceledAt: timestamp, canceledByUserId: actor.user._id, cancellationReason: reason, updatedAt: timestamp });
    await log(ctx, actor.user._id, 'ACCOUNT_DEACTIVATION_RECOVERED', request._id, { targetUserId: user._id, reason, retainedData: true }, true);
    return { requestId: request._id, replayed: false };
  },
});
