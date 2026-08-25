const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const renderer = (relativePath) => require(path.join(root, 'renderer', 'dist', relativePath));

const failures = [];

async function check(label, callback) {
  try {
    await callback();
    console.log(`PASS  ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${label}: ${message}`);
    console.error(`FAIL  ${label}\n      ${message}`);
  }
}

function sourceHas(source, pattern, message) {
  assert.match(source, pattern, message);
}

function sourceDoesNotHave(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

async function main() {
await check('assembly requires a locked timeline before creating a manifest', () => {
  const assembly = read('convex/assembly.ts');
  const renderJobs = read('convex/renderJobs.ts');
  const contracts = read('src/lib/render/contracts.ts');

  sourceHas(contracts, /timelineVersionId/, 'assembly manifests must identify their timeline version');
  sourceHas(assembly, /timelineId|timelineVersionId/, 'assembly must receive a timeline selector');
  sourceHas(assembly, /LOCKED|lock(ed)?/i, 'assembly must enforce a locked timeline');
  sourceHas(renderJobs, /timelineId/, 'render jobs must retain the selected timeline');
});

await check('assembly rejects missing, outdated, and rights-invalid sources', () => {
  const assembly = read('convex/assembly.ts');
  const schema = read('convex/schema.ts');

  sourceHas(assembly, /no authorized canonical media|storage|getUrl/i, 'missing canonical media must block assembly');
  sourceHas(assembly, /OUTDATED|outdated/i, 'outdated takes or source dependencies must block assembly');
  sourceHas(assembly, /rights|consent|license/i, 'rights and consent must be checked before assembly');
  sourceHas(schema, /rights/, 'asset records must retain rights metadata');
  sourceHas(schema, /provenance/, 'asset records must retain provenance metadata');
});

await check('older take selection requires explicit confirmation', () => {
  const assembly = read('convex/assembly.ts');
  const productionOperations = read('convex/productionOperations.ts');

  sourceHas(
    assembly,
    /confirm(Older|ation)|allowOlder|olderVersion|explicitOlder/i,
    'selecting a non-latest completed take must require an explicit confirmation flag',
  );
  sourceHas(
    productionOperations,
    /confirm(Older|ation)|allowOlder|olderVersion|explicitOlder/i,
    'the older-version choice must be represented in the auditable operation input',
  );
});

await check('renderer callbacks are authenticated and idempotent', async () => {
  const { handleRendererCallback, signCallbackBody } = renderer('contracts/callback.js');
  const now = Date.parse('2026-08-25T10:00:00.000Z');
  const envelope = {
    version: 1,
    eventId: 'chunk4-render-event-1',
    eventType: 'render.completed',
    idempotencyKey: 'chunk4-render-job-1',
    jobId: 'chunk4-render-job-1',
    rendererVersion: 'chunk4-fixture',
    occurredAt: new Date(now).toISOString(),
    attempt: 1,
    payload: { outputPath: 'convex-storage://verified-export' },
  };
  const rawBody = JSON.stringify(envelope);
  const secret = 'chunk4-render-secret';
  const receipts = new Map();
  const store = {
    get: async (eventId) => receipts.get(eventId) || null,
    claim: async (receipt) => {
      if (receipts.has(receipt.eventId)) return 'duplicate';
      receipts.set(receipt.eventId, receipt);
      return 'claimed';
    },
  };
  const signature = signCallbackBody(rawBody, secret);
  const first = await handleRendererCallback(rawBody, signature, secret, store, { now: () => now });
  const duplicate = await handleRendererCallback(rawBody, signature, secret, store, { now: () => now });
  const forged = await handleRendererCallback(rawBody, 'sha256=forged', secret, store, { now: () => now });
  assert.deepEqual(first.result, { status: 'accepted', duplicate: false });
  assert.deepEqual(duplicate.result, { status: 'accepted', duplicate: true });
  assert.equal(forged.result.status, 'rejected');
  assert.equal(receipts.size, 1);

  const renderJobs = read('convex/renderJobs.ts');
  sourceHas(renderJobs, /requireMember/, 'Convex callback mutation must authenticate the owning studio');
  sourceHas(renderJobs, /status === "COMPLETED"|status === 'COMPLETED'/, 'completed callbacks must be idempotent');
});

await check('review exposes approval and revision states without pretending they are persisted', () => {
  const schema = read('convex/schema.ts');
  const reviewPanel = read('src/components/production/review/review-approval-panel.tsx');
  const finishPanel = read('src/components/render/finish-panel.tsx');

  sourceHas(schema, /CHANGES_REQUESTED/, 'review records must support revision requests');
  sourceHas(schema, /APPROVED/, 'review records must support approval');
  sourceHas(reviewPanel, /ReviewState = 'READY' \| 'CHANGES_REQUESTED' \| 'APPROVED'/, 'review UI must model ready, revision, and approved states');
  sourceHas(reviewPanel, /Ask for a change/, 'review UI must provide a revision action');
  sourceHas(reviewPanel, /Approve version/, 'review UI must provide an approval action');
  sourceHas(reviewPanel, /actionsAvailable/, 'review UI must make unavailable persistence explicit');
  sourceHas(finishPanel, /actionsAvailable=\{false\}/, 'the current finishing path must not claim that review actions are persisted');
});

await check('placeholder URLs cannot pass media validation or become downloads', () => {
  const { validateManifest } = renderer('manifest.js');
  const manifest = {
    kind: 'finalframe.render-manifest',
    version: 2,
    manifestId: 'chunk4-placeholder-manifest',
    projectId: 'chunk4-project',
    rendererVersion: 'chunk4-fixture',
    output: { width: 1920, height: 1080, fps: 30, durationInFrames: 30, codec: 'h264' },
    items: [{ id: 'placeholder-item', kind: 'video', src: 'https://example.com/placeholder.mp4', orderIndex: 0, startFrame: 0, durationInFrames: 30 }],
  };
  assert.equal(validateManifest(manifest).ok, false);
  const finishPanel = read('src/components/render/finish-panel.tsx');
  sourceHas(finishPanel, /no download link is available|no fake download/i, 'UI must not invent a download when output media is unavailable');
  sourceDoesNotHave(finishPanel, /example\.com|mock:|placeholder\.mp4/i, 'finishing UI must not embed placeholder output URLs');
});

await check('renderer-unavailable state is explicit and safe', () => {
  const finishPanel = read('src/components/render/finish-panel.tsx');
  const assemblyPanel = read('src/components/production/assembly/assembly-panel.tsx');
  sourceHas(finishPanel, /'UNAVAILABLE'/, 'finishing must model an unavailable renderer');
  sourceHas(finishPanel, /render service is not available|not connected yet/i, 'unavailable renderer must be explained to the user');
  sourceHas(finishPanel, /downloadUrl/, 'download must depend on a verified output URL');
  sourceHas(assemblyPanel, /UNAVAILABLE/, 'assembly must expose unavailable worker state');
  sourceHas(assemblyPanel, /No fake completion is shown/i, 'assembly must not present fake completion');
});

if (failures.length > 0) {
  console.error(`\nChunk 4 assembly/review QA: ${failures.length} FAILURE(S)`);
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('\nThese are release-gate findings. The test intentionally exits non-zero until the missing contracts are implemented.');
  process.exitCode = 1;
} else {
  console.log('\nChunk 4 assembly/review QA: PASS');
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
