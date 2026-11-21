const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.resolve(__dirname, '../../src/lib/credits/service.ts');
const subject = new Module(file, module);
subject.require = name => {
  if (name === './pricing') return { VIDEO_CREDITS_PER_SECOND: { ECONOMY: 8, STANDARD: 16, PREMIUM: 32 } };
  if (name.includes('convex')) return {};
  throw new Error('Unexpected estimate dependency: ' + name);
};
subject._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
(async () => {
  const input = { shotCount: 1, videoSeconds: 4, qualityTier: 'STANDARD', needsAssembly: true };
  const generated = await subject.exports.estimateProductionCost(input);
  assert.equal(generated.totalCredits, 67);
  const graphics = await subject.exports.estimateProductionCost({ ...input, rendererOnly: true });
  assert.equal(graphics.totalCredits, 3);
  assert.deepEqual(graphics.lineItems.map(x => x.operation), ['ASSEMBLY']);
  const spokenGraphics = await subject.exports.estimateProductionCost({ ...input, rendererOnly: true, hasVoice: true, needsCaptions: true });
  assert.deepEqual(spokenGraphics.lineItems.map(x => x.operation), ['TRANSCRIPTION', 'CAPTIONS', 'ASSEMBLY']);
  console.log('PASS graphics omit AI video estimates; generated footage and audio/caption costs remain explicit');
})().catch(error => { console.error(error); process.exitCode = 1; });
