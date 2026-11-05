const assert = require('node:assert/strict');
const { load, fixture } = require('../recipes/backend-fixture.cjs');
const { resolvePlanningContinuity } = load('convex/continuityPlanning.ts');
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
function setup() {
  const ctx = fixture();
  Object.assign(ctx.rows.get('project'), { externalId: 'project-external', projectType: 'CINEMATIC_FILM' });
  ctx.put('continuityBibles', { _id: 'bible', projectId: 'project', versionNumber: 1, state: 'APPROVED', snapshot: { resourceBindings: [], rules: ['Only this project.'], story: 'Original world', visualStyle: 'Original' } });
  ctx.put('resourceStates', { _id: 'bible-state', projectId: 'project', resourceType: 'continuityBible', resourceId: 'bible', state: 'APPROVED' });
  const create = (number, continuityMode) => ctx.call('episodes', 'create', { projectId: 'project', episodeNumber: number, title: 'Episode ' + number, durationSeconds: 8, workflow: 'COMEDY', inputMode: 'IDEA', language: 'pcm', outputPreset: 'LANDSCAPE', ...(continuityMode ? { continuityMode } : {}) });
  return { ctx, create };
}
(async () => {
  await check('legacy story default remains gated while explicit independent posts keep identity without predecessor links', async () => {
    const { ctx, create } = setup(), first = await create(1), story = await create(2), post = await create(3, 'PROJECT_IDENTITY');
    assert.equal(ctx.rows.get(story.episodeId).continuityStatus, 'STALE');
    assert.equal(ctx.rows.get(story.episodeId).predecessorEpisodeId, first.episodeId);
    const saved = ctx.rows.get(post.episodeId);
    assert.equal(saved.continuityMode, 'PROJECT_IDENTITY'); assert.equal(saved.continuityStatus, 'CURRENT');
    assert.equal(saved.predecessorEpisodeId, undefined); assert.equal(saved.inputStoryStateId, undefined);
    const context = await resolvePlanningContinuity(ctx, 'project', post.productionId, 'bible');
    assert.equal(context.continuityMode, 'PROJECT_IDENTITY'); assert.equal(context.continuityBibleId, 'bible');
    assert.equal(context.acceptedPredecessorStory, null); assert.equal(context.inputStoryStateId, null); assert.equal(context.approvedEpisodeMemory.projectId, 'project');
    await assert.rejects(resolvePlanningContinuity(ctx, 'project', story.productionId, 'bible'), /Refresh and review/);
    await assert.rejects(resolvePlanningContinuity(ctx, 'project', post.productionId), /approved project continuity bible/);
  });
  await check('relationship is part of creation idempotency and never relaxes ordinal, length or role authorization', async () => {
    const { ctx, create } = setup(); await create(1); const post = await create(2, 'PROJECT_IDENTITY');
    assert.equal((await create(2, 'PROJECT_IDENTITY')).episodeId, post.episodeId);
    await assert.rejects(create(2), /already used/); await assert.rejects(create(4, 'PROJECT_IDENTITY'), /preceding episode/);
    await assert.rejects(create(501, 'PROJECT_IDENTITY'), /between 1 and 500/);
    ctx.role = 'VIEWER'; await assert.rejects(create(3, 'PROJECT_IDENTITY'), /access denied/);
  });
  await check('independent posts retain older approved project memory with exact version provenance, never another project', async () => {
    const { ctx, create } = setup(), first = await create(1); await create(2); const post = await create(3, 'PROJECT_IDENTITY');
    ctx.rows.get(first.episodeId).acceptedStoryStateId = 'accepted-first';
    ctx.rows.get(first.productionId).currentVersionId = 'first-version';
    ctx.put('productionVersions', { _id: 'first-version', productionId: first.productionId, status: 'APPROVED' });
    ctx.put('timelines', { _id: 'first-timeline', productionId: first.productionId, projectId: 'project' });
    ctx.put('episodeStoryStates', { _id: 'accepted-first', projectId: 'project', episodeId: first.episodeId, productionVersionId: 'first-version', timelineId: 'first-timeline', snapshot: { summary: 'Our presenter works at the original bakery.', facts: ['The approved product is the green cup.'], unresolvedThreads: [], characterStates: [], cliffhanger: '', nextEpisodePayoff: '' }, createdAt: 1 });
    for (const [type, id] of [['episodeStoryState', 'accepted-first'], ['timeline', 'first-timeline']]) ctx.put('resourceStates', { _id: 'accepted-' + type, projectId: 'project', resourceType: type, resourceId: id, state: 'LOCKED' });
    await load('convex/projectMemory.ts').materializeAcceptedMemory(ctx, 'project', 'accepted-first');
    ctx.put('projectMemoryFacts', { _id: 'foreign-fact', projectId: 'foreign-project', text: 'Private other project.', episodeNumber: 1, storyStateId: 'foreign-state', ordinal: 0 });
    const context = await resolvePlanningContinuity(ctx, 'project', post.productionId, 'bible');
    assert.equal(context.acceptedPredecessorStory, null); assert(context.approvedEpisodeMemory.facts.length > 0);
    assert(context.approvedEpisodeMemory.facts.every(fact => fact.storyStateId === 'accepted-first' && fact.productionVersionId === 'first-version' && fact.timelineId === 'first-timeline'));
    assert(!JSON.stringify(context).includes('Private other project'));
  });
  await check('existing unplanned stale episode can explicitly choose identity mode and later choose story gates again', async () => {
    const { ctx, create } = setup(); const first = await create(1), second = await create(2);
    const initial = structuredClone(ctx.rows.get(second.episodeId));
    const changed = await ctx.call('episodes', 'changeContinuityMode', { projectId: 'project', episodeId: second.episodeId, continuityMode: 'PROJECT_IDENTITY', expectedUpdatedAt: initial.updatedAt });
    assert.equal(changed.requiresNewPlan, true); assert.equal(ctx.rows.get(second.episodeId).continuityStatus, 'CURRENT');
    assert.equal(ctx.rows.get(second.episodeId).predecessorEpisodeId, undefined); assert.equal(ctx.rows.get(second.episodeId).inputStoryStateId, undefined);
    assert.equal(ctx.count('audit'), 1); assert.equal(ctx.count('directorPlans'), 0); assert.equal(ctx.count('generationJobs'), 0);
    const latest = structuredClone(ctx.rows.get(second.episodeId)); assert(latest.updatedAt > initial.updatedAt);
    await assert.rejects(ctx.call('episodes', 'changeContinuityMode', { projectId: 'project', episodeId: second.episodeId, continuityMode: 'STORY_CONTINUATION', expectedUpdatedAt: initial.updatedAt }), /episode changed/);
    await ctx.call('episodes', 'changeContinuityMode', { projectId: 'project', episodeId: second.episodeId, continuityMode: 'STORY_CONTINUATION', expectedUpdatedAt: latest.updatedAt });
    assert.equal(ctx.rows.get(second.episodeId).predecessorEpisodeId, first.episodeId); assert.equal(ctx.rows.get(second.episodeId).continuityStatus, 'STALE');
  });
  await check('draft context is superseded and pointers cleared, then only a fresh canonical plan can approve', async () => {
    const { ctx, create } = setup(); await create(1); const second = await create(2), production = ctx.rows.get(second.productionId);
    Object.assign(production, { currentPlanId: 'old-plan', currentVersionId: 'old-draft' });
    ctx.put('directorPlans', { _id: 'old-plan', productionId: production._id, status: 'READY', input: { continuityContext: { acceptedPredecessorStory: 'old' } }, plan: { preserved: true } });
    ctx.put('productionVersions', { _id: 'old-draft', productionId: production._id, sourcePlanId: 'old-plan', status: 'DRAFT', versionNumber: 1, snapshot: { preserved: true } });
    const prior = structuredClone(ctx.rows.get('old-draft').snapshot);
    await ctx.call('episodes', 'changeContinuityMode', { projectId: 'project', episodeId: second.episodeId, continuityMode: 'PROJECT_IDENTITY', expectedUpdatedAt: ctx.rows.get(second.episodeId).updatedAt });
    assert.equal(ctx.rows.get('old-plan').status, 'SUPERSEDED'); assert.equal(ctx.rows.get('old-draft').status, 'SUPERSEDED'); assert.deepEqual(ctx.rows.get('old-draft').snapshot, prior);
    assert.equal(production.currentPlanId, undefined); assert.equal(production.currentVersionId, undefined);
    const workspace = await ctx.call('productions', 'getWorkspace', { productionId: production._id }); assert.equal(workspace.plan, null); assert.equal(workspace.version, null);
    const graph = await ctx.call('productionGraph', 'getByProject', { projectExternalId: 'project-external', productionId: production._id }); assert.equal(graph.summary.hasPlan, false); assert.equal(graph.summary.hasVersion, false);
    await assert.rejects(ctx.call('productions', 'approvePlan', { planId: 'old-plan' }), /superseded/);
    const made = await ctx.call('productions', 'createPlan', { productionId: production._id, studioExternalId: 'studio', projectExternalId: 'project-external', workflow: 'COMEDY', inputMode: 'IDEA', durationSeconds: 8, language: 'pcm', outputPreset: 'LANDSCAPE', input: { videoType: 'CINEMATIC_FILM', continuityBibleId: 'bible' }, plan: { sequences: [{ title: 'Sequence', orderIndex: 0, scenes: [{ title: 'Scene', orderIndex: 0, shots: [{ title: 'Shot', prompt: 'Original independent post', durationSeconds: 8, orderIndex: 0, requiredAssetIds: [], resourceBindings: [], dialogueSegments: [] }] }] }] }, estimate: {}, idempotencyKey: 'new-independent-plan' });
    assert.notEqual(made.planId, 'old-plan'); await ctx.call('productions', 'approvePlan', { planId: made.planId });
    const approved = ctx.rows.get(ctx.rows.get(production._id).currentVersionId); assert.equal(approved.status, 'APPROVED'); assert.equal(approved.planningContextSnapshot.continuityMode, 'PROJECT_IDENTITY');
    const snapshot = structuredClone(approved.snapshot);
    await assert.rejects(ctx.call('episodes', 'changeContinuityMode', { projectId: 'project', episodeId: second.episodeId, continuityMode: 'STORY_CONTINUATION', expectedUpdatedAt: ctx.rows.get(second.episodeId).updatedAt }), /Approved or assembled/);
    assert.deepEqual(approved.snapshot, snapshot);
  });
  await check('foreign, unauthorized and already consumed episodes cannot change relationship', async () => {
    for (const mode of ['role', 'foreign', 'timeline', 'historical-approval']) {
      const { ctx, create } = setup(); const episode = await create(1);
      if (mode === 'role') ctx.role = 'VIEWER';
      if (mode === 'foreign') ctx.rows.get(episode.episodeId).projectId = 'foreign';
      if (mode === 'timeline') ctx.put('timelines', { _id: 'existing', productionId: episode.productionId, projectId: 'project', status: 'DRAFT' });
      if (mode === 'historical-approval') ctx.put('productionVersions', { _id: 'approved-before', productionId: episode.productionId, status: 'SUPERSEDED', approvedAt: 1 });
      await assert.rejects(ctx.call('episodes', 'changeContinuityMode', { projectId: 'project', episodeId: episode.episodeId, continuityMode: 'PROJECT_IDENTITY', expectedUpdatedAt: ctx.rows.get(episode.episodeId).updatedAt }));
      assert.equal(ctx.count('audit'), 0);
    }
  });
  await check('accepting a preceding story invalidates story descendants without making independent posts stale', async () => {
    const { ctx, create } = setup(), first = await create(1), story = await create(2), post = await create(3, 'PROJECT_IDENTITY');
    const query = ctx.db.query;
    ctx.db.query = table => {
      const rows = query(table); if (table !== 'episodes') return rows;
      const withIndex = rows.withIndex, take = rows.take; let after;
      rows.withIndex = (index, builder) => withIndex(index, select => { select.gt = (key, value) => { after = [key, value]; return select; }; builder(select); });
      rows.take = async count => (await take(count)).filter(row => !after || row[after[0]] > after[1]);
      return rows;
    };
    ctx.rows.get(first.productionId).currentVersionId = 'approved-first';
    ctx.put('productionVersions', { _id: 'approved-first', productionId: first.productionId, status: 'APPROVED', planningContextSnapshot: { continuityBibleId: 'bible' } });
    ctx.put('timelines', { _id: 'approved-first-timeline', productionId: first.productionId, projectId: 'project', manifestId: 'approved-first-manifest' });
    ctx.put('manifests', { _id: 'approved-first-manifest', productionId: first.productionId, manifest: { productionVersionId: 'approved-first' } });
    ctx.put('resourceStates', { _id: 'approved-first-timeline-state', projectId: 'project', productionId: first.productionId, resourceType: 'timeline', resourceId: 'approved-first-timeline', state: 'LOCKED' });
    const result = await ctx.call('continuity', 'acceptStoryState', { projectId: 'project', episodeId: first.episodeId, productionVersionId: 'approved-first', timelineId: 'approved-first-timeline', continuityBibleId: 'bible', snapshot: { summary: 'An approved first episode.', facts: ['Only this project.'], unresolvedThreads: [], characterStates: [], cliffhanger: '', nextEpisodePayoff: '' } });
    assert.equal(result.invalidatedEpisodeCount, 1); assert.equal(ctx.rows.get(story.episodeId).continuityStatus, 'STALE');
    assert.equal(ctx.rows.get(post.episodeId).continuityStatus, 'CURRENT'); assert.equal(ctx.rows.get(post.episodeId).inputStoryStateId, undefined);
  });
  console.log(`Episode relationships: ${checks} PASS; actual canonical handlers with isolated authorization/data seams. No database/provider/render calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
