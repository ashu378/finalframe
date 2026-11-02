import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../../scripts/dev-fixture/client.mjs';
import { ensureFixtureMedia } from '../../scripts/dev-fixture/fixture-media.mjs';

const target = process.env.FINALFRAME_PROBE_TEST_URL;
const secret = process.env.RENDER_WORKER_SHARED_SECRET;
const fixtureKey = process.env.FINALFRAME_DEV_FIXTURE_KEY;
if (!target || !secret || !fixtureKey) throw new Error('Configure the authenticated test renderer and online development fixture environment.');
async function measuredProbe(payload, headers) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${target}/media/probe`, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(60_000) });
    if (attempt >= 2 || ![429, 502, 503, 504].includes(response.status)) return response;
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
const { client } = await createAuthenticatedClient();
const project = await client.mutation(api.devFixtures.ensureProject, { fixtureKey, externalId: `finalframe-probe-${randomUUID()}`, name: 'FinalFrame online probe verification' });
try {
  const media = await ensureFixtureMedia();
  const fixture = media.files.find((file) => file.role === 'VIDEO');
  assert(fixture);
  const uploadUrl = await client.mutation(api.assetStorage.generateUploadUrl, { studioExternalId: project.studioExternalId, projectId: project.projectId });
  const upload = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': fixture.mimeType }, body: await readFile(fixture.path) });
  assert(upload.ok);
  const { storageId } = await upload.json();
  const stored = await client.mutation(api.assetStorage.ingestAsset, { studioExternalId: project.studioExternalId, projectId: project.projectId, scope: 'PROJECT', storageId, source: 'fixture', roles: ['VIDEO'], mimeType: fixture.mimeType, metadata: { fixtureMarker: 'online-media-probe' } });
  assert(stored.assetId);
  // Resolve a fresh canonical URL through the existing authorized asset API.
  const resolved = await client.query(api.assetStorage.resolveAuthorizedMedia, { assetId: stored.assetId });
  const url = resolved.url;
  const unauthenticated = await fetch(`${target}/media/probe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
  assert.equal(unauthenticated.status, 401);
  const headers = { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret };
  const forbidden = await fetch(`${target}/media/probe`, { method: 'POST', headers, body: JSON.stringify({ url: 'http://127.0.0.1/private' }) });
  assert.equal(forbidden.status, 400);
  const response = await measuredProbe({ url }, headers);
  assert.equal(response.status, 200);
  const probe = await response.json();
  assert(Math.abs(probe.durationSeconds - fixture.durationSeconds) < 0.3);
  assert.equal(probe.width, fixture.width);
  assert.equal(probe.height, fixture.height);
  assert.equal(probe.videoCodec, 'h264');
  const audio = media.files.find((file) => file.role === 'AUDIO');
  assert(audio);
  const audioUploadUrl = await client.mutation(api.assetStorage.generateUploadUrl, { studioExternalId: project.studioExternalId, projectId: project.projectId });
  const audioUpload = await fetch(audioUploadUrl, { method: 'POST', headers: { 'content-type': audio.mimeType }, body: await readFile(audio.path) });
  assert(audioUpload.ok);
  const audioStorage = await audioUpload.json();
  const audioAsset = await client.mutation(api.assetStorage.ingestAsset, { studioExternalId: project.studioExternalId, projectId: project.projectId, scope: 'PROJECT', storageId: audioStorage.storageId, source: 'fixture', roles: ['AUDIO'], mimeType: audio.mimeType, metadata: { fixtureMarker: 'online-audio-probe' } });
  const audioUrl = (await client.query(api.assetStorage.resolveAuthorizedMedia, { assetId: audioAsset.assetId })).url;
  const audioResponse = await measuredProbe({ url: audioUrl, kind: 'audio' }, headers);
  assert.equal(audioResponse.status, 200);
  const audioProbe = await audioResponse.json();
  assert.equal(audioProbe.hasAudio, true);
  assert.equal(audioProbe.hasVideo, false);
  assert.equal(audioProbe.sampleRate, 48000);
  assert.equal(audioProbe.channels, 1);
  assert(Math.abs(audioProbe.durationSeconds - 2) < 0.05);
  const audioAsVideo = await fetch(`${target}/media/probe`, { method: 'POST', headers, body: JSON.stringify({ url: audioUrl }) });
  assert.equal(audioAsVideo.status, 400);
  console.log(JSON.stringify({ onlineConvex: true, checks: ['missing worker authentication denied', 'noncanonical/private source denied', 'actual FFprobe of uploaded online video fixture passed', 'measured online audio duration and stream properties', 'audio cannot masquerade as video'], probe, audioProbe, paidProviderCalls: 0, renderSubmissions: 0 }, null, 2));
} finally {
  await client.mutation(api.projects.softDelete, { projectId: project.projectId });
}
