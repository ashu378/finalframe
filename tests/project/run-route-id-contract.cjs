const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const filename = path.join(root, 'src/lib/project/route-id.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const decode = compiled.exports.decodeProjectRouteId;
assert.equal(decode('project_owner%7Csubject_123'), 'project_owner|subject_123');
assert.equal(decode('project_owner|subject_123'), 'project_owner|subject_123');
assert.equal(decode('plain-project-id'), 'plain-project-id');
assert.equal(decode('project_%257C'), 'project_%7C', 'Decode exactly once');
assert.equal(decode('project_%broken'), 'project_%broken', 'Malformed URI does not crash');
for (const route of ['page.tsx', 'blueprint/page.tsx', 'production/page.tsx', 'editor/page.tsx', 'workspace/page.tsx', 'workspace/[section]/page.tsx']) {
    assert.match(fs.readFileSync(path.join(root, 'src/app/(dashboard)/dashboard/projects/[id]', route), 'utf8'), /decodeProjectRouteId\(routeId\)/, route);
}
console.log('Project route regression: 11 checks passed; no provider calls.');
