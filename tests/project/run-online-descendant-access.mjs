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
  // Real, tiny fixture upload: exercise retained project media without AI.
  const uploadUrl = run('assetStorage:generateUploadUrl', { projectId: fixture.projectId }, fixture.ownerSubject);
  const upload = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=', 'base64') });
  assert(upload.ok, 'Fixture storage upload must succeed');
  const { storageId } = await upload.json();
  const asset = run('assetStorage:ingestAsset', { studioExternalId: fixture.studioExternalId, scope: 'PROJECT', projectId: fixture.projectId, productionId: fixture.productionId, storageId, source: 'FIXTURE', roles: ['REFERENCE'], name: 'Private dashboard fixture', mimeType: 'image/png', metadata: { fixture: true } }, fixture.ownerSubject);
  function overview(subject, visible) {
    const data = run('app:dashboard', {}, subject);
    assert.equal(data.projects.length, visible ? 1 : 0);
    assert.equal(data.productions.length, visible ? 1 : 0);
    assert.equal(data.assets.length, visible ? 1 : 0);
    assert.equal(data.stats.totalProjects, visible ? 1 : 0);
    assert.equal(data.stats.totalAssets, visible ? 1 : 0);
    assert.equal(data.stats.activeJobs, visible ? 5 : 0);
    if (visible) assert.equal(data.assets[0]._id, asset.assetId);
    else {
      const result = JSON.stringify(data);
      for (const privateId of [fixture.projectId, fixture.productionId, asset.assetId]) assert(!result.includes(privateId));
    }
    checks += 1;
  }
  overview(fixture.ownerSubject, true);
  overview(fixture.outsiderSubject, false);
  console.log('PASS dashboard hides project names, media, production records and job counters from same-studio nonmembers');
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
  run('projects:archive', { projectId: fixture.projectId }, fixture.ownerSubject);
  overview(fixture.ownerSubject, false);
  run('projects:restore', { projectId: fixture.projectId }, fixture.ownerSubject);
  overview(fixture.ownerSubject, true);
  run('projects:softDelete', { projectId: fixture.projectId }, fixture.ownerSubject);
  overview(fixture.ownerSubject, false);
  run('projects:restore', { projectId: fixture.projectId }, fixture.ownerSubject);
  overview(fixture.ownerSubject, true);
  console.log('PASS archived/deleted records disappear from the overview and restore retains assets, productions and jobs');
  console.log(JSON.stringify({ onlineConvex: true, simulatedCliIdentities: true, checks, paidProviderCalls: 0, renderSubmissions: 0 }));
} finally {
  run('generationWorkerVerification:closeFixtureBudget', { fixtureKey, jobIds: fixture.jobIds });
}
