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
for (const route of ['page.tsx', 'blueprint/page.tsx', 'production/page.tsx', 'workspace/page.tsx', 'workspace/[section]/page.tsx']) {
    assert.match(fs.readFileSync(path.join(root, 'src/app/(dashboard)/dashboard/projects/[id]', route), 'utf8'), /decodeProjectRouteId\(routeId\)/, route);
}
// The editor route is now a redirect into the canonical workspace. Exercise
// its actual boundary rather than depending on a local variable's spelling.
const editorFilename = path.join(root, 'src/app/(dashboard)/dashboard/projects/[id]/editor/page.tsx');
const editorModule = new Module(editorFilename, module);
let authenticated = true;
let redirects = 0;
editorModule.require = id => {
    if (id === '@/lib/project/route-id') return { decodeProjectRouteId: decode };
    if (id === '@/lib/guards') return { requireAuth: async () => { if (!authenticated) throw new Error('AUTH_REQUIRED'); } };
    if (id === 'next/navigation') return { redirect: location => { redirects++; throw Object.assign(new Error('REDIRECT'), { location }); } };
    throw new Error(`Unexpected editor route dependency: ${id}`);
};
editorModule._compile(ts.transpileModule(fs.readFileSync(editorFilename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, editorFilename);
(async () => {
    for (const [id, searchParams, expected] of [
        ['project_owner%7Csubject_123', {}, '/dashboard/projects/project_owner%7Csubject_123/workspace/edit'],
        ['project_owner|subject_123', {}, '/dashboard/projects/project_owner%7Csubject_123/workspace/edit'],
        ['project_%257C', {}, '/dashboard/projects/project_%257C/workspace/edit'],
        ['project_%broken', { production: 'take & scene/1' }, '/dashboard/projects/project_%25broken/workspace/edit?production=take+%26+scene%2F1'],
    ]) {
        await assert.rejects(editorModule.exports.default({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) }), error => error.message === 'REDIRECT' && error.location === expected);
    }
    authenticated = false;
    const previousRedirects = redirects;
    await assert.rejects(editorModule.exports.default({ params: Promise.resolve({ id: 'private-project' }), searchParams: Promise.resolve({}) }), /AUTH_REQUIRED/);
    assert.equal(redirects, previousRedirects, 'Unauthenticated requests cannot enter the editor redirect');
    console.log('Project route regression: decode boundaries, actual authenticated editor redirect and preserved selection passed; no provider calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
