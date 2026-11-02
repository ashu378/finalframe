const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file, stubs = {}) {
  const filename = path.join(root, file);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod); mod.require = id => Object.hasOwn(stubs, id) ? stubs[id] : normal(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return mod.exports;
}
class AccessError extends Error { constructor(code, message) { super(message); this.code = code; } }
const identity = { externalId: 'subject-one', subject: 'subject-one' };
const auth = { ConvexAuthError: AccessError, ConvexAuthorizationError: AccessError };
const authorization = load('convex/authorization.ts', { './auth': auth, './identity': { getIdentity: async () => identity, requireIdentity: async () => identity } });
const rows = {
  users: [{ _id: 'one', externalId: 'subject-one', authSubject: 'subject-one', status: 'active' }, { _id: 'two', externalId: 'subject-two', authSubject: 'subject-two', status: 'active' }],
  studios: [{ _id: 'studio', externalId: 'workspace', ownerUserId: 'one', ownerExternalId: 'subject-one' }],
  members: [{ _id: 'studio-one', studioId: 'studio', userId: 'one', role: 'owner', status: 'active' }, { _id: 'studio-two', studioId: 'studio', userId: 'two', role: 'member', status: 'active' }],
  studioMembers: [], projects: [{ _id: 'project', studioId: 'studio', studioExternalId: 'workspace', ownerUserId: 'one', createdByUserId: 'one', status: 'DRAFT' }],
  projectMembers: [{ _id: 'project-one', projectId: 'project', userId: 'one', role: 'OWNER', status: 'ACTIVE' }, { _id: 'inactive-owner', projectId: 'project', userId: 'inactive', role: 'OWNER', status: 'SUSPENDED' }, { _id: 'foreign-owner', projectId: 'other-project', userId: 'foreign', role: 'OWNER', status: 'ACTIVE' }],
};
let writes = 0; const indexes = new Set();
const ctx = { db: {
  get: async id => Object.values(rows).flat().find(row => row._id === id) || null,
  patch: async (id, patch) => { writes++; Object.assign(await ctx.db.get(id), patch); },
  insert: async (table, value) => { writes++; const id = table + '-new'; rows[table].push({ _id: id, ...value }); return id; },
  query: table => ({ withIndex: (index, select) => { indexes.add(index); const conditions = []; const q = { eq: (key, value) => { conditions.push([key, value]); return q; } }; select(q); const matches = () => rows[table].filter(row => conditions.every(([key, value]) => row[key] === value)); return { unique: async () => matches()[0] || null, take: async limit => { assert(limit <= 2); return matches().slice(0, limit); }, collect: async () => { throw new Error('Owner invariant must use its bounded role/status index'); } }; } }),
} };
const projects = load('convex/projects.ts', { './_generated/server': { query: value => value, mutation: value => value }, './authorization': authorization, './auth': auth, '../src/lib/project/library': load('src/lib/project/library.ts') });
(async () => {
  for (const role of ['EDITOR', 'VIEWER', 'REVIEWER']) await assert.rejects(projects.setMember.handler(ctx, { projectId: 'project', userId: 'one', role }), /retain at least one owner/);
  await assert.rejects(projects.removeMember.handler(ctx, { projectId: 'project', userId: 'one' }), /retain at least one owner/);
  assert.equal(writes, 0); assert(indexes.has('by_project_role_status'));
  const originalOwner = rows.projectMembers.shift();
  await assert.rejects(projects.setMember.handler(ctx, { projectId: 'project', userId: 'one', role: 'VIEWER' }), /retain at least one owner/, 'migration fallback owner cannot bypass the invariant by inserting a lower role');
  assert.equal(writes, 0); rows.projectMembers.unshift(originalOwner);
  await projects.setMember.handler(ctx, { projectId: 'project', userId: 'two', role: 'OWNER' });
  await projects.setMember.handler(ctx, { projectId: 'project', userId: 'one', role: 'VIEWER' });
  assert.equal(rows.projectMembers.find(row => row.userId === 'one').role, 'VIEWER');
  const afterHandoff = writes;
  await assert.rejects(projects.setMember.handler(ctx, { projectId: 'project', userId: 'two', role: 'VIEWER' }), error => error.code === 'PROJECT_ACCESS_DENIED'); assert.equal(writes, afterHandoff, 'former creator/studio owner cannot override an explicit viewer role');
  identity.externalId = identity.subject = 'subject-two';
  await assert.rejects(projects.setMember.handler(ctx, { projectId: 'project', userId: 'two', role: 'EDITOR' }), /retain at least one owner/);
  await assert.rejects(projects.removeMember.handler(ctx, { projectId: 'project', userId: 'two' }), /retain at least one owner/);
  await projects.setMember.handler(ctx, { projectId: 'project', userId: 'one', role: 'OWNER' });
  await projects.removeMember.handler(ctx, { projectId: 'project', userId: 'two' });
  assert.equal(rows.projectMembers.find(row => row.userId === 'two').status, 'REMOVED');
  identity.externalId = identity.subject = 'subject-one';
  await projects.setMember.handler(ctx, { projectId: 'project', userId: 'two', role: 'OWNER' });
  const legacyOwnerIndex = rows.projectMembers.findIndex(row => row.userId === 'one');
  rows.projectMembers.splice(legacyOwnerIndex, 1);
  identity.externalId = identity.subject = 'subject-two';
  await projects.removeMember.handler(ctx, { projectId: 'project', userId: 'one' });
  assert.equal(rows.projectMembers.find(row => row.userId === 'one').status, 'REMOVED', 'removing a legacy recorded owner persists a denial tombstone');
  identity.externalId = identity.subject = 'subject-one';
  await assert.rejects(authorization.requireProjectAccess(ctx, 'project'), error => error.code === 'PROJECT_ACCESS_DENIED');
  console.log('PASS project owner handoff: last-owner demotion/removal blocked before writes; inactive/foreign owners do not count; valid handoff/removal works; former creator role denied. Actual authorization/handlers, bounded indexed in-memory reads, no database/provider calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
