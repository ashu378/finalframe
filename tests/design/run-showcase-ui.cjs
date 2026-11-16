const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '../..');
function load(file, stubs) {
  const filename = path.join(root, file), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod); mod.require = name => Object.hasOwn(stubs, name) ? stubs[name] : normal(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const flatten = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(flatten) : [tree,...flatten(tree.props?.children)];
function hooksHarness() {
 let cursor=0,queued=[],oldRefs=[];const cells=[],effectDeps=[];const focused=[];
 const hooks={...React,useCallback:fn=>fn,
  useState(initial){const slot=cursor++;if(!(slot in cells))cells[slot]=typeof initial==='function'?initial():initial;return[cells[slot],value=>cells[slot]=typeof value==='function'?value(cells[slot]):value]},
  useRef(initial){const slot=cursor++;if(!(slot in cells))cells[slot]={current:initial};return cells[slot]},
  useEffect(fn,deps){const slot=cursor++,previous=effectDeps[slot];if(!previous||deps.some((value,index)=>value!==previous[index])){effectDeps[slot]=deps;queued.push(fn)}}
 };
 function render(component){cursor=0;const tree=component();for(const ref of oldRefs)typeof ref==='function'?ref(null):ref.current=null;oldRefs=[];
  for(const article of flatten(tree).filter(x=>x.type==='article')){
   const heading=flatten(article).find(x=>x.type==='h3')?.props.children;
   for(const element of flatten(article).filter(x=>x.props?.ref)){const ref=element.props.ref,node={focus(){focused.push(heading)}};typeof ref==='function'?ref(node):ref.current=node;oldRefs.push(ref)}
  }
  const jobs=queued;queued=[];for(const fn of jobs)fn();return tree;
 }
 return{hooks,render,focused};
}
const fixtures=[{title:'Original comedy',type:'Comedy',image:'/showcase/comedy.webp',video:'/showcase/comedy.mp4',description:'Original scene'},{title:'Original film',type:'Film',image:'/showcase/cinema.webp',video:'/showcase/cinema.mp4',description:'Original scene'},{title:'Still image',type:'Still',image:'/showcase/still.webp',description:'Image only'}];
const harness=hooksHarness();
const {ShowcaseGallery}=load('src/components/finalframe/showcase-gallery.tsx',{react:harness.hooks,'next/image':()=>null,'@/content/marketing':{showcaseItems:fixtures}});
let tree=harness.render(ShowcaseGallery);
const elements=()=>flatten(tree),videos=()=>elements().filter(x=>x.type==='video'),articles=()=>elements().filter(x=>x.type==='article');
const samplePlay=index=>flatten(articles()[index]).find(x=>x.type==='button'&&x.props.children?.some?.(v=>v==='Play sample'));
const close=()=>elements().find(x=>x.type==='button'&&x.props['aria-label']?.startsWith('Close '));
assert.equal(videos().length,0);assert(samplePlay(0));assert(samplePlay(1));assert.equal(samplePlay(2),undefined);assert.equal(samplePlay(0).props['aria-label'],'Play Comedy sample');assert.equal(samplePlay(1).props['aria-label'],'Play Film sample');
console.log('PASS initial gallery mounts no video sources; image-only items have no false playback action');
samplePlay(0).props.onClick();tree=harness.render(ShowcaseGallery);assert.equal(videos().length,1);assert.equal(videos()[0].props.src,fixtures[0].video);assert.equal(videos()[0].props.controls,true);assert.equal(videos()[0].props.playsInline,true);assert.equal(videos()[0].props.autoPlay,true);assert.equal(close().props['aria-label'],'Close Comedy sample');
console.log('PASS explicit play mounts exactly the selected video with native controls and inline playback');
samplePlay(1).props.onClick();tree=harness.render(ShowcaseGallery);assert.equal(videos().length,1);assert.equal(videos()[0].props.src,fixtures[1].video);assert.equal(harness.focused.length,0);
console.log('PASS switching samples removes the previous video rather than starting concurrent playback');
const oldKey=videos()[0].key;videos()[0].props.onError();tree=harness.render(ShowcaseGallery);const alert=elements().find(x=>x.props?.role==='alert');assert(alert);const retry=flatten(alert).find(x=>x.type==='button');assert(retry);retry.props.onClick();tree=harness.render(ShowcaseGallery);assert.equal(elements().filter(x=>x.props?.role==='alert').length,0);assert.notEqual(videos()[0].key,oldKey);assert.equal(videos()[0].props.src,fixtures[1].video);assert.equal(videos().length,1);
console.log('PASS playback failure shows recovery; deliberate retry remounts the same source and clears the error');
close().props.onClick();tree=harness.render(ShowcaseGallery);assert.equal(videos().length,0);assert.deepEqual(harness.focused,['Original film']);assert(samplePlay(1));
console.log('PASS closing unmounts the media and restores focus to its own newly mounted play button');
samplePlay(0).props.onClick();tree=harness.render(ShowcaseGallery);assert(!elements().some(x=>x.props?.role==='alert'));close().props.onClick();tree=harness.render(ShowcaseGallery);assert.deepEqual(harness.focused,['Original film','Original comedy']);
console.log('PASS later playback starts clean and focus restoration follows the latest selected sample');
console.log('6 actual-component showcase groups passed. No browser, database, provider or media network calls.');

// Exercise the actual lazy wrapper's visibility/motion gate without loading Three.js.
const oldWindow=global.window,oldObserver=global.IntersectionObserver;
let currentState=false,effectPending,cleanup,observer,loaderRuns=0;
const host={id:'showcase-host'},listeners=new Set(),media={matches:false,addEventListener:(_event,fn)=>listeners.add(fn),removeEventListener:(_event,fn)=>listeners.delete(fn)};
global.window={matchMedia:()=>media};
global.IntersectionObserver=class{constructor(callback){this.callback=callback;this.disconnected=false;observer=this}observe(node){assert.equal(node,host)}disconnect(){this.disconnected=true}};
global.window.IntersectionObserver=global.IntersectionObserver;
const DynamicScene=()=>null;
const wrapper=load('src/components/threeui/interactive-showcase.tsx',{
 'next/image':()=>null,
 'next/dynamic':(loader,options)=>{assert.equal(options.ssr,false);assert.equal(typeof loader,'function');loaderRuns++;return DynamicScene},
 react:{...React,useRef:()=>({current:host}),useState:()=>[currentState,value=>{currentState=value}],useEffect:fn=>{effectPending=fn}}
});
let wrapperTree=wrapper.InteractiveShowcase();assert.notEqual(wrapperTree.props.children.type,DynamicScene);cleanup=effectPending();
assert.equal(loaderRuns,1);observer.callback([{isIntersecting:true}]);wrapperTree=wrapper.InteractiveShowcase();assert.equal(wrapperTree.props.children.type,DynamicScene);
observer.callback([{isIntersecting:false}]);wrapperTree=wrapper.InteractiveShowcase();assert.notEqual(wrapperTree.props.children.type,DynamicScene);
console.log('PASS actual lazy wrapper activates only near the viewport and unmounts the GPU scene when away');
observer.callback([{isIntersecting:true}]);media.matches=true;for(const listener of listeners)listener();wrapperTree=wrapper.InteractiveShowcase();assert.notEqual(wrapperTree.props.children.type,DynamicScene);assert.equal(currentState,false);
cleanup();assert.equal(observer.disconnected,true);assert.equal(listeners.size,0);
delete global.window.IntersectionObserver;wrapperTree=wrapper.InteractiveShowcase();assert.doesNotThrow(()=>effectPending());assert.notEqual(wrapperTree.props.children.type,DynamicScene);assert.equal(listeners.size,0);
console.log('PASS missing IntersectionObserver leaves usable static content without initializing motion listeners');
global.window=oldWindow;global.IntersectionObserver=oldObserver;
console.log('PASS reduced-motion change restores the static scene and cleanup releases visibility/motion observers');
console.log('Visibility/motion/fallback checks passed; GPU rendering and playback quality require browser evidence.');
const sceneHarness=hooksHarness();
const scene=load('src/components/threeui/interactive-scene.tsx',{react:{...sceneHarness.hooks,useEffect:()=>{}},'next/image':()=>null});
let sceneTree=sceneHarness.render(scene.InteractiveShowcase);
const sceneNodes=()=>flatten(sceneTree),reel=()=>sceneNodes().find(x=>x.props?.['data-webgl']),left=()=>sceneNodes().find(x=>x.props?.['aria-label']==='Turn scenes left'),right=()=>sceneNodes().find(x=>x.props?.['aria-label']==='Turn scenes right');
assert.equal(reel().props['data-webgl'],'fallback');left().props.onClick();sceneTree=sceneHarness.render(scene.InteractiveShowcase);assert.equal(left().props.disabled,true);assert.equal(right().props.disabled,false);assert.equal(reel().props.style['--reel-x'],-.75);
reel().props.onPointerLeave();sceneTree=sceneHarness.render(scene.InteractiveShowcase);assert.equal(left().props.disabled,false);assert.equal(right().props.disabled,false);assert.equal(reel().props.style['--reel-x'],0);
console.log('PASS fallback scene arrow controls change the view; reset clears both angle and disabled-end state');
reel().props.onPointerMove({clientX:1000,clientY:-100,currentTarget:{getBoundingClientRect:()=>({left:0,top:0,width:200,height:100})}});sceneTree=sceneHarness.render(scene.InteractiveShowcase);assert.equal(reel().props.style['--reel-x'],1);assert.equal(reel().props.style['--reel-y'],-1);reel().props.onPointerCancel();sceneTree=sceneHarness.render(scene.InteractiveShowcase);assert.equal(reel().props.style['--reel-x'],0);assert.equal(reel().props.style['--reel-y'],0);
console.log('PASS pointer position is bounded and canceled touch interaction returns to the resting view');
console.log('11 showcase groups passed; WebGL pixels/fallback layout remain browser checks.');
