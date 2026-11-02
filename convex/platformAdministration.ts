import { v } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireProjectAccess, requireUser } from './authorization';
import { ConvexAuthorizationError } from './auth';
import { PLATFORM_READ_ROLES, type PlatformInventoryPage, type PlatformRole } from '../src/lib/platform-admin/contracts';

const roleValidator = v.union(v.literal('ADMIN'), v.literal('SUPPORT'), v.literal('MODERATOR'));
const kindValidator = v.union(v.literal('users'), v.literal('jobs'), v.literal('reports'), v.literal('roles'), v.literal('credits'), v.literal('audit'), v.literal('routing'));
const categoryValidator = v.union(v.literal('CONSENT'), v.literal('RIGHTS'), v.literal('HARMFUL_CONTENT'), v.literal('OTHER'));
type ReadCtx = QueryCtx | MutationCtx;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function reason(value: string, maximum = 1000) {
  const text = value.trim();
  if (text.length < 3 || text.length > maximum) throw new Error(`A reason between 3 and ${maximum} characters is required.`);
  return text;
}
function requestKey(value: string) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new Error('A valid operation request is required.');
  return value;
}

export async function requirePlatformRole(ctx: ReadCtx, allowed: readonly PlatformRole[] = ['ADMIN', 'SUPPORT', 'MODERATOR']) {
  const user = await requireUser(ctx);
  const grant = await ctx.db.query('platformRoles').withIndex('by_user', (q) => q.eq('userId', user.user._id)).unique();
  if (!grant || grant.status !== 'ACTIVE' || !allowed.includes(grant.role)) throw new ConvexAuthorizationError('ADMIN_REQUIRED', 'Explicit platform access is required.');
  return { ...user, grant, role: grant.role };
}

export const currentRole = query({
  args: {}, returns: v.union(v.null(), v.object({ userId: v.id('users'), role: roleValidator })),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const grant = await ctx.db.query('platformRoles').withIndex('by_user', (q) => q.eq('userId', user.user._id)).unique();
    return grant?.status === 'ACTIVE' ? { userId: user.user._id, role: grant.role } : null;
  },
});

async function audit(ctx: MutationCtx, userId: Id<'users'>, action: string, entityType: string, entityId: string, details: Record<string, unknown>, correlationId: string) {
  return ctx.db.insert('audit', { actorUserId: userId, action, entityType, entityId, correlationId, metadata: { scope: 'PLATFORM', ...details }, createdAt: Date.now() });
}

async function replay(ctx: MutationCtx, actor: Id<'users'>, action: string, target: string, key: string, fingerprint: unknown) {
  const correlationId = `platform:${action}:${actor}:${requestKey(key)}`;
  const existing = await ctx.db.query('audit').withIndex('by_correlation', (q) => q.eq('correlationId', correlationId)).unique();
  if (existing && (existing.actorUserId !== actor || existing.action !== action || existing.entityId !== target || record(existing.metadata).scope !== 'PLATFORM' || record(existing.metadata).request !== JSON.stringify(fingerprint))) throw new Error('This operation request already belongs to another change.');
  return { existing, correlationId };
}

async function protectLastAdministrator(ctx: MutationCtx, targetUserId: Id<'users'>) {
  const grants = await ctx.db.query('platformRoles').withIndex('by_role_status', (q) => q.eq('role', 'ADMIN').eq('status', 'ACTIVE')).take(101);
  for (const grant of grants) {
    if (grant.userId === targetUserId) continue;
    const user = await ctx.db.get(grant.userId);
    if (user && user.status !== 'disabled') return;
  }
  throw new Error('At least one enabled platform administrator must remain.');
}

/** No public bootstrap. The coordinator must configure the exact stable user
 * ID after owner confirmation; environment flags alone grant no query access. */
export const bootstrapAdministrator = internalMutation({
  args: { userId: v.id('users') }, returns: v.object({ roleId: v.id('platformRoles'), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    if (process.env.FINALFRAME_PLATFORM_BOOTSTRAP_ENABLED !== 'true' || process.env.FINALFRAME_PLATFORM_BOOTSTRAP_USER_ID !== args.userId) throw new Error('Platform administrator bootstrap is disabled.');
    const user = await ctx.db.get(args.userId);
    if (!user || user.status === 'disabled') throw new Error('The configured administrator account is unavailable.');
    const existing = await ctx.db.query('platformRoles').withIndex('by_user', (q) => q.eq('userId', args.userId)).unique();
    if (existing) {
      if (existing.status !== 'ACTIVE' || existing.role !== 'ADMIN') throw new Error('Bootstrap cannot replace or reactivate a platform role.');
      return { roleId: existing._id, replayed: true };
    }
    const administrators = await ctx.db.query('platformRoles').withIndex('by_role_status', (q) => q.eq('role', 'ADMIN').eq('status', 'ACTIVE')).take(1);
    if (administrators.length) throw new Error('Use an existing platform administrator to manage further grants.');
    const timestamp = Date.now();
    const roleId = await ctx.db.insert('platformRoles', { userId: args.userId, role: 'ADMIN', status: 'ACTIVE', createdAt: timestamp, updatedAt: timestamp });
    await audit(ctx, args.userId, 'PLATFORM_ADMIN_BOOTSTRAPPED', 'platformRole', roleId, { policy: 'exact-configured-user-id', targetUserId: args.userId }, `platform:bootstrap:${args.userId}`);
    return { roleId, replayed: false };
  },
});

export const setRole = mutation({
  args: { userId: v.id('users'), role: roleValidator, status: v.union(v.literal('ACTIVE'), v.literal('REVOKED')), reason: v.string(), requestId: v.string() },
  returns: v.object({ roleId: v.id('platformRoles'), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requirePlatformRole(ctx, ['ADMIN']);
    const note = reason(args.reason);
    const user = await ctx.db.get(args.userId);
    if (!user || (args.status === 'ACTIVE' && user.status === 'disabled')) throw new Error('The selected account is unavailable.');
    const event = await replay(ctx, actor.user._id, 'PLATFORM_ROLE_CHANGED', args.userId, args.requestId, { role: args.role, status: args.status, reason: note });
    const existing = await ctx.db.query('platformRoles').withIndex('by_user', (q) => q.eq('userId', args.userId)).unique();
    if (event.existing) {
      if (!existing) throw new Error('The original platform role is unavailable.');
      return { roleId: existing._id, replayed: true };
    }
    if (existing?.role === 'ADMIN' && existing.status === 'ACTIVE' && (args.role !== 'ADMIN' || args.status !== 'ACTIVE')) await protectLastAdministrator(ctx, args.userId);
    const timestamp = Date.now();
    const fields = { role: args.role, status: args.status, updatedAt: timestamp, ...(args.status === 'ACTIVE' ? { grantedByUserId: actor.user._id } : { revokedByUserId: actor.user._id }) };
    const roleId = existing?._id ?? await ctx.db.insert('platformRoles', { userId: args.userId, ...fields, createdAt: timestamp });
    if (existing) await ctx.db.patch(roleId, fields);
    await audit(ctx, actor.user._id, 'PLATFORM_ROLE_CHANGED', 'user', args.userId, { reason: note, request: JSON.stringify({ role: args.role, status: args.status, reason: note }), role: args.role, status: args.status }, event.correlationId);
    return { roleId, replayed: false };
  },
});

export const setUserStatus = mutation({
  args: { userId: v.id('users'), status: v.union(v.literal('active'), v.literal('disabled')), reason: v.string(), requestId: v.string() },
  returns: v.object({ userId: v.id('users'), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requirePlatformRole(ctx, ['ADMIN']);
    const note = reason(args.reason);
    const event = await replay(ctx, actor.user._id, 'PLATFORM_USER_STATUS_CHANGED', args.userId, args.requestId, { status: args.status, reason: note });
    if (event.existing) return { userId: args.userId, replayed: true };
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error('The selected account is unavailable.');
    if (args.status === 'disabled') {
      if (args.userId === actor.user._id) throw new Error('Another administrator must review disabling your account.');
      const grant = await ctx.db.query('platformRoles').withIndex('by_user', (q) => q.eq('userId', args.userId)).unique();
      if (grant?.role === 'ADMIN' && grant.status === 'ACTIVE') await protectLastAdministrator(ctx, args.userId);
    }
    await ctx.db.patch(args.userId, { status: args.status, updatedAt: Date.now() });
    await audit(ctx, actor.user._id, 'PLATFORM_USER_STATUS_CHANGED', 'user', args.userId, { reason: note, status: args.status, request: JSON.stringify({ status: args.status, reason: note }) }, event.correlationId);
    return { userId: args.userId, replayed: false };
  },
});

export const createReport = mutation({
  args: { projectId: v.id('projects'), assetId: v.optional(v.id('assets')), exportId: v.optional(v.id('exports')), category: categoryValidator, reason: v.string(), requestId: v.string() },
  returns: v.object({ reportId: v.id('moderationReports'), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const member = await requireProjectAccess(ctx, args.projectId, undefined, { allowRestrictedRead: true });
    const note = reason(args.reason, 2000);
    if (args.assetId && args.exportId) throw new Error('Report one specific piece of content at a time.');
    if (args.assetId) { const asset = await ctx.db.get(args.assetId); if (!asset || asset.projectId !== args.projectId) throw new Error('The reported media belongs to another project.'); }
    if (args.exportId) { const output = await ctx.db.get(args.exportId); if (!output || output.projectId !== args.projectId) throw new Error('The reported export belongs to another project.'); }
    const idempotencyKey = `moderation:${member.user._id}:${requestKey(args.requestId)}`;
    const existing = await ctx.db.query('moderationReports').withIndex('by_idempotency', (q) => q.eq('idempotencyKey', idempotencyKey)).unique();
    if (existing) {
      if (existing.reporterUserId !== member.user._id || existing.projectId !== args.projectId || existing.assetId !== args.assetId || existing.exportId !== args.exportId || existing.category !== args.category || existing.reason !== note) throw new Error('This report request already belongs to another report.');
      return { reportId: existing._id, replayed: true };
    }
    const timestamp = Date.now();
    const reportId = await ctx.db.insert('moderationReports', { projectId: args.projectId, ...(args.assetId ? { assetId: args.assetId } : {}), ...(args.exportId ? { exportId: args.exportId } : {}), reporterUserId: member.user._id, category: args.category, reason: note, status: 'OPEN', idempotencyKey, createdAt: timestamp, updatedAt: timestamp });
    await audit(ctx, member.user._id, 'MODERATION_REPORT_CREATED', 'moderationReport', reportId, { projectId: args.projectId, category: args.category }, idempotencyKey);
    return { reportId, replayed: false };
  },
});

export const decideReport = mutation({
  args: { reportId: v.id('moderationReports'), decision: v.union(v.literal('DISMISSED'), v.literal('QUARANTINED')), reason: v.string(), requestId: v.string() },
  returns: v.object({ reportId: v.id('moderationReports'), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requirePlatformRole(ctx, ['ADMIN', 'MODERATOR']);
    const note = reason(args.reason, 2000);
    const event = await replay(ctx, actor.user._id, 'MODERATION_REPORT_DECIDED', args.reportId, args.requestId, { decision: args.decision, reason: note });
    if (event.existing) return { reportId: args.reportId, replayed: true };
    const report = await ctx.db.get(args.reportId);
    if (!report || report.status !== 'OPEN') throw new Error('This report has already been decided or is unavailable.');
    const project = await ctx.db.get(report.projectId);
    if (!project) throw new Error('The reported project is unavailable.');
    const timestamp = Date.now();
    if (args.decision === 'QUARANTINED') await ctx.db.patch(project._id, { moderationStatus: 'RESTRICTED', moderationReportId: report._id, updatedAt: timestamp });
    await ctx.db.patch(report._id, { status: args.decision === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED', decision: args.decision, decisionReason: note, decidedByUserId: actor.user._id, decidedAt: timestamp, updatedAt: timestamp });
    await audit(ctx, actor.user._id, 'MODERATION_REPORT_DECIDED', 'moderationReport', report._id, { projectId: report.projectId, reason: note, decision: args.decision, request: JSON.stringify({ decision: args.decision, reason: note }) }, event.correlationId);
    return { reportId: report._id, replayed: false };
  },
});

export const clearRestriction = mutation({
  args: { projectId: v.id('projects'), reason: v.string(), requestId: v.string() }, returns: v.object({ projectId: v.id('projects'), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requirePlatformRole(ctx, ['ADMIN']);
    const note = reason(args.reason, 2000);
    const event = await replay(ctx, actor.user._id, 'MODERATION_RESTRICTION_CLEARED', args.projectId, args.requestId, { reason: note });
    if (event.existing) return { projectId: args.projectId, replayed: true };
    const project = await ctx.db.get(args.projectId);
    if (!project || project.moderationStatus !== 'RESTRICTED') throw new Error('This project is not restricted.');
    await ctx.db.patch(project._id, { moderationStatus: 'CLEAR', updatedAt: Date.now() });
    await audit(ctx, actor.user._id, 'MODERATION_RESTRICTION_CLEARED', 'project', project._id, { reason: note, reportId: project.moderationReportId, request: JSON.stringify({ reason: note }) }, event.correlationId);
    return { projectId: project._id, replayed: false };
  },
});

export const quarantineModel = mutation({
  args: { modelId: v.id('videoModelCatalog'), reason: v.string(), requestId: v.string() }, returns: v.object({ modelId: v.id('videoModelCatalog'), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requirePlatformRole(ctx, ['ADMIN']);
    const note = reason(args.reason);
    const event = await replay(ctx, actor.user._id, 'PLATFORM_MODEL_QUARANTINED', args.modelId, args.requestId, { reason: note });
    if (event.existing) return { modelId: args.modelId, replayed: true };
    const model = await ctx.db.get(args.modelId);
    if (!model) throw new Error('The selected model record is unavailable.');
    await ctx.db.patch(model._id, { available: false, platformQuarantinedAt: Date.now(), platformQuarantinedByUserId: actor.user._id, platformQuarantineReason: note, reviewedAt: undefined, reviewedCatalogFingerprint: undefined, reviewedOperations: [] });
    await audit(ctx, actor.user._id, 'PLATFORM_MODEL_QUARANTINED', 'videoModelCatalog', model._id, { reason: note, studioExternalId: model.studioExternalId, modelId: model.modelId, request: JSON.stringify({ reason: note }) }, event.correlationId);
    return { modelId: model._id, replayed: false };
  },
});

export const clearModelQuarantine = mutation({
  args: { modelId: v.id('videoModelCatalog'), reason: v.string(), requestId: v.string() }, returns: v.object({ modelId: v.id('videoModelCatalog'), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requirePlatformRole(ctx, ['ADMIN']);
    const note = reason(args.reason);
    const event = await replay(ctx, actor.user._id, 'PLATFORM_MODEL_QUARANTINE_CLEARED', args.modelId, args.requestId, { reason: note });
    if (event.existing) return { modelId: args.modelId, replayed: true };
    const model = await ctx.db.get(args.modelId);
    if (!model || model.platformQuarantinedAt === undefined) throw new Error('This model record is not platform-quarantined.');
    // Clearing a platform restriction never certifies endpoint capabilities.
    await ctx.db.patch(model._id, { platformQuarantinedAt: undefined, platformQuarantinedByUserId: undefined, platformQuarantineReason: undefined, available: false, reviewedAt: undefined, reviewedCatalogFingerprint: undefined, reviewedOperations: [] });
    await audit(ctx, actor.user._id, 'PLATFORM_MODEL_QUARANTINE_CLEARED', 'videoModelCatalog', model._id, { reason: note, studioExternalId: model.studioExternalId, modelId: model.modelId, request: JSON.stringify({ reason: note }) }, event.correlationId);
    return { modelId: model._id, replayed: false };
  },
});

export const inventory = query({
  args: { kind: kindValidator, cursor: v.optional(v.string()), limit: v.optional(v.number()), reportStatus: v.optional(v.union(v.literal('OPEN'), v.literal('RESOLVED'), v.literal('DISMISSED'))) },
  returns: v.object({ rows: v.array(v.object({ id: v.string(), title: v.string(), subtitle: v.string(), status: v.string(), createdAt: v.number(), details: v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null())) })), continueCursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, args): Promise<PlatformInventoryPage> => {
    const actor = await requirePlatformRole(ctx, PLATFORM_READ_ROLES[args.kind]);
    const limit = args.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Choose a page size between 1 and 50.');
    let cursor: string | null = null;
    const context = { kind: args.kind, userId: actor.user._id, reportStatus: args.reportStatus ?? null };
    if (args.cursor) {
      if (args.cursor.length > 20000) throw new Error('Invalid inventory cursor.');
      let parsed: { context?: unknown; cursor?: unknown };
      try { parsed = JSON.parse(args.cursor); } catch { throw new Error('Invalid inventory cursor.'); }
      if (!parsed || JSON.stringify(parsed.context) !== JSON.stringify(context) || (parsed.cursor !== null && typeof parsed.cursor !== 'string')) throw new Error('Start this inventory from the first page.');
      cursor = parsed.cursor as string | null;
    }
    const options = { cursor, numItems: limit, maximumRowsRead: 50 };
    let rows: PlatformInventoryPage['rows']; let isDone: boolean; let nativeCursor: string;
    if (args.kind === 'users') {
      const page = await ctx.db.query('users').order('desc').paginate(options); isDone = page.isDone; nativeCursor = page.continueCursor;
      rows = page.page.map((user) => ({ id: user._id, title: user.name || 'Unnamed account', subtitle: user.email || 'No email', status: user.status === 'disabled' ? 'disabled' : 'active', createdAt: user.createdAt ?? user._creationTime, details: {} }));
    } else if (args.kind === 'jobs') {
      const page = await ctx.db.query('generationJobs').order('desc').paginate(options); isDone = page.isDone; nativeCursor = page.continueCursor;
      rows = page.page.map((job) => ({ id: job._id, title: `${job.provider} · ${job.model}`, subtitle: job.studioExternalId, status: job.status, createdAt: job.createdAt, details: { progress: job.progress, attemptCount: job.attemptCount, estimatedProviderCostUsd: job.estimatedProviderCostUsd ?? null, providerCostUsd: job.providerCostUsd ?? null, errorCode: job.errorCode ?? null } }));
    } else if (args.kind === 'credits') {
      const page = await ctx.db.query('ledger').order('desc').paginate(options); isDone = page.isDone; nativeCursor = page.continueCursor;
      rows = page.page.map((entry) => ({ id: entry._id, title: entry.entryType, subtitle: entry.studioExternalId, status: entry.sourceType, createdAt: entry.createdAt, details: { amount: entry.amount, currency: entry.currency ?? null } }));
    } else if (args.kind === 'routing') {
      const page = await ctx.db.query('videoModelCatalog').order('desc').paginate(options); isDone = page.isDone; nativeCursor = page.continueCursor;
      rows = page.page.map((model) => ({ id: model._id, title: model.modelId, subtitle: model.studioExternalId, status: model.platformQuarantinedAt !== undefined ? 'PLATFORM_QUARANTINED' : model.available ? 'AVAILABLE' : 'UNAVAILABLE', createdAt: model.lastSeenAt, details: { reviewedAt: model.reviewedAt ?? null, estimatedCostPerSecond: model.estimatedCostPerSecond ?? null, platformQuarantinedAt: model.platformQuarantinedAt ?? null, platformQuarantineReason: model.platformQuarantineReason ?? null } }));
    } else if (args.kind === 'roles') {
      const page = await ctx.db.query('platformRoles').order('desc').paginate(options); isDone = page.isDone; nativeCursor = page.continueCursor;
      rows = await Promise.all(page.page.map(async (grant) => { const user = await ctx.db.get(grant.userId); return { id: grant._id, title: user?.name || user?.email || String(grant.userId), subtitle: String(grant.userId), status: grant.status, createdAt: grant.createdAt, details: { role: grant.role, userId: grant.userId } }; }));
    } else if (args.kind === 'reports') {
      const page = args.reportStatus ? await ctx.db.query('moderationReports').withIndex('by_status', (q) => q.eq('status', args.reportStatus!)).order('desc').paginate(options) : await ctx.db.query('moderationReports').order('desc').paginate(options); isDone = page.isDone; nativeCursor = page.continueCursor;
      rows = await Promise.all(page.page.map(async (report) => { const project = await ctx.db.get(report.projectId); return { id: report._id, title: project?.name || 'Unavailable project', subtitle: report.category, status: report.status, createdAt: report.createdAt, details: { reason: report.reason, reporterUserId: report.reporterUserId, projectId: report.projectId, moderationStatus: project?.moderationStatus ?? 'CLEAR', decision: report.decision ?? null, decisionReason: report.decisionReason ?? null } }; }));
    } else {
      const page = await ctx.db.query('audit').withIndex('by_created_at').order('desc').paginate(options); isDone = page.isDone; nativeCursor = page.continueCursor;
      rows = page.page.filter((entry) => record(entry.metadata).scope === 'PLATFORM').map((entry) => ({ id: entry._id, title: entry.action, subtitle: `${entry.entityType} · ${entry.entityId}`, status: 'RECORDED', createdAt: entry.createdAt, details: { actorUserId: entry.actorUserId ?? null, reason: typeof record(entry.metadata).reason === 'string' ? record(entry.metadata).reason as string : null } }));
    }
    return { rows, isDone, continueCursor: isDone ? null : JSON.stringify({ context, cursor: nativeCursor }) };
  },
});

/** Metadata-only recovery surface: never returns assets, signed URLs, inputs
 * or other reporters' evidence for a restricted project. */
export const reportContext = query({
  args: { projectExternalId: v.string() }, returns: v.object({ projectId: v.id('projects'), name: v.string(), moderationStatus: v.union(v.literal('CLEAR'), v.literal('RESTRICTED')) }),
  handler: async (ctx, args) => {
    const project = await ctx.db.query('projects').withIndex('by_external_id', (q) => q.eq('externalId', args.projectExternalId)).unique();
    if (!project) throw new Error('The project is unavailable.');
    const access = await requireProjectAccess(ctx, project._id, undefined, { allowRestrictedRead: true });
    return { projectId: access.project._id, name: access.project.name, moderationStatus: access.project.moderationStatus ?? 'CLEAR' };
  },
});

export const myReports = query({
  args: { cursor: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.object({ reports: v.array(v.object({ reportId: v.id('moderationReports'), projectId: v.id('projects'), category: categoryValidator, reason: v.string(), status: v.union(v.literal('OPEN'), v.literal('RESOLVED'), v.literal('DISMISSED')), decisionReason: v.union(v.string(), v.null()), createdAt: v.number() })), continueCursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = args.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Choose a page size between 1 and 50.');
    const page = await ctx.db.query('moderationReports').withIndex('by_reporter', (q) => q.eq('reporterUserId', user.user._id)).order('desc').paginate({ cursor: args.cursor ?? null, numItems: limit, maximumRowsRead: 50 });
    return { reports: page.page.map((item) => ({ reportId: item._id, projectId: item.projectId, category: item.category, reason: item.reason, status: item.status, decisionReason: item.decisionReason ?? null, createdAt: item.createdAt })), isDone: page.isDone, continueCursor: page.isDone ? null : page.continueCursor };
  },
});
