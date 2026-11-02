const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');

const root = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(root, 'convex/schema.ts'), 'utf8');
const source = fs.readFileSync(path.join(root, 'convex/scenes.ts'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'src/lib/scene/actions.ts'), 'utf8');
const productions = fs.readFileSync(path.join(root, 'convex/productions.ts'), 'utf8');

for (const field of ['projectId', 'productionVersionId']) {
  assert.match(schema, new RegExp(`sequences:[\\s\\S]*${field}: v\\.optional`));
  assert.match(schema, new RegExp(`scenes:[\\s\\S]*${field}: v\\.optional`));
  assert.match(schema, new RegExp(`shots:[\\s\\S]*${field}: v\\.optional`));
  assert.match(schema, new RegExp(`shotVersions:[\\s\\S]*${field}: v\\.optional`));
}
for (const index of ['by_project', 'by_version', 'by_order']) assert.match(schema, new RegExp(`\\.index\\("${index}"`));
for (const operation of [
  'createSequence', 'updateSequence', 'reorderSequences', 'duplicateSequence', 'archiveSequence', 'deleteSequence',
  'createScene', 'updateScene', 'reorderScenes', 'duplicateScene', 'archiveScene', 'deleteScene',
  'createShot', 'updateShot', 'reorderShots', 'duplicateShot', 'archiveShot', 'deleteShot',
  'createTake', 'updateTake', 'archiveTake', 'deleteTake',
]) assert.match(source, new RegExp(`export const ${operation} = mutation`));
assert.match(source, /Approved production snapshots are immutable/);
assert.match(source, /requireEditable\(ctx, projectId, resourceType, resourceId\)/);
assert.match(source, /ensureResourceState\(ctx, \{ projectId, productionId, resourceType, resourceId \}\)/);
assert.match(source, /asset\.projectId !== production\.projectId/);
assert.match(source, /versionNumber: Math\.max\(0, \.\.\.takes\.map\(\(take\) => take\.versionNumber\)\) \+ 1/);
assert.match(productions, /const workspaceVersionId = draftVersion\?\.status === "DRAFT" \? draftVersion\._id : production\.currentVersionId \?\? draftVersion\?\._id/);
assert.match(actions, /api\.scenes\.createScene/);
assert.match(actions, /api\.scenes\.updateScene/);
assert.match(actions, /api\.scenes\.reorderScenes/);
assert.match(actions, /api\.scenes\.deleteScene/);

const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-graph-crud-')), 'scenes.cjs');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  fileName: path.join(root, 'convex/scenes.ts'),
}).outputText;
fs.writeFileSync(outputPath, transpiled, 'utf8');
// Load the actual continuity helper and its pure policy dependency. Keeping
// these production modules in the harness avoids bypassing new guards.
for (const name of ['generationContinuity', 'generationWorkerContracts']) {
  const file = path.join(root, 'convex', name + '.ts');
  fs.writeFileSync(path.join(path.dirname(outputPath), name + '.js'), ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: file,
  }).outputText);
}

const rows = new Map();
let nextId = 1;
const states = new Map();
const project = { _id: 'project-1', studioExternalId: 'studio-1' };
const production = { _id: 'production-1', projectId: 'project-1', studioExternalId: 'studio-1' };
const version = { _id: 'version-1', productionId: 'production-1', status: 'DRAFT', versionNumber: 1 };
rows.set(project._id, project);
rows.set(production._id, production);
rows.set(version._id, version);

function tableForId(id) {
  for (const [table, values] of rowsByTable.entries()) if (values.has(id)) return table;
  return undefined;
}

const rowsByTable = new Map([
  ['projects', new Map([[project._id, project]])],
  ['productions', new Map([[production._id, production]])],
  ['productionVersions', new Map([[version._id, version]])],
  ['sequences', new Map()],
  ['scenes', new Map()],
  ['shots', new Map()],
  ['shotVersions', new Map()],
  ['assets', new Map([
    ['asset-project', { _id: 'asset-project', projectId: 'project-1', scope: 'PROJECT', externalId: 'asset-project' }],
    ['asset-foreign', { _id: 'asset-foreign', projectId: 'project-2', scope: 'PROJECT', externalId: 'asset-foreign' }],
    ['asset-global', { _id: 'asset-global', scope: 'GLOBAL', externalId: 'asset-global' }],
  ])],
  ['resourceStates', new Map()],
]);

function db() {
  return {
    get: async (id) => {
      const table = tableForId(id);
      return table ? rowsByTable.get(table).get(id) ?? null : null;
    },
    insert: async (table, value) => {
      const id = `${table}-${nextId++}`;
      const row = { ...value, _id: id, _creationTime: nextId };
      rowsByTable.get(table).set(id, row);
      return id;
    },
    patch: async (id, patch) => {
      const table = tableForId(id);
      if (!table) throw new Error(`Unknown row ${id}`);
      rowsByTable.get(table).set(id, { ...rowsByTable.get(table).get(id), ...patch });
    },
    query: (table) => ({
      withIndex: (_index, callback) => {
        const constraints = {};
        const builder = { eq: (field, value) => { constraints[field] = value; return builder; } };
        callback(builder);
        const values = [...rowsByTable.get(table).values()].filter((row) => Object.entries(constraints).every(([field, value]) => row[field] === value));
        return {
          collect: async () => values,
          first: async () => values[0] ?? null,
          unique: async () => values.length > 1 ? (() => { throw new Error('Expected a unique row'); })() : values[0] ?? null,
        };
      },
    }),
  };
}

const calls = [];
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'convex/values') {
    return { v: { union: (...values) => values, literal: (value) => value, id: (value) => value, optional: (value) => value, string: () => 'string', number: () => 'number', any: () => 'any', array: (value) => [value] } };
  }
  if (request === './_generated/server') return { query: (definition) => definition, mutation: (definition) => definition };
  if (request === './authorization') {
    return {
      requireProjectAccess: async (_ctx, projectId) => {
        const found = rowsByTable.get('projects').get(projectId);
        if (!found || found._id !== 'project-1') throw new Error('PROJECT_ACCESS_DENIED');
        return { project: found, projectRole: 'OWNER' };
      },
      requireProjectRole: async (_ctx, projectId, allowed) => {
        const found = rowsByTable.get('projects').get(projectId);
        if (!found || found._id !== 'project-1' || !allowed.includes('OWNER')) throw new Error('PROJECT_ACCESS_DENIED');
        return { project: found, projectRole: 'OWNER' };
      },
    };
  }
  if (request === './resourceStates') {
    return {
      requireEditable: async (_ctx, projectId, resourceType, resourceId) => {
        if (projectId !== 'project-1') throw new Error('PROJECT_ACCESS_DENIED');
        const current = states.get(`${resourceType}:${resourceId}`);
        if (current === 'LOCKED' || current === 'APPROVED') throw new Error('Resource is locked and cannot be edited');
        calls.push(['editable', resourceType, resourceId]);
        return { currentState: current || 'DRAFT', state: current ? { state: current } : null };
      },
      ensureResourceState: async (_ctx, args) => {
        const key = `${args.resourceType}:${args.resourceId}`;
        if (!states.has(key)) states.set(key, 'DRAFT');
        calls.push(['ensure', args.resourceType, args.resourceId]);
        return { state: states.get(key) };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let scenes;
try {
  scenes = require(outputPath);
} finally {
  Module._load = originalLoad;
}

const ctx = { db: db() };

(async () => {
  const createdSequence = await scenes.createSequence.handler(ctx, {
    productionId: production._id, productionVersionId: version._id, title: 'Act One', description: 'Opening act',
  });
  assert.equal(createdSequence.title, 'Act One');
  assert.equal(states.get(`sequence:${createdSequence._id}`), 'DRAFT');

  const createdScene = await scenes.createScene.handler(ctx, {
    sequenceId: createdSequence._id, title: 'Opening', purpose: 'Introduce the world', visualDirection: 'Warm wide shot',
  });
  const createdShot = await scenes.createShot.handler(ctx, {
    sceneId: createdScene._id, title: 'Establishing shot', prompt: 'A warm opening frame', durationSeconds: 4,
  });
  assert.equal(createdShot.status, 'DRAFT');
  await assert.rejects(
    scenes.createShot.handler(ctx, { sceneId: createdScene._id, title: 'Foreign asset', prompt: 'Should fail', durationSeconds: 2, requiredAssetIds: ['asset-foreign'] }),
    /same project/,
  );
  await assert.rejects(
    scenes.createShot.handler(ctx, { sceneId: createdScene._id, title: 'Global asset', prompt: 'Should fail', durationSeconds: 2, requiredAssetIds: ['asset-global'] }),
    /imported into the same project/,
  );

  const firstTake = await scenes.createTake.handler(ctx, { shotId: createdShot._id, provider: 'fixture' });
  const secondTake = await scenes.createTake.handler(ctx, { shotId: createdShot._id, provider: 'fixture' });
  assert.equal(firstTake.versionNumber, 1);
  assert.equal(secondTake.versionNumber, 2);
  assert.equal(secondTake.shotId, createdShot._id);

  const duplicatedScene = await scenes.duplicateScene.handler(ctx, { sceneId: createdScene._id, title: 'Opening copy' });
  assert.equal(duplicatedScene.title, 'Opening copy');
  const duplicatedShot = [...rowsByTable.get('shots').values()].find((row) => row.sceneId === duplicatedScene._id);
  assert.ok(duplicatedShot, 'duplicating a scene must duplicate its shots');
  const duplicatedTakes = [...rowsByTable.get('shotVersions').values()].filter((row) => row.shotId === duplicatedShot._id);
  assert.equal(duplicatedTakes.length, 2, 'duplicating a scene must preserve take history as new draft takes');

  await scenes.deleteShot.handler(ctx, { shotId: createdShot._id });
  assert.equal((await ctx.db.get(createdShot._id)).status, 'DELETED', 'delete must retain the shot row');
  assert.equal((await ctx.db.get(firstTake._id)).status, 'DELETED', 'deleting a shot must retain and soft-delete its takes');
  assert.equal((await ctx.db.get(secondTake._id)).status, 'DELETED', 'deleting a shot must soft-delete every take');

  states.set(`scene:${createdScene._id}`, 'LOCKED');
  await assert.rejects(
    scenes.updateScene.handler(ctx, { sceneId: createdScene._id, title: 'Should fail' }),
    /cannot be edited/,
  );

  version.status = 'APPROVED';
  await assert.rejects(
    scenes.createScene.handler(ctx, { sequenceId: createdSequence._id, title: 'Blocked', purpose: 'Blocked', visualDirection: 'Blocked' }),
    /immutable/,
  );

  const foreignScene = { ...createdScene, _id: 'scene-foreign', projectId: 'project-2' };
  rowsByTable.get('scenes').set(foreignScene._id, foreignScene);
  await assert.rejects(scenes.getScene.handler(ctx, { sceneId: foreignScene._id }), /does not belong to this project|PROJECT_ACCESS_DENIED/);

  assert.ok(calls.some(([kind]) => kind === 'editable'));
  assert.ok(calls.some(([kind]) => kind === 'ensure'));
  console.log('Production graph CRUD, isolation, state-guard, soft-delete, and take-version contract checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
