const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-preparation-'));
for (const name of ['model-registry', 'music','preparation']) fs.writeFileSync(path.join(temp, name + '.js'), ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/ai/' + name + '.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
const { quotePreparation, preparationModel } = require(path.join(temp, 'preparation.js'));
const checks = [];
const referenceEndpoint = { name: 'Seed | bytedance-seed/seed-audio-1-0-20260630', tag: 'seed', model_id: 'bytedance-seed/seed-audio-1-0', status: 0, supports_voice_cloning: true, supports_multiple_audio_references: true, supports_image_reference: true, pricing: {prompt:'0',completion:'0.0025',discount:0} };
const referenceCatalog = (patch = {}) => ({ data: { id: referenceEndpoint.model_id, description: 'Current live description is truncated...', endpoints: [{...referenceEndpoint,...patch}] } });
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name); }
function fetcher(body) { return async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }); }
async function main() {
  await check('image hold covers every documented output variant and a receipt margin', async () => {
    const id = preparationModel('CHARACTER_REFERENCE').id;
    const result = await quotePreparation({ kind: 'CHARACTER_REFERENCE', text: 'project reference' }, fetcher({ id, endpoints: [{ pricing: [{ billable: 'output_image', unit: 'image', cost_usd: .13 }] }, { pricing: [{ billable: 'output_image', unit: 'image', cost_usd: .15 }] }] }));
    assert.equal(result.estimatedProviderCostUsd, .1675);
    const observed = await quotePreparation({ kind: 'CHARACTER_REFERENCE', text: 'controlled pigeon sample' }, fetcher({ id, endpoints: [{ pricing: [
      { billable: 'output_image', unit: 'image', cost_usd: .13 },
      { billable: 'output_image', unit: 'image', variant: '2k', cost_usd: .15 },
      { billable: 'output_image', unit: 'image', variant: '4k', cost_usd: .17 },
    ] }] }));
    assert.equal(observed.estimatedProviderCostUsd, .188501);
    assert(observed.estimatedProviderCostUsd > .154407, 'hold covers the actual observed image receipt');
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
    await assert.rejects(quotePreparation({ kind: 'NARRATION', text: 'hello', clone: true }, fetcher(referenceCatalog({supports_voice_cloning:false}))), /not supported/);
    const result = await quotePreparation({ kind: 'NARRATION', text: 'hello', clone: true }, fetcher(referenceCatalog()));
    assert.equal(result.estimatedProviderCostUsd, .3);
  });
  await check('reference synthesis pins the reviewed version and complete price/control certificate', async () => {
    const id = preparationModel('NARRATION', true).id;
    for (const patch of [{name:'Seed | new-version'}, {tag:'other'}, {supports_multiple_audio_references:false}, {status:-2}, {pricing:{prompt:0,completion:.0026,discount:0}}, {pricing:{prompt:0,completion:.0025,discount:0,unknown_input:1}}, {pricing:{prompt:null,completion:.0025,discount:0}}]) await assert.rejects(quotePreparation({kind:'NARRATION',text:'hello',clone:true},fetcher(referenceCatalog(patch))), /changed/);
    await assert.rejects(quotePreparation({kind:'NARRATION',text:'x'.repeat(3001),clone:true},fetcher(referenceCatalog())), /3000/);
    const quote = await quotePreparation({kind:'NARRATION',text:'hello',clone:true},fetcher(referenceCatalog()));
    const {assertReferenceVoiceQuote} = require(path.join(temp,'preparation.js'));
    assert.equal(assertReferenceVoiceQuote(quote.referenceVoiceQuote).maxOriginalOutputSeconds,120);
    assert.deepEqual(assertReferenceVoiceQuote(Object.fromEntries(Object.entries(quote.referenceVoiceQuote).reverse())), quote.referenceVoiceQuote, 'Convex object serialization order cannot invalidate a certificate');
    assert.throws(()=>assertReferenceVoiceQuote({...quote.referenceVoiceQuote,costUsd:.01}));
    assert.equal(quote.estimatedProviderCostUsd,.3);
  });
  await check('transcription uses measured duration and refuses over 60 seconds', async () => {
    const id = preparationModel('TRANSCRIPT').id;
    const payload = { data: { id, endpoints: [{ pricing: { prompt: .001 } }] } };
    assert.equal((await quotePreparation({ kind: 'TRANSCRIPT', durationMeasurement:'DECODED_PCM_SAMPLES_V1', durationSeconds: 5 }, fetcher(payload))).estimatedProviderCostUsd, .006);
    assert.equal((await quotePreparation({ kind: 'TRANSCRIPT', durationMeasurement:'DECODED_PCM_SAMPLES_V1', durationSeconds: 5.1 }, fetcher(payload))).estimatedProviderCostUsd, .006);
    for (const durationSeconds of [undefined, -1, 0, 61]) await assert.rejects(quotePreparation({ kind: 'TRANSCRIPT', durationMeasurement:'DECODED_PCM_SAMPLES_V1', durationSeconds }, fetcher(payload)), /at most 60/);
  });
  await check('unavailable and zero-priced routes cannot reserve invented estimates', async () => {
    await assert.rejects(quotePreparation({ kind: 'NARRATION', text: 'hello' }, fetcher({ data: { id: 'wrong/model', endpoints: [] } })), /unavailable/);
    const id = preparationModel('NARRATION').id;
    await assert.rejects(quotePreparation({ kind: 'NARRATION', text: 'hello' }, fetcher({ data: { id, endpoints: [{ pricing: { prompt: 0 } }] } })), /pricing/);
  });
  console.log(`Preparation contracts: PASS (${checks.length}); no database or provider calls.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(temp, { recursive: true, force: true }));
