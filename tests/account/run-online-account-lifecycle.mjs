import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { onlineAccountConfiguration } from './online-account-config.mjs';

// No simulated subjects, fixture endpoints, provider actions, auth delivery or
// bootstrap grants. The coordinator runs this only after deploying B03.
const config = onlineAccountConfiguration(process.env);
const marker = `FinalFrame B03 fixture ${config.runId}`;
const secrets = new Set([config.fixtureEmail, config.fixturePassword, config.adminEmail, config.adminPassword]);
const redact = (error) => {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) if (secret) message = message.replaceAll(secret, '[redacted]');
  return message.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-token]');
};
const ref = (name) => makeFunctionReference(name);
const query = (client, name, args = {}) => client.query(ref(name), args);
const mutate = (client, name, args = {}) => client.mutation(ref(name), args);
const action = (client, name, args = {}) => client.action(ref(name), args);
const authenticatedClients = new Set();
async function signOut(client) { await action(client, 'auth:signOut'); authenticatedClients.delete(client); }
let adminClient; let fixtureClient; let adminUserId; let fixtureUserId; let signupConfirmed = false; let checks = 0;
let state = { version: 1, runId: config.runId, url: config.url, fixtureEmail: config.fixtureEmail, signupConfirmed: false, fixtureUserId: null, studioExternalId: null, projectIds: [], exportRequestId: null, plannedDeactivation: null, lastDeactivationRequestId: null, cleanupVerified: false };
async function saveState() { await writeFile(config.stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); await chmod(config.stateFile, 0o600); }
function pass(label) { checks++; console.log(`PASS ${label}`); }
async function denied(operation, pattern) {
  let failure;
  try { await operation(); } catch (error) { failure = error; }
  assert(failure, 'Expected authorization/lifecycle denial, but the operation succeeded.');
  assert.match(redact(failure), pattern, 'Only a specific backend denial counts; transport failures do not pass.');
}
function verifyEmailDeliveryDisabled() {
  let value;
  try {
    // Environment read only, pinned to exactly the same cloud host as the bearer
    // clients. No key or environment value is printed, set or removed.
    value = execFileSync(process.execPath, ['node_modules/convex/bin/main.js', 'env', 'get', 'CONVEX_AUTH_EMAIL_ENABLED', '--deployment', config.deployment], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 }).trim();
  } catch { throw new Error('Unable to verify that remote authentication email delivery is disabled; no sign-up was attempted.'); }
  assert(value === '' || value === 'false', 'Remote authentication email delivery must be disabled before account tests.');
}
async function signIn(email, password, flow = 'signIn') {
  const client = new ConvexHttpClient(config.url, { logger: false });
  const result = await action(client, 'auth:signIn', { provider: 'password', params: { flow, email, password, ...(flow === 'signUp' ? { name: marker } : {}) } });
  for (const value of Object.values(result?.tokens || {})) if (typeof value === 'string') secrets.add(value);
  const token = result?.tokens?.token || result?.token; if (typeof token === 'string') secrets.add(token);
  assert(token, 'Actual Convex Auth must return a bearer token; verification/email flows are not part of this test.');
  client.setAuth(token); authenticatedClients.add(client); return client;
}
async function verifyFixture(client = fixtureClient) {
  assert(signupConfirmed && client === fixtureClient, 'Only this run’s confirmed fresh fixture client can be changed.');
  const profile = await query(client, 'accountLifecycle:profile', { now: Date.now() });
  assert(profile.email.toLowerCase() === config.fixtureEmail, 'The authenticated user must match the exact dedicated fixture email.');
  assert(profile.userId && profile.userId !== adminUserId, 'Never target the administrator account.');
  if (fixtureUserId) assert.equal(profile.userId, fixtureUserId); else { fixtureUserId = profile.userId; state.fixtureUserId = fixtureUserId; await saveState(); }
  assert.equal(await query(client, 'platformAdministration:currentRole'), null, 'A disposable account must not hold any platform grant.');
  return profile;
}
async function pendingFixtureRequest() {
  assert(fixtureUserId && fixtureUserId !== adminUserId);
  let cursor; let found = null; const seen = new Set();
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await query(adminClient, 'accountLifecycle:deactivationRequests', cursor ? { cursor } : {});
    assert(page.requests.length <= 25);
    for (const row of page.requests) if (row.userId === fixtureUserId) {
      assert(row.email.toLowerCase() === config.fixtureEmail, 'A recovery target must match the exact fixture email.'); assert(row.reason.startsWith(`${marker} · `));
      assert(!found, 'Refuse ambiguous multiple pending fixture requests.'); found = row;
    }
    if (page.isDone) return found;
    assert(page.continueCursor && !seen.has(page.continueCursor), 'Pending-request discovery must make explicit progress.'); seen.add(page.continueCursor); cursor = page.continueCursor;
  }
  throw new Error('Pending-request discovery exceeded 100 bounded pages; cleanup is incomplete and requires coordinator review.');
}
async function recoverFixtureIfPending(reason) {
  const pending = await pendingFixtureRequest();
  if (!pending) return null;
  // Both exact canonical user and the marker email/reason were verified above.
  const result = await mutate(adminClient, 'accountLifecycle:recoverAccount', { requestId: pending.requestId, reason });
  assert.equal(result.requestId, pending.requestId); return result;
}
async function discoverOwnProjects() {
  const projects = new Map();
  for (const mode of ['active', 'archived', 'deleted']) {
    let cursor; const seen = new Set(); let complete = false;
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      const page = await query(fixtureClient, 'projects:library', { studioExternalId: state.studioExternalId, mode, search: config.runId, limit: 10, ...(cursor ? { cursor } : {}) });
      for (const row of page.page) {
        assert(row.name.startsWith(`${marker} project `) && row.role === 'OWNER');
        const project = await query(fixtureClient, 'projects:getByExternalId', { externalId: row.externalId, includeInactive: true });
        assert(project && project._id === row.id && project.ownerUserId === fixtureUserId && project.createdByUserId === fixtureUserId && project.studioExternalId === state.studioExternalId);
        assert(project.name.startsWith(`${marker} project `)); projects.set(project._id, project);
      }
      if (page.isDone) { complete = true; break; }
      assert(page.continueCursor && !seen.has(page.continueCursor), 'Project discovery must make explicit progress.'); seen.add(page.continueCursor); cursor = page.continueCursor;
    }
    assert(complete, 'Project discovery exceeded 100 bounded pages; no partial scan counts as cleanup.');
  }
  return projects;
}
async function deactivateFixture(suffix) {
  await verifyFixture();
  const safety = await query(fixtureClient, 'accountLifecycle:deactivationPreflight');
  assert.equal(safety.allowed, true, 'Fixture-only ownership checks must complete; never bypass a blocker.');
  const args = { requestId: `${config.runId.replaceAll('-', '')}-${suffix}`, reason: `${marker} · ${suffix}; retain all fixture records.`, confirmation: 'DEACTIVATE' };
  state.plannedDeactivation = args; await saveState(); // Safe request ID/reason only, no credential/session material.
  const result = await mutate(fixtureClient, 'accountLifecycle:requestDeactivation', args);
  state.lastDeactivationRequestId = result.requestId; await saveState(); return { result, args };
}
async function cleanup() {
  if (!signupConfirmed) return;
  if (!fixtureUserId) await verifyFixture(); // Only a confirmed fresh sign-up can reach this path.
  await recoverFixtureIfPending(`${marker} · recover only to finish isolated cleanup`);
  // Actual sign-in is required after process recovery; no disabled-user bypass.
  fixtureClient = await signIn(config.fixtureEmail, config.fixturePassword); await verifyFixture();
  if (!state.studioExternalId) { const account = await mutate(fixtureClient, 'account:ensureAccount', { name: marker }); assert.equal(account.userId, fixtureUserId); state.studioExternalId = account.studioExternalId; await saveState(); }
  const projects = await discoverOwnProjects();
  for (const project of projects.values()) {
    if (project.status !== 'DELETED') await mutate(fixtureClient, 'projects:softDelete', { projectId: project._id });
    const retained = await query(fixtureClient, 'projects:getByExternalId', { externalId: project.externalId, includeInactive: true });
    assert(retained && retained._id === project._id && retained.status === 'DELETED' && retained.deletedAt && retained.ownerUserId === fixtureUserId && retained.name === project.name);
  }
  for (const id of state.projectIds) assert(projects.has(id), 'A confirmed test project must be found and retained during cleanup.');
  const profile = await verifyFixture();
  if (profile.latestExport && profile.latestExport.status !== 'CANCELED') await mutate(fixtureClient, 'accountLifecycle:cancelExport', { requestId: profile.latestExport.requestId });
  // A cleanup rerun may first recover a prior pending cleanup request. Use a
  // new non-secret operation UUID so a CANCELED request cannot be replayed as a
  // fresh deactivation. Credentials are supplied; none are generated here.
  const final = await deactivateFixture(`cleanup-${randomUUID()}`);
  assert.equal(await query(fixtureClient, 'auth:currentUser'), null);
  await denied(() => query(fixtureClient, 'account:current'), /disabled/i);
  const pending = await pendingFixtureRequest(); assert(pending && pending.requestId === final.result.requestId);
  assert.equal((await query(adminClient, 'platformAdministration:currentRole')).role, 'ADMIN');
  state.cleanupVerified = true; state.retainedProjectCount = projects.size; await saveState();
  pass('cleanup retains exact own projects, closes index, leaves only the dedicated fixture deactivated and verifies ADMIN remains enabled');
}

let failure;
try {
  verifyEmailDeliveryDisabled();
  adminClient = await signIn(config.adminEmail, config.adminPassword);
  const admin = await query(adminClient, 'platformAdministration:currentRole');
  const adminIdentity = await query(adminClient, 'auth:currentUser');
  assert(admin?.role === 'ADMIN' && adminIdentity?.id === admin.userId && adminIdentity.email.toLowerCase() === config.adminEmail);
  if (config.expectedAdminUserId) assert.equal(admin.userId, config.expectedAdminUserId);
  adminUserId = admin.userId;
  // Verify the deployed recovery surface before creating any fixture account.
  await query(adminClient, 'accountLifecycle:deactivationRequests', {});
  if (config.cleanupOnly) {
    state = JSON.parse(await readFile(config.stateFile, 'utf8'));
    assert(state.version === 1 && state.runId === config.runId && state.url === config.url && state.fixtureEmail === config.fixtureEmail && state.signupConfirmed && state.fixtureUserId && state.fixtureUserId !== adminUserId);
    fixtureUserId = state.fixtureUserId; signupConfirmed = true;
  } else {
    // Exclusive state creation prevents accidental rerun of an existing run.
    await writeFile(config.stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(`B03 actual-Auth fixture run: ${config.runId}`);
    fixtureClient = await signIn(config.fixtureEmail, config.fixturePassword, 'signUp');
    signupConfirmed = true; state.signupConfirmed = true; await saveState();
    const fresh = await verifyFixture(); assert.equal(fresh.latestExport, null);
    await signOut(fixtureClient);
    fixtureClient = await signIn(config.fixtureEmail, config.fixturePassword); await verifyFixture();
    const account = await mutate(fixtureClient, 'account:ensureAccount', { name: marker });
    assert.equal(account.userId, fixtureUserId); assert(account.studioExternalId); state.studioExternalId = account.studioExternalId; await saveState();
    pass('fresh dedicated fixture uses actual Convex Auth sign-up/sign-in and canonical account provisioning');
    const anonymous = new ConvexHttpClient(config.url, { logger: false });
    await denied(() => query(anonymous, 'accountLifecycle:profile', { now: Date.now() }), /verified Convex identity|UNAUTHENTICATED/i);
    const displayName = `${marker} display`;
    await mutate(fixtureClient, 'accountLifecycle:updateProfile', { displayName });
    assert.equal((await verifyFixture()).displayName, displayName);
    assert.equal((await query(fixtureClient, 'account:current')).user.email.toLowerCase(), config.fixtureEmail);
    pass('profile edits apply only to the authenticated fixture and anonymous reads are denied');
    for (let number = 0; number < 6; number++) {
      const project = await mutate(fixtureClient, 'projects:create', { name: `${marker} project ${number}`, description: 'Fixture permission/index test only; no media, planning, generation or render.', contentType: 'fixture' });
      state.projectIds.push(project.projectId); await saveState();
    }
    assert.equal((await discoverOwnProjects()).size, 6);
    const request = await mutate(fixtureClient, 'accountLifecycle:startExport', { requestId: `index-${config.runId}` });
    state.exportRequestId = request.requestId; await saveState();
    assert.equal((await mutate(fixtureClient, 'accountLifecycle:startExport', { requestId: `index-${config.runId}` })).requestId, request.requestId);
    const parts = []; const records = []; let payloadBytes = 0;
    for (let ordinal = 0; ordinal < 100; ordinal++) {
      const part = await mutate(fixtureClient, 'accountLifecycle:exportPart', { requestId: request.requestId, ordinal });
      assert.equal(part.ordinal, ordinal); assert(Buffer.byteLength(part.content) < 128 * 1024);
      const newline = part.content.indexOf('\n'); assert(newline >= 0); const header = JSON.parse(part.content.slice(0, newline)); const payload = part.content.slice(newline + 1);
      assert.equal(header.requestId, request.requestId); assert.equal(header.ordinal, ordinal); assert.equal(header.payloadBytes, Buffer.byteLength(payload)); assert.equal(header.payloadSha256, createHash('sha256').update(payload).digest('hex'));
      payloadBytes += Buffer.byteLength(payload); assert(payloadBytes < 2 * 1024 * 1024, 'Unexpectedly large fresh-fixture index; do not silently truncate.');
      for (const line of payload.split('\n').filter(Boolean)) { const row = JSON.parse(line); assert.equal(row.type, 'record', 'This fixture creates only small canonical records; fragmentation is separately tested offline.'); records.push(row); }
      parts.push({ content: part.content, isDone: part.isDone }); if (part.isDone) break;
    }
    assert(parts.at(-1)?.isDone && parts.length > 9, 'Six project memberships must exercise native continuation, not only section boundaries.');
    const projectRows = records.filter((row) => row.section === 'projects').map((row) => row.record);
    assert.deepEqual(projectRows.map((row) => row.projectId).sort(), [...state.projectIds].sort()); assert(projectRows.every((row) => row.yourRole === 'OWNER'));
    const replay = await mutate(fixtureClient, 'accountLifecycle:exportPart', { requestId: request.requestId, ordinal: 0 }); assert.equal(replay.replayed, true); assert.equal(replay.content, parts[0].content);
    const manifest = await mutate(fixtureClient, 'accountLifecycle:exportManifest', { requestId: request.requestId }); assert.equal(manifest.title, 'Account and project index'); assert.equal(manifest.pageCount, parts.length); assert.equal(manifest.recordCount, records.length);
    const status = await query(fixtureClient, 'accountLifecycle:exportStatus', { requestId: request.requestId, now: Date.now() }); assert.equal(status.status, 'COMPLETED'); assert.equal(status.nextOrdinal, parts.length);
    await denied(() => mutate(adminClient, 'accountLifecycle:exportPart', { requestId: request.requestId, ordinal: 0 }), /account-index request is unavailable/i);
    pass('serialized index pagination completes all own projects, verifies hashes/manifest, safely replays and denies cross-account ADMIN export access');
    const deactivation = await deactivateFixture('deactivation-test');
    assert.equal((await mutate(fixtureClient, 'accountLifecycle:requestDeactivation', deactivation.args)).replayed, true);
    assert.equal(await query(fixtureClient, 'auth:currentUser'), null);
    await denied(() => query(fixtureClient, 'account:current'), /disabled/i);
    await denied(() => query(fixtureClient, 'accountLifecycle:profile', { now: Date.now() }), /disabled/i);
    await denied(() => mutate(fixtureClient, 'account:ensureAccount'), /disabled/i);
    await denied(() => query(fixtureClient, 'projects:get', { projectId: state.projectIds[0] }), /disabled/i);
    await denied(() => signIn(config.fixtureEmail, config.fixturePassword), /disabled/i);
    await denied(() => mutate(adminClient, 'platformAdministration:setUserStatus', { userId: fixtureUserId, status: 'active', reason: `${marker} must use dedicated recovery`, requestId: `bypass-${config.runId}` }), /dedicated recovery workflow/i);
    pass('retained-data deactivation/replay disables actual Auth reads, re-sign-in and ensureAccount; generic ADMIN enable cannot bypass recovery');
    const pending = await pendingFixtureRequest(); assert(pending && pending.requestId === deactivation.result.requestId);
    const recoveryArgs = { requestId: pending.requestId, reason: `${marker} · owner ADMIN reviewed isolated recovery test` };
    assert.equal((await mutate(adminClient, 'accountLifecycle:recoverAccount', recoveryArgs)).replayed, false);
    assert.equal((await mutate(adminClient, 'accountLifecycle:recoverAccount', recoveryArgs)).replayed, true);
    fixtureClient = await signIn(config.fixtureEmail, config.fixturePassword); await verifyFixture(); assert.equal((await discoverOwnProjects()).size, 6);
    pass('actual owner ADMIN cancels only the exact fixture request with reason, audited idempotent recovery restores real fixture sign-in and retained projects');
  }
} catch (error) { failure = new Error(redact(error)); }
finally {
  try { if (signupConfirmed) await cleanup(); }
  catch (error) { failure = new Error(`${failure ? `${failure.message}\n` : ''}Fixture cleanup requires coordinator attention for run ${config.runId}: ${redact(error)}`); }
  for (const client of [...authenticatedClients]) {
    try { await signOut(client); }
    catch (error) { failure = new Error(`${failure ? `${failure.message}\n` : ''}Test-session sign-out was not confirmed: ${redact(error)}`); }
  }
}
if (failure) throw failure;
console.log(JSON.stringify({ onlineConvex: true, actualConvexAuth: true, simulatedCliIdentities: false, checks, runId: config.runId, cleanupVerified: state.cleanupVerified, retainedProjects: state.retainedProjectCount, administratorDeactivated: false, paidProviderCalls: 0, renderSubmissions: 0, emailDeliveryCalls: 0 }));
