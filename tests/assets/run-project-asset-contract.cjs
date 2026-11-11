const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const schema = read('convex/schema.ts');
const storage = read('convex/assetStorage.ts');
const app = read('convex/app.ts');
const actions = read('src/lib/assets/actions.ts');
const contracts = read('src/lib/assets/contracts.ts');
const uploadButton = read('src/components/assets/upload-button.tsx');
const assetPanel = read('src/components/editor/asset-panel.tsx');
const blueprintPage = read('src/app/(dashboard)/dashboard/projects/[id]/blueprint/page.tsx');
const sceneCard = read('src/components/project/scene-card.tsx');

assert.match(schema, /scope: v\.optional\(v\.union\(v\.literal\("GLOBAL"\), v\.literal\("PROJECT"\)\)\)/);
assert.match(schema, /projectId: v\.optional\(v\.id\("projects"\)\)/);
assert.match(schema, /originAssetId: v\.optional\(v\.id\("assets"\)\)/);
assert.match(schema, /importedByUserId: v\.optional\(v\.id\("users"\)\)/);
assert.match(schema, /\.index\("by_project", \["projectId"\]\)/);

for (const exportName of [
  'generateUploadUrl',
  'ingestAsset',
  'listGlobalAssets',
  'listProjectAssets',
  'importAsset',
  'duplicateAsset',
  'resolveAuthorizedMedia',
  'getAssetContract',
]) {
  assert.match(storage, new RegExp(`export const ${exportName}`));
}
assert.match(storage, /requireProjectRole\(ctx, projectId/);
assert.match(storage, /requireProjectAccess\(ctx, args\.projectId\)/);
assert.match(storage, /productionProject\(ctx, productionId, projectId\)/);
assert.match(storage, /Only global assets or assets in this project may be copied/);
assert.match(storage, /scope === 'PROJECT'/);
assert.match(storage, /Global assets cannot be attached to a project or production/);
assert.match(storage, /Origin asset belongs to a different project/);
assert.match(storage, /asset\.scope !== 'PROJECT' && !asset\.projectId/);
assert.match(storage, /await requireAssetAccess\(ctx, asset\)/);

assert.match(app, /args: \{ projectId: v\.optional\(v\.id\("projects"\)\) \}/);
assert.match(app, /requireProjectRole\(ctx, args\.projectId, \["OWNER", "EDITOR", "REVIEWER", "VIEWER"\]\)/);
assert.match(app, /if \(asset\.projectId\) \{[\s\S]*requireProjectRole\(ctx, asset\.projectId, \["OWNER", "EDITOR"\]\)/);
assert.match(app, /asset\.scope !== "PROJECT" && !asset\.projectId && !asset\.deletedAt/);

assert.match(actions, /api\.assetStorage\.generateUploadUrl/);
assert.match(actions, /api\.assetStorage\.ingestAsset/);
assert.match(actions, /api\.assetStorage\.resolveAuthorizedMedia/);
assert.match(actions, /export async function getProjectAssets/);
assert.match(actions, /export async function importAssetToProject/);
assert.doesNotMatch(actions, /UNSUPPORTED_CONVEX_OPERATION: Uploading media/);

assert.match(contracts, /scope\?: 'GLOBAL' \| 'PROJECT'/);
assert.match(contracts, /if \(input\.scope === 'PROJECT' && !input\.projectId\)/);

assert.match(uploadButton, /projectExternalId\?: string/);
assert.match(uploadButton, /formData\.append\('projectId', projectExternalId\)/);
assert.match(assetPanel, /getProjectAssets\(projectId\)/);
assert.match(assetPanel, /projectExternalId=\{projectId\}/);
assert.match(blueprintPage, /getProjectAssets\(project\.id\)/);
assert.match(sceneCard, /formData\.append\('projectId', projectExternalId\)/);

console.log('Project P0-2 asset isolation contract checks passed.');

// Exercise the actual canonical copy handlers; no database/provider/network calls.
const { fixture } = require('../recipes/backend-fixture.cjs');
const measured = { width: 1280, height: 720, durationSeconds: 3.92, frameRate: 25, channels: 2, sampleRate: 48000 };
function copyFixture(global = false, technical = measured) {
  const ctx = fixture();
  ctx.put('assets', { _id: 'source', studioExternalId: 'studio', studioId: 'studio', scope: global ? 'GLOBAL' : 'PROJECT', ...(global ? {} : { projectId: 'project' }), source: 'UPLOAD', roles: ['FOOTAGE'], name: 'Owned clip', mimeType: 'video/mp4', storageId: 'storage', checksum: 'a'.repeat(64), byteSize: 1000, metadata: { technicalProbe: { durationSeconds: 3.92 } }, provenance: { owned: true }, rights: { consent: true }, ...technical });
  ctx.put('resourceStates', { _id: 'approved-source', projectId: 'project', resourceType: 'asset', resourceId: 'source', state: 'LOCKED' });
  return ctx;
}
async function copy(ctx, mode) {
  return ctx.call('assetStorage', mode, { sourceAssetId: 'source', projectId: 'project', productionId: 'production' });
}
(async () => {
  for (const mode of ['importAsset', 'duplicateAsset']) {
    const ctx = copyFixture(mode === 'importAsset'), original = structuredClone(ctx.rows.get('source'));
    const result = await copy(ctx, mode);
    for (const [key, value] of Object.entries(measured)) assert.equal(result[key], value);
    assert.equal(result.projectId, 'project'); assert.equal(result.productionId, 'production'); assert.equal(result.scope, 'PROJECT');
    assert.equal(result.originAssetId, 'source'); assert.equal(result.storageId, original.storageId); assert.equal(result.checksum, original.checksum);
    assert.equal(result.provenance.importMode, mode === 'importAsset' ? 'IMPORT' : 'DUPLICATE');
    assert.deepEqual(result.rights, original.rights); assert.deepEqual(result.metadata.technicalProbe, original.metadata.technicalProbe);
    assert.deepEqual(ctx.rows.get('source'), original); assert.equal(ctx.count('resourceStates'), 1); assert.equal(ctx.count('approvals'), 0);
    assert(![...ctx.rows.values()].some(row => row._table === 'resourceStates' && row.resourceId === result._id));
  }
  console.log('PASS actual global import and project duplicate preserve all six finite technical fields, exact storage/lineage and original records without copying approval');
  for (const mode of ['importAsset', 'duplicateAsset']) {
    for (const technical of [{}, Object.fromEntries(Object.keys(measured).map((key, i) => [key, i % 2 ? Infinity : NaN]))]) {
      const ctx = copyFixture(mode === 'importAsset', technical), result = await copy(ctx, mode);
      for (const key of Object.keys(measured)) assert.equal(Object.hasOwn(result, key), false);
      assert.equal(ctx.rows.get('source').metadata.technicalProbe.durationSeconds, 3.92);
    }
  }
  console.log('PASS actual legacy and nonfinite source values remain absent without inventing measurements from nested metadata');
  for (const mode of ['importAsset', 'duplicateAsset']) {
    for (const failure of ['foreignProject', 'foreignStudio', 'deleted', 'role', 'production']) {
      const ctx = copyFixture(mode === 'importAsset');
      if (failure === 'foreignProject') ctx.rows.get('source').projectId = 'foreign';
      if (failure === 'foreignStudio') ctx.rows.get('source').studioExternalId = 'foreign';
      if (failure === 'deleted') ctx.rows.get('source').deletedAt = Date.now();
      if (failure === 'role') ctx.role = 'VIEWER';
      if (failure === 'production') ctx.rows.get('production').projectId = 'foreign';
      await assert.rejects(copy(ctx, mode)); assert.equal(ctx.count('assets'), 1); assert.equal(ctx.count('resourceStates'), 1);
    }
  }
  console.log('PASS actual import and duplicate retain project/studio/deletion/editor/production guards before new records');
})().catch(error => { console.error(error); process.exitCode = 1; });
