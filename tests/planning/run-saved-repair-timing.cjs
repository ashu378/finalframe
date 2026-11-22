const assert = require('node:assert/strict');
const { fixture, load } = require('../recipes/backend-fixture.cjs');
const { assertFrameToRegion, frameSelection, timedFrameSelection } = load(
  'renderer/src/media/frame-to-region-contract.ts',
);
const { ACTION_MOTION_REPAIR_VERSION } = load('src/lib/production/action-motion-repair.ts');
const { planActionWindow } = load('renderer/src/media/action-window-contract.ts');
(async () => {
  process.env.FINALFRAME_FRAME_TO_REGION_REPAIR_ENABLED = 'true';
  const c = fixture(),
    hash = 'a'.repeat(64),
    outputHash = 'b'.repeat(64);
  c.rows.get('production').currentVersionId = 'ver';
  c.put('productionVersions', { _id: 'ver', status: 'APPROVED' });
  c.put('scenes', { _id: 'scene', status: 'READY', projectId: 'project' });
  const common = {
    studioExternalId: 'studio-owner',
    projectId: 'project',
    productionId: 'production',
    productionVersionId: 'ver',
  };
  const story = {
    id: 'move',
    subject: 'Character',
    action: 'Complete three movements',
    startSeconds: 4.79,
    endSeconds: 7.25,
    beforeSeconds: 5.751,
  };
  c.put('shots', {
    ...common,
    _id: 'shot',
    sceneId: 'scene',
    durationSeconds: 193 / 24,
    prompt: 'Animation',
    metadata: { storyActions: [story] },
  });
  for (const id of ['original', 'base', 'raw', 'derived', 'unused'])
    c.storageObjects.set(id, {
      sha256: id === 'derived' ? outputHash : hash,
      size: 100,
      contentType: 'video/mp4',
    });
  c.put('assets', {
    ...common,
    _id: 'originalAsset',
    scope: 'PROJECT',
    storageId: 'original',
    checksum: hash,
  });
  c.put('resourceStates', {
    _id: 'approval',
    projectId: 'project',
    resourceType: 'asset',
    resourceId: 'originalAsset',
    state: 'APPROVED',
  });
  c.put('assets', {
    ...common,
    _id: 'baseAsset',
    scope: 'PROJECT',
    storageId: 'base',
    checksum: hash,
    metadata: { generationJobId: 'job' },
  });
  c.put('shotVersions', {
    ...common,
    _id: 'take',
    assetId: 'baseAsset',
    shotId: 'shot',
    versionNumber: 2,
    status: 'COMPLETED',
  });
  const window = planActionWindow([story], {
    width: 864,
    height: 480,
    videoTiming: {
      version: 'DECODED_VIDEO_FRAMES_V1',
      fpsNumerator: 24,
      fpsDenominator: 1,
      firstFrameSeconds: 0,
      frameCount: 193,
    },
  });
  const frameToRegion = assertFrameToRegion({
    version: 'FRAME_TO_REGION_V1',
    region: {
      version: 'ACTION_REGION_V1',
      mode: 'STATIONARY_RECTANGLE',
      window,
      x: 320,
      y: 64,
      width: 256,
      height: 256,
    },
    anchorPreparation: { method: 'LANCZOS', width: 640, height: 640 },
    providerOutput: { width: 640, height: 640, fps: 24, frames: 96 },
    normalization: {
      method: 'UNIFORM_FRAME_SELECTION_LANCZOS',
      targetWidth: 256,
      targetHeight: 256,
      targetFrames: 60,
      targetFps: 24,
    },
  });
  const proof = {
    frameToRegion,
    version: 'FRAME_TO_REGION_V1',
    phase: 'COMPOSED',
    providerInputFrames: 97,
    trimmedTrailingFrames: 1,
    providerInputWidth: 640,
    providerInputHeight: 640,
    providerInputFps: 24,
    normalizedFrames: 60,
    normalizedWidth: 256,
    normalizedHeight: 256,
    selectedProviderFrames: frameSelection(frameToRegion),
    outputFrames: 193,
    width: 864,
    height: 480,
    fps: 24,
    originalAudioCopied: true,
    checksum: hash,
    byteSize: 100,
  };
  const source = {
    assetId: 'originalAsset',
    storageId: 'original',
    width: 864,
    height: 480,
    checksum: hash,
    byteSize: 100,
    hasAudio: true,
  };
  const response = {
    assetId: 'baseAsset',
    actionWindowRaw: { storageId: 'raw', checksum: hash, byteSize: 100 },
    actionWindowComposed: { storageId: 'base', checksum: hash, byteSize: 100, proof },
  };
  c.put('generationJobs', {
    ...common,
    _id: 'job',
    status: 'COMPLETED',
    shotId: 'shot',
    shotVersionId: 'take',
    request: {
      operation: 'FRAME_TO_VIDEO',
      storyRepairMode: 'ANIMATE_MOTION',
      storyRepair: { approachVersion: ACTION_MOTION_REPAIR_VERSION, frameToRegion, source },
    },
    response,
  });
  const rec = await c.call('storyActionReviews', 'get', { takeId: 'take' });
  assert.equal(await c.call('repairTiming', 'option', { takeId: 'take' }), null);
  await c.call('storyActionReviews', 'record', {
    takeId: 'take',
    requirementKey: rec.requirementKey,
    observations: [
      {
        actionId: 'move',
        result: 'FAIL',
        observedStartSeconds: null,
        observedEndSeconds: null,
        evidence: 'The third movement is after the deadline.',
      },
    ],
  });
  const option = await c.call('repairTiming', 'option', { takeId: 'take' });
  assert.equal(option.choices.length, 1);
  const args = { takeId: 'take', reviewId: option.reviewId, actionId: 'move', providerFrame: 70 };
  const prepared = await c.call('repairTiming', 'prepare', args);
  assert.deepEqual(prepared.timing, { providerFrame: 70, targetFrame: 23 });
  await assert.rejects(c.call('repairTiming', 'prepare', { ...args, reviewId: 'stale' }));
  await assert.rejects(c.call('repairTiming', 'prepare', { ...args, providerFrame: 10 }));
  c.denied = true;
  await assert.rejects(c.call('repairTiming', 'prepare', args));
  delete c.denied;
  c.rows.get('originalAsset').rights = { status: 'REVOKED' };
  await assert.rejects(c.call('repairTiming', 'prepare', args));
  delete c.rows.get('originalAsset').rights;
  c.rows.get('job').projectId = 'different';
  assert.equal(await c.call('repairTiming', 'option', { takeId: 'take' }), null);
  c.rows.get('job').projectId = 'project';
  const fitted = {
    ...proof,
    checksum: outputHash,
    actionTiming: prepared.timing,
    selectedProviderFrames: timedFrameSelection(frameToRegion, prepared.timing),
  };
  await assert.rejects(
    c.call('repairTiming', 'adopt', {
      ...args,
      storageId: 'derived',
      proof: { ...fitted, originalAudioCopied: false },
    }),
  );
  const id = await c.call('repairTiming', 'adopt', { ...args, storageId: 'derived', proof: fitted });
  assert.equal(
    await c.call('repairTiming', 'adopt', { ...args, storageId: 'unused', proof: fitted }),
    id,
  );
  assert.deepEqual(await c.call('repairTiming', 'prepare', args), { takeId: id });
  assert.equal(c.count('generationJobs'), 1);
  assert.equal(c.count('shotVersions'), 2);
  assert.equal(c.rows.get('take').assetId, 'baseAsset');
  assert.equal(c.rows.get(id).actualCost, 0);
  assert.equal(c.rows.get(id).versionNumber, 3);
  assert.equal((await c.call('storyActionReviews', 'get', { takeId: id })).passed, false);
  c.storage.delete = async (id) => c.storageObjects.delete(id);
  await c.call('repairTiming', 'cleanup', { storageId: 'derived' });
  assert(c.storageObjects.has('derived'));
  await c.call('repairTiming', 'cleanup', { storageId: 'unused' });
  assert(!c.storageObjects.has('unused'));
  console.log(
    'PASS exact current failed review, denied/foreign/revoked inputs, bounded timing and immutable base, fresh unapproved take, once-only adoption and no provider job',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
