const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, webcrypto } = require('node:crypto');
const ts = require('typescript');
const source = path.resolve(__dirname, '../../src/lib/ai/submission-diagnostic.ts');
const loaded = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS } }).outputText)(loaded, loaded.exports);
const d = loaded.exports;
global.crypto ??= webcrypto;
const controls = { duration: 5, aspectRatio: '16:9', resolution: '720p', generateAudio: false, continuation: true, frameImageCount: 0, inputReferenceCount: 0 };
const hash = value => createHash('sha256').update(value).digest('hex');
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
async function main() {
  await check('provider feedback becomes fixed categories without leaking messages, URLs, prompts or granting retry authority', async()=>{
    const cases=[['Reference images may contain a real person and are not supported','REFERENCE_PERSON_RESTRICTED'],['InputImageSensitiveContentDetected','REFERENCE_CONTENT_REJECTED'],['Prompt is too long: secret example','PROMPT_TOO_LONG'],['Reference image could not download https://secret.invalid/file','REFERENCE_MEDIA_UNAVAILABLE'],['Reference image dimensions invalid','REFERENCE_DIMENSIONS_UNSUPPORTED'],['Resolution not supported','CONTROL_NOT_SUPPORTED'],['Model not found','MODEL_UNAVAILABLE']];
    for(const[message,category]of cases){assert.equal(d.classifySubmissionRejection({error:{code:400,message}}),category);const result=await d.buildSubmissionDiagnostic({error:{status:400,details:{rejectionCategory:category}},controls});assert.equal(result.rejectionCategory,category);for(const token of['secret','http://','https://','message','retry'])assert(!JSON.stringify(result).includes(token));assert.equal(d.sanitizeSubmissionDiagnostic({...result,raw:message}).rejectionCategory,category);}
    assert.equal(d.classifySubmissionRejection({error:{message:'Generic invalid request'}}),undefined);assert.equal(d.classifySubmissionRejection({error:{message:'a'.repeat(4097)+' prompt too long'}}),undefined);
    assert.equal(d.classifySubmissionRejection({error:{metadata:{raw:'Reference image may contain a real person; request rejected'}}}),'REFERENCE_PERSON_RESTRICTED');
    assert.equal(d.sanitizeSubmissionDiagnostic({version:1,controlFingerprint:'a'.repeat(64),rejectionCategory:'SECRET'}).rejectionCategory,undefined);
    const poison={};Object.defineProperty(poison,'error',{get(){throw Error('unsafe getter');}});assert.equal(d.classifySubmissionRejection(poison),undefined);
  });
  await check('bounded diagnostic keeps only allowlisted provider/status/parameter and header correlation', async () => {
    const bytes = new TextEncoder().encode('{"error":"fixture"}');
    const result = await d.buildSubmissionDiagnostic({ error: { status: 400, requestId: 'req_fixture123456', message: 'PRIVATE_PROMPT https://private.invalid/asset', details: { providerCode: 'invalid_request', providerParam: 'previous_job_id', providerMessage: 'PRIVATE_TOKEN', raw: 'BASE64_MEDIA' } }, controls, responseBodyBytes: bytes });
    assert.deepEqual(result, { version: 1, controlFingerprint: hash(JSON.stringify(controls)), httpStatus: 400, requestId: 'req_fixture123456', providerCode: 'invalid_request', providerParam: 'previous_job_id', responseDigest: hash(bytes) });
    for (const token of ['PRIVATE_', 'https:', 'BASE64', 'message', 'raw']) assert.equal(JSON.stringify(result).includes(token), false);
    assert.ok(JSON.stringify(result).length < 600);
  });
  await check('unknown codes, arbitrary params, unsafe/oversized IDs and invalid status are omitted', async () => {
    for (const error of [
      { status: NaN, requestId: 'https://private.invalid/key', details: { providerCode: 'PRIVATE_TOKEN', providerParam: 'prompt' } },
      { status: 600, requestId: 'req_' + 'x'.repeat(97), details: { providerCode: 'invalid_request PRIVATE_PROMPT', providerParam: 'previous_job_id.secret' } },
      { status: '400', requestId: 'unknown-id', details: { providerCode: 400, providerParam: ['duration'] } },
    ]) {
      assert.deepEqual(await d.buildSubmissionDiagnostic({ error, controls }), { version: 1, controlFingerprint: hash(JSON.stringify(controls)) });
    }
    assert.equal((await d.buildSubmissionDiagnostic({ error: { requestId: 'ad41c210-0377-4ead-84d1-fdc26006ab44' }, controls })).requestId, 'ad41c210-0377-4ead-84d1-fdc26006ab44');
  });
  await check('fingerprint binds permitted controls and ignores prompts/source identity/URLs/arbitrary serialization', async () => {
    const baseline = await d.buildSubmissionDiagnostic({ error: {}, controls });
    const tainted = { ...controls, prompt: 'PRIVATE_PROMPT', previousJobId: 'PRIVATE_ID', frameImages: [{ url: 'PRIVATE_URL' }], model: 'PRIVATE_MODEL', toJSON() { throw new Error('must not stringify input'); } };
    assert.equal((await d.buildSubmissionDiagnostic({ error: {}, controls: tainted })).controlFingerprint, baseline.controlFingerprint);
    for (const change of [{ duration: 6 }, { generateAudio: true }, { resolution: '1080p' }, { continuation: false }, { frameImageCount: 1 }]) assert.notEqual((await d.buildSubmissionDiagnostic({ error: {}, controls: { ...controls, ...change } })).controlFingerprint, baseline.controlFingerprint);
    const invalid = await d.buildSubmissionDiagnostic({ error: {}, controls: { duration: Infinity, aspectRatio: 'PRIVATE', resolution: 'PRIVATE', frameImageCount: 33, inputReferenceCount: -1, generateAudio: 'true' } });
    assert.equal(invalid.controlFingerprint, hash('{}'));
  });
  await check('body digest is exact and bounded with no large body serialization or partial digest', async () => {
    const limit = new Uint8Array(d.SUBMISSION_DIAGNOSTIC_MAX_BODY_BYTES);
    assert.equal((await d.buildSubmissionDiagnostic({ error: {}, controls, responseBodyBytes: limit })).responseDigest, hash(limit));
    const tooLarge = new Uint8Array(limit.length + 1);
    assert.equal((await d.buildSubmissionDiagnostic({ error: {}, controls, responseBodyBytes: tooLarge })).responseDigest, undefined);
    assert.equal((await d.buildSubmissionDiagnostic({ error: {}, controls, responseBodyBytes: 'PRIVATE_RAW_BODY' })).responseDigest, undefined);
    const snapshot = new Uint8Array([1, 2, 3]);
    const error = { status: 400, requestId: 'req_fixture123456' };
    const pending = d.buildSubmissionDiagnostic({ error, controls, responseBodyBytes: snapshot });
    snapshot.fill(9); error.status = 500; error.requestId = 'req_changed123456';
    const result = await pending;
    assert.equal(result.responseDigest, hash(new Uint8Array([1, 2, 3])));
    assert.equal(result.httpStatus, 400); assert.equal(result.requestId, 'req_fixture123456');
  });
  await check('future persistence boundary revalidates version, digests and every optional field', () => {
    const valid = { version: 1, controlFingerprint: 'a'.repeat(64), httpStatus: 422, requestId: 'req_fixture123456', providerCode: 'validation_error', providerParam: 'duration', responseDigest: 'b'.repeat(64) };
    assert.deepEqual(d.sanitizeSubmissionDiagnostic({ ...valid, raw: 'PRIVATE_BODY', message: 'PRIVATE_MESSAGE' }), valid);
    for (const patch of [{ version: 2 }, { controlFingerprint: 'invalid' }, { controlFingerprint: 'https://private.invalid' }]) assert.equal(d.sanitizeSubmissionDiagnostic({ ...valid, ...patch }), undefined);
    assert.deepEqual(d.sanitizeSubmissionDiagnostic({ version: 1, controlFingerprint: valid.controlFingerprint, httpStatus: 1.5, requestId: 'SECRET', providerCode: 'SECRET', providerParam: 'prompt', responseDigest: 'SECRET' }), { version: 1, controlFingerprint: valid.controlFingerprint });
  });
  await check('getters and inherited fields are never read as diagnostics or controls', async () => {
    const poison = Object.create({ status: 400, requestId: 'req_fixture123456' });
    Object.defineProperty(poison, 'details', { get() { throw new Error('private getter'); } });
    const input = Object.create(controls);
    Object.defineProperty(input, 'duration', { get() { throw new Error('private getter'); } });
    const result = await d.buildSubmissionDiagnostic({ error: poison, controls: input });
    assert.deepEqual(result, { version: 1, controlFingerprint: hash('{}') });
  });
  console.log(`Submission diagnostics: PASS (${checks}); pure offline fixtures, no provider/database calls.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
