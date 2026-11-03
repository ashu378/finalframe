// Actual server page/read helpers, isolated routing and canonical-client seams.
// No database, browser, provider, rendering, or network calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { getFunctionName } = require('convex/server');
const root = path.resolve(__dirname, '../..');
function load(file, stubs = {}) {
  const filename = path.join(root, file), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod);
  mod.require = name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith('@/components/') || name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (name.endsWith('.css')) return {};
    return normal(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}
const routeId = load('src/lib/project/route-id.ts');
const projectId = 'project_owner|fixture';
const fixtureProject = { id: projectId, name: 'Original fixture', state: 'draft', project_description: 'Technical fixture' };
const route = 'src/app/(dashboard)/dashboard/projects/[id]/page.tsx';
function pages(options = [], { signedIn = true, navigationMissing = false, episode = false } = {}) {
  const calls = [];
  const navigation = navigationMissing ? null : { options: options.map(productionId => ({ productionId, ...(episode ? { episodeId: 'episode' } : {}) })), nextEpisodeNumber: 1 };
  const stubs = {
    'next/navigation': { redirect: location => { throw Object.assign(new Error('REDIRECT'), { location }); }, notFound: () => { throw new Error('NOT_FOUND'); } },
    'next/link': () => null,
    '@/lib/project/route-id': routeId,
    '@/lib/guards': { requireAuth: async () => { calls.push(['auth']); if (!signedIn) throw new Error('AUTH_REQUIRED'); } },
    '@/lib/production/episode-actions': { getEpisodeNavigation: async id => { calls.push(['navigation', id]); return navigation; } },
    '@/lib/project/actions': { getProjectById: async id => { calls.push(['project', id]); return { success: true, project: fixtureProject }; } },
    '@/lib/scene/actions': { getScenesForProject: async (...args) => { calls.push(['scenes', ...args]); return { success: true, scenes: [] }; } },
    '@/lib/render/actions': { getRenderJobs: async id => { calls.push(['jobs', id]); return { success: true, jobs: [] }; } },
    '@/lib/production/actions': { getProductionWorkspace: async (...args) => { calls.push(['workspace', ...args]); return { success: true, production: null }; } },
    '@/lib/project/state-machine': { STATE_LABELS: { draft: 'Draft' }, STATE_DESCRIPTIONS: {}, canEdit: () => true },
    '@/lib/assets/actions': { getProjectAssets: async id => { calls.push(['assets', id]); return []; } },
    '@/lib/utils': { cn: () => '' },
  };
  return { calls, page: load(route, stubs).default, blueprint: load('src/app/(dashboard)/dashboard/projects/[id]/blueprint/page.tsx', stubs).default };
}
const props = (selection = {}) => ({ params: Promise.resolve({ id: encodeURIComponent(projectId) }), searchParams: Promise.resolve(selection) });
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
(async () => {
  await check('multi-production project redirects to existing picker before every generic loader', async () => {
    const s = pages(['one', 'two', 'three', 'four']);
    await assert.rejects(s.page(props()), error => error.location === '/dashboard/projects/project_owner%7Cfixture/workspace/overview');
    assert.deepEqual(s.calls, [['auth'], ['navigation', projectId]]);
  });
  await check('explicit canonical production survives root redirect; no first-production fallback', async () => {
    const s = pages(['one', 'two']);
    await assert.rejects(s.page(props({ production: 'two' })), error => error.location === '/dashboard/projects/project_owner%7Cfixture/workspace/overview?production=two');
    assert.equal(s.calls.length, 2);
    const sole = pages(['one']);
    await assert.rejects(sole.page(props()), error => error.location.endsWith('/workspace/overview') && !error.location.includes('production='));
    assert.equal(sole.calls.length, 2);
  });
  await check('foreign/unknown selection, unavailable project and missing session deny before generic reads', async () => {
    for (const s of [pages(['one']), pages([])]) {
      await assert.rejects(s.page(props({ production: 'foreign' })), /NOT_FOUND/);
      assert.equal(s.calls.length, 2);
    }
    const missing = pages([], { navigationMissing: true }); await assert.rejects(missing.page(props()), /NOT_FOUND/); assert.equal(missing.calls.length, 2);
    const anonymous = pages([], { signedIn: false }); await assert.rejects(anonymous.page(props()), /AUTH_REQUIRED/); assert.deepEqual(anonymous.calls, [['auth']]);
  });
  await check('zero-production legacy project still renders its normal project/scene/job read view', async () => {
    const s = pages([]), tree = await s.page(props()); assert(tree);
    for (const name of ['project', 'scenes', 'jobs', 'workspace']) assert(s.calls.some(call => call[0] === name));
    assert.equal(s.calls.filter(call => call[0] === 'scenes').length, 1);
  });
  await check('legacy blueprint read forwards its validated production; ambiguous selection shows picker without reads', async () => {
    const selected = pages(['one']); assert(await selected.blueprint(props({ production: 'one' })));
    assert.deepEqual(selected.calls.find(call => call[0] === 'scenes'), ['scenes', projectId, 'one']);
    const multiple = pages(['one', 'two']); assert(await multiple.blueprint(props()));
    assert.deepEqual(multiple.calls, [['auth'], ['navigation', projectId]]);
  });
  await check('actual scene read forwards exact selected ID, preserves default and never writes', async () => {
    const api = require(path.join(root, 'convex/_generated/api.js')).api;
    const calls = [], logs = []; let writes = 0;
    const client = {
      query: async (ref, args) => {
        const name = getFunctionName(ref); calls.push({ name, args });
        if (name === 'account:current') return { studio: { externalId: 'studio' } };
        if (name === 'projects:list') return [{ _id: 'project', externalId: projectId }];
        assert.equal(name, 'productions:getWorkspaceByProject');
        if (args.productionId === 'foreign') throw new Error('Sensitive canonical rejection details');
        return { sequences: [{ scenes: [{ _id: 'scene-' + (args.productionId ?? 'default'), title: 'Owned scene', purpose: 'Original fixture', visualDirection: 'Literal scene', orderIndex: 0 }] }] };
      },
      mutation: async () => { writes++; throw new Error('No scene mutation allowed in read test'); },
    };
    const actions = load('src/lib/scene/actions.ts', { 'next/cache': { revalidatePath: () => { throw new Error('No cache mutation'); } }, '@/lib/convex/server': { getAuthenticatedConvexClient: async () => client }, '../../../convex/_generated/api': { api } });
    const first = await actions.getScenesForProject(projectId, 'two'); assert.equal(first.scenes[0].id, 'scene-two');
    assert.deepEqual(calls.at(-1).args, { projectExternalId: projectId, productionId: 'two' });
    const fallback = await actions.getScenesForProject(projectId); assert.equal(fallback.scenes[0].id, 'scene-default');
    assert.deepEqual(calls.at(-1).args, { projectExternalId: projectId });
    const oldError = console.error; console.error = (...args) => logs.push(args);
    try { assert.equal((await actions.getScenesForProject(projectId, 'foreign')).success, false); } finally { console.error = oldError; }
    assert.deepEqual(logs, [['Convex getScenesForProject failed:', { code: 'SCENES_UNAVAILABLE' }]]);
    assert.equal(writes, 0);
    for (const [name, count] of [['createScene', 3], ['reorderScenes', 2], ['createScenesFromBlueprint', 2]]) assert.equal(actions[name].length, count, 'Scene mutation signatures stay unchanged');
  });
  console.log(`Production selection: ${checks} PASS; actual server routes/read module, isolated canonical client; no DB/network/provider calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
