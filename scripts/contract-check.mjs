import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateManifest } from '../renderer/dist/manifest.js';
import { createAssemblyPlan } from '../renderer/dist/assembly/plan.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../renderer/fixtures/kinetic-title.json', import.meta.url), 'utf8'));
const valid = validateManifest(fixture);
assert.equal(valid.ok, true, 'the renderer fixture must validate');
assert.equal(createAssemblyPlan(fixture).durationInFrames, fixture.output.durationInFrames);

const duplicate = structuredClone(fixture);
duplicate.items = [duplicate.items[0], duplicate.items[0]];
assert.equal(validateManifest(duplicate).ok, false, 'duplicate render item IDs must be rejected');

const outOfBounds = structuredClone(fixture);
outOfBounds.items[0].durationInFrames = fixture.output.durationInFrames + 1;
assert.equal(validateManifest(outOfBounds).ok, false, 'out-of-bounds frame windows must be rejected');

console.log('FinalFrame renderer contracts: PASS');
