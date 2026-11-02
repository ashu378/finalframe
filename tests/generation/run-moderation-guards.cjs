const assert = require('node:assert/strict');
const h = require('./run-operation-controls.cjs');
(async () => {
  const restricted = h.backendFixture({ operation: 'GENERATE', audioPolicy: 'SILENT' });
  restricted.rows.get('project').moderationStatus = 'RESTRICTED';
  await assert.rejects(restricted.create(), /restricted/); assert.equal(restricted.writes.length, 0);
  await assert.rejects(restricted.jobs.createPreparation.handler(restricted.ctx, { productionId: 'production' }), /restricted/); assert.equal(restricted.writes.length, 0);

  for (const operation of ['SHOT_GENERATION', 'PREPARATION']) {
    const queued = h.backendFixture({ operation: 'GENERATE', audioPolicy: 'SILENT' });
    const result = await queued.create();
    queued.rows.get(result._id).operation = operation;
    queued.rows.get('project').moderationStatus = 'RESTRICTED';
    const before = queued.writes.length;
    await assert.rejects(queued.fence(result._id), /restricted/);
    assert.equal(queued.rows.get(result._id).submissionStartedAt, undefined); assert.equal(queued.writes.length, before);
  }

  const accepted = h.backendFixture({ operation: 'GENERATE', audioPolicy: 'SILENT' });
  const result = await accepted.create();
  const job = accepted.rows.get(result._id);
  Object.assign(job, { providerJobId: 'accepted-provider-job', providerRequestId: 'saved-provider-receipt', providerCostUsd: .025, submissionStartedAt: 1, response: { usage: { cost: .025 } } });
  accepted.rows.get('project').moderationStatus = 'RESTRICTED';
  assert.deepEqual(await accepted.fence(result._id), { allowed: false });
  const input = await accepted.jobs.getWorkerInput.handler(accepted.ctx, { jobId: result._id, leaseId: 'lease' });
  assert.equal(input.job.providerJobId, 'accepted-provider-job', 'accepted work may continue polling and output ingestion');
  assert.equal(input.job.providerRequestId, 'saved-provider-receipt');
  await accepted.jobs.poll.handler(accepted.ctx, { jobId: result._id, leaseId: 'lease', done: false });
  assert.equal(accepted.rows.get(result._id).providerCostUsd, .025);
  assert.equal(accepted.rows.get(result._id).providerJobId, 'accepted-provider-job');
  assert.equal(accepted.rows.get(result._id).providerRequestId, 'saved-provider-receipt');
  console.log('PASS project moderation: restricted generation/preparation blocked before writes, queued submission fences deny both modalities, accepted polling/receipts preserved without another submission. Actual handlers with isolated in-memory seams; no database/provider calls.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(h.cleanup);
