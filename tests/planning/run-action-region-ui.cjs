const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),React=require('react');
const {getFunctionName}=require('convex/server');
let states=[],index=0;const calls=[];
const filename=path.resolve(__dirname,'../../src/components/production-workspace/story-repair-region.tsx'),mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod.require=name=>{
 if(name==='react')return{...React,useState(initial){const i=index++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}};
 if(name==='convex/react')return{useAction:ref=>async args=>{calls.push({name:getFunctionName(ref),args});},useMutation:ref=>async args=>{assert.deepEqual(Object.keys(args).sort(),['height','requirementKey','stationaryConfirmed','takeId','width','x','y'].sort());calls.push({name:getFunctionName(ref),args});}};
 if(name.endsWith('/_generated/api'))return{api:require('../../convex/_generated/api.js').api};
 if(name==='@/components/ui/button')return{Button:props=>React.createElement('button',props)};
 return require(name);
};
mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename);
const props={takeId:'take',requirementKey:'exact-source-key',source:{width:320,height:240,url:'https://fixture.invalid/video'},saved:{selection:{version:'ACTION_REGION_V1',mode:'STATIONARY_RECTANGLE',window:{startFrame:24,endFrame:48},x:64,y:80,width:96,height:96}}};
function render(){index=0;return mod.exports.StoryRepairRegion(props);}
function elements(node){return Array.isArray(node)?node.flatMap(elements):node&&typeof node==='object'&&node.props?[node,...elements(node.props.children)]:[];}
(async()=>{
 let tree=elements(render());assert.equal(calls.length,0);
 assert(tree.find(n=>n.type==='video').props.preload==='metadata');
 const checkbox=tree.find(n=>n.type==='input'&&n.props.type==='checkbox');checkbox.props.onChange({target:{checked:true}});
 tree=elements(render());tree.find(n=>n.props.onClick).props.onClick();await new Promise(setImmediate);
 assert.equal(calls[0].name,'storyActionRepairs:measureRegion');assert.equal(calls[1].name,'storyActionReviews:recordRepairRegion');assert.equal(calls[1].args.width,96);
 tree=elements(render());tree.filter(n=>n.type==='input'&&n.props.type==='number')[2].props.onChange({target:{value:'100'}});
 tree=elements(render());assert.equal(tree.find(n=>n.type==='input'&&n.props.type==='checkbox').props.checked,false);
 tree.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
 tree=elements(render());tree.find(n=>n.props.onClick).props.onClick();await new Promise(setImmediate);
 assert.equal(calls[3].args.width,100);assert.equal(calls[3].args.x,64);assert.equal(calls.length,4);
 console.log('PASS saved full region proof can be re-saved and edited without leaking extra mutation arguments; changes require confirmation; mount never purchases');
})().catch(error=>{console.error(error);process.exitCode=1});
