const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  const mapped = request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : request;
  try {
    return originalResolve.call(this, mapped, parent, isMain, options);
  } catch (error) {
    if (path.isAbsolute(mapped)) {
      for (const extension of ['.ts', '.tsx']) {
        if (fs.existsSync(mapped + extension)) return mapped + extension;
      }
      const index = path.join(mapped, 'index.ts');
      if (fs.existsSync(index)) return index;
    }
    throw error;
  }
};

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const adapter = require(path.join(root, 'src', 'lib', 'adapters', 'openrouter-adapter.ts'));
const gateway = require(path.join(root, 'src', 'lib', 'ai', 'gateway.ts'));

function transport(handler, overrides = {}) {
  return {
    apiKey: null,
    mock: { seed: 'execution-test', handler },
    retry: { maxRetries: 0, sleep: async () => {} },
    ...overrides,
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return { status, headers: { 'content-type': 'application/json', 'x-request-id': `req-${status}`, ...headers }, body };
}

async function main() {
  const retryClassifier = require(path.join(root, 'src/lib/ai/planning/generation.ts'));
  const workerContract = require(path.join(root, 'convex/generationWorkerContracts.ts'));
  for (const errorType of ['content_policy_violation', 'refusal']) {
    const body = { error: { code: 403, message: 'PRIVATE_SCENE no compatible model available', metadata: { error_type: errorType } } };
    assert.deepEqual(adapter.classifyOpenRouterError(403, body), { code: 'CONTENT_POLICY', retryable: false });
    let calls = 0;
    await assert.rejects(adapter.generateVideo({ model: 'auto', prompt: 'ordinary adult romance', duration: 4, aspectRatio: '16:9' }, transport(() => {
      calls++; return jsonResponse(body, 403);
    }, { retry: { maxRetries: 3, sleep: async () => {} } })), error => error.code === 'CONTENT_POLICY' && error.retryable === false);
    assert.equal(calls, 1, 'a policy rejection is not purchased again or treated as an outage');
    for (const run of [
      options => adapter.generateImage({ model: 'openrouter/auto', prompt: 'ordinary beachwear' }, options),
      options => adapter.synthesizeSpeech({ model: 'openrouter/auto', input: 'An ordinary romantic line.', voice: 'alloy' }, options),
    ]) {
      calls = 0;
      await assert.rejects(run(transport(() => { calls++; return jsonResponse(body, 403); }, { retry: { maxRetries: 3, sleep: async () => {} } })), error => error.code === 'CONTENT_POLICY' && !error.retryable);
      assert.equal(calls, 1);
    }
  }
  for (const limit_source of ['openrouter_guardrail_budget', 'openrouter_workspace_budget', 'openrouter_key_limit']) {
    assert.equal(adapter.classifyOpenRouterError(403, { error: { metadata: { limit_source } } }).code, 'PROVIDER_PAYMENT_REQUIRED');
  }
  assert.equal(adapter.classifyOpenRouterError(401).code, 'PROVIDER_AUTHENTICATION');
  assert.equal(adapter.classifyOpenRouterError(403).code, 'PROVIDER_ERROR');
  assert.equal(adapter.classifyOpenRouterError(403, { error: { message: 'private content_policy_violation text' } }).code, 'PROVIDER_ERROR');
  assert.equal(retryClassifier.classifyProviderFailure({ code: 'CONTENT_POLICY', attempt: 1, maxAttempts: 3 }).disposition, 'NON_RETRYABLE');
  for (const preparation of [false, true]) {
    assert.match(workerContract.safeGenerationError('CONTENT_POLICY', preparation), /content rules/);
    assert.doesNotMatch(workerContract.safeGenerationError('CONTENT_POLICY', preparation), /PRIVATE_SCENE|API key/);
  }
  console.log('PASS policy, budget and credential errors remain distinct without automatic repurchase');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
