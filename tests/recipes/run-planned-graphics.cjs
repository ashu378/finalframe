const assert=require('node:assert/strict');
const {load}=require('./backend-fixture.cjs');
const {parsePlannedGraphics}=load('src/lib/production/planned-graphics.ts');
const {buildWorkspaceRecipe}=load('src/lib/production/recipes/workspace.ts');
const card={templateId:'kinetic-title',durationSeconds:2,title:'One small step',subtitle:'',brandName:'',callToAction:'',accentColor:'#C6F432',backgroundColor:'#0B0B0C',textColor:'#FFFFFF'};
const cards=[card,{...card,templateId:'end-card',title:'Start today'}];
const input={videoType:'MOTION_GRAPHICS',fps:30,plannedGraphics:cards,referencePrompt:'',narrationMode:'NONE',captions:false,musicAssetId:''};
const recipe=buildWorkspaceRecipe(input,[]);
assert.deepEqual(recipe.visualOrder,['graphic_1','graphic_2']);
assert.deepEqual(recipe.steps.map(s=>[s.title,s.durationFrames,s.accentColor,s.backgroundColor]),[['One small step',60,'#C6F432','#0B0B0C'],['Start today',60,'#C6F432','#0B0B0C']]);
assert(!recipe.steps.some(s=>s.operation==='GENERATION'||s.operation==='NARRATION'));
assert.deepEqual(parsePlannedGraphics(undefined),[]);
assert.equal(parsePlannedGraphics(cards,4).length,2);
assert.throws(()=>parsePlannedGraphics(cards,5),/DURATION/);
for(const bad of [{...card,title:''},{...card,durationSeconds:NaN},{...card,accentColor:'url(secret)'},{...card,sourceAssetId:'foreign'},{...card,templateId:'executable-code'},...['subtitle','textColor'].map(key=>{const c={...card};delete c[key];return c;})])assert.throws(()=>parsePlannedGraphics([bad]),/INVALID/);
assert.throws(()=>parsePlannedGraphics(Array(17).fill(card)),/INVALID/);
assert.throws(()=>parsePlannedGraphics([{...card,durationSeconds:40},{...card,durationSeconds:40}]),/DURATION/);
const parsed=parsePlannedGraphics(cards);parsed[0].title='Edited';assert.equal(cards[0].title,'One small step');assert.equal(recipe.steps[0].title,'One small step');
console.log('PASS planned graphic order, exact text/colours/timing, no AI footage, legacy compatibility, duration mismatch, invalid input denial and snapshot independence');
const {validateGraphicsOnlyPlan,plannedVisualMode}=load('src/lib/production/planned-graphics.ts');
const shot={durationSeconds:2,requiredAssetIds:[],operation:'GENERATE',audioPolicy:'SILENT',resourceBindings:[],dialogueSegments:[],storyActions:[]};
const plan={visualProductionMode:'GRAPHICS_ONLY',graphicCards:cards,sequences:[{scenes:[{shots:[shot,{...shot}]}]}]};
assert.equal(validateGraphicsOnlyPlan(plan,4),true);
assert.equal(validateGraphicsOnlyPlan({...plan,visualProductionMode:undefined},4),false,'legacy cards never imply free footage');
assert.equal(validateGraphicsOnlyPlan({...plan,visualProductionMode:'FOOTAGE'},4),false,'mixed plans keep footage route');
assert.throws(()=>plannedVisualMode({visualProductionMode:'FREE'}),/INVALID/);
assert.throws(()=>validateGraphicsOnlyPlan({...plan,graphicCards:[]},4),/REQUIRED/);
assert.throws(()=>validateGraphicsOnlyPlan(plan,8),/DURATION/);
for(const patch of [{requiredAssetIds:['source']},{operation:'EDIT'},{audioPolicy:'KEEP_SOURCE'},{storyActions:[{action:'walk'}]},{resourceBindings:[{}]},{dialogueSegments:[{}]},{metadata:{requiresFirstFrame:true}},{metadata:{previousJobId:'accepted'}}]){
 assert.throws(()=>validateGraphicsOnlyPlan({...plan,sequences:[{scenes:[{shots:[{...shot,...patch},{...shot}]}]}]},4),/CONFLICT/);
}
const workspaceShots=[0,1].map(index=>({id:`s${index}`,key:`sequence_0_scene_0_shot_${index}`,title:'card',durationSeconds:2,operation:'GENERATE',referenceAssetIds:[],recipeReferenceSlots:[]}));
for(const videoType of ['PRODUCT_SAAS_LAUNCH','EXPLAINER_STORY']){
 const configured={...input,videoType,visualMode:'GRAPHICS_ONLY',...(videoType==='EXPLAINER_STORY'?{narrationMode:'RECORDING',recordingAssetId:'approved-recording',recordingStartSeconds:0,recordingDurationSeconds:4}:{})};
 const result=buildWorkspaceRecipe(configured,workspaceShots);
 assert.deepEqual(result.visualOrder,['graphic_1','graphic_2']);
 assert.deepEqual(result.steps.filter(s=>s.operation==='GRAPHIC').map(s=>s.title),cards.map(c=>c.title));
 assert(!result.steps.some(s=>s.operation==='GENERATION'));
 assert.throws(()=>buildWorkspaceRecipe({...configured,plannedGraphics:[]},workspaceShots),/complete planned cards/);
 assert.throws(()=>buildWorkspaceRecipe({...configured,referencePrompt:'a person'},workspaceShots),/complete planned cards/);
 assert.throws(()=>buildWorkspaceRecipe(configured,[{...workspaceShots[0],durationSeconds:5}]),/DURATION/);
}
const mixed=buildWorkspaceRecipe({...input,videoType:'PRODUCT_SAAS_LAUNCH',visualMode:'GENERATE',graphicTemplate:'end-card',title:'CTA',subtitle:'',brandName:'',callToAction:'',graphicSeconds:2},workspaceShots);
assert.equal(mixed.steps.filter(s=>s.operation==='GENERATION').length,2,'cards cannot waive mixed footage purchases');
console.log('PASS explicit graphics-only product/explainer cards, narration retention, exact duration, mixed footage costs and conflicting controls');
(async()=>{
 const {fixture}=require('./backend-fixture.cjs');const ctx=fixture();
 const validate=load('convex/planningVideo.ts').validateAutomaticVideoPlan;
 const result=await validate(ctx,ctx.rows.get('project'),{videoType:'PRODUCT_SAAS_LAUNCH',mode:'IDEA',qualityTier:'STANDARD',inputAssetIds:[]},'FULL_HD',4,plan,'production',{});
 assert.equal(result.mode,'RENDERER');assert.deepEqual(result.shotSeconds,[2,2]);
 await assert.rejects(validate(ctx,ctx.rows.get('project'),{videoType:'PRODUCT_SAAS_LAUNCH',mode:'IDEA',qualityTier:'STANDARD',inputAssetIds:[]},'FULL_HD',4,{...plan,visualProductionMode:'FOOTAGE'},'production',{}));
 assert.equal(ctx.count('generationJobs'),0);assert.equal(ctx.count('providerBudgetReservations'),0);
 console.log('PASS canonical graphics validation without video catalog; FOOTAGE still requires compatible model; no purchases');
})().catch(error=>{console.error(error);process.exitCode=1;});

// Exercise the actual adapter's complete recursive strict-schema validation.
// A field omitted from required blocks ALL planning, even FOOTAGE with no cards.
const {buildStructuredResponseFormat}=load('src/lib/adapters/openrouter-adapter.ts');
const {LEGACY_DIRECTOR_PLAN_SCHEMA}=load('src/lib/production/planning-schema.ts');
const format=buildStructuredResponseFormat(LEGACY_DIRECTOR_PLAN_SCHEMA);
assert.equal(format.type,'json_schema');
assert.equal(format.json_schema.strict,true);
const broken=structuredClone(LEGACY_DIRECTOR_PLAN_SCHEMA);
broken.schema.properties.graphicCards.items.required=broken.schema.properties.graphicCards.items.required.filter(key=>key!=='narrationText');
assert.throws(()=>buildStructuredResponseFormat(broken),/graphicCards\[\].*require every property/);
assert.equal(parsePlannedGraphics([card])[0].narrationText,undefined,'historical omission remains readable without mutation');
assert.equal(parsePlannedGraphics([{...card,narrationText:''}])[0].narrationText,'','new non-explainer cards may explicitly have no speech');
console.log('PASS real adapter validates complete strict planning schema; optional-field regression rejected; old cards remain readable');
