/** Metadata GET plus online ledger verification only. Never submits speech or video. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../../scripts/dev-fixture/client.mjs';
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
const state = JSON.parse(fs.readFileSync('/tmp/finalframe-audio-edit-tests/narration.json', 'utf8'));
const receipt = JSON.parse(fs.readFileSync('/tmp/finalframe-audio-edit-tests/speech-generation-receipt.json', 'utf8')).data;
assert.equal(state.receiptResult.providerRequestId, receipt.id);
function run(name, args) {
  const output = execFileSync(process.execPath, ['node_modules/convex/bin/main.js', 'run', name, JSON.stringify(args)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return output ? JSON.parse(output) : null;
}
const key = 'live-acceptance-20261102';
const { client } = await createAuthenticatedClient();
const before = run('providerBudget:inspect', { key });
run('providerReceipts:reconcile', { jobId: state.receiptJob._id });
let job;
for (let attempt = 0; attempt < 15; attempt++) {
  job = (await client.query(api.generationJobs.get, { jobId: state.receiptJob._id })).job;
  if (job.providerCostUsd !== undefined) break;
  await new Promise(resolve => setTimeout(resolve, 2000));
}
assert.equal(job.providerCostUsd, receipt.total_cost, 'Await asynchronous verified receipt settlement');
const settled = run('providerBudget:inspect', { key });
// Replays of this acceptance driver may already have settled the receipt.
if (before.reservedMicros === Math.ceil(state.receiptJob.estimatedProviderCostUsd * 1e6) + Math.ceil(state.narrationJob.estimatedProviderCostUsd * 1e6)) {
  assert.equal(settled.spentMicros - before.spentMicros, Math.ceil(receipt.total_cost * 1e6));
  assert.equal(before.reservedMicros - settled.reservedMicros, Math.ceil(state.receiptJob.estimatedProviderCostUsd * 1e6));
}
run('providerReceipts:reconcile', { jobId: state.receiptJob._id });
const replay = run('providerBudget:inspect', { key });
assert.equal(replay.spentMicros, settled.spentMicros);
assert.equal(replay.reservedMicros, settled.reservedMicros);
assert.throws(() => run('providerReceipts:record', { jobId: state.receiptJob._id, receiptId: 'wrong-receipt', model: state.receiptResult.model, costUsd: 0 }));
const afterInvalid = run('providerBudget:inspect', { key });
assert.equal(afterInvalid.spentMicros, settled.spentMicros);
assert.equal(afterInvalid.reservedMicros, settled.reservedMicros);
console.log(JSON.stringify({ onlineConvex: true, metadataOnly: true, paidProviderCalls: 0, receiptCostUsd: receipt.total_cost, checks: ['verified receipt settled', 'reconciliation replay does not charge twice', 'wrong receipt rejected without ledger changes'], remainingConservativeHoldUsd: settled.reservedMicros / 1e6 }));
