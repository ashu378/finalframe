const assert = require('node:assert/strict');
const fs = require('node:fs');

const generationJobs = fs.readFileSync('convex/generationJobs.ts', 'utf8');
const timeline = fs.readFileSync('convex/timeline.ts', 'utf8');
const assembly = fs.readFileSync('convex/assembly.ts', 'utf8');

assert.match(generationJobs, /ctx\.db\.patch\(job\.shotVersionId, \{ status: ['"]COMPLETED['"], assetId: args\.assetId/);
assert.match(timeline, /timelineClips[\s\S]*assetId[\s\S]*shotVersionId/);
assert.match(assembly, /source\.assetId/);
assert.match(assembly, /source\.shotVersionId/);
console.log(JSON.stringify({ ok: true, checked: 'asset-to-timeline' }));
