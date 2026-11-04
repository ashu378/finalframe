const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { getFunctionName } = require('convex/server');
const h = require('./run-operation-controls.cjs');
global.fetch = async () => { throw Error('Network forbidden in accepted-take recovery tests'); };
const root = path.resolve(__dirname, '../..');
const acceptedId = 'gen-vid-123-abcdefghijklmnopqrst';
const api = require(path.join(root, 'convex/_generated/api.js')).api;
async function fixture(patch = {}) {
  let state;
  const authorize = async () => {
    if (state.accessAllowed === false) throw Error('PRIVATE_AUTH_DETAIL=revoked-user');
    return { project: state.rows.get('project'), user: state.rows.get('user') };
  };
  state = h.backendFixture({ operation: 'GENERATE' }, [], undefined, { authorization: { requireProjectAccess: authorize, requireProjectRole: authorize, resolveProjectAccessForActor: authorize } });
  const made = await state.create();
  state.jobId = made._id;
  state.rows.set(made._id, { ...state.rows.get(made._id), status: 'FAILED', executionStage: 'FAILED', providerJobId: acceptedId, submissionStartedAt: Date.now() - 1000, ...patch });
  return state;
}
function ui(state, canEdit = true) {
  const cells = [], calls = [], refreshes = [];
  let cursor = 0, tree, waiting;
  const hooks = { ...React,
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
    useTransition() { return [false, action => action()]; },
    useRef(initial) { const index = cursor++; if (!(index in cells)) cells[index] = { current: initial }; return cells[index]; },
  };
  function Button() {}
  const filename = path.join(root, 'src/components/production-workspace/shot-workspace.tsx');
  const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const stubs = {
    react: hooks,
    'next/navigation': { useRouter: () => ({ refresh: () => refreshes.push(true) }) },
    'convex/react': {
      useQuery(ref, args) { assert.equal(getFunctionName(ref), 'generationJobs:list'); assert.deepEqual(args, { productionId: 'production' }); return [h.contracts.publicJob(state.rows.get(state.jobId))]; },
      useMutation(ref) { assert.equal(getFunctionName(ref), 'generationJobs:retry'); return async args => { assert.deepEqual(Object.keys(args), ['jobId']); calls.push({ name: getFunctionName(ref), args }); if (waiting) await waiting; return state.jobs.retry.handler(state.ctx, args); }; },
    },
    '../../../convex/_generated/api': { api },
    '@/components/ui/button': { Button },
    '@/components/production/generate-shot-button': { GenerateShotButton: () => null },
    './resource-approval-controls': { ApprovalControls: () => null, controlInput: '' },
    '@/lib/production/workspace-actions': { bindShotResources() { throw Error('Unrelated write forbidden'); }, saveShotOperationControls() { throw Error('Unrelated write forbidden'); } },
    '@/lib/ai/video-routing': h.routing,
  };
  const originalRequire = m.require.bind(m);
  m.require = name => Object.hasOwn(stubs, name) ? stubs[name] : originalRequire(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8') + '\nexport {GenerationStatus as __GenerationStatus, ShotCard as __ShotCard};', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  function render() { cursor = 0; tree = m.exports.__GenerationStatus({ productionId: 'production', canEdit }); return tree; }
  function find(predicate, node) {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) { for (const child of node) { const found = find(predicate, child); if (found) return found; } return undefined; }
    if (predicate(node)) return node;
    return node.props?.children === undefined ? undefined : find(predicate, node.props.children);
  }
  function text(node) { if (node == null || typeof node === 'boolean') return ''; if (typeof node === 'string' || typeof node === 'number') return String(node); if (Array.isArray(node)) return node.map(value => text(value)).join(' '); return node.props?.children === undefined ? '' : text(node.props.children); }
  function renderShot(data, shot, fresh = false) {
    if (fresh) cells.length = 0;
    cursor = 0;
    tree = m.exports.__ShotCard({ data, shot });
    return tree;
  }
  render();
  return { calls, refreshes, renderShot, find: predicate => find(predicate, tree), render, text: () => text(tree), resume: () => find(node => node.type === Button && ['Resume accepted take', 'Requesting resume…'].includes(node.props.children), tree), refresh: () => find(node => node.type === Button && node.props.children === 'Refresh saved takes', tree), async flush() { await new Promise(resolve => setImmediate(resolve)); render(); }, pause() { let release; waiting = new Promise(resolve => { release = resolve; }); return () => { waiting = undefined; release(); }; } };
}
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
(async () => {
  await check('viewing status and refreshing saved takes writes nothing; accepted failure offers explicit recovery', async () => {
    const state = await fixture(), screen = ui(state);
    assert.equal(screen.calls.length, 0); assert(screen.resume());
    assert(screen.text().includes('Uses the existing accepted generation'));
    screen.refresh().props.onClick(); assert.equal(screen.refreshes.length, 1); assert.equal(screen.calls.length, 0);
  });
  await check('one deliberate click invokes actual accepted retry with only exact job ID; double click cannot queue twice', async () => {
    const state = await fixture(), screen = ui(state), release = screen.pause();
    const original = structuredClone(state.rows.get(state.jobId));
    screen.resume().props.onClick(); screen.resume().props.onClick(); screen.render();
    assert.equal(screen.calls.length, 1); assert.equal(screen.resume().props.disabled, true);
    assert.deepEqual(screen.calls[0], { name: 'generationJobs:retry', args: { jobId: state.jobId } });
    release(); await screen.flush();
    const job = state.rows.get(state.jobId); assert.equal(job.status, 'PENDING'); assert.equal(job.executionStage, 'POLL');
    for (const key of ['request', 'providerJobId', 'model', 'productionVersionId', 'requestHash', 'idempotencyKey']) assert.deepEqual(job[key], original[key]);
    assert.equal(screen.refreshes.length, 1); assert.equal(screen.resume(), undefined); assert(screen.text().includes('Resume requested for the existing accepted take.'));
  });
  await check('viewer, unaccepted/uncertain, active, completed, canceled and non-OpenRouter jobs have no recovery button', async () => {
    const viewer = ui(await fixture(), false); assert.equal(viewer.resume(), undefined); assert.equal(viewer.calls.length, 0);
    for (const patch of [{ providerJobId: undefined }, { providerJobId: ' ' }, { executionStage: 'RECONCILIATION_REQUIRED' }, { status: 'PENDING' }, { status: 'PROCESSING' }, { status: 'RETRYING' }, { status: 'COMPLETED' }, { status: 'CANCELED' }, { provider: 'other-provider' }, { shotId: undefined }]) {
      const screen = ui(await fixture(patch)); assert.equal(screen.resume(), undefined); assert.equal(screen.calls.length, 0);
    }
  });
  await check('permission withdrawal or changed saved status remains a canonical denial with bounded safe feedback', async () => {
    for (const change of [state => state.accessAllowed = false, state => state.rows.get(state.jobId).providerJobId = undefined, state => state.rows.get(state.jobId).executionStage = 'RECONCILIATION_REQUIRED', state => state.rows.get(state.jobId).leaseExpiresAt = Date.now() + 10000]) {
      const state = await fixture(), screen = ui(state), before = state.writes.length;
      change(state); screen.resume().props.onClick(); await screen.flush();
      assert.equal(screen.calls.length, 1); assert.equal(screen.refreshes.length, 0); assert.equal(state.writes.length, before);
      assert(screen.text().includes('Unable to resume this take.')); assert(!screen.text().includes('PRIVATE_AUTH_DETAIL'));
    }
  });
  await check('actual retry/claim/worker polls the original accepted identity with no POST, catalog, new job, attempt or reservation', async () => {
    const state = await fixture();
    const original = structuredClone(state.rows.get(state.jobId));
    const before = { rows: state.rows.size, reservations: state.creditReservations.length, attempts: [...state.rows.values()].filter(row => row.table === 'attempts').length, providerHold: structuredClone(state.rows.get('hold')) };
    state.rows.get('production').currentVersionId = 'new-approved-version';
    const screen = ui(state); screen.resume().props.onClick(); await screen.flush();
    let polls = 0;
    const forbidden = async () => { throw Error('New submission or discovery forbidden'); };
    const worker = h.compile('convex/generationWorker.ts', {
      './_generated/server': { internalAction: value => value }, './_generated/api': { internal: h.api }, 'convex/values': { v: new Proxy({}, { get: () => () => ({}) }) },
      '../src/lib/ai/video-routing': h.routing, './preparationWorker': {}, './generationWorkerContracts': { ...h.contracts, workerEnabled: () => true },
      '../src/lib/ai/model-discovery': { discoverOpenRouterVideoModels: forbidden },
      '../src/lib/adapters/openrouter-adapter': { generateVideo: forbidden, buildVideoGenerationRequest: forbidden, pollVideo: async id => { assert.equal(id, acceptedId); polls++; return { id, status: 'pending' }; } },
    });
    state.ctx.runMutation = (ref, args) => state.jobs[String(ref).split('.').at(-1)].handler(state.ctx, args); state.ctx.runQuery = state.ctx.runMutation;
    await worker.run.handler(state.ctx, { jobId: state.jobId });
    assert.equal(polls, 1); assert.equal(state.rows.size, before.rows); assert.equal(state.creditReservations.length, before.reservations); assert.equal([...state.rows.values()].filter(row => row.table === 'attempts').length, before.attempts);
    assert.deepEqual(state.rows.get('hold'), before.providerHold);
    const job = state.rows.get(state.jobId); for (const key of ['request', 'providerJobId', 'model', 'productionVersionId', 'requestHash', 'idempotencyKey', 'providerBudgetReservationId', 'canonicalReservationId']) assert.deepEqual(job[key], original[key]);
  });
  await check('unaccepted, uncertain, completed and canceled retry requests fail without writes or new reservation', async () => {
    for (const patch of [{ providerJobId: undefined }, { executionStage: 'RECONCILIATION_REQUIRED' }, { status: 'COMPLETED' }, { status: 'CANCELED' }]) {
      const state = await fixture(patch), before = state.writes.length, reservations = state.creditReservations.length;
      await assert.rejects(state.jobs.retry.handler(state.ctx, { jobId: state.jobId })); assert.equal(state.writes.length, before); assert.equal(state.creditReservations.length, reservations);
    }
  });
  await check('source edit defaults to original audio and compares only the exact saved approved source', async () => {
    const screen = ui(await fixture());
    const asset = { id: 'source', name: 'Approved footage', mimeType: 'video/mp4', url: 'https://example.test/source', state: 'APPROVED' };
    const unrelated = { ...asset, id: 'other', url: 'https://example.test/other' };
    const data = { versionState: 'DRAFT', canEdit: true, boundResources: [], continuationSources: [], assets: [asset, unrelated] };
    const shot = { id: 'shot', title: 'Original clip', prompt: 'Change the scarf color.', state: 'DRAFT', durationSeconds: 4, resourceVersionIds: [], takes: [{ id: 'take', status: 'COMPLETED', state: 'APPROVED', versionNumber: 1 }], operationControls: { operation: 'GENERATE', audioPolicy: 'SILENT', referenceAssetIds: [] } };
    const video = () => screen.find(node => node.type === 'video' && node.props['aria-label'] === 'Original source footage');
    screen.renderShot(data, shot, true);
    screen.find(node => node.props?.['aria-label'] === 'Video operation').props.onChange({ target: { value: 'APPEARANCE_EDIT' } });
    screen.renderShot(data, shot);
    assert(screen.find(node => node.type === 'select' && node.props.value === 'KEEP_SOURCE'));
    assert(screen.text().includes('Choose one approved project video'));
    assert.equal(video(), undefined, 'unsaved changes cannot present a comparison source');
    shot.operationControls = { operation: 'APPEARANCE_EDIT', audioPolicy: 'KEEP_SOURCE', referenceAssetIds: ['source'] };
    screen.renderShot({ ...data, versionState: 'APPROVED' }, shot, true);
    assert.equal(video().props.src, asset.url);
    asset.state = 'DRAFT';
    screen.renderShot({ ...data, versionState: 'APPROVED' }, shot, true);
    assert.equal(video(), undefined, 'source approval withdrawal prevents playback here');
    assert.equal(screen.calls.length, 0);
  });
  console.log(`Accepted take resume: ${checks} PASS; actual component/canonical retry/worker with isolated auth, database and GET seams. No network, provider POST or live DB calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(h.cleanup);
