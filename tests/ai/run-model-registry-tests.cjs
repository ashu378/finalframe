const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

const filename = 'src/lib/ai/model-registry.ts';
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function registry(overrides = {}) {
  const saved = { ...process.env };
  try {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('OPENROUTER_') && /_MODELS?$/.test(key)) delete process.env[key];
    }
    Object.assign(process.env, overrides);
    const compiled = new Module(filename, module);
    compiled._compile(code, filename);
    return compiled.exports;
  } finally {
    for (const key of Object.keys(overrides)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}
const active = registry();
const expected = {
  planner: 'openai/gpt-6.2-astra-pro', director: 'openai/gpt-6.2-astra-pro',
  writer: 'openai/gpt-6.2-astra-pro', orchestrator: 'openai/gpt-6.2-astra-pro',
  validator: 'google/gemini-4-carbon', vision_qc: 'google/gemini-4-carbon',
  video_final: 'bytedance/seedance-2.5', video_preview: 'bytedance/seedance-2.0-mini',
  image: 'openai/gpt-image-2.6-sunburst', tts: 'google/gemini-3.8-flash-tts',
  stt: 'openai/gpt-transcribe', music: 'google/lyria-3-clip-preview', sfx: 'bytedance-seed/seed-audio-1-0',
};
for (const [task, model] of Object.entries(expected)) {
  const config = active.getModelForLogicalCapability(task);
  assert.equal(config.id, model, task);
  assert.ok(config.inputModalities.length && config.outputModalities.length && config.costTier, task);
}
assert.ok(active.getFallbackModelsForLogicalCapability('planner').includes('anthropic/claude-fable-5.2'));
assert.deepEqual(active.getFallbackModelsForLogicalCapability('vision_qc'), ['google/gemini-3.8-flash']);
assert.ok(active.getModelForLogicalCapability('vision_qc').inputModalities.includes('video'));
assert.ok(!active.getModelForLogicalCapability('planner').inputModalities.includes('video'));
assert.ok(active.getFallbackModelsForLogicalCapability('image').includes('openai/gpt-image-2'));
assert.ok(active.getFallbackModelsForLogicalCapability('stt').includes('x-ai/grok-stt-2.0'));
assert.ok(!active.getRegisteredModelIds().includes('openai/sora-2-pro'));
assert.equal(active.REVIEWED_OPERATION_CONTRACTS.suppliedAudioAvatar.modelId, 'heygen/avatar-iv');
assert.equal(active.PREPARATION_MODELS.narration.id, 'mistralai/voxtral-mini-tts-3-0');
assert.equal(active.PREPARATION_MODELS.storyboard.id, 'qwen/qwen-image-3-pro');

const amended = registry({
  OPENROUTER_PLANNER_MODEL: 'test/approved-planner',
  OPENROUTER_PLANNER_FALLBACK_MODELS: 'openrouter/auto-beta,test/allowed-fallback',
  OPENROUTER_VALIDATION_MODEL: 'openrouter/auto',
  OPENROUTER_VIDEO_FINAL_FALLBACK_MODELS: 'openai/sora-2-pro,google/veo-3.1',
});
assert.equal(amended.getModelForLogicalCapability('planner').id, 'test/approved-planner');
assert.deepEqual(amended.getFallbackModelsForLogicalCapability('planner'), ['test/allowed-fallback']);
assert.equal(amended.getModelForLogicalCapability('vision_qc').id, expected.vision_qc);
assert.deepEqual(amended.getFallbackModelsForLogicalCapability('video_final'), ['google/veo-3.1']);
console.log('PASS active model defaults, task modalities, separate preview/final and operation contracts, compatible fallbacks and administrator overrides');
