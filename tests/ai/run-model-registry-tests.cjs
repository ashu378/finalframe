const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('src/lib/ai/model-registry.ts', 'utf8');

// Registry contract checks keep unsafe discovery defaults from returning to
// production while still allowing explicit environment overrides.
assert.doesNotMatch(source, /model:\s*['"](?:auto|openrouter\/auto)['"]/);
for (const model of [
  'openai/gpt-6-astra',
  'google/gemini-3.8-flash',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-4o-mini',
  'google/veo-3.1-fast',
  'openai/gpt-image-2',
  'openai/gpt-transcribe',
  'openai/gpt-audio-mini',
]) assert.match(source, new RegExp(model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(source, /fallbackIds/);
assert.match(source, /costTier/);
assert.match(source, /inputModalities/);
assert.match(source, /outputModalities/);
assert.match(source, /isUnsafeAutoModel/);
assert.match(source, /openrouter\/auto-beta/);
console.log(JSON.stringify({ ok: true, checked: 'model-registry' }));
