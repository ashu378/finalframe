const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('src/lib/ai/model-registry.ts', 'utf8');

// Registry contract checks keep unsafe discovery defaults from returning to
// production while still allowing explicit environment overrides.
assert.doesNotMatch(source, /model:\s*['"](?:auto|openrouter\/auto)['"]/);
assert.match(source, /RETIRED_MODEL_IDS/);
for (const model of [
  'openai/gpt-6-astra-pro',
  'openai/gpt-6-astra',
  'google/gemini-3.8-flash',
  'anthropic/claude-fable-5.1',
  'bytedance/seedance-2.5',
  'google/veo-3.1',
  'openai/sora-2-pro',
  'kwaivgi/kling-v3.0-pro',
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
