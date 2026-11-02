import type { CaptionTrack } from './types.js';
import { validateCaptionText } from './manifest.js';

function timestamp(frame: number, fps: number, separator: ',' | '.') {
  const milliseconds = Math.round(frame * 1000 / fps);
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(Math.floor(milliseconds / 3_600_000))}:${pad(Math.floor(milliseconds / 60_000) % 60)}:${pad(Math.floor(milliseconds / 1000) % 60)}${separator}${pad(milliseconds % 1000, 3)}`;
}

/** Both sidecars derive from one exact cue snapshot. Reject unrepresentable
 * separators/markup rather than modifying or dropping any caption wording. */
export function serializeCaptionSidecars(track: CaptionTrack, fps: number): { srt: string; vtt: string } {
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw new Error('Caption sidecars require a supported integer frame rate.');
  if (!track.cues.length || track.cues.length > 2_000) throw new Error('Caption sidecars require a bounded nonempty cue track.');
  const cues = [...track.cues].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));
  for (const cue of cues) {
    if (!Number.isSafeInteger(cue.startFrame) || cue.startFrame < 0 || !Number.isSafeInteger(cue.durationInFrames) || cue.durationInFrames < 1 || !Number.isSafeInteger(cue.startFrame + cue.durationInFrames) || cue.text.length > 1_024 || validateCaptionText(cue.text).length) throw new Error('Caption sidecars require valid frame-timed complete plain cue text.');
  }
  const blocks = (separator: ',' | '.') => cues.map((cue, index) => {
    const text = cue.text.replace(/\r\n/g, '\n');
    const encodedText = separator === '.' ? text.replace(/&/g, '&amp;') : text;
    return `${index + 1}\n${timestamp(cue.startFrame, fps, separator)} --> ${timestamp(cue.startFrame + cue.durationInFrames, fps, separator)}\n${encodedText}`;
  }).join('\n\n');
  return { srt: `${blocks(',')}\n`, vtt: `WEBVTT\n\n${blocks('.')}\n` };
}
