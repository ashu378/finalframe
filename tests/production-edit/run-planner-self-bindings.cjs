const assert = require('node:assert/strict');
const { fixture, load } = require('../recipes/backend-fixture.cjs');
const { normalizePlannerResourceRoles: normalize } = load('src/lib/production/planner-resource-roles.ts');
const { validateShotBindings } = load('convex/continuityContracts.ts');
const plan = bindings => ({ sequences: [{ scenes: [{ shots: [{ resourceBindings: bindings }] }] }] });
const shot = value => value.sequences[0].scenes[0].shots[0];
function setup() {
  const ctx = fixture();
  const resources = ['CHARACTER', 'COSTUME', 'PROP', 'LOCATION'].map(kind => {
    const resourceId = kind.toLowerCase(), resourceVersionId = `${resourceId}-v`;
    ctx.put('projectResources', { _id: resourceId, projectId: 'project', kind });
    ctx.put('projectResourceVersions', { _id: resourceVersionId, projectId: 'project', resourceId, assetIds: [] });
    return { resourceId, resourceVersionId, kind };
  });
  return { ctx, context: { projectId: 'project', resources } };
}
let checks = 0;
async function test(label, run) { await run(); checks++; console.log('PASS ' + label); }
(async () => {
  await test('exact approved CHARACTER self-binding is redundant; source and identity remain immutable', async () => {
    const { ctx, context } = setup();
    const input = plan([{ role: 'person', resourceVersionId: 'character-v', characterResourceVersionId: 'character-v', voiceVersionId: null }]);
    const before = structuredClone(input), contextBefore = structuredClone(context);
    const output = normalize(input, context);
    assert.deepEqual(input, before); assert.deepEqual(context, contextBefore);
    assert.deepEqual(shot(output).resourceBindings, [{ role: 'person', resourceVersionId: 'character-v', voiceVersionId: null }]);
    await validateShotBindings(ctx, 'project', context, shot(output), 8);
  });
  await test('different character target is retained and rejected rather than silently removed', async () => {
    const { ctx, context } = setup();
    const input = plan([{ role: 'person', resourceVersionId: 'character-v', characterResourceVersionId: 'another-character-v' }]);
    assert.deepEqual(normalize(input, context), input);
    await assert.rejects(validateShotBindings(ctx, 'project', context, shot(normalize(input, context)), 8), /Only costumes and props/);
  });
  await test('missing, malformed, unknown or wrong-kind context cannot authorize normalization', async () => {
    const { ctx, context } = setup();
    const input = plan([{ role: 'person', resourceVersionId: 'character-v', characterResourceVersionId: 'character-v' }]);
    for (const unknown of [undefined, null, {}, { resources: null }, { resources: [null] }, { resources: [{ resourceVersionId: 'other', kind: 'CHARACTER' }] }, { resources: [{ resourceVersionId: 'character-v', kind: 'PROP' }] }]) {
      const output = normalize(input, unknown); assert.deepEqual(output, input);
      await assert.rejects(validateShotBindings(ctx, 'project', context, shot(output), 8), /Only costumes and props/);
    }
  });
  await test('costume and prop assignments retain their explicit character relationship', async () => {
    const { ctx, context } = setup();
    const input = plan([{ role: 'person', resourceVersionId: 'character-v' }, ...['costume', 'prop'].map(kind => ({ role: kind, resourceVersionId: `${kind}-v`, characterResourceVersionId: 'character-v' }))]);
    assert.deepEqual(normalize(input, context), input);
    await validateShotBindings(ctx, 'project', context, shot(normalize(input, context)), 8);
    const invalid = plan([{ role: 'costume', resourceVersionId: 'costume-v', characterResourceVersionId: 'costume-v' }]);
    assert.deepEqual(normalize(invalid, context), invalid);
    await assert.rejects(validateShotBindings(ctx, 'project', context, shot(invalid), 8), /matching character explicitly/);
  });
  await test('normalization does not weaken project ownership or immutable voice validation', async () => {
    const { ctx, context } = setup();
    const input = plan([{ role: 'person', resourceVersionId: 'character-v', characterResourceVersionId: 'character-v', voiceVersionId: 'invented' }]);
    const output = normalize(input, context);
    assert.equal(shot(output).resourceBindings[0].voiceVersionId, 'invented');
    await assert.rejects(validateShotBindings(ctx, 'project', context, shot(output), 8), /exact immutable voice/);
    ctx.rows.get('character-v').projectId = 'another-project';
    await assert.rejects(validateShotBindings(ctx, 'project', context, shot(output), 8), /unavailable in this project/);
  });
  console.log(`Planner self-bindings: ${checks} PASS; pure contracts, no database or provider calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
