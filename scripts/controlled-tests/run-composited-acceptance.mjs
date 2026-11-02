/** No-cost launch compositions: exact brand/UI cards and source repurposing. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../dev-fixture/client.mjs';
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
const name = process.argv[2]; assert(['saas-launch-composition', 'source-repurposing'].includes(name));
const root = process.env.FINALFRAME_COMPLETE_TEST_DIR || '/tmp/finalframe-complete-acceptance';
const file = path.join(root, name + '.json');
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { name, paidProviderCalls: 0, assets: {} };
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
const { client } = await createAuthenticatedClient(); const { studio } = await client.query(api.account.current, {});
const saas = name === 'saas-launch-composition';
if (!state.project) { state.project = await client.mutation(api.projects.create, { name: 'Live acceptance · ' + name, projectType: saas ? 'PRODUCT_SAAS_LAUNCH' : 'SOCIAL_CUTDOWN' }); save(); }
async function approve(resourceType, resourceId) {
  const args = { projectId: state.project.projectId, ...(state.plan ? { productionId: state.plan.productionId } : {}), resourceType, resourceId };
  const current = await client.query(api.approvals.get, args);
  if (!current.approved) { await client.mutation(api.approvals.submitForReview, args); await client.mutation(api.approvals.approve, args); }
  if (!current.locked) await client.mutation(api.approvals.lock, args);
}
const sources = saas ? [
  ['logo', path.resolve('public/brand/finalframe-mark.png'), 'image/png', {}],
  ['ui', root + '/finalframe-public-ui.png', 'image/png', {}],
] : [['footage', '/tmp/finalframe-small-video-tests/product-launch.mp4', 'video/mp4', { durationSeconds: 4 }]];
for (const [key, localFile, mimeType, metadata] of sources) {
  if (!state.assets[key]) {
    const url = await client.mutation(api.assetStorage.generateUploadUrl, { projectId: state.project.projectId });
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': mimeType }, body: fs.readFileSync(localFile) }); assert(response.ok);
    const { storageId } = await response.json();
    state.assets[key] = await client.mutation(api.assetStorage.ingestAsset, { studioExternalId: studio.externalId, projectId: state.project.projectId, scope: 'PROJECT', storageId, source: 'UPLOADED', roles: [key === 'logo' ? 'LOGO' : 'REFERENCE'], mimeType, name: 'Explicit project import · ' + key, rights: { status: 'OWNED' }, metadata: { ...metadata, originalTestSource: localFile } }); save();
  }
  await approve('asset', state.assets[key].assetId);
}
const title = saas ? 'FinalFrame · Make ideas move' : 'Short source cutdown'; const durationSeconds = saas ? 10 : 2;
if (!state.plan) {
  const plan = { summary: 'Manually authored launch acceptance, no paid generation.', sequences: [{ title: 'Launch', orderIndex: 0, scenes: [{ title, orderIndex: 0, shots: [{ title, prompt: 'Compose only the explicitly selected owned assets and exact typography.', durationSeconds, orderIndex: 0, requiredAssetIds: Object.values(state.assets).map(asset => asset.assetId) }] }] }] };
  state.plan = await client.mutation(api.productions.createPlan, { studioExternalId: studio.externalId, projectExternalId: state.project.externalId, workflow: saas ? 'BUSINESS_AD' : 'SOCIAL', inputMode: saas ? 'AD_BRIEF' : 'FOOTAGE', durationSeconds, language: 'en', outputPreset: saas ? 'WEBSITE_LANDSCAPE' : 'SOCIAL_VERTICAL', input: { videoType: saas ? 'PRODUCT_SAAS_LAUNCH' : 'SOCIAL_CUTDOWN', source: 'CONTROLLED_COMPOSITION' }, plan, estimate: { credits: 0, providerCalls: 0 }, idempotencyKey: 'composited-plan:' + state.project.projectId }); save();
}
if (!state.approved) { state.approved = await client.mutation(api.productions.approvePlan, { planId: state.plan.planId }); save(); }
if (!state.timeline) {
  const clips = saas ? [
    { kind: 'GRAPHIC', templateId: 'kinetic-title', durationSeconds: 2, props: { title: 'Make ideas move', subtitle: 'FinalFrame', accentColor: '#87a8ff' } },
    { kind: 'GRAPHIC', templateId: 'brand-card', durationSeconds: 2, logoAssetId: state.assets.logo.assetId, props: { title: 'Your production studio', brandName: 'FinalFrame' } },
    { kind: 'ASSET', assetId: state.assets.ui.assetId, durationSeconds: 2 },
    { kind: 'GRAPHIC', templateId: 'feature-callout', durationSeconds: 2, logoAssetId: state.assets.logo.assetId, props: { title: 'Scene by scene', feature: 'Keep every take', detail: 'Plan. Generate. Review.', brandName: 'FinalFrame', index: '01' } },
    { kind: 'GRAPHIC', templateId: 'end-card', durationSeconds: 2, logoAssetId: state.assets.logo.assetId, props: { title: 'Create your next video', callToAction: 'Start a project', url: 'usefinalframe.xyz', brandName: 'FinalFrame' } },
  ] : [{ kind: 'ASSET', assetId: state.assets.footage.assetId, durationSeconds: 2 }];
  state.timeline = await client.mutation(api.timeline.createDraft, { productionId: state.plan.productionId, productionVersionId: state.approved.versionId, clips, idempotencyKey: 'composited-timeline:' + state.project.projectId }); save();
}
if (!saas && !state.trimmed) {
  const draft = await client.query(api.timelineEditor.getDraft, { productionId: state.plan.productionId, timelineId: state.timeline.timelineId });
  const clip = draft.tracks.find(track => track.kind === 'VIDEO').clips[0];
  state.trimmed = await client.mutation(api.timelineEditor.apply, { timelineId: state.timeline.timelineId, kind: 'trim', input: { clipId: clip.id, trimStartSeconds: 1, trimEndSeconds: 3 }, idempotencyKey: 'composited-trim:' + state.project.projectId });
  state.timeline = { ...state.timeline, timelineId: state.trimmed.timelineId }; save();
}
await approve('timeline', state.timeline.timelineId);
if (!state.assembly) { state.assembly = await client.mutation(api.assembly.createJob, { productionId: state.plan.productionId, timelineId: state.timeline.timelineId, selectionScope: 'FULL_PROJECT', idempotencyKey: 'composited-manifest:' + state.project.projectId }); save(); }
assert.equal(state.assembly.manifest.output.durationInFrames, durationSeconds * state.assembly.manifest.output.fps);
if (saas) assert.equal(state.assembly.manifest.items.filter(item => item.kind === 'motion-graphics').length, 4);
else { assert(state.assembly.manifest.output.height > state.assembly.manifest.output.width); assert.equal(state.assembly.manifest.items[0].trimStartInFrames, state.assembly.manifest.output.fps); }
console.log(JSON.stringify({ name, projectId: state.project.projectId, manifestId: state.assembly.manifestId, output: state.assembly.manifest.output, paidCalls: 0 }));
