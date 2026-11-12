import type { VideoType } from '../ai/video-routing';
export const CREATOR_PATHS = [
    { id: 'CREATE_VIDEO', label: 'Create a video', description: 'Turn an idea, script, recording, images, or mixed media into a video.' },
    { id: 'IMPROVE_FOOTAGE', label: 'Improve existing footage', description: 'Shape supplied clips, add scenes, captions, sound, or effects.' },
    { id: 'FOCUSED_TOOL', label: 'Use a focused tool', description: 'Work on a selected image or take inside the same project.' },
] as const;
export const CREATOR_INVOLVEMENT = [
    { id: 'HANDLE_FOR_ME', label: 'Handle it for me', description: 'Use recommended filmmaking choices. References, costs and the final cut still need your decisions.' },
    { id: 'KEY_STAGE_REVIEW', label: 'Review key stages', description: 'Inspect the script, creative guide, storyboard and final cut.' },
    { id: 'DIRECT_EVERY_TAKE', label: 'Direct every take', description: 'Inspect each shot, reference, action, camera, lighting, timing and sound.' },
] as const;
export const CREATOR_VIDEO_KINDS = [
    { id: 'COMEDY_SKIT', label: 'Comedy skit' }, { id: 'ADVERTISEMENT', label: 'Advertisement' },
    { id: 'EXPLAINER', label: 'Explainer' }, { id: 'CINEMATIC', label: 'Cinematic short or film' },
    { id: 'PRODUCT_DEMO', label: 'Product demonstration' }, { id: 'MUSIC_VIDEO', label: 'Music video' },
    { id: 'TALKING_HEAD', label: 'Talking-head video' }, { id: 'SOCIAL_CUTDOWN', label: 'Social cutdown' },
    { id: 'MOTION_GRAPHICS', label: 'Motion graphics' },
] as const;
export const CREATOR_VISUAL_STYLES = [
    { id: '2D_CARTOON', label: '2D cartoon' }, { id: '3D_ANIMATION', label: '3D animation' },
    { id: 'REALISTIC', label: 'Realistic' }, { id: 'ILLUSTRATED', label: 'Illustrated' }, { id: 'CUSTOM', label: 'Describe another treatment' },
] as const;
export const CREATOR_TOOLS = [
    { id: 'MOTION_TRANSFER', label: 'Motion guidance', description: 'Make a new interpretation using movement and an appearance reference; exact transfer is not guaranteed.' },
    { id: 'CHARACTER_REPLACE', label: 'Character replacement', description: 'Choose the performer to change and what should remain consistent.' },
    { id: 'OBJECT_REPLACE', label: 'Object or product replacement', description: 'Identify the target and provide its replacement reference.' },
    { id: 'RELIGHT', label: 'Relighting', description: 'Describe a lighting change for a selected image or take.' },
    { id: 'BACKGROUND_REPLACE', label: 'Background replacement', description: 'Describe the new environment and foreground to preserve.' },
    { id: 'MULTI_ANGLE', label: 'Explore camera angles', description: 'Explore compositions from an approved visual reference.' },
] as const;
export type CreatorIntent = {
    version: 1;
    path: typeof CREATOR_PATHS[number]['id'];
    involvement: typeof CREATOR_INVOLVEMENT[number]['id'];
    videoKind: typeof CREATOR_VIDEO_KINDS[number]['id'];
    visualStyle: { id: typeof CREATOR_VISUAL_STYLES[number]['id']; notes?: string };
    tool?: typeof CREATOR_TOOLS[number]['id'];
};
export class CreatorIntentValidationError extends Error {
    constructor() { super('Choose a valid creation path, involvement level, video type and visual style.'); }
}
function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CreatorIntentValidationError();
    return value as Record<string, unknown>;
}
function member<T extends string>(value: unknown, choices: ReadonlyArray<{id:T}>): T {
    if (typeof value !== 'string' || !choices.some(choice => choice.id === value)) throw new CreatorIntentValidationError();
    return value as T;
}
/** Preferences describe an experience. They never grant approval or spending authority. */
export function parseCreatorIntent(value: unknown): CreatorIntent | undefined {
    if (value === undefined) return undefined;
    const input=record(value),style=record(input.visualStyle);
    if (input.version!==1 || Object.keys(input).some(key=>!['version','path','involvement','videoKind','visualStyle','tool'].includes(key)) || Object.keys(style).some(key=>!['id','notes'].includes(key))) throw new CreatorIntentValidationError();
    if (style.notes!==undefined && (typeof style.notes!=='string' || style.notes.length>2000)) throw new CreatorIntentValidationError();
    const path=member(input.path,CREATOR_PATHS),tool=input.tool===undefined?undefined:member(input.tool,CREATOR_TOOLS);
    if (tool && path!=='FOCUSED_TOOL') throw new CreatorIntentValidationError();
    return {version:1,path,involvement:member(input.involvement,CREATOR_INVOLVEMENT),videoKind:member(input.videoKind,CREATOR_VIDEO_KINDS),visualStyle:{id:member(style.id,CREATOR_VISUAL_STYLES),...(typeof style.notes==='string'&&style.notes.trim()?{notes:style.notes.trim()}:{})},...(tool?{tool}:{})};
}
/** Explicit compatibility adapter. Style remains independently saved; no identity defaults. */
export function legacyVideoTypeForCreatorIntent(intent: CreatorIntent): VideoType {
    switch(intent.videoKind){
        case 'COMEDY_SKIT': return intent.visualStyle.id==='REALISTIC'?'REALISTIC_SKIT_UGC':intent.visualStyle.id==='2D_CARTOON'?'ANIMATED_COMEDY_2D':'CINEMATIC_FILM';
        case 'ADVERTISEMENT': case 'PRODUCT_DEMO': return 'PRODUCT_SAAS_LAUNCH';
        case 'EXPLAINER': return 'EXPLAINER_STORY';
        case 'CINEMATIC': return 'CINEMATIC_FILM';
        case 'MUSIC_VIDEO': return 'MUSIC_VIDEO';
        case 'TALKING_HEAD': return 'REALISTIC_SKIT_UGC';
        case 'SOCIAL_CUTDOWN': return 'SOCIAL_CUTDOWN';
        case 'MOTION_GRAPHICS': return 'MOTION_GRAPHICS';
    }
}
