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
  const requests = [];
  let imageAttempts = 0;
  let pollAttempts = 0;
  const handler = (request) => {
    requests.push(request);
    const url = new URL(request.url);
    const body = request.body || {};

    if (url.pathname.endsWith('/images')) {
      if (body.prompt === 'retry-me' && imageAttempts++ === 0) {
        return jsonResponse({ error: { code: 'rate_limited', message: 'try again' } }, 429);
      }
      return jsonResponse({ model: body.model, data: [{ b64_json: 'aW1hZ2U=', media_type: 'image/png' }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5, cost: 0.12 } });
    }
    if (url.pathname.endsWith('/videos') && request.method === 'POST') {
      return jsonResponse({ id: 'video-1', status: 'queued', model: body.model, generation_id: 'generation-1', usage: { cost: 0.33 } });
    }
    if (url.pathname.endsWith('/videos/video-1') && request.method === 'GET') {
      pollAttempts += 1;
      return jsonResponse(pollAttempts === 1
        ? { id: 'video-1', status: 'processing' }
        : { id: 'video-1', status: 'completed', unsigned_urls: ['https://example.test/one.mp4', 'https://example.test/two.mp4'], usage: { seconds: 4, cost: 0.44 } });
    }
    if (url.pathname.endsWith('/videos/video-1/content') && request.method === 'GET') {
      assert.equal(url.searchParams.get('index'), '1');
      return { headers: { 'content-type': 'video/mp4', 'x-request-id': 'download-1' }, binaryBody: new Uint8Array([0, 1, 2, 3]).buffer };
    }
    if (url.pathname.endsWith('/audio/speech')) {
      return { headers: { 'content-type': 'audio/mpeg', 'x-request-id': 'speech-1', 'x-generation-id': 'speech-generation-1', 'x-openrouter-usage': JSON.stringify({ usage: { seconds: 2, cost: 0.05 } }) }, binaryBody: new Uint8Array([1, 2, 3]).buffer };
    }
    if (url.pathname.endsWith('/audio/transcriptions')) {
      return jsonResponse({ text: 'A deterministic transcript.', segments: [{ start: 0, end: 1, text: 'A deterministic transcript.' }], usage: { seconds: 1, cost: 0.02 } });
    }
    return jsonResponse({ error: { code: 'not_found', message: 'not found' } }, 404);
  };

  const imageRequest = { model: 'openrouter/auto', prompt: 'same-input' };
  const firstImage = await adapter.generateImage(imageRequest, transport(handler));
  const secondImage = await adapter.generateImage(imageRequest, transport(handler));
  assert.equal(firstImage.costUsd, 0.12);
  assert.equal(firstImage.usage.totalTokens, 5);
  const imagePosts = requests.filter((request) => new URL(request.url).pathname.endsWith('/images'));
  assert.equal(imagePosts[0].headers['x-idempotency-key'], imagePosts[1].headers['x-idempotency-key']);
  assert.equal(imagePosts[0].body.prompt, 'same-input');

  const retryImage = await adapter.generateImage({ model: 'openrouter/auto', prompt: 'retry-me' }, transport(handler, { retry: { maxRetries: 1, baseDelayMs: 0, sleep: async () => {} } }));
  assert.equal(retryImage.costUsd, 0.12);
  const retryPosts = requests.filter((request) => new URL(request.url).pathname.endsWith('/images') && request.body.prompt === 'retry-me');
  assert.equal(retryPosts.length, 2);
  assert.equal(retryPosts[0].headers['x-idempotency-key'], retryPosts[1].headers['x-idempotency-key']);

  const video = await adapter.generateVideo({ model: 'auto', prompt: 'A short production shot.', duration: 4, aspectRatio: '16:9' }, transport(handler));
  assert.equal(video.id, 'video-1');
  assert.equal(video.costUsd, 0.33);
  const completed = await adapter.waitForVideo('video-1', transport(handler), { maxAttempts: 3, intervalMs: 0 });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.costUsd, 0.44);
  const downloaded = await adapter.downloadVideo('video-1', transport(handler), 1);
  assert.equal(downloaded.contentType, 'video/mp4');
  assert.deepEqual(Array.from(new Uint8Array(downloaded.body)), [0, 1, 2, 3]);

  const speech = await adapter.synthesizeSpeech({ model: 'openrouter/auto', input: 'Hello from FinalFrame.', voice: 'alloy' }, transport(handler));
  assert.equal(speech.generationId, 'speech-generation-1');
  assert.equal(speech.costUsd, 0.05);
  assert.equal(speech.audio.byteLength, 3);

  const transcript = await adapter.transcribeAudio({ model: 'openrouter/auto', audio: { data: 'YXVkaW8=', format: 'wav' } }, transport(handler));
  assert.equal(transcript.text, 'A deterministic transcript.');
  assert.equal(transcript.costUsd, 0.02);

  const gatewayImage = await gateway.executeProviderCapability({ kind: 'image', request: { model: 'openrouter/auto', prompt: 'gateway image' }, options: transport(handler) });
  assert.equal(gatewayImage.images.length, 1);

  let unsupported;
  try {
    await adapter.generateImage({ model: 'not-in-registry', prompt: 'must fail before transport' }, transport(handler));
  } catch (error) {
    unsupported = error;
  }
  assert.equal(unsupported.code, 'UNSUPPORTED_MODEL');
  assert.equal(unsupported.retryable, false);

  const invalidHandler = () => jsonResponse({ error: { code: 'bad_request', message: 'invalid provider request' } }, 400);
  let normalized;
  try {
    await adapter.generateImage({ model: 'openrouter/auto', prompt: 'private prompt that must not be echoed' }, transport(invalidHandler));
  } catch (error) {
    normalized = error;
  }
  assert.equal(normalized.code, 'INVALID_REQUEST');
  assert.equal(normalized.retryable, false);
  assert.equal(normalized.details.providerCode, 'bad_request');
  assert.equal(JSON.stringify(normalized.details).includes('private prompt'), false);

  console.log(JSON.stringify({ ok: true, requests: requests.length, imageCost: firstImage.costUsd, videoCost: completed.costUsd, speechGenerationId: speech.generationId }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
