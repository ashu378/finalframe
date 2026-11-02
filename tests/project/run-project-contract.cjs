const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const schema = read('convex/schema.ts');
const authorization = read('convex/authorization.ts');
const projects = read('convex/projects.ts');
const actions = read('src/lib/project/actions.ts');

assert.match(schema, /projectMembers:\s*defineTable/);
assert.match(schema, /role:\s*projectRole/);
assert.match(schema, /\.index\("by_project_user", \["projectId", "userId"\]\)/);
assert.match(schema, /deletedAt: v\.optional\(timestamp\)/);

assert.match(authorization, /export async function requireCurrentMember/);
assert.match(authorization, /export async function requireProjectAccess/);
assert.match(authorization, /export async function requireProjectRole/);
assert.match(authorization, /migrationFallback/);

for (const mutation of ['export const update', 'export const archive', 'export const restore', 'export const softDelete', 'export const setMember', 'export const removeMember']) {
  assert.match(projects, new RegExp(mutation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(projects, /ctx\.db\.insert\("projectMembers"/);
assert.match(projects, /status: "DELETED"/);
assert.match(projects, /statusBeforeDeletion/);
assert.match(projects, /status: "REMOVED"/);
assert.match(projects, /A project must retain at least one owner/);

assert.match(actions, /api\.projects\.update/);
assert.match(actions, /api\.projects\.archive/);
assert.match(actions, /api\.projects\.softDelete/);
assert.match(actions, /api\.projects\.restore/);
assert.doesNotMatch(actions, /return unsupportedMutation\('Updating a project'\)/);
assert.doesNotMatch(actions, /return unsupportedMutation\('Archiving a project'\)/);

console.log('Project P0-1 contract checks passed.');
