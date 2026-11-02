/** Real manually authored graphics pipeline; no paid AI and no render submission. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../dev-fixture/client.mjs';
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
const dir = process.env.FINALFRAME_LIVE_TEST_DIR || '/tmp/finalframe-small-video-tests';
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'motion-graphics.json');
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { caseName: 'motion-graphics', videoType: 'MOTION_GRAPHICS', source: 'MANUALLY_AUTHORED_TEMPLATE', providerCalls: 0 };
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
const { client } = await createAuthenticatedClient();
const { studio } = await client.query(api.account.current, {});
assert(studio);
if (!state.project) {
  const name = 'Live acceptance · motion-graphics';
  const existing = (await client.query(api.projects.list, { studioExternalId: studio.externalId })).filter(p => p.name === name);
  assert(existing.length <= 1);
  state.project = existing.length ? { projectId: existing[0]._id, externalId: existing[0].externalId } : await client.mutation(api.projects.create, { name, projectType: 'MOTION_GRAPHICS', description: 'Manually authored exact-text template test. No paid footage generation.' }); save();
}
const plan = { summary: 'Exact text and brand-name typography rendered by a deterministic template.', workflow: 'BUSINESS_AD', assumptions: [], questions: [], operations: [], bible: { projectContext: { title: 'Make ideas move', duration: 4, language: 'en' }, characters: [], locations: [], products: [], style: { visualStyle: 'Cobalt studio title card' }, story: { logline: 'FinalFrame introduction' } }, sequences: [{ title: 'Title', description: 'One designed card', orderIndex: 0, scenes: [{ title: 'Make ideas move', purpose: 'Readable exact type', visualDirection: 'Use the deterministic brand-card template.', orderIndex: 0, shots: [{ title: 'Title card', prompt: 'Manually authored exact text title card; no generated footage.', durationSeconds: 4, orderIndex: 0, camera: { angle: 'front', movement: 'none', lens: 'orthographic' }, requiredAssetIds: [] }] }] }] };
if (!state.canonicalPlan) { state.canonicalPlan = await client.mutation(api.productions.createPlan, { studioExternalId: studio.externalId, projectExternalId: state.project.externalId, workflow: 'BUSINESS_AD', inputMode: 'SCRIPT', durationSeconds: 4, language: 'en', outputPreset: 'WEBSITE_LANDSCAPE', input: { videoType: 'MOTION_GRAPHICS', source: state.source }, plan, estimate: { credits: 0, estimatedProviderCostUsd: 0 }, idempotencyKey: 'graphics-plan:' + state.project.projectId }); save(); }
if (!state.approved) { state.approved = await client.mutation(api.productions.approvePlan, { planId: state.canonicalPlan.planId }); save(); }
const composeArgs = { productionId: state.canonicalPlan.productionId, productionVersionId: state.approved.versionId, idempotencyKey: 'graphics-compose:' + state.project.projectId, clips: [{ kind: 'GRAPHIC', templateId: 'brand-card', durationSeconds: 4, props: { title: 'Make ideas move', brandName: 'FinalFrame', accentColor: '#2b5cff' } }] };
if (!state.timeline) {
  state.timeline = await client.mutation(api.timeline.createDraft, composeArgs); save();
  const replay = await client.mutation(api.timeline.createDraft, composeArgs);
  assert.equal(replay.timelineId, state.timeline.timelineId);
}
if (!state.timelineApproved) {
  const args = { projectId: state.project.projectId, productionId: state.canonicalPlan.productionId, resourceType: 'timeline', resourceId: state.timeline.timelineId };
  const status = await client.query(api.approvals.get, args);
  if (!status.approved) {
    await client.mutation(api.approvals.submitForReview, args);
    await client.mutation(api.approvals.approve, args);
  }
  if (!status.locked) await client.mutation(api.approvals.lock, args);
  state.timelineApproved = true; save();
}
if (!state.assembly) { state.assembly = await client.mutation(api.assembly.createJob, { productionId: state.canonicalPlan.productionId, timelineId: state.timeline.timelineId, selectionScope: 'FULL_PROJECT', idempotencyKey: 'graphics-manifest:' + state.project.projectId }); save(); }
assert.equal(state.assembly.manifest.version, 4);
const graphic = state.assembly.manifest.items.find(item => item.kind === 'motion-graphics');
assert(graphic); assert.equal(graphic.props.title, 'Make ideas move'); assert.equal(graphic.props.brandName, 'FinalFrame');
state.manifestReady = true; state.renderSubmissions = 0; save();
console.log(JSON.stringify({ projectId: state.project.projectId, timelineId: state.timeline.timelineId, manifestVersion: 4, exactText: graphic.props.title, providerCalls: 0, renderSubmissions: 0 }));
