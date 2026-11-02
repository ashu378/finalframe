const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const filename = path.join(root, 'convex/platformAdministrationVerification.ts');
const mod = new Module(filename, module);
mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
const runId = 'd7053699-77d5-4cb6-8858-54d74c2ba0de';
const marker = `finalframe-platform-authorization-v1:${runId}`;
const args = { fixtureKey: 'unit-only-not-a-deployment-key', runId };
let writes = 0; let sequence = 0; let delegatedCreate = 0; let delegatedDelete = 0;
const tables = Object.fromEntries(['users', 'studios', 'members', 'studioMembers', 'projects', 'projectMembers', 'platformRoles', 'assets', 'videoModelCatalog', 'audit', 'moderationReports'].map((name) => [name, []]));
const db = {
  get: async (id) => Object.values(tables).flat().find((row) => row._id === id) ?? null,
  insert: async (table, fields) => { writes++; const id = `${table}-${++sequence}`; tables[table].push({ _id: id, _creationTime: Date.now(), ...structuredClone(fields) }); return id; },
  patch: async (id, fields) => { writes++; const row = await db.get(id); assert(row); for (const [key, value] of Object.entries(fields)) { if (value === undefined) delete row[key]; else row[key] = structuredClone(value); } },
  query: (table) => {
    let rows = tables[table];
    const query = {
      withIndex: (_index, select) => { if (select) { const predicates = []; const selector = { eq: (field, value) => { predicates.push((row) => row[field] === value); return selector; }, gte: (field, value) => { predicates.push((row) => row[field] >= value); return selector; } }; select(selector); rows = rows.filter((row) => predicates.every((predicate) => predicate(row))); } return query; },
      unique: async () => { assert(rows.length <= 1); return rows[0] ?? null; },
      take: async (limit) => { assert(limit <= 501); return rows.slice(0, limit); },
    }; return query;
  },
};
const ctx = { db, auth: { getUserIdentity: async () => { throw new Error('Internal fixture calls have no caller identity'); } } };
const normal = mod.require.bind(mod);
mod.require = (name) => {
  if (name === './_generated/server') return { internalMutation: (value) => value, internalQuery: (value) => value };
  if (name === './projects') return {
    createProjectForMember: async (ownerCtx, fields, options) => {
      delegatedCreate++;
      const identity = await ownerCtx.auth.getUserIdentity(); assert.equal(identity.subject, `${marker}:owner`);
      const owner = tables.users.find((row) => row.externalId === identity.subject);
      assert(owner); assert(tables.members.some((row) => row.userId === owner._id && row.role === 'owner'));
      const projectId = await db.insert('projects', { name: fields.name, externalId: options.externalId, metadata: options.metadata, ownerUserId: owner._id, createdByUserId: owner._id, status: 'DRAFT' });
      await db.insert('projectMembers', { projectId, userId: owner._id, role: 'OWNER', status: 'ACTIVE' });
      return { projectId };
    },
    softDeleteProject: async (ownerCtx, id) => { delegatedDelete++; const identity = await ownerCtx.auth.getUserIdentity(); assert.equal(identity.subject, `${marker}:owner`); const project = await db.get(id); const owner = tables.users.find((row) => row.externalId === identity.subject); assert.equal(project.ownerUserId, owner._id); assert.equal(owner.status, 'active'); assert.equal(project.moderationStatus ?? 'CLEAR', 'CLEAR'); await db.patch(id, { status: 'DELETED', deletedAt: Date.now() }); },
  };
  return normal(name);
};
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const fixture = mod.exports;
const call = (name, input = args) => fixture[name].handler(ctx, input);
const envKeys = ['FINALFRAME_DEV_FIXTURES', 'FINALFRAME_DEV_FIXTURE_ENV', 'FINALFRAME_DEV_FIXTURE_KEY'];
const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
(async () => {
  try {
    delete process.env.FINALFRAME_DEV_FIXTURES;
    await assert.rejects(call('seed'), /disabled/); assert.equal(writes, 0);
    process.env.FINALFRAME_DEV_FIXTURES = 'true'; process.env.FINALFRAME_DEV_FIXTURE_ENV = 'production'; process.env.FINALFRAME_DEV_FIXTURE_KEY = args.fixtureKey;
    await assert.rejects(call('seed'), /disabled/); assert.equal(writes, 0);
    process.env.FINALFRAME_DEV_FIXTURE_ENV = 'development';
    for (const name of ['seed', 'snapshot', 'cleanup']) {
      await assert.rejects(call(name, { ...args, fixtureKey: 'wrong-key' }), /disabled/);
      await assert.rejects(call(name, { ...args, runId: '../not-a-marker' }), /UUID/);
    }
    assert.equal(writes, 0);
    tables.platformRoles.push({ _id: 'real-admin-grant', userId: 'real-admin', role: 'ADMIN', status: 'ACTIVE' });
    await assert.rejects(call('seed'), /before the first real administrator/); assert.equal(writes, 0);
    tables.platformRoles.length = 0;
    const ordinary = { _id: 'real-user', externalId: 'real-user', status: 'active', metadata: {} };
    tables.users.push(ordinary);
    const seeded = await call('seed'); assert.equal(seeded.marker, marker); assert.equal(delegatedCreate, 2);
    assert.equal(tables.platformRoles.length, 3); assert.equal(tables.projectMembers.length, 2);
    assert(!tables.audit.some((row) => row.action === 'PLATFORM_ADMIN_BOOTSTRAPPED'));
    const afterSeed = writes;
    await assert.rejects(call('seed'), /already exists/); assert.equal(writes, afterSeed);
    const main = await db.get(seeded.projectId); main.moderationStatus = 'RESTRICTED';
    const owner = await db.get(seeded.actors.owner.userId); owner.status = 'disabled';
    const reportId = await db.insert('moderationReports', { projectId: main._id, reporterUserId: owner._id, status: 'OPEN' });
    const auditCount = tables.audit.length;
    const result = await call('cleanup'); assert.equal(result.rolesRevoked, 3); assert.equal(result.usersDisabled, 5); assert.equal(result.projectsDeleted, 2); assert.equal(result.reportsClosed, 1); assert.equal(delegatedDelete, 2);
    assert(tables.platformRoles.every((row) => row.status === 'REVOKED'));
    assert(tables.users.filter((row) => row !== ordinary).every((row) => row.status === 'disabled'));
    assert.equal(ordinary.status, 'active'); assert.equal(tables.videoModelCatalog[0].available, false);
    assert.equal((await db.get(reportId)).status, 'DISMISSED'); assert.equal(tables.audit.length, auditCount + 1);
    const snapshot = await call('snapshot'); assert(snapshot.projects.every((row) => row.status === 'DELETED')); assert(snapshot.audit.some((row) => row.action === 'DEV_PLATFORM_FIXTURE_CLEANED'));
    // An exact external ID alone is insufficient to target a record.
    owner.metadata.fixtureMarker = 'another-run'; const beforeCollision = writes;
    await assert.rejects(call('cleanup'), /non-fixture account/); assert.equal(writes, beforeCollision);
    owner.metadata.fixtureMarker = marker;
    main.metadata.fixtureMarker = 'another-run';
    await assert.rejects(call('snapshot'), /non-fixture project/);
    console.log('PASS platform fixture gates, real-admin refusal, canonical delegation, bounded snapshots, cleanup and marker collision guards (no DB/provider calls)');
  } finally { for (const key of envKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
})().catch((error) => { console.error(error); process.exitCode = 1; });
