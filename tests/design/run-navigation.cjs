const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../..');
function load(file, stubs) {
  const filename = path.join(root, file), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(stubs, name) ? stubs[name] : normal(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const Link = ({children,...props}) => React.createElement('a',props,children);
let pathname = '/dashboard', navigated = 0;
const nav = load('src/components/layout/studio-navigation.tsx', {'next/link':Link,'next/navigation':{usePathname:()=>pathname}});
const flatten = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(flatten) : [tree,...flatten(tree.props?.children)];
const links = () => flatten(nav.StudioNavigation({onNavigate:()=>navigated++})).filter(x=>x.type===Link);
for (const [route,selected] of [['/dashboard','/dashboard'],['/dashboard/projects/p/workspace','/dashboard/projects'],['/dashboard/settings/team','/dashboard/settings'],['/dashboard/assets','/dashboard/assets']]) {
  pathname=route;
  assert.deepEqual(links().filter(x=>x.props['aria-current']==='page').map(x=>x.props.href),[selected]);
}
console.log('PASS nested routes mark exactly one studio destination active');
assert.deepEqual(links().map(x=>x.props.href),['/dashboard','/dashboard/projects','/dashboard/assets','/dashboard/templates','/dashboard/settings']);
links()[0].props.onClick();assert.equal(navigated,1);
console.log('PASS all existing destinations survive and selection closes mobile navigation');
let opened=0,closed=0,focused=0,refs=0,effect;
const dialog={showModal(){opened++},close(){closed++},getBoundingClientRect(){return{left:40}}};
const menu = load('src/components/layout/mobile-studio-menu.tsx',{
  react:{...React,useRef:()=>({current:refs++===0?dialog:{focus(){focused++}}}),useEffect:fn=>{effect=fn}},
  'next/link':Link,'next/navigation':{usePathname:()=>pathname},
  './studio-navigation':nav,'@/components/auth/sign-out-button':{SignOutButton:()=>null}
});
const tree=flatten(menu.MobileStudioMenu()), trigger=tree.find(x=>x.props?.['aria-label']==='Open studio menu'), modal=tree.find(x=>x.type==='dialog');
trigger.props.onClick();assert.equal(opened,1);assert.equal(trigger.props['aria-haspopup'],'dialog');assert.equal(modal.props['aria-labelledby'],'studio-menu-title');
console.log('PASS mobile trigger opens native focus-contained accessible dialog');
modal.props.onClose();assert.equal(focused,1);
tree.find(x=>x.props?.['aria-label']==='Close studio menu').props.onClick();assert.equal(closed,1);
effect();assert.equal(closed,2);
console.log('PASS close control and route changes close menu; native close returns focus');
modal.props.onClick({target:dialog,currentTarget:dialog,clientX:10});assert.equal(closed,3);
modal.props.onClick({target:{},currentTarget:dialog,clientX:10});assert.equal(closed,3);
assert(tree.some(x=>x.type===nav.StudioNavigation));
assert(tree.some(x=>x.props?.href==='/dashboard/create'));
console.log('PASS backdrop closes without treating navigation content as backdrop');
const markup=renderToStaticMarkup(React.createElement(nav.StudioNavigation));assert(markup.includes('Studio navigation'));
console.log('PASS navigation renders with semantic link labels');
console.log('6 navigation groups passed; no database or provider calls.');
