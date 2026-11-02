import assert from 'node:assert/strict';
import { onlineTeamConfiguration } from './online-team-config.mjs';
const runId = 'd7053699-77d5-4cb6-8858-54d74c2ba0de';
const env = { FINALFRAME_ALLOW_TEAM_ONLINE_TESTS: 'true', NEXT_PUBLIC_CONVEX_URL: 'https://knowing-snail-785.convex.cloud', FINALFRAME_TEAM_RUN_ID: runId };
for (const key of ['a', 'b', 'c']) { env[`FINALFRAME_TEAM_${key.toUpperCase()}_EMAIL`] = `finalframe-b04-${key}-${runId}@example.test`; env[`FINALFRAME_TEAM_${key.toUpperCase()}_PASSWORD`] = `unit-only-fixture-${key}`; }
assert.equal(onlineTeamConfiguration(env).deployment, 'knowing-snail-785');
for (const url of ['http://knowing-snail-785.convex.cloud', 'https://other.convex.cloud', 'https://knowing-snail-785.convex.cloud/path', 'https://name:secret@knowing-snail-785.convex.cloud']) assert.throws(() => onlineTeamConfiguration({ ...env, NEXT_PUBLIC_CONVEX_URL: url }), /pinned/);
assert.throws(() => onlineTeamConfiguration({ ...env, FINALFRAME_ALLOW_TEAM_ONLINE_TESTS: 'false' }), /opt-in/);
assert.throws(() => onlineTeamConfiguration({ ...env, FINALFRAME_TEAM_RUN_ID: 'reused-user' }), /fresh lowercase UUID/);
assert.throws(() => onlineTeamConfiguration({ ...env, FINALFRAME_TEAM_A_EMAIL: 'real-owner@example.test' }), /dedicated UUID/);
assert.throws(() => onlineTeamConfiguration({ ...env, FINALFRAME_TEAM_B_PASSWORD: env.FINALFRAME_TEAM_A_PASSWORD }), /separate supplied/);
console.log('PASS offline B04 driver guards: exact cloud, UUID-scoped recipient credentials, three distinct passwords and explicit opt-in; no network/DB calls');
