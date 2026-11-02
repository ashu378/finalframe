const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-stock-voices-'));
for (const name of ['model-registry', 'stock-voices']) fs.writeFileSync(path.join(temp, name + '.js'), ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/ai/' + name + '.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
const { discoverStockVoices, selectStockVoice } = require(path.join(temp, 'stock-voices.js'));
const { PREPARATION_MODELS } = require(path.join(temp, 'model-registry.js'));
const modelId = PREPARATION_MODELS.narration.id;
const body = voices => ({ data: [{ id: modelId, name: 'Verified stock model', architecture: { output_modalities: ['speech'] }, supported_voices: voices }] });
const fakeFetch = value => async (url, init) => { assert.equal(url, 'https://openrouter.ai/api/v1/models?output_modalities=speech'); assert(!init.method || init.method === 'GET'); return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }); };
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
async function main() {
  await check('discovers stock presets without a provider POST and keeps model IDs central', async () => {
    const catalog = await discoverStockVoices(fakeFetch(body(['voice_3150', 'en_paul_neutral'])));
    assert.equal(catalog.modelId, modelId); assert.equal(catalog.voices.length, 2); assert.match(catalog.fingerprint, /^[a-f0-9]{64}$/);
    const publicChoices = catalog.voices.map(({ selectionKey, label }) => ({ selectionKey, label }));
    assert(!JSON.stringify(publicChoices).includes('providerVoiceId')); assert(publicChoices.every(choice => choice.selectionKey.length === 64));
  });
  await check('selection keys and catalog fingerprint are stable across catalog ordering', async () => {
    const one = await discoverStockVoices(fakeFetch(body(['voice_3150', 'en_paul_neutral'])));
    const two = await discoverStockVoices(fakeFetch(body(['en_paul_neutral', 'voice_3150', 'voice_3150'])));
    assert.deepEqual(one.voices, two.voices); assert.equal(one.fingerprint, two.fingerprint);
    assert.equal(selectStockVoice(one, one.voices[0].selectionKey).providerVoiceId, one.voices[0].providerVoiceId);
  });
  await check('arbitrary browser voice IDs and stale selections fail closed', async () => {
    const catalog = await discoverStockVoices(fakeFetch(body(['voice_3150'])));
    assert.throws(() => selectStockVoice(catalog, 'voice_3150'), /current verified catalog/);
    const changed = await discoverStockVoices(fakeFetch(body(['different_voice'])));
    assert.throws(() => selectStockVoice(changed, catalog.voices[0].selectionKey), /current verified catalog/);
  });
  await check('missing or malformed provider catalogs do not invent voices', async () => {
    for (const value of [body([]), body(['https://private/reference']), { data: [{ id: 'wrong/model', supported_voices: ['stock'] }] }, { data: [{ id: modelId, architecture: { output_modalities: ['text'] }, supported_voices: ['stock'] }] }]) await assert.rejects(discoverStockVoices(fakeFetch(value)));
  });
  console.log(`Stock voice contracts: PASS (${checks}); public catalog GET mocked, no database or paid calls.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(temp, { recursive: true, force: true }));
