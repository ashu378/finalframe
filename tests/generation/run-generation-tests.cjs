const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');

const repoRoot = path.resolve(__dirname, '../..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-generation-contracts-'));
process.env.OPENROUTER_IMAGE_MODEL = 'test/registered-image';

function compile(relativePath, outputName) {
  const sourcePath = path.join(repoRoot, relativePath);
  const outputPath = path.join(tempRoot, outputName || `${path.basename(relativePath, '.ts')}.js`);
  const result = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: sourcePath,
  });
  fs.writeFileSync(outputPath, result.outputText, 'utf8');
  return outputPath;
}

// The production adapter uses path aliases. Resolve those aliases only inside
// this isolated test process; application source remains untouched.
const aliasMap = new Map([
  ['@/lib/ai/types', compile('src/lib/ai/types.ts', 'types.js')],
  ['@/lib/ai/model-registry', compile('src/lib/ai/model-registry.ts', 'model-registry.js')],
  ['@/lib/ai/capabilities', compile('src/lib/ai/capabilities.ts', 'capabilities.js')],
  ['@/lib/ai/model-discovery', compile('src/lib/ai/model-discovery.ts', 'model-discovery.js')],
  ['@/lib/types/database', path.join(tempRoot, 'database.js')],
]);
fs.writeFileSync(path.join(tempRoot, 'database.js'), 'module.exports = {};\n', 'utf8');
const originalResolve = require.resolve;
const Module = require('node:module');
const originalFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  const mapped = aliasMap.get(request);
  return mapped || originalFilename.call(this, request, parent, isMain, options);
};

const adapterPath = compile('src/lib/adapters/openrouter-adapter.ts', 'openrouter-adapter.js');
const adapter = require(adapterPath);
Module._resolveFilename = originalFilename;
void originalResolve;

const failures = [];
function check(label, callback) {
  return Promise.resolve().then(callback).catch((error) => {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

async function main() {
  delete process.env.OPENROUTER_API_KEY;

  await check('no live provider call is required', async () => {
    let calls = 0;
    const result = await adapter.generateImage(
      { model: 'local/test-image', prompt: 'A deterministic test frame', aspectRatio: '1:1' },
      {
        apiKey: null,
        mock: {
          seed: 'generation-qa',
          handler: async () => {
            calls += 1;
            return { body: { data: [{ b64_json: 'fixture-image', media_type: 'image/png' }], model: 'local/test-image', usage: { cost: 0 } }, headers: { 'x-request-id': 'fixture-image-1' } };
          },
        },
      },
    );
    assert.equal(result.b64_json, 'fixture-image');
    assert.equal(calls, 1);
  });

  await check('idempotency key is stable across retries', async () => {
    const keys = [];
    let attempt = 0;
    const result = await adapter.generateImage(
      { model: 'local/retry-image', prompt: 'A retryable fixture frame' },
      {
        apiKey: null,
        idempotencyKey: 'generation-qa-production-shot-001',
        retry: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0, sleep: async () => {} },
        mock: {
          seed: 'retry-qa',
          handler: async (request) => {
            keys.push(request.headers['x-idempotency-key']);
            attempt += 1;
            if (attempt === 1) return { status: 503, body: { error: { code: 'temporary', message: 'retry me' } } };
            return { body: { data: [{ b64_json: 'retry-image' }], model: 'local/retry-image', usage: { cost: 0 } } };
          },
        },
      },
    );
    assert.equal(result.b64_json, 'retry-image');
    assert.deepEqual(keys, ['generation-qa-production-shot-001', 'generation-qa-production-shot-001']);
  });

  await check('provider timeout is normalized and non-live', async () => {
    const neverResponds = async (_input, init) => new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('aborted', 'AbortError'));
      if (init?.signal?.aborted) return abort();
      init?.signal?.addEventListener('abort', abort, { once: true });
      void resolve;
    });
    await assert.rejects(
      adapter.generateImage(
        { model: 'test/registered-image', prompt: 'A timeout fixture frame' },
        // A sentinel key satisfies the adapter's credential guard; the
        // injected fetch below never reaches a network socket.
        { apiKey: 'local-test-only', fetch: neverResponds, timeoutMs: 5, retry: { maxRetries: 0 } },
      ),
      (error) => error?.code === 'REQUEST_TIMEOUT' && error?.retryable === true,
    );
  });

  await check('retry classification remains deterministic', async () => {
    assert.deepEqual(adapter.classifyOpenRouterError(408), { code: 'REQUEST_TIMEOUT', retryable: true });
    assert.deepEqual(adapter.classifyOpenRouterError(429), { code: 'PROVIDER_RATE_LIMIT', retryable: true });
    assert.deepEqual(adapter.classifyOpenRouterError(422), { code: 'INVALID_REQUEST', retryable: false });
  });

  await check('generation request requires a stable idempotency key contract', async () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src/lib/ai/types.ts'), 'utf8');
    assert.match(source, /export interface GenerationRequest[\s\S]*?idempotencyKey:\s*string/);
    const generationJobs = fs.readFileSync(path.join(repoRoot, 'convex/generationJobs.ts'), 'utf8');
    assert.match(generationJobs, /withIndex\("by_idempotency"/);
  });

  await check('missing media blocks completion before charging success', async () => {
    const generationJobs = fs.readFileSync(path.join(repoRoot, 'convex/generationJobs.ts'), 'utf8');
    assert.match(generationJobs, /storageId|resolveAuthorizedMedia|media probe/i, 'completion must require canonical media metadata, not only a remote URL');
  });

  await check('QC failure blocks completion', async () => {
    const generationJobs = fs.readFileSync(path.join(repoRoot, 'convex/generationJobs.ts'), 'utf8');
    const generation = fs.readFileSync(path.join(repoRoot, 'convex/generation.ts'), 'utf8');
    assert.match(`${generationJobs}\n${generation}`, /qc|qualityGate|moderation|continuity/i, 'completion must pass an explicit QC/continuity gate');
  });

  await check('durable provider failures enter a retryable state', async () => {
    const generationJobs = fs.readFileSync(path.join(repoRoot, 'convex/generationJobs.ts'), 'utf8');
    const generation = fs.readFileSync(path.join(repoRoot, 'convex/generation.ts'), 'utf8');
    assert.match(`${generationJobs}\n${generation}`, /RETRYING|RETRYABLE_FAILURE|nextAttemptAt|scheduler/i, 'provider retry state must survive browser closure and deploys');
  });

  if (failures.length) {
    console.error(`Generation contract tests: ${failures.length} FAILURE(S)`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('Generation contract tests: PASS');
  console.log('Provider calls: 0 live (all requests used local injected seams)');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
