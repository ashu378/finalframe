import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../../scripts/dev-fixture/client.mjs';
const { client } = await createAuthenticatedClient();
const marker = `finalframe-stock-voice-test-${randomUUID()}`;
const projects = []; const checks = [];
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
async function denied(operation, pattern) { await assert.rejects(operation, pattern); }
try {
  for (const suffix of ['one', 'two']) projects.push((await client.mutation(api.projects.create, { name: `${marker}-${suffix}`, projectType: 'STOCK_VOICE_TEST' })).projectId);
  const [projectId, otherProjectId] = projects;
  const catalog = await client.action(api.stockVoices.catalog, { projectId });
  assert(catalog.choices.length > 0); assert(catalog.choices.every(choice => /^[a-f0-9]{64}$/.test(choice.selectionKey)));
  assert(!JSON.stringify(catalog).includes('providerVoiceId'));
  pass('authenticated live catalog exposes verified opaque stock selections only');
  await denied(() => client.action(api.stockVoices.select, { projectId, name: 'Invalid choice', selectionKey: 'made-up-browser-voice', idempotencyKey: `${marker}:invalid` }), /current verified catalog/);
  assert.equal((await client.query(api.voices.list, { projectId })).length, 0);
  pass('invalid browser voice selection creates no profile');
  const args = { projectId, name: 'Test stock narrator', selectionKey: catalog.choices[0].selectionKey, idempotencyKey: `${marker}:create` };
  const created = await client.action(api.stockVoices.select, args);
  assert.equal(created.status, 'READY');
  assert.equal((await client.query(api.resourceStates.get, { projectId, resourceType: 'voice', resourceId: created.voiceId })).state, 'DRAFT');
  assert.equal((await client.query(api.voices.readiness, { projectId, voiceId: created.voiceId })).ready, false);
  pass('stock binding is project-owned and ready but requires explicit approval');
  const replay = await client.action(api.stockVoices.select, args);
  assert.equal(replay.voiceId, created.voiceId); assert.equal(replay.replayed, true);
  assert.equal((await client.query(api.voices.list, { projectId })).length, 1);
  pass('stock selection replay does not duplicate profiles');
  const view = await client.query(api.voices.get, { projectId, voiceId: created.voiceId });
  assert(!('providerVoiceId' in view) && !('providerMetadata' in view) && !('settingsSnapshot' in view));
  pass('private stock binding metadata stays out of project voice projections');
  await denied(() => client.action(api.stockVoices.select, { ...args, projectId: otherProjectId, voiceId: created.voiceId, idempotencyKey: `${marker}:cross-project` }), /does not belong/);
  pass('cross-project stock voice rebinding is denied');
  const resource = { projectId, resourceType: 'voice', resourceId: created.voiceId };
  await client.mutation(api.approvals.submitForReview, resource);
  await client.mutation(api.approvals.approve, resource);
  await client.mutation(api.approvals.lock, resource);
  assert.equal((await client.query(api.voices.readiness, { projectId, voiceId: created.voiceId })).ready, true);
  await denied(() => client.action(api.stockVoices.select, { ...args, voiceId: created.voiceId, name: 'Changed locked stock', idempotencyKey: `${marker}:locked-edit` }), /cannot be edited/);
  pass('approved locked stock voice is synthesis-ready and cannot be rebound');
  const revoked = await client.action(api.stockVoices.select, { ...args, name: 'Revoked stock test', idempotencyKey: `${marker}:revoked-create` });
  const fixtureKey = process.env.FINALFRAME_DEV_FIXTURE_KEY;
  if (!fixtureKey) throw new Error('Private fixture key is required for the revocation guard test.');
  try { await promisify(execFile)('pnpm', ['exec', 'convex', 'run', 'stockVoiceVerification:revokeFixture', JSON.stringify({ fixtureKey, voiceId: revoked.voiceId })], { maxBuffer: 1024 * 1024 }); }
  catch { throw new Error('Private stock fixture revocation failed.'); }
  await denied(() => client.action(api.stockVoices.select, { ...args, voiceId: revoked.voiceId, name: 'Rebound revoked', idempotencyKey: `${marker}:revoked-rebind` }), /Revoked voices cannot be rebound/);
  pass('revoked stock profiles cannot be rebound through catalog selection');
} finally { for (const projectId of projects) await client.mutation(api.projects.softDelete, { projectId }); }
console.log(JSON.stringify({ ok: true, online: true, checks, liveProviderGenerationCalls: 0, note: 'Public catalog GET only; no speech was purchased or generated.' }, null, 2));
