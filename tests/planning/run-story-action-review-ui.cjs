const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { load } = require('../recipes/backend-fixture.cjs');

const actions = ['lift', 'smile'].map((id, i) => ({
  id, subject: 'Presenter', action: id, startSeconds: i * 2, endSeconds: i * 2 + 2, beforeSeconds: i * 2 + 1,
}));
const data = { actions, requirementKey: 'requirement-1', latest: null };
const writes = [];
let slots = [], cursor = 0;
const hooks = {
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  },
};
const file = path.resolve('src/components/production-workspace/story-action-review.tsx');
const component = new Module(file, module);
component.filename = file;
component.paths = Module._nodeModulePaths(path.dirname(file));
const stubs = {
  react: hooks,
  'convex/react': { useQuery: () => data, useMutation: () => async args => { writes.push(args); } },
  '../../../convex/_generated/api': { api: { storyActionReviews: { get: 'get', record: 'record' } } },
  '@/lib/production/story-actions': load('src/lib/production/story-actions.ts'),
  '@/components/ui/button': { Button: 'button' },
  './story-action-assistant': { StoryActionAssistant: 'assistant' },
  './performance-cutaway': { PerformanceCutaway: 'cutaway' },
  './story-repair-region': { StoryRepairRegion: 'region' },
};
component.require = name => stubs[name] ?? require(name);
component._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, file);
const review = component.exports.StoryActionReview;

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  return node && typeof node === 'object' ? [node, ...elements(node.props.children)] : [];
}
const button = (nodes, label) => nodes.find(node => node.type === 'button' && node.props.children === label);
const fields = (nodes, type) => nodes.filter(node => node.type === type);
function panel(canReview = true) {
  const section = review({ takeId: 'take', canEdit: false, canReview });
  const inner = elements(section).find(node => typeof node.type === 'function');
  cursor = 0;
  return { key: inner.key, nodes: elements(inner.type(inner.props)) };
}
function change(node, value) { node.props.onChange({ target: { value } }); }
async function main() {
  let rows = panel().nodes;
  assert.equal(fields(rows, 'fieldset').length, 1);
  assert.equal(fields(rows, 'p').some(n => n.props.children === 'lift'), true);
  assert.equal(button(rows, 'Save action review'), undefined);
  change(fields(rows, 'select')[0], 'PASS');
  rows = panel().nodes;
  change(fields(rows, 'input')[0], '1.1'); // Late against lift's 1s deadline.
  change(fields(rows, 'input')[1], '1.7');
  change(fields(rows, 'textarea')[0], 'The hand lifted the blue mug.');
  button(panel().nodes, 'Next action').props.onClick();
  rows = panel().nodes;
  assert.equal(fields(rows, 'p').some(n => n.props.children === 'smile'), true);
  change(fields(rows, 'select')[0], 'FAIL');
  change(fields(rows, 'textarea')[0], 'The smile never became visible.');
  button(panel().nodes, 'Save action review').props.onClick();
  rows = panel().nodes;
  assert.equal(rows.find(n => n.props.role === 'alert').props.children.includes('timing'), true);
  assert.equal(writes.length, 0);
  assert.equal(fields(rows, 'textarea')[0].props.value, 'The hand lifted the blue mug.');
  change(fields(rows, 'input')[0], '0.5');
  button(panel().nodes, 'Next action').props.onClick();
  rows = panel().nodes;
  assert.equal(fields(rows, 'textarea')[0].props.value, 'The smile never became visible.');
  button(rows, 'Previous action').props.onClick();
  assert.equal(fields(panel().nodes, 'input')[0].props.value, 0.5);
  button(panel().nodes, 'Next action').props.onClick();
  button(panel().nodes, 'Save action review').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(writes, [{
    takeId: 'take', requirementKey: 'requirement-1', observations: [
      { actionId: 'lift', result: 'PASS', observedStartSeconds: 0.5, observedEndSeconds: 1.7, evidence: 'The hand lifted the blue mug.' },
      { actionId: 'smile', result: 'FAIL', observedStartSeconds: null, observedEndSeconds: null, evidence: 'The smile never became visible.' },
    ],
  }]);
  assert.equal(panel().nodes.some(n => n.props.children === 'Action review saved.'), true);
  const firstKey = panel().key;
  data.requirementKey = 'requirement-2';
  assert.notEqual(panel().key, firstKey, 'new requirements must remount the keyed draft');
  slots = [];
  assert.equal(fields(panel().nodes, 'select')[0].props.value, '');
  button(panel().nodes, 'Next action').props.onClick();
  button(panel().nodes, 'Save action review').props.onClick();
  assert.equal(panel().nodes.find(n => n.props.role === 'alert').props.children, 'Choose what you saw for this action.');
  data.latest = { requirementKey: data.requirementKey, observations: writes[0].observations, passed: false };
  slots = [];
  rows = panel(false).nodes;
  assert.equal(fields(rows, 'fieldset')[0].props.disabled, true);
  assert.equal(fields(rows, 'select')[0].props.value, 'PASS');
  button(rows, 'Next action').props.onClick();
  assert.equal(fields(panel(false).nodes, 'select')[0].props.value, 'FAIL');
  assert.equal(button(panel(false).nodes, 'Save action review'), undefined);
  assert.equal(writes.length, 1);
  console.log('PASS single action, draft navigation, timing, incomplete answers, batch save, scoped reset and read-only navigation.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
