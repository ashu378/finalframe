import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { outputFormatForManifest, outputFormatForMimeType, assertStoredRenderMediaType } from '../dist/output-format.js';
import { CompletionOutbox, FileRenderReceiptStore } from '../dist/completion-outbox.js';
import { uploadRenderFile } from '../dist/worker-transfer.js';
import { sendRendererCallback, signCallbackBody } from '../dist/contracts/callback.js';

// Mock Storage/callback services over real local HTTP, original bytes only.
// No database, provider, Chromium, FFmpeg or paid calls.
const root = await mkdtemp(join(tmpdir(), 'finalframe-format-delivery-'));
const sockets = new Set(); const uploads = []; const callbacks = [];
let callbackOffline = false; let checks = 0; let now = Date.now();
const server = createServer(async (request, response) => {
  const parts = []; for await (const part of request) parts.push(part);
  const bytes = Buffer.concat(parts);
  if (request.url === '/callback') {
    const raw = bytes.toString('utf8'); callbacks.push({ raw, headers: request.headers });
    response.writeHead(callbackOffline ? 503 : 202); response.end(); return;
  }
  uploads.push({ bytes, type: request.headers['content-type'] });
  response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ storageId: `storage_${uploads.length}` }));
});
server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
const presets = [['h264', 'MP4', 'mp4', 'video/mp4'], ['vp9', 'WEBM', 'webm', 'video/webm'], ['prores', 'MOV', 'mov', 'video/quicktime']];
const receipts = new FileRenderReceiptStore(join(root, 'receipts'));
function options(directory) {
  return { root: join(root, directory), outputRoot: root, receipts, now: () => now,
    upload: (request, result) => uploadRenderFile(request.storageUploadUrl, result.outputPath, { allowedOrigins: [origin], maxBytes: 1024, mimeType: request.mimeType }),
    callback: (request, raw) => sendRendererCallback(request.callbackUrl, raw, 'local-test', { allowedOrigins: [origin] }),
  };
}
function request(label, mimeType) {
  return { jobId: label, leaseId: `lease-${label}`, attempt: 1, projectId: 'original-local-project', manifestId: `manifest-${label}`, idempotencyKey: `key-${label}`, callbackUrl: `${origin}/callback`, storageUploadUrl: `${origin}/upload`, rendererVersion: 'local-test', durationInFrames: 30, ...(mimeType === undefined ? {} : { mimeType }) };
}
try {
  await check('validated output codec determines extension, MIME and matching export format', () => {
    for (const [codec, format, extension, mimeType] of presets) {
      assert.deepEqual(outputFormatForManifest({ output: { codec }, export: { format } }), { codec, format, extension, mimeType });
      assert.throws(() => outputFormatForManifest({ output: { codec }, export: { format: format === 'MP4' ? 'WEBM' : 'MP4' } }), /does not match/);
      assertStoredRenderMediaType({ version: 5, output: { codec }, export: { format } }, 5, mimeType, mimeType);
      assert.throws(() => assertStoredRenderMediaType({ version: 5, output: { codec } }, 5, 'application/octet-stream', mimeType));
    }
    assert.equal(outputFormatForMimeType().mimeType, 'video/mp4');
    assert.throws(() => outputFormatForManifest({ output: { codec: 'arbitrary' } }));
    assert.throws(() => assertStoredRenderMediaType({ version: 7 }, 7, 'video/mp4'));
    for (const version of [2, 3]) {
      assertStoredRenderMediaType({ version }, version, 'video/mp4');
      assert.throws(() => assertStoredRenderMediaType({ version }, version, 'video/webm', 'video/webm'));
      assert.throws(() => assertStoredRenderMediaType({ version }, version + 1, 'video/mp4'), /contract/);
    }
  });
  await check('real HTTP uploads whitelist media types and preserve exact original bytes', async () => {
    const artifact = join(root, 'direct-upload'); const bytes = Buffer.from('original-local-container-bytes'); await writeFile(artifact, bytes);
    for (const [, , , mimeType] of presets) {
      await uploadRenderFile(`${origin}/upload`, artifact, { allowedOrigins: [origin], maxBytes: 1024, mimeType });
      assert.equal(uploads.at(-1).type, mimeType); assert.deepEqual(uploads.at(-1).bytes, bytes);
    }
    const before = uploads.length;
    for (const mimeType of ['', null, 'text/html', 'video/mp4\r\nx-injected: yes', 'video/MP4']) await assert.rejects(uploadRenderFile(`${origin}/upload`, artifact, { allowedOrigins: [origin], maxBytes: 1024, mimeType }), /media type/);
    assert.equal(uploads.length, before, 'invalid MIME never reaches HTTP');
  });
  for (const [label, , extension, mimeType] of [...presets, ['legacy-mp4', 'MP4', 'mp4', undefined]]) {
    await check(`${label} recovery, exact callback replay and cleanup keep matching MIME/extension`, async () => {
      const config = options(`outbox-${label}`); let box = new CompletionOutbox(config);
      const input = request(label, mimeType); let record = await box.begin(input, { label });
      input.mimeType = 'video/quicktime'; // The persisted request is a snapshot.
      assert.equal(record.request.mimeType, mimeType);
      const outputPath = join(root, `${record.key}.${extension}`); const bytes = Buffer.from(`original-${label}`); await writeFile(outputPath, bytes);
      await receipts.put(record.request.idempotencyKey, { jobId: label, manifestId: record.request.manifestId, durationInFrames: 30, outputPath });
      callbackOffline = true; box = new CompletionOutbox(config); await box.recover(); await box.drain();
      const first = callbacks.at(-1); const parsed = JSON.parse(first.raw);
      assert.equal(parsed.payload.mimeType, mimeType ?? 'video/mp4'); assert.equal(uploads.at(-1).type, mimeType ?? 'video/mp4');
      assert.equal(first.headers['x-finalframe-renderer-signature'], signCallbackBody(first.raw, 'local-test'));
      assert.deepEqual(uploads.at(-1).bytes, bytes); await access(outputPath);
      const uploadedCount = uploads.length; callbackOffline = false; now += 20_000;
      box = new CompletionOutbox(config); await box.recover(); await box.drain();
      assert.equal(uploads.length, uploadedCount, 'restart does not upload again'); assert.equal(callbacks.at(-1).raw, first.raw, 'persisted exact callback body stays unchanged');
      await assert.rejects(access(outputPath));
      const done = JSON.parse(await readFile(join(config.root, `${record.key}.done.json`), 'utf8'));
      assert.equal(done.request.mimeType, mimeType); assert.equal(done.stage, 'DELIVERED');
    });
  }
  await check('recovery does not accept or delete a foreign-format receipt', async () => {
    const config = options('wrong-extension'); const box = new CompletionOutbox(config); const input = request('wrong-extension', 'video/webm');
    const record = await box.begin(input, {}); const wrongPath = join(root, `${record.key}.mp4`); await writeFile(wrongPath, 'retain-evidence');
    await receipts.put(input.idempotencyKey, { jobId: input.jobId, manifestId: input.manifestId, durationInFrames: 30, outputPath: wrongPath });
    const before = uploads.length; await box.recover(); await box.drain();
    assert.equal(uploads.length, before); assert.equal(JSON.parse(callbacks.at(-1).raw).eventType, 'render.failed'); await access(wrongPath);
  });
  await check('movie completions retain MP4 and reject a different MIME', async () => {
    const box = new CompletionOutbox(options('movie')); const movieContext = { movieVersionId: 'movie-version', movieExportId: 'movie-export', planHash: 'local-plan-hash' };
    await box.begin({ ...request('movie', undefined), movieContext }, {});
    await assert.rejects(box.begin({ ...request('wrong-movie', 'video/webm'), movieContext }, {}), /requires MP4/);
  });
  console.log(`Output-format delivery: ${checks} PASS; local HTTP/files only.`);
} finally {
  for (const socket of sockets) socket.destroy(); await new Promise(done => server.close(done)); await rm(root, { recursive: true, force: true });
}
