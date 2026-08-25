const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');

const root = path.resolve(__dirname, '../..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-generation-contracts-'));

function compileModule(relativePath, outputRelativePath) {
    const sourcePath = path.join(root, relativePath);
    const outputPath = path.join(tempRoot, outputRelativePath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const source = fs.readFileSync(sourcePath, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        fileName: sourcePath,
    });
    fs.writeFileSync(outputPath, output.outputText, 'utf8');
}

compileModule('src/lib/ai/types.ts', 'types.js');
compileModule('src/lib/ai/planning/quality.ts', 'planning/quality.js');
compileModule('src/lib/ai/planning/generation.ts', 'planning/generation.js');
compileModule('src/lib/ai/schemas.ts', 'schemas.js');
compileModule('tests/generation/fixtures.ts', 'fixtures.js');

const schemas = require(path.join(tempRoot, 'schemas.js'));
const generation = require(path.join(tempRoot, 'planning/generation.js'));
const fixtures = require(path.join(tempRoot, 'fixtures.js'));

assert.deepEqual(schemas.validateGenerationRequest(fixtures.validGenerationRequest).idempotencyKey, 'production-1-shot-1-v1');
assert.doesNotThrow(() => schemas.validateProviderTask(fixtures.validProviderTask));
assert.doesNotThrow(() => schemas.validateQCResult(fixtures.validQC));
assert.doesNotThrow(() => schemas.validateFeatureFlagSet(fixtures.validFeatureFlags));

assert.throws(() => schemas.validateGenerationRequest({ ...fixtures.validGenerationRequest, idempotencyKey: 'short' }), /idempotencyKey/);
assert.throws(() => schemas.validateGenerationRequest({ ...fixtures.validGenerationRequest, prompt: '' }), /prompt/);
assert.throws(() => schemas.validateProviderTask({ ...fixtures.validProviderTask, output: { ...fixtures.validProviderTask.output, remoteUrl: undefined, inlineData: undefined } }), /remoteUrl or inlineData/);
assert.throws(() => schemas.validateFeatureFlagSet({ 'unknown.flag': fixtures.validFeatureFlags['generation.qc'] }), /Unknown feature flag/);

const retryable = generation.classifyProviderFailure({ code: 'PROVIDER_RATE_LIMIT', attempt: 1, maxAttempts: 3 });
assert.equal(retryable.disposition, 'RETRYABLE');
assert.equal(retryable.retryable, true);
assert.equal(generation.classifyProviderFailure({ code: 'PROVIDER_RATE_LIMIT', attempt: 3, maxAttempts: 3 }).disposition, 'TIMED_OUT');
assert.equal(generation.classifyProviderFailure({ providerStateUnknown: true, attempt: 1, maxAttempts: 3 }).disposition, 'RECONCILIATION_REQUIRED');
assert.equal(generation.classifyProviderFailure({ canceledByUser: true, attempt: 1, maxAttempts: 3 }).disposition, 'CANCELED');
assert.equal(generation.isTerminalProviderTaskStatus('RECONCILIATION_REQUIRED'), true);
assert.equal(generation.canRetryProviderTask('POLLING', retryable), true);
assert.equal(generation.isFeatureEnabled(fixtures.validFeatureFlags, 'generation.real_provider', 'PUBLIC'), false);
assert.equal(generation.isFeatureEnabled(fixtures.validFeatureFlags, 'generation.real_provider', 'INTERNAL'), true);
assert.equal(generation.isFeatureEnabled(fixtures.validFeatureFlags, 'workflow.animated_comedy_2d', 'BETA'), true);

console.log('Provider calls: 0 (deterministic generation fixtures only)');
console.log('Real generation contracts: PASS');
