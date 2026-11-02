import type { CaptionStyle } from '../../../renderer/src/types';

/** Legacy v4 may retain style keys that were never rendered. Offer only the
 * supported controls; invalid values on supported keys must still be reviewed
 * by the user and rejected by the server, rather than silently substituted. */
export function initialCaptionEditorStyle(value: unknown): CaptionStyle {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const style: Record<string, unknown> = { fontSize: 42, color: '#ffffff', backgroundColor: '#00000000', position: 'BOTTOM', maxLines: 3 };
  for (const key of ['fontSize', 'color', 'backgroundColor', 'position', 'maxLines']) if (Object.prototype.hasOwnProperty.call(source, key)) style[key] = source[key];
  return style as CaptionStyle;
}

/** Keep each canonical track separate: matching language alone does not mean
 * that overlapping cues or placement choices form one subtitle stream. */
export function captionTrackDownloadName(language: string, trackId: string, format: 'srt' | 'vtt'): string {
  return `finalframe-captions-${encodeURIComponent(language)}-track-${encodeURIComponent(trackId)}.${format}`;
}
