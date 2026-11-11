// Actual canonical authoring/approval/assembly and manifest validation, no DB/provider/render calls.
const assert = require('node:assert/strict');
const { fixture, load } = require('../recipes/backend-fixture.cjs');
const { validateManifest } = load('renderer/src/manifest.ts');
const { transitionResourceState } = load('convex/approvals.ts');
const props = { title: 'One step at a time.', subtitle: 'Pause. Reflect. Begin again.', brandName: 'Quiet desk reset', callToAction: 'Take your next small step.', url: '', eyebrow: '', accentColor: '#F59E0B', backgroundColor: '#0B1220', textColor: '#FFFFFF' };
let checks = 0;
async function check(name, test) { await test(); checks++; console.log('PASS ' + name); }
async function assemble(version) {
  process.env.FINALFRAME_MANIFEST_V5_ENABLED = version === 5 ? 'true' : 'false';
  const ctx = fixture(); ctx.put('productionVersions', { _id: 'version', productionId: 'production', status: 'APPROVED', snapshot: {} });
  const result = await ctx.call('timeline', 'createDraft', { productionId: 'production', productionVersionId: 'version', idempotencyKey: 'blank-optional-graphic-' + version, clips: [{ kind: 'GRAPHIC', templateId: 'end-card', durationSeconds: 6, props }], fps: 30 });
  for (const targetState of ['IN_REVIEW', 'APPROVED', 'LOCKED']) await transitionResourceState(ctx, { projectId: 'project', productionId: 'production', resourceType: 'timeline', resourceId: result.timelineId, targetState, roles: ['OWNER'], decision: targetState });
  const locked = structuredClone(ctx.rows.get(result.timelineId));
  const clips = [...ctx.rows.values()].filter(row => row._table === 'timelineClips').map(row => structuredClone(row));
  const manifest = await ctx.call('assembly', 'createJob', { productionId: 'production', timelineId: result.timelineId, idempotencyKey: 'blank-graphic-manifest-' + version });
  assert.deepEqual(ctx.rows.get(result.timelineId), locked);
  assert.deepEqual([...ctx.rows.values()].filter(row => row._table === 'timelineClips'), clips);
  assert.equal(ctx.count('generationJobs'), 0); assert.equal(ctx.count('renderJobs'), 0);
  return manifest.manifest;
}
(async () => {
  let canonical;
  await check('blank optional URL/eyebrow survive actual locked v4/v5 assembly without modifying authored copy', async () => {
    for (const version of [4, 5]) {
      const manifest = await assemble(version); assert.equal(manifest.version, version); assert.equal(validateManifest(manifest).ok, true);
      const item = manifest.items[0]; assert.equal(item.kind, 'motion-graphics'); assert.equal(item.durationInFrames, 180); assert.equal(item.props.url, ''); assert.equal(item.props.eyebrow, ''); assert.equal(item.props.title, props.title); assert.equal(item.props.copyPolicy, 'authored-only');
      if (version === 5) canonical = manifest;
    }
  });
  await check('all existing optional text fields may be explicitly empty without defaults or truncation', async () => {
    const manifest = structuredClone(canonical); Object.assign(manifest.items[0].props, { subtitle: '', brandName: '', callToAction: '', url: '', eyebrow: '' });
    const before = structuredClone(manifest); assert.equal(validateManifest(manifest).ok, true); assert.deepEqual(manifest, before);
  });
  await check('required title and feature remain nonempty; media URLs cannot be blank', async () => {
    for (const title of ['', undefined]) { const m = structuredClone(canonical); m.items[0].props.title = title; assert.equal(validateManifest(m).ok, false); }
    const feature = structuredClone(canonical); feature.items[0].templateId = 'feature-callout'; feature.items[0].props.feature = ''; assert.equal(validateManifest(feature).ok, false);
    for (const logoUrl of ['', 'javascript:alert(1)', 'https://media.invalid/unsafe\nheader']) { const m = structuredClone(canonical); m.items[0].props.logoUrl = logoUrl; assert.equal(validateManifest(m).ok, false); }
    const media = structuredClone(canonical); media.items = [{ id: 'picture', kind: 'video', src: '', startFrame: 0, durationInFrames: 180 }]; assert.equal(validateManifest(media).ok, false);
  });
  await check('512-character optional-copy ceiling remains exact with useful issue path', async () => {
    const m = structuredClone(canonical); m.items[0].props.subtitle = 'x'.repeat(512); assert.equal(validateManifest(m).ok, true);
    m.items[0].props.subtitle += 'x'; const rejected = validateManifest(m); assert.equal(rejected.ok, false); assert(rejected.issues.some(issue => issue.path === 'items[0].props.subtitle' && /512/.test(issue.message)));
  });
  console.log(`Optional graphic copy: ${checks} PASS; no database, network, provider or rendering calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
