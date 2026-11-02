const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { webcrypto, createHash } = require('node:crypto');
global.crypto ||= webcrypto;
const root = path.resolve(__dirname, '../..');
function load(file, stubs = {}) { const filename = path.join(root, file); const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); const normal = mod.require.bind(mod); mod.require = name => Object.hasOwn(stubs, name) ? stubs[name] : normal(name); mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename); return mod.exports; }
class AccessError extends Error { constructor(code, message) { super(message); this.code = code; } }
let actor = 'owner'; let signedIn = true; let writes = 0; let sequence = 0; let paginations = 0;
const registered = { query: value => value, mutation: value => value };
const errors = { ConvexAuthError: AccessError, ConvexAuthorizationError: AccessError };
const identity = { getIdentity: async () => signedIn ? { externalId: actor, subject: actor } : null, requireIdentity: async () => { if (!signedIn) throw new AccessError('UNAUTHENTICATED', 'Verified identity required'); return { externalId: actor, subject: actor }; } };
const membership = load('convex/studioMemberships.ts');
const authorization = load('convex/authorization.ts', { './studioMemberships': membership, './identity': identity, './auth': errors });
const team = load('convex/teamLifecycle.ts', { './_generated/server': registered, './studioMemberships': membership, './authorization': authorization });
const account = load('convex/account.ts', { './_generated/server': registered, './studioMemberships': membership, './identity': identity });
const actualAuth = load('convex/auth.ts', { './_generated/server': registered, './studioMemberships': membership, '@convex-dev/auth/providers/Password': { Password: () => ({}) }, '@convex-dev/auth/providers/Email': { Email: () => ({}) }, '@convex-dev/auth/server': { convexAuth: () => ({}), getAuthUserId: async () => signedIn ? actor : null } });
const app = load('convex/app.ts', { './_generated/server': registered, './authorization': authorization, './auth': errors });
const tables = Object.fromEntries(['users', 'studios', 'members', 'studioMembers', 'studioInvitations', 'projectMembers', 'projects', 'audit'].map(name => [name, []]));
const indexReads = new Set();
function add(table, fields) { const row = { _creationTime: ++sequence, createdAt: sequence, updatedAt: sequence, ...fields }; tables[table].push(row); return row; }
const ctx = { db: {
  get: async id => Object.values(tables).flat().find(row => row._id === id) ?? null,
  insert: async (table, fields) => { writes++; const id = `${table}-${++sequence}`; add(table, { _id: id, ...structuredClone(fields) }); return id; },
  patch: async (id, fields) => { writes++; const row = await ctx.db.get(id); assert(row); for (const [key, value] of Object.entries(fields)) { if (value === undefined) delete row[key]; else row[key] = structuredClone(value); } },
  query: table => {
    assert(tables[table], 'No global auth/provider tables may be queried'); let rows = tables[table]; let descending = false;
    const ordered = () => [...rows].sort((a, b) => descending ? b._creationTime - a._creationTime : a._creationTime - b._creationTime);
    const query = { withIndex: (index, select) => { indexReads.add(`${table}.${index}`); if (select) { const predicates = []; const q = { eq: (key, value) => { predicates.push([key, value]); return q; } }; select(q); rows = rows.filter(row => predicates.every(([key, value]) => row[key] === value)); } return query; }, order: value => { descending = value === 'desc'; return query; }, unique: async () => { assert(rows.length <= 1); return rows[0] ?? null; }, first: async () => ordered()[0] ?? null, take: async limit => { assert(limit <= 101); return ordered().slice(0, limit); }, paginate: async ({ cursor, numItems }) => { paginations++; assert(numItems <= 25); const start = cursor === null ? 0 : Number(cursor); const all = ordered(); const page = all.slice(start, start + numItems); return { page, isDone: start + page.length >= all.length, continueCursor: String(start + page.length) }; } }; return query;
  },
} };
const call = async (name, args = {}) => { paginations = 0; const result = await team[name].handler(ctx, args); if (['workspaces', 'roster', 'invitations'].includes(name)) assert(paginations <= 1); return result; };
function user(id) { return add('users', { _id: id, externalId: id, authSubject: id, name: `Name ${id}`, displayName: `Display ${id}`, email: `${id}@private.example`, status: 'active', metadata: { secret: 'private-metadata' } }); }
for (const id of ['owner', 'admin', 'member', 'recipient', 'wrong', 'successor', 'restore', 'legacy', 'new-user', 'peer', 'alternate']) user(id);
const studio = add('studios', { _id: 'studio', externalId: 'studio', ownerId: 'owner', ownerUserId: 'owner', ownerExternalId: 'owner', name: 'Workspace', credits: 0, status: 'active' });
function member(id, role = 'member', status = 'active', studioId = 'studio') { return add('members', { _id: `canonical-${id}-${studioId}`, studioId, userId: id, role, status }); }
function legacy(id, role = 'member', status = 'active', studioExternalId = 'studio') { return add('studioMembers', { _id: `legacy-${id}-${studioExternalId}`, studioExternalId, studioId: studioExternalId, userExternalId: id, userId: id, role, status }); }
const ownerMember = member('owner', 'owner'); legacy('owner', 'owner'); member('admin', 'admin'); legacy('admin', 'admin'); member('member'); legacy('member'); member('successor'); legacy('successor'); member('peer'); member('alternate');
let tokenSequence = 0;
function secret() { const token = Buffer.alloc(32, ++tokenSequence).toString('base64url'); return { token, tokenHash: createHash('sha256').update(token).digest('hex') }; }
async function invitation(recipientUserId, role = 'member', requestId = `invitation-${++tokenSequence}`) { const token = secret(); const args = { studioId: 'studio', recipientUserId, role, tokenHash: token.tokenHash, expiresAt: Date.now() + 3600_000, requestId }; const result = await call('createInvitation', args); return { ...token, args, result }; }
(async () => {
  signedIn = false; await assert.rejects(call('context'), /Verified identity/); signedIn = true;
  ownerMember.status = 'removed'; const beforeDenied = writes;
  await assert.rejects(authorization.requireMember(ctx, 'studio'), /not a member/);
  assert.equal((await actualAuth.currentUser.handler(ctx, {})).studioExternalId, null); assert.equal((await account.current.handler(ctx, {})).studio, null);
  await assert.rejects(account.ensureAccount.handler(ctx, {}), /explicitly suspended or removed/); assert.equal(writes, beforeDenied); assert.equal(ownerMember.status, 'removed');
  ownerMember.status = 'active'; await account.ensureAccount.handler(ctx, {}); assert.equal(ownerMember.role, 'owner');
  actor = 'legacy'; studio.ownerUserId = 'legacy'; studio.ownerId = 'legacy'; studio.ownerExternalId = 'legacy'; const oldLegacy = legacy('legacy', 'owner', 'suspended');
  await assert.rejects(authorization.requireMember(ctx, 'studio'), /not a member/); await assert.rejects(account.ensureAccount.handler(ctx, {}), /explicitly suspended or removed/); oldLegacy.status = 'active'; await account.ensureAccount.handler(ctx, {}); assert(tables.members.some(row => row.userId === 'legacy' && row.role === 'owner'));
  Object.assign(studio, { ownerUserId: 'owner', ownerId: 'owner', ownerExternalId: 'owner' }); actor = 'new-user'; const provisioned = await account.ensureAccount.handler(ctx, {}); assert.equal((await ctx.db.get(provisioned.studioId)).credits, 0);
  actor = 'owner'; console.log('PASS canonical/legacy tombstones deny auth, current workspace and ensureAccount fallback; fresh account provisioning remains safe');
  user('owner-old-alias'); const ownerAlias = add('studioMembers', { _id: 'owner-legacy-alias', studioExternalId: 'studio', studioId: 'studio', userId: 'owner', userExternalId: 'owner-old-alias', role: 'owner', status: 'active' });
  actor = 'owner-old-alias'; await assert.rejects(authorization.requireMember(ctx, 'studio'), /not a member/); actor = 'owner';
  actor = 'member'; await assert.rejects(call('roster', { studioId: 'studio' }), /owner authority/); await assert.rejects(invitation('recipient'), /owner authority/);
  actor = 'admin'; await assert.rejects(invitation('recipient', 'admin'), /owner authority/); const invite = await invitation('recipient');
  const afterCreate = writes; assert.equal((await call('createInvitation', invite.args)).replayed, true); assert.equal(writes, afterCreate); await assert.rejects(call('createInvitation', { ...invite.args, expiresAt: invite.args.expiresAt + 1 }), /another invitation/);
  assert(!JSON.stringify(tables.studioInvitations).includes(invite.token)); assert(!JSON.stringify(tables.audit).includes(invite.token));
  actor = 'wrong'; assert.equal(await call('previewInvitation', { token: invite.token }), null); await assert.rejects(call('acceptInvitation', { token: invite.token, requestId: 'wrong-recipient', selectWorkspace: true }), /unavailable/); assert.equal(await call('previewInvitation', { token: 'malformed' }), null);
  actor = 'recipient'; assert.equal((await call('previewInvitation', { token: invite.token })).studioName, 'Workspace'); const projectsBefore = structuredClone(tables.projectMembers);
  const acceptance = { token: invite.token, requestId: 'accept-recipient', selectWorkspace: true }; assert.equal((await call('acceptInvitation', acceptance)).replayed, false);
  const acceptedWrites = writes; assert.equal((await call('acceptInvitation', acceptance)).replayed, true); assert.equal(writes, acceptedWrites); await assert.rejects(call('acceptInvitation', { ...acceptance, selectWorkspace: false }), /another team change/);
  assert.equal((await account.current.handler(ctx, {})).studio._id, 'studio'); assert.equal((await actualAuth.currentUser.handler(ctx, {})).studioExternalId, 'studio'); assert.deepEqual(tables.projectMembers, projectsBefore); assert.equal(tables.members.find(row => row.userId === 'recipient').role, 'member');
  console.log('PASS hash-only invitation, owner/admin role limits, exact recipient privacy, atomic canonical+legacy accept, bound replay and selected workspace without project grants');
  const recipientMember = tables.members.find(row => row.userId === 'recipient'); recipientMember.status = 'removed';
  assert.equal(await call('previewInvitation', { token: invite.token }), null); await assert.rejects(call('acceptInvitation', acceptance), /cannot restore/); await assert.rejects(call('selectWorkspace', { studioId: 'studio' }), /not a member/);
  actor = 'owner'; await assert.rejects(invitation('recipient'), /explicit member review/);
  await call('changeMember', { studioId: 'studio', userId: 'recipient', status: 'active', role: 'member', reason: 'Explicit owner restoration', requestId: 'restore-recipient' }); assert.equal(recipientMember.status, 'active');
  const pending = await invitation('restore'); tables.studioInvitations.find(row => row._id === pending.result.invitationId).expiresAt = Date.now() - 1;
  actor = 'restore'; assert.equal(await call('previewInvitation', { token: pending.token }), null); await assert.rejects(call('acceptInvitation', { token: pending.token, requestId: 'expired-accept', selectWorkspace: false }), /expired/);
  actor = 'owner'; const revoke = { invitationId: pending.result.invitationId, reason: 'Revoke expired fixture', requestId: 'revoke-expired' }; await call('revokeInvitation', revoke); const revokedWrites = writes; assert.equal((await call('revokeInvitation', revoke)).replayed, true); assert.equal(writes, revokedWrites);
  actor = 'restore'; await assert.rejects(call('acceptInvitation', { token: pending.token, requestId: 'revoked-accept', selectWorkspace: false }), /unavailable/);
  actor = 'owner'; const changedAuthority = await invitation('wrong', 'admin'); const savedOwnerStatus = ownerMember.status; ownerMember.status = 'suspended'; actor = 'wrong'; assert.equal(await call('previewInvitation', { token: changedAuthority.token }), null); await assert.rejects(call('acceptInvitation', { token: changedAuthority.token, requestId: 'issuer-suspended', selectWorkspace: false }), /authority changed/); ownerMember.status = savedOwnerStatus;
  console.log('PASS removed-membership/token replay denial, explicit owner restoration, server expiry/revocation and acceptance-time issuer authority');
  actor = 'owner'; const beforePrimary = writes; await assert.rejects(call('changeMember', { studioId: 'studio', userId: 'owner', role: 'member', status: 'removed', reason: 'Cannot remove owner', requestId: 'remove-primary-owner' }), /primary owner/); assert.equal(writes, beforePrimary);
  const transfer = { studioId: 'studio', successorUserId: 'successor', reason: 'Deliberate fixture handoff', confirmation: 'TRANSFER successor', requestId: 'transfer-owner' };
  await assert.rejects(call('transferOwnership', { ...transfer, confirmation: 'TRANSFER wrong' }), /exact successor/); actor = 'admin'; await assert.rejects(call('transferOwnership', transfer), /owner authority/); actor = 'owner';
  await call('transferOwnership', transfer); assert.equal(studio.ownerUserId, 'successor'); assert.equal(studio.ownerId, 'successor'); assert.equal(studio.ownerExternalId, 'successor'); assert.equal(ownerMember.role, 'admin'); assert.equal(tables.studioMembers.find(row => row.userId === 'owner').role, 'admin');
  assert.equal(ownerAlias.role, 'admin', 'Bounded legacy user-ID aliases must be synchronized too.');
  const handoffWrites = writes; assert.equal((await call('transferOwnership', transfer)).replayed, true); assert.equal(writes, handoffWrites); await account.ensureAccount.handler(ctx, {}); assert.equal(ownerMember.role, 'admin');
  await assert.rejects(invitation('wrong', 'admin', 'old-owner-admin-invite'), /owner authority/);
  assert(!indexReads.has('users.by_email')); assert.equal(tables.audit.filter(row => row.action === 'STUDIO_OWNERSHIP_TRANSFERRED').length, 1);
  console.log('PASS primary owner protection, typed/canonical handoff, atomic owner/canonical/legacy fields, replay and no old-owner auto-promotion');
  actor = 'successor'; member('restore'); const privateProject = add('projects', { _id: 'private-project', studioExternalId: 'studio', studioId: 'studio', name: 'DO-NOT-DISCLOSE-PRIVATE-PROJECT', ownerUserId: 'restore', createdByUserId: 'restore', createdByExternalId: 'restore' });
  add('projectMembers', { _id: 'private-owner', projectId: privateProject._id, userId: 'restore', role: 'OWNER', status: 'ACTIVE' }); add('projectMembers', { _id: 'private-editor', projectId: privateProject._id, userId: 'peer', role: 'EDITOR', status: 'ACTIVE' });
  const removal = { studioId: 'studio', userId: 'restore', status: 'removed', reason: 'Review removal after handoff', requestId: 'remove-project-owner' }; const beforeOrphan = writes;
  await assert.rejects(call('changeMember', removal), error => /Shared project ownership/.test(error.message) && !error.message.includes(privateProject.name)); assert.equal(writes, beforeOrphan);
  add('projectMembers', { _id: 'private-other-owner', projectId: privateProject._id, userId: 'alternate', role: 'OWNER', status: 'ACTIVE' }); const alternate = tables.members.find(row => row.userId === 'alternate'); alternate.status = 'removed'; legacy('alternate'); await assert.rejects(call('changeMember', removal), /Shared project ownership/); alternate.status = 'active';
  await call('changeMember', removal); assert.equal(tables.members.find(row => row.userId === 'restore').status, 'removed'); assert.equal(tables.projectMembers.find(row => row._id === 'private-owner').role, 'OWNER'); assert.equal(privateProject.name, 'DO-NOT-DISCLOSE-PRIVATE-PROJECT');
  tables.members.find(row => row.userId === 'restore').status = 'active';
  for (let number = 0; number < 101; number++) add('projectMembers', { _id: `overflow-${number}`, projectId: 'foreign', userId: 'restore', role: 'VIEWER', status: 'ACTIVE' });
  const beforeIncomplete = writes; await assert.rejects(call('changeMember', { ...removal, requestId: 'remove-bounded-member' }), /bounded project ownership review is incomplete/); assert.equal(writes, beforeIncomplete);
  console.log('PASS studio removal does not orphan sole enabled shared-project owner, ignores prospective inactive/legacy-resurrected peers and retains project history');
  for (let number = 0; number < 32; number++) { const id = `many-${number}`; user(id); member(id); legacy(id); }
  const seen = []; let continuation;
  do { const page = await call('roster', { studioId: 'studio', ...(continuation ? { cursor: continuation } : {}) }); seen.push(...page.rows); continuation = page.continueCursor; } while (continuation);
  assert.equal(new Set(seen.map(row => row.key)).size, seen.length); assert(seen.some(row => row.userId === 'many-31')); assert(!JSON.stringify(seen).includes('private.example')); assert(!JSON.stringify(seen).includes('private-metadata'));
  for (let number = 0; number < 27; number++) { const id = `workspace-${number}`; add('studios', { _id: id, externalId: id, ownerUserId: 'wrong', ownerExternalId: 'wrong', name: id }); member('successor', 'member', 'active', id); }
  const spaces = []; continuation = undefined; do { const page = await call('workspaces', continuation ? { cursor: continuation } : {}); spaces.push(...page.rows); continuation = page.continueCursor; } while (continuation); assert(spaces.some(row => row.studioId === 'workspace-26')); assert.equal(new Set(spaces.map(row => row.studioId)).size, spaces.length);
  const first = await call('roster', { studioId: 'studio' }); actor = 'admin'; await assert.rejects(call('roster', { studioId: 'studio', cursor: first.continueCursor }), /another team or user/);
  for (const name of ['team', 'inviteTeamMember', 'updateTeamMember', 'removeTeamMember']) await assert.rejects(app[name].handler(ctx, {}), /retired/);
  console.log('PASS bounded complete/deduplicated canonical+legacy roster/workspace pages, scoped cursors, no peer-email/global-directory leak and retired legacy team backdoors');
  add('studioMembers', { _id: 'unmapped-email', studioExternalId: 'studio', userExternalId: 'never-return-this-peer-email@example.test', role: 'member', status: 'invited' });
  const beforePrivacy = writes; const people = await app.adminUsers.handler(ctx, {}); assert(people.length <= 100);
  assert(people.every(row => JSON.stringify(Object.keys(row).sort()) === JSON.stringify(['_id', 'membershipStatus', 'name', 'role'])));
  assert(people.some(row => row.name === 'Legacy membership without an available canonical account'));
  const privateOutput = JSON.stringify(people); for (const secret of ['private.example', 'never-return-this-peer-email', 'authSubject', 'externalId', 'metadata', 'private-metadata']) assert(!privateOutput.includes(secret));
  actor = 'peer'; await assert.rejects(app.adminUsers.handler(ctx, {}), /administrator access/); signedIn = false; await assert.rejects(app.adminUsers.handler(ctx, {}), /Verified identity/); assert.equal(writes, beforePrivacy);
  console.log('PASS actual studio operations adminUsers handler whitelists peer display/ID/role/state, omits raw identity/metadata/email fallback and retains studio-admin-only authority');
})().catch(error => { console.error(error); process.exitCode = 1; });
