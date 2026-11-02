const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { webcrypto, createHash } = require('node:crypto');
global.crypto ||= webcrypto;
const root = path.resolve(__dirname, '../..');
function load(file, stubs = {}) {
  const filename = path.join(root, file); const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod); mod.require = (name) => Object.hasOwn(stubs, name) ? stubs[name] : normal(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename); return mod.exports;
}
class AccessError extends Error { constructor(code, message) { super(message); this.code = code; } }
const errors = { ConvexAuthError: AccessError, ConvexAuthorizationError: AccessError };
let actor = 'exporter'; let signedIn = true; let sequence = 0; let writes = 0; let paginationCalls = 0; let failRead;
const identity = { getIdentity: async () => signedIn ? { externalId: actor, subject: actor } : null, requireIdentity: async () => { if (!signedIn) throw new AccessError('UNAUTHENTICATED', 'Verified identity required'); return { externalId: actor, subject: actor }; } };
const authorization = load('convex/authorization.ts', { './identity': identity, './auth': errors });
const registered = { query: (value) => value, mutation: (value) => value, internalMutation: (value) => value };
const contracts = load('src/lib/account-lifecycle/contracts.ts');
const format = load('src/lib/account-lifecycle/export-format.ts');
const platform = load('convex/platformAdministration.ts', { './_generated/server': registered, './authorization': authorization, './auth': errors, '../src/lib/platform-admin/contracts': load('src/lib/platform-admin/contracts.ts') });
const lifecycle = load('convex/accountLifecycle.ts', { './_generated/server': registered, './authorization': authorization, './auth': errors, './platformAdministration': platform, '../src/lib/account-lifecycle/contracts': contracts, '../src/lib/account-lifecycle/export-format': format });
const account = load('convex/account.ts', { './_generated/server': registered, './identity': identity });
const tables = Object.fromEntries(['users', 'studios', 'members', 'studioMembers', 'projects', 'projectMembers', 'platformRoles', 'audit', 'accountExportRequests', 'accountExportPages', 'accountDeactivationRequests'].map((name) => [name, []]));
function add(table, fields) { const row = { _creationTime: ++sequence, createdAt: sequence, updatedAt: sequence, ...fields }; tables[table].push(row); return row; }
const ctx = { db: {
  get: async (id) => { if (id === failRead) throw new Error('database transport unavailable'); return Object.values(tables).flat().find((row) => row._id === id) ?? null; },
  insert: async (table, fields) => { writes++; const id = `${table}-${++sequence}`; add(table, { _id: id, ...structuredClone(fields) }); return id; },
  patch: async (id, fields) => { writes++; const row = await ctx.db.get(id); assert(row); for (const [key, value] of Object.entries(fields)) { if (value === undefined) delete row[key]; else row[key] = structuredClone(value); } },
  query: (table) => {
    assert(tables[table], `Export must not read secret/descendant table ${table}`);
    let rows = tables[table]; let descending = false;
    const ordered = () => [...rows].sort((a, b) => descending ? b._creationTime - a._creationTime : a._creationTime - b._creationTime);
    const query = {
      withIndex: (_name, select) => { if (select) { const predicates = []; const q = { eq: (key, value) => { predicates.push([key, value]); return q; } }; select(q); rows = rows.filter((row) => predicates.every(([key, value]) => row[key] === value)); } return query; },
      order: (value) => { descending = value === 'desc'; return query; },
      unique: async () => { assert(rows.length <= 1); return rows[0] ?? null; }, first: async () => ordered()[0] ?? null,
      take: async (limit) => { assert(limit <= 101); return ordered().slice(0, limit); },
      paginate: async ({ cursor, numItems }) => { paginationCalls++; assert(numItems <= 25); const start = cursor === null ? 0 : Number(cursor); assert(Number.isSafeInteger(start)); const items = ordered(); const page = items.slice(start, start + numItems); return { page, isDone: start + page.length >= items.length, continueCursor: String(start + page.length) }; },
    }; return query;
  },
} };
const call = async (name, args = {}) => { paginationCalls = 0; const result = await lifecycle[name].handler(ctx, args); if (name === 'exportPart') assert(paginationCalls <= 1, 'One native pagination operation per part'); return result; };
const user = (id, status = 'active') => add('users', { _id: id, externalId: id, authSubject: id, name: `Auth ${id}`, email: `${id}@example.test`, status, metadata: { providerVoiceId: 'voice-secret', authSecret: 'user-secret' } });
for (const id of ['exporter', 'studio-owner', 'viewer', 'admin', 'support', 'moderator', 'candidate', 'peer', 'alternate']) user(id);
add('studios', { _id: 'studio', externalId: 'studio', ownerUserId: 'studio-owner', ownerExternalId: 'studio-owner', name: 'Existing shared studio' });
for (const id of ['exporter', 'viewer', 'candidate', 'peer', 'alternate']) add('members', { _id: `studio-member-${id}`, studioId: 'studio', userId: id, role: 'member', status: 'active' });
for (const [id, role] of [['admin', 'ADMIN'], ['support', 'SUPPORT'], ['moderator', 'MODERATOR']]) add('platformRoles', { _id: `role-${id}`, userId: id, role, status: 'ACTIVE' });
function project(id, owner = 'exporter', membership = 'OWNER', extra = {}) {
  const row = add('projects', { _id: id, externalId: `external-${id}`, studioExternalId: 'studio', studioId: 'studio', name: `Index project ${id}`, description: `Description ${id}`, projectType: 'film', ownerUserId: owner, createdByUserId: owner, createdByExternalId: owner, status: 'DRAFT', metadata: { authSecret: 'project-secret', providerVoiceId: 'voice-secret', signedUrl: 'https://private.invalid/secret' }, ...extra });
  if (membership) add('projectMembers', { _id: `member-${id}`, projectId: id, userId: 'exporter', role: membership, status: 'ACTIVE' });
  return row;
}
for (let i = 0; i < 38; i++) project(`explicit-${i}`);
for (let i = 0; i < 13; i++) project(`legacy-${i}`, 'exporter', null);
project('editor-project', 'studio-owner', 'EDITOR'); project('viewer-project', 'studio-owner', 'VIEWER');
project('removed-project-secret'); Object.assign(tables.projectMembers.find((row) => row.projectId === 'removed-project-secret'), { _id: 'membership-removed', status: 'REMOVED' });
project('foreign-project-secret', 'studio-owner', null);
project('restricted-project', 'exporter', 'OWNER', { moderationStatus: 'RESTRICTED', description: 'restricted-description-secret' });
project('archived-project', 'exporter', 'OWNER', { status: 'ARCHIVED', archivedAt: 1 });
project('deleted-project', 'exporter', 'OWNER', { status: 'DELETED', deletedAt: 1 });
const largeDescription = '🔥界'.repeat(40_000); project('large-project', 'exporter', 'OWNER', { description: largeDescription });

(async () => {
  signedIn = false; const beforeAnonymous = writes; await assert.rejects(call('updateProfile', { displayName: 'Imposter' }), /Verified/); assert.equal(writes, beforeAnonymous); signedIn = true;
  await call('updateProfile', { displayName: '  New display  ' });
  const exporter = tables.users.find((row) => row._id === 'exporter'); assert.equal(exporter.name, 'Auth exporter'); assert.equal(exporter.email, 'exporter@example.test'); assert.equal(exporter.displayName, 'New display');
  await assert.rejects(call('updateProfile', { displayName: '\u0000bad' }), /control/); await assert.rejects(call('updateProfile', { displayName: '' }), /display name/);
  assert.equal((await call('profile', { now: Date.now() })).displayName, 'New display'); console.log('PASS profile uses verified user and updates displayName only');
  const request = await call('startExport', { requestId: 'index-fixture-one' }); assert.equal((await call('startExport', { requestId: 'index-fixture-one' })).requestId, request.requestId);
  actor = 'viewer'; await assert.rejects(call('exportPart', { requestId: request.requestId, ordinal: 0 }), /unavailable/); actor = 'exporter';
  const outputs = []; let result;
  do { result = await call('exportPart', { requestId: request.requestId, ordinal: outputs.length }); outputs.push(result); assert(Buffer.byteLength(result.content) < 128 * 1024); assert(outputs.length < 200, 'Index must progress to explicit completion'); } while (!result.isDone);
  const rows = []; const fragments = new Map();
  for (const output of outputs) {
    const [first, ...lines] = output.content.trimEnd().split('\n'); const header = JSON.parse(first); const payload = lines.length ? lines.join('\n') + '\n' : '';
    assert.equal(header.payloadSha256, createHash('sha256').update(payload).digest('hex')); assert.equal(header.payloadBytes, Buffer.byteLength(payload));
    for (const line of lines) { const item = JSON.parse(line); if (item.type === 'record') rows.push(item); else { const group = fragments.get(item.recordId) || []; group.push(item); fragments.set(item.recordId, group); } }
  }
  for (const group of fragments.values()) { let offset = 0; const chunks = []; for (const item of group) { assert.equal(item.offset, offset); const chunk = Buffer.from(item.data, 'base64'); offset += chunk.length; chunks.push(chunk); } const bytes = Buffer.concat(chunks); assert.equal(bytes.length, group[0].totalBytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), group[0].sha256); rows.push({ type: 'record', section: group[0].section, record: JSON.parse(bytes.toString('utf8')) }); }
  const indexed = rows.filter((row) => row.section === 'projects').map((row) => row.record);
  assert.equal(indexed.length, 56); assert.equal(new Set(indexed.map((row) => row.projectId)).size, indexed.length);
  assert.equal(indexed.find((row) => row.projectId === 'large-project').description, largeDescription);
  const serialized = JSON.stringify(rows);
  for (const hidden of ['removed-project-secret', 'foreign-project-secret', 'project-secret', 'voice-secret', 'user-secret', 'restricted-description-secret', 'https://private.invalid']) assert(!serialized.includes(hidden), `${hidden} must not be exported`);
  assert(!indexed.some((row) => row.projectId === 'viewer-project'));
  assert.deepEqual(Object.keys(indexed.find((row) => row.projectId === 'restricted-project')).sort(), ['moderationStatus', 'name', 'projectId', 'status', 'yourRole']);
  const manifest = await call('exportManifest', { requestId: request.requestId }); assert.equal(manifest.title, 'Account and project index'); assert.equal(manifest.pageCount, outputs.length); assert.equal(manifest.recordCount, rows.length);
  console.log('PASS complete paginated explicit+legacy project index, inactive lifecycle, current roles, lossless UTF-8 fragments, byte bounds and manifest integrity');
  const savedWrites = writes; assert.equal((await call('exportPart', { requestId: request.requestId, ordinal: 0 })).replayed, true); assert.equal(writes, savedWrites);
  await assert.rejects(call('exportPart', { requestId: request.requestId, ordinal: outputs.length + 1 }), /next available/);
  const largeValue = { text: largeDescription }; const fragment = await format.exportPayload([{ kind: 'project', id: 'large', value: largeValue }], { itemOffset: 0, fragmentOffset: 0 });
  await assert.rejects(format.exportPayload([{ kind: 'project', id: 'large', value: { text: `${largeDescription}changed` } }], fragment.progress), /content changed/);
  await assert.rejects(format.exportPayload([null], fragment.progress), /access changed/);
  await assert.rejects(format.exportPayload([], fragment.progress), /access changed/);
  const targetOrdinal = outputs.findIndex((part) => part.content.includes('explicit-0'));
  tables.projectMembers.find((row) => row.projectId === 'explicit-0').status = 'REMOVED';
  await assert.rejects(call('exportPart', { requestId: request.requestId, ordinal: targetOrdinal }), /content or access changed/);
  tables.projectMembers.find((row) => row.projectId === 'explicit-0').status = 'ACTIVE'; failRead = 'explicit-0';
  await assert.rejects(call('exportPart', { requestId: request.requestId, ordinal: targetOrdinal }), /transport unavailable/); failRead = undefined;
  tables.accountExportRequests.find((row) => row._id === request.requestId).expiresAt = Date.now() - 1;
  await assert.rejects(call('exportPart', { requestId: request.requestId, ordinal: 0 }), /expired/); await assert.rejects(call('exportManifest', { requestId: request.requestId }), /unexpired/);
  const second = await call('startExport', { requestId: 'index-fixture-two' }); await call('cancelExport', { requestId: second.requestId }); await assert.rejects(call('exportPart', { requestId: second.requestId, ordinal: 0 }), /ended/);
  console.log('PASS part replay is idempotent, reauthorizes revoked membership, preserves transport errors and enforces TTL/cancellation');

  actor = 'candidate'; add('studios', { _id: 'personal', externalId: 'personal', ownerUserId: 'candidate', ownerExternalId: 'candidate', name: 'Personal studio' }); add('members', { _id: 'personal-owner', studioId: 'personal', userId: 'candidate', role: 'owner', status: 'active' });
  assert.equal((await call('deactivationPreflight')).allowed, true);
  const candidateRole = add('platformRoles', { _id: 'candidate-admin', userId: 'candidate', role: 'ADMIN', status: 'ACTIVE' }); const mainAdmin = tables.users.find((row) => row._id === 'admin'); mainAdmin.status = 'disabled';
  assert.equal((await call('deactivationPreflight')).blockers[0].code, 'LAST_PLATFORM_ADMIN'); mainAdmin.status = 'active'; candidateRole.status = 'REVOKED';
  const peerStudio = add('members', { _id: 'personal-peer', studioId: 'personal', userId: 'peer', role: 'member', status: 'active' }); assert.equal((await call('deactivationPreflight')).blockers[0].code, 'SHARED_STUDIO_OWNER'); peerStudio.status = 'removed';
  const shared = project('shared-candidate', 'candidate', null); add('projectMembers', { _id: 'shared-peer', projectId: shared._id, userId: 'peer', role: 'EDITOR', status: 'ACTIVE' });
  assert.equal((await call('deactivationPreflight')).blockers[0].code, 'SHARED_PROJECT_OWNER');
  const otherOwner = add('projectMembers', { _id: 'alternate-owner', projectId: shared._id, userId: 'alternate', role: 'OWNER', status: 'ACTIVE' });
  const alternate = tables.users.find((row) => row._id === 'alternate'); alternate.status = 'disabled'; assert.equal((await call('deactivationPreflight')).allowed, false); alternate.status = 'active'; assert.equal((await call('deactivationPreflight')).allowed, true);
  otherOwner.status = 'REMOVED'; const candidateRemoved = add('projectMembers', { _id: 'candidate-removed', projectId: shared._id, userId: 'candidate', role: 'OWNER', status: 'REMOVED' }); assert.equal((await call('deactivationPreflight')).allowed, true); candidateRemoved.status = 'ACTIVE'; otherOwner.status = 'ACTIVE';
  console.log('PASS last enabled ADMIN, shared studio, shared legacy project and disabled alternate-owner safety guards');
  const input = { requestId: 'deactivation-fixture-one', reason: 'Fixture retained-data request', confirmation: 'DEACTIVATE' };
  const retained = structuredClone(tables.projects); const deactivated = await call('requestDeactivation', input); const candidate = tables.users.find((row) => row._id === 'candidate'); assert.equal(candidate.status, 'disabled'); assert.equal(candidate.deactivationRequestId, deactivated.requestId); assert.deepEqual(tables.projects, retained);
  const requestWrites = writes; assert.equal((await call('requestDeactivation', input)).replayed, true); assert.equal(writes, requestWrites); await assert.rejects(call('requestDeactivation', { ...input, reason: 'Different request' }), /another account lifecycle/);
  for (const [name, args] of [['profile', {}], ['updateProfile', { displayName: 'Reactivate' }], ['startExport', { requestId: 'disabled-export' }]]) await assert.rejects(call(name, args), /disabled/);
  await assert.rejects(account.ensureAccount.handler(ctx, {}), /disabled/); assert.equal(candidate.status, 'disabled'); assert.equal(writes, requestWrites);
  actor = 'admin'; await assert.rejects(platform.setUserStatus.handler(ctx, { userId: 'candidate', status: 'active', reason: 'Do not bypass request', requestId: 'bypass-pending-request' }), /dedicated recovery/);
  for (const who of ['support', 'moderator', 'candidate']) { actor = who; await assert.rejects(call('recoverAccount', { requestId: deactivated.requestId, reason: 'Wrong authority' }), /Explicit platform|disabled/); }
  actor = 'admin'; assert.equal((await call('deactivationRequests')).requests[0].requestId, deactivated.requestId);
  const recovery = { requestId: deactivated.requestId, reason: 'Fixture owner recovery reviewed' }; assert.equal((await call('recoverAccount', recovery)).replayed, false); const recoveryWrites = writes; assert.equal((await call('recoverAccount', recovery)).replayed, true); assert.equal(writes, recoveryWrites);
  await assert.rejects(call('recoverAccount', { ...recovery, reason: 'Different recovery' }), /different recovery/); assert.equal(candidate.status, 'active'); assert.equal(candidate.deactivationRequestId, undefined); assert.deepEqual(tables.projects, retained);
  assert.equal(tables.audit.filter((row) => row.action === 'ACCOUNT_DEACTIVATION_RECOVERED').length, 1); assert.equal(tables.audit.find((row) => row.action === 'ACCOUNT_DEACTIVATION_RECOVERED').metadata.scope, 'PLATFORM');
  actor = 'candidate'; for (let i = 0; i < 101; i++) add('projectMembers', { _id: `many-${i}`, userId: 'candidate', projectId: 'irrelevant', role: 'VIEWER', status: 'ACTIVE' }); const beforeLimit = writes; assert.equal((await call('deactivationPreflight')).blockers[0].code, 'SCAN_LIMIT'); await assert.rejects(call('requestDeactivation', { ...input, requestId: 'bounded-deactivation' }), /bounded safety scan/); assert.equal(writes, beforeLimit);
  console.log('PASS retained-data request, disabled-action/ensureAccount fences, ADMIN-only audited idempotent recovery and explicit incomplete-scan refusal');
})().catch((error) => { console.error(error); process.exitCode = 1; });
