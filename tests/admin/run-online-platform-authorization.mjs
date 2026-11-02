import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Opt-in only: this uses simulated CLI identities against an online DEVELOPMENT
// deployment. It tests application authorization, not browser sign-in/JWT minting.
const fixtureKey = process.env.FINALFRAME_DEV_FIXTURE_KEY;
const url = new URL(process.env.NEXT_PUBLIC_CONVEX_URL || '');
if (process.env.FINALFRAME_ALLOW_PLATFORM_ONLINE_TESTS !== 'true' || !fixtureKey || url.protocol !== 'https:' || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.convex\.cloud$/.test(url.hostname) || url.port || url.username || url.password) throw new Error('Opt in using the private online development fixture configuration and its exact Convex cloud deployment URL.');
const deployment = url.hostname.replace('.convex.cloud', '');
const runId = process.env.FINALFRAME_PLATFORM_FIXTURE_RUN_ID || randomUUID();
if (process.env.FINALFRAME_PLATFORM_FIXTURE_CLEANUP_ONLY === 'true' && !process.env.FINALFRAME_PLATFORM_FIXTURE_RUN_ID) throw new Error('Cleanup-only requires the exact interrupted fixture run ID.');
if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId)) throw new Error('The platform fixture run ID must be a UUID.');
const marker = `finalframe-platform-authorization-v1:${runId}`;
const ownerSubject = `${marker}:owner`;
const fixtureArgs = { fixtureKey, runId };
const readOnly = new Set(['platformAdministration:currentRole', 'platformAdministration:inventory', 'platformAdministration:reportContext', 'platformAdministrationVerification:snapshot', 'projects:get']);
function run(name, args, subject) {
  const command = ['node_modules/convex/bin/main.js', 'run', name, JSON.stringify(args), '--deployment', deployment];
  if (subject && !name.startsWith('platformAdministrationVerification:')) command.push('--identity', JSON.stringify({ subject, issuer: 'https://finalframe-test.invalid' }));
  for (let attempt = 0; ; attempt++) {
    try {
      const output = execFileSync(process.execPath, command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }).trim();
      return output ? JSON.parse(output) : null;
    } catch (error) {
      const message = String(error.stderr || error.message).replaceAll(fixtureKey, '[redacted]');
      // Ambiguous writes are never replayed. Transport failure never passes an
      // expected-denial assertion; only bounded read retries are allowed.
      if (readOnly.has(name) && attempt < 2 && /fetch failed|ECONNRESET|ETIMEDOUT/.test(message)) continue;
      throw new Error(message);
    }
  }
}
let checks = 0;
function check(label, action) { action(); checks++; console.log(`PASS ${label}`); }
function denied(action, pattern = /Explicit platform access is required/) { assert.throws(action, pattern); }
function cleaned(snapshot) {
  assert(snapshot.users.filter(Boolean).every((user) => user.status === 'disabled'));
  assert(snapshot.roles.filter(Boolean).every((role) => role.status === 'REVOKED'));
  assert(snapshot.projects.filter(Boolean).every((project) => project.status === 'DELETED' && project.deletedAt));
  assert(snapshot.audit.some((event) => event.action === 'DEV_PLATFORM_FIXTURE_CLEANED'));
}
console.log(`Platform fixture run: ${runId}`); // Retain this ID for cleanup after process interruption.
let failure;
try {
  if (process.env.FINALFRAME_PLATFORM_FIXTURE_CLEANUP_ONLY !== 'true') {
    const fixture = run('platformAdministrationVerification:seed', fixtureArgs, ownerSubject);
    assert.equal(fixture.marker, marker);
    const actor = (name) => fixture.actors[name].subject;
    const call = (name, args, who = 'admin') => run(`platformAdministration:${name}`, args, actor(who));
    const inventory = (kind, who) => call('inventory', { kind, limit: 10 }, who);
    const snapshot = () => run('platformAdministrationVerification:snapshot', fixtureArgs, ownerSubject);
    const projectArgs = { projectId: fixture.projectId };
    const roleArgs = { userId: fixture.actors.admin.userId, role: 'SUPPORT', status: 'ACTIVE', reason: 'Development last administrator denial test', requestId: 'fixture-last-admin' };
    check('unauthenticated caller, studio owner and studio administrator have no platform authority', () => {
      denied(() => run('platformAdministration:inventory', { kind: 'users', limit: 1 }), /verified Convex identity|UNAUTHENTICATED|Authentication required/i);
      for (const who of ['owner', 'outsider']) {
        assert.equal(call('currentRole', {}, who), null);
        denied(() => inventory('users', who));
        denied(() => call('setRole', roleArgs, who));
      }
    });
    check('explicit platform ADMIN, SUPPORT and MODERATOR scopes are enforced', () => {
      for (const [who, role] of [['admin', 'ADMIN'], ['support', 'SUPPORT'], ['moderator', 'MODERATOR']]) assert.equal(call('currentRole', {}, who).role, role);
      for (const kind of ['users', 'jobs', 'reports', 'roles', 'credits', 'audit', 'routing']) assert(Array.isArray(inventory(kind, 'admin').rows));
      for (const kind of ['users', 'jobs', 'credits', 'audit']) assert(Array.isArray(inventory(kind, 'support').rows));
      for (const kind of ['reports', 'roles', 'routing']) denied(() => inventory(kind, 'support'));
      for (const kind of ['reports', 'audit']) assert(Array.isArray(inventory(kind, 'moderator').rows));
      for (const kind of ['users', 'jobs', 'credits', 'roles', 'routing']) denied(() => inventory(kind, 'moderator'));
      denied(() => call('setRole', roleArgs, 'support'));
      denied(() => call('setRole', roleArgs, 'moderator'));
    });
    check('last enabled platform ADMIN cannot demote or revoke their grant', () => {
      denied(() => call('setRole', roleArgs), /administrator must remain/);
      denied(() => call('setRole', { ...roleArgs, role: 'ADMIN', status: 'REVOKED', requestId: 'fixture-last-revoke' }), /administrator must remain/);
    });
    check('fixture-only role changes bind replay content and append one audit event', () => {
      const args = { userId: fixture.actors.outsider.userId, role: 'SUPPORT', status: 'ACTIVE', reason: 'Temporary marker-only permission grant.', requestId: 'fixture-role-grant' };
      assert.equal(call('setRole', args).replayed, false); assert.equal(call('setRole', args).replayed, true);
      denied(() => call('setRole', { ...args, role: 'MODERATOR' }), /another change/);
      assert.equal(call('currentRole', {}, 'outsider').role, 'SUPPORT');
      assert.equal(call('setRole', { ...args, status: 'REVOKED', requestId: 'fixture-role-revoke' }).replayed, false);
      assert.equal(call('currentRole', {}, 'outsider'), null);
      const data = snapshot();
      assert.equal(data.audit.filter((event) => event.action === 'PLATFORM_ROLE_CHANGED' && event.entityId === args.userId).length, 2);
    });
    const reportArgs = { ...projectArgs, assetId: fixture.assetId, category: 'OTHER', reason: 'Development permission fixture only; no real content judgment.', requestId: 'fixture-report-create' };
    let report;
    check('reports bind exact project access, media ownership and idempotent content', () => {
      denied(() => call('createReport', { ...reportArgs, assetId: fixture.foreignAssetId }, 'owner'), /belongs to another project/);
      denied(() => call('createReport', reportArgs, 'outsider'), /PROJECT_ACCESS_DENIED|not a member|not authorized/i);
      report = call('createReport', reportArgs, 'owner'); assert.equal(report.replayed, false);
      const replay = call('createReport', reportArgs, 'owner'); assert.equal(replay.reportId, report.reportId); assert.equal(replay.replayed, true);
      denied(() => call('createReport', { ...reportArgs, reason: 'Changed fixture report request' }, 'owner'), /another report/);
    });
    const decisionArgs = { reportId: report.reportId, decision: 'QUARANTINED', reason: 'Development quarantine and access recovery test.', requestId: 'fixture-report-decide' };
    check('MODERATOR quarantine restricts ordinary project reads and retains metadata recovery', () => {
      denied(() => call('decideReport', decisionArgs, 'support'));
      assert.equal(call('decideReport', decisionArgs, 'moderator').replayed, false);
      assert.equal(call('decideReport', decisionArgs, 'moderator').replayed, true);
      denied(() => run('projects:get', projectArgs, ownerSubject), /restricted|PROJECT_ACCESS_DENIED/i);
      const context = call('reportContext', { projectExternalId: `${marker}:project:main` }, 'owner');
      assert.deepEqual(Object.keys(context).sort(), ['moderationStatus', 'name', 'projectId']); assert.equal(context.moderationStatus, 'RESTRICTED');
      const data = snapshot(); assert.equal(data.projects[0].moderationStatus, 'RESTRICTED');
      assert.equal(data.reports.find((row) => row.id === report.reportId).status, 'RESOLVED');
      assert.equal(data.audit.filter((event) => event.action === 'MODERATION_REPORT_DECIDED' && event.entityId === report.reportId).length, 1);
    });
    check('only ADMIN clears project restriction; ordinary access then recovers', () => {
      const args = { ...projectArgs, reason: 'Development fixture recovery only.', requestId: 'fixture-report-clear' };
      denied(() => call('clearRestriction', args, 'moderator'));
      denied(() => call('clearRestriction', args, 'support'));
      assert.equal(call('clearRestriction', args).replayed, false); assert.equal(call('clearRestriction', args).replayed, true);
      assert.equal(run('projects:get', projectArgs, ownerSubject)._id, fixture.projectId);
    });
    check('model quarantine survives until ADMIN clear and clear requires re-review', () => {
      const args = { modelId: fixture.modelId, reason: 'Development non-provider catalog fixture.', requestId: 'fixture-model-quarantine' };
      denied(() => call('quarantineModel', args, 'support')); denied(() => call('quarantineModel', args, 'moderator'));
      assert.equal(call('quarantineModel', args).replayed, false); assert.equal(call('quarantineModel', args).replayed, true);
      let model = snapshot().model; assert(model.platformQuarantinedAt); assert.equal(model.available, false);
      const clear = { ...args, requestId: 'fixture-model-clear' };
      denied(() => call('clearModelQuarantine', clear, 'moderator'));
      assert.equal(call('clearModelQuarantine', clear).replayed, false);
      model = snapshot().model; assert.equal(model.platformQuarantinedAt, null); assert.equal(model.available, false); assert.equal(model.reviewedAt, null);
    });
    check('ADMIN status changes are idempotent, audited and deny weaker roles', () => {
      const args = { userId: fixture.actors.outsider.userId, status: 'disabled', reason: 'Development fixture account only.', requestId: 'fixture-user-disable' };
      denied(() => call('setUserStatus', args, 'support')); denied(() => call('setUserStatus', args, 'moderator'));
      assert.equal(call('setUserStatus', args).replayed, false); assert.equal(call('setUserStatus', args).replayed, true);
      denied(() => call('setUserStatus', { ...args, status: 'active' }), /another change/);
      assert.equal(call('setUserStatus', { ...args, status: 'active', requestId: 'fixture-user-enable' }).replayed, false);
      const data = snapshot();
      assert.equal(data.audit.filter((event) => event.action === 'PLATFORM_USER_STATUS_CHANGED' && event.entityId === args.userId).length, 2);
      assert(data.audit.every((event) => event.scope === 'PLATFORM'));
      assert(!data.audit.some((event) => event.action === 'PLATFORM_ADMIN_BOOTSTRAPPED'));
    });
  }
} catch (error) { failure = error; }
finally {
  // Cleanup is attempted even after an ambiguous seed response. It looks up only
  // exact marker records and cannot accept arbitrary user/project identifiers.
  try {
    run('platformAdministrationVerification:cleanup', fixtureArgs, ownerSubject);
    const data = run('platformAdministrationVerification:snapshot', fixtureArgs, ownerSubject);
    cleaned(data); console.log('PASS fixture cleanup: temporary roles revoked, users disabled, own projects soft-deleted, audit retained');
  } catch (cleanupError) {
    console.error(`Fixture cleanup requires attention for run ${runId}: ${cleanupError.message}`);
    failure = new AggregateError([...(failure ? [failure] : []), cleanupError], 'Platform fixture verification or cleanup failed.');
  }
}
if (failure) throw failure;
console.log(JSON.stringify({ onlineConvex: true, simulatedCliIdentities: true, checks, paidProviderCalls: 0, renderSubmissions: 0, actualOwnerGrants: 0, cleanupVerified: true }));
