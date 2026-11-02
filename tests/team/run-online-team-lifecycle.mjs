import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { onlineTeamConfiguration } from './online-team-config.mjs';
const config = onlineTeamConfiguration(process.env);
const marker = `FinalFrame B04 ${config.runId}`;
const secrets = new Set(Object.values(config.actors).flatMap(actor => [actor.email, actor.password]));
const clients = {}; const sessions = new Set(); let checks = 0;
let state = { version: 1, runId: config.runId, url: config.url, actors: Object.fromEntries(Object.entries(config.actors).map(([key, actor]) => [key, { email: actor.email, signupConfirmed: false, userId: null, deactivated: false }])), sharedStudioId: null, sharedStudioExternalId: null, links: [], projects: [], relationshipsCleaned: false, cleanupVerified: false };
const ref = name => makeFunctionReference(name);
const query = (client, name, args = {}) => client.query(ref(name), args);
const mutate = (client, name, args = {}) => client.mutation(ref(name), args);
const action = (client, name, args = {}) => client.action(ref(name), args);
const requestId = () => randomUUID();
const reason = label => `${marker} · ${label}; fixture review only.`;
const redact = error => { let text = error instanceof Error ? error.message : String(error); for (const secret of secrets) if (secret) text = text.replaceAll(secret, '[redacted]'); return text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-token]'); };
async function save() { await writeFile(config.stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); await chmod(config.stateFile, 0o600); }
function pass(label) { checks++; console.log(`PASS ${label}`); }
async function denied(operation, pattern) { let failure; try { await operation(); } catch (error) { failure = error; } assert(failure, 'An expected team denial unexpectedly succeeded.'); assert.match(redact(failure), pattern, 'Transport errors cannot count as authorization or expiry denial.'); }
async function signOut(client) { await action(client, 'auth:signOut'); sessions.delete(client); }
async function login(key, flow = 'signIn') {
  const credentials = config.actors[key]; const client = new ConvexHttpClient(config.url, { logger: false });
  const result = await action(client, 'auth:signIn', { provider: 'password', params: { flow, email: credentials.email, password: credentials.password, ...(flow === 'signUp' ? { name: `${marker} ${key}` } : {}) } });
  for (const value of Object.values(result?.tokens || {})) if (typeof value === 'string') secrets.add(value);
  const token = result?.tokens?.token || result?.token; assert(token, 'Actual Auth token required; email/verification flows are out of scope.'); secrets.add(token); client.setAuth(token); sessions.add(client); clients[key] = client;
  if (flow === 'signUp') { state.actors[key].signupConfirmed = true; await save(); }
  await verify(key); return client;
}
async function verify(key) {
  const actor = state.actors[key]; assert(actor.signupConfirmed && clients[key], 'Never use an ordinary or unconfirmed account.');
  const profile = await query(clients[key], 'accountLifecycle:profile', { now: Date.now() });
  assert(profile.email.toLowerCase() === config.actors[key].email, 'Fixture email mismatch.');
  if (actor.userId) assert.equal(profile.userId, actor.userId); else { assert(!Object.values(state.actors).some(other => other.userId === profile.userId), 'Fixtures must have separate canonical identities.'); actor.userId = profile.userId; await save(); }
  assert.equal(await query(clients[key], 'platformAdministration:currentRole'), null, 'Never alter or deactivate a platform-role account.'); return profile;
}
async function teamMutation(key, method, args) {
  await verify(key); const ids = new Set(Object.values(state.actors).filter(actor => actor.signupConfirmed).map(actor => actor.userId));
  if (args.studioId) assert.equal(args.studioId, state.sharedStudioId);
  for (const field of ['userId', 'recipientUserId', 'successorUserId']) if (args[field]) assert(ids.has(args[field]), 'Never target an ordinary existing user.');
  if (args.invitationId) assert(state.links.some(link => link.id === args.invitationId), 'Only discovered run invitations can be revoked.');
  return mutate(clients[key], `teamLifecycle:${method}`, args);
}
async function pages(key, method, args, field = 'rows') {
  const rows = []; let cursor; const seen = new Set();
  for (let number = 0; number < 100; number++) {
    const page = await query(clients[key], `teamLifecycle:${method}`, { ...args, ...(cursor ? { cursor } : {}) }); rows.push(...page[field]);
    assert(rows.length <= 1000, 'Unexpected fixture discovery size; refusing incomplete cleanup.');
    if (page.isDone) return rows;
    assert(page.continueCursor && !seen.has(page.continueCursor), 'Discovery must make explicit progress.'); seen.add(page.continueCursor); cursor = page.continueCursor;
  }
  throw new Error('Bounded team discovery exceeded100 pages; no partial result counts as completion.');
}
async function invite(issuer, recipient, role = 'member', lifetimeMs = 86400_000) {
  const token = randomBytes(32).toString('base64url'); secrets.add(token); const tokenHash = createHash('sha256').update(token).digest('hex'); const expiresAt = Date.now() + lifetimeMs;
  const args = { studioId: state.sharedStudioId, recipientUserId: state.actors[recipient].userId, role, tokenHash, expiresAt, requestId: requestId() };
  const result = await teamMutation(issuer, 'createInvitation', args);
  state.links.push({ id: result.invitationId, recipientUserId: args.recipientUserId, tokenHash }); await save();
  const link = new URL('/invite', 'https://fixture-ui.invalid'); link.hash = new URLSearchParams({ token }).toString(); assert.equal(link.search, '');
  const copiedToken = new URLSearchParams(link.hash.slice(1)).get('token'); assert.equal(copiedToken, token);
  return { id: result.invitationId, token: copiedToken, expiresAt, args };
}
async function revoke(key, invitation) { return teamMutation(key, 'revokeInvitation', { invitationId: invitation.id, requestId: requestId(), reason: reason('revoke isolated link') }); }
async function accept(key, invitation) { await verify(key); const args = { token: invitation.token, requestId: requestId(), selectWorkspace: true }; const result = await mutate(clients[key], 'teamLifecycle:acceptInvitation', args); assert.equal(result.studioId, state.sharedStudioId); return args; }
async function change(key, target, status, role = 'member') { return teamMutation(key, 'changeMember', { studioId: state.sharedStudioId, userId: state.actors[target].userId, role, status, reason: reason(`${status} ${target}`), requestId: requestId() }); }
async function currentOwner() {
  for (const key of ['a', 'b', 'c']) if (clients[key] && state.actors[key].signupConfirmed && !state.actors[key].deactivated) {
    try { const context = await query(clients[key], 'teamLifecycle:context', { studioId: state.sharedStudioId }); if (context.recordedOwner) { assert(context.userId === state.actors[key].userId && context.name.startsWith(marker)); return key; } }
    catch (error) { if (!/not a member|not authorized/i.test(redact(error))) throw error; }
  }
  throw new Error('No authorized fixture owner can finish shared-workspace cleanup. Coordinator review required.');
}
async function cleanProjects() {
  if (!state.sharedStudioId || !clients.a) return 0;
  let cursor; const found = new Map();
  for (const mode of ['active', 'archived', 'deleted']) {
    cursor = undefined; const seen = new Set(); let complete = false;
    for (let number = 0; number < 100; number++) {
      const page = await query(clients.a, 'projects:library', { studioExternalId: state.sharedStudioExternalId, mode, search: config.runId, limit: 10, ...(cursor ? { cursor } : {}) });
      for (const row of page.page) { const project = await query(clients.a, 'projects:getByExternalId', { externalId: row.externalId, includeInactive: true }); assert(project && project.name.startsWith(`${marker} project`) && project.ownerUserId === state.actors.a.userId && project.createdByUserId === state.actors.a.userId && project.studioExternalId === state.sharedStudioExternalId); found.set(project._id, project); }
      if (page.isDone) { complete = true; break; } assert(page.continueCursor && !seen.has(page.continueCursor)); seen.add(page.continueCursor); cursor = page.continueCursor;
    }
    assert(complete, 'Project discovery did not complete.');
  }
  for (const project of found.values()) { if (project.status !== 'DELETED') await mutate(clients.a, 'projects:softDelete', { projectId: project._id }); const retained = await query(clients.a, 'projects:getByExternalId', { externalId: project.externalId, includeInactive: true }); assert(retained && retained.status === 'DELETED' && retained.name === project.name && retained.ownerUserId === state.actors.a.userId); }
  for (const project of state.projects) assert(found.has(project.id), 'A confirmed fixture project must remain discoverable.'); return found.size;
}
async function cleanup() {
  for (const key of ['a', 'b', 'c']) if (state.actors[key].signupConfirmed) {
    try { if (!clients[key]) await login(key); else await verify(key); }
    catch (error) { if (state.relationshipsCleaned && state.actors[key].plannedDeactivation && /disabled/i.test(redact(error))) { state.actors[key].deactivated = true; continue; } throw error; }
  }
  if (!state.relationshipsCleaned && state.sharedStudioId) {
    const owner = await currentOwner();
    const roster = await pages(owner, 'roster', { studioId: state.sharedStudioId });
    const ids = new Set(Object.values(state.actors).filter(actor => actor.signupConfirmed).map(actor => actor.userId)); assert(roster.every(row => row.userId && ids.has(row.userId)), 'Unexpected non-fixture member; do not modify it.');
    const a = roster.find(row => row.userId === state.actors.a.userId);
    if (a && a.status !== 'active') await change(owner, 'a', 'active', 'admin');
    state.retainedProjects = await cleanProjects();
    const pending = await pages(owner, 'invitations', { studioId: state.sharedStudioId, status: 'PENDING', now: Date.now() });
    for (const link of pending) { assert(ids.has(link.recipientUserId)); if (!state.links.some(known => known.id === link.invitationId)) state.links.push({ id: link.invitationId, recipientUserId: link.recipientUserId }); }
    await save(); // Discover fully before mutating a status-indexed list.
    for (const link of pending) await revoke(owner, { id: link.invitationId });
    const removalRoster = await pages(owner, 'roster', { studioId: state.sharedStudioId });
    for (const row of removalRoster) if (row.userId !== state.actors[owner].userId && row.status === 'active') { const key = Object.keys(state.actors).find(candidate => state.actors[candidate].userId === row.userId); await change(owner, key, 'removed'); }
    const after = await pages(owner, 'roster', { studioId: state.sharedStudioId }); assert(after.every(row => row.userId === state.actors[owner].userId ? row.status === 'active' : row.status !== 'active'));
    assert.equal((await pages(owner, 'invitations', { studioId: state.sharedStudioId, status: 'PENDING', now: Date.now() })).length, 0);
  }
  state.relationshipsCleaned = true; await save();
  for (const key of ['a', 'b', 'c']) if (state.actors[key].signupConfirmed && !state.actors[key].deactivated) {
    await verify(key); await mutate(clients[key], 'account:ensureAccount', { name: `${marker} ${key}` }); const safety = await query(clients[key], 'accountLifecycle:deactivationPreflight'); assert(safety.allowed, 'Never bypass a fixture ownership safety blocker.');
    const args = { requestId: requestId(), reason: reason(`cleanup ${key}; retain all history`), confirmation: 'DEACTIVATE' }; state.actors[key].plannedDeactivation = args; await save();
    const receipt = await mutate(clients[key], 'accountLifecycle:requestDeactivation', args); state.actors[key].deactivationRequestId = receipt.requestId; state.actors[key].deactivated = true; await save();
    assert.equal(await query(clients[key], 'auth:currentUser'), null); await denied(() => query(clients[key], 'account:current'), /disabled/i);
  }
  assert(Object.values(state.actors).filter(actor => actor.signupConfirmed).every(actor => actor.deactivated)); state.cleanupVerified = true; await save(); pass('cleanup revokes links, removes cross-fixture membership, retains projects/audit and safely deactivates only confirmed fresh fixtures');
}

let failure;
try {
  const emailFlag = execFileSync(process.execPath, ['node_modules/convex/bin/main.js', 'env', 'get', 'CONVEX_AUTH_EMAIL_ENABLED', '--deployment', config.deployment], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).trim(); assert(emailFlag === '' || emailFlag === 'false', 'Remote authentication email must remain disabled.');
  if (config.cleanupOnly) { state = JSON.parse(await readFile(config.stateFile, 'utf8')); assert(state.version === 1 && state.runId === config.runId && state.url === config.url); for (const key of ['a', 'b', 'c']) assert(state.actors[key].email === config.actors[key].email); }
  else {
    await writeFile(config.stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); console.log(`B04 actual-Auth fixture run: ${config.runId}`);
    for (const key of ['a', 'b', 'c']) { await login(key, 'signUp'); await signOut(clients[key]); await login(key); const account = await mutate(clients[key], 'account:ensureAccount', { name: `${marker} ${key}` }); assert.equal(account.userId, state.actors[key].userId); state.actors[key].originalStudioId = account.studioId; if (key === 'a') { state.sharedStudioId = account.studioId; state.sharedStudioExternalId = account.studioExternalId; } await save(); }
    pass('three fresh UUID-scoped real Auth accounts sign up/sign in and provision without any platform grants');
    const project = await mutate(clients.a, 'projects:create', { name: `${marker} project`, description: 'Retained no-cost team acceptance fixture; no media or provider work.', contentType: 'fixture' }); state.projects.push({ id: project.projectId, externalId: project.externalId }); await save();
    const bInvite = await invite('a', 'b', 'admin'); assert.equal(await mutate(clients.c, 'teamLifecycle:previewInvitation', { token: bInvite.token }), null); const acceptArgs = await accept('b', bInvite); assert.equal((await mutate(clients.b, 'teamLifecycle:acceptInvitation', acceptArgs)).replayed, true);
    const listed = await pages('a', 'invitations', { studioId: state.sharedStudioId, status: 'ACCEPTED', now: Date.now() }); assert(listed.some(link => link.invitationId === bInvite.id)); assert(!JSON.stringify(listed).includes(bInvite.token)); assert(listed.every(link => !('tokenHash' in link)));
    assert.equal((await query(clients.b, 'account:current')).studio._id, state.sharedStudioId); await signOut(clients.b); await login('b'); await mutate(clients.b, 'account:ensureAccount', {}); assert.equal((await query(clients.b, 'auth:currentUser')).studioExternalId, state.sharedStudioExternalId);
    pass('hash-only manually copied fragment link binds exact recipient; acceptance/replay and workspace selection survive actual sign-out/relogin');
    const stale = await invite('b', 'c'); await change('a', 'b', 'suspended', 'admin'); assert.equal(await mutate(clients.c, 'teamLifecycle:previewInvitation', { token: stale.token }), null); await denied(() => accept('c', stale), /authority changed/); await change('a', 'b', 'active', 'admin'); await revoke('a', stale);
    const revoked = await invite('a', 'c'); await revoke('a', revoked); await denied(() => accept('c', revoked), /unavailable/);
    const expired = await invite('a', 'c', 'member', 70000);
    const handoff = { studioId: state.sharedStudioId, successorUserId: state.actors.b.userId, reason: reason('explicit owner handoff'), confirmation: `TRANSFER ${state.actors.b.userId}`, requestId: requestId() };
    await teamMutation('a', 'transferOwnership', handoff); assert.equal((await teamMutation('a', 'transferOwnership', handoff)).replayed, true); await mutate(clients.a, 'account:ensureAccount', {}); assert.equal((await query(clients.a, 'teamLifecycle:context', { studioId: state.sharedStudioId })).role, 'admin');
    await denied(() => invite('a', 'c', 'admin'), /owner authority/);
    console.log('Waiting for the ordinary short-lived invitation expiry; no clock override or test backdoor.');
    while (Date.now() <= expired.expiresAt + 1000) await new Promise(resolve => setTimeout(resolve, Math.min(15000, expired.expiresAt + 1001 - Date.now())));
    assert.equal(await mutate(clients.c, 'teamLifecycle:previewInvitation', { token: expired.token }), null); await denied(() => accept('c', expired), /expired/); await revoke('b', expired);
    pass('stale issuer, revoked and genuinely expired links fail; typed atomic handoff leaves former owner admin without promotion authority');
    await accept('c', await invite('b', 'c'));
    await denied(() => change('a', 'c', 'active', 'admin'), /owner authority/);
    await change('b', 'a', 'removed', 'admin'); await denied(() => query(clients.a, 'teamLifecycle:context', { studioId: state.sharedStudioId }), /not a member|not authorized/i); await denied(() => mutate(clients.a, 'teamLifecycle:selectWorkspace', { studioId: state.sharedStudioId }), /not a member|not authorized/i);
    await mutate(clients.a, 'account:ensureAccount', { name: `${marker} a` }); assert.notEqual((await query(clients.a, 'account:current')).studio?._id, state.sharedStudioId); assert.notEqual((await query(clients.a, 'auth:currentUser')).studioExternalId, state.sharedStudioExternalId);
    await denied(() => change('c', 'a', 'active', 'admin'), /owner authority/); await denied(() => change('a', 'a', 'active', 'admin'), /not a member|not authorized/i); await change('b', 'a', 'active', 'admin'); assert.equal((await query(clients.a, 'projects:get', { projectId: project.projectId })).name, `${marker} project`);
    pass('canonical removal defeats legacy/owner preference and provisioning fallback; only current owner restores access and project history remains intact');
  }
} catch (error) { failure = new Error(redact(error)); }
finally {
  try { if (Object.values(state.actors).some(actor => actor.signupConfirmed)) await cleanup(); } catch (error) { failure = new Error(`${failure ? `${failure.message}\n` : ''}Cleanup requires coordinator attention for run ${config.runId}: ${redact(error)}`); }
  for (const client of [...sessions]) try { await signOut(client); } catch (error) { failure = new Error(`${failure ? `${failure.message}\n` : ''}Fixture session sign-out not confirmed: ${redact(error)}`); }
}
if (failure) throw failure;
console.log(JSON.stringify({ onlineConvex: true, actualConvexAuth: true, runId: config.runId, checks, cleanupVerified: state.cleanupVerified, retainedProjects: state.retainedProjects || 0, realOwnerMutations: 0, emailDeliveryCalls: 0, paidProviderCalls: 0 }));
