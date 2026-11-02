'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CaptionStyle } from '../../../../renderer/src/types';
import { initialCaptionEditorStyle } from '@/lib/production/caption-controls';

export interface CaptionEditValue {
  language: string;
  style: CaptionStyle;
  cues: Array<{ id: string; startSeconds: number; durationSeconds: number; text: string; speaker?: string }>;
}
const field = 'w-full rounded-lg border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function ClipCaptionEditor({ snapshot, durationSeconds, fps, disabled, onSave }: { snapshot?: Record<string, unknown>; durationSeconds: number; fps: number; disabled: boolean; onSave: (value: CaptionEditValue) => void }) {
  const [language, setLanguage] = useState(String(snapshot?.language ?? 'en'));
  const [style, setStyle] = useState<CaptionStyle>(() => initialCaptionEditorStyle(snapshot?.style));
  const [cues, setCues] = useState<CaptionEditValue['cues']>(() => Array.isArray(snapshot?.cues) ? snapshot.cues.map((raw: any) => ({ id: String(raw.id), startSeconds: Number(raw.startFrame ?? 0) / fps, durationSeconds: Number(raw.durationInFrames ?? 0) / fps, text: String(raw.text ?? ''), ...(raw.speaker ? { speaker: String(raw.speaker) } : {}) })) : []);
  function change(index: number, patch: Partial<CaptionEditValue['cues'][number]>) { setCues(previous => previous.map((cue, at) => at === index ? { ...cue, ...patch } : cue)); }
  return <form className="space-y-4 rounded-2xl border border-border bg-card p-4" onSubmit={event => { event.preventDefault(); onSave({ language, style, cues }); }}>
    <div><h3 className="font-semibold">Captions for this clip</h3><p className="mt-1 text-sm text-muted-foreground">Times start at the beginning of this clip and snap to video frames. Saving creates a new timeline version. All words must fit; unreadable captions stop export.</p></div>
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 text-sm">Language code<input aria-label="Caption language" className={field} value={language} maxLength={32} onChange={event => setLanguage(event.target.value)} /></label>
      <label className="space-y-1 text-sm">Font size<input aria-label="Caption font size" className={field} type="number" min={12} max={120} value={style.fontSize} onChange={event => setStyle(previous => ({ ...previous, fontSize: Number(event.target.value) }))} /></label>
      <label className="space-y-1 text-sm">Maximum lines<input aria-label="Caption maximum lines" className={field} type="number" min={1} max={4} value={style.maxLines} onChange={event => setStyle(previous => ({ ...previous, maxLines: Number(event.target.value) }))} /></label>
      <label className="space-y-1 text-sm">Text color<input aria-label="Caption text color" className={`${field} h-10`} type="color" value={style.color} onChange={event => setStyle(previous => ({ ...previous, color: event.target.value }))} /></label>
      <label className="space-y-1 text-sm">Background color<input aria-label="Caption background color" className={field} value={style.backgroundColor} maxLength={9} pattern="#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?" onChange={event => setStyle(previous => ({ ...previous, backgroundColor: event.target.value }))} /><span className="text-xs text-muted-foreground">Hex color; optional final two digits set opacity.</span></label>
      <label className="space-y-1 text-sm">Position<select aria-label="Caption position" className={field} value={style.position} onChange={event => setStyle(previous => ({ ...previous, position: event.target.value as CaptionStyle['position'] }))}><option value="TOP">Top</option><option value="CENTER">Center</option><option value="BOTTOM">Bottom</option></select></label>
    </fieldset>
    {cues.map((cue, index) => <fieldset disabled={disabled} key={cue.id} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[7rem_7rem_1fr_auto]">
      <legend className="px-1 text-xs text-muted-foreground">Cue {index + 1}</legend>
      <label className="space-y-1 text-sm">Start (s)<input aria-label={`Cue ${index + 1} start`} className={field} type="number" min={0} max={durationSeconds} step={1 / fps} value={cue.startSeconds} onChange={event => change(index, { startSeconds: Number(event.target.value) })} /></label>
      <label className="space-y-1 text-sm">Length (s)<input aria-label={`Cue ${index + 1} length`} className={field} type="number" min={1 / fps} max={durationSeconds} step={1 / fps} value={cue.durationSeconds} onChange={event => change(index, { durationSeconds: Number(event.target.value) })} /></label>
      <label className="space-y-1 text-sm">Complete text<textarea aria-label={`Cue ${index + 1} text`} className={field} rows={2} maxLength={1024} required value={cue.text} onChange={event => change(index, { text: event.target.value })} /></label>
      <Button type="button" variant="secondary" onClick={() => setCues(previous => previous.filter((_, at) => at !== index))} aria-label={`Remove cue ${index + 1}`}>Remove</Button>
    </fieldset>)}
    <div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" disabled={disabled || cues.length >= 2000} onClick={() => setCues(previous => [...previous, { id: crypto.randomUUID(), startSeconds: previous.length ? Math.min(durationSeconds - 1 / fps, previous.at(-1)!.startSeconds + previous.at(-1)!.durationSeconds) : 0, durationSeconds: Math.min(2, durationSeconds), text: '' }])}>Add caption cue</Button><Button type="submit" disabled={disabled}>Save caption version</Button></div>
    {!cues.length && <p className="text-sm text-muted-foreground">Saving an empty list removes this clip’s captions from the new version.</p>}
  </form>;
}
