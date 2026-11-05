const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const file = path.resolve(__dirname, '../../src/components/production-workspace/shot-assignment-controls.tsx');
const compiled = new Module(file, module);
compiled.filename = file;
let mutations = 0;
const imports = {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'next/navigation': { useRouter: () => ({ refresh() {} }) },
  '@/components/ui/button': { Button: ({ children, disabled, onClick }) => React.createElement('button', { disabled, onClick }, children) },
  '@/lib/production/workspace-actions': { bindShotResources: async () => { mutations++; return { success: true }; } },
  './resource-approval-controls': { controlInput: 'control' },
};
compiled.require = name => { if (Object.hasOwn(imports, name)) return imports[name]; throw Error('Unexpected import ' + name); };
compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, file);
const { ShotAssignmentControls } = compiled.exports;
const data = { projectExternalId: 'project', productionId: 'production', boundResources: [
  { id: 'lead', kind: 'CHARACTER', name: 'Ada', versionNumber: 1, state: 'APPROVED', voiceVersionId: 'voice1' },
  { id: 'support', kind: 'CHARACTER', name: 'Bisi', versionNumber: 2, state: 'LOCKED', voiceVersionId: 'voice2' },
  { id: 'shirt', kind: 'COSTUME', name: 'Blue shirt', versionNumber: 1, state: 'APPROVED' },
  { id: 'place', kind: 'LOCATION', name: 'Market', versionNumber: 1, state: 'APPROVED' },
  { id: 'draft', kind: 'CHARACTER', name: 'Unapproved person', versionNumber: 1, state: 'DRAFT', voiceVersionId: 'voice3' },
] };
const shot = { id: 'shot', durationSeconds: 5, resourceVersionIds: ['lead', 'support', 'shirt', 'place'], resourceBindings: [
  { role: 'lead_actor', resourceVersionId: 'lead', voiceVersionId: 'voice1' },
  { role: 'supporting_actor', resourceVersionId: 'support', voiceVersionId: 'voice2' },
  { role: 'lead_outfit', resourceVersionId: 'shirt', characterResourceVersionId: 'lead' },
  { role: 'market_location', resourceVersionId: 'place' },
], dialogueSegments: [{ speakerResourceVersionId: 'lead', voiceVersionId: 'voice1', startSeconds: 0.5, durationSeconds: 2, text: 'Where did it go?', delivery: 'puzzled' }] };
const render = (props = {}) => renderToStaticMarkup(React.createElement(ShotAssignmentControls, { data, shot, editable: true, ...props }));
const html = render();
assert.match(html, /value="lead_actor"/);
assert.match(html, /value="supporting_actor"/);
assert.match(html, /Character using Blue shirt/);
assert.doesNotMatch(html, /Character using Market/);
assert.match(html, /Ada · approved voice/); assert.match(html, /Bisi · approved voice/);
assert.doesNotMatch(html, /Unapproved person/);
const withdrawn = render({ data: { ...data, boundResources: data.boundResources.map(resource => resource.id === 'support' ? { ...resource, state: 'REVISION_REQUESTED' } : resource) } });
assert.match(withdrawn, /Bisi needs approval/);
assert.match(withdrawn, /Remove unavailable reference/);
assert.match(html, /Where did it go\?/);
assert.match(html, /Remove this character’s dialogue and other resource assignments first/);
assert.match(html, /Save shot bindings/);
const readonly = render({ editable: false });
assert.doesNotMatch(readonly, /Save shot bindings|Add spoken line|Remove role assignment/);
assert.match(readonly, /disabled=""[^>]*value="lead_actor"/);
const noVoice = render({ data: { ...data, boundResources: data.boundResources.map(resource => ({ ...resource, voiceVersionId: undefined })) } });
assert.match(noVoice, /disabled="">Add spoken line/);
assert.equal(mutations, 0);
console.log('PASS assignment UI: independent character roles, frozen voice speakers, costume association, draft exclusion, read-only approval and zero writes on render.');
