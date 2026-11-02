import { validateCaptionStyle, validateCaptionText } from '../renderer/src/manifest';
import type { CaptionTrack } from '../renderer/src/types';

export function finishingV5Enabled() { return process.env.FINALFRAME_MANIFEST_V5_ENABLED === 'true'; }

export function finishingFps(metadata: Record<string, unknown>): number {
  const fps = metadata.fps ?? 30;
  if (typeof fps !== 'number' || ![24, 25, 30, 50, 60].includes(fps)) throw new Error('Choose a supported timeline frame rate.');
  return fps;
}

export function normalizeCaptionTrack(input: Record<string, unknown>, durationSeconds: number, fps: number, id: string): CaptionTrack {
  const language = input.language ?? 'en';
  if (typeof language !== 'string' || language.length > 32 || !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(language)) throw new Error('Choose a valid caption language.');
  const style = input.style ?? {};
  if (validateCaptionStyle(style).length) throw new Error('Caption style supports only font size, text/background colors, position and maximum lines.');
  if (!Array.isArray(input.cues) || input.cues.length > 2_000) throw new Error('Provide a bounded caption cue list.');
  const ids = new Set<string>();
  const cues = input.cues.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Every caption cue needs timing and complete text.');
    const cue = raw as Record<string, unknown>;
    const cueId = cue.id ?? `cue-${index + 1}`;
    if (typeof cueId !== 'string' || !cueId || cueId.length > 128 || ids.has(cueId)) throw new Error('Caption cue IDs must be unique and bounded.');
    ids.add(cueId);
    const start = typeof cue.startSeconds === 'number' ? cue.startSeconds : typeof cue.startFrame === 'number' ? cue.startFrame / fps : NaN;
    const duration = typeof cue.durationSeconds === 'number' ? cue.durationSeconds : typeof cue.endSeconds === 'number' ? cue.endSeconds - start : typeof cue.durationInFrames === 'number' ? cue.durationInFrames / fps : NaN;
    const startFrame = Math.round(start * fps); const durationInFrames = Math.round(duration * fps);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || start < 0 || duration <= 0 || durationInFrames < 1 || startFrame + durationInFrames > Math.round(durationSeconds * fps)) throw new Error('Caption timing must fit inside the selected clip after snapping to frames.');
    if (typeof cue.text !== 'string' || cue.text.length > 1_024 || validateCaptionText(cue.text).length) throw new Error('Keep complete plain caption text without markup, controls or blank separator lines.');
    if (cue.speaker !== undefined && (typeof cue.speaker !== 'string' || !cue.speaker || cue.speaker.length > 128)) throw new Error('Caption speaker names must be bounded text.');
    return { id: cueId, startFrame, durationInFrames, text: cue.text, ...(typeof cue.speaker === 'string' ? { speaker: cue.speaker } : {}) };
  }).sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));
  for (let index = 1; index < cues.length; index++) if (cues[index].startFrame < cues[index - 1].startFrame + cues[index - 1].durationInFrames) throw new Error('Caption cues on one track cannot overlap. Revise their timing.');
  const track: CaptionTrack = { id, language, style: style as Record<string, unknown>, cues };
  if (new TextEncoder().encode(JSON.stringify(track)).length > 64 * 1024) throw new Error('This caption track is too large for one clip. Split it into shorter caption edits.');
  return track;
}

export function cropCaptionTrack(track: CaptionTrack, fromSeconds: number, toSeconds: number, fps: number): CaptionTrack {
  const start = Math.round(fromSeconds * fps); const end = Math.round(toSeconds * fps);
  return { ...track, cues: track.cues.flatMap(cue => {
    const cueStart = Math.max(start, cue.startFrame); const cueEnd = Math.min(end, cue.startFrame + cue.durationInFrames);
    return cueEnd > cueStart ? [{ ...cue, startFrame: cueStart - start, durationInFrames: cueEnd - cueStart }] : [];
  }) };
}
