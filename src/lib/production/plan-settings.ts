import { getOutputPreset } from '../../../renderer/src/output-presets';

export interface CanonicalPlanSettings {
  version: 1;
  requestedDurationSeconds: number;
  workflow: string;
  mode: string;
  language: string;
  outputPreset: string;
}
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
function validate(value:Record<string,unknown>):CanonicalPlanSettings {
  if(value.version!==1||typeof value.requestedDurationSeconds!=='number'||!Number.isFinite(value.requestedDurationSeconds)||value.requestedDurationSeconds<=0||value.requestedDurationSeconds>60)throw Error('PLAN_SETTINGS_INVALID');
  for(const key of ['workflow','mode'])if(typeof value[key]!=='string'||!/^[A-Z][A-Z0-9_]{0,79}$/.test(value[key] as string))throw Error('PLAN_SETTINGS_INVALID');
  if(typeof value.language!=='string'||!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value.language)||value.language.length>35||typeof value.outputPreset!=='string')throw Error('PLAN_SETTINGS_INVALID');
  getOutputPreset(value.outputPreset);
  return {version:1,requestedDurationSeconds:value.requestedDurationSeconds,workflow:value.workflow as string,mode:value.mode as string,language:value.language,outputPreset:value.outputPreset};
}
/** Existing expert workflow codes remain readable; supported creator workflows
 * are checked separately by the creator UI. This never invents defaults. */
export function readPlanSettings(input:unknown,legacy:{requestedDurationSeconds:number;workflow:string;inputMode:string;language:string;outputPreset:string}):CanonicalPlanSettings {
  const row=object(input),declared=row.canonicalPlanSettings;
  const settings=declared===undefined?validate({version:1,requestedDurationSeconds:row.requestedDurationSeconds??row.durationSeconds??legacy.requestedDurationSeconds,workflow:row.workflow??legacy.workflow,mode:row.mode??row.inputMode??legacy.inputMode,language:row.language??legacy.language,outputPreset:row.outputPreset??legacy.outputPreset}):validate(object(declared));
  for(const[key,field]of [['requestedDurationSeconds','requestedDurationSeconds'],['durationSeconds','requestedDurationSeconds'],['workflow','workflow'],['mode','mode'],['inputMode','mode'],['language','language'],['outputPreset','outputPreset']] as const)if(row[key]!==undefined&&row[key]!==settings[field])throw Error('PLAN_SETTINGS_CONFLICT');
  return settings;
}
export function freezePlanSettings(input:unknown,args:{durationSeconds:number;workflow:string;inputMode:string;language:string;outputPreset:string}):Record<string,unknown> & {canonicalPlanSettings:CanonicalPlanSettings} {
  const expected=validate({version:1,requestedDurationSeconds:args.durationSeconds,workflow:args.workflow,mode:args.inputMode,language:args.language,outputPreset:args.outputPreset}),source=object(input);
  // Treat supplied canonical/legacy declarations as deliberate intent. A caller
  // cannot overwrite contradictory choices by merely changing outer args.
  const actual=readPlanSettings(source,{requestedDurationSeconds:args.durationSeconds,workflow:args.workflow,inputMode:args.inputMode,language:args.language,outputPreset:args.outputPreset});
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('PLAN_SETTINGS_CONFLICT');
  return {...source,requestedDurationSeconds:expected.requestedDurationSeconds,workflow:expected.workflow,mode:expected.mode,language:expected.language,outputPreset:expected.outputPreset,canonicalPlanSettings:expected};
}
export function requirePlanDuration(plan:unknown,settings:CanonicalPlanSettings) {
  const body=object(plan);let total=0,count=0;
  if(!Array.isArray(body.sequences)||body.sequences.length>60)throw Error('PLAN_TOTAL_MISMATCH');
  for(const sequence of body.sequences){const scenes=object(sequence).scenes;if(!Array.isArray(scenes)||scenes.length>60)throw Error('PLAN_TOTAL_MISMATCH');for(const scene of scenes){const shots=object(scene).shots;if(!Array.isArray(shots)||shots.length>200)throw Error('PLAN_TOTAL_MISMATCH');for(const shot of shots){const duration=object(shot).durationSeconds;if(typeof duration!=='number'||!Number.isFinite(duration)||duration<=0||++count>200)throw Error('PLAN_TOTAL_MISMATCH');total+=duration;}}}
  if(!count||total>60||Math.abs(total-settings.requestedDurationSeconds)>0.000001)throw Error('PLAN_TOTAL_MISMATCH');
  return total;
}
