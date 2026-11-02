/** Opt-in live application image preparation; never bypasses the shared budget. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../dev-fixture/client.mjs';
const require = createRequire(import.meta.url); const ts = require('typescript');
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { quotePreparation } = require('../../src/lib/ai/preparation.ts');
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, 'https://knowing-snail-785.convex.cloud');
const phase = process.argv[2]; assert(['queue', 'status', 'download'].includes(phase));
const root = process.env.FINALFRAME_COMPLETE_TEST_DIR || '/tmp/finalframe-complete-acceptance';
const source = JSON.parse(fs.readFileSync(root + '/nigerian-comedy-story.json', 'utf8'));
const file = root + '/character-reference-image.json';
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
const { client } = await createAuthenticatedClient();
if (phase === 'queue') {
  assert.equal(process.env.FINALFRAME_ALLOW_PAID_TESTS, 'true');
  const text = 'Original 2D animation character reference sheet of a fictional round blue-grey market pigeon with a teal head, a purple chest stripe and red feet. One full-body pigeon, front three-quarter view, simple pale background, clear expressive silhouette, clean hand-drawn comedy style. No lettering, logos, human face or copyrighted character. Controlled technical sample; not a replacement for an existing approved character.';
  state.quote ??= await quotePreparation({ kind: 'CHARACTER_REFERENCE', text }); save();
  assert(state.quote.estimatedProviderCostUsd <= .2);
  const args = { productionId: source.plan.productionId, kind: 'CHARACTER_REFERENCE', text, idempotencyKey: 'launch-reference-image:' + source.project.projectId };
  if (!state.job) { state.job = await client.action(api.preparation.create, args); save(); }
  assert.equal((await client.action(api.preparation.create, args))._id, state.job._id);
  console.log(JSON.stringify({ phase, jobId: state.job._id, quote: state.quote, duplicateReused: true }));
} else {
  state.result = (await client.query(api.generationJobs.get, { jobId: state.job._id })).job; save();
  if (phase === 'download') {
    assert.equal(state.result.status, 'COMPLETED');
    const media = await client.query(api.assetStorage.resolveAuthorizedMedia, { assetId: state.result.assetId });
    const response = await fetch(media.url); assert(response.ok);
    state.outputPath = root + '/character-reference-image.png'; fs.writeFileSync(state.outputPath, Buffer.from(await response.arrayBuffer())); save();
  }
  console.log(JSON.stringify({ phase, jobId: state.result._id, status: state.result.status, model: state.result.model, costUsd: state.result.providerCostUsd, errorCode: state.result.errorCode, outputPath: state.outputPath }));
}
