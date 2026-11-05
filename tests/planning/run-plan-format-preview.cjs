const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../..');

function load(file, imports = {}) {
  const filename = path.join(root, file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(imports, name) ? imports[name] : normalRequire(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  return mod.exports;
}
const formats = load('renderer/src/output-presets.ts');
const { PlanPreview } = load('src/components/production/planning/plan-preview.tsx', {
  '../../../../renderer/src/output-presets': formats,
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
});
const preview = {
  title: 'Original planning fixture', summary: 'Review framing before approval.',
  script: { text: 'Original script.', source: 'AI_DRAFT', label: 'Draft script' },
  creativeGuide: { visualStyle: 'Original', tone: 'Warm', pace: 'Clear', palette: 'Neutral', notes: [], characters: [], locations: [], products: [] },
  parts: [{ id: 'scene', title: 'Scene', purpose: 'Setup', description: 'Original coverage.', takes: [{ id: 'shot', title: 'First take', prompt: 'Original action.', durationSeconds: 6, aspectRatio: '16:9', status: 'PLANNED', requiredAssetCount: 0 }] }],
  estimate: { totalCredits: 1, lineItems: [] },
};
let actions = 0;
function render(outputPreset, selected = preview) {
  return renderToStaticMarkup(React.createElement(PlanPreview, { preview: selected, balance: 10, outputPreset, qualityTier: 'STANDARD', isSubmitting: false, onApprove: () => actions++, onBack: () => actions++, onRevise: () => actions++ }));
}
for (const format of formats.OUTPUT_PRESETS) {
  const html = render(format.id);
  assert(html.includes(`${format.label} · ${format.aspectRatio} · ${format.width}×${format.height}`));
  assert(html.includes('requested final canvas'));
  assert(html.includes('Planned · 6s · generation 16:9'));
  assert.equal(html.includes('A proposed generation shape differs'), format.aspectRatio !== '16:9');
}
assert(render('SOCIAL_VERTICAL').includes('Vertical · 9:16 · 1080×1920'));
console.log('PASS all seven requested final canvases and the historical vertical alias display their actual dimensions');
const portrait = render('PORTRAIT_FEED');
assert(portrait.includes('Different from the 4:5 final canvas.'));
assert(portrait.includes('Review the framing assumptions before approval'));
assert(!portrait.includes('generation 4:5'));
console.log('PASS nonnative 4:5 composition keeps the actual proposed 16:9 generation shape visible before approval');
const legacy = structuredClone(preview); delete legacy.parts[0].takes[0].aspectRatio;
const historical = render('CINEMA', legacy);
assert(historical.includes('generation shape not recorded'));
assert(!historical.includes('generation 21:9'));
assert.equal(actions, 0);
console.log('PASS missing legacy generation shape is honest and rendering the preview triggers no actions');
