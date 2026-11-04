import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { signCallbackBody } from '../dist/contracts/callback.js';

// Real worker processes, a private disk volume, original media, and an isolated
// loopback transport fixture. No remote render, credentials, database or spend.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(join(process.env.FINALFRAME_PERSISTENT_TEST_ROOT ?? homedir(), '.finalframe-worker-restart-'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const secret = randomBytes(32).toString('hex');
const loads = [0, 0, 0];
const completions = [];
const workers = new Set();
let holdSecondInput = true;
let holdCompletion = true;
let stored;
let uploads = 0;

async function waitFor(probe, name, timeout = 12_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await probe()) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${name}.`);
}

function command(executable, args) {
  const result = spawnSync(executable, args, { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString() ?? String(result.error));
  return result.stdout;
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

const inputs = [];
const fixture = createServer(async (request, response) => {
  const path = request.url;
  if (/^\/api\/storage\/[0-2]$/.test(path)) {
    const index = Number(path.at(-1));
    loads[index]++;
    if (index === 1 && holdSecondInput) return;
    response.end(inputs[index]);
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  if (path === '/api/storage/upload') {
    uploads++;
    stored = bytes;
    response.end(JSON.stringify({ storageId: 'fixture-stored-movie' }));
    return;
  }
  if (path === '/renderer/movie-callback' || path === '/renderer/movie-heartbeat') {
    const raw = bytes.toString('utf8');
    if (request.headers['x-finalframe-renderer-signature'] !== signCallbackBody(raw, secret)) { response.writeHead(401).end(); return; }
    const body = JSON.parse(raw);
    if (path.endsWith('-heartbeat')) {
      response.end(JSON.stringify({ leaseExpiresAt: Date.now() + 60_000, cancellationRequested: false }));
      return;
    }
    completions.push({ raw, body });
    response.writeHead(body.eventType === 'render.completed' && holdCompletion ? 503 : 202).end();
    return;
  }
  response.writeHead(404).end();
});

async function startWorker(origin, bootstrap) {
  const portReservation = createServer();
  const workerOrigin = await listen(portReservation);
  await new Promise(done => portReservation.close(done));
  const processGroup = spawn(process.execPath, ['--import', bootstrap, join(root, 'dist/server.js')], {
    cwd: root, detached: true, stdio: ['ignore', 'ignore', 'pipe'],
    env: { PATH: process.env.PATH, HOME: directory, LANG: 'C.UTF-8', NODE_ENV: 'production',
      PORT: new URL(workerOrigin).port, RENDER_WORKER_SHARED_SECRET: secret, RENDERER_VERSION: 'fixture-worker-pcm-v1',
      RENDER_MEDIA_ALLOWED_HOSTS: 'worker-restart-fixture.convex.cloud', RENDER_CALLBACK_ORIGINS: origin, RENDER_STORAGE_ORIGINS: origin,
      RENDER_STATE_ROOT: join(directory, 'state'), RENDER_OUTPUT_ROOT: join(directory, 'output'), RENDER_MAX_OUTPUT_BYTES: '8000000',
      FINALFRAME_MOVIE_ENABLED: 'true', FINALFRAME_LOCAL_FIXTURE_ORIGIN: origin },
  });
  workers.add(processGroup);
  let stderr = '';
  processGroup.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2500); });
  await waitFor(async () => {
    if (processGroup.exitCode !== null) throw new Error(`Local renderer stopped early: ${stderr}`);
    try { return (await fetch(`${workerOrigin}/health`, { signal: AbortSignal.timeout(250) })).ok; }
    catch { return false; }
  }, 'local worker health');
  return { processGroup, workerOrigin };
}

async function stopWorker(processGroup) {
  if (processGroup.exitCode !== null || processGroup.signalCode !== null) return;
  const closed = once(processGroup, 'close');
  process.kill(-processGroup.pid, 'SIGKILL');
  assert.equal((await closed)[1], 'SIGKILL');
}

try {
  const origin = await listen(fixture);
  const bootstrap = join(directory, 'loopback-only.mjs');
  await writeFile(bootstrap, `import { Server } from 'node:net';
const listen = Server.prototype.listen;
Server.prototype.listen = function(port, host, ...rest) { return listen.call(this, port, host === '0.0.0.0' ? '127.0.0.1' : host, ...rest); };
const fetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input); const fixture = new URL(process.env.FINALFRAME_LOCAL_FIXTURE_ORIGIN);
  if (url.origin === 'https://worker-restart-fixture.convex.cloud' && /^\\/api\\/storage\\/[0-2]$/.test(url.pathname)) return fetch(new URL(url.pathname, fixture), init);
  if (url.origin === fixture.origin) return fetch(input, init);
  throw new Error('Unexpected non-fixture transport.');
};\n`);
  for (const [index, [color, frequency]] of [['red', 440], ['green', 660], ['blue', 880]].entries()) {
    const output = join(directory, `source-${index}.mp4`);
    command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=160x90:r=30:d=2`,
      '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=2`, '-c:v', 'libx264', '-preset', 'medium',
      '-crf', '18', '-threads', '1', '-pix_fmt', 'yuv420p', '-ac', '2', '-c:a', 'aac', '-b:a', '192k', output]);
    inputs.push(await readFile(output));
  }
  const parts = inputs.map((bytes, index) => ({ partId: `part-${index}`, componentId: `scene-${index}`, orderIndex: index,
    sourceManifestId: `manifest-${index}`, sourceManifestSha256: digest(`manifest-${index}`), renderJobId: `render-${index}`,
    storageId: `storage-${index}`, checksum: digest(bytes), byteSize: bytes.length, url: `https://worker-restart-fixture.convex.cloud/api/storage/${index}`,
    sourceDurationInFrames: 60, sourceStartFrame: 0, durationInFrames: 60, outputStartFrame: index * 60 }));
  const request = { version: 1, kind: 'finalframe.movie-merge', mediaAbi: 'fixture-worker-pcm-v1', jobId: 'movie-job', projectId: 'project-fixture',
    movieVersionId: 'movie-version', movieExportId: 'movie-export', planHash: digest('three exact original clips'), idempotencyKey: 'movie-attempt-one',
    attempt: 1, leaseId: 'lease-one', callbackUrl: `${origin}/renderer/movie-callback`, heartbeatUrl: `${origin}/renderer/movie-heartbeat`,
    storageUploadUrl: `${origin}/api/storage/upload`, output: { width: 160, height: 90, fps: 30, durationInFrames: 180, codec: 'h264', audioSampleRate: 48000, audioChannels: 2 }, parts };
  async function dispatch(worker, payload) {
    const response = await fetch(`${worker.workerOrigin}/movie/merge`, { method: 'POST', signal: AbortSignal.timeout(3000),
      headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret }, body: JSON.stringify(payload) });
    assert.equal(response.status, 202, await response.text());
  }

  const first = await startWorker(origin, bootstrap);
  await dispatch(first, request);
  await waitFor(() => loads[1] === 1, 'blocked second source after the verified first source');
  const cacheKey = digest(`${request.projectId}:${request.planHash}`);
  const cached = join(directory, 'state', 'movie-work', cacheKey, `source-${digest(`${parts[0].storageId}:${parts[0].checksum}`)}.mp4`);
  assert.equal(digest(await readFile(cached)), parts[0].checksum);
  const originalCache = await stat(cached);
  await stopWorker(first.processGroup);
  assert.equal((await stat(cached)).ino, originalCache.ino);
  assert.equal(uploads, 0);

  const second = await startWorker(origin, bootstrap);
  await waitFor(() => completions.some(({ body }) => body.eventType === 'render.failed' && body.attempt === 1), 'signed interruption callback');
  assert.equal((await stat(cached)).ino, originalCache.ino);
  holdSecondInput = false;
  await dispatch(second, { ...request, attempt: 2, leaseId: 'lease-two', idempotencyKey: 'movie-attempt-two' });
  await waitFor(() => completions.some(({ body }) => body.eventType === 'render.completed' && body.attempt === 2), 'verified merge and blocked completion');
  assert.deepEqual(loads, [1, 2, 1]);
  assert.equal(uploads, 1);
  const completion = completions.find(({ body }) => body.eventType === 'render.completed');
  assert.equal(completion.body.payload.checksum, digest(stored));
  assert.equal(completion.body.payload.verification.durationInFrames, 180);
  assert.deepEqual(completion.body.payload.verification.orderedPartIds, parts.map(part => part.partId));

  await stopWorker(second.processGroup);
  holdCompletion = false;
  await startWorker(origin, bootstrap);
  await waitFor(() => completions.filter(item => item.raw === completion.raw).length === 2, 'exact completion replay after second restart', 25_000);
  assert.equal(uploads, 1);
  assert.deepEqual(loads, [1, 2, 1]);
  const output = join(directory, 'retained-fixture.mp4');
  await writeFile(output, stored);
  const probe = JSON.parse(command('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', output]));
  assert.equal(Number(probe.streams.find(stream => stream.codec_type === 'video').nb_frames), 180);
  assert.equal(Number(probe.streams.find(stream => stream.codec_type === 'audio').duration), 6);
  console.log('PASS actual worker restart recovered the original first component, reported the interrupted attempt, and replayed one verified upload after a second restart. Three original clips, 180 frames, zero provider or database calls.');
} finally {
  await Promise.all([...workers].map(stopWorker));
  fixture.closeAllConnections();
  await new Promise(done => fixture.close(done));
  await rm(directory, { recursive: true, force: true });
}
