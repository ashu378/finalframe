const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../..');

function load(file, stubs = {}) {
  const filename = path.join(root, file);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = mod.require.bind(mod);
  mod.require = (id) => Object.hasOwn(stubs, id) ? stubs[id] : normalRequire(id);
  mod._compile(code, filename);
  return mod.exports;
}

const catalog = load('src/lib/templates/catalog.ts');
const server = { mutation: (config) => config, query: (config) => config };
const member = { studio: { _id: 'studio-a', externalId: 'workspace-a', metadata: { existingPreference: 'keep me' } }, user: { _id: 'user-a' }, identity: { subject: 'user-a', externalId: 'user-a' } };
let authorized = true;
const authorization = { requireProjectAccess: async (_ctx, id) => { if (!authorized) throw new Error('MEMBERSHIP_DENIED'); const owner = rows.projectMembers.find(row => row.projectId === id && row.userId === member.user._id && row.status === 'ACTIVE'); assert(owner); return { project: rows.projects.find(row => row._id === id) }; }, requireMember: async (_ctx, id) => { assert.equal(id, member.studio.externalId); if (!authorized) throw new Error('MEMBERSHIP_DENIED'); return member; }, requireCurrentMember: async () => { if (!authorized) throw new Error('MEMBERSHIP_DENIED'); return member; } };
const projects = load('convex/projects.ts', { './_generated/server': server, './authorization': authorization, './auth': {}, '../src/lib/project/library': load('src/lib/project/library.ts') });
const templates = load('convex/templates.ts', { './_generated/server': server, './authorization': authorization, './projects': projects, '../src/lib/templates/catalog': catalog });
const rows = { projects: [], projectMembers: [] };
let writes = 0;
const ctx = { db: {
  insert: async (table, doc) => { writes++; const id = `${table}-${rows[table].length + 1}`; rows[table].push({ _id: id, ...structuredClone(doc) }); return id; },
  patch: async (id, patch) => { writes++; assert.equal(id, member.studio._id); Object.assign(member.studio, structuredClone(patch)); },
  query: (table) => ({ withIndex: (index, select) => {
    assert.equal(index, 'by_external_id'); const conditions = []; const q = { eq: (key, value) => { conditions.push([key, value]); return q; } }; select(q);
    return { unique: async () => rows[table].find((row) => conditions.every(([key, value]) => row[key] === value)) ?? null };
  } }),
} };

(async () => {
  assert.equal(catalog.STARTER_TEMPLATES.length, 8);
  assert.equal(new Set(catalog.STARTER_TEMPLATES.map((entry) => entry.videoType)).size, 8);
  assert.equal(catalog.parseStartingMode('ASSETS'), 'IMAGES');
  assert.equal(catalog.parseStartingMode('SCRIPT'), 'SCRIPT');
  assert.equal(catalog.parseStartingMode('https://evil.test'), undefined);
  assert.equal(catalog.parseStartingMode('UNKNOWN'), undefined);
  const args = { studioExternalId: member.studio.externalId, templateId: 'product-launch', projectName: '  My launch  ', requestId: 'request-first' };
  const first = await templates.createProject.handler(ctx, args);
  assert.equal(first.replayed, false);
  assert.equal(rows.projects.length, 1);
  assert.equal(rows.projectMembers.length, 1);
  assert.equal(rows.projects[0].name, 'My launch');
  assert.equal(rows.projects[0].ownerUserId, member.user._id);
  assert.equal(rows.projects[0].studioId, member.studio._id);
  assert.equal(rows.projects[0].metadata.templateVersion, 1);
  assert.equal(rows.projects[0].metadata.templateDefaults.mode, 'AD');
  assert.equal(rows.projects[0].status, 'DRAFT');
  assert.equal(rows.projectMembers[0].role, 'OWNER');
  assert.equal(rows.projectMembers[0].status, 'ACTIVE');
  const beforeReplay = writes;
  const replay = await templates.createProject.handler(ctx, args);
  assert.equal(replay.projectId, first.projectId);
  assert.equal(replay.replayed, true);
  assert.equal(writes, beforeReplay);
  assert.equal(rows.projects[0].metadata.templateCreationInput.projectName, 'My launch');
  rows.projects[0].name = 'Renamed after creation';
  assert.equal((await templates.createProject.handler(ctx, args)).projectId, first.projectId, 'mutable name does not invalidate immutable creation receipt');
  assert.equal(writes, beforeReplay);
  await assert.rejects(templates.createProject.handler(ctx, { ...args, templateId: 'social-cutdown' }), /another project/);
  await assert.rejects(templates.createProject.handler(ctx, { ...args, projectName: 'Changed intent' }), /another project/);
  const owner = rows.projects[0].createdByUserId;
  rows.projects[0].createdByUserId = 'other-user';
  await assert.rejects(templates.createProject.handler(ctx, args), /another project/);
  rows.projects[0].createdByUserId = owner;
  rows.projects[0].status = 'ARCHIVED';
  await assert.rejects(templates.createProject.handler(ctx, args), /inactive/);
  rows.projects[0].status = 'DRAFT';
  await assert.rejects(templates.createProject.handler(ctx, { ...args, templateId: 'missing' }), /available template/);
  await assert.rejects(templates.createProject.handler(ctx, { ...args, requestId: 'x' }), /valid creation/);
  await assert.rejects(templates.createProject.handler(ctx, { ...args, projectName: ' ' }), /project name/);
  assert.equal(writes, beforeReplay);

  await templates.setSaved.handler(ctx, { studioExternalId: args.studioExternalId, templateId: args.templateId, saved: true });
  await templates.setSaved.handler(ctx, { studioExternalId: args.studioExternalId, templateId: args.templateId, saved: true });
  assert.deepEqual(member.studio.metadata.savedTemplateIds, [args.templateId]);
  assert.equal(member.studio.metadata.existingPreference, 'keep me');
  assert.deepEqual(member.studio.metadata.savedTemplateVersions, { 'product-launch': 1 });
  assert.equal((await templates.list.handler(ctx, { studioExternalId: args.studioExternalId })).find((row) => row.id === args.templateId).saved, true);
  await templates.setSaved.handler(ctx, { studioExternalId: args.studioExternalId, templateId: args.templateId, saved: false });
  assert.deepEqual(member.studio.metadata.savedTemplateIds, []);
  await assert.rejects(templates.setSaved.handler(ctx, { studioExternalId: args.studioExternalId, templateId: 'missing', saved: true }), /available template/);
  authorized = false;
  const beforeDeny = writes;
  await assert.rejects(templates.list.handler(ctx, { studioExternalId: args.studioExternalId }), /MEMBERSHIP_DENIED/);
  await assert.rejects(templates.setSaved.handler(ctx, { studioExternalId: args.studioExternalId, templateId: args.templateId, saved: true }), /MEMBERSHIP_DENIED/);
  await assert.rejects(templates.createProject.handler(ctx, { ...args, requestId: 'request-denied' }), /MEMBERSHIP_DENIED/);
  assert.equal(writes, beforeDeny);
  authorized = true;
  const regular = await projects.create.handler(ctx, { name: 'Canonical project', contentType: 'ugc', outcomeGoal: ' get_attention ' });
  assert.equal(rows.projects.find((row) => row._id === regular.projectId).metadata.outcomeGoal, 'get_attention');
  assert.equal(rows.projectMembers.length, 2);

  const { CreateProductionForm } = load('src/components/production/create-production-form.tsx', {
    'next/navigation': { useRouter: () => ({}) }, '@/lib/project/actions': {}, '@/lib/production/actions': {}, '@/lib/assets/actions': {}, '@/components/production/planning': {},
    '@/lib/ai/video-routing': { VIDEO_TYPES: catalog.STARTER_TEMPLATES.map((entry) => entry.videoType), VIDEO_TYPE_LABELS: {} },
  });
  const script = renderToStaticMarkup(React.createElement(CreateProductionForm, { initialMode: catalog.parseStartingMode('SCRIPT') }));
  assert.match(script.match(/<button(?=[^>]*aria-pressed="true")[^>]*>([\s\S]*?)<\/button>/)[1], /Paste a script/);
  assert.match(script, /<label[^>]*>Paste your script<\/label>/);
  const initial = catalog.getStarterTemplate('product-launch');
  const defaults = renderToStaticMarkup(React.createElement(CreateProductionForm, { templateDefaults: initial }));
  assert.match(defaults, /value="Product launch"/);
  assert.match(defaults, /Plan a product launch video/);
  assert.match(defaults, /value="LANDSCAPE" selected/);

  function FormStub() { return null; }
  const CreatePage = load('src/app/(dashboard)/dashboard/create/page.tsx', {
    'next/link': () => null,
    '@/lib/guards': { requireAuth: async () => {} },
    '@/components/production/create-production-form': { CreateProductionForm: FormStub },
    '@/lib/project/actions': { getStudioContext: async () => ({ studioId: 'workspace-a' }) },
    '@/lib/production/episode-actions': { getPlanningContinuityOptions: async () => undefined },
    '@/lib/templates/actions': { getTemplateDefaultsForProject: async () => initial },
    '@/lib/templates/catalog': catalog,
  }).default;
  const route = await CreatePage({ searchParams: Promise.resolve({ project: 'my-project', mode: 'ASSETS' }) });
  const findForm = (element) => element?.type === FormStub ? element : React.Children.toArray(element?.props?.children).map(findForm).find(Boolean);
  const form = findForm(route);
  assert.equal(form.props.initialMode, 'IMAGES');
  assert.equal(form.props.templateDefaults.brief, initial.brief);
  assert.equal(form.props.existingProjectId, 'my-project');

  let authenticated = false;
  const EditorPage = load('src/app/(dashboard)/dashboard/projects/[id]/editor/page.tsx', {
    'next/navigation': { redirect: (url) => { throw new Error(`REDIRECT ${url}`); } },
    '@/lib/guards': { requireAuth: async () => { authenticated = true; } },
    '@/lib/project/route-id': load('src/lib/project/route-id.ts'),
  }).default;
  await assert.rejects(EditorPage({ params: Promise.resolve({ id: 'project%20one' }), searchParams: Promise.resolve({ production: 'episode&two' }) }), /REDIRECT \/dashboard\/projects\/project%20one\/workspace\/edit\?production=episode%26two/);
  assert.equal(authenticated, true);
  console.log('PASS templates: catalog/mode defaults, canonical project+owner provisioning, idempotent replay/conflicts, inactive/invalid/member denials, saved preset persistence, SSR initialization and canonical editor redirect. In-memory only; zero database/provider/renderer calls.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
