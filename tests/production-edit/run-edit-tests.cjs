const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function check(label, callback) {
  try {
    callback();
    console.log(`PASS: ${label}`);
  } catch (error) {
    console.error(`FAIL: ${label}`);
    throw error;
  }
}

const operationsSource = read('convex/productionOperations.ts');
const timelineSource = read('convex/timeline.ts');
const renderContractsSource = read('src/lib/render/contracts.ts');
const promptEditSource = read('src/components/editor/production-edit/prompt-edit-panel.tsx');
const impactSummarySource = read('src/components/editor/production-edit/edit-impact-summary.tsx');
const workspaceSource = read('src/app/(dashboard)/dashboard/projects/[id]/workspace/[section]/page.tsx');

check('supported editing operation names remain explicit and provider-neutral', () => {
  const match = operationsSource.match(/const operationKinds = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(match, 'production operation allowlist must remain discoverable');

  const supported = [...match[1].matchAll(/"([A-Z_]+)"/g)].map((item) => item[1]);
  assert.deepEqual(supported, [
    'EDIT_PROMPT',
    'PROMPT_EDIT',
    'REPLACE_MEDIA',
    'REGENERATE',
    'REGENERATE_TAKE',
    'TRIM',
    'SPLIT',
    'REORDER',
    'UPDATE_TEXT',
    'UPDATE_CAPTIONS',
    'ADJUST_AUDIO',
    'ADD_TRANSITION',
    'REMOVE_TRANSITION',
    'ADD_NODE',
    'UPDATE_NODE',
    'REMOVE_NODE',
    'RECONNECT_NODE',
    'REQUEST_REVIEW',
  ]);
});

check('editing operation creation requires an idempotency key', () => {
  assert.match(operationsSource, /idempotencyKey:\s*v\.string\(\)/);
  assert.match(operationsSource, /const idempotencyKey = requireIdempotencyKey\(args\.idempotencyKey\)/);
  assert.match(operationsSource, /withIndex\("by_idempotency"/);
  assert.match(operationsSource, /This idempotency key is already associated with another operation/);
});

check('idempotency keys have bounded, non-empty validation', () => {
  assert.match(
    operationsSource,
    /function requireIdempotencyKey\(value: string\)[\s\S]*?key\.length < 8[\s\S]*?key\.length > 200[\s\S]*?Idempotency key must be between 8 and 200 characters\./,
  );
});

check('impact preview is read-only and does not reserve credits', () => {
  assert.match(operationsSource, /export const previewImpact = query\(/);
  assert.match(operationsSource, /requiresCreditReservation:\s*false/);
  assert.match(impactSummarySource, /No credits are used for this preview\./);
  assert.match(impactSummarySource, /Making a new video take is a separate step that will ask for approval first\./);
});

check('prompt edits require explicit user confirmation before saving', () => {
  assert.match(promptEditSource, /const \[confirmed, setConfirmed\] = useState\(false\)/);
  assert.match(promptEditSource, /const canSubmit = Boolean\(trimmedInstruction && impact && confirmed/);
  assert.match(promptEditSource, /I have reviewed what may change and want to save this request/);
  assert.match(promptEditSource, /Saving the request uses no credits\./);
  assert.match(promptEditSource, /FinalFrame will ask for approval before any new generation begins\./);
});

check('timeline and workspace contracts preserve locked/read-only expectations', () => {
  for (const status of ['DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'LOCKED', 'SUPERSEDED']) {
    assert.match(renderContractsSource, new RegExp(`'${status}'`), `${status} timeline status must remain supported`);
  }
  assert.match(timelineSource, /status:\s*"DRAFT"/);
  assert.match(workspaceSource, /Exports will be built from a locked timeline/);
});

check('editing foundation does not silently execute provider work', () => {
  const previewStart = operationsSource.indexOf('export const previewImpact = query(');
  assert.ok(previewStart >= 0, 'impact preview handler must exist');
  const previewSource = operationsSource.slice(previewStart);
  assert.doesNotMatch(previewSource, /ctx\.scheduler|fetch\(|reserve|generationJobs|credits\./i);
});

console.log('Provider calls: 0 (deterministic source contracts only)');
console.log('Production editing contracts: PASS');
console.warn('BLOCKER: Convex mutations/queries are not imported directly because they require generated Convex runtime and authenticated context; this test intentionally verifies the pure source contracts and UI confirmation boundary.');
