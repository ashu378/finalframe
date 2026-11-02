import { useLayoutEffect, useMemo, useState } from 'react';
import { cancelRender, continueRender, delayRender, useCurrentFrame } from 'remotion';
import type { CaptionStyle, CaptionTrack } from '../types.js';

const FONT = 'Arial, Helvetica, sans-serif';
const LINE_HEIGHT = 1.15;
interface CaptionLayout { fontSize: number; style: Required<CaptionStyle> }

/** Measure the complete text with the same browser/font/wrapping rules as the
 * export. Fit only down to 12px; unreadable overflow fails instead of clipping. */
function measureCaption(text: string, style: Required<CaptionStyle>, width: number, height: number): CaptionLayout {
  const element = document.createElement('div');
  Object.assign(element.style, { position: 'absolute', left: '-100000px', top: '0', width: `${width * 0.84}px`, boxSizing: 'border-box', padding: '4px 12px', fontFamily: FONT, fontWeight: '700', lineHeight: String(LINE_HEIGHT), whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
  element.textContent = text;
  document.body.appendChild(element);
  try {
    const fits = (fontSize: number) => {
      element.style.fontSize = `${fontSize}px`;
      const measured = element.getBoundingClientRect();
      return measured.height <= Math.min(style.maxLines * fontSize * LINE_HEIGHT + 8, height * 0.84) + 0.5 && element.scrollWidth <= measured.width + 1;
    };
    if (!fits(12)) throw new Error('The full caption cannot fit readably within its maxLines and viewport. Revise the cue or caption layout before exporting.');
    let low = 12; let high = style.fontSize;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (fits(middle)) low = middle; else high = middle - 1;
    }
    return { fontSize: low, style };
  } finally { element.remove(); }
}

export function CaptionLayer({ tracks, width, height }: { tracks: CaptionTrack[]; width: number; height: number }) {
  const frame = useCurrentFrame();
  const cues = useMemo(() => tracks.flatMap(track => track.cues.map(cue => ({ ...cue, trackId: track.id, style: { fontSize: 42, color: '#ffffff', backgroundColor: '#00000000', position: 'BOTTOM', maxLines: 3, ...track.style } as Required<CaptionStyle> }))), [tracks]);
  const [handle] = useState(() => delayRender('Checking complete caption layout'));
  const [layouts, setLayouts] = useState<Map<string, CaptionLayout> | null>(null);
  useLayoutEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      try {
        const measured = new Map(cues.map(cue => [JSON.stringify([cue.trackId, cue.id]), measureCaption(cue.text, cue.style, width, height)]));
        setLayouts(measured);
      } catch (error) { cancelRender(error instanceof Error ? error : new Error('Caption layout could not be verified.')); }
    });
    return () => { cancelled = true; continueRender(handle); };
  }, [cues, handle, width, height]);
  // Release the screenshot only after React commits the measured text layout.
  useLayoutEffect(() => { if (layouts) continueRender(handle); }, [layouts, handle]);
  if (!layouts) return null;
  return <>{cues.map(cue => {
    if (frame < cue.startFrame || frame >= cue.startFrame + cue.durationInFrames) return null;
    const layout = layouts.get(JSON.stringify([cue.trackId, cue.id]))!;
    const position = layout.style.position;
    return <div key={JSON.stringify([cue.trackId, cue.id])} aria-label={cue.text} style={{ position: 'absolute', left: '8%', right: '8%', top: position === 'TOP' ? '8%' : position === 'CENTER' ? '50%' : undefined, bottom: position === 'BOTTOM' ? '8%' : undefined, transform: position === 'CENTER' ? 'translateY(-50%)' : undefined, boxSizing: 'border-box', padding: '4px 12px', color: layout.style.color, backgroundColor: layout.style.backgroundColor, fontFamily: FONT, fontSize: layout.fontSize, fontWeight: 700, lineHeight: LINE_HEIGHT, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textAlign: 'center', textShadow: '0 2px 4px rgba(0,0,0,.9), 0 0 12px rgba(0,0,0,.7)' }}>{cue.text}</div>;
  })}</>;
}
