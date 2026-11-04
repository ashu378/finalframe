// Inspect rendered form semantics and actual state handlers without a browser.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server'), { parse } = require('next/dist/compiled/node-html-parser');
const root = path.resolve(__dirname, '../..');
function harness(graphicsV2Enabled = false, fixture = {}) {
  const cells = [], calls = []; let at = 0, tree;
  const hooks = { ...React, useState(initial) { const i = at++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], value => cells[i] = typeof value === 'function' ? value(cells[i]) : value]; }, useTransition: () => [false, run => run()] };
  const filename = path.join(root, 'src/components/production-workspace/timeline-composer.tsx'), m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename)); const normal = m.require.bind(m);
  function Button({ children, variant, size, ...props }) { void variant; void size; return React.createElement('button', props, children); }
  const stubs = { react: hooks, 'next/navigation': { useRouter: () => ({ refresh() { calls.push('refresh'); } }) }, '@/components/ui/button': { Button }, './resource-approval-controls': { ApprovalControls: () => null, controlInput: 'fixture-control' }, '@/lib/production/workspace-actions': { buildWorkspaceTimelineManifest: async () => { calls.push('build'); }, createWorkspaceTimeline: async () => { calls.push('create'); } }, '@/lib/production/workspace-controls': { validateCompositionAudioTracks() {} }, './graphic-designer': { GraphicDesigner: () => null, emptyGraphicDraft: () => ({}) }, '../../../renderer/src/templates/graphics-v2-contract': { parseGraphicsV2Authoring() {} }, './soundtrack-editor': { SoundtrackEditor: () => null } };
  m.require = name => Object.prototype.hasOwnProperty.call(stubs, name) ? stubs[name] : normal(name); m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  const data = { canEdit: true, versionState: 'APPROVED', scenes: [], assets: [], timelines: [], graphicsV2Enabled, ...fixture };
  function render() { at = 0; tree = m.exports.TimelineComposer({ data }); return parse(renderToStaticMarkup(tree)); }
  function find(predicate, node) { if (arguments.length === 1) node = tree; if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { for (const child of node) { const hit = find(predicate, child); if (hit) return hit; } return; } return predicate(node) ? node : find(predicate, node.props?.children); }
  return { calls, render, find };
}
const text = node => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
// Name resolution accepts ARIA naming, explicit native labels or implicit labels;
// tests do not require a particular source attribute or JSX layout.
function controlName(node, document) {
  const labelledBy = node.getAttribute('aria-labelledby');
  if (labelledBy) return labelledBy.split(/\s+/).map(id => text(document.querySelector('[id="' + id + '"]'))).join(' ');
  if (node.hasAttribute('aria-label')) return node.getAttribute('aria-label');
  const id = node.getAttribute('id');
  if (id) { const label = document.querySelector('label[for="' + id + '"]'); if (label) return text(label); }
  let parent = node.parentNode; while (parent && parent.rawTagName !== 'label') parent = parent.parentNode;
  return text(parent);
}
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
check('both composer branches expose one exactly named output-size and frame-rate selector with unchanged choices/defaults', () => {
  for (const graphics of [false, true]) {
    const h = harness(graphics), doc = h.render(), controls = doc.querySelectorAll('select');
    const byName = name => { const found = controls.filter(n => controlName(n, doc) === name); assert.equal(found.length, 1, 'one selectable control named ' + name); return found[0]; };
    const size = byName('Video size'), fps = byName('Frames per second');
    assert.deepEqual(size.querySelectorAll('option').map(n => n.getAttribute('value')), ['', 'small-landscape', 'landscape-720', 'landscape-1080', 'square', 'portrait']);
    assert.equal(size.querySelector('option[selected]').getAttribute('value'), ''); assert.equal(fps.querySelector('option[selected]').getAttribute('value'), '30');
    assert.deepEqual(fps.querySelectorAll('option').map(n => n.getAttribute('value')), ['24', '25', '30', '50', '60']);
    if (!graphics) byName('Card design');
    for (const control of doc.querySelectorAll('input, select, textarea')) assert(controlName(control, doc), 'every composer input has a rendered accessible name');
    assert.deepEqual(h.calls, []);
  }
});
check('named selectors retain user choices through actual change handlers without starting a mutation', () => {
  const h = harness(); h.render();
  h.find(n => n.type === 'select' && n.props['aria-label'] === 'Video size').props.onChange({ target: { value: 'small-landscape' } });
  h.find(n => n.type === 'select' && n.props['aria-label'] === 'Frames per second').props.onChange({ target: { value: '24' } });
  const doc = h.render(), selected = name => doc.querySelectorAll('select').find(n => controlName(n, doc) === name).querySelector('option[selected]').getAttribute('value');
  assert.equal(selected('Video size'), 'small-landscape'); assert.equal(selected('Frames per second'), '24'); assert.deepEqual(h.calls, []);
});
check('an approved take with draft source media links to this production’s Media page and cannot be added', () => {
  const asset = { id: 'asset', state: 'DRAFT', mimeType: 'video/mp4' };
  const h = harness(false, {
    projectExternalId: 'project|fixture',
    productionId: 'production',
    assets: [asset],
    scenes: [{ title: 'Scene', shots: [{ title: 'Shot', durationSeconds: 4, takes: [{ id: 'take', assetId: asset.id, state: 'LOCKED', versionNumber: 1 }] }] }],
  });
  h.render();
  h.find(n => n.type === 'select' && n.props['aria-label'] === 'Approved shot take').props.onChange({ target: { value: 'take' } });
  const doc = h.render(), add = () => h.find(n => n.props?.children === 'Add selected take' && n.props.onClick);
  assert(add().props.disabled);
  assert.equal(doc.querySelector('a').getAttribute('href'), '/dashboard/projects/project%7Cfixture/workspace/media?production=production');
  asset.state = 'APPROVED';
  h.render();
  assert.equal(add().props.disabled, false);
  assert.deepEqual(h.calls, []);
});
console.log(`Composer labels UI: ${checks} PASS; actual SSR semantics/state handlers; no browser/DB/provider calls.`);
