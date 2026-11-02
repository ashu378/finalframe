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
const identity = { externalId: 'subject', subject: 'subject' };
const auth = { ConvexAuthError: AccessError, ConvexAuthorizationError: AccessError };
const authorization = load('convex/authorization.ts', { './auth': auth, './identity': { getIdentity: async () => identity, requireIdentity: async () => identity } });
const server = { query: value => value, mutation: value => value };
const args = { studioExternalId: 'studio-external', templateId: 'product-launch', projectName: 'My launch', requestId: 'original-request' };
const project = { _id: 'project', externalId: 'template_studio_user_original-request', studioId: 'studio', studioExternalId: args.studioExternalId, createdByUserId: 'user', ownerUserId: 'user', createdByExternalId: 'subject', name: args.projectName, status: 'DRAFT', metadata: { templateId: args.templateId, templateCreationInput: { templateId: args.templateId, templateVersion: 1, projectName: args.projectName, requestId: args.requestId, createdByUserId: 'user' } } };
const projectMember = { _id: 'membership', projectId: 'project', userId: 'user', role: 'OWNER', status: 'ACTIVE' };
const rows = {
  users: [{ _id: 'user', externalId: 'subject', authSubject: 'subject', status: 'active' }],
  studios: [{ _id: 'studio', externalId: args.studioExternalId, ownerUserId: 'user', ownerExternalId: 'subject' }],
  members: [{ _id: 'studio-membership', studioId: 'studio', userId: 'user', role: 'owner', status: 'active' }],
  studioMembers: [], projects: [project], projectMembers: [projectMember],
};
let writes = 0;
const ctx = { db: {
  get: async id => Object.values(rows).flat().find(row => row._id === id) || null,
  patch: async () => { writes++; throw new Error('Replay must not write'); }, insert: async () => { writes++; throw new Error('Replay must not create another project'); },
  query: table => ({ withIndex: (_index, select) => { const conditions = []; const q = { eq: (key, value) => { conditions.push([key, value]); return q; } }; select(q); return { unique: async () => rows[table].find(row => conditions.every(([key, value]) => row[key] === value)) || null }; } }),
} };
const templates = load('convex/templates.ts', { './_generated/server': server, './authorization': authorization, './projects': { createProjectForMember: async () => { throw new Error('Existing request must never create another project'); } }, '../src/lib/templates/catalog': load('src/lib/templates/catalog.ts') });
(async () => {
  assert.equal((await templates.createProject.handler(ctx, args)).replayed, true);
  project.name = 'Renamed later';
  assert.equal((await templates.createProject.handler(ctx, args)).replayed, true, 'creation replay reads immutable original input after rename');
  for (const status of ['REMOVED', 'SUSPENDED']) {
    projectMember.status = status;
    assert((await authorization.requireMember(ctx, args.studioExternalId)).studio, 'studio membership remains active');
    await assert.rejects(authorization.requireProjectAccess(ctx, 'project'), error => error.code === 'PROJECT_ACCESS_DENIED');
    await assert.rejects(templates.createProject.handler(ctx, args), error => error.code === 'PROJECT_ACCESS_DENIED', 'receipt replay must enforce current explicit project membership');
  }
  projectMember.status = 'ACTIVE'; projectMember.role = 'VIEWER';
  assert.equal((await templates.createProject.handler(ctx, args)).replayed, true, 'an active viewer may retrieve an existing authorized receipt');
  await assert.rejects(templates.createProject.handler(ctx, { ...args, projectName: 'Different request' }), /another project/);
  assert.equal(writes, 0);
  console.log('PASS template replay uses actual canonical project authorization: revoked/suspended membership denied despite studio/creator ownership, authorized replay retained, zero writes. No database/provider calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
