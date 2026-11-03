const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../..');
function load(file, imports = {}) {
  const filename = path.join(root, file), loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = loaded.require.bind(loaded); loaded.require = id => Object.hasOwn(imports, id) ? imports[id] : normal(id);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return loaded.exports;
}
const helper = load('src/lib/project/lifecycle-presentation.ts');
const Link = ({ href, children, ...props }) => React.createElement('a', { ...props, href }, children);
const DashboardClient = load('src/app/(dashboard)/dashboard/dashboard-client.tsx', {
  'next/link': Link, 'next/image': ({ src, alt }) => React.createElement('img', { src, alt }),
  '@/lib/ui/labels': load('src/lib/ui/labels.ts'), '@/lib/project/lifecycle-presentation': helper,
  '@/components/threeui/ambient': { ThreeUIAmbient: () => null },
}).DashboardClient;
const api = { account: { ensureAccount: 'ensure-account' }, app: { dashboard: 'dashboard' } };
const rows = ['DRAFT', 'APPROVED', 'COMPLETED'].map((status, index) => ({ id: 'canonical-' + index, externalId: 'external-' + index, name: 'Fixture ' + index, description: null, role: 'OWNER', moderationStatus: 'CLEAR', status, createdAt: 1, updatedAt: 2 }));
const stats = { totalProjects: 101, activeJobs: 7, totalAssets: 13, creditsRemaining: 23, summaryLimited: true };
const queryCalls = [], mutationCalls = [], libraryCalls = [];
const client = {
  query: async ref => { queryCalls.push(ref); assert.equal(ref, api.app.dashboard, 'no production/history/progress queries'); return { projects: rows, stats }; },
  mutation: async ref => { mutationCalls.push(ref); assert.equal(ref, api.account.ensureAccount, 'only existing account provisioning'); return {}; },
};
const overview = load('src/lib/dashboard/actions.ts', { '../../../convex/_generated/api': { api }, '@/lib/convex/server': { getAuthenticatedConvexClient: async () => client }, '@/lib/project/lifecycle-presentation': helper });
const guards = { requireAuth: async () => ({ user: { email: 'fixture@example.invalid' } }), getCurrentUserProfile: async () => ({ full_name: 'Fixture creator' }) };
let capturedCards;
const dashboard = load('src/app/(dashboard)/dashboard/page.tsx', {
  '@/lib/guards': guards, '@/lib/project/actions': { getStudioContext: async () => ({ success: true, studioId: 'studio' }) },
  '@/lib/dashboard/actions': overview, '@/lib/project/library-actions': { getProjectLibraryPage: async options => { libraryCalls.push(options); return { page: rows, isDone: false, continueCursor: 'next', scanned: 20 }; } },
  './dashboard-client': { DashboardClient: props => { capturedCards = props.projects; return React.createElement(DashboardClient, props); } },
  '@/../convex/_generated/api': { api }, '@/lib/convex/server': { getAuthenticatedConvexClient: async () => client }, '@/lib/project/lifecycle-presentation': helper,
}).default;
const libraryRequests = [];
let libraryRows = rows;
const library = load('src/app/(dashboard)/dashboard/projects/page.tsx', {
  'next/link': Link, '@/lib/guards': guards,
  '@/lib/project/library-actions': { getProjectLibraryPage: async options => { libraryRequests.push(options); return { page: libraryRows, isDone: false, continueCursor: 'more', scanned: 20 }; } },
  '@/lib/project/library': load('src/lib/project/library.ts'), '@/lib/project/lifecycle-presentation': helper,
  '@/components/project/project-library-controls': { ProjectLibraryControls: () => null },
}).default;
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
async function main() {
  await check('legacy workflow-looking project statuses label lifecycle only, with safe unknown fallback', () => {
    for (const status of ['DRAFT', 'APPROVED', 'COMPLETED', 'RENDERED', 'EXPORTED', 'PROCESSING', 'FAILED', 'CANCELLED', 'blueprint_ready']) {
      const presentation = helper.projectLifecyclePresentation({ status });
      assert.equal(presentation.kind, 'active'); assert.equal(presentation.label, 'Active project');
      assert.doesNotMatch(presentation.description, /ready to share|approved|download|idea in progress|try again/i);
    }
    for (const status of [undefined, null, '', 'NEW_UNKNOWN_STATUS']) assert.equal(helper.projectLifecyclePresentation({ status }).label, 'Open project');
  });
  await check('archive/deletion timestamp precedence and restricted labels preserve accurate page lifecycle counts', () => {
    const input = [{ status: 'APPROVED' }, { status: 'COMPLETED', archivedAt: 0 }, { status: 'ARCHIVED', deletedAt: 0 }, { status: 'new' }, { status: 'DRAFT', moderationStatus: 'RESTRICTED' }];
    assert.deepEqual(helper.countProjectLifecycles(input), { total: 5, active: 2, archived: 1, deleted: 1, unknown: 1 });
    assert.equal(helper.projectLifecyclePresentation(input[1]).label, 'Archived');
    assert.equal(helper.projectLifecyclePresentation(input[2]).label, 'Deleted');
    assert.equal(helper.projectLifecyclePresentation(input[4]).label, 'Restricted project');
    assert.equal(helper.projectLifecyclePresentation({ status: 'DELETED', archivedAt: 1 }).label, 'Deleted');
  });
  await check('card projection ignores current/historical exports, multiple episodes and legacy derived state', () => {
    const base = { externalId: 'external', name: 'Retained fixture', status: 'DRAFT' };
    const prior = helper.toLifecycleProjectCard({ ...base, state: 'rendered', currentVersionId: 'v3', productions: [{ currentVersionId: 'v3' }, { currentVersionId: 'another' }], exports: [{ productionVersionId: 'v2', status: 'COMPLETED' }], metadata: { secret: 'PRIVATE_METADATA' } });
    const current = helper.toLifecycleProjectCard({ ...base, exports: [{ productionVersionId: 'v3', status: 'COMPLETED' }] });
    assert.deepEqual(prior, { id: 'external', name: 'Retained fixture', status: 'DRAFT' }); assert.deepEqual(prior, current);
    assert.equal(helper.projectLifecyclePresentation(prior).label, 'Active project');
    assert.equal(JSON.stringify(prior).includes('PRIVATE_'), false);
  });
  await check('actual overview keeps existing authorized counts and removes fabricated project-phase conversion', async () => {
    const result = await overview.getDashboardOverview();
    assert.deepEqual(queryCalls, [api.app.dashboard]); assert.strictEqual(result.stats, stats);
    assert.deepEqual(result.recentProjects.map(project => project.status), ['DRAFT', 'APPROVED', 'COMPLETED']);
    for (const project of result.recentProjects) assert.equal(Object.hasOwn(project, 'state'), false);
    assert.equal(result.activities.length, 3); assert(result.activities.every(activity => activity.description === 'Video project updated'));
    assert.equal(mutationCalls.length, 0);
  });
  await check('actual dashboard route/cards display lifecycle and explicitly limited page counts without new queries', async () => {
    const beforeQueries = queryCalls.length;
    const html = renderToStaticMarkup(await dashboard());
    assert.deepEqual(libraryCalls, [{ mode: 'active', preview: true }]);
    assert.equal(queryCalls.length, beforeQueries + 1); assert.deepEqual(mutationCalls, [api.account.ensureAccount]);
    assert.deepEqual(capturedCards.map(project => project.status), ['DRAFT', 'APPROVED', 'COMPLETED']);
    assert.equal((html.match(/Active project/g) || []).length, 3);
    assert.doesNotMatch(html, /Idea in progress|Ready to share|Ready to make|Making your video|Plan ready/);
    assert.match(html, /3 projects shown; more projects remain in the library/);
    assert.match(html, /Episode progress is shown inside each project/);
    assert.match(html, /Summary covers recent records only/);
    assert.match(html, /101/); assert.match(html, /13/); assert.match(html, /23/);
    assert.match(html, /grid grid-cols-1 gap-5/); assert.match(html, /mt-7 grid grid-cols-1 gap-3/);
    assert.match(html, /href="\/dashboard\/projects\/external-2"/);
  });
  await check('actual library page preserves lifecycle modes/search/cursors and does not present raw statuses as episode phases', async () => {
    for (const mode of ['active', 'archived', 'deleted']) {
      libraryRows = mode === 'active' ? rows : [{ ...rows[0], status: mode.toUpperCase() }];
      const html = renderToStaticMarkup(await library({ searchParams: Promise.resolve({ mode, q: 'fixture', cursor: 'older' }) }));
      assert.deepEqual(libraryRequests.at(-1), { mode, search: 'fixture', cursor: 'older' });
      assert.doesNotMatch(html, /owner · (draft|approved|completed) ·/);
      if (mode === 'active') assert.equal((html.match(/owner · Active project ·/g) || []).length, 3);
      else assert.match(html, new RegExp('owner · ' + (mode === 'archived' ? 'Archived' : 'Deleted') + ' ·'));
      assert.match(html, new RegExp(libraryRows.length + ' matching project'));
      assert.match(html, /More projects remain/);
    }
    libraryRows = [{ ...rows[0], status: 'FUTURE_UNKNOWN', moderationStatus: 'RESTRICTED' }];
    const restricted = renderToStaticMarkup(await library({ searchParams: Promise.resolve({}) }));
    assert.match(restricted, /Restricted project/); assert.match(restricted, /Production and media access are blocked/);
    assert.doesNotMatch(restricted, /href="\/dashboard\/projects\/external-0"/);
    libraryRows = [{ ...rows[0], status: 'FUTURE_UNKNOWN' }];
    assert.match(renderToStaticMarkup(await library({ searchParams: Promise.resolve({}) })), /owner · Open project ·/);
  });
  console.log(`Project lifecycle presentation: ${checks} PASS; actual dashboard/action/library SSR and pure page projections; no database, provider or browser calls.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
