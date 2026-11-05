/** Explicit isolated online Convex integration only; never buys media or renders.
 * Run after coordinator deploys checkpoint34 and enables this guard. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { makeFunctionReference } from 'convex/server';
assert.equal(process.env.FINALFRAME_RUN_GUIDED_CHARACTER_ONLINE, 'true', 'Run only after the coordinator deploys checkpoint34.');
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
const root = process.cwd(), { api } = await import(pathToFileURL(root + '/convex/_generated/api.js'));
const { createAuthenticatedClient } = await import(pathToFileURL(root + '/scripts/dev-fixture/client.mjs'));
const { client } = await createAuthenticatedClient(), projects = [], checks = [], marker = 'guided-character-' + randomUUID();
const ref = name => makeFunctionReference(name), pass = name => { checks.push(name); console.log('PASS ' + name); };
async function approve(projectId, resourceType, resourceId) { for (const method of ['submitForReview', 'approve', 'lock']) await client.mutation(api.approvals[method], { projectId, resourceType, resourceId }); }
async function upload(project, bytes, mimeType, roles) {
  const url = await client.mutation(api.assetStorage.generateUploadUrl, { projectId: project.projectId });
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': mimeType }, body: bytes }); assert(response.ok);
  const { storageId } = await response.json();
  return client.mutation(api.assetStorage.ingestAsset, { projectId: project.projectId, studioExternalId: project.studioExternalId, storageId, source: 'UPLOADED', roles, name: marker + '-fixture', mimeType, checksum: createHash('sha256').update(bytes).digest('hex'), rights: { status: 'OWNED', consent: true }, metadata: { fixture: true, syntheticArchitectureFixture: true } });
}
try {
  for (const suffix of ['main', 'foreign']) projects.push(await client.mutation(api.projects.create, { name: marker + '-' + suffix, projectType: 'ANIMATED_COMEDY_2D' }));
  const [project, foreign] = projects, projectId = project.projectId;
  const episode = await client.mutation(api.episodes.create, { projectId, episodeNumber: 1, title: 'No-cost guided fixture', durationSeconds: 4, workflow: 'COMEDY', inputMode: 'SCRIPT', language: 'en', outputPreset: 'SQUARE' });
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=', 'base64');
  const image = await upload(project, pixel, 'image/png', ['IMAGE']), otherImage = await upload(foreign, pixel, 'image/png', ['IMAGE']);
  const request = { projectId, productionId: episode.productionId, name: 'Original synthetic fixture character', description: 'One fixture image for architecture acceptance only; no creative or identity proof.', imageAssetId: image.assetId, idempotencyKey: marker + ':character' };
  await assert.rejects(client.mutation(ref('characterSetup:create'), request));
  pass('unapproved image cannot create a guided character');
  await approve(projectId, 'asset', image.assetId);
  await assert.rejects(client.mutation(ref('characterSetup:create'), { ...request, imageAssetId: otherImage.assetId }));
  pass('foreign project reference is rejected before new resource writes');
  const wav = Buffer.alloc(16044); wav.write('RIFF'); wav.writeUInt32LE(16036, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  const sound = await upload(project, wav, 'audio/wav', ['VOICE_REFERENCE']); await approve(projectId, 'asset', sound.assetId);
  const voice = await client.mutation(api.voices.create, { projectId, kind: 'RECORDED', name: 'Synthetic silence; not a personal voice', idempotencyKey: marker + ':voice' });
  await client.mutation(api.voices.attachSample, { projectId, voiceId: voice.voiceId, assetId: sound.assetId }); await approve(projectId, 'voice', voice.voiceId);
  const create = { ...request, voiceId: voice.voiceId }, made = await client.mutation(ref('characterSetup:create'), create), replay = await client.mutation(ref('characterSetup:create'), create);
  assert.equal(made.resourceId, replay.resourceId); assert.equal(replay.replayed, true); assert(made.voiceVersionId);
  const state = await client.query(api.resourceStates.get, { projectId, resourceType: 'projectResourceVersion', resourceId: made.resourceVersionId }); assert.equal(state.state, 'DRAFT');
  pass('online duplicate click returns one stable draft and exact frozen voice version without approval');
  await assert.rejects(client.mutation(ref('characterSetup:create'), { ...create, description: 'Different request under same key.' }));
  const bibleInput = { projectId, productionId: episode.productionId, characterVersionId: made.resourceVersionId, rules: ['Keep this exact project character.'], story: 'Synthetic fixture only.', visualStyle: 'Original 2D', idempotencyKey: marker + ':bible' };
  await assert.rejects(client.mutation(ref('characterSetup:createBible'), bibleInput));
  await approve(projectId, 'projectResourceVersion', made.resourceVersionId);
  const bible = await client.mutation(ref('characterSetup:createBible'), bibleInput); assert.equal((await client.mutation(ref('characterSetup:createBible'), bibleInput)).bibleId, bible.bibleId);
  const bibles = await client.query(api.continuity.listBibles, { projectId }); assert.equal(bibles.find(row => row.bibleId === bible.bibleId).state, 'DRAFT');
  await approve(projectId, 'continuityBible', bible.bibleId);
  const before = (await client.query(api.continuity.listBibles, { projectId })).find(row => row.bibleId === bible.bibleId);
  const next = await client.mutation(ref('characterSetup:createBible'), { ...bibleInput, sourceBibleId: bible.bibleId, rules: ['Keep approved earlier episodes unchanged.'], idempotencyKey: marker + ':next-bible' });
  assert.notEqual(next.bibleId, bible.bibleId); assert.deepEqual((await client.query(api.continuity.listBibles, { projectId })).find(row => row.bibleId === bible.bibleId), before);
  assert.equal((await client.query(api.generationJobs.list, { productionId: episode.productionId })).length, 0);
  pass('new bible draft requires approved resource, preserves approved source and creates no provider jobs');
  console.log(JSON.stringify({ ok: true, marker, checks, providerPurchases: 0, rendererCalls: 0 }));
} finally {
  for (const project of projects) await client.mutation(api.projects.softDelete, { projectId: project.projectId });
  await writeFile('/tmp/ff-guided-character-online-result.json', JSON.stringify({ marker, checks, projectIds: projects.map(p => p.projectId), providerPurchases: 0, rendererCalls: 0, complete: checks.length === 4 }, null, 2), { mode: 0o600 });
}
