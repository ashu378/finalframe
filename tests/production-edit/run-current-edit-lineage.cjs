const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const harnessPath = path.join(root, 'tests/production-edit/run-finishing-v5.cjs');
const harness = new Module(harnessPath, module);
harness.filename = harnessPath; harness.paths = Module._nodeModulePaths(path.dirname(harnessPath));
harness._compile(fs.readFileSync(harnessPath, 'utf8').split('const originalFlag =')[0] + '\nmodule.exports={fixture,editor,timeline,assembly};', harnessPath);
const { fixture, editor, timeline, assembly } = harness.exports;
const { timelineMatchesCurrentVersion } = require(path.join(root, 'src/lib/production/timeline-lineage.ts'));
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
async function copy(ctx, id, proof = 'old_version', extra = {}) {
  const draft = await ctx.draft('timeline_1');
  const value = { ...structuredClone(ctx.rows.get('timeline_1')), _id: id, versionNumber: 999,
    tracks: { format: 'FINALFRAME_TIMELINE_V2', productionVersionId: proof, metadata: { ...draft.metadata, productionVersionId: proof }, tracks: draft.tracks }, ...extra };
  delete value._creationTime;
  ctx.put('timelines', value); ctx.states.set('timeline:' + id, 'DRAFT');
  return ctx.rows.get(id);
}
const edit = (ctx, id, key, input = { clipId: 'clip_red', volume: 0 }) => editor.apply.handler(ctx, { timelineId: id, kind: 'adjustAudio', input, idempotencyKey: key });
(async () => {
  await check('default draft ignores newer historical/unbound display numbers; explicit reads remain read-only', async () => {
    const ctx = fixture(); await copy(ctx, 'old'); const unbound = await copy(ctx, 'unbound'); delete unbound.tracks.productionVersionId; delete unbound.tracks.metadata.productionVersionId;
    assert.equal((await editor.getDraft.handler(ctx, { productionId: 'production_1' })).timeline._id, 'timeline_1');
    for (const id of ['old', 'unbound']) assert.equal((await ctx.draft(id)).canEdit, false);
    ctx.rows.get('timeline_1').status = 'APPROVED';
    assert.equal(await editor.getDraft.handler(ctx, { productionId: 'production_1' }), null);
    assert.equal(ctx.count('timelines'), 3);
  });
  await check('exact current immutable version, project/studio ownership and agreeing proofs are required', async () => {
    for (const change of [t => t.projectId = 'foreign', t => delete t.projectId, t => t.tracks.metadata.productionVersionId = 'old', t => t.manifestId = 'missing']) {
      const ctx = fixture(), t = ctx.rows.get('timeline_1'); change(t);
      assert.equal(timelineMatchesCurrentVersion(t, ctx.rows.get('production_1'), ctx.rows.get('version_1')), false);
      if (t.projectId === 'foreign') await assert.rejects(ctx.draft('timeline_1'), /belong/);
      else assert.equal((await ctx.draft('timeline_1')).canEdit, false);
      assert.equal(await editor.getDraft.handler(ctx, { productionId: 'production_1' }), null);
    }
    for (const change of [v => v.productionId = 'foreign', v => v.status = 'DRAFT']) {
      const ctx = fixture(); change(ctx.rows.get('version_1')); assert.equal((await ctx.draft('timeline_1')).canEdit, false);
    }
    const ctx = fixture(); assert.equal((await ctx.draft('timeline_1')).canEdit, true); ctx.role = 'REVIEWER'; assert.equal((await ctx.draft('timeline_1')).canEdit, false);
  });
  await check('historical apply/undo/redo/beat content writes deny before creating rows', async () => {
    const ctx = fixture(); await copy(ctx, 'old'); const count = ctx.count('timelines');
    await assert.rejects(edit(ctx, 'old', 'old-apply-key'), /read-only/);
    for (const name of ['undo', 'redo']) await assert.rejects(editor[name].handler(ctx, { timelineId: 'old', idempotencyKey: 'old-' + name + '-key' }), /read-only/);
    const before = process.env.FINALFRAME_BEAT_ANALYSIS_ENABLED; process.env.FINALFRAME_BEAT_ANALYSIS_ENABLED = 'true';
    try { await assert.rejects(editor.applyBeatCuts.handler(ctx, { timelineId: 'old', analysisVersionId: 'analysis', audioClipId: 'sound', pictureTrackId: 'picture', expectedPlanHash: 'hash', idempotencyKey: 'old-beat-key' }), /read-only/); }
    finally { if (before === undefined) delete process.env.FINALFRAME_BEAT_ANALYSIS_ENABLED; else process.env.FINALFRAME_BEAT_ANALYSIS_ENABLED = before; }
    assert.equal(ctx.count('timelines'), count); assert.equal(ctx.count('productionOperations'), 0);
  });
  await check('current edits freeze lineage without changing source and exact replays survive a new current version', async () => {
    const ctx = fixture(), old = structuredClone(ctx.rows.get('timeline_1'));
    const result = await edit(ctx, 'timeline_1', 'current-edit-key');
    assert.equal((await ctx.draft(result.timelineId)).canEdit, true); assert.equal(ctx.rows.get(result.timelineId).tracks.metadata.productionVersionId, 'version_1'); assert.deepEqual(ctx.rows.get('timeline_1'), old);
    ctx.put('productionVersions', { _id: 'version_2', productionId: 'production_1', status: 'APPROVED' }); ctx.rows.get('production_1').currentVersionId = 'version_2';
    const count = ctx.count('timelines'); assert.equal((await edit(ctx, 'timeline_1', 'current-edit-key')).timelineId, result.timelineId);
    assert.equal((await edit(ctx, 'timeline_1', 'current-edit-key')).replayed, true);
    await assert.rejects(edit(ctx, 'timeline_1', 'current-edit-key', { clipId: 'clip_red', volume: 0.2 }), /another edit/);
    await assert.rejects(edit(ctx, 'timeline_1', 'new-key-after-version'), /read-only/); assert.equal(ctx.count('timelines'), count);
    const deliberate = await copy(ctx, 'current_v2', 'version_2'); assert.equal((await ctx.draft(deliberate._id)).canEdit, true);
    const fresh = await edit(ctx, deliberate._id, 'new-current-explicit'); assert.equal(ctx.rows.get(fresh.timelineId).tracks.metadata.productionVersionId, 'version_2');
  });
  await check('undo/redo restore only exact current sources; immutable receipts replay without new writes', async () => {
    const ctx = fixture(), changed = await edit(ctx, 'timeline_1', 'undo-seed-edit');
    const undone = await editor.undo.handler(ctx, { timelineId: changed.timelineId, idempotencyKey: 'undo-current-key' });
    const redone = await editor.redo.handler(ctx, { timelineId: undone.timelineId, idempotencyKey: 'redo-current-key' });
    assert.equal((await ctx.draft(redone.timelineId)).canEdit, true);
    ctx.rows.get('production_1').currentVersionId = 'version_2'; const count = ctx.count('timelines');
    assert.equal((await editor.undo.handler(ctx, { timelineId: changed.timelineId, idempotencyKey: 'undo-current-key' })).timelineId, undone.timelineId);
    assert.equal((await editor.redo.handler(ctx, { timelineId: undone.timelineId, idempotencyKey: 'redo-current-key' })).timelineId, redone.timelineId);
    await assert.rejects(editor.undo.handler(ctx, { timelineId: redone.timelineId, idempotencyKey: 'undo-current-key' }), /another edit/);
    assert.equal(ctx.count('timelines'), count);
    const other = fixture(), prior = await edit(other, 'timeline_1', 'undo-other-seed');
    other.rows.get('timeline_1').tracks.metadata.productionVersionId = 'old'; other.rows.get('timeline_1').tracks.productionVersionId = 'old';
    await assert.rejects(editor.undo.handler(other, { timelineId: prior.timelineId, idempotencyKey: 'undo-old-source' }), /read-only/);
  });
  await check('exact beat receipt can replay historically; changed immutable request cannot', async () => {
    const ctx = fixture(); await copy(ctx, 'old');
    ctx.put('productionOperations', { _id: 'beat_receipt', idempotencyKey: 'saved-beat-key', kind: 'APPLY_BEAT_CUTS', productionId: 'production_1', studioExternalId: 'studio', actorUserId: 'user_1', targetId: 'old', input: { planHash: 'frozen-hash', analysisVersionId: 'analysis', audioClipId: 'sound', pictureTrackId: 'picture', beatIndices: [1, 3] }, outputResourceIds: ['retained-output'] });
    const args = { timelineId: 'old', analysisVersionId: 'analysis', audioClipId: 'sound', pictureTrackId: 'picture', expectedPlanHash: 'frozen-hash', beatIndices: [1, 3], idempotencyKey: 'saved-beat-key' };
    assert.equal((await editor.applyBeatCuts.handler(ctx, args)).timelineId, 'retained-output');
    for (const patch of [{ expectedPlanHash: 'changed' }, { beatIndices: [1, 2] }, { audioClipId: 'other' }]) await assert.rejects(editor.applyBeatCuts.handler(ctx, { ...args, ...patch }), /another source/);
    assert.equal(ctx.count('timelines'), 2);
  });
  await check('new canonical imports require current approved target; exact historical receipt retains old immutable source', async () => {
    const ctx = fixture(); ctx.lock('timeline_1'); const assembled = await assembly.createJob.handler(ctx, { productionId: 'production_1', timelineId: 'timeline_1', idempotencyKey: 'current-import-source' });
    const imported = await timeline.createVersion.handler(ctx, { productionId: 'production_1', manifestId: assembled.manifestId, idempotencyKey: 'current-import-key' });
    assert.equal((await ctx.draft(imported._id)).canEdit, true); const frozen = structuredClone(ctx.rows.get('timeline_1'));
    ctx.rows.get('production_1').currentVersionId = 'version_2'; ctx.put('productionVersions', { _id: 'version_2', productionId: 'production_1', status: 'APPROVED' });
    const count = ctx.count('timelines'); assert.equal((await timeline.createVersion.handler(ctx, { productionId: 'production_1', manifestId: assembled.manifestId, idempotencyKey: 'current-import-key' }))._id, imported._id);
    await assert.rejects(timeline.createVersion.handler(ctx, { productionId: 'production_1', manifestId: assembled.manifestId, idempotencyKey: 'new-historical-import' }), /read-only/);
    assert.equal(ctx.count('timelines'), count); assert.deepEqual(ctx.rows.get('timeline_1'), frozen);
    assert.equal((await ctx.draft(imported._id)).canEdit, false);
  });
  await check('manifest-only proof is exact and stale take versions cannot be silently adopted', async () => {
    const ctx = fixture(); ctx.lock('timeline_1');
    const assembled = await assembly.createJob.handler(ctx, { productionId: 'production_1', timelineId: 'timeline_1', idempotencyKey: 'lineage-proof-source' });
    const good = ctx.rows.get(assembled.manifestId);
    const bound = await copy(ctx, 'manifest_only'); bound.manifestId = assembled.manifestId; delete bound.tracks.productionVersionId; delete bound.tracks.metadata.productionVersionId;
    assert.equal((await ctx.draft(bound._id)).canEdit, true);
    for (const mutate of [m => m.projectId = 'foreign', m => m.manifest.productionId = 'foreign', m => m.manifest.manifestId = 'foreign', m => m.manifest.productionVersionId = 'old', m => m.contractVersion = 99]) {
      const saved = structuredClone(good); mutate(good); assert.equal((await ctx.draft(bound._id)).canEdit, false, mutate.toString()); Object.keys(good).forEach(k => delete good[k]); Object.assign(good, saved);
    }
    ctx.put('shotVersions', { _id: 'old_take', studioExternalId: 'studio', projectId: 'project_1', productionId: 'production_1', productionVersionId: 'old', assetId: 'asset_red', status: 'COMPLETED' }); ctx.states.set('shotVersion:old_take', 'APPROVED');
    good.manifest.items[0].shotVersionId = 'old_take';
    await assert.rejects(timeline.createVersion.handler(ctx, { productionId: 'production_1', manifestId: assembled.manifestId, idempotencyKey: 'old-take-import' }), /outside this production/);
    const editCtx = fixture(); editCtx.put('shotVersions', { _id: 'old_take', studioExternalId: 'studio', projectId: 'project_1', productionId: 'production_1', productionVersionId: 'old', assetId: 'asset_red' }); editCtx.rows.get('clip_red').shotVersionId = 'old_take';
    const source = structuredClone(editCtx.rows.get('timeline_1')); await assert.rejects(edit(editCtx, 'timeline_1', 'old-take-edit'), /outside this production/); assert.deepEqual(editCtx.rows.get('timeline_1'), source);
  });
  console.log(`Current Edit lineage: ${checks} PASS; actual handlers, immutable fixture rows; no network/DB/provider calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
