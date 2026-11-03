const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server'), { getFunctionName } = require('convex/server');
const root = path.resolve(__dirname, '../..');
function load(relative, stubs = {}, suffix = '') {
  const filename = path.join(root, relative), m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename)); const normal = m.require.bind(m);
  m.require = name => Object.prototype.hasOwnProperty.call(stubs, name) ? stubs[name] : normal(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8') + suffix, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename); return m.exports;
}
const lineage = load('src/lib/production/timeline-lineage.ts');
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
(async () => {
  await check('actual workspace projection requires exact immutable/project lineage and excludes foreign rows', async () => {
    const project = { _id: 'p', studioExternalId: 's' }, production = { _id: 'prod', projectId: 'p', studioExternalId: 's', currentVersionId: 'v3' }, version = { _id: 'v3', productionId: 'prod', status: 'APPROVED' };
    const base = { projectId: 'p', productionId: 'prod', studioExternalId: 's', versionNumber: 999, tracks: {} };
    const rows = [
      { ...base, _id: 'old', tracks: { productionVersionId: 'v2' } },
      { ...base, _id: 'unbound' },
      { ...base, _id: 'current', versionNumber: 1, tracks: { metadata: { productionVersionId: 'v3' } } },
      { ...base, _id: 'foreign', projectId: 'foreign', tracks: { productionVersionId: 'v3' } },
      { ...base, _id: 'foreign-studio', studioExternalId: 'foreign', tracks: { productionVersionId: 'v3' } },
      { ...base, _id: 'legacy-unbound', projectId: undefined },
      { ...base, _id: 'conflicting', tracks: { productionVersionId: 'v2', metadata: { productionVersionId: 'v3' } } },
      { ...base, _id: 'manifest-current', manifestId: 'm3' },
      { ...base, _id: 'manifest-foreign', manifestId: 'bad' },
    ];
    const manifest = id => ({ _id: id, projectId: id === 'bad' ? 'foreign' : 'p', productionId: 'prod', studioExternalId: 's', contractVersion: 5, manifest: { version: 5, projectId: 'p', productionId: 'prod', productionVersionId: 'v3', manifestId: id } });
    let writes = 0; const reads = [];
    const client = { mutation() { writes++; throw Error('No mutations on read'); }, async query(ref, args) {
      const name = getFunctionName(ref); reads.push({ name, args });
      if (name === 'projects:getByExternalId') return project;
      if (name === 'productions:getWorkspaceByProject') return { production, version };
      if (name === 'continuity:resourceVersionPage') return { page: [], isDone: true, projectRole: 'OWNER' };
      if (['continuity:listBibles', 'assetStorage:listProjectAssets', 'voices:list', 'scenes:list', 'generationJobs:list'].includes(name)) return [];
      if (name === 'timeline:list') return rows;
      if (name === 'episodes:list') return { page: [], isDone: true };
      if (name === 'timeline:graphicsCapabilities') return { enabled: false };
      if (name === 'approvals:get') return { currentState: 'APPROVED', resource: {} };
      if (name === 'assembly:getManifest') return manifest(args.manifestId);
      throw Error(name);
    } };
    const actions = load('src/lib/production/workspace-actions.ts', { 'next/cache': { revalidatePath() { throw Error('No invalidation on read'); } }, '@/lib/convex/server': { getAuthenticatedConvexClient: async () => client }, './timeline-lineage': lineage, './workspace-controls': { validateShotOperationControls() {}, videoTaskForOperation() {} }, '../../../renderer/src/output-settings': {} });
    const data = await actions.loadWorkspaceControls('project-external', 'prod');
    assert.deepEqual(data.timelines.map(t => [t.id, t.matchesProductionVersion]), [['old', false], ['unbound', false], ['current', true], ['legacy-unbound', false], ['conflicting', false], ['manifest-current', true], ['manifest-foreign', false]]);
    assert(!reads.some(r => r.name === 'approvals:get' && ['foreign', 'foreign-studio'].includes(r.args.resourceId))); assert.equal(writes, 0);
  });
  await check('historical composer retains history without approval or build controls; exact current controls remain', () => {
    let actions = 0; function Button({ children, variant, size, ...props }) { void variant; void size; return React.createElement('button', props, children); }
    function Approval({ resourceId }) { return React.createElement('span', null, 'APPROVAL-' + resourceId); }
    const composerModule = load('src/components/production-workspace/timeline-composer.tsx', {
      'next/navigation': { useRouter: () => ({ refresh() { actions++; } }) }, '@/components/ui/button': { Button }, './resource-approval-controls': { ApprovalControls: Approval, controlInput: '' }, '@/lib/production/workspace-actions': { buildWorkspaceTimelineManifest() { actions++; }, createWorkspaceTimeline() { actions++; } }, '@/lib/production/workspace-controls': { validateCompositionAudioTracks() {} }, './graphic-designer': { GraphicDesigner: () => null, emptyGraphicDraft: () => ({}) }, '../../../renderer/src/templates/graphics-v2-contract': { parseGraphicsV2Authoring() {} }, './soundtrack-editor': { SoundtrackEditor: () => null },
    });
    const data = { canEdit: true, versionState: 'APPROVED', scenes: [], assets: [], timelines: [{ id: 'old', versionNumber: 14, matchesProductionVersion: false, state: 'APPROVED' }, { id: 'new', versionNumber: 1, matchesProductionVersion: true, state: 'APPROVED' }] };
    const html = renderToStaticMarkup(React.createElement(composerModule.TimelineComposer, { data }));
    assert(html.includes('Historical or unbound timeline')); assert(!html.includes('APPROVAL-old')); assert(html.includes('APPROVAL-new')); assert.equal((html.match(/Build canonical manifest/g) || []).length, 1); assert.equal(actions, 0);
    data.timelines = data.timelines.slice(0, 1); const history = renderToStaticMarkup(React.createElement(composerModule.TimelineComposer, { data })); assert(!history.includes('Build canonical manifest')); assert(!history.includes('APPROVAL-')); assert.equal(actions, 0);
  });
  await check('actual release distinguishes no job, active queue and deliberate retained historical completion', () => {
    const filename = path.join(root, 'tests/production-graph/run-current-finishing-ui.cjs'), m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename)); m._compile(fs.readFileSync(filename, 'utf8').split('let checks=0;')[0] + '\nmodule.exports={fixture};', filename);
    const s = m.exports.fixture(true); assert.equal(s.view().review.availability, 'NOT_STARTED'); assert.equal(s.view().renderer.state, 'NOT_STARTED');
    s.jobs.push({ _id: 'j3', manifestId: 'manifest3', status: 'QUEUED' }); s.render(); assert.equal(s.view().review.availability, 'WAITING');
    s.choose('manifest2'); assert.equal(s.view().review.availability, 'READY'); assert.equal(s.view().download.href, 'fixture-private-historical-file'); assert.equal(s.writes.length, 0);
    const card = load('src/components/review/review-state-card.tsx'); const html = renderToStaticMarkup(React.createElement(card.ReviewStateCard, { availability: 'NOT_STARTED' })); assert(html.includes('Finishing has not started')); assert(!html.includes('still working')); assert(!html.includes('animate-spin'));
  });
  console.log(`Current Edit UI: ${checks} PASS; actual server projection, React/SSR; no network/DB/provider calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
