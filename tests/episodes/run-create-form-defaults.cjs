const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '../..');

function load(file, imports) {
  const filename = path.join(root, file);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = instance.require.bind(instance);
  instance.require = name => Object.hasOwn(imports, name) ? imports[name] : normal(name);
  instance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return instance.exports;
}
const catalog = load('src/lib/templates/catalog.ts', {});
const outputPresets = load('renderer/src/output-presets.ts', {});
const project = { _id: 'project-one', externalId: 'project-one-external', studioExternalId: 'studio-one', projectType: 'ANIMATED_COMEDY_2D' };
const recent = { _id: 'production-recent', projectId: project._id, externalProjectId: project.externalId, studioExternalId: project.studioExternalId, requestedDurationSeconds: 15, workflow: 'COMEDY', inputMode: 'SCRIPT', language: 'pcm', outputPreset: 'SQUARE' };
const oldest = { ...recent, _id: 'production-oldest', requestedDurationSeconds: 60, workflow: 'FOOTAGE_TRANSFORM', inputMode: 'FOOTAGE', language: 'fr', outputPreset: 'LANDSCAPE' };
const pages = [{ _id: 'episode-one', productionId: oldest._id, episodeNumber: 1, title: 'First' }, { _id: 'episode-two', productionId: recent._id, episodeNumber: 2, title: 'Second' }];
let foreign = false;
let transportFailure = false;
let calls = [];
const client = {
  query: async (reference, args) => {
    if (transportFailure) throw new Error('temporary query unavailable');
    calls.push({ reference, args });
    if (reference === 'project') return project;
    if (reference === 'productions') return { page: [recent, oldest], isDone: true, continueCursor: '' };
    if (reference === 'episodes') return { page: pages, isDone: true, continueCursor: '' };
    if (reference === 'requirements') return { productionId: recent._id, episodeId: 'episode-two', requiresBible: true };
    if (reference === 'bibles') return [
      { bibleId: 'approved-bible', versionNumber: 4, state: 'APPROVED', snapshot: { resourceBindings: [{ resourceId: 'character', resourceVersionId: 'character-v1' }], rules: ['Keep the identity.', 'x'.repeat(300), 'rule three', 'rule four'], story: 'y'.repeat(500), visualStyle: 'z'.repeat(300) } },
      { bibleId: 'draft-bible', versionNumber: 5, state: 'DRAFT', snapshot: { resourceBindings: [], rules: [], story: '', visualStyle: '' } },
    ];
    if (reference === 'workspace') {
      assert.equal(args.projectExternalId, project.externalId);
      const production = args.productionId === recent._id ? recent : args.productionId === oldest._id ? oldest : null;
      return { production: production && foreign ? { ...production, projectId: 'foreign-project' } : production, plan: null };
    }
    throw new Error(`Unexpected query ${reference}`);
  },
  mutation: async (reference, args) => {
    calls.push({ reference, args });
    assert.equal(reference, 'createEpisode');
    return { episodeId: 'episode-three', productionId: 'production-new' };
  },
};
const actions = load('src/lib/production/episode-actions.ts', {
  'next/cache': { revalidatePath() {} }, '@/lib/convex/server': { getAuthenticatedConvexClient: async () => client },
  '../../../convex/_generated/api': { api: { projects: { getByExternalId: 'project' }, productions: { listByProject: 'productions', getWorkspaceByProject: 'workspace' }, episodes: { list: 'episodes', create: 'createEpisode' }, continuity: { planningRequirements: 'requirements', listBibles: 'bibles' } } },
  '@/lib/templates/catalog': catalog, '@/lib/ai/video-routing': { normalizeVideoType: value => value },
  '../../../renderer/src/output-presets': outputPresets,
});
function all(element) {
  if (!element || typeof element !== 'object') return [];
  return [element, ...React.Children.toArray(element.props?.children).flatMap(all)];
}

(async () => {
  const navigation = await actions.getEpisodeNavigation(project.externalId);
  assert.equal(navigation.workflow, 'COMEDY'); assert.equal(navigation.inputMode, 'SCRIPT');
  assert.equal(navigation.language, 'pcm'); assert.equal(navigation.outputPreset, 'SQUARE');
  assert.equal(navigation.nextEpisodeNumber, 3);
  const defaults = await actions.getSelectedProductionDefaults(project.externalId, recent._id);
  assert.equal(defaults.durationSeconds, 15); assert.equal(defaults.mode, 'SCRIPT'); assert.equal(defaults.brief, '');
  foreign = true;
  assert.equal(await actions.getSelectedProductionDefaults(project.externalId, recent._id), null);
  const denied = await actions.createProjectEpisode({ projectExternalId: project.externalId, episodeNumber: 3, title: 'Next', durationSeconds: 15, sourceProductionId: recent._id });
  assert.equal(denied.success, false);
  assert(!calls.some(call => call.reference === 'createEpisode'));
  foreign = false; calls = [];
  await actions.createProjectEpisode({ projectExternalId: project.externalId, episodeNumber: 3, title: 'Next', durationSeconds: 15, sourceProductionId: oldest._id });
  assert.deepEqual(calls.find(call => call.reference === 'createEpisode').args, { projectId: project._id, episodeNumber: 3, title: 'Next', durationSeconds: 15, workflow: 'FOOTAGE_TRANSFORM', inputMode: 'FOOTAGE', language: 'fr', outputPreset: 'LANDSCAPE' });
  calls = [];
  await actions.createProjectEpisode({ projectExternalId: project.externalId, episodeNumber: 3, title: 'Next', durationSeconds: 30 });
  assert.equal(calls.find(call => call.reference === 'createEpisode').args.workflow, 'COMEDY');
  console.log('PASS newest-first inheritance, exact selected source, project mismatch denial, and canonical defaults');
  for (const preset of outputPresets.OUTPUT_PRESETS) {
    recent.outputPreset = preset.id;
    assert.equal((await actions.getSelectedProductionDefaults(project.externalId, recent._id)).outputPreset, preset.id);
  }
  recent.outputPreset = 'SOCIAL_VERTICAL';
  assert.equal((await actions.getSelectedProductionDefaults(project.externalId, recent._id)).outputPreset, 'SOCIAL_VERTICAL');
  recent.outputPreset = 'SQUARE'; recent.workflow = 'FIXTURE'; calls = [];
  const unsupported = await actions.createProjectEpisode({ projectExternalId: project.externalId, episodeNumber: 3, title: 'Legacy next', durationSeconds: 8, sourceProductionId: recent._id });
  assert.equal(unsupported.success, false); assert.equal(unsupported.requiresSettings, true);
  assert(!calls.some(call => call.reference === 'createEpisode'));
  const explicit = { mode: 'IDEA', workflow: 'COMEDY', outputPreset: 'CINEMA', language: 'pcm' };
  const recovered = await actions.createProjectEpisode({ projectExternalId: project.externalId, episodeNumber: 3, title: 'Legacy next', durationSeconds: 8, sourceProductionId: recent._id, settings: explicit });
  assert.equal(recovered.success, true);
  assert.deepEqual(calls.find(call => call.reference === 'createEpisode').args, { projectId: project._id, episodeNumber: 3, title: 'Legacy next', durationSeconds: 8, inputMode: 'IDEA', workflow: 'COMEDY', outputPreset: 'CINEMA', language: 'pcm' });
  for (const invalid of [{ mode: 'AUTO' }, { workflow: 'FIXTURE' }, { outputPreset: 'BOGUS' }, { language: '' }, { language: 'not a code' }]) {
    calls = []; assert.equal((await actions.createProjectEpisode({ projectExternalId: project.externalId, episodeNumber: 3, title: 'Legacy next', durationSeconds: 8, sourceProductionId: recent._id, settings: { ...explicit, ...invalid } })).success, false);
    assert(!calls.some(call => call.reference === 'createEpisode'));
  }
  foreign = true; calls = [];
  assert.equal((await actions.createProjectEpisode({ projectExternalId: project.externalId, episodeNumber: 3, title: 'Legacy next', durationSeconds: 8, sourceProductionId: recent._id, settings: explicit })).success, false);
  assert(!calls.some(call => call.reference === 'createEpisode'));
  foreign = false; recent.workflow = 'COMEDY';
  console.log('PASS all seven presets, preserved legacy vertical, explicit legacy recovery, invalid choices and foreign-project override denial');
  const continuity = await actions.getPlanningContinuityOptions(project.externalId, recent._id);
  assert.equal(continuity.bibles.length, 1); assert.equal(continuity.bibles[0].id, 'approved-bible');
  assert.equal(continuity.bibles[0].referenceCount, 1); assert.equal(continuity.bibles[0].ruleCount, 4);
  assert.equal(continuity.bibles[0].rulePreview.length, 3); assert.equal(continuity.bibles[0].rulePreview[1].length, 240);
  assert.equal(continuity.bibles[0].storyPreview.length, 400); assert.equal(continuity.bibles[0].visualStylePreview.length, 240);
  console.log('PASS authorized continuity projection excludes drafts and bounds UI summaries without changing snapshots');

  const cells = []; let cell = 0; let captured;
  const form = load('src/components/production/create-production-form.tsx', {
    react: { ...React, useState(initial) { const index = cell++; if (!(index in cells)) cells[index] = initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; } },
    'next/link': () => null, 'next/navigation': { useRouter: () => ({}) }, sonner: { toast: { error() {}, success() {}, info() {} } },
    '@/lib/project/actions': {}, '@/lib/assets/actions': {}, '@/components/production/planning': {},
    '@/lib/production/actions': { createDirectorPlan: async intent => { captured = intent; return { success: false, error: 'Captured fixture intent.' }; } },
    '@/lib/ai/video-routing': { VIDEO_TYPES: ['ANIMATED_COMEDY_2D'], VIDEO_TYPE_LABELS: { ANIMATED_COMEDY_2D: 'Comedy' } },
    '../../../renderer/src/output-presets': outputPresets,
  }).CreateProductionForm;
  const props = { studioId: 'studio-one', existingProjectId: project.externalId, productionId: recent._id, productionDefaults: defaults, initialMode: 'AD', templateDefaults: catalog.getStarterTemplate('music-montage') };
  const render = () => { cell = 0; return form(props); };
  let elements = all(render());
  assert.equal(elements.find(element => element.props?.id === 'production-duration').props.value, 15);
  assert.equal(elements.find(element => element.props?.id === 'production-output').props.value, 'SQUARE');
  assert.deepEqual(React.Children.toArray(elements.find(element => element.props?.id === 'production-output').props.children).filter(element => element.type === 'option').map(element => element.props.value), outputPresets.OUTPUT_PRESETS.map(preset => preset.id));
  assert.equal(elements.find(element => element.props?.id === 'production-video-type').props.value, 'ANIMATED_COMEDY_2D');
  assert.equal(elements.find(element => element.type === 'button' && element.props['aria-pressed']).props.children[1].props.children, 'Paste a script');
  elements.find(element => element.props?.id === 'production-brief').props.onChange({ target: { value: 'The new episode continues the approved story.' } });
  elements = all(render());
  await elements.find(element => element.type === 'button' && React.Children.toArray(element.props.children).includes(' Show me the plan')).props.onClick();
  assert.equal(captured.productionId, recent._id); assert.equal(captured.projectId, project.externalId);
  assert.equal(captured.requestedDurationSeconds, 15); assert.equal(captured.mode, 'SCRIPT');
  assert.equal(captured.workflow, 'COMEDY'); assert.equal(captured.language, 'pcm'); assert.equal(captured.outputPreset, 'SQUARE');
  assert.equal(captured.script, 'The new episode continues the approved story.');
  console.log('PASS saved production beats query/template defaults and the actual planning intent preserves selected settings');

  props.continuityOptions = { requiresBible: true, selectionError: null, bibles: [{ id: 'approved-bible', versionNumber: 4, referenceCount: 2, ruleCount: 1, rulePreview: ['Keep the lead character identity.'], storyPreview: 'An ongoing comedy.', visualStylePreview: 'Original 2D cartoon.' }] };
  elements = all(render());
  assert.equal(elements.find(element => element.props?.id === 'production-continuity').props.value, '');
  assert(!elements.some(element => element.props?.['aria-label'] === 'Selected approved project references'));
  const manageReferences = elements.find(element => element.props?.href?.includes('/workspace/media'));
  assert.equal(manageReferences.props.href, `/dashboard/projects/${project.externalId}/workspace/media?production=${recent._id}`);
  elements.find(element => element.props?.id === 'production-continuity').props.onChange({ target: { value: 'approved-bible' } });
  elements = all(render());
  const selectedSummary = elements.find(element => element.props?.['aria-label'] === 'Selected approved project references');
  assert(selectedSummary);
  assert(all(selectedSummary).some(element => element.props?.children === 'Keep the lead character identity.'));
  await elements.find(element => element.type === 'button' && React.Children.toArray(element.props.children).includes(' Show me the plan')).props.onClick();
  assert.equal(captured.continuityBibleId, 'approved-bible'); assert.equal(captured.continuityMode, 'USE_APPROVED_BIBLE');
  elements.find(element => element.props?.id === 'production-continuity').props.onChange({ target: { value: 'NEW_BLANK_BIBLE' } });
  elements = all(render());
  assert(!elements.some(element => element.props?.['aria-label'] === 'Selected approved project references'));
  await elements.find(element => element.type === 'button' && React.Children.toArray(element.props.children).includes(' Show me the plan')).props.onClick();
  assert.equal(captured.continuityBibleId, undefined); assert.equal(captured.continuityMode, 'NEW_BLANK_BIBLE');
  console.log('PASS explicit approved-reference selection, exact summary/navigation, and deliberate blank selection without identity defaults');

  const pickerCells = []; let pickerCell = 0; let submittedEpisode; let pendingEpisode;
  const Picker = load('src/components/production-workspace/episode-picker.tsx', {
    react: { ...React, useEffect() {}, useState(initial) { const index = pickerCell++; if (!(index in pickerCells)) pickerCells[index] = initial; return [pickerCells[index], value => { pickerCells[index] = typeof value === 'function' ? value(pickerCells[index]) : value; }]; }, useTransition: () => [false, fn => { pendingEpisode = fn(); }] },
    'next/navigation': { useRouter: () => ({ push() {} }), usePathname: () => '/workspace', useSearchParams: () => new URLSearchParams() },
    '@/components/ui/button': { Button: () => null },
    '@/lib/production/episode-actions': { createProjectEpisode: async value => { submittedEpisode = value; return { success: true, productionId: 'new-production' }; } },
    '../../../renderer/src/output-presets': outputPresets,
  }).EpisodePicker;
  const renderPicker = () => { pickerCell = 0; return all(Picker({ projectExternalId: project.externalId, options: [{ productionId: recent._id, title: 'Older source', settingsSupported: false }], selectedProductionId: recent._id, nextEpisodeNumber: 3 })); };
  let picker = renderPicker();
  picker.find(element => element.props?.children === 'New episode').props.onClick();
  picker = renderPicker();
  assert.equal(picker.find(element => element.props?.type === 'submit').props.disabled, true);
  for (const label of ['New episode starting mode', 'New episode workflow', 'New episode output format', 'New episode language']) assert.equal(picker.find(element => element.props?.['aria-label'] === label).props.value, '');
  picker.find(element => element.props?.id === 'episode-title').props.onChange({ target: { value: 'Deliberate continuation' } });
  for (const [label, value] of [['New episode starting mode', 'SCRIPT'], ['New episode workflow', 'COMEDY'], ['New episode output format', 'TALL_FRAME'], ['New episode language', 'pcm']]) picker.find(element => element.props?.['aria-label'] === label).props.onChange({ target: { value } });
  picker = renderPicker();
  assert.equal(picker.find(element => element.props?.type === 'submit').props.disabled, false);
  picker.find(element => element.type === 'form').props.onSubmit({ preventDefault() {} }); await pendingEpisode;
  assert.equal(submittedEpisode.sourceProductionId, recent._id);
  assert.deepEqual(submittedEpisode.settings, { mode: 'SCRIPT', workflow: 'COMEDY', outputPreset: 'TALL_FRAME', language: 'pcm' });
  console.log('PASS older-source picker requires deliberate empty-to-selected settings and submits source identity unchanged');

  function FormStub() { return null; }
  let implicitProductionId;
  const CreatePage = load('src/app/(dashboard)/dashboard/create/page.tsx', {
    'next/link': () => null, 'next/navigation': { notFound() { throw new Error('404'); } },
    '@/lib/guards': { requireAuth: async () => {} }, '@/components/production/create-production-form': { CreateProductionForm: FormStub },
    '@/lib/project/actions': { getStudioContext: async () => ({ studioId: 'unrelated-selected-workspace' }) },
    '@/lib/production/episode-actions': { ...actions, getPlanningContinuityOptions: async () => implicitProductionId ? { productionId: implicitProductionId, requiresBible: false, bibles: [], selectionError: null } : undefined },
    '@/lib/templates/actions': { getTemplateDefaultsForProject: async () => catalog.getStarterTemplate('music-montage') }, '@/lib/templates/catalog': catalog,
  }).default;
  const first = all(await CreatePage({ searchParams: Promise.resolve({ project: project.externalId, production: recent._id, mode: 'AD' }) })).find(element => element.type === FormStub);
  const second = all(await CreatePage({ searchParams: Promise.resolve({ project: project.externalId, production: oldest._id }) })).find(element => element.type === FormStub);
  assert.notEqual(first.key, second.key); assert.equal(first.props.productionDefaults.productionId, recent._id);
  assert.equal(first.props.studioId, project.studioExternalId);
  implicitProductionId = recent._id;
  const legacy = all(await CreatePage({ searchParams: Promise.resolve({ project: project.externalId }) })).find(element => element.type === FormStub);
  assert.equal(legacy.props.productionId, recent._id); assert.equal(legacy.props.productionDefaults.durationSeconds, 15);
  implicitProductionId = undefined;
  await assert.rejects(CreatePage({ searchParams: Promise.resolve({ production: recent._id }) }), /404/);
  foreign = true;
  await assert.rejects(CreatePage({ searchParams: Promise.resolve({ project: project.externalId, production: recent._id }) }), /404/);
  foreign = false; transportFailure = true;
  await assert.rejects(CreatePage({ searchParams: Promise.resolve({ project: project.externalId, production: recent._id }) }), /temporary query unavailable/);
  console.log('PASS production selection remounts the form, retains its workspace and denies mismatched URLs');
})().catch(error => { console.error(error); process.exitCode = 1; });
