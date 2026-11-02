import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../../scripts/dev-fixture/client.mjs';
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
const { client } = await createAuthenticatedClient();
const project = await client.mutation(api.projects.create, { name: 'First continuity plan regression · ' + randomUUID(), projectType: 'ANIMATED_COMEDY_2D' });
try {
  const bible = await client.mutation(api.continuity.createBible, { projectId: project.projectId, snapshot: { resourceBindings: [], rules: ['Keep this project separate.'], story: 'A tiny comedy.', visualStyle: '2D' } });
  const resource = { projectId: project.projectId, resourceType: 'continuityBible', resourceId: bible.bibleId };
  await client.mutation(api.approvals.submitForReview, resource); await client.mutation(api.approvals.approve, resource); await client.mutation(api.approvals.lock, resource);
  const context = await client.query(api.continuity.productionPlanningContext, { projectId: project.projectId, continuityBibleId: bible.bibleId });
  assert.equal(context.productionId, null);
  const plan = { summary: 'Fixture script, no AI request.', sequences: [{ title: 'One', orderIndex: 0, scenes: [{ title: 'One', orderIndex: 0, shots: [{ title: 'One', prompt: 'A blue ball bounces.', durationSeconds: 4, orderIndex: 0, requiredAssetIds: [] }] }] }] };
  const args = { studioExternalId: project.studioExternalId, projectExternalId: project.externalId, workflow: 'SHORT_FILM', inputMode: 'SCRIPT', durationSeconds: 4, language: 'en', outputPreset: 'WEBSITE_LANDSCAPE', input: { continuityBibleId: bible.bibleId, continuityContext: context }, plan, estimate: { providerCalls: 0 }, idempotencyKey: 'first-context:' + project.projectId };
  const created = await client.mutation(api.productions.createPlan, args);
  const replay = await client.mutation(api.productions.createPlan, args); assert.equal(replay.planId, created.planId);
  const workspace = await client.query(api.productions.getWorkspace, { productionId: created.productionId });
  assert.equal(workspace.version.planningContextSnapshot.productionId, created.productionId);
  assert.equal(workspace.version.planningContextSnapshot.projectId, project.projectId);
  for (const [field, value] of [['projectId', 'wrong-project'], ['productionId', 'wrong-production']]) {
    await assert.rejects(client.mutation(api.productions.createPlan, { ...args, input: { ...args.input, continuityContext: { ...context, [field]: value } } }), /Continuity changed/);
  }
  await assert.rejects(client.mutation(api.productions.createPlan, { ...args, input: { ...args.input, continuityContext: { ...context, bible: { ...context.bible, visualStyle: 'Forged style' } } } }), /Continuity changed/);
  await assert.rejects(client.mutation(api.productions.createPlan, { ...args, productionId: created.productionId }), /Continuity changed/);
  console.log(JSON.stringify({ passed: 7, checks: ['first project bible before production', 'idempotent first-plan replay', 'canonical production ID saved', 'foreign project context denied', 'foreign production context denied', 'changed bible denied', 'explicit production requires exact ID'], providerCalls: 0 }));
} finally {
  await client.mutation(api.projects.softDelete, { projectId: project.projectId });
}
