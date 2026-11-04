const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
function load(source, imports = {}) {
  const filename = path.join(root, source);
  const moduleInstance = new Module(filename, module);
  moduleInstance.filename = filename;
  moduleInstance.paths = Module._nodeModulePaths(path.dirname(filename));
  moduleInstance.require = name => Object.hasOwn(imports, name) ? imports[name] : require(name);
  moduleInstance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return moduleInstance.exports;
}
const contract = load('convex/reviewMediaContract.ts');
const server = load('src/lib/review/media-server.ts', { 'server-only': {}, '../../../convex/reviewMediaContract': contract });
const { GET, HEAD } = load('src/app/api/review-media/[kind]/[token]/route.ts', { '@/lib/review/media-server': server });
const secret = 'a1'.repeat(32);
const token = 'A'.repeat(43);
const deployment = 'https://review-fixture.convex.cloud';
const resolver = 'https://review-fixture.convex.site/internal/review-media';
const object = { url: `${deployment}/api/storage/opaque-media-key`, size: 12, contentType: 'video/mp4' };
const content = new TextEncoder().encode('0123456789AB');
const oldSecret = process.env.FINALFRAME_REVIEW_MEDIA_SECRET;
const oldOrigin = process.env.NEXT_PUBLIC_CONVEX_URL;
const oldFetch = global.fetch;
let checks = 0;

function request(kind = 'export', range, method = 'GET') {
  const input = new Request(`https://app.example.test${contract.reviewMediaPath(kind, token)}`, { method, headers: range ? { Range: range } : {} });
  const context = { params: Promise.resolve({ kind, token }) };
  return (method === 'HEAD' ? HEAD : GET)(input, context);
}

async function signedRequest(body, { timestamp = Date.now().toString(), key = secret, sentBody = body } = {}) {
  const signature = await contract.signReviewMediaResolver(key, timestamp, body);
  return new Request(resolver, { method: 'POST', body: sentBody, headers: { [contract.REVIEW_MEDIA_TIMESTAMP]: timestamp, [contract.REVIEW_MEDIA_SIGNATURE]: signature } });
}

function mockedNetwork({ active = () => true, record = object, contentResponse } = {}) {
  const calls = [];
  global.fetch = async (address, init) => {
    calls.push({ url: String(address), init });
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    if (String(address) === resolver) {
      return contract.respondToReviewMediaResolver(new Request(address, init), secret, input => {
        assert.equal(input.token, token);
        return Promise.resolve(active(input.kind) ? record : null);
      });
    }
    assert.equal(String(address), record.url);
    assert.equal(init.headers['Accept-Encoding'], 'identity');
    assert.equal(init.headers[contract.REVIEW_MEDIA_SIGNATURE], undefined, 'the service signature stays on the resolver request');
    if (contentResponse) return contentResponse();
    const match = /bytes=(\d+)-(\d+)/.exec(init.headers.Range ?? '');
    const range = match ? { start: Number(match[1]), end: Number(match[2]) } : null;
    const bytes = range ? content.slice(range.start, range.end + 1) : content;
    return new Response(bytes, { status: range ? 206 : 200, headers: {
      'Content-Type': record.contentType, 'Content-Length': bytes.byteLength.toString(), 'Cache-Control': 'private, max-age=2592000',
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${record.size}` } : {}),
    } });
  };
  return calls;
}

async function check(label, test) {
  await test(); checks++;
  console.log(`PASS ${label}`);
}

(async () => {
  process.env.FINALFRAME_REVIEW_MEDIA_SECRET = secret;
  process.env.NEXT_PUBLIC_CONVEX_URL = deployment;

  await check('private resolver rejects unsigned, stale, forged, modified and oversized requests before resolving media', async () => {
    const body = JSON.stringify({ kind: 'export', token });
    const never = async () => assert.fail('invalid resolver request reached the database');
    assert.equal((await contract.respondToReviewMediaResolver(new Request(resolver, { method: 'POST', body }), secret, never)).status, 401);
    for (const options of [{ timestamp: `${Date.now() - 60_000}` }, { key: 'ff'.repeat(32) }, { sentBody: body.replace('export', 'movie') }]) {
      assert.equal((await contract.respondToReviewMediaResolver(await signedRequest(body, options), secret, never)).status, 401);
    }
    const large = 'X'.repeat(257);
    assert.equal((await contract.respondToReviewMediaResolver(await signedRequest(large), secret, never)).status, 400);
    assert.equal((await contract.respondToReviewMediaResolver(await signedRequest(body), undefined, never)).status, 401);
    const invalid = JSON.stringify({ kind: 'asset', token });
    assert.equal((await contract.respondToReviewMediaResolver(await signedRequest(invalid), secret, never)).status, 400);
  });

  await check('both public review kinds stream with private no-store headers and omit origin credentials', async () => {
    for (const kind of ['export', 'movie']) {
      const calls = mockedNetwork({ active: value => value === kind });
      const output = await request(kind);
      assert.equal(output.status, 200);
      assert.equal(output.headers.get('Content-Type'), 'video/mp4');
      assert.equal(output.headers.get('Content-Length'), '12');
      assert.equal(output.headers.get('Cache-Control'), 'private, no-store, max-age=0');
      assert.equal(output.headers.get('CDN-Cache-Control'), 'no-store');
      assert.equal(output.headers.get('Referrer-Policy'), 'no-referrer');
      assert.equal(output.headers.get('Location'), null);
      assert.equal(await output.text(), '0123456789AB');
      assert.equal(calls.length, 2);
    }
  });

  await check('HEAD exposes verified size without retrieving media bytes', async () => {
    const calls = mockedNetwork();
    const output = await request('movie', 'bytes=0-1', 'HEAD');
    assert.equal(output.status, 200);
    assert.equal(output.headers.get('Content-Length'), '12');
    assert.equal(output.headers.get('Accept-Ranges'), 'bytes');
    assert.equal(output.body, null);
    assert.equal(calls.length, 1);
  });

  await check('explicit, suffix, and open-ended seeks normalize and stream only the requested bytes', async () => {
    for (const [range, expected, forwarded, body] of [['bytes=1-3', 'bytes 1-3/12', 'bytes=1-3', '123'], ['bytes=-2', 'bytes 10-11/12', 'bytes=10-11', 'AB'], ['bytes=9-', 'bytes 9-11/12', 'bytes=9-11', '9AB'], ['bytes=11-9000', 'bytes 11-11/12', 'bytes=11-11', 'B']]) {
      const calls = mockedNetwork();
      const output = await request('export', range);
      assert.equal(output.status, 206);
      assert.equal(output.headers.get('Content-Range'), expected);
      assert.equal(await output.text(), body);
      assert.equal(calls[1].init.headers.Range, forwarded);
    }
  });

  await check('invalid, malformed and multipart ranges return 416 without accessing storage', async () => {
    for (const range of ['bytes=12-', 'bytes=1-0', 'bytes=-0', 'bytes=0-1,2-3', 'bytes=-', 'bytes=9999999999999999-']) {
      const calls = mockedNetwork();
      const output = await request('export', range);
      assert.equal(output.status, 416);
      assert.equal(output.headers.get('Content-Range'), 'bytes */12');
      assert.equal(calls.length, 1);
    }
  });

  await check('each seek and HEAD rechecks the review link after it is revoked', async () => {
    let active = true;
    const calls = mockedNetwork({ active: () => active });
    assert.equal(await (await request('movie', 'bytes=0-1')).text(), '01');
    active = false;
    for (const method of ['HEAD', 'GET']) {
      const response = await request('movie', 'bytes=2-3', method);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('Content-Range'), null);
    }
    assert.equal(calls.filter(call => call.url === object.url).length, 1);
  });

  await check('missing configuration, invalid kinds and tampered storage targets fail closed', async () => {
    const noCalls = mockedNetwork();
    delete process.env.FINALFRAME_REVIEW_MEDIA_SECRET;
    assert.equal((await request()).status, 503);
    assert.equal((await request('unscoped')).status, 404);
    assert.equal(noCalls.length, 0);
    process.env.FINALFRAME_REVIEW_MEDIA_SECRET = secret;
    for (const record of [{ ...object, url: 'https://other.convex.cloud/api/storage/foreign' }, { ...object, url: `${deployment}/api/auth` }, { ...object, size: 2_000_000_001 }, { ...object, contentType: 'text/html' }]) {
      const calls = mockedNetwork({ record });
      assert.equal((await request()).status, 502);
      assert.equal(calls.length, 1);
    }
  });

  await check('origin redirects and inconsistent response metadata never reach the client', async () => {
    for (const upstream of [
      () => new Response(null, { status: 302, headers: { Location: 'https://evil.example.test/' } }),
      () => new Response('12', { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 1-2/12' } }),
      () => new Response('00', { status: 206, headers: { 'Content-Type': 'text/html', 'Content-Range': 'bytes 0-1/12' } }),
      () => new Response('00', { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-1/12', 'Content-Length': '5' } }),
    ]) {
      mockedNetwork({ contentResponse: upstream });
      const output = await request('export', 'bytes=0-1');
      assert.equal(output.status, 502);
      assert.equal(output.headers.get('Location'), null);
      assert.equal(output.body, null);
    }
  });

  await check('large movie response streams incrementally and cancels the upstream without reading the whole file', async () => {
    let generated = 0;
    let cancelled = false;
    const size = 120 * 1024 * 1024;
    mockedNetwork({ record: { ...object, size }, contentResponse: () => new Response(new ReadableStream({
      pull(controller) { generated++; controller.enqueue(new Uint8Array(1024)); },
      cancel() { cancelled = true; },
    }), { headers: { 'Content-Type': 'video/mp4', 'Content-Length': size.toString() } }) });
    const output = await request('movie');
    assert.equal(output.status, 200);
    assert.equal(output.headers.get('Content-Length'), size.toString());
    const reader = output.body.getReader();
    assert.equal((await reader.read()).value.length, 1024);
    await reader.cancel();
    await new Promise(resolve => setImmediate(resolve));
    assert(generated < 10);
    assert.equal(cancelled, true);
  });

  await check('truncated or excessive streams cannot complete as verified content', async () => {
    for (const body of ['0', '012']) {
      mockedNetwork({ contentResponse: () => new Response(body, { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-1/12' } }) });
      const output = await request('export', 'bytes=0-1');
      await assert.rejects(output.text(), /verified length/);
    }
  });

  console.log(`Review media delivery: ${checks} PASS; no live credentials, database writes or provider calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = oldFetch;
  if (oldSecret === undefined) delete process.env.FINALFRAME_REVIEW_MEDIA_SECRET; else process.env.FINALFRAME_REVIEW_MEDIA_SECRET = oldSecret;
  if (oldOrigin === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL; else process.env.NEXT_PUBLIC_CONVEX_URL = oldOrigin;
});
