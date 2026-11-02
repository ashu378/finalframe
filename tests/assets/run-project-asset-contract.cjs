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
