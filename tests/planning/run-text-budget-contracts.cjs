const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-text-budget-'));
try {
  const source = fs.readFileSync('convex/providerTextContracts.ts', 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const file = path.join(directory, 'contracts.cjs');
  fs.writeFileSync(file, output);
  const { quoteTextRequest, TEXT_OUTPUT_TOKENS } = require(file);
  const model = { contextLength: 128000, pricing: { input: .000002, output: .000008, request: .001 } };
  const quote = quoteTextRequest(model, { messages: [{ role: 'user', content: 'Hello' }] });
  assert(quote.estimatedCostUsd > TEXT_OUTPUT_TOKENS * model.pricing.output + .001);
  assert.deepEqual(quote.priceCeiling, { prompt: 2, completion: 8 });
  assert.equal(quote.maxTokens, 8192);
  assert.throws(() => quoteTextRequest({ ...model, pricing: {} }, {}), /PRICE_UNAVAILABLE/);
  assert.throws(() => quoteTextRequest({ ...model, pricing: { input: -1, output: 1 } }, {}), /PRICE_UNAVAILABLE/);
  assert.throws(() => quoteTextRequest({ ...model, contextLength: 100 }, {}), /CONTEXT_TOO_SMALL/);
  assert.throws(() => quoteTextRequest(model, { content: 'x'.repeat(65536) }), /TOO_LARGE/);
  assert(quoteTextRequest(model, { content: 'é'.repeat(10) }).estimatedCostUsd > quoteTextRequest(model, { content: 'a'.repeat(10) }).estimatedCostUsd);
  console.log('Text budget bounds: 8 checks passed; provider calls: 0.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
