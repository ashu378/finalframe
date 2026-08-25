const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');
const failures = [];

const repoRoot = path.resolve(__dirname, '../..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-planning-contracts-'));

function compileModule(relativePath) {
  const sourcePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  });
  const outputPath = path.join(tempRoot, path.basename(relativePath, '.ts') + '.js');
  fs.writeFileSync(outputPath, output.outputText, 'utf8');
  return outputPath;
}

compileModule('src/lib/ai/types.ts');
const qualityPath = compileModule('src/lib/ai/planning/quality.ts');
const { inspectPlanQuality, assertPlanQuality, hasBlockingQualityGate } = require(qualityPath);
const fixturePath = compileModule('tests/planning/fixtures.ts');
const { validCreateIntent, validDirectorPlan, genericShot } = require(fixturePath);

// This suite deliberately does not import an adapter or call fetch.
global.fetch = async () => { throw new Error('Live provider access is forbidden in planning contract tests'); };

function expectThrow(label, callback, expectedText) {
  try {
    assert.throws(callback, (error) => {
      assert.match(String(error && error.message), expectedText, label);
      return true;
    }, label);
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertCreateIntentContract(intent, label) {
  assert.equal(typeof intent.preset, 'string', `${label}: preset is required`);
  assert.equal(typeof intent.inputMode, 'string', `${label}: inputMode is required`);
  assert.equal(typeof intent.durationSeconds, 'number', `${label}: duration is required`);
  assert.ok(intent.durationSeconds > 0, `${label}: duration must be positive`);
  assert.ok(Array.isArray(intent.inputAssetIds), `${label}: inputAssetIds must be an array`);
  assert.ok(intent.brief || intent.script || intent.inputAssetIds.length > 0, `${label}: one creative input is required`);
}

assertCreateIntentContract(validCreateIntent, 'valid idea-first intent');
assert.doesNotThrow(() => assertCreateIntentContract({
  ...validCreateIntent,
  inputMode: 'SCRIPT',
  brief: 'A script-led scene',
  script: 'The character enters, reacts, and exits.',
}), 'script-first intent should not require voice');
assert.doesNotThrow(() => assertCreateIntentContract({
  ...validCreateIntent,
  inputMode: 'VOICE',
  brief: 'Animate my performance',
  inputAssetIds: ['voice-asset-1'],
}), 'voice-first intent should accept one uploaded audio asset');
expectThrow('idea-first intent requires a creative input', () => assertCreateIntentContract({ ...validCreateIntent, brief: '', script: '', inputAssetIds: [] }), /creative input/);
expectThrow('invalid duration is rejected', () => assertCreateIntentContract({ ...validCreateIntent, durationSeconds: 0 }), /duration must be positive/);

const validReport = inspectPlanQuality(validDirectorPlan, validCreateIntent);
assert.equal(validReport.ok, true, 'valid DirectorPlan must pass deterministic quality checks');
assert.equal(validReport.totalShotSeconds, 18, 'quality report must calculate ordered shot duration');
assert.equal(validReport.dialogueCoverageSeconds, 12, 'quality report must calculate dialogue coverage');
assert.doesNotThrow(() => assertPlanQuality(validDirectorPlan, validCreateIntent), 'valid DirectorPlan should be accepted');
expectThrow('duplicate shots are rejected', () => assertPlanQuality({ ...validDirectorPlan, shots: [validDirectorPlan.shots[0], { ...validDirectorPlan.shots[1], purpose: validDirectorPlan.shots[0].purpose, action: validDirectorPlan.shots[0].action, prompt: validDirectorPlan.shots[0].prompt }] }), /duplicates shot/);
expectThrow('unknown dialogue segments are rejected', () => assertPlanQuality({ ...validDirectorPlan, shots: [{ ...validDirectorPlan.shots[0], dialogueSegmentIds: ['missing-segment'] }, validDirectorPlan.shots[1]] }), /references dialogue segment/);
expectThrow('missing continuity rules are rejected', () => assertPlanQuality({ ...validDirectorPlan, creativeGuide: { ...validDirectorPlan.creativeGuide, continuityRules: [] } }), /continuity rule/);
expectThrow('duration mismatch is rejected', () => assertPlanQuality({ ...validDirectorPlan, durationSeconds: 30 }), /Shot duration/);
expectThrow('generic shots must be rejected before generation', () => assertPlanQuality({ ...validDirectorPlan, shots: [genericShot], durationSeconds: genericShot.durationSeconds }), /generic|specific|purpose|action|prompt/i);
assert.equal(hasBlockingQualityGate({ status: 'BLOCKED', evidence: [] }), true, 'blocked quality gates must stop generation');
assert.equal(hasBlockingQualityGate({ status: 'PASS', evidence: [{ rule: 'continuity', result: 'FAIL', explanation: 'mismatch' }] }), true, 'failed quality evidence must stop generation');

// Idempotency is a planning boundary: the same production/shot identity must
// yield the same key, while a different shot must yield a different key.
function planningIdempotencyKey(productionId, shot) {
  return crypto.createHash('sha256').update(JSON.stringify({
    productionId,
    sequenceId: shot.sequenceId,
    sceneId: shot.sceneId,
    orderIndex: shot.orderIndex,
  })).digest('hex');
}
const firstKey = planningIdempotencyKey('production-1', validDirectorPlan.shots[0]);
assert.equal(firstKey, planningIdempotencyKey('production-1', structuredClone(validDirectorPlan.shots[0])), 'same shot identity must be idempotent');
assert.notEqual(firstKey, planningIdempotencyKey('production-1', validDirectorPlan.shots[1]), 'different shot identity must not collide');
const aiTypesSource = fs.readFileSync(path.join(repoRoot, 'src/lib/ai/types.ts'), 'utf8');
assert.match(aiTypesSource, /idempotencyKey:\s*string/, 'GenerationRequest must require an idempotency key');

console.log('Provider calls: 0 (fetch is blocked by test harness)');
if (failures.length > 0) {
  console.error(`AI planning contracts: ${failures.length} FAILURE(S)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('AI planning contracts: PASS');
}
