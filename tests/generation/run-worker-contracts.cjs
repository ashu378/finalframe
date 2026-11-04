const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-worker-policy-'));
const source = fs.readFileSync(path.join(root, 'convex/generationWorkerContracts.ts'), 'utf8');
const file = path.join(temp, 'policy.cjs');
fs.writeFileSync(file, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
const policy = require(file);
let checked = 0;
function check(name, fn) { fn(); checked += 1; console.log(`PASS ${name}`); }
try {
  check('video budget holds cover small charges above a catalog-only quote', () => {
    // Observed live Seedance receipt: $0.3024945 on a $0.3024 video quote.
    assert(policy.videoBudgetReservationUsd(0.3024) >= 0.3024945);
    assert(policy.videoBudgetReservationUsd(0.12) > 0.12);
    for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() => policy.videoBudgetReservationUsd(invalid));
  });
  check('a live worker lease cannot be claimed twice', () => {
    assert.equal(policy.canClaim({ status: 'QUEUED' }, 100), true);
    assert.equal(policy.canClaim({ status: 'PROCESSING', leaseExpiresAt: 101 }, 100), false);
    assert.equal(policy.canClaim({ status: 'PROCESSING', leaseExpiresAt: 100 }, 100), true);
    for (const status of ['COMPLETED', 'FAILED', 'CANCELED']) assert.equal(policy.canClaim({ status }, 100), false);
  });
  check('accepted jobs recover polling rather than paid submission', () => {
    assert.equal(policy.recoveryStage({ providerJobId: 'provider-accepted', submissionStartedAt: 1 }), 'POLL');
    assert.equal(policy.recoveryStage({ submissionStartedAt: 1 }), 'RECONCILIATION_REQUIRED');
    assert.equal(policy.recoveryStage({}), 'SUBMIT');
    assert.equal(policy.canClaim({ status: 'PROCESSING', executionStage: 'RECONCILIATION_REQUIRED' }, 100), false);
  });
  check('retry backoff survives scheduler wakeups', () => {
    assert.equal(policy.canClaim({ status: 'RETRYING', nextAttemptAt: 200 }, 100), false);
    assert.equal(policy.canClaim({ status: 'RETRYING', nextAttemptAt: 200 }, 200), true);
    assert.equal(policy.canClaim({ status: 'PENDING', nextPollAt: 200 }, 100), false);
    assert.equal(policy.canClaim({ status: 'PENDING', nextPollAt: 200 }, 200), true);
  });
  check('public job projection omits private requests, leases, URLs and raw provider errors', () => {
    const result = policy.publicJob({ _id: 'job', shotId: 'shot', status: 'FAILED', leaseId: 'secret-lease', requestHash: 'private-hash', providerBudgetReservationId: 'private-budget', errorCode: 'UNKNOWN_PROVIDER', errorMessage: 'Bearer private-key stacktrace', response: { unsigned_urls: ['https://private'], assetId: 'asset' }, request: { prompt: 'private prompt', apiKey: 'private key', referenceUrls: ['https://private'], videoType: 'CINEMATIC_FILM', routeReason: 'Reviewed route' } });
    assert.equal(result.assetId, 'asset');
    assert.equal(result._id, 'job');
    assert.equal(result.request.videoType, 'CINEMATIC_FILM');
    for (const secret of ['private-key', 'private prompt', 'https://private', 'secret-lease', 'private-hash', 'private-budget']) assert.ok(!JSON.stringify(result).includes(secret));
  });
  check('a completed job from an earlier revision does not surface its old transient probe failure', () => {
    const result = policy.publicJob({ _id: 'job', status: 'COMPLETED', errorCode: 'MEDIA_PROBE_UNAVAILABLE', response: { assetId: 'asset' } });
    assert.equal(result.assetId, 'asset');
    assert.equal(result.errorCode, undefined);
    assert.equal(result.errorMessage, undefined);
  });
  check('a saved take distinguishes a busy probe, a scheduled recheck and a paused check', () => {
    const job = { _id: 'job', providerJobId: 'accepted', response: { assetId: 'asset' } };
    const busy = policy.publicJob({ ...job, status: 'RETRYING', errorCode: 'MEDIA_PROBE_BUSY' });
    assert.equal(busy.assetId, 'asset');
    assert.equal(busy.providerJobId, 'accepted');
    assert.match(busy.errorMessage, /check it when the renderer is free/);
    assert.match(policy.publicJob({ ...job, status: 'PENDING', errorCode: 'MEDIA_PROBE_UNAVAILABLE' }).errorMessage, /retry its technical checks/);
    assert.match(policy.publicJob({ ...job, status: 'FAILED', errorCode: 'MEDIA_PROBE_BUSY' }).errorMessage, /Resume this saved take/);
    assert.match(policy.publicJob({ _id: 'rejected', status: 'FAILED', errorCode: 'INVALID_REQUEST' }).errorMessage, /Review the inputs/);
  });
  check('technical media checks reject missing streams and wrong duration, aspect or audio', () => {
    const valid = { durationSeconds: 5, width: 1280, height: 720, videoCodec: 'h264', hasAudio: true, audioCodec: 'aac' };
    assert.equal(policy.validateMediaProbe(valid, { duration: 5, ratio: '16:9', resolution: '720p', requiresAudio: true }).hasAudio, true);
    assert.throws(() => policy.validateMediaProbe(valid, { duration: 5, ratio: '16:9', resolution: '1080p' }), /MEDIA_VALIDATION_FAILED/);
    for (const probe of [{ ...valid, videoCodec: '' }, { ...valid, durationSeconds: 0 }, { ...valid, durationSeconds: 12 }, { ...valid, width: 720, height: 1280 }, { ...valid, hasAudio: false }]) assert.throws(() => policy.validateMediaProbe(probe, { duration: 5, ratio: '16:9', requiresAudio: true }), /MEDIA_VALIDATION_FAILED/);
  });
  check('worker authority is internal and reservations precede scheduled work', () => {
    const jobs = fs.readFileSync(path.join(root, 'convex/generationJobs.ts'), 'utf8');
    const worker = fs.readFileSync(path.join(root, 'convex/generationWorker.ts'), 'utf8');
    for (const name of ['claim', 'fenceSubmission', 'submit', 'poll', 'recordOutput', 'succeed', 'fail']) assert.match(jobs, new RegExp(`export const ${name} = internalMutation\\(`));
    assert.match(jobs, /reserveGenerationCreditsInTransaction/);
    assert.match(jobs, /reserveProviderBudget/);
    assert.match(jobs, /validateReviewedVideoJob/);
    assert.match(worker, /downloadVideo\(providerJobId/);
    assert.doesNotMatch(worker, /fetch\(.*unsigned_url/);
    assert.match(worker, /maxRetries: 0, fallbackModels: \[\], idempotencyKey: job.idempotencyKey/);
    assert.match(worker, /generateVideo\(videoRequest, \{ \.\.\.options, beforeMediaSubmit: async/);
    assert.match(worker, /const rejected = !submissionAttempted/);
    assert.match(worker, /redirect: 'error',\s*signal: AbortSignal\.timeout\(45_000\),\s*\}\)\.catch\(\(\) => \{ throw unavailable\(\); \}\)/);
    assert.match(worker, /probeResponse\.status === 429 \? 'MEDIA_PROBE_BUSY' : 'MEDIA_PROBE_UNAVAILABLE'/);
    const fence = jobs.slice(jobs.indexOf('export const fenceSubmission'), jobs.indexOf('export const submit'));
    assert.match(fence, /validateReviewedVideoJob/);
    assert.match(fence, /estimatedMicros > reserved.estimatedMicros/);
    assert.ok(fence.indexOf('validateReviewedVideoJob') < fence.indexOf('submissionStartedAt: Date.now()'));
    assert.match(jobs, /visualApproval: 'REQUIRES_HUMAN_REVIEW'/);
  });
  check('browser only queues and observes persisted progress', () => {
    const actions = fs.readFileSync(path.join(root, 'src/lib/generation/actions.ts'), 'utf8');
    const panel = fs.readFileSync(path.join(root, 'src/components/production/generation/generation-panel.tsx'), 'utf8');
    assert.doesNotMatch(actions, /executeVideoGeneration|api\.generationJobs\.(claim|submit|succeed|fail)|api\.credits\.(reserve|finalize)/);
    assert.match(panel, /useQuery\(api\.generationJobs\.list/);
    assert.doesNotMatch(panel, /setInterval|active\.progress \+|fetch\(`\/api\/generation/);
    const button = fs.readFileSync(path.join(root, 'src/components/production/generate-shot-button.tsx'), 'utf8');
    assert.match(panel, /<GenerateShotButton/);
    assert.match(button, /requestId.current \?\?= crypto.randomUUID\(\)/);
    assert.match(actions, /api\.generationJobs\.previewShotEstimate/);
    assert.match(actions, /api\.generationJobs\.createReviewedTake/);
  });
  console.log(`Worker policy/contract checks: PASS (${checked}); no database process or provider request started.`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
