const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');

const root = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(root, 'convex/schema.ts'), 'utf8');
const source = fs.readFileSync(path.join(root, 'convex/resourceStates.ts'), 'utf8');

assert.match(schema, /resourceStates: defineTable/);
assert.match(schema, /state: resourceState/);
assert.match(schema, /\.index\("by_project_resource", \["projectId", "resourceType", "resourceId"\]\)/);
assert.match(schema, /\.index\("by_production", \["productionId"\]\)/);
for (const state of ['DRAFT', 'IN_REVIEW', 'APPROVED', 'LOCKED', 'REVISION_REQUESTED']) {
  assert.match(schema, new RegExp(String.raw`v\.literal\("${state}"\)`));
  assert.match(source, new RegExp(`"${state}"`));
}
for (const helper of ['getResourceState', 'ensureResourceState', 'requireEditable', 'requireApproved', 'requireLocked', 'canTransitionResourceState', 'assertResourceStateTransition']) {
  assert.match(source, new RegExp(`export (?:async )?function ${helper}`));
}
assert.match(source, /requireProjectRole\(ctx, projectId, \["OWNER", "EDITOR"\]\)/);
assert.match(source, /const currentState = state\?\.state \?\? "DRAFT"/);
assert.match(source, /state: "DRAFT"/);

const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-resource-states-')), 'resourceStates.cjs');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  fileName: path.join(root, 'convex/resourceStates.ts'),
}).outputText;
fs.writeFileSync(outputPath, transpiled, 'utf8');

const originalLoad = Module._load;
const calls = [];
Module._load = function load(request, parent, isMain) {
  if (request === 'convex/values') {
    return { v: { union: (...values) => values, literal: (value) => value, id: (value) => value, optional: (value) => value, string: () => 'string' } };
  }
  if (request === './_generated/server') return { query: (definition) => definition, mutation: (definition) => definition };
  if (request === './authorization') {
    return {
      requireProjectAccess: async () => ({ projectRole: 'OWNER' }),
      requireProjectRole: async (_ctx, _projectId, roles) => { calls.push(roles); return { projectRole: 'OWNER' }; },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let resourceStates;
try {
  resourceStates = require(outputPath);
} finally {
  Module._load = originalLoad;
}

assert.equal(resourceStates.canTransitionResourceState('DRAFT', 'IN_REVIEW'), true);
assert.equal(resourceStates.canTransitionResourceState('APPROVED', 'LOCKED'), true);
assert.equal(resourceStates.canTransitionResourceState('LOCKED', 'REVISION_REQUESTED'), true);
assert.equal(resourceStates.canTransitionResourceState('LOCKED', 'DRAFT'), false);
assert.throws(() => resourceStates.assertResourceStateTransition('LOCKED', 'DRAFT'), /Invalid resource state transition/);
assert.equal(resourceStates.isResourceEditable('DRAFT'), true);
assert.equal(resourceStates.isResourceEditable('APPROVED'), false);
assert.equal(resourceStates.isResourceApproved('LOCKED'), true);
assert.equal(resourceStates.isResourceLocked('APPROVED'), false);

function fakeContext(state) {
  let inserted;
  return {
    inserted: () => inserted,
    db: {
      query: () => ({ withIndex: () => ({ unique: async () => state }) }),
      insert: async (_table, value) => { inserted = value; return 'resource-state-id'; },
      get: async () => inserted,
    },
  };
}

(async () => {
  const missingStateContext = fakeContext(null);
  const created = resourceStates.ensureResourceState(missingStateContext, {
    projectId: 'project-1',
    resourceType: 'scene',
    resourceId: 'scene-1',
  });
  assert.ok(created instanceof Promise, 'ensureResourceState must be asynchronous');
  const state = await created;
  assert.equal(state.state, 'DRAFT');
  assert.deepEqual(calls.at(-1), ['OWNER', 'EDITOR']);
  const defaultRead = await resourceStates.get.handler(fakeContext(null), {
    projectId: 'project-1',
    resourceType: 'scene',
    resourceId: 'scene-missing',
  });
  assert.equal(defaultRead.state, 'DRAFT');
  assert.equal(defaultRead.resourceState, null);
  const approvedContext = fakeContext({ state: 'APPROVED' });
  await assert.rejects(
    resourceStates.requireEditable(approvedContext, 'project-1', 'scene', 'scene-1'),
    /approved and cannot be edited/,
  );
  console.log('Resource-state transition, default-state, and guard contract checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
