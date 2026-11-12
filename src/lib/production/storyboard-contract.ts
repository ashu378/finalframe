/** Functional storyboard contracts. Image candidates are alternatives, not shots. */
export const STORYBOARD_FRAME_KINDS = ['UPLOAD', 'PROJECT_REFERENCE', 'GENERATED', 'IMAGE_EDIT', 'ANGLE'] as const;
export type StoryboardFrameKind = typeof STORYBOARD_FRAME_KINDS[number];
export type GenerationGuide = 'IMAGE_REFERENCE' | 'FIRST_FRAME';
export const SHOT_DIRECTION_FIELDS = ['framing', 'angle', 'movement', 'lens', 'lighting', 'atmosphere', 'subjectPosition', 'action', 'expression', 'pacing'] as const;
export interface ShotDirecting {
  framing: string; angle: string; movement: string; lens: string; lighting: string;
  atmosphere: string; subjectPosition: string; action: string; expression: string; pacing: string;
  preserve: string[];
}
export type ShotDirection = ShotDirecting;
export interface StoryboardBinding { version: 1; frameId: string; generationGuide: GenerationGuide }
export interface StoryboardMediaProof { assetId: string; storageId: string; checksum: string; byteSize: number; mimeType: string }
export interface StoryboardFrameView {
  id: string; assetId: string; url: string | null; mimeType: string; kind: StoryboardFrameKind;
  sourceFrameId?: string; generationJobId?: string; direction: ShotDirecting; prompt: string;
  createdAt: number; available: boolean;
}
export interface StoryboardShotView {
  id: string; title: string; prompt: string; durationSeconds: number; orderIndex: number;
  camera: unknown; direction: ShotDirecting; metadata: unknown; selectedFrame: StoryboardBinding | null;
  selectedFrameDirectionOutdated: boolean;
  frames: StoryboardFrameView[];
  takes: Array<{ id: string; versionNumber: number; status: string; state: string; assetId?: string; url: string | null; mimeType?: string }>;
  hasMoreTakes: boolean;
}
export interface StoryboardView {
  projectId: string; productionId: string; productionVersionId: string; versionState: string; canEdit: boolean;
  totalShots: number; nextOffset: number | null;
  scenes: Array<{ id: string; title: string; purpose: string; visualDirection: string; orderIndex: number; sequenceId: string; orderedShotIds: string[]; shots: StoryboardShotView[] }>;
}
export function storyboardObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function normalizeShotDirecting(value: unknown): ShotDirecting {
  const raw = storyboardObject(value);
  if (Object.keys(raw).some(key => ![...SHOT_DIRECTION_FIELDS, 'preserve'].includes(key as never))) throw new Error('STORYBOARD_DIRECTION_INVALID');
  const result = {} as ShotDirecting;
  for (const field of SHOT_DIRECTION_FIELDS) {
    if (raw[field] !== undefined && typeof raw[field] !== 'string') throw new Error('STORYBOARD_DIRECTION_INVALID');
    const text = String(raw[field] ?? '').trim();
    if (text.length > 1000) throw new Error('STORYBOARD_DIRECTION_INVALID');
    result[field] = text;
  }
  const preserve = raw.preserve ?? [];
  if (!Array.isArray(preserve) || preserve.length > 20 || preserve.some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) throw new Error('STORYBOARD_DIRECTION_INVALID');
  result.preserve = [...new Set(preserve.map(item => item.trim()))];
  return result;
}
/** Legacy camera fields remain visible until the creator saves typed direction. */
export function resolveShotDirection(metadata:unknown,camera:unknown):ShotDirecting{
  const saved=storyboardObject(metadata);
  if(saved.directing!==undefined)return normalizeShotDirecting(saved.directing);
  const legacy=storyboardObject(camera),values:Record<string,unknown>={};
  for(const field of SHOT_DIRECTION_FIELDS)if(typeof legacy[field]==='string')values[field]=legacy[field];
  return normalizeShotDirecting(values);
}
export function parseStoryboardBinding(value: unknown): StoryboardBinding | null {
  if (value === undefined || value === null) return null;
  const raw = storyboardObject(value);
  if (Object.keys(raw).some(key => !['version', 'frameId', 'generationGuide'].includes(key)) || raw.version !== 1 || typeof raw.frameId !== 'string' || !raw.frameId || raw.frameId.length > 200 || !['IMAGE_REFERENCE', 'FIRST_FRAME'].includes(String(raw.generationGuide))) throw new Error('STORYBOARD_SELECTION_INVALID');
  return raw as unknown as StoryboardBinding;
}
export function stableStoryboardValue(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
    ? Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key] ?? null])) : row);
}
/** Only the selected prior storyboard frame is removed. Other cast/product references survive. */
export function selectedFrameAssetIds(current: string[], previousAssetId: string | undefined, selectedAssetId: string, protectedAssetIds: string[] = []): string[] {
  return [...new Set([...current.filter(id => id !== previousAssetId || protectedAssetIds.includes(id)), selectedAssetId])];
}
