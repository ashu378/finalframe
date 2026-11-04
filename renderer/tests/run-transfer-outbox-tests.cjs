const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  for (const candidate of [request, request.endsWith('.js') ? request.slice(0, -3) + '.ts' : request]) {
    try { return originalResolve.call(this, candidate, parent, isMain, options); } catch {}
  }
  throw new Error('Cannot resolve test module.');
};
Module._extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { assertTransferUrl, transferOrigins, boundedTransferTimeout, uploadRenderFile } = require(path.join(root, 'src/worker-transfer.ts'));
const { CompletionOutbox, FileRenderReceiptStore } = require(path.join(root, 'src/completion-outbox.ts'));
const { sendRendererCallback, signCallbackBody } = require(path.join(root, 'src/contracts/callback.ts'));
const { sendLeaseHeartbeat, LeaseHeartbeatMonitor } = require(path.join(root, 'src/lease-heartbeat.ts'));

async function main() {
  let checks = 0;
  async function check(name, work) { await work(); checks++; console.log(`PASS ${name}`); }
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'finalframe-transfer-'));
  const sockets = new Set();
  let redirectedRequests = 0;
  let uploadedBytes;
  let callbackReceipt;
  const server = http.createServer(async (request, response) => {
    if (request.url === '/redirect-target') { redirectedRequests++; response.end(); return; }
    if (request.url === '/redirect') { response.writeHead(307, { location: '/redirect-target' }); response.end(); return; }
    if (request.url === '/stall') return;
    if (request.url === '/callback') {
      let raw = ''; for await (const chunk of request) raw += chunk;
      callbackReceipt = { raw, headers: request.headers };
      response.writeHead(202); response.end(); return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    uploadedBytes = Buffer.concat(chunks);
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ storageId: 'storage_accepted' }));
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, resolve));
  const origin = `http://localhost:${server.address().port}`;
  const artifact = path.join(directory, 'artifact.mp4');
  const content = Buffer.alloc(2 * 1024 * 1024 + 7, 37);
  await fsp.writeFile(artifact, content);
  try {
    await check('transfer origins fail closed and derive only pinned Convex origins', async () => {
      assert.deepEqual(transferOrigins(undefined, ['example.com', 'project.convex.cloud'], 'storage'), ['https://project.convex.cloud']);
      assert.deepEqual(transferOrigins(undefined, ['project.convex.cloud'], 'callback'), ['https://project.convex.site']);
      assert.deepEqual(transferOrigins(undefined, [], 'callback'), []);
      for (const value of ['https://wrong.example/path', `${origin}@evil.example`, `${origin}/#secret`, 'file:///etc/passwd', 'https://user:secret@project.convex.site/x']) assert.throws(() => assertTransferUrl(value, [origin]));
      assert.throws(() => transferOrigins('https://user:secret@project.convex.site', [], 'callback'));
      assert.equal(boundedTransferTimeout(Infinity, 120_000, 300_000), 120_000);
      assert.equal(boundedTransferTimeout(999_999, 120_000, 300_000), 300_000);
    });
    await check('actual HTTP upload streams original bytes with bounded receipt', async () => {
      const storageId = await uploadRenderFile(`${origin}/upload`, artifact, { allowedOrigins: [origin], maxBytes: content.length });
      assert.equal(storageId, 'storage_accepted');
      assert.equal(createHash('sha256').update(uploadedBytes).digest('hex'), createHash('sha256').update(content).digest('hex'));
      let sawStream = false;
      await uploadRenderFile(`${origin}/upload`, artifact, { allowedOrigins: [origin], maxBytes: content.length, fetch: async (_url, init) => {
        sawStream = typeof init.body.pipe === 'function' && !Buffer.isBuffer(init.body);
        assert.equal(init.duplex, 'half'); assert.equal(init.redirect, 'error');
        for await (const _chunk of init.body) { /* consume the bounded stream */ }
        return Response.json({ storageId: 'streamed' });
      } });
      assert.equal(sawStream, true);
      await assert.rejects(uploadRenderFile(`${origin}/upload`, artifact, { allowedOrigins: [origin], maxBytes: 1 }), /limits/);
      await assert.rejects(uploadRenderFile(`${origin}/upload`, artifact, { allowedOrigins: [origin], maxBytes: content.length, fetch: async () => new Response('x'.repeat(8193)) }), /receipt exceeds/);
    });
    await check('upload rejects redirects and times out stalled HTTP', async () => {
      await assert.rejects(uploadRenderFile(`${origin}/redirect`, artifact, { allowedOrigins: [origin], maxBytes: content.length }));
      assert.equal(redirectedRequests, 0);
      await assert.rejects(uploadRenderFile(`${origin}/stall`, artifact, { allowedOrigins: [origin], maxBytes: content.length, timeoutMs: 40 }));
    });
    await check('callback keeps exact signed body plus authenticated delivery timestamp', async () => {
      const raw = JSON.stringify({ eventId: 'exact-event', occurredAt: '2026-01-01T00:00:00Z' });
      await sendRendererCallback(`${origin}/callback`, raw, 'test-secret', { allowedOrigins: [origin] });
      assert.equal(callbackReceipt.raw, raw);
      assert.equal(callbackReceipt.headers['x-finalframe-renderer-signature'], signCallbackBody(raw, 'test-secret'));
      const timestamp = callbackReceipt.headers['x-finalframe-delivery-timestamp'];
      assert.ok(Number.isFinite(Date.parse(timestamp)));
      assert.equal(callbackReceipt.headers['x-finalframe-delivery-signature'], signCallbackBody(`${timestamp}\n${raw}`, 'test-secret'));
      await assert.rejects(sendRendererCallback(`${origin}/callback`, raw, 'test-secret', { allowedOrigins: ['https://other.example'] }));
      await assert.rejects(sendRendererCallback(`${origin}/redirect`, raw, 'test-secret', { allowedOrigins: [origin] }));
      assert.equal(redirectedRequests, 0);
      await assert.rejects(sendRendererCallback(`${origin}/stall`, raw, 'test-secret', { allowedOrigins: [origin], timeoutMs: 40 }));
      const ipv4Origin = origin.replace('localhost', '127.0.0.1');
      await sendRendererCallback(`${ipv4Origin}/callback`, raw, 'test-secret', { allowedOrigins: [ipv4Origin] });
    });

    let timestamp = Date.now();
    const receipts = new FileRenderReceiptStore(path.join(directory, 'receipts'));
    const request = { jobId: 'job-1', leaseId: 'lease-1', attempt: 1, projectId: 'project-1', manifestId: 'manifest-1', idempotencyKey: 'job-1-attempt-1', callbackUrl: `${origin}/callback?private-token`, storageUploadUrl: `${origin}/upload?private-token`, rendererVersion: 'test', heartbeatUrl: `${origin}/renderer/heartbeat` };
    let output = path.join(directory, 'outbox-artifact.mp4');
    const result = { jobId: request.jobId, manifestId: request.manifestId, outputPath: output, durationInFrames: 60 };
    let uploads = 0;
    let callbacks = 0;
    let offline = true;
    const bodies = [];
    const options = { root: path.join(directory, 'outbox'), outputRoot: directory, receipts, now: () => timestamp, upload: async () => { uploads++; return 'stored_once'; }, callback: async (_request, raw) => { callbacks++; bodies.push(raw); if (offline) throw new Error('secret URL must never be persisted as an error'); } };
    let box = new CompletionOutbox(options);
    let record;
    await check('callback outage retains artifact and successful upload receipt', async () => {
      record = await box.begin(request, { immutable: 'request' });
      output = path.join(directory, `${record.key}.mp4`); result.outputPath = output;
      await fsp.writeFile(output, 'verified artifact');
      await receipts.put(request.idempotencyKey, result);
      record = await box.rendered(record, result);
      record = await box.deliver(record);
      assert.equal(record.stage, 'CALLBACK_PENDING'); assert.equal(record.storageId, 'stored_once');
      assert.equal(uploads, 1); assert.equal(callbacks, 1);
      assert.equal(await fsp.readFile(output, 'utf8'), 'verified artifact');
      assert.equal((await fsp.stat(path.join(directory, 'outbox'))).mode & 0o777, 0o700);
      assert.equal((await fsp.stat(path.join(directory, 'outbox', `${record.key}.json`))).mode & 0o777, 0o600);
    });
    await check('restart replays identical completion without rendering or uploading again', async () => {
      box = new CompletionOutbox(options); await box.recover();
      offline = false; timestamp += 20_000;
      await box.drain();
      assert.equal(uploads, 1); assert.equal(callbacks, 2); assert.equal(bodies[0], bodies[1]);
      assert.equal(JSON.parse(bodies[1]).eventType, 'render.completed');
      await assert.rejects(fsp.access(output));
      const tombstone = await fsp.readFile(path.join(directory, 'outbox', `${record.key}.done.json`), 'utf8');
      assert.equal(tombstone.includes('private-token'), false);
      assert.equal((await box.begin(request, { immutable: 'request' })).stage, 'DELIVERED');
      await assert.rejects(box.begin(request, { immutable: 'changed' }), /CONFLICT/);
    });
    await check('restart recovers durable verified result from render-to-outbox crash window', async () => {
      const newRequest = { ...request, jobId: 'job-2', leaseId: 'lease-2', idempotencyKey: 'job-2-attempt-1' };
      const incomplete = await box.begin(newRequest, { immutable: 'second-request' });
      const newOutput = path.join(directory, `${incomplete.key}.mp4`);
      await fsp.writeFile(newOutput, 'retained verified artifact');
      await receipts.put(newRequest.idempotencyKey, { ...result, jobId: newRequest.jobId, outputPath: newOutput });
      box = new CompletionOutbox(options); await box.recover(); await box.drain();
      assert.equal(uploads, 2);
      const done = JSON.parse(await fsp.readFile(path.join(directory, 'outbox', `${incomplete.key}.done.json`), 'utf8'));
      assert.equal(done.stage, 'DELIVERED');
      assert.equal(JSON.parse(bodies.at(-1)).eventType, 'render.completed');
    });
    await check('interrupted unverified render reports failure rather than inventing completion', async () => {
      const interrupted = await box.begin({ ...request, jobId: 'job-3', leaseId: 'lease-3', idempotencyKey: 'job-3-attempt-1' }, { immutable: 'third-request' });
      box = new CompletionOutbox(options); await box.recover(); await box.drain();
      assert.equal(uploads, 2);
      assert.equal(JSON.parse(bodies.at(-1)).eventType, 'render.failed');
      assert.ok(await fsp.stat(path.join(directory, 'outbox', `${interrupted.key}.done.json`)));
    });
    await check('recovery rejects old-lease, foreign-job, wrong-manifest and deleted receipts', async () => {
      for (const [index, mismatch] of ['old-lease', 'foreign-job', 'wrong-manifest', 'deleted', 'wrong-duration', 'wrong-size'].entries()) {
        const badRequest = { ...request, jobId: `bad-${index}`, leaseId: `bad-lease-${index}`, idempotencyKey: `bad-key-${index}`, durationInFrames: 60 };
        const bad = await box.begin(badRequest, { mismatch });
        const expectedPath = path.join(directory, `${bad.key}.mp4`);
        const saved = { ...result, jobId: badRequest.jobId, outputPath: expectedPath };
        if (mismatch !== 'deleted') await fsp.writeFile(expectedPath, 'verified');
        if (mismatch === 'old-lease') saved.outputPath = path.join(directory, 'earlier-lease.mp4');
        if (mismatch === 'foreign-job') saved.jobId = 'another-job';
        if (mismatch === 'wrong-manifest') saved.manifestId = 'another-manifest';
        if (mismatch === 'wrong-duration') saved.durationInFrames = 10;
        if (mismatch === 'wrong-size') saved.verification = { fileSizeBytes: 500 };
        await receipts.put(badRequest.idempotencyKey, saved);
        box = new CompletionOutbox(options); await box.recover(); await box.drain();
        assert.equal(JSON.parse(bodies.at(-1)).eventType, 'render.failed', mismatch);
      }
      assert.equal(uploads, 2, 'invalid receipt can never trigger upload');
    });
    await check('upload failure retains verified media until a later successful transfer', async () => {
      let unavailable = true;
      const pendingOptions = { ...options, root: path.join(directory, 'upload-failure'), upload: async () => { if (unavailable) throw new Error('offline'); return 'stored_later'; } };
      const pendingBox = new CompletionOutbox(pendingOptions);
      let pending = await pendingBox.begin({ ...request, leaseId: 'upload-lease' }, { request: 'upload' });
      const kept = path.join(directory, `${pending.key}.mp4`); await fsp.writeFile(kept, 'retained');
      pending = await pendingBox.rendered(pending, { ...result, outputPath: kept });
      assert.equal((await pendingBox.deliver(pending)).stage, 'UPLOAD_PENDING');
      assert.ok(await fsp.stat(kept));
      unavailable = false; timestamp += 20_000; await pendingBox.drain();
      await assert.rejects(fsp.access(kept));
    });
    await check('restart rejects an upload-pending record whose artifact disappeared', async () => {
      const missingBox = new CompletionOutbox({ ...options, root: path.join(directory, 'missing-upload') });
      const missingRequest = { ...request, jobId: 'missing-upload', leaseId: 'missing-upload-lease', idempotencyKey: 'missing-upload-key' };
      let missing = await missingBox.begin(missingRequest, { missing: true });
      const missingPath = path.join(directory, `${missing.key}.mp4`); await fsp.writeFile(missingPath, 'verified');
      missing = await missingBox.rendered(missing, { ...result, jobId: missingRequest.jobId, outputPath: missingPath });
      await fsp.rm(missingPath);
      const before = uploads; await missingBox.recover(); await missingBox.drain();
      assert.equal(uploads, before); assert.equal(JSON.parse(bodies.at(-1)).eventType, 'render.failed');
    });
    await check('expired finishing window retains artifact for operator attention', async () => {
      const expiryRoot = path.join(directory, 'expired-outbox');
      const expiryBox = new CompletionOutbox({ ...options, root: expiryRoot });
      const expiredPath = path.join(directory, 'expired-artifact.mp4'); await fsp.writeFile(expiredPath, 'retain for inspection');
      let expired = await expiryBox.begin({ ...request, leaseId: 'expired-lease' }, { request: 'expired' });
      expired = await expiryBox.rendered(expired, { ...result, outputPath: expiredPath });
      const before = uploads; timestamp += 2 * 60 * 60 * 1000;
      assert.equal((await expiryBox.deliver(expired)).stage, 'NEEDS_ATTENTION');
      assert.equal(uploads, before); assert.ok(await fsp.stat(expiredPath));
    });
    await check('heartbeat signs exact lease authority and uses bounded authenticated endpoint', async () => {
      const heartbeat = { ...record, request, stage: 'UPLOAD_PENDING' };
      let sent;
      assert.equal(await sendLeaseHeartbeat(heartbeat, { secret: 'heartbeat-secret', allowedOrigins: [origin], fetch: async (_url, init) => { sent = init; return Response.json({ leaseExpiresAt: Date.now() + 300_000, cancellationRequested: false }); } }), 'active');
      const parsed = JSON.parse(sent.body);
      assert.equal(parsed.stage, 'UPLOADING'); assert.equal(parsed.leaseId, request.leaseId); assert.equal(parsed.attempt, 1);
      assert.equal(sent.headers['x-finalframe-renderer-signature'], signCallbackBody(sent.body, 'heartbeat-secret'));
      assert.equal(sent.redirect, 'error');
      await assert.rejects(sendLeaseHeartbeat({ ...heartbeat, request: { ...request, heartbeatUrl: `${origin}/other` } }, { secret: 'test', allowedOrigins: [origin] }));
      await assert.rejects(sendLeaseHeartbeat(heartbeat, { secret: 'test', allowedOrigins: [origin], fetch: async () => new Response('x'.repeat(4097)) }), /receipt exceeds/);
      let requests = 0;
      const monitor = new LeaseHeartbeatMonitor({ secret: 'test', allowedOrigins: [origin], fetch: async () => { requests++; return new Response(null, { status: 409 }); } });
      monitor.track(heartbeat); await monitor.tick(); monitor.track(heartbeat); await monitor.tick();
      assert.equal(requests, 1, 'denied lease cannot be rearmed by a pending-stage update');
      let pendingCalls = 0;
      const recovering = new LeaseHeartbeatMonitor({ secret: 'test', allowedOrigins: [origin], fetch: async () => { pendingCalls++; return pendingCalls === 1 ? new Response(null, { status: 425 }) : new Response(JSON.stringify({ leaseExpiresAt: Date.now() + 60_000, cancellationRequested: false })); } });
      recovering.track(heartbeat); await recovering.tick(); await recovering.tick();
      assert.equal(pendingCalls, 2, 'pending202 acknowledgement425 cannot permanently disable later accepted-lease renewal');
    });
    await check('Remotion caches and deduplicates bundles while failed bundles remain retryable', async () => {
      let bundleCalls = 0; let failNext = false;
      let browsersOpened = 0; let browsersClosed = 0;
      const originalLoad = Module._load;
      Module._load = function (request, parent, isMain) {
        if (request === '@remotion/bundler') return { bundle: async () => { bundleCalls++; await new Promise(resolve => setImmediate(resolve)); if (failNext) { failNext = false; throw new Error('bundle unavailable'); } return 'http://local-bundle'; } };
        if (request === '@remotion/renderer') return {
          openBrowser: async () => { browsersOpened++; return { close: async () => { browsersClosed++; } }; },
          makeCancelSignal: () => ({ cancelSignal: () => {}, cancel: () => {} }),
          selectComposition: async () => ({}),
          renderMedia: async options => { await fsp.writeFile(options.outputLocation, 'rendered media'); },
        };
        return originalLoad.call(this, request, parent, isMain);
      };
      let Runtime;
      try { Runtime = require(path.join(root, 'src/remotion/runtime.ts')).RemotionRenderRuntime; } finally { Module._load = originalLoad; }
      const fixture = JSON.parse(await fsp.readFile(path.join(root, 'fixtures/kinetic-title.json'), 'utf8'));
      const { createAssemblyPlan } = require(path.join(root, 'src/assembly/plan.ts'));
      const plan = createAssemblyPlan(fixture);
      const runtimeOptions = { entryPoint: '/local/entry.js', ffmpeg: { execute: async argv => { await fsp.writeFile(argv.at(-1), 'normalized media'); return { stdout: '', stderr: '', exitCode: 0 }; } }, ffprobe: { probe: async () => ({ streams: [{ codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, avg_frame_rate: '30/1' }], format: { duration: '5' } }) } };
      const runtime = new Runtime(runtimeOptions);
      const render = (worker, jobId) => worker.render(plan, { jobId, manifest: fixture, mode: 'fixture', outputPath: path.join(directory, `${jobId}.mp4`) });
      await Promise.all([render(runtime, 'cache-one'), render(runtime, 'cache-two')]);
      await render(runtime, 'cache-three'); assert.equal(bundleCalls, 1);
      const retryRuntime = new Runtime(runtimeOptions); failNext = true;
      await assert.rejects(render(retryRuntime, 'cache-failed'), /bundle unavailable/);
      await render(retryRuntime, 'cache-retried'); assert.equal(bundleCalls, 3);
      assert.equal(browsersOpened, 4);
      assert.equal(browsersClosed, browsersOpened);
    });
    console.log(`Renderer transfer/outbox tests: ${checks} PASS; local HTTP/files only, no database/provider calls.`);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    await fsp.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
