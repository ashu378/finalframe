const assert = require('node:assert/strict');
const { load, fixture } = require('./backend-fixture.cjs');
const { compileRecipe, recipeHash } = load('src/lib/production/recipes/compiler.ts');
const local = load('convex/recipeLocal.ts');
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }
process.env.FINALFRAME_RECIPE_ENABLED = 'true';
process.env.FINALFRAME_RECIPE_WORKER_ENABLED = 'true';
process.env.FINALFRAME_MANIFEST_V5_ENABLED = 'true';

function asset(ctx, id, audio = false) {
  const checksum = 'a'.repeat(64), storageId = id + '-storage', mimeType = audio ? 'audio/wav' : 'image/png';
  ctx.put('assets', { _id: id, projectId: 'project', studioExternalId: 'studio', scope: 'PROJECT', storageId, checksum, mimeType });
  ctx.storageObjects.set(storageId, { size: 100, sha256: checksum, contentType: mimeType });
  ctx.put('resourceStates', { _id: id + '-state', projectId: 'project', resourceType: 'asset', resourceId: id, state: 'APPROVED' });
  if (audio) ctx.put('verifiedAudioProbes', { _id: id + '-probe', projectId: 'project', assetId: id, storageId, checksum, byteSize: 100, durationSeconds: 1.5, durationMeasurement: 'DECODED_PCM_SAMPLES_V1', hasVideo: false });
}
async function setup() {
  const ctx = fixture(), voices = load('convex/voices.ts'), registry = load('src/lib/ai/model-registry.ts');
  const segments = [], steps = [], shots = [], voiceContext = [];
  for (let i = 0; i < 2; i++) {
    const voiceId = 'voice' + i;
    ctx.put('voices', { _id: voiceId, projectId: 'project', kind: 'STOCK', status: 'READY', provider: 'openrouter', providerVoiceId: 'stock-' + i, settingsSnapshot: { modelId: registry.PREPARATION_MODELS.narration.id }, sampleAssetIds: [] });
    ctx.put('resourceStates', { _id: voiceId + '-state', projectId: 'project', resourceType: 'voice', resourceId: voiceId, state: 'APPROVED' });
    const resolved = await voices.resolveVoiceSynthesisInput(ctx, { projectId: 'project', voiceId, use: 'SYNTHESIZE' });
    const voiceVersionId = await voices.freezeVoiceVersion(ctx, resolved, 'user');
    const line = { speakerResourceVersionId: 'character' + i, voiceVersionId, startSeconds: .25, durationSeconds: 2, text: 'Complete approved line ' + i + '.' };
    segments.push(line);
    const descriptor = { title: 'Shot ' + i, prompt: 'Original shot ' + i, durationSeconds: 4, orderIndex: i, camera: {}, requiredAssetIds: [], metadata: { audioPolicy: 'SILENT', dialogueSegments: [line] } };
    ctx.put('shots', { _id: 'shot' + i, projectId: 'project', productionId: 'production', productionVersionId: 'version', sceneId: 'scene', ...descriptor });
    shots.push({ id: 'shot' + i, productionVersionId: 'version', prompt: descriptor.prompt, durationFrames: 120, referenceAssetIds: [], approvedRecipeReferenceSlots: [], nativeAudioPolicy: 'SILENT', dialogueSegments: [line] });
    steps.push({ key: 'picture' + i, operation: 'GENERATION', shotId: 'shot' + i, references: [] }, { key: 'speech' + i, operation: 'NARRATION', mode: 'GENERATE', voiceId, voiceVersionId, text: line.text });
    voiceContext.push({ id: voiceId, voiceVersionId, projectId: 'project', kind: 'STOCK', approved: true, consentCurrent: false, sampleAssetIds: [] });
    asset(ctx, 'visual' + i); asset(ctx, 'audio' + i, true);
    ctx.put('shotVersions', { _id: 'take' + i, projectId: 'project', productionId: 'production', productionVersionId: 'version', shotId: 'shot' + i, assetId: 'visual' + i, status: 'COMPLETED' });
    ctx.put('resourceStates', { _id: 'take' + i + '-state', projectId: 'project', productionId: 'production', resourceType: 'shotVersion', resourceId: 'take' + i, state: 'APPROVED' });
    ctx.put('generationJobs', { _id: 'speech-job' + i, projectId: 'project', productionId: 'production', operation: 'PREPARATION', status: 'COMPLETED', request: { preparationKind: 'NARRATION', targetVoiceId: voiceId, voiceVersionId, text: line.text }, response: { assetId: 'audio' + i } });
  }
  const descriptors = [0, 1].map(i => { const row = ctx.rows.get('shot' + i); return { title: row.title, prompt: row.prompt, durationSeconds: row.durationSeconds, orderIndex: i, camera: {}, requiredAssetIds: [], metadata: row.metadata }; });
  const snapshot = { sequences: [{ title: 'Sequence', orderIndex: 0, scenes: [{ title: 'Scene', orderIndex: 0, shots: descriptors }] }] }, hash = await recipeHash(snapshot);
  const binding = { projectId: 'project', productionId: 'production', productionVersionId: 'version', snapshotHash: hash };
  const recipe = { kind: 'finalframe.recipe', version: 1, videoType: 'CINEMATIC_FILM', binding, fps: 30, steps: [...steps, { key: 'captions', operation: 'CAPTIONS', mode: 'PLANNED_DIALOGUE', language: 'pcm' }], visualOrder: ['picture0', 'picture1'], dialogueTracks: [0, 1].map(i => ({ stepKey: 'speech' + i, shotId: 'shot' + i, segmentIndex: 0 })), captionStepKey: 'captions' };
  const context = { binding, fps: 30, productionVersionState: 'APPROVED', continuityApproved: true, assets: [], shots, voices: voiceContext, quotes: {} };
  const compiled = await compileRecipe(recipe, context, Date.now());
  ctx.put('productionVersions', { _id: 'version', productionId: 'production', sourcePlanId: 'plan', status: 'APPROVED', snapshot });
  ctx.put('sequences', { _id: 'sequence', productionId: 'production', productionVersionId: 'version', orderIndex: 0 });
  ctx.put('scenes', { _id: 'scene', productionId: 'production', productionVersionId: 'version', sequenceId: 'sequence', orderIndex: 0 });
  ctx.put('recipeRuns', { _id: 'run', projectId: 'project', productionId: 'production', productionVersionId: 'version', sourcePlanId: 'plan', directorSnapshotHash: hash, boundRecipe: recipe, canonicalContext: { binding, rawSourceBindings: [] }, reviewedByUserId: 'user', createdByUserId: 'user', reviewedAt: Date.now(), status: 'RUNNING' });
  for (const [index, node] of compiled.nodes.entries()) {
    ctx.put('recipeRunNodes', { _id: node.id, runId: 'run', projectId: 'project', productionVersionId: 'version', nodeId: node.id, orderIndex: index, operation: node.operation, effect: node.effect, request: node.request, dependencies: node.dependencies, requestHash: node.requestHash, idempotencyKey: node.idempotencyKey, approvalTarget: node.approvalTarget, status: ['GENERATION', 'NARRATION'].includes(node.operation) || node.id.startsWith('approve:picture') || node.id.startsWith('approve:speech') ? 'COMPLETED' : 'WAITING', attemptCount: 0,
      ...(node.operation === 'GENERATION' ? { resultId: 'take' + node.id.slice(-1) } : node.operation === 'NARRATION' ? { resultId: 'audio' + node.id.slice(-1), linkedGenerationJobId: 'speech-job' + node.id.slice(-1) } : {}) });
  }
  return { ctx, compiled, recipe, context, run: ctx.rows.get('run'), node: ctx.rows.get('captions') };
}

(async () => {
  await check('explicit local caption mode depends on all exact audio/take approvals without buying STT', async () => {
    const { compiled } = await setup(), captions = compiled.nodes.find(n => n.id === 'captions');
    assert.equal(captions.effect, 'LOCAL');
    assert.deepEqual(new Set(captions.dependencies), new Set(['approve:speech0', 'approve:speech1', 'approve:picture0', 'approve:picture1']));
    assert(compiled.nodes.find(n => n.id === 'timeline').dependencies.includes('approve:captions'));
    assert(!compiled.nodes.some(n => n.operation === 'PREPARATION'));
  });
  await check('actual local draft joins two characters at measured shot offsets and retains exact source provenance', async () => {
    const { ctx, node, run } = await setup();
    const id = await local.captionDraft(ctx, node, run, 'user'), caption = ctx.rows.get(id);
    assert.equal(caption.status, 'DRAFT'); assert.equal(caption.transcriptId, undefined); assert.equal(caption.format, 'PLANNED_DIALOGUE_LINES_V1');
    assert.deepEqual(caption.cues.map(cue => [cue.startFrame, cue.durationInFrames, cue.text]), [[8, 45, 'Complete approved line 0.'], [128, 45, 'Complete approved line 1.']]);
    for (let i = 0; i < 2; i++) { const source = caption.cues[i].source; assert.equal(source.shotVersionId, 'take' + i); assert.equal(source.audioAssetId, 'audio' + i); assert.equal(source.audioDurationSeconds, 1.5); assert.equal(source.approvedText, caption.cues[i].text); assert.equal(source.generationJobId, 'speech-job' + i); }
    assert.equal(await local.captionDraft(ctx, node, run, 'user'), id); assert.equal(ctx.count('captions'), 1);
    assert.equal(ctx.count('transcripts'), 0); assert.equal(ctx.count('renderJobs'), 0); assert.equal(ctx.count('generationJobs'), 2);
  });
  await check('compiler rejects overlapping/future windows, wrong words and ambiguous narration before purchase', async () => {
    for (const mutate of [x => x.context.shots[0].dialogueSegments[0].startSeconds = 4, x => x.recipe.narrationStepKey = 'speech0', x => x.recipe.steps[1].text = 'Unapproved words']) {
      const x = await setup(); mutate(x); await assert.rejects(compileRecipe(x.recipe, x.context, Date.now()));
    }
    const x = await setup(); x.context.shots[0].dialogueSegments.push({ ...x.context.shots[0].dialogueSegments[0], startSeconds: 1, text: 'Overlapping line.' });
    x.recipe.steps.push({ ...x.recipe.steps[1], key: 'overlap', text: 'Overlapping line.' }); x.recipe.dialogueTracks.push({ stepKey: 'overlap', shotId: 'shot0', segmentIndex: 1 });
    await assert.rejects(compileRecipe(x.recipe, x.context, Date.now()), /nonoverlapping/);
  });
  await check('local handler rejects future timing, foreign audio, stale measurements, voice revocation and incorrect accepted speech', async () => {
    const mutations = [
      x => x.node.request.dialogueTracks[0].startSeconds = 100,
      x => x.ctx.rows.get('audio0').projectId = 'other-project',
      x => x.ctx.rows.get('audio0-probe').storageId = 'stale',
      x => x.ctx.rows.get('audio0-probe').durationSeconds = 2.1,
      x => x.ctx.rows.get('voice0').revokedAt = 1,
      x => x.ctx.rows.get('speech-job0').request.text = 'Wrong spoken words',
      x => x.ctx.rows.get('take0').productionVersionId = 'other-version',
    ];
    for (const mutate of mutations) { const x = await setup(); mutate(x); await assert.rejects(local.captionDraft(x.ctx, x.node, x.run, 'user')); assert.equal(x.ctx.count('captions'), 0); }
  });
  await check('caption review is required before actual timeline handler execution', async () => {
    const { ctx, node, run } = await setup(), id = await local.captionDraft(ctx, node, run, 'user');
    const timeline = ctx.rows.get('timeline'); timeline.status = 'READY'; timeline.leaseId = 'lease'; timeline.leaseExpiresAt = Date.now() + 60000;
    await assert.rejects(ctx.call('recipeRunner', 'execute', { nodeId: 'timeline', leaseId: 'lease' }), /DEPENDENCY/); assert.equal(ctx.count('timelines'), 0);
    const state = [...ctx.rows.values()].find(r => r._table === 'resourceStates' && r.resourceType === 'caption' && r.resourceId === id); state.state = 'APPROVED';
    await local.advanceRecipeApproval(ctx, ctx.rows.get('approve:captions'), run, 'user');
    await ctx.call('recipeRunner', 'execute', { nodeId: 'timeline', leaseId: 'lease' });
    assert.equal(ctx.count('timelines'), 1); assert([...ctx.rows.values()].some(r => r._table === 'timelineClips' && r.metadata?.captionId === id));
  });
  await check('explicit cue revision retains originals and provenance, replays once and pauses for new approval', async () => {
    const { ctx, node, run } = await setup(), id = await local.captionDraft(ctx, node, run, 'user');
    const old = structuredClone(ctx.rows.get(id)), previousHash = ctx.rows.get('captions').resultHash; const cues = old.cues.map(cue => ({ id: cue.id, startFrame: cue.startFrame, durationInFrames: cue.durationInFrames, text: cue.text + ' Reviewed.' }));
    const args = { nodeId: 'captions', expectedCaptionId: id, cues };
    const next = await ctx.call('recipeLocal', 'reviseDialogueCaptions', args);
    assert.notEqual(next, id); assert.deepEqual(ctx.rows.get(id), old); assert.equal(ctx.rows.get(next).status, 'DRAFT');
    assert.equal(ctx.rows.get(next).cues[0].source.approvedText, old.cues[0].text); assert.equal(ctx.rows.get(next).cues[0].source.captionRevisionOf, id);
    assert.equal(ctx.rows.get(next).cues[0].source.editedByUserId, 'user'); assert.equal(ctx.rows.get('run').status, 'WAITING_APPROVAL');
    assert.equal(ctx.rows.get('captions').resultId, next); assert.notEqual(ctx.rows.get('captions').resultHash, previousHash);
    assert.equal(ctx.rows.get('approve:captions').status, 'WAITING_APPROVAL');
    assert.equal(await ctx.call('recipeLocal', 'reviseDialogueCaptions', args), next); assert.equal(ctx.count('captions'), 2);
    await assert.rejects(ctx.call('recipeLocal', 'reviseDialogueCaptions', { ...args, cues: cues.map(c => ({ ...c, text: 'Concurrent different edit.' })) }), /CAPTION_CHANGED/);
  });
  await check('wrong project/role, consumed caption and concurrent approval cannot revise or create another caption', async () => {
    for (const mode of ['viewer', 'foreign', 'approved', 'consumed', 'lease', 'audio-changed']) {
      const { ctx, node, run } = await setup(), id = await local.captionDraft(ctx, node, run, 'user'), cues = ctx.rows.get(id).cues;
      if (mode === 'viewer') ctx.role = 'VIEWER';
      if (mode === 'foreign') ctx.rows.get('captions').projectId = 'other-project';
      if (mode === 'approved') [...ctx.rows.values()].find(r => r._table === 'resourceStates' && r.resourceId === id).state = 'APPROVED';
      if (mode === 'consumed') ctx.rows.get('timeline').resultId = 'existing-timeline';
      if (mode === 'lease') { ctx.rows.get('approve:captions').leaseId = 'racing-approval'; ctx.rows.get('approve:captions').leaseExpiresAt = Date.now() + 60000; }
      if (mode === 'audio-changed') ctx.storageObjects.get('audio0-storage').sha256 = 'b'.repeat(64);
      await assert.rejects(ctx.call('recipeLocal', 'reviseDialogueCaptions', { nodeId: 'captions', expectedCaptionId: id, cues })); assert.equal(ctx.count('captions'), 1);
    }
  });
  await check('caption edits cannot invent new line identities, overlap cues or run past the picture', async () => {
    for (const mode of ['identity', 'overlap', 'future']) {
      const { ctx, node, run } = await setup(), id = await local.captionDraft(ctx, node, run, 'user');
      const cues = ctx.rows.get(id).cues.map(c => ({ id: c.id, startFrame: c.startFrame, durationInFrames: c.durationInFrames, text: c.text }));
      if (mode === 'identity') cues[0].id = 'invented-line';
      if (mode === 'overlap') cues[1].startFrame = cues[0].startFrame;
      if (mode === 'future') cues[1].startFrame = 239;
      await assert.rejects(ctx.call('recipeLocal', 'reviseDialogueCaptions', { nodeId: 'captions', expectedCaptionId: id, cues }), /LINE_IDENTITY|CAPTION_REVIEW/);
      assert.equal(ctx.count('captions'), 1);
    }
  });
  await check('safe dialogue recovery codes survive scheduling while unknown provider details stay private', () => {
    const { recipeErrorCode } = load('convex/recipeErrors.ts');
    for (const code of ['RECIPE_CAPTION_ALREADY_CONSUMED', 'RECIPE_CAPTION_CHANGED', 'RECIPE_CAPTION_LINE_IDENTITY_CHANGED', 'RECIPE_CAPTION_REVISION_NOT_ADMISSIBLE', 'RECIPE_DIALOGUE_BINDING_CHANGED', 'RECIPE_DIALOGUE_CAPTION_REVIEW_REQUIRED', 'RECIPE_DIALOGUE_CAPTION_REVISION_REQUIRED', 'RECIPE_DIALOGUE_TIMING_REVIEW_REQUIRED']) assert.equal(recipeErrorCode(new Error(code)), code);
    assert.equal(recipeErrorCode(new Error('Provider failed with private payload and credential')), 'RECIPE_INTERNAL_ERROR');
  });
  console.log(`Dialogue captions: ${checks} PASS; actual compiler, local handlers, scoped mutation and isolated Storage. No database/provider/render calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
