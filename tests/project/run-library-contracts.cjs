const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, stubs = {}) {
  const filename = path.join(root, file);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod); mod.require = (id) => Object.hasOwn(stubs, id) ? stubs[id] : normal(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
class AccessError extends Error { constructor(code, message) { super(message); this.code = code; } }
const auth = { ConvexAuthError: AccessError, ConvexAuthorizationError: AccessError };
let authenticated = true;
const identity = { externalId: 'subject-one', subject: 'subject-one' };
const authorization = load('convex/authorization.ts', { './studioMemberships': load('convex/studioMemberships.ts'), './auth': auth, './identity': { getIdentity: async () => authenticated ? identity : null, requireIdentity: async () => { if (!authenticated) throw new AccessError('UNAUTHENTICATED', 'Sign in'); return identity; } } });
const library = load('src/lib/project/library.ts');
const server = { query: (value) => value, mutation: (value) => value };
const projects = load('convex/projects.ts', { './_generated/server': server, './authorization': authorization, './auth': auth, '../src/lib/project/library': library });
const tables = { users: [{ _id: 'user-one', externalId: identity.externalId, authSubject: identity.externalId, status: 'active' }], studios: [{ _id: 'studio-one', externalId: 'workspace-one', ownerUserId: 'user-one', ownerExternalId: identity.externalId }], members: [{ _id: 'studio-membership', studioId: 'studio-one', userId: 'user-one', role: 'owner', status: 'active' }], studioMembers: [], projects: [], projectMembers: [], descendants: [{ _id: 'retained-take', immutable: true }] };
let sequence = 0; let mutations = 0; const indexes = new Set(); let failProject;
function add(table, value) { const row = { _creationTime: ++sequence, ...value }; tables[table].push(row); return row; }
const ctx = { db: {
  get: async (id) => { if (id === failProject) throw new Error('temporary transport failure'); return Object.values(tables).flat().find((row) => row._id === id) ?? null; },
  patch: async (id, values) => { mutations++; const row = await ctx.db.get(id); for (const [key, value] of Object.entries(values)) { if (value === undefined) delete row[key]; else row[key] = structuredClone(value); } },
  insert: async (table, values) => { mutations++; const id = `${table}-new-${++sequence}`; add(table, { _id: id, ...structuredClone(values) }); return id; },
  query: (table) => {
    let selected = tables[table]; let descending = false;
    const query = {
      withIndex: (name, select) => { indexes.add(`${table}.${name}`); const conditions = []; const q = { eq: (key, value) => { conditions.push([key, value]); return q; } }; select(q); selected = selected.filter((row) => conditions.every(([key, value]) => row[key] === value)); return query; },
      order: (direction) => { descending = direction === 'desc'; return query; },
      unique: async () => { assert(selected.length <= 1, 'fixture must preserve unique membership keys'); return selected[0] ?? null; },
      take: async (limit) => [...selected].sort((a, b) => descending ? b._creationTime - a._creationTime : a._creationTime - b._creationTime).slice(0, limit),
      paginate: async ({ cursor, numItems }) => {
        assert(numItems <= 50); const offset = cursor === null ? 0 : Number(cursor); assert(Number.isFinite(offset));
        const ordered = [...selected].sort((a, b) => descending ? b._creationTime - a._creationTime : a._creationTime - b._creationTime);
        const page = ordered.slice(offset, offset + numItems); const end = offset + page.length;
        return { page, continueCursor: String(end), isDone: end >= ordered.length };
      },
    }; return query;
  },
} };
function project(id, options = {}) {
  return add('projects', { _id: id, externalId: `external-${id}`, studioExternalId: 'workspace-one', studioId: 'studio-one', name: `Project ${id}`, description: 'Original project description', status: 'DRAFT', createdAt: sequence, updatedAt: sequence, ownerUserId: 'user-one', createdByUserId: 'user-one', createdByExternalId: identity.externalId, ...options });
}
function membership(id, role = 'OWNER', status = 'ACTIVE') { return add('projectMembers', { _id: `member-${id}`, projectId: id, userId: 'user-one', role, status }); }
async function traverse(mode = 'active', search = '') {
  const output = []; let cursor; let pages = 0;
  do {
    const page = await projects.library.handler(ctx, { studioExternalId: 'workspace-one', mode, search, cursor, limit: 17 });
    assert(page.page.length <= 17); output.push(...page.page); cursor = page.continueCursor ?? undefined;
    if (page.isDone) assert.equal(cursor, undefined); else assert(cursor);
    assert(++pages < 100, 'cursor traversal must progress');
  } while (cursor);
  return output;
}
(async () => {
  for (let i = 0; i < 75; i++) { project(`explicit-${i}`, { name: i === 0 ? 'Needle beyond recent projects' : `Explicit ${i}` }); membership(`explicit-${i}`, i % 2 ? 'EDITOR' : 'OWNER'); }
  for (let i = 0; i < 75; i++) project(`legacy-${i}`, { description: i === 0 ? 'Deep archive searchable phrase' : 'Legacy owned project' });
  for (let i = 0; i < 40; i++) project(`foreign-${i}`, { ownerUserId: 'other-user', createdByUserId: 'other-user', createdByExternalId: 'other-subject' });
  project('removed'); membership('removed', 'OWNER', 'REMOVED');
  project('suspended'); membership('suspended', 'OWNER', 'SUSPENDED');
  project('other-workspace', { studioExternalId: 'workspace-other', studioId: 'studio-other' }); membership('other-workspace');
  project('archived', { status: 'ARCHIVED', archivedAt: 1 }); membership('archived');
  project('deleted-owner', { status: 'DELETED', deletedAt: 1 }); membership('deleted-owner');
  project('deleted-viewer', { status: 'DELETED', deletedAt: 1 }); membership('deleted-viewer', 'VIEWER');
  project('archived-foreign', { status: 'ARCHIVED', archivedAt: 1, ownerUserId: 'other-user', createdByUserId: 'other-user', createdByExternalId: 'other-subject' });
  project('deleted-foreign', { status: 'DELETED', deletedAt: 1, ownerUserId: 'other-user', createdByUserId: 'other-user', createdByExternalId: 'other-subject' });
  const rows = await traverse();
  assert.equal(rows.length, 150); assert.equal(new Set(rows.map((row) => row.id)).size, 150);
  assert(indexes.has('projectMembers.by_user')); assert(indexes.has('projects.by_studio')); assert(indexes.has('projectMembers.by_project_user'));
  assert.equal(mutations, 0, 'listing/backfill fallback must be read-only');
  assert.deepEqual((await traverse('active', 'NEEDLE BEYOND')).map((row) => row.id), ['explicit-0']);
  assert.deepEqual((await traverse('active', 'searchable phrase')).map((row) => row.id), ['legacy-0']);
  assert.deepEqual((await traverse('archived')).map((row) => row.id), ['archived']);
  assert.deepEqual((await traverse('deleted')).map((row) => row.id), ['deleted-owner']);
  const first = await projects.library.handler(ctx, { studioExternalId: 'workspace-one', mode: 'active', limit: 1 });
  await assert.rejects(projects.library.handler(ctx, { studioExternalId: 'workspace-one', mode: 'deleted', cursor: first.continueCursor }), /search changed/);
  await assert.rejects(projects.library.handler(ctx, { studioExternalId: 'workspace-one', mode: 'active', search: 'different', cursor: first.continueCursor }), /search changed/);
  await assert.rejects(projects.library.handler(ctx, { studioExternalId: 'workspace-one', mode: 'active', cursor: '{' }), /Invalid.*cursor/);
  await assert.rejects(projects.library.handler(ctx, { studioExternalId: 'workspace-one', mode: 'active', cursor: 'null' }), /search changed/);
  await assert.rejects(projects.library.handler(ctx, { studioExternalId: 'workspace-one', mode: 'active', search: 'x'.repeat(101) }), /100 characters/);
  await assert.rejects(projects.library.handler(ctx, { studioExternalId: 'workspace-one', mode: 'active', limit: 51 }), /page size/);
  await assert.rejects(projects.library.handler(ctx, { studioExternalId: 'workspace-other', mode: 'active' }), /Studio not found/);
  authenticated = false;
  await assert.rejects(projects.library.handler(ctx, { studioExternalId: 'workspace-one', mode: 'active' }), /Sign in/);
  authenticated = true;
  failProject = 'explicit-74';
  await assert.rejects(traverse(), /temporary transport failure/);
  failProject = undefined;
  const listed = await projects.list.handler(ctx, { studioExternalId: 'workspace-one' });
  assert.equal(listed.length, 150, 'compatibility list uses the same canonical authority');

  const original = project('lifecycle', { status: 'APPROVED', metadata: { kept: 'immutable reference' } }); membership('lifecycle');
  const descendants = structuredClone(tables.descendants);
  await projects.archive.handler(ctx, { projectId: original._id });
  assert.equal(original.status, 'ARCHIVED'); assert.equal(original.metadata.statusBeforeArchive, 'APPROVED');
  const originalArchiveTime = original.archivedAt;
  await projects.softDelete.handler(ctx, { projectId: original._id });
  assert.equal(original.status, 'DELETED');
  await projects.restore.handler(ctx, { projectId: original._id });
  assert.equal(original.status, 'ARCHIVED'); assert.equal(original.archivedAt, originalArchiveTime);
  await projects.restore.handler(ctx, { projectId: original._id });
  assert.equal(original.status, 'APPROVED'); assert.equal(original.deletedAt, undefined); assert.equal(original.archivedAt, undefined); assert.equal(original.metadata.kept, 'immutable reference');
  await projects.update.handler(ctx, { projectId: original._id, name: ' Renamed project ' }); assert.equal(original.name, 'Renamed project');
  const viewer = project('viewer'); membership('viewer', 'VIEWER');
  await assert.rejects(projects.update.handler(ctx, { projectId: viewer._id, name: 'Forbidden' }), /not authorized/);
  await assert.rejects(projects.archive.handler(ctx, { projectId: viewer._id }), /not authorized/);
  const editor = project('editor'); membership('editor', 'EDITOR');
  await assert.rejects(projects.softDelete.handler(ctx, { projectId: editor._id }), /not authorized/);
  await projects.archive.handler(ctx, { projectId: editor._id });
  await assert.rejects(projects.update.handler(ctx, { projectId: editor._id, name: 'Restore first' }), /restored/);
  await projects.restore.handler(ctx, { projectId: editor._id }); assert.equal(editor.status, 'DRAFT');
  const legacyArchive = project('flag-only-archive', { status: 'DRAFT', archivedAt: 5 }); membership('flag-only-archive');
  await assert.rejects(projects.update.handler(ctx, { projectId: legacyArchive._id, name: 'Restore first' }), /restored/);
  await projects.restore.handler(ctx, { projectId: legacyArchive._id }); assert.equal(legacyArchive.archivedAt, undefined);
  assert.deepEqual(tables.descendants, descendants, 'lifecycle actions never erase production evidence');
  while (tables.projects.filter((row) => row.studioExternalId === 'workspace-one').length <= 500) project(`filler-${sequence}`);
  await assert.rejects(projects.list.handler(ctx, { studioExternalId: 'workspace-one' }), /compatibility limit/);
  assert((await traverse()).length > 450, 'paginated library remains complete beyond compatibility limit');
  const actions = load('src/lib/project/library-actions.ts', {
    'next/cache': { revalidatePath: () => {} },
    '../../../convex/_generated/api': { api: { account: { current: 'current' }, projects: { update: 'update', archive: 'archive', softDelete: 'softDelete', restore: 'restore' } } },
    '@/lib/convex/server': { getAuthenticatedConvexClient: async () => ({
      query: async (_ref, args) => args.studioExternalId ? projects.library.handler(ctx, args) : { studio: tables.studios[0] },
      mutation: async (ref, args) => projects[ref].handler(ctx, args),
    }) },
  });
  const sparse = await actions.getProjectLibraryPage({ mode: 'active', search: 'searchable phrase' });
  assert.equal(sparse.isDone, false, 'bounded search cannot claim no match beyond its scan budget');
  assert(sparse.continueCursor);
  let follow = sparse; const matches = [...sparse.page];
  while (!follow.isDone) { follow = await actions.getProjectLibraryPage({ mode: 'active', search: 'searchable phrase', cursor: follow.continueCursor }); matches.push(...follow.page); }
  assert.deepEqual(matches.map((row) => row.id), ['legacy-0']);
  assert.equal((await actions.changeLibraryProject({ projectId: original._id, action: 'rename', name: 'Library rename' })).success, true);
  assert.equal(original.name, 'Library rename');
  assert.equal((await actions.changeLibraryProject({ projectId: viewer._id, action: 'delete' })).success, false);
  assert.equal((await actions.changeLibraryProject({ projectId: original._id, action: 'rename', name: ' ' })).success, false);
  const { ProjectLibraryControls } = load('src/components/project/project-library-controls.tsx', {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    'next/navigation': { useRouter: () => ({ refresh: () => {} }) }, '@/lib/project/library-actions': actions,
  });
  const presentation = { id: 'project-ui', externalId: 'external-ui', name: 'A real project', description: null, status: 'DRAFT', role: 'OWNER', createdAt: 1, updatedAt: 1 };
  const ownerControls = renderToStaticMarkup(React.createElement(ProjectLibraryControls, { project: presentation, mode: 'active' }));
  assert.match(ownerControls, /Archive project/); assert.match(ownerControls, /Save name/); assert.match(ownerControls, /Confirm move to deleted/);
  assert.match(ownerControls, /href="\/dashboard\/projects\/external-ui\/settings"[^>]*>Manage project access/);
  const editorControls = renderToStaticMarkup(React.createElement(ProjectLibraryControls, { project: { ...presentation, role: 'EDITOR' }, mode: 'active' }));
  assert.doesNotMatch(editorControls, /Manage project access/);
  const viewerControls = renderToStaticMarkup(React.createElement(ProjectLibraryControls, { project: { ...presentation, role: 'VIEWER' }, mode: 'active' }));
  assert.equal(viewerControls, '');
  const editorDeleted = renderToStaticMarkup(React.createElement(ProjectLibraryControls, { project: { ...presentation, role: 'EDITOR' }, mode: 'deleted' }));
  assert.match(editorDeleted, /Restore project/); assert.doesNotMatch(editorDeleted, /Save name|Confirm move to deleted/);
  const link = ({ children, ...props }) => React.createElement('a', props, children);
  const { ProjectAccessSettings } = load('src/components/project/project-access-settings.tsx', {
    'next/link': link, '../../../convex/_generated/api': { api: { projects: { listMembers: 'listMembers', setMember: 'setMember', removeMember: 'removeMember' } } },
    'convex/react': { useMutation: () => async () => assert.fail('render must not change access'), usePaginatedQuery: (_reference, args) => ({
      results: args.scope === 'ASSIGNED'
        ? [{ userId: 'owner-fixture', name: 'Fixture owner', self: true, role: 'OWNER', canAssign: true }]
        : [{ userId: 'viewer-fixture', name: 'Fixture teammate', self: false, role: null, canAssign: true }],
      status: args.scope === 'ASSIGNED' ? 'Exhausted' : 'CanLoadMore',
    }) },
  });
  const accessMarkup = renderToStaticMarkup(React.createElement(ProjectAccessSettings, { projectId: original._id }));
  assert.match(accessMarkup, /Fixture owner \(you\)/); assert.match(accessMarkup, /Fixture teammate/);
  assert.match(accessMarkup, /Grant access/); assert.match(accessMarkup, /Load more people/);
  assert.doesNotMatch(accessMarkup, /Revoke access|mailto:/);
  const SettingsPage = load('src/app/(dashboard)/dashboard/projects/[id]/settings/page.tsx', {
    'next/link': link, 'next/navigation': { notFound: () => { throw new Error('404'); } },
    '../../../../../../../convex/_generated/api': { api: { projects: { accessSettings: 'accessSettings' } } },
    '@/lib/convex/server': { getAuthenticatedConvexClient: async () => ({ query: async (_ref, args) => projects.accessSettings.handler(ctx, args) }) },
    '@/lib/guards': { requireAuth: async () => {} }, '@/lib/project/route-id': load('src/lib/project/route-id.ts'),
    '@/components/project/project-access-settings': { ProjectAccessSettings },
  }).default;
  assert.match(renderToStaticMarkup(await SettingsPage({ params: Promise.resolve({ id: encodeURIComponent(original.externalId) }) })), /Project access for Library rename/);
  await assert.rejects(SettingsPage({ params: Promise.resolve({ id: encodeURIComponent(editor.externalId) }) }), /404/);
  console.log('PASS project library: complete membership+legacy cursor traversal beyond500, substring search past recent20, canonical roles/isolation/removal, mode/cursor/input guards, transport errors, lifecycle roundtrips/retained descendants and SSR controls/server actions. In-memory actual authorization/handlers; no database/provider calls.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
