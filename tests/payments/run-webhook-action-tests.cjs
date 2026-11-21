const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const vm=require('node:vm');
let valid=true,seen=false,calls=0,writes=0;
const env={BACHS_ENVIRONMENT:'sandbox'};const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('convex/paymentWebhook.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports:mod.exports,module:mod,Buffer,process:{env},require:n=>n==='convex/values'?{v:new Proxy({},{get:()=>()=>({})})}:n==='./_generated/server'?{action:f=>f}:n==='./_generated/api'?{internal:{sandboxPaymentEvents:{receipt:'receipt',applyEvent:'apply'}}}:{verifyBachsSignature:()=>valid,BachsPaymentProvider:class{async reconcileCheckout(id){calls++;return{raw:{checkout_id:id}}}}}
});
const ctx={runQuery:async()=>seen,runMutation:async(_,args)=>{writes++;assert.equal(args.checkout?.checkout_id,'chk1');return{status:'COMPLETED'}}};
const input={rawBody:JSON.stringify({id:'event1',type:'collection.succeeded',data:{checkout_id:'chk1'}}),timestamp:'100',signature:'signed'};
(async()=>{
 valid=false;await assert.rejects(mod.exports.receive.handler(ctx,input),/signature/);assert.equal(calls,0);
 valid=true;seen=true;assert.equal((await mod.exports.receive.handler(ctx,input)).duplicate,true);assert.equal(calls,0);assert.equal(writes,0);
 seen=false;await mod.exports.receive.handler(ctx,input);assert.equal(calls,1);assert.equal(writes,1);
 await assert.rejects(mod.exports.receive.handler(ctx,{...input,rawBody:'x'.repeat(131073)}),/large/);
 env.BACHS_ENVIRONMENT='production';await assert.rejects(mod.exports.receive.handler(ctx,input),/not been activated/);
 console.log('PASS webhook action: signature gate, duplicate receipt before reconciliation, server lookup, bounded body and live denial');
})().catch(e=>{console.error(e);process.exitCode=1});
