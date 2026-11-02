'use client';

import { ArrowDown, ArrowUp, Scissors, Undo2, Redo2, Replace, LockKeyhole } from 'lucide-react';
import type { TransitionKind } from '@/lib/render/contracts';
import { useState } from 'react';

export type TimelineToolbarEvent =
  | { type: 'trim'; clipId: string; startSeconds: number; endSeconds: number }
  | { type: 'move'; clipId: string; direction: 'earlier' | 'later' }
  | { type: 'split'; clipId: string }
  | { type: 'replace'; clipId: string }
  | { type: 'transition'; clipId: string; transition: TransitionKind; durationSeconds: number; audioPolicy: 'PRESERVE' | 'CROSSFADE'; trimSoundtrackToPicture: boolean }
  | { type: 'audio-level'; clipId: string; volumeDb: number }
  | { type: 'undo' }
  | { type: 'redo' };

type TimelineToolbarInput =
  | { type: 'trim'; startSeconds: number; endSeconds: number }
  | { type: 'move'; direction: 'earlier' | 'later' }
  | { type: 'split' }
  | { type: 'replace' }
  | { type: 'transition'; transition: TransitionKind; durationSeconds: number; audioPolicy: 'PRESERVE' | 'CROSSFADE'; trimSoundtrackToPicture: boolean }
  | { type: 'audio-level'; volumeDb: number }
  | { type: 'undo' }
  | { type: 'redo' };

export interface TimelineOperationToolbarProps {
  selectedClipId?: string;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  transition?: TransitionKind;
  transitionDurationSeconds?: number;
  transitionAudioPolicy?: 'PRESERVE' | 'CROSSFADE';
  finishingV5Enabled?: boolean;
  canTransition?: boolean;
  canReplace?: boolean;
  canMoveEarlier?: boolean;
  canMoveLater?: boolean;
  canAdjustAudio?: boolean;
  audioMuted?: boolean;
  transitionImpact?: (overlapSeconds: number) => { musicTailSeconds: number; protectedAudioOverrun: boolean };
  audioLevelDb?: number;
  maxAudioLevelDb?: number;
  disabled?: boolean;
  readOnly?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'error';
  onEvent: (event: TimelineToolbarEvent) => void;
  className?: string;
}

// Only expose effects that survive canonical assembly and real rendering.
const transitions: TransitionKind[] = ['CUT', 'DISSOLVE', 'FADE', 'WIPE', 'SLIDE'];

export function TimelineOperationToolbar({
  selectedClipId,
  trimStartSeconds = 0,
  trimEndSeconds = 0,
  transition = 'CUT',
  transitionDurationSeconds = 0.25,
  transitionAudioPolicy = 'PRESERVE',
  finishingV5Enabled = false,
  canTransition = false,
  canReplace = false,
  canMoveEarlier = false,
  canMoveLater = false,
  canAdjustAudio = false,
  audioMuted = false,
  transitionImpact,
  audioLevelDb = 0,
  maxAudioLevelDb = 0,
  disabled = false,
  readOnly = false,
  canUndo = false,
  canRedo = false,
  saveStatus = 'saved',
  onEvent,
  className = '',
}: TimelineOperationToolbarProps) {
  const [chosenTransition, setChosenTransition] = useState(transition);
  const [overlap, setOverlap] = useState(transitionDurationSeconds || 0.25);
  const [audioPolicy, setAudioPolicy] = useState(transitionAudioPolicy);
  const [trimSoundtrack, setTrimSoundtrack] = useState(false);
  const impact = transitionImpact?.(chosenTransition === 'CUT' ? 0 : overlap) ?? { musicTailSeconds: 0, protectedAudioOverrun: false };
  const locked = disabled || readOnly;
  const emit = (event: TimelineToolbarInput) => {
    if (locked && event.type !== 'undo' && event.type !== 'redo') return;
    if (event.type === 'undo' || event.type === 'redo') {
      onEvent(event);
      return;
    }
    if (!selectedClipId) return;
    onEvent({ ...event, clipId: selectedClipId } as TimelineToolbarEvent);
  };
  const status = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved changes' : saveStatus === 'error' ? 'Could not save' : 'Saved';

  return (
    <section aria-label="Timeline tools" className={`rounded-2xl border border-[#263143] bg-[#101722] p-3 shadow-[0_10px_30px_rgba(61,43,29,0.06)] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263143] pb-3">
        <div className="flex items-center gap-2 text-sm text-[#91a0b8]">
          {readOnly ? <LockKeyhole aria-hidden="true" className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-[#9be3c3]" aria-hidden="true" />}
          <span>{selectedClipId ? 'Selected take' : 'Select a take to edit'}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#91a0b8]" role="status" aria-live="polite"><span className="h-1.5 w-1.5 rounded-full bg-[#86a7ff]" aria-hidden="true" />{status}</div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium text-[#91a0b8]">Trim start
          <input aria-label="Trim start in seconds" type="number" min="0" step="0.1" value={trimStartSeconds} disabled={locked || !selectedClipId} onChange={(e) => emit({ type: 'trim', startSeconds: Number(e.target.value), endSeconds: trimEndSeconds })} className="h-10 w-24 rounded-xl border border-[#263143] bg-[#151b25] px-3 text-sm text-[#eaf0fa] outline-none ring-[#86a7ff] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-[#91a0b8]">Trim end
          <input aria-label="Trim end in seconds" type="number" min="0" step="0.1" value={trimEndSeconds} disabled={locked || !selectedClipId} onChange={(e) => emit({ type: 'trim', startSeconds: trimStartSeconds, endSeconds: Number(e.target.value) })} className="h-10 w-24 rounded-xl border border-[#263143] bg-[#151b25] px-3 text-sm text-[#eaf0fa] outline-none ring-[#86a7ff] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50" />
        </label>
        <div className="flex gap-1" role="group" aria-label="Reorder take">
          <button type="button" title="Move earlier" aria-label="Move earlier" disabled={locked || !selectedClipId || !canMoveEarlier} onClick={() => emit({ type: 'move', direction: 'earlier' })} className="tool-button"><ArrowUp aria-hidden="true" className="h-4 w-4" /></button>
          <button type="button" title="Move later" aria-label="Move later" disabled={locked || !selectedClipId || !canMoveLater} onClick={() => emit({ type: 'move', direction: 'later' })} className="tool-button"><ArrowDown aria-hidden="true" className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={locked || !selectedClipId} onClick={() => emit({ type: 'split' })} className="tool-action"><Scissors aria-hidden="true" className="h-4 w-4" />Split</button>
          <button type="button" disabled={locked || !selectedClipId || !canReplace} onClick={() => emit({ type: 'replace' })} className="tool-action"><Replace aria-hidden="true" className="h-4 w-4" />Replace</button>
        </div>
        <label className="grid gap-1 text-xs font-medium text-[#91a0b8]">Transition
          <select aria-label="Transition" value={finishingV5Enabled ? chosenTransition : transition} disabled={locked || !selectedClipId || finishingV5Enabled && !canTransition} onChange={(e) => { const next = e.target.value as TransitionKind; setChosenTransition(next); if (!finishingV5Enabled) emit({ type: 'transition', transition: next, durationSeconds: 0, audioPolicy: 'PRESERVE', trimSoundtrackToPicture: false }); }} className="h-10 rounded-xl border border-[#263143] bg-[#151b25] px-3 text-sm text-[#eaf0fa] outline-none ring-[#86a7ff] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50">{(finishingV5Enabled ? transitions : ['CUT']).map((item) => <option key={item} value={item}>{item[0] + item.slice(1).toLowerCase()}</option>)}</select>
        </label>
        {finishingV5Enabled && <>
          <label className="grid gap-1 text-xs font-medium text-[#91a0b8]">Overlap (s)<input aria-label="Transition overlap in seconds" type="number" min={0.02} max={2} step={0.05} value={overlap} disabled={locked || !canTransition || chosenTransition === 'CUT'} onChange={event => setOverlap(Number(event.target.value))} className="h-10 w-24 rounded-xl border border-[#263143] bg-[#151b25] px-3 text-sm text-[#eaf0fa]" /></label>
          <label className="grid gap-1 text-xs font-medium text-[#91a0b8]">Original clip audio<select aria-label="Transition original audio policy" value={audioPolicy} disabled={locked || !canTransition} onChange={event => setAudioPolicy(event.target.value as 'PRESERVE' | 'CROSSFADE')} className="h-10 rounded-xl border border-[#263143] bg-[#151b25] px-3 text-sm text-[#eaf0fa]"><option value="PRESERVE">Keep original gain</option><option value="CROSSFADE">Crossfade original audio</option></select></label>
          <button type="button" className="tool-action" disabled={locked || !canTransition || impact.protectedAudioOverrun || impact.musicTailSeconds > 0 && !trimSoundtrack} onClick={() => emit({ type: 'transition', transition: chosenTransition, durationSeconds: chosenTransition === 'CUT' ? 0 : overlap, audioPolicy, trimSoundtrackToPicture: trimSoundtrack })}>Apply transition</button>
        </>}
        <label className="grid gap-1 text-xs font-medium text-[#91a0b8]">Audio level (dB)
          <input aria-label="Audio level in decibels" type="number" min="-60" max={maxAudioLevelDb} step="any" value={audioMuted ? '' : audioLevelDb} placeholder={audioMuted ? 'Muted' : undefined} disabled={locked || !selectedClipId || !canAdjustAudio} onChange={(e) => { if (e.target.value !== '') emit({ type: 'audio-level', volumeDb: Number(e.target.value) }); }} className="h-10 w-28 rounded-xl border border-[#263143] bg-[#151b25] px-3 text-sm text-[#eaf0fa] outline-none ring-[#86a7ff] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50" />
          {canAdjustAudio && audioMuted ? <span className="max-w-52 text-xs text-[#91a0b8]">Muted. Enter a level to enable this clip’s audio.</span> : null}
        </label>
        <div className="ml-auto flex gap-1" role="group" aria-label="History">
          <button type="button" title="Undo" aria-label="Undo" disabled={!canUndo} onClick={() => emit({ type: 'undo' })} className="tool-button"><Undo2 aria-hidden="true" className="h-4 w-4" /></button>
          <button type="button" title="Redo" aria-label="Redo" disabled={!canRedo} onClick={() => emit({ type: 'redo' })} className="tool-button"><Redo2 aria-hidden="true" className="h-4 w-4" /></button>
        </div>
      </div>
      {finishingV5Enabled && impact.musicTailSeconds > 0 && <label className="mt-3 flex items-start gap-2 text-sm text-[#eaf0fa]"><input aria-label="Allow soundtrack tail trimming" type="checkbox" checked={trimSoundtrack} disabled={locked} onChange={event => setTrimSoundtrack(event.target.checked)} className="mt-1" /><span>Shorten soundtrack tail by {impact.musicTailSeconds.toFixed(2)}s to fit the new picture. Only music and ambience may be shortened; the previous version is retained.</span></label>}
      {finishingV5Enabled && impact.protectedAudioOverrun && <p className="mt-3 text-sm text-[#f6c85f]" role="status">Trim or move dialogue, voiceover and sound effects before applying this shorter transition edit.</p>}
      {readOnly && <p className="mt-3 flex items-center gap-2 text-xs text-[#91a0b8]"><LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />This version is locked. Duplicate it to make changes.</p>}
      <style jsx>{`.tool-button{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:40px;border:1px solid #263143;border-radius:12px;background:#151b25;color:#eaf0fa;transition:background .2s,color .2s}.tool-button:hover:not(:disabled){background:#1c2533;color:#eaf0fa}.tool-button:focus-visible,.tool-action:focus-visible{outline:3px solid #86a7ff;outline-offset:2px}.tool-button:disabled,.tool-action:disabled{cursor:not-allowed;opacity:.45}.tool-action{display:inline-flex;align-items:center;gap:7px;min-height:40px;border-radius:12px;background:#405f9f;color:#151b25;padding:0 13px;font-size:13px;font-weight:600;transition:background .2s}.tool-action:hover:not(:disabled){background:#4e6fba}@media (prefers-reduced-motion: reduce){.tool-button,.tool-action{transition:none}}`}</style>
    </section>
  );
}
