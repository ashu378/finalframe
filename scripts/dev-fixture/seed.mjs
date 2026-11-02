import { readFile, writeFile } from 'node:fs/promises';
import { api } from '../../convex/_generated/api.js';
import { ensureFixtureMedia } from './fixture-media.mjs';
import { createFixturePlan, assertFixtureMode } from './fake-providers.mjs';
import { createAuthenticatedClient, requireOnlineConvexUrl } from './client.mjs';

const convexUrl = requireOnlineConvexUrl();
const projectExternalId = process.env.FINALFRAME_FIXTURE_PROJECT_EXTERNAL_ID || 'finalframe_dev_fixture_v1';
const stateFile = process.env.FINALFRAME_FIXTURE_STATE_FILE || '/tmp/finalframe-fixture-run.json';

assertFixtureMode();

async function upload(client, file, projectId, studioExternalId, scope, externalId) {
  const existingAssets = scope === 'PROJECT'
    ? await client.query(api.assetStorage.listProjectAssets, { projectId })
    : await client.query(api.assetStorage.listGlobalAssets, {});
  const existing = existingAssets.find((asset) => asset.externalId === externalId);
  if (existing?.storageId) return { ...file, assetId: existing._id, storageId: existing.storageId };
  const uploadUrl = await client.mutation(api.assetStorage.generateUploadUrl, scope === 'PROJECT' ? { projectId, studioExternalId } : { studioExternalId });
  const bytes = await readFile(file.path);
  const response = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': file.mimeType }, body: bytes });
  if (!response.ok) throw new Error(`Fixture upload failed for ${file.name}: HTTP ${response.status}`);
  const uploaded = await response.json();
  const result = await client.mutation(api.assetStorage.ingestAsset, {
    studioExternalId,
    scope,
    projectId: scope === 'PROJECT' ? projectId : undefined,
    storageId: uploaded.storageId,
    externalId,
    source: 'fixture',
    roles: [file.role],
    name: file.name,
    mimeType: file.mimeType,
    checksum: file.checksum,
    metadata: { fixtureMarker: 'finalframe-dev-fixture-v1', fixtureProjectExternalId: process.env.FINALFRAME_FIXTURE_PROJECT_EXTERNAL_ID || 'finalframe_dev_fixture_v1', deterministic: true, sourcePath: file.path },
    provenance: { source: 'local-ffmpeg-fixture', fixtureMarker: 'finalframe-dev-fixture-v1' },
    rights: { status: 'APPROVED', consent: true },
    consent: { status: 'APPROVED' },
  });
  return { ...file, assetId: result.assetId, storageId: result.storageId };
}

async function main() {
  const fixtureKey = process.env.FINALFRAME_DEV_FIXTURE_KEY;
  if (!fixtureKey) throw new Error('FINALFRAME_DEV_FIXTURE_KEY is required.');
  const { client, token, auth } = await createAuthenticatedClient();
  const media = await ensureFixtureMedia();
  const project = await client.mutation(api.devFixtures.ensureProject, { fixtureKey, externalId: projectExternalId });
  const byRole = Object.fromEntries(media.files.map((file) => [file.role, file]));
  const assetExternalPrefix = `finalframe-dev-fixture:${projectExternalId}`;
  const projectAssets = [];
  for (const role of ['IMAGE', 'VIDEO']) {
    projectAssets.push(await upload(client, byRole[role], project.projectId, project.studioExternalId, 'PROJECT', `${assetExternalPrefix}:${role.toLowerCase()}`));
  }
  const globalAsset = await upload(client, byRole.IMAGE, undefined, project.studioExternalId, 'GLOBAL', `${assetExternalPrefix}:global-probe`);

  const plan = createFixturePlan();
  const planResult = await client.mutation(api.productions.createPlan, {
    studioExternalId: project.studioExternalId,
    projectExternalId: project.externalId,
    workflow: 'FIXTURE',
    inputMode: 'IDEA',
    durationSeconds: 4,
    language: 'en',
    outputPreset: 'SOCIAL_VERTICAL',
    input: { idea: 'FinalFrame deterministic fixture', fixtureMarker: 'finalframe-dev-fixture-v1' },
    plan,
    estimate: { credits: 0, providerCalls: 0, fixture: true },
    idempotencyKey: 'finalframe-dev-fixture:canonical-plan',
  });
  const approval = await client.mutation(api.productions.approvePlan, { planId: planResult.planId, idempotencyKey: 'finalframe-dev-fixture:canonical-approval' });
  const renderAssets = [projectAssets[1], projectAssets[1]];
  const graph = await client.mutation(api.devFixtures.seedGraph, {
    fixtureKey,
    projectExternalId: project.externalId,
    planId: planResult.planId,
    approvedVersionId: approval.versionId,
    // Keep the still image upload in the project library for the upload and
    // isolation checks, but use two valid video sources in the render timeline.
    // The fixture timeline uses one VIDEO track, so a PNG cannot be assigned
    // to its first clip without making Remotion wait forever for video
    // metadata.
    assets: renderAssets.map((asset) => ({ assetId: asset.assetId, url: '', checksum: asset.checksum, mimeType: asset.mimeType, name: asset.name, role: asset.role, durationSeconds: asset.durationSeconds, width: asset.width, height: asset.height })),
    globalAsset: { assetId: globalAsset.assetId, url: '', checksum: globalAsset.checksum, mimeType: globalAsset.mimeType, name: globalAsset.name, role: globalAsset.role },
  });

  const renderAssetResources = [...new Map(renderAssets.map((asset) => [asset.assetId, asset])).values()]
    .map((asset) => ({ resourceType: 'asset', resourceId: asset.assetId, productionId: graph.productionId }));
  const resources = [
    ...renderAssetResources,
    ...graph.takeIds.map((id) => ({ resourceType: 'shotVersion', resourceId: id, productionId: graph.productionId })),
    { resourceType: 'timeline', resourceId: graph.timelineId, productionId: graph.productionId },
  ];
  async function approveAndLock(resource) {
    const base = { projectId: graph.projectId, productionId: resource.productionId, resourceType: resource.resourceType, resourceId: String(resource.resourceId) };
    const current = await client.query(api.approvals.get, base);
    if (current.currentState === 'LOCKED') return;
    if (current.currentState === 'DRAFT' || current.currentState === 'REVISION_REQUESTED') {
      await client.mutation(api.approvals.submitForReview, { ...base, note: 'Deterministic fixture review.' });
    }
    const reviewed = await client.query(api.approvals.get, base);
    if (reviewed.currentState !== 'APPROVED') await client.mutation(api.approvals.approve, { ...base, note: 'Deterministic fixture approval.' });
    await client.mutation(api.approvals.lock, { ...base, note: 'Deterministic fixture lock.' });
  }
  for (const resource of resources) {
    await approveAndLock(resource);
  }
  const regeneration = await client.mutation(api.devFixtures.regenerateTake, { fixtureKey, shotVersionId: graph.takeIds[0], timelineId: graph.timelineId });
  await approveAndLock({ productionId: graph.productionId, resourceType: 'shotVersion', resourceId: regeneration.newTakeId });
  const assembly = await client.mutation(api.assembly.createJob, { productionId: graph.productionId, timelineId: graph.timelineId, selectionScope: 'FULL_PROJECT', idempotencyKey: 'finalframe-dev-fixture:manifest-v4' });
  const render = await client.mutation(api.devFixtures.queueRender, { fixtureKey, manifestId: assembly.manifestId, timelineId: graph.timelineId, idempotencyKey: `finalframe-dev-fixture:${project.externalId}:render-export` });
  const state = { fixtureMarker: 'finalframe-dev-fixture-v1', convexUrl, auth, authToken: token, project, globalAsset, plan: planResult, approval, graph, regeneration, assembly: { jobId: assembly.jobId, manifestId: assembly.manifestId, manifest: assembly.manifest }, render, media: media.files.map(({ path, probe, ...file }) => ({ path, probe, ...file })), paidProviderCalls: 0, openRouterCalls: 0, createdAt: new Date().toISOString() };
  await writeFile(stateFile, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ ...state, auth: { mode: auth.mode, email: auth.email } }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack || error.message : error); process.exitCode = 1; });
