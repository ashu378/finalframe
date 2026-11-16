// Pure UI contracts: no browser, database, network, provider or rendering work.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { getFunctionName } = require('convex/server');
const root = path.resolve(__dirname, '../..');
function fixture(file, { queries = {}, pages = {}, initial = {} } = {}) {
  const cells = [], writes = [], reads = []; let cursor = 0, tree;
  function Button() { return null; }
  const hooks = { ...React, useRef: value => ({ current: value }), useState(value) { const at = cursor++; if (!(at in cells)) cells[at] = at in initial ? initial[at] : value; return [cells[at], next => { cells[at] = typeof next === 'function' ? next(cells[at]) : next; }]; } };
  const filename = path.join(root, 'src/components/movies', file + '.tsx');
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = loaded.require.bind(loaded);
  loaded.require = name => {
    if (name === 'react') return hooks;
    if (name === 'convex/react') return {
      useQuery(ref, args) { const name = getFunctionName(ref); reads.push({ name, args }); return args === 'skip' ? undefined : queries[name]; },
      usePaginatedQuery(ref) { return pages[getFunctionName(ref)] ?? { results: [], status: 'Exhausted', loadMore() {} }; },
      useMutation: ref => async args => { writes.push({ name: getFunctionName(ref), args }); return {}; },
      useConvex: () => ({ query() { throw Error('Unexpected preview query'); } }),
    };
    if (name === '@/components/ui/button') return { Button };
    if (name === '@/components/production-workspace/resource-approval-controls') return { controlInput: 'field' };
    if (name === './movie-version-panel') return { MovieVersionPanel: () => null };
    if (name === './movie-export-panel') return { MovieExportPanel: () => null };
    if (name === './movie-studio') return { movieRequestKey: () => 'test-idempotency' };
    if (name === './movie-ui') return { movieIssue: code => 'Safe issue: ' + code };
    return normal(name);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  function find(predicate, node) { if (arguments.length < 2) node = tree; if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { for (const child of node) { const hit = find(predicate, child); if (hit) return hit; } return; } return predicate(node) ? node : find(predicate, node.props?.children); }
  function render(name, props) { cursor = 0; tree = loaded.exports[name](props); return tree; }
  function text(node) { if (typeof node === 'string' || typeof node === 'number') return String(node); if (!node || typeof node !== 'object') return ''; return Array.isArray(node) ? node.map(text).join('') : text(node.props?.children); }
  return { render, find, text: () => text(tree), writes, reads, cells, button: label => find(node => node.type === Button && text(node) === label) };
}
let checks = 0;
function check(name, test) { test(); checks++; console.log('PASS ' + name); }
check('movie selection preserves project identity and creates no work on a page visit', () => {
  const s = fixture('movie-studio', { queries: { 'movies:capabilities': { enabled: true, canEdit: true } }, pages: { 'movies:list': { results: [{ _id: 'movie-original', title: 'An independent story' }], status: 'Exhausted' } } });
  const props = { projectId: 'project-original', options: [] };
  s.render('MovieStudio', props); assert.equal(s.writes.length, 0);
  s.button('An independent story').props.onClick(); s.render('MovieStudio', props);
  assert.equal(s.button('An independent story').props['aria-pressed'], true);
  assert.equal(s.cells[1], 'movie-original'); assert.equal(s.writes.length, 0);
  assert(s.text().includes('Chapter order')); assert(s.text().includes('Later changes go into a new version'));
});
check('disabled movie feature keeps creation disabled and ordinary viewers get no create form', () => {
  for (const canEdit of [true, false]) {
    const s = fixture('movie-studio', { queries: { 'movies:capabilities': { enabled: false, canEdit } } });
    s.render('MovieStudio', { projectId: 'project', options: [] });
    if (canEdit) assert.equal(s.button('Create movie').props.disabled, true); else assert.equal(s.button('Create movie'), undefined);
    assert.equal(s.writes.length, 0);
  }
});
check('copying a movie keeps exact source IDs and output; rendering still requires lock and checked selection', () => {
  const source = { _id: 'component', chapterId: 'chapter', chapterTitle: 'Arrival', productionId: 'production', productionVersionId: 'approved-production-v2', timelineId: 'timeline-v3', timelineVersionNumber: 3, manifestId: 'manifest-v4', episodeId: 'episode', orderIndex: 0, sourceMap: [], validationState: 'VALID' };
  const output = { width: 1080, height: 1920, fps: 30 }; let copied;
  const s = fixture('movie-version-panel', { queries: { 'movies:getVersion': { enabled: true, canEdit: true, version: { projectId: 'project', versionNumber: 2, state: 'READY', componentCount: 1, validatedComponentCount: 1, output, confirmedRetainedVersions: true }, resourceState: 'APPROVED' }, 'movieExports:list': [] }, pages: { 'movies:components': { results: [source], status: 'Exhausted' } } });
  s.render('MovieVersionPanel', { id: 'movie-version', options: [], onCopy: (...args) => { copied = args; } });
  assert.equal(s.button('Render review copy').props.disabled, true);
  assert(s.button('Lock movie version')); s.button('Copy to a new draft').props.onClick();
  assert.equal(copied[0], 'movie-version'); assert.equal(copied[1][0].manifestId, 'manifest-v4'); assert.equal(copied[1][0].productionVersionId, 'approved-production-v2'); assert.deepEqual(copied[2], output); assert.equal(copied[3], true); assert.equal(s.writes.length, 0);
});
check('unfinished exports load no video or review and retain recovery controls', () => {
  const s = fixture('movie-export-panel', { queries: { 'movieExports:get': { output: { purpose: 'REVIEW', status: 'NEEDS_ATTENTION', readyPartCount: 1, partCount: 2 }, canEdit: true, canRetry: false } } });
  s.render('MovieExportPanel', { id: 'export', canEdit: true });
  assert.equal(s.find(node => node.type === 'video'), undefined); assert.equal(s.button('Retry with saved parts'), undefined);
  assert.equal(s.reads.find(read => read.name === 'movieReviews:forExport').args, 'skip');
  assert(s.text().includes('administrator must recover')); assert.equal(s.writes.length, 0);
});
check('approved shared reviews cannot create comments or change the decision', () => {
  const s = fixture('shared-movie-review', { queries: { 'movieReviews:getSharedReview': { status: 'APPROVED', enabled: true, durationInFrames: 120, fps: 30, projectName: 'Project', label: 'Review', movieVersionNumber: 2, expiresAt: 0, comments: [] } } });
  s.render('SharedMovieReview', { token: 'private-token' });
  for (const label of ['Add comment at this frame', 'Approve this movie review', 'Request changes']) assert.equal(s.button(label).props.disabled, true);
  assert(s.text().includes('exact movie version and selection')); assert.equal(s.writes.length, 0);
});
console.log(`Movie UI: ${checks} PASS; no browser, database, provider or renderer calls.`);
