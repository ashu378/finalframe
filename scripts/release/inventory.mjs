import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const destination=path.join(root,'docs/creator-workflows/release-route-inventory.json');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
const paths=walk(path.join(root,'src/app'));
const routes=paths.filter(f=>/(?:page|route)\.(?:tsx?|jsx?)$/.test(f)).map(f=>{
 const source=path.relative(root,f).split(path.sep).join('/');
 const segments=path.relative(path.join(root,'src/app'),path.dirname(f)).split(path.sep).filter(s=>s&&!s.startsWith('(')&&!s.startsWith('@'));
 const route='/'+segments.join('/');
 const kind=path.basename(f).startsWith('route.')?'api':'page';
 const area=route.startsWith('/admin')?'platform':route.startsWith('/dashboard/settings/operations')?'studio-operations':route.startsWith('/dashboard')?'creator':route.startsWith('/legal')?'policy':route.startsWith('/onboarding')?'legacy-onboarding':route.startsWith('/review/')?'client-review':/^\/(login|signup|verify-email|forgot-password|reset-password|auth)/.test(route)?'authentication':kind==='api'?'api':'public';
 return {route,kind,area,source,testId:`route:${kind}:${route}`,acceptance:'PENDING'};
}).sort((a,b)=>a.route.localeCompare(b.route)||a.kind.localeCompare(b.kind));
const sections=['overview','plan','storyboard','canvas','media','takes','edit','review','export'];
const output={version:1,description:'Discovered route inventory; PENDING is not proof of acceptance. Browser results must bind route/test identity to revision, role, expected response and persisted effects.',emailAndPayments:'LAST_DISABLED',routes,workspaceSections:sections,requiredStates:['anonymous','authorized','wrong-role-or-project','loading','empty','validation-error','runtime-error','desktop','mobile','keyboard','reduced-motion','webgl-unavailable'],requiredRecipeIds:['ANIMATED_COMEDY_2D','REALISTIC_SKIT_UGC','PRODUCT_SAAS_LAUNCH','MOTION_GRAPHICS','EXPLAINER_STORY','CINEMATIC_FILM','MUSIC_VIDEO','SOCIAL_CUTDOWN'],requiredOperationIds:['GENERATE','FRAME_TO_VIDEO','EDIT','APPEARANCE_EDIT','OBJECT_REPLACE','PERFORMANCE_TRANSFER','EXTEND','LIP_SYNC','UPSCALE','MASKED_EDIT','REFERENCE_VOICE','STT','TTS','MUSIC_GENERATION','SFX_GENERATION']};
if(process.argv.includes('--write')){fs.writeFileSync(destination,JSON.stringify(output,null,2)+'\n');console.log(`Inventoried ${routes.length} routes, ${sections.length} workspace sections; acceptance remains PENDING.`);}else{const saved=JSON.parse(fs.readFileSync(destination,'utf8'));assert.deepEqual(saved.routes.map(({route,kind,source,testId})=>({route,kind,source,testId})),routes.map(({route,kind,source,testId})=>({route,kind,source,testId})),'New/moved route needs inventory and browser acceptance assignment.');assert.deepEqual(saved.requiredRecipeIds,output.requiredRecipeIds);assert.deepEqual(saved.requiredOperationIds,output.requiredOperationIds);assert.equal(new Set(saved.routes.map(r=>r.testId)).size,saved.routes.length);console.log(`PASS release-inventory: ${routes.length} routes; no acceptance inferred.`);}
