import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const fixtureKey = process.env.FINALFRAME_DEV_FIXTURE_KEY;
const url = new URL(process.env.NEXT_PUBLIC_CONVEX_URL || '');
if (!fixtureKey || url.protocol !== 'https:' || !url.hostname.endsWith('.convex.cloud')) throw new Error('Use the private online development fixture configuration.');
function run(name, args, subject) {
  const command = ['node_modules/convex/bin/main.js', 'run', name, JSON.stringify(args)];
  if (subject) command.push('--identity', JSON.stringify({ subject, issuer: 'https://finalframe-test.invalid' }));
  try {
    const output = execFileSync(process.execPath, command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return output ? JSON.parse(output) : null;
  } catch (error) {
    throw new Error(String(error.stderr || error.message).replaceAll(fixtureKey, '[redacted]'));
  }
}
const fixture = run('devFixtures:seedGenerationWorkerVerification', { fixtureKey, runId: randomUUID() });
let checks = 0;
try {
  const requests = [
    ['productionGraph:get', { productionId: fixture.productionId }],
    ['timelineEditor:getDraft', { productionId: fixture.productionId }],
    ['productionOperations:previewImpact', { productionId: fixture.productionId, targetType: 'production', targetId: fixture.productionId }],
    ['generationJobs:list', { productionId: fixture.productionId }],
  ];
  for (const [name, args] of requests) {
    run(name, args, fixture.ownerSubject);
    checks += 1;
    assert.throws(() => run(name, args, fixture.outsiderSubject), /not authorized|PROJECT_ACCESS_DENIED|not a member/i);
    checks += 1;
    console.log(`PASS owner allowed and same-studio nonmember denied: ${name}`);
  }
  assert.throws(() => run('assembly:createJob', { productionId: fixture.productionId }, fixture.outsiderSubject), /not authorized|PROJECT_ACCESS_DENIED/i);
  checks += 1;
  console.log(JSON.stringify({ onlineConvex: true, simulatedCliIdentities: true, checks, paidProviderCalls: 0, renderSubmissions: 0 }));
} finally {
  run('generationWorkerVerification:closeFixtureBudget', { fixtureKey, jobIds: fixture.jobIds });
}
