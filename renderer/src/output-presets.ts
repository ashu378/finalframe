export const OUTPUT_PRESETS = [
  { id: 'VERTICAL', label: 'Vertical', aspectRatio: '9:16', width: 1080, height: 1920 },
  { id: 'LANDSCAPE', label: 'Landscape', aspectRatio: '16:9', width: 1920, height: 1080 },
  { id: 'SQUARE', label: 'Square', aspectRatio: '1:1', width: 1080, height: 1080 },
  { id: 'PORTRAIT_FEED', label: 'Portrait feed', aspectRatio: '4:5', width: 1080, height: 1350 },
  { id: 'STANDARD_FRAME', label: 'Standard frame', aspectRatio: '4:3', width: 1440, height: 1080 },
  { id: 'TALL_FRAME', label: 'Tall frame', aspectRatio: '3:4', width: 1080, height: 1440 },
  { id: 'CINEMA', label: 'Cinema', aspectRatio: '21:9', width: 1680, height: 720 },
] as const;

export type OutputPresetId = typeof OUTPUT_PRESETS[number]['id'];
export type OutputPreset = typeof OUTPUT_PRESETS[number];
export const OUTPUT_FPS = [24, 25, 30, 50, 60] as const;
export const DEFAULT_OUTPUT_PRESET_ID: OutputPresetId = 'LANDSCAPE';
export const DEFAULT_OUTPUT_FPS = 30;
export const FORMAT_SAFE_INSET = .08;

/** Stored dimensions take precedence over a legacy project preset label. */
export function outputFormatLabel(value:unknown,width?:number,height?:number):string {
  if(typeof width==='number'&&Number.isFinite(width)&&width>0&&typeof height==='number'&&Number.isFinite(height)&&height>0)return OUTPUT_PRESETS.find(preset=>preset.width*height===preset.height*width)?.label??'Custom format';
  const id=normalizeOutputPresetId(value);return id?getOutputPreset(id).label:'Custom format';
}

/** Compatibility names only resolve at an explicit format boundary. */
export function normalizeOutputPresetId(value: unknown): OutputPresetId | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toUpperCase();
  if (key === 'SOCIAL_VERTICAL') return 'VERTICAL';
  if (['FULL_HD', 'FULL-HD', 'HD'].includes(key)) return 'LANDSCAPE';
  return OUTPUT_PRESETS.find(preset => preset.id === key)?.id ?? null;
}

export function getOutputPreset(value: unknown): OutputPreset {
  const id = normalizeOutputPresetId(value);
  const preset = OUTPUT_PRESETS.find(candidate => candidate.id === id);
  if (!preset) throw new Error('OUTPUT_PRESET_INVALID');
  return preset;
}
