const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const schema = read('convex/schema.ts');
const productions = read('convex/productions.ts');
const legacyPlanning = read('convex/planning.ts');
const productionActions = read('src/lib/production/actions.ts');
const sceneActions = read('src/lib/scene/actions.ts');
const productionGraph = read('convex/productionGraph.ts');
const devFixtures = read('convex/devFixtures.ts');

assert.match(schema, /directorPlans:[\s\S]*idempotencyKey: v\.optional\(v\.string\(\)\)/);
assert.match(schema, /directorPlans:[\s\S]*\.index\("by_idempotency", \["idempotencyKey"\]\)/);
assert.match(schema, /productionVersions:[\s\S]*snapshot: v\.optional\(json\)/);
assert.match(schema, /productionVersions:[\s\S]*\.index\("by_source_plan", \["sourcePlanId"\]\)/);
assert.match(schema, /productionVersions:[\s\S]*\.index\("by_idempotency", \["idempotencyKey"\]\)/);
assert.match(schema, /productions:[\s\S]*projectType: v\.optional\(v\.string\(\)\)/);
assert.match(schema, /productions:[\s\S]*plannedDurationSeconds: v\.optional\(v\.number\(\)\)/);

assert.match(productions, /export const createPlan = mutation/);
assert.match(productions, /export const approvePlan = mutation/);
assert.match(productions, /status: "DRAFT"/);
assert.match(productions, /status: "APPROVED"/);
assert.match(productions, /snapshot: plan\.plan/);
assert.match(productions, /withIndex\("by_source_plan"/);
assert.match(productions, /approvedByUserId/);
assert.match(productions, /productionVersionId: version\._id/);
assert.match(productions, /draftVersion\?\.status === "DRAFT" \? draftVersion\._id : production\.currentVersionId/);
assert.match(productions, /draftSnapshot/);
assert.doesNotMatch(productions, /currentVersionId: version\?\._id, status: "PLANNING"/);
assert.match(productionGraph, /Editable planning snapshot/);
assert.match(productionGraph, /Immutable approved production snapshot/);

assert.match(legacyPlanning, /Legacy planning compatibility surface/);
assert.match(legacyPlanning, /LEGACY_PLANNING_READ_ONLY/);
for (const mutationName of ['createIntent', 'createPlan', 'revisePlan', 'approvePlan']) {
  assert.match(legacyPlanning, new RegExp(`export const ${mutationName} = mutation`));
}
assert.doesNotMatch(legacyPlanning, /ctx\.db\.(insert|patch|delete)\s*\(/);
assert.match(legacyPlanning, /export const getIntent = query/);
assert.match(legacyPlanning, /export const listIntents = query/);
assert.match(legacyPlanning, /export const getPlan = query/);
assert.match(legacyPlanning, /export const listPlans = query/);

assert.match(productionActions, /api\.productions\.createPlan/);
assert.match(productionActions, /api\.productions\.approvePlan/);
assert.doesNotMatch(productionActions, /api\.planning\./);
assert.match(sceneActions, /api\.productions\.createPlan/);
assert.match(sceneActions, /api\.productions\.approvePlan/);
assert.doesNotMatch(sceneActions, /api\.planning\./);

function walk(directory) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(relative));
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) result.push(relative);
  }
  return result;
}

const allSource = [...walk('convex'), ...walk('src')].filter((relative) => !relative.includes(`${path.sep}_generated${path.sep}`));
const activeLegacyCallers = allSource.filter((relative) => /api\.planning\./.test(read(relative)));
assert.deepEqual(activeLegacyCallers, [], 'active application code must not call the legacy planning API');

const versionWriters = allSource.filter((relative) => /ctx\.db\.(insert|patch|delete)\s*\(\s*["']productionVersions["']/.test(read(relative)));
assert.deepEqual(versionWriters, ['convex/devFixtures.ts', 'convex/productions.ts'], 'only canonical production mutations and the guarded fixture seeder may write productionVersions');
assert.match(devFixtures, /FINALFRAME_DEV_FIXTURES !== "true"/);
assert.match(devFixtures, /FINALFRAME_DEV_FIXTURE_ENV !== "development"/);
assert.match(devFixtures, /FINALFRAME_DEV_FIXTURE_KEY/);

console.log('Canonical planning migration contract checks passed.');
