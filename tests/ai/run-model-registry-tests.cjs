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
  'bytedance/seedance-2.0-mini',
  'google/veo-3.1-lite',
  'openai/gpt-image-2',
  'openai/gpt-transcribe',
  'google/gemini-3.1-flash-tts-preview',
  'x-ai/grok-voice-tts-1.0',
  'microsoft/mai-transcribe-2',
]) assert.match(source, new RegExp(model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(source, /fallbackIds/);
assert.match(source, /costTier/);
assert.match(source, /inputModalities/);
assert.match(source, /outputModalities/);
assert.match(source, /isUnsafeAutoModel/);
assert.match(source, /openrouter\/auto-beta/);
for (const capability of ['planner', 'writer', 'director', 'orchestrator', 'validator', 'vision_qc', 'video_preview', 'video_final', 'tts', 'stt', 'image']) {
  assert.match(source, new RegExp(`['"]${capability}['"]`));
}
assert.match(source, /LOGICAL_CAPABILITY_REGISTRY/);
assert.match(source, /getModelForLogicalCapability/);
console.log(JSON.stringify({ ok: true, checked: 'model-registry' }));
