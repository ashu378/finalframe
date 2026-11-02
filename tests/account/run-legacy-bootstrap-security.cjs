const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file, imports) {
  const filename = path.join(root, file); const mod = new Module(filename, module); mod.filename = filename;
  mod.require = name => { if (Object.hasOwn(imports, name)) return imports[name]; throw new Error('Unexpected test dependency: ' + name); };
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return mod.exports;
}
const v = new Proxy({}, { get: () => () => ({}) });
const definitions = { internalMutation: value => ({ ...value, visibility: 'internal' }), mutation: value => ({ ...value, visibility: 'public' }), query: value => value };
let signedIn = true; let actor = 'owner'; let reads = []; let writes = 0;
const rows = {
  users: [{ _id: 'owner', authSubject: 'owner', externalId: 'owner', status: 'active', metadata: { secret: 'retained-user-metadata' } }],
  studios: [{ _id: 'studio', externalId: 'studio', ownerUserId: 'owner', ownerExternalId: 'owner', credits: 7, metadata: { secret: 'retained-studio-metadata' } }],
  members: [{ _id: 'member', studioId: 'studio', userId: 'owner', role: 'owner', status: 'active' }], studioMembers: [], projects: [], assets: [],
};
const ctx = { db: {
  get: async id => { reads.push(['get', id]); return Object.values(rows).flat().find(row => row._id === id) ?? null; },
  insert: async () => { writes++; throw new Error('Unexpected write'); }, patch: async () => { writes++; throw new Error('Unexpected write'); },
  query: table => {
    reads.push(['query', table]); let values = rows[table]; assert(values, table);
    const q = { withIndex: (_, callback) => { const constraints = []; const builder = { eq: (key, value) => { constraints.push([key, value]); return builder; } }; callback(builder); values = values.filter(row => constraints.every(([key, value]) => row[key] === value)); return q; },
      filter: callback => { const condition = callback({ field: key => key, eq: (key, value) => row => row[key] === value }); values = values.filter(condition); return q; },
      unique: async () => { assert(values.length <= 1); return values[0] ?? null; }, first: async () => values[0] ?? null };
    return q;
  },
} };
const identity = { requireIdentity: async () => { if (!signedIn) throw new Error('UNAUTHENTICATED'); return { externalId: actor, subject: actor }; } };
const bootstrap = load('convex/bootstrap.ts', { './_generated/server': definitions, 'convex/values': { v } });
const account = load('convex/account.ts', { './_generated/server': definitions, 'convex/values': { v }, './identity': identity });
(async () => {
  const legacyArgs = {
    ensureStudio: { studioExternalId: 'new-studio', name: 'Attempted grant', initialCredits: 1000000 },
    mirrorProject: { studioExternalId: 'studio', projectExternalId: 'foreign-project', name: 'Cross-project replay' },
    mirrorAsset: { studioExternalId: 'studio', productionId: 'foreign-production', assetExternalId: 'foreign-asset', source: 'UPLOAD', roles: ['VIDEO'], storageUrl: 'https://private.invalid/media', metadata: { authority: 'untrusted' } },
  };
  for (const state of ['active', 'disabled', 'anonymous']) {
    signedIn = state !== 'anonymous'; rows.users[0].status = state === 'disabled' ? 'disabled' : 'active';
    for (const name of Object.keys(legacyArgs)) {
      assert.equal(bootstrap[name].visibility, 'internal', `${name} must not be browser callable`);
      const before = structuredClone(rows); const beforeWrites = writes; const beforeReads = reads.length;
      await assert.rejects(bootstrap[name].handler(ctx, legacyArgs[name]), /LEGACY_BOOTSTRAP_READ_ONLY/);
      assert.equal(writes, beforeWrites); assert.equal(reads.length, beforeReads, 'legacy compatibility must not even reveal foreign IDs'); assert.deepEqual(rows, before);
    }
  }
  console.log('PASS legacy bootstrap exports are internal and refuse all studio credit, project and asset writes/replays without reading private records');
  signedIn = true; rows.users[0].status = 'disabled'; reads = [];
  await assert.rejects(account.current.handler(ctx, {}), /disabled/);
  assert(!reads.some(([operation, table]) => operation === 'query' && ['members', 'studioMembers', 'studios'].includes(table)), 'disabled JWT must fail before studio/membership reads');
  await assert.rejects(account.ensureAccount.handler(ctx, { name: 'Self recovery' }), /disabled/); assert.equal(writes, 0);
  console.log('PASS retained disabled JWT cannot read account/studio data or self-provision/reactivate');
  signedIn = false; reads = []; await assert.rejects(account.current.handler(ctx, {}), /UNAUTHENTICATED/); assert.equal(reads.length, 0);
  signedIn = true; rows.users[0].status = 'active'; const result = await account.current.handler(ctx, {});
  assert.equal(result.user._id, 'owner'); assert.equal(result.studio._id, 'studio'); assert.equal(result.role, 'owner'); assert.equal(result.studio.credits, 7); assert.equal(writes, 0);
  actor = 'unknown'; const missing = await account.current.handler(ctx, {}); assert.equal(missing.user, null); assert.equal(missing.studio, null);
  console.log('PASS anonymous reads deny before data access while enabled and unprovisioned account behavior stays compatible');
  console.log('Legacy bootstrap/account security: PASS (3); actual registered handlers with isolated in-memory reads only; no database/provider calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
