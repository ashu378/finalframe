import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../../scripts/dev-fixture/client.mjs';

// Fail closed before invoking an execution action. This test is specifically
// for a paused development deployment; it never enables or configures spend.
const exec = promisify(execFile);
let flag = '';
try { flag = (await exec(process.execPath, ['node_modules/convex/bin/main.js', 'env', 'get', 'FINALFRAME_PAID_TEST_RUN'])).stdout.trim(); }
catch (error) { if (!/not set|not found|does not exist/i.test(String(error.stderr))) throw new Error('Cannot verify paid testing is disabled; no execution action was called.'); }
assert.equal(flag, '', 'Refusing execution guard tests while a paid run is configured.');
const { client } = await createAuthenticatedClient();
const fixtureKey = process.env.FINALFRAME_DEV_FIXTURE_KEY;
assert(fixtureKey);
const marker = `finalframe-text-guard-${randomUUID()}`;
const project = await client.mutation(api.devFixtures.ensureProject, { fixtureKey, externalId: marker, name: 'FinalFrame text guard verification' });
const args = { projectId: project.projectId, capability: 'STRUCTURED_PLANNING', messages: [{ role: 'user', content: 'No-cost access verification; do not generate a plan.' }] };
try {
  const unauthenticated = new ConvexHttpClient(client.url);
  await assert.rejects(unauthenticated.action(api.providerText.execute, args), /authenticat|sign|identity/i);
  await assert.rejects(client.action(api.providerText.execute, args), /PAID_PLANNING_DISABLED/);
  await assert.rejects(client.action(api.providerText.execute, args), /PAID_PLANNING_DISABLED/);
  await assert.rejects(client.mutation(api.providerTextRequests.reserve, { projectId: project.projectId, requestKey: marker, capability: 'AI_BRAIN', model: 'forged/model', estimatedCostUsd: .000001 }), /public function|not found/i);
  const workspace = await client.query(api.productions.getWorkspaceByProject, { projectExternalId: project.externalId });
  assert.equal(workspace.production, null);
  console.log(JSON.stringify({ onlineConvex: true, checks: ['anonymous text submission denied', 'paused paid budget blocks planning', 'duplicate blocked submission remains blocked', 'browser cannot set model or price through internal reservation', 'blocked planning did not create a production'], paidProviderCalls: 0 }, null, 2));
} finally { await client.mutation(api.projects.softDelete, { projectId: project.projectId }); }
