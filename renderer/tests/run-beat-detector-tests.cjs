const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
Module._extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,filename);
const {detectBeats,assertBeatAnalysisResult,BEAT_ANALYSIS_VERSION,BEAT_ANALYSIS_LIMITS} = require(path.resolve(__dirname,'../src/media/beat-detector.ts'));
const rate = 16000;
function random(seed) { let value=seed>>>0;return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;}; }
function signal(times,duration=12,noise=0,tone=0) {
 const samples=new Float32Array(Math.round(duration*rate));const rng=random(41);
 for(let index=0;index<samples.length;index++) samples[index]=noise*(rng()*2-1)+tone*Math.sin(2*Math.PI*220*index/rate);
 for(const [at,time] of times.entries()) { const start=Math.round(time*rate);for(let index=0;index<rate*.025 && start+index<samples.length;index++){const hit=Math.sin(2*Math.PI*(1200+at%3*200)*index/rate)*Math.exp(-index/(rate*.004));samples[start+index]+=0.7*hit;} }
 return samples;
}
const grid=(bpm,duration=12,start=.5)=>Array.from({length:Math.ceil((duration-start)*bpm/60)},(_,index)=>start+index*60/bpm).filter(time=>time<duration-.03);
let checks=0;const results=[];
function check(name,run){run();checks++;console.log('PASS '+name);}
function accuracy(result,truth) {
 const matched=result.beatsSeconds.filter(beat=>Math.min(...truth.map(time=>Math.abs(time-beat)))<=.035).length;
 const recovered=truth.filter(time=>Math.min(...result.beatsSeconds.map(beat=>Math.abs(time-beat)))<=.035).length;
 return {precision:matched/Math.max(1,result.beatsSeconds.length),recall:recovered/truth.length};
}
check('automatic clean/noisy original click grids identify tempo and observed beat positions',()=>{
 for(const bpm of [60,90,120,150,180]) for(const noise of [0,.015]) {
  const truth=grid(bpm);const result=detectBeats(signal(truth,12,noise,.025));results.push({bpm,noise,outcome:result.outcome,confidence:result.confidence,tempo:result.tempoBpm,count:result.beatsSeconds.length});
  assert.equal(result.algorithmVersion,BEAT_ANALYSIS_VERSION);assert.equal(result.outcome,'RELIABLE',JSON.stringify(results.at(-1)));
  assert.ok(Math.abs(result.tempoBpm-bpm)<2,JSON.stringify(results.at(-1)));const score=accuracy(result,truth);assert.ok(score.precision>=.9&&score.recall>=.9,JSON.stringify({bpm,noise,score,result}));
 }
});
check('silence and a sustained tone do not manufacture a beat grid',()=>{
 const silence=detectBeats(new Float32Array(rate*8));assert.equal(silence.outcome,'SILENT');assert.deepEqual(silence.beatsSeconds,[]);assert.equal(silence.confidence,0);
 const tone=detectBeats(signal([],8,0,.2));assert.equal(tone.outcome,'NO_GRID');assert.deepEqual(tone.beatsSeconds,[]);
});
check('leading silence and missing percussive attacks retain source-relative observed times',()=>{
 const truth=grid(120,16,3).filter((_,index)=>index!==7);const result=detectBeats(signal(truth,16,.01));assert.equal(result.outcome,'RELIABLE',JSON.stringify(result));
 assert.ok(result.beatsSeconds[0]>=2.95,JSON.stringify(result));assert.ok(result.beatsSeconds.every(beat=>Math.min(...truth.map(time=>Math.abs(time-beat)))<=.035),'quiet missing beats are not silently invented');
});
check('tempo changes and irregular attacks report no reliable global grid',()=>{
 const changes=[...grid(120,6,.5),...grid(90,12,6.2)];const result=detectBeats(signal(changes));assert.equal(result.outcome,'AMBIGUOUS');assert.equal(result.reasonCode,'VARIABLE_TEMPO');assert.deepEqual(result.beatsSeconds,[]);assert.ok(result.tempoSegments.length>=2);
 const rng=random(8);const times=[];let time=.3;while(time<12){times.push(time);time+=.2+rng()*.85;}const irregular=detectBeats(signal(times));assert.notEqual(irregular.outcome,'RELIABLE',JSON.stringify(irregular));assert.deepEqual(irregular.beatsSeconds,[]);
});
check('short/invalid/oversized input and output bounds fail honestly',()=>{
 assert.equal(detectBeats(signal([.2,.7,1.2,1.7],2)).reasonCode,'TOO_SHORT');
 assert.throws(()=>detectBeats(new Float32Array(0)));assert.throws(()=>detectBeats(new Float32Array([NaN])));assert.throws(()=>detectBeats(new Float32Array([1.1])));assert.throws(()=>detectBeats(new Float32Array(rate*601)));
 assert.throws(()=>detectBeats(new Float32Array(rate*4),8000));
 assert.ok(results.every(result=>result.count<=BEAT_ANALYSIS_LIMITS.maxBeats&&result.confidence>=0&&result.confidence<=1));
 const valid=detectBeats(signal(grid(120)));assert.doesNotThrow(()=>assertBeatAnalysisResult(valid));
 assert.throws(()=>assertBeatAnalysisResult({...valid,beatsSeconds:new Array(5001).fill(0)}));
 assert.throws(()=>assertBeatAnalysisResult({...valid,tempoSegments:new Array(129).fill({startSeconds:0,endSeconds:1,bpm:120,confidence:.9})}));
 assert.throws(()=>assertBeatAnalysisResult({...valid,tempoSegments:[{startSeconds:0,endSeconds:1,bpm:120,confidence:Infinity}]}));
 assert.throws(()=>assertBeatAnalysisResult({...valid,outcome:'AMBIGUOUS'}));
});
console.log(JSON.stringify({originalFixtureResults:results}));
console.log(`Beat detector: ${checks} PASS; original local PCM only, no database/network/provider calls.`);
