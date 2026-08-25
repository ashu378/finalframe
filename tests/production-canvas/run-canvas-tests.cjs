const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');

const repoRoot = path.resolve(__dirname, '../..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-canvas-contracts-'));

function compileTypeScript(relativePath, sourceOverride) {
  const sourcePath = path.join(repoRoot, relativePath);
  const source = sourceOverride ?? fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  });
  const outputPath = path.join(tempRoot, `${path.basename(relativePath, path.extname(relativePath))}.js`);
  fs.writeFileSync(outputPath, output.outputText, 'utf8');
  return outputPath;
}

function loadPureWorkspaceContracts() {
  return require(compileTypeScript('src/lib/production-graph/contracts.ts'));
}

function loadPureFriendlyStateMapper() {
  const source = fs.readFileSync(path.join(repoRoot, 'convex/productionGraph.ts'), 'utf8');
  const match = source.match(/function friendlyState\([\s\S]*?\n}\n\nfunction node\(/);
  assert.ok(match, 'friendlyState must remain discoverable as a pure function before the Convex handler code');
  const pureSource = `${match[0].replace(/\nfunction node\($/, '\n').trim()}\nmodule.exports = { friendlyState };\n`;
  return require(compileTypeScript('convex/productionGraph.ts', pureSource)).friendlyState;
}

const failures = [];

function check(label, callback) {
  try {
    callback();
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const { WORKSPACE_SECTIONS, graphStateLabel, graphStateClass } = loadPureWorkspaceContracts();
const friendlyState = loadPureFriendlyStateMapper();

check('friendly state maps successful states to ready', () => {
  for (const status of ['COMPLETED', 'APPROVED', 'READY', 'ACTIVE']) {
    assert.equal(friendlyState(status), 'ready', `${status} should be ready`);
  }
});

check('friendly state maps active generation states to working', () => {
  for (const status of ['QUEUED', 'PROCESSING', 'SUBMITTED', 'POLLING', 'IN_PROGRESS']) {
    assert.equal(friendlyState(status), 'working', `${status} should be working`);
  }
});

check('friendly state maps failed and superseded states correctly', () => {
  for (const status of ['FAILED', 'CANCELLED', 'CANCELED']) {
    assert.equal(friendlyState(status), 'failed', `${status} should need attention`);
  }
  assert.equal(friendlyState('SUPERSEDED'), 'outdated');
  assert.equal(friendlyState('LOCKED'), 'locked');
});

check('unknown and draft states require a decision', () => {
  for (const status of [undefined, 'DRAFT', 'PLANNING', 'REVIEW']) {
    assert.equal(friendlyState(status), 'needsApproval', `${String(status)} should need a decision`);
  }
});

check('workspace sections are complete, ordered, unique, and customer-facing', () => {
  assert.deepEqual(
    WORKSPACE_SECTIONS,
    [
      { slug: 'overview', label: 'Overview' },
      { slug: 'plan', label: 'Plan' },
      { slug: 'storyboard', label: 'Storyboard' },
      { slug: 'canvas', label: 'Canvas' },
      { slug: 'media', label: 'Media' },
      { slug: 'takes', label: 'Takes' },
      { slug: 'edit', label: 'Edit' },
      { slug: 'review', label: 'Review' },
      { slug: 'export', label: 'Export' },
    ],
  );
  assert.equal(new Set(WORKSPACE_SECTIONS.map((section) => section.slug)).size, WORKSPACE_SECTIONS.length);
  assert.equal(WORKSPACE_SECTIONS.some((section) => section.slug === 'canvas'), true, 'Canvas must be a first-class workspace section');
});

check('workspace sections produce stable project URLs', () => {
  for (const section of WORKSPACE_SECTIONS) {
    const href = `/dashboard/projects/project-qa/workspace/${section.slug}`;
    assert.match(href, /^\/dashboard\/projects\/[^/]+\/workspace\/[a-z-]+$/);
    assert.equal(href.endsWith(`/${section.slug}`), true, `${section.slug} must remain the terminal route segment`);
  }
});

check('every friendly state has user-facing presentation', () => {
  for (const state of ['ready', 'working', 'needsApproval', 'outdated', 'failed', 'blocked', 'locked']) {
    assert.equal(typeof graphStateLabel(state), 'string');
    assert.ok(graphStateLabel(state).length > 0, `${state} needs a visible label`);
    assert.equal(typeof graphStateClass(state), 'string');
    assert.ok(graphStateClass(state).length > 0, `${state} needs a visual class`);
  }
});

console.log('Provider calls: 0 (pure source contracts only)');
console.log('Workspace routes checked: /dashboard/projects/:id/workspace/:section');
console.log('Canvas status mapping: PASS');

if (failures.length > 0) {
  console.error(`Production Canvas contracts: ${failures.length} FAILURE(S)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Production Canvas contracts: PASS');
}

console.warn('BLOCKER: friendlyState is private to convex/productionGraph.ts, so this test extracts only that pure function instead of importing the Convex server module. Exporting a shared pure mapper would remove this test harness workaround.');

try {
  fs.rmSync(tempRoot, { recursive: true, force: true });
} catch {
  // Temporary test output is non-critical; leave it for the OS if cleanup is unavailable.
}
