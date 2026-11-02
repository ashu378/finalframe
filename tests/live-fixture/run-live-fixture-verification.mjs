import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient, requireOnlineConvexUrl } from '../../scripts/dev-fixture/client.mjs';
import { createFixturePlan } from '../../scripts/dev-fixture/fake-providers.mjs';

const exec = promisify(execFile);
const stateFile = process.env.FINALFRAME_FIXTURE_STATE_FILE || '/tmp/finalframe-fixture-run.json';
const reportPath = process.env.FINALFRAME_FIXTURE_REPORT || 'FINALFRAME-LIVE-FIXTURE-VERIFICATION.md';
const marker = 'finalframe-dev-fixture-v1';
const onlineConvexUrl = requireOnlineConvexUrl();
let state = null;
try { state = JSON.parse(await readFile(stateFile, 'utf8')); } catch { /* The report below records that seeding did not complete. */ }
const checks = [];
const failures = [];

function assert(condition, message) { if (!condition) throw new Error(message); }
function record(name, detail) { checks.push({ name, status: 'PASS', detail }); }
async function expectFailure(name, operation, expected = '') {
  try { await operation(); throw new Error(`${name} unexpectedly succeeded`); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('unexpectedly succeeded')) throw error;
    if (expected && !message.toLowerCase().includes(expected.toLowerCase())) throw new Error(`${name} failed with an unexpected error: ${message}`);
    checks.push({ name, status: 'PASS', detail: message });
  }
}

async function uploadAsset(client, file, project, externalId) {
  const uploadUrl = await client.mutation(api.assetStorage.generateUploadUrl, { projectId: project.projectId, studioExternalId: project.studioExternalId });
  const body = await readFile(file.path);
  const response = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': file.mimeType }, body });
  assert(response.ok, `foreign fixture upload failed with HTTP ${response.status}`);
  const uploaded = await response.json();
  return await client.mutation(api.assetStorage.ingestAsset, {
    studioExternalId: project.studioExternalId,
    scope: 'PROJECT',
    projectId: project.projectId,
    storageId: uploaded.storageId,
    externalId,
    source: 'fixture',
    roles: [file.role],
    name: `${file.name} foreign probe`,
    mimeType: file.mimeType,
    checksum: file.checksum,
    metadata: { fixtureMarker: marker, isolationProbe: true },
    rights: { status: 'APPROVED', consent: true },
    consent: { status: 'APPROVED' },
  });
}

async function startCallbackProxy(targetUrl) {
  let captured = null;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const forwarded = await fetch(targetUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-renderer-signature': request.headers['x-finalframe-renderer-signature'] || '', 'x-finalframe-worker-secret': request.headers['x-finalframe-worker-secret'] || '' }, body: rawBody });
    captured = { rawBody, signature: String(request.headers['x-finalframe-renderer-signature'] || ''), responseStatus: forwarded.status };
    response.writeHead(forwarded.status, { 'content-type': 'application/json' });
    response.end(await forwarded.text());
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, url: `http://localhost:${address.port}/renderer/callback`, get captured() { return captured; } };
}

function sign(body, secret) { return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`; }

async function sendCallback(url, body, secret, signature = sign(body, secret)) {
  return await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-renderer-signature': signature, 'x-finalframe-worker-secret': secret }, body });
}

async function probeVideo(file) {
  const info = await stat(file);
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', file]);
  return { sizeBytes: info.size, probe: JSON.parse(stdout), sha256: createHash('sha256').update(await readFile(file)).digest('hex') };
}

function markdown(report) {
  const lines = [
    '# FinalFrame live fixture verification', '',
    `- Run: ${new Date().toISOString()}`,
    `- Convex deployment URL: ${state?.convexUrl || process.env.NEXT_PUBLIC_CONVEX_URL || 'not configured'}`,
    `- Fixture marker: ${marker}`,
    `- Paid provider calls: ${report.paidProviderCalls}`,
    `- OpenRouter calls: ${report.openRouterCalls}`,
    `- MP4 rendered: ${report.mp4Rendered} (deterministic FFmpeg fixture only; no paid AI generation)`, '',
    '## Commands', '',
    '```bash',
    'FINALFRAME_DEV_FIXTURES=true FINALFRAME_DEV_FIXTURE_ENV=development FINALFRAME_DEV_FIXTURE_KEY="$FINALFRAME_DEV_FIXTURE_KEY" FINALFRAME_FIXTURE_OWNER_EMAIL="fixture-owner@example.test" FINALFRAME_FIXTURE_OWNER_PASSWORD="$FINALFRAME_FIXTURE_OWNER_PASSWORD" node scripts/dev-fixture/seed.mjs',
    'node tests/live-fixture/run-live-fixture-verification.mjs',
    'node scripts/dev-fixture/reset.mjs',
    '```', '',
    '## Development-only files', '',
    '- `convex/devFixtures.ts` — guarded idempotent project/graph/render seed, regeneration probe, isolation probe, and reset.',
    '- `scripts/dev-fixture/client.mjs` — Convex Auth fixture client.',
    '- `scripts/dev-fixture/fake-providers.mjs` — deterministic provider seams; disabled in production.',
    '- `scripts/dev-fixture/fixture-media.mjs` — local FFmpeg image/video/audio fixtures.',
    '- `scripts/dev-fixture/seed.mjs` and `reset.mjs` — seed/reset commands.',
    '- `tests/live-fixture/run-live-fixture-verification.mjs` — live infrastructure verification and this report.', '',
    '## Required environment', '',
    '`FINALFRAME_DEV_FIXTURES=true`, `FINALFRAME_DEV_FIXTURE_ENV=development`, `FINALFRAME_DEV_FIXTURE_KEY`, `FINALFRAME_FIXTURE_OWNER_EMAIL`, `FINALFRAME_FIXTURE_OWNER_PASSWORD`, `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_SITE_URL`, `RENDER_WORKER_URL`, and `RENDER_WORKER_SHARED_SECRET`. `FINALFRAME_TEST_AUTH_TOKEN` is optional when the fixture client can sign in with the dedicated account.', '',
    '## A. Infrastructure, render, and export', '',
    `Result: **${report.infrastructureStatus}**`, '',
    '| Check | Status | Detail |', '|---|---|---|',
    ...report.checks.map((check) => `| ${check.name} | ${check.status} | ${String(check.detail ?? '').replaceAll('|', '\\|')} |`), '',
    '## Identifiers', '',
    '```json', JSON.stringify(report.ids, null, 2), '```', '',
    '## Manifest and timeline evidence', '',
    '```json', JSON.stringify({ manifest: report.manifest, timeline: report.timeline, renderStatus: report.renderStatus, callback: report.callback, media: report.media }, null, 2), '```', '',
    '## B. AI provider verification', '',
    'Result: **NOT RUN**. Fake adapters produced the plan fixture only. OpenRouter, image, video, transcription, voice, and payment providers were not called.', '',
    '## Failures and required fixes', '',
    report.failures.length ? report.failures.map((failure) => `- ${failure}`).join('\n') : 'No failures.', '',
    '## Cleanup', '',
    'Run `node scripts/dev-fixture/reset.mjs` with the explicit development flags and confirmation. The reset soft-deletes only fixture-marked projects; project data, storage and audit evidence are retained. The dedicated Convex Auth owner identity is intentionally retained unless an owner-approved account deletion procedure is added.', '',
  ];
  return lines.join('\n');
}

async function main() {
  if (!state) {
    const target = onlineConvexUrl;
    try {
      const health = await fetch(`${target.replace(/\/$/, '')}/health`);
      throw new Error(`Fixture state file ${stateFile} is missing after a reachable Convex deployment returned HTTP ${health.status}. Run scripts/dev-fixture/seed.mjs first.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Fixture state file')) throw error;
      throw new Error(`Infrastructure preflight failed: Convex deployment ${target} is not reachable; seed could not start. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const { client } = await createAuthenticatedClient();
  const secret = process.env.RENDER_WORKER_SHARED_SECRET;
  const rendererUrl = process.env.RENDER_WORKER_URL;
  const siteUrl = process.env.CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  assert(secret && rendererUrl && siteUrl, 'RENDER_WORKER_SHARED_SECRET, RENDER_WORKER_URL, and CONVEX_SITE_URL are required for live renderer verification.');
  const graph = await client.query(api.productionGraph.get, { productionId: state.graph.productionId });
  assert(graph?.production?.projectId?.toString() === state.graph.projectId.toString(), 'production project ownership mismatch');
  const nodeKind = (node) => node.kind ?? node.type;
  assert(graph.nodes?.some((node) => nodeKind(node) === 'sequence') && graph.nodes?.some((node) => nodeKind(node) === 'scene') && graph.nodes?.filter((node) => nodeKind(node) === 'shot').length >= 2, 'production hierarchy is incomplete');
  record('project → production → production version → sequence → scene → two shots', graph.summary);
  const firstShot = await client.query(api.scenes.getShot, { shotId: state.graph.shotIds[0] });
  assert(firstShot.takes?.length >= 1, 'first shot has no take');
  record('shotVersion/take persistence', { takeIds: firstShot.takes.map((take) => take._id) });
  await expectFailure('locked take mutation denial', () => client.mutation(api.scenes.updateTake, { shotVersionId: state.graph.takeIds[0], promptSnapshot: 'must be rejected' }));
  record('regeneration preserves the prior take', { previousTakeId: state.regeneration.previousTakeId, newTakeId: state.regeneration.newTakeId });

  const isolationExternalId = `${state.project.externalId}:isolation`;
  const secondProject = await client.mutation(api.devFixtures.ensureProject, { fixtureKey: process.env.FINALFRAME_DEV_FIXTURE_KEY, externalId: isolationExternalId, name: 'FinalFrame fixture isolation probe' });
  const foreignAsset = await uploadAsset(client, state.media.find((file) => file.role === 'IMAGE'), secondProject, `${isolationExternalId}:image`);
  const originalClip = await client.mutation(api.devFixtures.patchFixtureClipAsset, { fixtureKey: process.env.FINALFRAME_DEV_FIXTURE_KEY, timelineId: state.graph.timelineId, assetId: foreignAsset.assetId });
  await expectFailure('cross-project asset denial', () => client.mutation(api.assembly.createJob, { productionId: state.graph.productionId, timelineId: state.graph.timelineId, selectionScope: 'FULL_PROJECT', idempotencyKey: 'finalframe-dev-fixture:probe-cross-project' }));
  await client.mutation(api.devFixtures.patchFixtureClipAsset, { fixtureKey: process.env.FINALFRAME_DEV_FIXTURE_KEY, timelineId: state.graph.timelineId, assetId: state.globalAsset.assetId });
  await expectFailure('global asset without import denial', () => client.mutation(api.assembly.createJob, { productionId: state.graph.productionId, timelineId: state.graph.timelineId, selectionScope: 'FULL_PROJECT', idempotencyKey: 'finalframe-dev-fixture:probe-global' }));
  await client.mutation(api.devFixtures.patchFixtureClipAsset, { fixtureKey: process.env.FINALFRAME_DEV_FIXTURE_KEY, timelineId: state.graph.timelineId, assetId: originalClip.previousAssetId });
  record('asset isolation probes', { foreignAssetId: foreignAsset.assetId, globalAssetId: state.globalAsset.assetId });
  await client.mutation(api.devFixtures.reset, { fixtureKey: process.env.FINALFRAME_DEV_FIXTURE_KEY, projectExternalId: isolationExternalId, confirm: 'RETAIN_FINALFRAME_DEV_FIXTURES' });

  const hiddenProject = await client.mutation(api.projects.softDelete, { projectId: state.graph.projectId });
  const listedAfterDelete = await client.query(api.projects.list, { studioExternalId: state.project.studioExternalId });
  assert(!listedAfterDelete.some((project) => project._id === state.graph.projectId), 'soft-deleted project still appears in normal list');
  await client.mutation(api.projects.restore, { projectId: state.graph.projectId });
  const restored = await client.query(api.projects.get, { projectId: state.graph.projectId });
  assert(!restored.deletedAt && restored._id === state.graph.projectId, 'project restore did not return the project');
  record('soft-delete and restore', { deletedAt: hiddenProject.deletedAt, restored: true });

  const jobId = state.render.job._id;
  // Lease authority is internal/private. Never pass it through a browser API.
  assert(process.env.FINALFRAME_DEV_FIXTURES === 'true' && process.env.FINALFRAME_DEV_FIXTURE_ENV === 'development' && process.env.FINALFRAME_DEV_FIXTURE_KEY, 'Private development fixture flags/key are required.');
  const deploymentName = new URL(onlineConvexUrl).hostname.replace(/\.convex\.cloud$/, '');
  const claimResult = await exec('./node_modules/.bin/convex', ['run', 'renderJobs:claim', JSON.stringify({ fixtureKey: process.env.FINALFRAME_DEV_FIXTURE_KEY, jobId, leaseDurationMs: 10 * 60 * 1000 }), '--deployment', deploymentName, '--codegen', 'disable', '--typecheck', 'disable'], { timeout: 60_000, maxBuffer: 1024 * 1024 });
  const claim = JSON.parse(claimResult.stdout);
  const uploadUrl = await client.mutation(api.assetStorage.generateUploadUrl, { projectId: state.graph.projectId, studioExternalId: state.project.studioExternalId });
  const proxy = await startCallbackProxy(`${siteUrl.replace(/\/$/, '')}/renderer/callback`);
  let status;
  try {
    const response = await fetch(`${rendererUrl.replace(/\/$/, '')}/render`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret }, body: JSON.stringify({ jobId, idempotencyKey: state.render.job.idempotencyKey, manifest: state.assembly.manifest, storageUploadUrl: uploadUrl, callbackUrl: proxy.url, leaseId: claim.leaseId, attempt: 1, mode: 'fixture' }) });
    assert(response.status === 202, `renderer did not accept fixture render: HTTP ${response.status}`);
    record('real renderer submission', await response.json());
    for (let attempt = 0; attempt < 120; attempt += 1) {
      status = await client.query(api.renderJobs.getStatus, { jobId });
      if (status.job.status === 'COMPLETED' || status.job.status === 'FAILED') break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(status?.job.status === 'COMPLETED', `fixture export did not complete: ${status?.job.errorMessage || status?.job.status}`);
    assert(status.export?.downloadUrl, 'completed export did not expose an authorized download URL');
    const outputPath = process.env.FINALFRAME_FIXTURE_OUTPUT || '/tmp/finalframe-fixtures/finalframe-fixture-output.mp4';
    const download = await fetch(status.export.downloadUrl);
    assert(download.ok, `download URL returned HTTP ${download.status}`);
    await writeFile(outputPath, Buffer.from(await download.arrayBuffer()));
    const media = await probeVideo(outputPath);
    assert(media.sizeBytes > 1000, 'downloaded MP4 is unexpectedly empty');
    record('Convex Storage upload and authorized MP4 download', { outputPath, ...media });
    assert(proxy.captured, 'renderer callback proxy did not capture a callback');
    const duplicate = await sendCallback(`${siteUrl.replace(/\/$/, '')}/renderer/callback`, proxy.captured.rawBody, secret, proxy.captured.signature);
    assert(duplicate.status === 200, `duplicate callback was not acknowledged: HTTP ${duplicate.status}`);
    record('duplicate callback ignored idempotently', await duplicate.json());
    const invalid = await sendCallback(`${siteUrl.replace(/\/$/, '')}/renderer/callback`, proxy.captured.rawBody, secret, 'sha256=invalid');
    assert(invalid.status === 401, `invalid signature was not rejected: HTTP ${invalid.status}`);
    record('invalid callback signature rejected', { status: invalid.status });
    const originalEnvelope = JSON.parse(proxy.captured.rawBody);
    for (const [name, edit] of [['wrong project callback rejected', (envelope) => { envelope.projectId = 'wrong-project'; }], ['wrong job callback rejected', (envelope) => { envelope.eventId = randomUUID(); envelope.jobId = 'wrong-job'; envelope.idempotencyKey = `${envelope.idempotencyKey}:wrong-job`; }], ['wrong lease callback rejected', (envelope) => { envelope.eventId = randomUUID(); envelope.payload.leaseId = 'wrong-lease'; envelope.idempotencyKey = `${envelope.idempotencyKey}:wrong-lease`; }]]) {
      const envelope = structuredClone(originalEnvelope);
      edit(envelope);
      const body = JSON.stringify(envelope);
      const rejected = await sendCallback(`${siteUrl.replace(/\/$/, '')}/renderer/callback`, body, secret);
      assert(rejected.status >= 400, `${name} unexpectedly returned HTTP ${rejected.status}`);
      record(name, { status: rejected.status });
    }
    record('asynchronous render/export status', status);
  } finally {
    proxy.server.close();
  }
  record('canonical manifest v4 and timeline contract', { manifestId: state.assembly.manifestId, version: state.assembly.manifest.version, timelineId: state.graph.timelineId, items: state.assembly.manifest.items?.length, projectId: state.assembly.manifest.projectId, productionId: state.assembly.manifest.productionId });
  record('canonical planning path', { createPlan: 'convex/productions.ts', approvePlan: 'convex/productions.ts', planningTsWrites: 0 });
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  await expectFailure('fake providers disabled in production', async () => createFixturePlan(), 'disabled');
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
  return { infrastructureStatus: 'PASS', mp4Rendered: true, renderStatus: status, media: await probeVideo(process.env.FINALFRAME_FIXTURE_OUTPUT || '/tmp/finalframe-fixtures/finalframe-fixture-output.mp4'), ids: { projectId: state.graph.projectId, productionId: state.graph.productionId, draftVersionId: state.graph.draftVersionId, approvedVersionId: state.graph.approvedVersionId, sequenceId: state.graph.sequenceId, sceneId: state.graph.sceneId, shotIds: state.graph.shotIds, takeIds: state.graph.takeIds, regeneratedTakeId: state.regeneration.newTakeId, timelineId: state.graph.timelineId, manifestId: state.assembly.manifestId, renderJobId: state.render.job._id, exportId: state.render.export?._id, storageId: status.export.storageId }, manifest: state.assembly.manifest, timeline: { timelineId: state.graph.timelineId, manifestId: state.assembly.manifestId }, callback: { captured: true, duplicateTested: true, signatureTested: true }, checks, failures, paidProviderCalls: 0, openRouterCalls: 0 };
}

let report;
try { report = await main(); } catch (error) {
  const failure = error instanceof Error ? error.stack || error.message : String(error);
  failures.push(failure);
  report = { infrastructureStatus: 'FAIL', mp4Rendered: false, renderStatus: null, media: null, ids: {}, manifest: null, timeline: null, callback: null, checks, failures, paidProviderCalls: 0, openRouterCalls: 0 };
}
await writeFile(reportPath, markdown(report));
console.log(markdown(report));
if (report.infrastructureStatus !== 'PASS') process.exitCode = 1;
