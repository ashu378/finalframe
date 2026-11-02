const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-preparation-'));
for (const name of ['model-registry', 'preparation']) fs.writeFileSync(path.join(temp, name + '.js'), ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/ai/' + name + '.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
const { quotePreparation, preparationModel } = require(path.join(temp, 'preparation.js'));
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name); }
function fetcher(body) { return async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }); }
async function main() {
  await check('image quote uses one output at verified flat 1K endpoint prices', async () => {
    const id = preparationModel('CHARACTER_REFERENCE').id;
    const result = await quotePreparation({ kind: 'CHARACTER_REFERENCE', text: 'project reference' }, fetcher({ id, endpoints: [{ pricing: [{ billable: 'output_image', unit: 'image', cost_usd: .13 }] }, { pricing: [{ billable: 'output_image', unit: 'image', cost_usd: .15 }] }] }));
    assert.equal(result.estimatedProviderCostUsd, .15);
  });
  await check('unknown image billing at any eligible endpoint fails closed', async () => {
    const id = preparationModel('CHARACTER_REFERENCE').id;
    await assert.rejects(quotePreparation({ kind: 'CHARACTER_REFERENCE', text: 'reference' }, fetcher({ id, endpoints: [{ pricing: [{ billable: 'output_image', unit: 'image', cost_usd: .13 }] }, { pricing: { image_token: .00001 } }] })), /cannot be bounded/);
  });
  await check('speech reserves the maximum endpoint character rate', async () => {
    const id = preparationModel('NARRATION').id;
    const result = await quotePreparation({ kind: 'NARRATION', text: 'hello' }, fetcher({ data: { id, endpoints: [{ pricing: { prompt: .001 } }, { pricing: { prompt: .002 } }] } }));
    assert.equal(result.estimatedProviderCostUsd, .01);
  });
  await check('reference synthesis requires every endpoint to certify cloning', async () => {
    const id = preparationModel('NARRATION', true).id;
    await assert.rejects(quotePreparation({ kind: 'NARRATION', text: 'hello', clone: true }, fetcher({ data: { id, description: 'Output is limited to 120 seconds per request.', endpoints: [{ supports_voice_cloning: false, pricing: { completion: .0025 } }] } })), /not supported/);
    const result = await quotePreparation({ kind: 'NARRATION', text: 'hello', clone: true }, fetcher({ data: { id, description: 'Output is limited to 120 seconds per request.', endpoints: [{ supports_voice_cloning: true, pricing: { completion: .0025 } }] } }));
    assert.equal(result.estimatedProviderCostUsd, .3);
  });
  await check('reference synthesis fails closed if the hard duration certificate disappears', async () => {
    const id = preparationModel('NARRATION', true).id;
    await assert.rejects(quotePreparation({ kind: 'NARRATION', text: 'hello', clone: true }, fetcher({ data: { id, description: 'Unbounded output', endpoints: [{ supports_voice_cloning: true, pricing: { completion: .0025 } }] } })), /hard output-duration/);
  });
  await check('transcription uses measured duration and refuses over 60 seconds', async () => {
    const id = preparationModel('TRANSCRIPT').id;
    const payload = { data: { id, endpoints: [{ pricing: { prompt: .001 } }] } };
    assert.equal((await quotePreparation({ kind: 'TRANSCRIPT', durationSeconds: 5 }, fetcher(payload))).estimatedProviderCostUsd, .005);
    assert.equal((await quotePreparation({ kind: 'TRANSCRIPT', durationSeconds: 5.1 }, fetcher(payload))).estimatedProviderCostUsd, .006);
    for (const durationSeconds of [undefined, -1, 0, 61]) await assert.rejects(quotePreparation({ kind: 'TRANSCRIPT', durationSeconds }, fetcher(payload)), /at most 60/);
  });
  await check('unavailable and zero-priced routes cannot reserve invented estimates', async () => {
    await assert.rejects(quotePreparation({ kind: 'NARRATION', text: 'hello' }, fetcher({ data: { id: 'wrong/model', endpoints: [] } })), /unavailable/);
    const id = preparationModel('NARRATION').id;
    await assert.rejects(quotePreparation({ kind: 'NARRATION', text: 'hello' }, fetcher({ data: { id, endpoints: [{ pricing: { prompt: 0 } }] } })), /pricing/);
  });
  console.log(`Preparation contracts: PASS (${checks.length}); no database or provider calls.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(temp, { recursive: true, force: true }));
