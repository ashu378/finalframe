// Actual canonical handler and React controls; no database, browser, network or provider calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { fixture } = require('../recipes/backend-fixture.cjs');
process.env.FINALFRAME_MANIFEST_V5_ENABLED = 'true';
function context() {
  const ctx = fixture();
  ctx.put('productionVersions', { _id: 'version', productionId: 'production', status: 'APPROVED', snapshot: {} });
  ctx.put('sequences', { _id: 'sequence', productionId: 'production', productionVersionId: 'version', projectId: 'project' });
  ctx.put('scenes', { _id: 'scene', productionId: 'production', productionVersionId: 'version', projectId: 'project', sequenceId: 'sequence' });
  ctx.put('shots', { _id: 'shot', sceneId: 'scene', projectId: 'project', productionId: 'production', productionVersionId: 'version', durationSeconds: 4 });
  ctx.put('shotVersions', { _id: 'take', projectId: 'project', productionId: 'production', productionVersionId: 'version', shotId: 'shot', assetId: 'asset', studioExternalId: 'studio', status: 'COMPLETED', versionNumber: 1, contextSnapshot: { reviewed: true } });
  ctx.put('assets', { _id: 'asset', projectId: 'project', studioExternalId: 'studio', scope: 'PROJECT', mimeType: 'video/mp4', storageId: 'storage', checksum: 'a'.repeat(64), durationSeconds: 3.92 });
  ctx.storageObjects.set('storage', { sha256: 'a'.repeat(64), size: 100, contentType: 'video/mp4' });
  for (const [resourceType, resourceId] of [['shotVersion', 'take'], ['asset', 'asset']]) ctx.put('resourceStates', { _id: `state-${resourceType}`, projectId: 'project', resourceType, resourceId, state: 'LOCKED' });
  return ctx;
}
const request = { productionId: 'production', productionVersionId: 'version', idempotencyKey: 'explicit-take-length', fps: 30 };
let checks = 0;
async function check(name, test) { await test(); checks++; console.log('PASS ' + name); }
(async () => {
  await check('4-second approved take explicitly uses 3.9 seconds / 117 frames with exact lineage and unchanged originals', async () => {
    const ctx = context(), originals = ['shot', 'take', 'asset'].map(id => structuredClone(ctx.rows.get(id)));
    const args = { ...request, clips: [{ kind: 'TAKE', shotVersionId: 'take', durationSeconds: 3.9 }] };
    const result = await ctx.call('timeline', 'createDraft', args);
    const clips = [...ctx.rows.values()].filter(row => row._table === 'timelineClips');
    assert.equal(clips.length, 1); assert.equal(clips[0].shotVersionId, 'take'); assert.equal(clips[0].assetId, 'asset'); assert.equal(clips[0].durationSeconds, 3.9); assert.equal(clips[0].durationSeconds * 30, 117); assert.equal(clips[0].trimStartSeconds, 0);
    assert.equal(ctx.rows.get(result.timelineId).durationSeconds, 3.9);
    assert.deepEqual(['shot', 'take', 'asset'].map(id => ctx.rows.get(id)), originals);
    assert.equal((await ctx.call('timeline', 'createDraft', args)).timelineId, result.timelineId);
    await assert.rejects(ctx.call('timeline', 'createDraft', { ...args, clips: [{ ...args.clips[0], durationSeconds: 3.8 }] }), /different selection/);
    assert.equal(ctx.count('timelines'), 1); assert.equal(ctx.count('generationJobs'), 0); assert.equal(ctx.count('renderJobs'), 0);
    const approval = require('../recipes/backend-fixture.cjs').load('convex/approvals.ts');
    for (const state of ['IN_REVIEW', 'APPROVED', 'LOCKED']) await approval.transitionResourceState(ctx, { projectId: 'project', productionId: 'production', resourceType: 'timeline', resourceId: result.timelineId, targetState: state, roles: ['OWNER'], decision: state });
    const assembled = await ctx.call('assembly', 'createJob', { productionId: 'production', timelineId: result.timelineId, selectionScope: 'TIMELINE', idempotencyKey: 'take-duration-manifest' });
    assert.equal(assembled.manifest.version, 5); assert.equal(assembled.manifest.output.durationInFrames, 117); assert.equal(assembled.manifest.items[0].durationInFrames, 117);
    assert.equal(assembled.manifest.sources[0].shotVersionId, 'take'); assert.equal(assembled.manifest.sources[0].assetId, 'asset');
    assert.equal(ctx.count('renderJobs'), 0); assert.deepEqual(['shot', 'take', 'asset'].map(id => ctx.rows.get(id)), originals);
  });
  await check('long, negative, zero, NaN, infinite, fractional-frame and beyond-source lengths fail before writes', async () => {
    for (const durationSeconds of [4.1, -1, 0, NaN, Infinity, 3.91, 4]) {
      const ctx = context(); await assert.rejects(ctx.call('timeline', 'createDraft', { ...request, clips: [{ kind: 'TAKE', shotVersionId: 'take', durationSeconds }] }));
      assert.equal(ctx.count('timelines'), 0); assert.equal(ctx.count('timelineClips'), 0); assert.equal(ctx.count('productionOperations'), 0);
    }
    const ctx = context(); delete ctx.rows.get('asset').durationSeconds;
    await assert.rejects(ctx.call('timeline', 'createDraft', { ...request, clips: [{ kind: 'TAKE', shotVersionId: 'take', durationSeconds: 3.9 }] }), /actual source/);
  });
  await check('approved shot cap and frame grid follow selected fps while omitted length preserves original behavior', async () => {
    const ctx = context(); ctx.rows.get('asset').durationSeconds = 6;
    const full = await ctx.call('timeline', 'createDraft', { ...request, clips: [{ kind: 'TAKE', shotVersionId: 'take' }] });
    assert.equal(ctx.rows.get(full.timelineId).durationSeconds, 4);
    await assert.rejects(ctx.call('timeline', 'createDraft', { ...request, idempotencyKey: 'longer-than-approved', clips: [{ kind: 'TAKE', shotVersionId: 'take', durationSeconds: 5 }] }), /approved shot/);
    const other = context(); await assert.rejects(other.call('timeline', 'createDraft', { ...request, fps: 25, clips: [{ kind: 'TAKE', shotVersionId: 'take', durationSeconds: 3.9 }] }), /frame grid/);
    const result = await other.call('timeline', 'createDraft', { ...request, fps: 25, clips: [{ kind: 'TAKE', shotVersionId: 'take', durationSeconds: 3.88 }] }); assert.equal(other.rows.get(result.timelineId).durationSeconds, 3.88);
    await assert.rejects(context().call('timeline', 'createDraft', { ...request, clips: [{ kind: 'TAKE', shotVersionId: 'take' }] }), /extends beyond/);
  });
  await check('source approval, take approval and project authorization remain required', async () => {
    for (const change of ['asset', 'shotVersion', 'foreign', 'denied']) {
      const ctx = context();
      if (change === 'asset' || change === 'shotVersion') ctx.rows.get(`state-${change}`).state = 'DRAFT';
      if (change === 'foreign') ctx.rows.get('asset').projectId = 'foreign';
      if (change === 'denied') ctx.denied = true;
      await assert.rejects(ctx.call('timeline', 'createDraft', { ...request, clips: [{ kind: 'TAKE', shotVersionId: 'take', durationSeconds: 3.9 }] })); assert.equal(ctx.count('timelines'), 0);
    }
  });
  await check('ordinary composer requires explicit shorter choice and submits it with original take ID', async () => {
    const file = path.join(__dirname, 'run-composer-labels-ui.cjs'), m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
    let source = fs.readFileSync(file, 'utf8').split('let checks = 0;')[0];
    source = source.replace("'./soundtrack-editor':", "'../../../renderer/src/output-presets': require('../recipes/backend-fixture.cjs').load('renderer/src/output-presets.ts'), './soundtrack-editor':");
    source = source.replace("createWorkspaceTimeline: async () => { calls.push('create'); }", "createWorkspaceTimeline: async input => { calls.push(input); return { success: true }; }");
    m._compile(source + '\nmodule.exports={harness};', file);
    const h = m.exports.harness(false, { projectExternalId: 'external', productionId: 'production', versionId: 'version', assets: [{ id: 'asset', mimeType: 'video/mp4', durationSeconds: 3.92, state: 'LOCKED' }], scenes: [{ title: 'Scene', shots: [{ title: 'Shot', durationSeconds: 4, takes: [{ id: 'take', assetId: 'asset', state: 'LOCKED', versionNumber: 1 }] }] }] });
    h.render(); h.find(n => n.type === 'select' && n.props['aria-label'] === 'Approved shot take').props.onChange({ target: { value: 'take' } });
    let doc = h.render(); const add = () => h.find(n => n.props?.children === 'Add selected take' && n.props.onClick);
    assert(add().props.disabled); assert(doc.textContent.includes('Actual source: 3.92 s.')); assert(doc.textContent.includes('at most 3.9 s at 30 fps'));
    const length = () => h.find(n => n.type === 'input' && n.props['aria-label'] === 'Take length in seconds');
    assert.equal(length().props.value, 4); assert.equal(length().props.max, 3.9);
    length().props.onChange({ target: { value: '3.91' } }); h.render(); assert(add().props.disabled);
    length().props.onChange({ target: { value: '3.9' } }); h.render(); assert.equal(add().props.disabled, false); add().props.onClick(); h.render();
    h.find(n => n.props?.children === 'Create draft timeline' && n.props.onClick).props.onClick(); await new Promise(resolve => setImmediate(resolve));
    const submitted = h.calls.find(call => typeof call === 'object'); assert.deepEqual(submitted.clips, [{ kind: 'TAKE', shotVersionId: 'take', durationSeconds: 3.9 }]); assert.equal(submitted.fps, 30);
  });
  console.log(`Take duration: ${checks} PASS; actual canonical authoring and UI handlers, no database/provider/render calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
