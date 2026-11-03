const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const file = path.join(__dirname, 'run-finishing-v5.cjs');
const harness = new Module(file, module);
harness.filename = file;
harness.paths = Module._nodeModulePaths(path.dirname(file));
harness._compile(fs.readFileSync(file, 'utf8').split('const originalFlag =')[0] + '\nmodule.exports={fixture,editor};', file);
const { fixture, editor } = harness.exports;
process.env.FINALFRAME_MANIFEST_V5_ENABLED = 'true';
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
function locked() {
  const ctx = fixture();
  ctx.lock('timeline_1');
  const source = ctx.rows.get('timeline_1');
  source.updatedAt = 23;
  source.tracks.metadata = { ...source.tracks.metadata, lockState: 'LOCKED', authoredOutput: { width: 1280, height: 720, fps: 30 }, soundtrackRetiming: { mode: 'ABSOLUTE' } };
  return ctx;
}
function args(ctx, key = 'duplicate-timeline-test') {
  const source = ctx.rows.get('timeline_1');
  return { timelineId: source._id, expectedVersionNumber: source.versionNumber, expectedUpdatedAt: source.updatedAt ?? null, idempotencyKey: key };
}
const duplicate = (ctx, input = args(ctx)) => editor.duplicate.handler(ctx, input);
(async () => {
  await check('locked source opens by default and exact duplication retains captions/transitions/graphics/native audio without rounding or source writes', async () => {
    const ctx = locked();
    Object.assign(ctx.rows.get('clip_red'), { transition: { out: { kind: 'DISSOLVE', durationSeconds: .5, audioPolicy: 'CROSSFADE' } }, metadata: { clipKind: 'VIDEO', rendererOrderIndex: 0, captionTrack: { id: 'caption-original', language: 'en', fps: 30, cues: [{ id: 'cue', startFrame: 3, durationInFrames: 30, text: 'Every original word.' }], style: { position: 'TOP', fontSize: 28 } } } });
    Object.assign(ctx.rows.get('clip_sound'), { startSeconds: .0123, durationSeconds: 7.8765, trimStartSeconds: 2.001, trimEndSeconds: 9.8775, volume: 0, metadata: { audioRole: 'music', audio: { muted: true, fadeInSeconds: .127, fadeOutSeconds: .551 } } });
    ctx.put('timelineTracks', { _id: 'graphics', timelineId: 'timeline_1', studioExternalId: 'studio', kind: 'GRAPHIC', name: 'Exact graphics', orderIndex: 2, metadata: { compositing: 'overlay' } });
    ctx.put('timelineClips', { _id: 'graphic', timelineId: 'timeline_1', trackId: 'graphics', studioExternalId: 'studio', startSeconds: 1.0123, durationSeconds: 2.1234, metadata: { clipKind: 'GRAPHIC', motionTemplateId: 'end-card', templateProps: { title: 'Exact approved title', callToAction: 'Keep this copy' }, layoutVersion: 2, imageSource: { assetId: 'asset_logo', checksum: 'retained-proof' } } });
    const before = new Map([...ctx.rows].map(([id, row]) => [id, structuredClone(row)]));
    const beforeStates = new Map(ctx.states);
    const source = await ctx.draft();
    assert.equal(source.timeline._id, 'timeline_1');
    const result = await duplicate(ctx);
    const draft = await ctx.draft(result.timelineId);
    assert.equal(draft.timeline.status, 'DRAFT');
    assert.equal(ctx.states.get('timeline:' + result.timelineId), 'DRAFT');
    assert.equal(draft.metadata.lockState, undefined);
    assert.equal(draft.metadata.productionVersionId, 'version_1');
    assert.equal(draft.timeline.tracks.sourceTimelineId, 'timeline_1');
    for (const [i, track] of source.tracks.entries()) {
      const copy = draft.tracks[i];
      assert.notEqual(copy.id, track.id);
      assert.equal(copy.kind, track.kind); assert.equal(copy.name, track.name);
      assert.deepEqual(copy.metadata, track.metadata);
      for (const [j, clip] of track.clips.entries()) {
        const cloned = copy.clips[j];
        assert.notEqual(cloned.id, clip.id); assert.equal(cloned.trackId, copy.id);
        for (const key of ['kind', 'assetId', 'shotVersionId', 'startSeconds', 'durationSeconds', 'trimStartSeconds', 'trimEndSeconds', 'volume', 'transition', 'metadata']) assert.deepEqual(cloned[key], key === 'metadata' ? { ...clip.metadata, clipKind: clip.kind, orderIndex: j } : clip[key], key);
      }
    }
    for (const [id, row] of before) assert.deepEqual(ctx.rows.get(id), row, id);
    for (const [id, state] of beforeStates) assert.equal(ctx.states.get(id), state);
    assert.equal(ctx.count('generationJobs'), 0); assert.equal(ctx.count('renderJobs'), 0); assert.equal(ctx.count('reservations'), 0);
    assert.equal((await ctx.draft()).timeline._id, result.timelineId);
    const edited = await editor.apply.handler(ctx, { timelineId: result.timelineId, kind: 'adjustAudio', input: { clipId: draft.tracks[0].clips[0].id, volume: .5, muted: false }, idempotencyKey: 'edit-the-duplicated-draft' });
    assert.notEqual(edited.timelineId, result.timelineId);
    assert.deepEqual(ctx.rows.get('timeline_1'), before.get('timeline_1'));
  });
  await check('exact duplicate receipt replays after production advances; conflicting key or actor never creates another draft', async () => {
    const ctx = locked(), input = args(ctx), result = await duplicate(ctx, input);
    const count = ctx.count('timelines');
    ctx.rows.get('production_1').currentVersionId = 'later-version';
    assert.equal((await duplicate(ctx, input)).timelineId, result.timelineId);
    for (const patch of [{ expectedVersionNumber: 99 }, { expectedUpdatedAt: 99 }, { timelineId: result.timelineId }]) await assert.rejects(duplicate(ctx, { ...input, ...patch }), /another source/);
    ctx.rows.get(result.operationId).actorUserId = 'other-user';
    await assert.rejects(duplicate(ctx, input), /another source/);
    assert.equal(ctx.count('timelines'), count);
  });
  await check('viewer/reviewer, stale source revision, superseded/unapproved source and historical production lineage deny before writes', async () => {
    const variants = [
      ctx => ctx.role = 'VIEWER', ctx => ctx.role = 'REVIEWER',
      ctx => ctx.rows.get('timeline_1').versionNumber = 2,
      ctx => ctx.rows.get('timeline_1').updatedAt = 24,
      ctx => ctx.rows.get('timeline_1').status = 'SUPERSEDED',
      ctx => ctx.rows.get('timeline_1').status = 'DELETED',
      ctx => ctx.rows.get('timeline_1').status = 'ARCHIVED',
      ctx => ctx.states.set('timeline:timeline_1', 'IN_REVIEW'),
      ctx => ctx.rows.get('production_1').currentVersionId = 'other-version',
      ctx => ctx.rows.get('version_1').status = 'DRAFT',
      ctx => ctx.rows.get('timeline_1').projectId = 'foreign-project',
      ctx => delete ctx.rows.get('timeline_1').tracks.metadata.productionVersionId,
    ];
    for (const mutate of variants) {
      const ctx = locked(), input = args(ctx); mutate(ctx);
      if (!ctx.rows.get('timeline_1').tracks.metadata.productionVersionId) delete ctx.rows.get('timeline_1').tracks.productionVersionId;
      const count = ctx.rows.size;
      await assert.rejects(duplicate(ctx, input));
      assert.equal(ctx.rows.size, count); assert.equal(ctx.count('productionOperations'), 0);
    }
    const replay = locked(), input = args(replay); await duplicate(replay, input); replay.role = 'VIEWER';
    await assert.rejects(duplicate(replay, input), /Forbidden/);
  });
  await check('approved canonical state is sufficient and nullable legacy timestamp remains an exact source guard', async () => {
    const ctx = locked(); ctx.states.set('timeline:timeline_1', 'APPROVED'); delete ctx.rows.get('timeline_1').updatedAt;
    const input = args(ctx); assert.equal(input.expectedUpdatedAt, null);
    const result = await duplicate(ctx, input); assert.equal((await ctx.draft(result.timelineId)).canEdit, true);
    const stale = locked(); delete stale.rows.get('timeline_1').updatedAt;
    await assert.rejects(duplicate(stale, { ...args(stale), expectedUpdatedAt: 0 }), /source timeline changed/);
  });
  await check('latest current approved timeline stays visible ahead of older drafts so its copy action is reachable', async () => {
    const ctx = fixture(), source = await ctx.draft('timeline_1');
    ctx.put('timelines', { ...ctx.rows.get('timeline_1'), _id: 'latest-locked', _creationTime: 999, versionNumber: 2, status: 'APPROVED', tracks: { metadata: source.metadata, tracks: source.tracks } });
    ctx.states.set('timeline:latest-locked', 'LOCKED');
    assert.equal((await ctx.draft()).timeline._id, 'latest-locked');
    assert.equal(ctx.rows.get('timeline_1').status, 'DRAFT');
  });
  await check('bounded graph and stale take lineage cannot be silently copied into a usable draft', async () => {
    const ctx = locked();
    for (let i = 0; i < 501; i++) ctx.put('timelineClips', { _id: 'extra-' + i, timelineId: 'timeline_1', trackId: 'picture', studioExternalId: 'studio', startSeconds: 0, durationSeconds: 1, metadata: {} });
    const count = ctx.count('timelines'); await assert.rejects(duplicate(ctx), /bounded editing graph/); assert.equal(ctx.count('timelines'), count);
    const other = locked(); other.put('shotVersions', { _id: 'old-take', productionId: 'production_1', productionVersionId: 'old-version', studioExternalId: 'studio', projectId: 'project_1', assetId: 'asset_red' }); other.rows.get('clip_red').shotVersionId = 'old-take';
    await assert.rejects(duplicate(other), /outside this production/);
    assert.equal(other.rows.get('timeline_1').status, 'APPROVED');
  });
  console.log(`Timeline duplicate: ${checks} PASS; actual handlers and canonical state/persistence with isolated auth/database seams; no network, render or provider calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
