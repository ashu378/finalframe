const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');

const root = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(root, 'convex/schema.ts'), 'utf8');
const approvalsSource = fs.readFileSync(path.join(root, 'convex/approvals.ts'), 'utf8');
const resourceStatesSource = fs.readFileSync(path.join(root, 'convex/resourceStates.ts'), 'utf8');
const assemblySource = fs.readFileSync(path.join(root, 'convex/assembly.ts'), 'utf8');

assert.match(schema, /approvals: defineTable/);
assert.match(schema, /resourceStates: defineTable/);
for (const operation of ['submitForReview', 'approve', 'lock', 'unlock', 'requestRevision', 'history']) {
  assert.match(approvalsSource, new RegExp(`export const ${operation} = (?:mutation|query)`));
}
assert.match(approvalsSource, /decision: args\.decision/);
assert.match(approvalsSource, /Only a locked resource can be unlocked/);
assert.match(approvalsSource, /Unlocking a resource requires a reason/);
assert.match(approvalsSource, /roles: \["OWNER", "EDITOR", "REVIEWER"\]/);
assert.match(approvalsSource, /roles: \["OWNER"\]/);
assert.match(resourceStatesSource, /initialState\?: ResourceState/);
assert.match(resourceStatesSource, /resolveProjectResource/);
assert.match(assemblySource, /requireApprovedResource/);
assert.match(assemblySource, /asset\.projectId !== production\.projectId/);

const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-approval-')), 'approvals.cjs');
fs.writeFileSync(outputPath, ts.transpileModule(approvalsSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  fileName: path.join(root, 'convex/approvals.ts'),
}).outputText, 'utf8');

const state = { current: 'DRAFT' };
const events = [];
let actingRole = 'OWNER';
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'convex/values') {
    return { v: { union: (...values) => values, literal: (value) => value, id: (value) => value, optional: (value) => value, string: () => 'string' } };
  }
  if (request === './_generated/server') return { query: (definition) => definition, mutation: (definition) => definition };
  if (request === './voices') return { validateVoiceForApproval: async () => { throw new Error('Voice lifecycle must use the online voice integration suite.'); } };
  if (request === './reviewLinkContracts') return { isReviewLinkActive: () => { throw new Error('Review links must use the dedicated review policy suite.'); } };
  if (request === './continuityContracts') return { validateBibleBindings: async () => {}, validateProjectResourceReferences: async () => {} };
  if (request === './authorization') {
    return {
      requireProjectAccess: async () => ({ project: { _id: 'project-1', studioExternalId: 'studio-1' }, projectRole: 'OWNER' }),
      requireProjectRole: async (_ctx, _projectId, roles) => {
        if (!roles.includes(actingRole)) throw new Error('PROJECT_ROLE_DENIED');
        return {
        project: { _id: 'project-1', studioExternalId: 'studio-1' }, projectRole: actingRole,
        user: { _id: 'user-1' }, studio: { externalId: 'studio-1', _id: 'studio-1' }, identity: { externalId: 'user-ext' },
        };
      },
    };
  }
  if (request === './resourceStates') {
    const transitions = {
      DRAFT: ['DRAFT', 'IN_REVIEW'],
      IN_REVIEW: ['IN_REVIEW', 'DRAFT', 'APPROVED', 'REVISION_REQUESTED'],
      APPROVED: ['APPROVED', 'LOCKED', 'REVISION_REQUESTED'],
      LOCKED: ['LOCKED', 'REVISION_REQUESTED'],
      REVISION_REQUESTED: ['REVISION_REQUESTED', 'DRAFT', 'IN_REVIEW'],
    };
    return {
      assertResourceStateTransition: (from, to) => { if (!transitions[from].includes(to)) throw new Error(`Invalid resource state transition: ${from} -> ${to}.`); },
      ensureResourceState: async (_ctx, args) => ({ _id: 'resource-state-1', state: state.current, projectId: args.projectId, resourceId: args.resourceId }),
      getEffectiveResourceState: async (_ctx, projectId, _type, resourceId) => {
        if (projectId !== 'project-1' || resourceId === 'foreign') throw new Error('Resource does not belong to this project.');
        return { projectId, productionId: 'production-1', resource: { _id: resourceId }, state: { state: state.current }, currentState: state.current };
      },
      isResourceApproved: (value) => value === 'APPROVED' || value === 'LOCKED',
      isResourceLocked: (value) => value === 'LOCKED',
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let approvals;
try {
  approvals = require(outputPath);
} finally {
  Module._load = originalLoad;
}

const ctx = {
  db: {
    get: async () => ({ state: state.current }),
    patch: async (_id, patch) => { if (patch.state) state.current = patch.state; },
    insert: async (_table, value) => { events.push(value); return `event-${events.length}`; },
    query: () => ({ withIndex: () => ({ collect: async () => events }) }),
  },
};

(async () => {
  await approvals.submitForReview.handler(ctx, { projectId: 'project-1', productionId: 'production-1', resourceType: 'shotVersion', resourceId: 'take-1' });
  assert.equal(state.current, 'IN_REVIEW');
  assert.equal(events.at(-1).decision, 'SUBMITTED');

  await approvals.approve.handler(ctx, { projectId: 'project-1', productionId: 'production-1', resourceType: 'shotVersion', resourceId: 'take-1' });
  assert.equal(state.current, 'APPROVED');
  assert.equal(events.at(-1).decision, 'APPROVED');

  await approvals.lock.handler(ctx, { projectId: 'project-1', productionId: 'production-1', resourceType: 'shotVersion', resourceId: 'take-1' });
  assert.equal(state.current, 'LOCKED');
  assert.equal(events.at(-1).decision, 'LOCKED');

  actingRole = 'EDITOR';
  await assert.rejects(
    approvals.unlock.handler(ctx, { projectId: 'project-1', productionId: 'production-1', resourceType: 'shotVersion', resourceId: 'take-1', reason: 'Editor unlock' }),
    /PROJECT_ROLE_DENIED/,
    'only the owner may unlock a locked resource',
  );

  actingRole = 'OWNER';
  await approvals.unlock.handler(ctx, { projectId: 'project-1', productionId: 'production-1', resourceType: 'shotVersion', resourceId: 'take-1', reason: 'Owner unlock for revision' });
  assert.equal(state.current, 'REVISION_REQUESTED');
  assert.equal(events.at(-1).decision, 'UNLOCKED');
  await approvals.submitForReview.handler(ctx, { projectId: 'project-1', productionId: 'production-1', resourceType: 'shotVersion', resourceId: 'take-1' });
  await approvals.approve.handler(ctx, { projectId: 'project-1', productionId: 'production-1', resourceType: 'shotVersion', resourceId: 'take-1' });
  await approvals.lock.handler(ctx, { projectId: 'project-1', productionId: 'production-1', resourceType: 'shotVersion', resourceId: 'take-1' });
  await approvals.requestRevision.handler(ctx, { projectId: 'project-1', productionId: 'production-1', resourceType: 'shotVersion', resourceId: 'take-1', note: 'Fix continuity' });
  assert.equal(state.current, 'REVISION_REQUESTED');
  assert.equal(events.at(-1).decision, 'REVISION_REQUESTED');
  await assert.rejects(
    approvals.requestRevision.handler(ctx, { projectId: 'project-1', productionId: 'production-1', resourceType: 'shotVersion', resourceId: 'take-1', note: '' }),
    /reason|note/i,
  );
  await assert.rejects(
    approvals.get.handler(ctx, { projectId: 'project-1', productionId: 'production-1', resourceType: 'shotVersion', resourceId: 'foreign' }),
    /project/i,
  );
  console.log('Approval, lock, unlock, revision, role, and immutable-event contract checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
