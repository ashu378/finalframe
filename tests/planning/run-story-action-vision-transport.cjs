const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{createHash}=require('node:crypto');
const {load,api}=require('../recipes/backend-fixture.cjs');
function subject(execute){
 const filename=path.resolve('convex/storyActionVision.ts'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 m.require=n=>{
  if(n==='./_generated/server')return{action:v=>v};if(n==='./_generated/api')return{internal:api};
  if(n.endsWith('model-discovery'))return{};if(n.endsWith('model-registry'))return{};
  if(n.endsWith('openrouter-adapter'))return{executeAITask:execute};
  if(n.endsWith('story-action-check'))return load('src/lib/production/story-action-check.ts');return require(n);
 };
 m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);return m.exports.run.handler;
}
function fixture(size=64){
 const bytes=Buffer.alloc(size,7),events=[],check={projectId:'project',requestKey:'request',takeId:'take',requirementKey:'requirement',expiresAt:Date.now()+60000,model:'reviewed/video',maximumCostUsd:1,priceCeiling:{prompt:1,completion:1}};
 const data={storageId:'owned-storage',byteSize:size,checksum:createHash('sha256').update(bytes).digest('hex'),requirementKey:'requirement',actions:[]};
 const ctx={storage:{get:async id=>{assert.equal(id,'owned-storage');return new Blob([bytes]);},getUrl:async id=>{assert.equal(id,'owned-storage');events.push(['url']);return'https://fixture.convex.cloud/api/storage/owned-storage';}},runQuery:async ref=>{if(ref==='storyActionChecks.quoteContext')return check;if(ref==='providerTextRequests.inspect')return null;if(ref==='storyActionChecks.context')return data;throw Error(ref);},runMutation:async(ref,args)=>{events.push([ref,args]);if(ref==='providerTextRequests.reserve')return{created:true,request:{_id:'receipt'}};return null;}};
 return{ctx,events,data,check};
}
(async()=>{
 for(const size of [64,2_000_001]){
  const f=fixture(size);let sent;
  const run=subject(async(_cap,messages,opts)=>{sent=messages;assert.deepEqual(opts.fallbackModels,[]);assert.equal(opts.maxRetries,0);await opts.beforeChatSubmit();return{content:'{}',modelUsed:'reviewed/video',requestId:'gen-ok',costUsd:.01};});
  await run(f.ctx,{checkId:'check'});const url=sent[0].content[1].video_url.url;
  assert.equal(url.startsWith('data:'),size<=2_000_000);if(size>2_000_000){assert.equal(url,'https://fixture.convex.cloud/api/storage/owned-storage');assert(f.events.findIndex(x=>x[0]==='url')<f.events.findIndex(x=>x[0]==='providerTextRequests.reserve'));}
  assert.equal(f.events.filter(x=>x[0]==='providerTextRequests.markSubmitting').length,1);
 }
 console.log('PASS small inline media and large authorized storage URL, with no fallback or duplicate purchase');
 for(const fault of ['checksum','missing-url']){const f=fixture(2_000_001);if(fault==='checksum')f.data.checksum='wrong';else f.ctx.storage.getUrl=async()=>null;await assert.rejects(subject(async()=>{throw Error('must not buy');})(f.ctx,{checkId:'check'}));assert(!f.events.some(x=>x[0]==='providerTextRequests.reserve'));}
 console.log('PASS changed bytes and unavailable storage fail before reservation');
 for(const diagnostic of [{status:413,requestId:'gen-safe_123',expected:'ACTION_CHECK_HTTP_413'},{status:'secret',requestId:'https://private.invalid/?key=secret',expected:'ACTION_CHECK_FAILED'}]){
  const f=fixture();const run=subject(async(_c,_m,o)=>{await o.beforeChatSubmit();throw Object.assign(new Error('PRIVATE_PROVIDER_TOKEN'),diagnostic);});await assert.rejects(run(f.ctx,{checkId:'check'}),/no automatic paid retry/);
  const finish=f.events.find(x=>x[0]==='providerTextRequests.finish')[1];assert.equal(finish.submitted,true);assert.equal(finish.errorCode,diagnostic.expected);assert.equal(finish.providerRequestId,diagnostic.status===413?'gen-safe_123':undefined);assert(!JSON.stringify(f.events).includes('PRIVATE_PROVIDER_TOKEN'));
 }
 console.log('PASS sanitized HTTP diagnostics retain submitted uncertainty and never leak provider errors');
 const f=fixture();f.ctx.runQuery=async ref=>ref==='storyActionChecks.quoteContext'?f.check:{_id:'receipt',status:'SUBMITTED'};await assert.rejects(subject(async()=>{throw Error('must not buy');})(f.ctx,{checkId:'check'}),/not be purchased twice/);assert(!f.events.some(x=>x[0]==='providerTextRequests.reserve'));console.log('PASS existing uncertain receipt blocks duplicate paid checks');
})().catch(e=>{console.error(e);process.exitCode=1});
