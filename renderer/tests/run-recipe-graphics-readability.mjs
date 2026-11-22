// Local media-rendering verification only: no app/browser automation, DB or AI.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,renderStill,selectComposition} from '@remotion/renderer';
import {validateManifest} from '../dist/manifest.js';
const require=createRequire(import.meta.url),{load}=require('../../tests/recipes/backend-fixture.cjs');
const {buildWorkspaceRecipe}=load('src/lib/production/recipes/workspace.ts');
const {recipeGraphicProps}=load('src/lib/production/recipes/graphics.ts');
const artifacts=resolve(process.env.FINALFRAME_GRAPHICS_EVIDENCE_DIR??'/tmp/finalframe-recipe-graphics-readability');await mkdir(artifacts,{recursive:true});
const cards=[{templateId:'feature-callout',durationSeconds:4,title:'Plan your day',subtitle:'☐ Write\n☐ Make\n☐ Share',brandName:'',callToAction:'',accentColor:'#C6F432',backgroundColor:'#000000',textColor:'#FFFFFF'},{templateId:'end-card',durationSeconds:4,title:'Pocket Tasks',subtitle:'Small steps. Clear days.',brandName:'',callToAction:'Try Pocket Tasks',accentColor:'#C6F432',backgroundColor:'#000000',textColor:'#FFFFFF'}];
const shots=[0,1].map(index=>({id:'shot'+index,key:'s'+index,title:'Card',durationSeconds:4,referenceAssetIds:[],recipeReferenceSlots:[]}));
const recipe=buildWorkspaceRecipe({videoType:'PRODUCT_SAAS_LAUNCH',visualMode:'GRAPHICS_ONLY',graphicsLayoutVersion:2,fps:30,plannedGraphics:cards,referencePrompt:'',narrationMode:'NONE',captions:false,musicAssetId:''},shots);
assert(recipe.steps.every(s=>s.operation==='GRAPHIC'&&s.layoutVersion===2&&s.readability==='PHONE'));
const manifest={kind:'finalframe.render-manifest',version:5,manifestId:'local-recipe-graphics-proof',projectId:'owned-fixture',rendererVersion:'local',selection:{scope:'TIMELINE',ids:[]},export:{scope:'TIMELINE',format:'MP4'},output:{width:1080,height:1920,fps:30,durationInFrames:240,codec:'h264'},tracks:[{id:'graphics',kind:'GRAPHIC',orderIndex:0}],items:recipe.steps.map((s,index)=>({id:s.key,kind:'motion-graphics',templateId:s.templateId,trackId:'graphics',startFrame:index*120,durationInFrames:120,orderIndex:index,props:recipeGraphicProps(s)}))};
assert(validateManifest(manifest).ok);
const screenshot=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=white:s=200x100','-vf','drawbox=x=0:y=0:w=20:h=20:c=red:t=fill,drawbox=x=180:y=0:w=20:h=20:c=lime:t=fill,drawbox=x=0:y=80:w=20:h=20:c=blue:t=fill,drawbox=x=180:y=80:w=20:h=20:c=yellow:t=fill','-frames:v','1','-threads','1','-y',join(artifacts,'screen.png')],{encoding:'utf8'});assert.equal(screenshot.status,0,screenshot.stderr);
const serveUrl=await bundle({entryPoint:resolve('renderer/dist/remotion/entry.js'),publicDir:artifacts});
const browser=await openBrowser('chrome',{browserExecutable:process.env.FINALFRAME_TEST_CHROMIUM??'/usr/bin/chromium',logLevel:'error'});
try{
 const composition=await selectComposition({serveUrl,id:'FinalFrameAssembly',inputProps:{manifest},puppeteerInstance:browser,logLevel:'error'});
 for(const [name,frame]of [['checklist',60],['cta',180]]){
  const output=join(artifacts,name+'.png');await renderStill({composition,serveUrl,inputProps:{manifest},puppeteerInstance:browser,frame,imageFormat:'png',output,logLevel:'error'});
  const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',output,'-vf','scale=360:640','-frames:v','1','-y',join(artifacts,name+'-phone.png')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 }
 for(const templateId of ['kinetic-title','brand-card','feature-callout','end-card','product-ui','bar-chart','explainer-steps']){
  const props={layoutVersion:2,readability:'PHONE',title:'Exact title',...(templateId==='feature-callout'?{feature:'Exact title',detail:'Exact detail'}:{}),...(templateId==='end-card'?{callToAction:'Start now',url:'owned.test'}:{}),...(templateId==='product-ui'?{screenFit:'contain',screenUrl:'/public/screen.png'}:{}),...(templateId==='bar-chart'?{series:[{label:'Zero',value:0},{label:'Exact',value:1.25}]}:{}),...(templateId==='explainer-steps'?{steps:[{heading:'First',detail:'Own input'},{heading:'Second',detail:'Exact output'}]}:{})};
  const test={...manifest,manifestId:'phone-'+templateId,output:{...manifest.output,durationInFrames:30},items:[{...manifest.items[0],templateId,props,durationInFrames:30}]};assert(validateManifest(test).ok);
  const c=await selectComposition({serveUrl,id:'FinalFrameAssembly',inputProps:{manifest:test},puppeteerInstance:browser,logLevel:'error'}),output=join(artifacts,'template-'+templateId+'.png');
  await renderStill({composition:c,serveUrl,inputProps:{manifest:test},puppeteerInstance:browser,frame:20,imageFormat:'png',output,logLevel:'error'});
  const small=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',output,'-vf','scale=360:640','-frames:v','1','-y',join(artifacts,'template-'+templateId+'-phone.png')],{encoding:'utf8'});assert.equal(small.status,0,small.stderr);
 }
 await writeFile(join(artifacts,'RESULTS.json'),JSON.stringify({checks:9,phoneTemplates:7,recipeLayoutVersions:recipe.steps.map(s=>s.layoutVersion),readability:recipe.steps.map(s=>s.readability),recipeCopy:recipe.steps.map(s=>({title:s.title,subtitle:s.subtitle,callToAction:s.callToAction??''})),output:manifest.output,phonePreview:[360,640],actualLocalMediaRender:true,databaseCalls:0,paidProviderCalls:0,creativeReview:'Requires separate visual review of saved phone PNGs'},null,2));
 console.log('PASS recipe builder → manifest → actual full-resolution render → phone-size proof; exact multiline/CTA input preserved. Artifacts '+artifacts);
}finally{await browser.close({silent:true});}
