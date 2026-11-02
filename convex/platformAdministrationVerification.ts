import { v } from 'convex/values';
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { createProjectForMember, softDeleteProject } from './projects';

const PREFIX = 'finalframe-platform-authorization-v1';
const ACTORS = ['owner', 'admin', 'support', 'moderator', 'outsider'] as const;
type Actor = (typeof ACTORS)[number];
type ReadCtx = QueryCtx | MutationCtx;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function fixtureMarker(fixtureKey: string, runId: string) {
  if (process.env.FINALFRAME_DEV_FIXTURES !== 'true' || process.env.FINALFRAME_DEV_FIXTURE_ENV !== 'development' || !process.env.FINALFRAME_DEV_FIXTURE_KEY || fixtureKey !== process.env.FINALFRAME_DEV_FIXTURE_KEY) throw new Error('Private development platform verification is disabled.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId)) throw new Error('Use a UUID for the isolated platform fixture run.');
  return `${PREFIX}:${runId}`;
}
function subject(marker: string, actor: Actor) { return `${marker}:${actor}`; }
async function fixtureUser(ctx: ReadCtx, marker: string, actor: Actor) {
  const user = await ctx.db.query('users').withIndex('by_external_id', (q) => q.eq('externalId', subject(marker, actor))).unique();
  if (user && (object(user.metadata).fixtureMarker !== marker || user.authSubject !== subject(marker, actor))) throw new Error('Refusing to use a non-fixture account.');
  return user;
}
async function fixtureProject(ctx: ReadCtx, marker: string, name: 'main' | 'foreign') {
  const project = await ctx.db.query('projects').withIndex('by_external_id', (q) => q.eq('externalId', `${marker}:project:${name}`)).unique();
  if (project && object(project.metadata).fixtureMarker !== marker) throw new Error('Refusing to change a non-fixture project.');
  return project;
}
/** Internal CLI calls cannot carry a simulated identity. Only the already-gated
 * fixture helpers use this exact marker owner to delegate canonical project
 * membership/role checks. This context is never exposed to public functions. */
function fixtureOwnerContext(ctx: MutationCtx, marker: string): MutationCtx {
  const issuer = 'https://finalframe-test.invalid';
  const ownerSubject = subject(marker, 'owner');
  return { ...ctx, auth: { getUserIdentity: async () => ({ issuer, subject: ownerSubject, tokenIdentifier: `${issuer}|${ownerSubject}` }) } };
}

/** Isolated seed, never a real bootstrap. These are new marker-only users
 * without auth accounts/passwords. Ordinary platform APIs remain unchanged. */
export const seed = internalMutation({
  args: { fixtureKey: v.string(), runId: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    const marker = fixtureMarker(args.fixtureKey, args.runId);
    for (const actor of ACTORS) if (await fixtureUser(ctx, marker, actor)) throw new Error('This fixture run already exists. Clean it up and use a new run ID.');
    const administrators = await ctx.db.query('platformRoles').withIndex('by_role_status', (q) => q.eq('role', 'ADMIN').eq('status', 'ACTIVE')).take(1);
    if (administrators.length) throw new Error('Run isolated last-administrator verification before the first real administrator grant; never revoke a real grant for this test.');
    const timestamp = Date.now();
    const users = {} as Record<Actor, Doc<'users'>>;
    for (const actor of ACTORS) {
      const id = await ctx.db.insert('users', { externalId: subject(marker, actor), authSubject: subject(marker, actor), name: `Development platform fixture ${actor}`, email: `${args.runId}-${actor}@finalframe.fixture.invalid`, status: 'active', metadata: { fixtureMarker: marker, fixtureActor: actor }, createdAt: timestamp, updatedAt: timestamp });
      users[actor] = (await ctx.db.get(id))!;
    }
    const studioExternalId = `${marker}:studio`;
    const studioId = await ctx.db.insert('studios', { externalId: studioExternalId, ownerExternalId: users.owner.externalId!, ownerId: users.owner._id, ownerUserId: users.owner._id, name: 'Development platform authorization fixture', credits: 0, status: 'active', metadata: { fixtureMarker: marker }, createdAt: timestamp, updatedAt: timestamp });
    for (const actor of ['owner', 'outsider'] as const) {
      const role = actor === 'owner' ? 'owner' as const : 'admin' as const;
      await ctx.db.insert('members', { studioId, userId: users[actor]._id, role, status: 'active', createdAt: timestamp, updatedAt: timestamp });
      await ctx.db.insert('studioMembers', { studioExternalId, studioId, userExternalId: users[actor].externalId!, userId: users[actor]._id, role, status: 'active', createdAt: timestamp, updatedAt: timestamp });
    }
    const roleIds = {} as Record<'admin' | 'support' | 'moderator', string>;
    for (const [actor, role] of [['admin', 'ADMIN'], ['support', 'SUPPORT'], ['moderator', 'MODERATOR']] as const) {
      roleIds[actor] = await ctx.db.insert('platformRoles', { userId: users[actor]._id, role, status: 'ACTIVE', createdAt: timestamp, updatedAt: timestamp });
    }
    const ownerCtx = fixtureOwnerContext(ctx, marker);
    const main = await createProjectForMember(ownerCtx, { name: 'Development platform authorization fixture · main', contentType: 'fixture', description: 'State and permission verification only; no generated output.' }, { studioExternalId, externalId: `${marker}:project:main`, metadata: { fixtureMarker: marker } });
    const foreign = await createProjectForMember(ownerCtx, { name: 'Development platform authorization fixture · foreign', contentType: 'fixture', description: 'Cross-project ownership denial fixture only.' }, { studioExternalId, externalId: `${marker}:project:foreign`, metadata: { fixtureMarker: marker } });
    const assets = {} as Record<'main' | 'foreign', string>;
    for (const [name, projectId] of [['main', main.projectId], ['foreign', foreign.projectId]] as const) {
      assets[name] = await ctx.db.insert('assets', { studioExternalId, studioId, projectId, scope: 'PROJECT', source: 'FIXTURE_METADATA_ONLY', roles: ['REFERENCE'], name: `Metadata-only ${name} ownership fixture`, mimeType: 'image/png', metadata: { fixtureMarker: marker, noStoredMedia: true }, createdAt: timestamp });
    }
    const modelId = await ctx.db.insert('videoModelCatalog', { studioExternalId, provider: 'fixture', modelId: `${marker}:non-provider-model`, name: 'Development fixture only · no provider route', supportsTextToVideo: false, supportsImageReferences: false, supportsVideoReferences: false, supportsFirstFrame: false, supportsLastFrame: false, supportsVideoEdit: false, supportsVideoExtension: false, supportsAudio: false, supportedDurations: [4], supportedResolutions: ['720p'], supportedAspectRatios: ['16:9'], supportedParameters: [], available: true, lastSeenAt: timestamp });
    await ctx.db.insert('audit', { actorExternalId: 'internal:platform-fixture-seed', action: 'DEV_PLATFORM_FIXTURE_SEEDED', entityType: 'fixture', entityId: marker, metadata: { scope: 'PLATFORM', fixtureMarker: marker, roleIds, noBootstrap: true, noProviderJobs: true }, createdAt: timestamp });
    return { marker, startedAt: timestamp, studioExternalId, projectId: main.projectId, foreignProjectId: foreign.projectId, assetId: assets.main, foreignAssetId: assets.foreign, modelId, actors: Object.fromEntries(ACTORS.map((actor) => [actor, { userId: users[actor]._id, subject: subject(marker, actor) }])) };
  },
});

export const snapshot = internalQuery({
  args: { fixtureKey: v.string(), runId: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    const marker = fixtureMarker(args.fixtureKey, args.runId);
    const users = await Promise.all(ACTORS.map((actor) => fixtureUser(ctx, marker, actor)));
    const ids = new Set(users.flatMap((user) => user ? [String(user._id)] : []));
    const main = await fixtureProject(ctx, marker, 'main');
    const foreign = await fixtureProject(ctx, marker, 'foreign');
    const reports = main ? await ctx.db.query('moderationReports').withIndex('by_project', (q) => q.eq('projectId', main._id)).take(21) : [];
    if (reports.length > 20) throw new Error('Fixture report verification exceeds its explicit bound.');
    const roles = await Promise.all(users.map((user) => user ? ctx.db.query('platformRoles').withIndex('by_user', (q) => q.eq('userId', user._id)).unique() : null));
    const studio = await ctx.db.query('studios').withIndex('by_external_id', (q) => q.eq('externalId', `${marker}:studio`)).unique();
    if (studio && object(studio.metadata).fixtureMarker !== marker) throw new Error('Refusing to inspect a non-fixture studio.');
    const model = studio ? await ctx.db.query('videoModelCatalog').withIndex('by_studio_model', (q) => q.eq('studioExternalId', studio.externalId).eq('modelId', `${marker}:non-provider-model`)).unique() : null;
    const oldest = users.filter((user) => user !== null).reduce((minimum, user) => Math.min(minimum, user.createdAt ?? user._creationTime), Date.now());
    const events = await ctx.db.query('audit').withIndex('by_created_at', (q) => q.gte('createdAt', oldest)).take(501);
    if (events.length > 500) throw new Error('Fixture audit verification exceeds its explicit bound.');
    return { marker, users: users.map((user) => user ? { id: user._id, status: user.status, fixtureMarker: object(user.metadata).fixtureMarker } : null), roles: roles.map((role) => role ? { id: role._id, userId: role.userId, role: role.role, status: role.status } : null), projects: [main, foreign].map((project) => project ? { id: project._id, status: project.status, moderationStatus: project.moderationStatus ?? 'CLEAR', deletedAt: project.deletedAt ?? null } : null), reports: reports.map((report) => ({ id: report._id, projectId: report.projectId, status: report.status, decision: report.decision ?? null })), model: model ? { id: model._id, available: model.available, platformQuarantinedAt: model.platformQuarantinedAt ?? null, reviewedAt: model.reviewedAt ?? null } : null, audit: events.filter((event) => object(event.metadata).fixtureMarker === marker || Boolean(event.actorUserId && ids.has(String(event.actorUserId)))).map((event) => ({ id: event._id, action: event.action, entityId: event.entityId, actorUserId: event.actorUserId ?? null, correlationId: event.correlationId ?? null, scope: object(event.metadata).scope })) };
  },
});

/** Cleanup targets only this marker's new users/projects. It intentionally
 * revokes temporary grants without invoking the real bootstrap or deleting
 * audit/production records. The whole cleanup is one transaction. */
export const cleanup = internalMutation({
  args: { fixtureKey: v.string(), runId: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    const marker = fixtureMarker(args.fixtureKey, args.runId);
    const users = await Promise.all(ACTORS.map((actor) => fixtureUser(ctx, marker, actor)));
    const owner = users[0];
    const timestamp = Date.now();
    if (owner?.status === 'disabled') await ctx.db.patch(owner._id, { status: 'active' });
    let projectsDeleted = 0; let reportsClosed = 0;
    for (const name of ['main', 'foreign'] as const) {
      const project = await fixtureProject(ctx, marker, name);
      if (!project) continue;
      if (!owner || project.ownerUserId !== owner._id || project.createdByUserId !== owner._id) throw new Error('Fixture project does not belong to its exact fixture owner.');
      if (project.moderationStatus === 'RESTRICTED') await ctx.db.patch(project._id, { moderationStatus: 'CLEAR', updatedAt: timestamp });
      await softDeleteProject(fixtureOwnerContext(ctx, marker), project._id); projectsDeleted++;
      const reports = await ctx.db.query('moderationReports').withIndex('by_project', (q) => q.eq('projectId', project._id)).take(21);
      if (reports.length > 20) throw new Error('Fixture cleanup exceeds its report bound.');
      for (const report of reports) {
        if (!users.some((user) => user?._id === report.reporterUserId)) throw new Error('Refusing to close a non-fixture report.');
        if (report.status !== 'OPEN') continue;
        await ctx.db.patch(report._id, { status: 'DISMISSED', decision: 'DISMISSED', decisionReason: 'Development fixture cleanup only; no content judgment.', decidedByUserId: users[1]?._id, decidedAt: timestamp, updatedAt: timestamp }); reportsClosed++;
      }
    }
    let rolesRevoked = 0; let usersDisabled = 0;
    for (const user of users) {
      if (!user) continue;
      const grant = await ctx.db.query('platformRoles').withIndex('by_user', (q) => q.eq('userId', user._id)).unique();
      if (grant) { await ctx.db.patch(grant._id, { status: 'REVOKED', updatedAt: timestamp }); rolesRevoked++; }
      await ctx.db.patch(user._id, { status: 'disabled', metadata: { ...object(user.metadata), fixtureClosedAt: timestamp }, updatedAt: timestamp }); usersDisabled++;
    }
    const studio = await ctx.db.query('studios').withIndex('by_external_id', (q) => q.eq('externalId', `${marker}:studio`)).unique();
    if (studio && object(studio.metadata).fixtureMarker !== marker) throw new Error('Refusing to change a non-fixture studio.');
    const model = studio ? await ctx.db.query('videoModelCatalog').withIndex('by_studio_model', (q) => q.eq('studioExternalId', studio.externalId).eq('modelId', `${marker}:non-provider-model`)).unique() : null;
    if (model) await ctx.db.patch(model._id, { available: false, reviewedAt: undefined, reviewedCatalogFingerprint: undefined, reviewedOperations: [] });
    await ctx.db.insert('audit', { actorExternalId: 'internal:platform-fixture-cleanup', action: 'DEV_PLATFORM_FIXTURE_CLEANED', entityType: 'fixture', entityId: marker, metadata: { scope: 'PLATFORM', fixtureMarker: marker, rolesRevoked, usersDisabled, projectsDeleted, reportsClosed }, createdAt: timestamp });
    return { marker, rolesRevoked, usersDisabled, projectsDeleted, reportsClosed, retainedAudit: true };
  },
});
