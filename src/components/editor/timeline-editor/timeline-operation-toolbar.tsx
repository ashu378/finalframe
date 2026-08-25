'use client';

import { ArrowDown, ArrowUp, Scissors, Undo2, Redo2, Replace, LockKeyhole } from 'lucide-react';
import type { TransitionKind } from '@/lib/render/contracts';

export type TimelineToolbarEvent =
  | { type: 'trim'; clipId: string; startSeconds: number; endSeconds: number }
  | { type: 'move'; clipId: string; direction: 'earlier' | 'later' }
  | { type: 'split'; clipId: string }
  | { type: 'replace'; clipId: string }
  | { type: 'transition'; clipId: string; transition: TransitionKind }
  | { type: 'audio-level'; clipId: string; volumeDb: number }
  | { type: 'undo' }
  | { type: 'redo' };

type TimelineToolbarInput =
  | { type: 'trim'; startSeconds: number; endSeconds: number }
  | { type: 'move'; direction: 'earlier' | 'later' }
  | { type: 'split' }
  | { type: 'replace' }
  | { type: 'transition'; transition: TransitionKind }
  | { type: 'audio-level'; volumeDb: number }
  | { type: 'undo' }
  | { type: 'redo' };

export interface TimelineOperationToolbarProps {
  selectedClipId?: string;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  transition?: TransitionKind;
  audioLevelDb?: number;
  disabled?: boolean;
  readOnly?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'error';
  onEvent: (event: TimelineToolbarEvent) => void;
  className?: string;
}

const transitions: TransitionKind[] = ['CUT', 'DISSOLVE', 'FADE', 'WIPE', 'SLIDE'];

export function TimelineOperationToolbar({
  selectedClipId,
  trimStartSeconds = 0,
  trimEndSeconds = 0,
  transition = 'CUT',
  audioLevelDb = 0,
  disabled = false,
  readOnly = false,
  canUndo = false,
  canRedo = false,
  saveStatus = 'saved',
  onEvent,
  className = '',
}: TimelineOperationToolbarProps) {
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
    <section aria-label="Timeline tools" className={`rounded-2xl border border-[#eadfce] bg-[#fffdf8] p-3 shadow-[0_10px_30px_rgba(61,43,29,0.06)] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0e7db] pb-3">
        <div className="flex items-center gap-2 text-sm text-[#5f5348]">
          {readOnly ? <LockKeyhole aria-hidden="true" className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-[#2f8f83]" aria-hidden="true" />}
          <span>{selectedClipId ? 'Selected take' : 'Select a take to edit'}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#786b5e]" role="status" aria-live="polite"><span className="h-1.5 w-1.5 rounded-full bg-[#d08b42]" aria-hidden="true" />{status}</div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium text-[#5f5348]">Trim start
          <input aria-label="Trim start in seconds" type="number" min="0" step="0.1" value={trimStartSeconds} disabled={locked || !selectedClipId} onChange={(e) => emit({ type: 'trim', startSeconds: Number(e.target.value), endSeconds: trimEndSeconds })} className="h-10 w-24 rounded-xl border border-[#ddcfbd] bg-white px-3 text-sm text-[#2f2924] outline-none ring-[#d08b42] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-[#5f5348]">Trim end
          <input aria-label="Trim end in seconds" type="number" min="0" step="0.1" value={trimEndSeconds} disabled={locked || !selectedClipId} onChange={(e) => emit({ type: 'trim', startSeconds: trimStartSeconds, endSeconds: Number(e.target.value) })} className="h-10 w-24 rounded-xl border border-[#ddcfbd] bg-white px-3 text-sm text-[#2f2924] outline-none ring-[#d08b42] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50" />
        </label>
        <div className="flex gap-1" role="group" aria-label="Reorder take">
          <button type="button" title="Move earlier" aria-label="Move earlier" disabled={locked || !selectedClipId} onClick={() => emit({ type: 'move', direction: 'earlier' })} className="tool-button"><ArrowUp aria-hidden="true" className="h-4 w-4" /></button>
          <button type="button" title="Move later" aria-label="Move later" disabled={locked || !selectedClipId} onClick={() => emit({ type: 'move', direction: 'later' })} className="tool-button"><ArrowDown aria-hidden="true" className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={locked || !selectedClipId} onClick={() => emit({ type: 'split' })} className="tool-action"><Scissors aria-hidden="true" className="h-4 w-4" />Split</button>
          <button type="button" disabled={locked || !selectedClipId} onClick={() => emit({ type: 'replace' })} className="tool-action"><Replace aria-hidden="true" className="h-4 w-4" />Replace</button>
        </div>
        <label className="grid gap-1 text-xs font-medium text-[#5f5348]">Transition
          <select aria-label="Transition" value={transition} disabled={locked || !selectedClipId} onChange={(e) => emit({ type: 'transition', transition: e.target.value as TransitionKind })} className="h-10 rounded-xl border border-[#ddcfbd] bg-white px-3 text-sm text-[#2f2924] outline-none ring-[#d08b42] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50">{transitions.map((item) => <option key={item} value={item}>{item[0] + item.slice(1).toLowerCase()}</option>)}</select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-[#5f5348]">Audio level (dB)
          <input aria-label="Audio level in decibels" type="number" min="-60" max="12" step="1" value={audioLevelDb} disabled={locked || !selectedClipId} onChange={(e) => emit({ type: 'audio-level', volumeDb: Number(e.target.value) })} className="h-10 w-28 rounded-xl border border-[#ddcfbd] bg-white px-3 text-sm text-[#2f2924] outline-none ring-[#d08b42] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50" />
        </label>
        <div className="ml-auto flex gap-1" role="group" aria-label="History">
          <button type="button" title="Undo" aria-label="Undo" disabled={!canUndo} onClick={() => emit({ type: 'undo' })} className="tool-button"><Undo2 aria-hidden="true" className="h-4 w-4" /></button>
          <button type="button" title="Redo" aria-label="Redo" disabled={!canRedo} onClick={() => emit({ type: 'redo' })} className="tool-button"><Redo2 aria-hidden="true" className="h-4 w-4" /></button>
        </div>
      </div>
      {readOnly && <p className="mt-3 flex items-center gap-2 text-xs text-[#786b5e]"><LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />This version is locked. Duplicate it to make changes.</p>}
      <style jsx>{`.tool-button{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:40px;border:1px solid #ddcfbd;border-radius:12px;background:#fff;color:#51463b;transition:background .2s,color .2s}.tool-button:hover:not(:disabled){background:#f7eee3;color:#2f2924}.tool-button:focus-visible,.tool-action:focus-visible{outline:3px solid #e3aa63;outline-offset:2px}.tool-button:disabled,.tool-action:disabled{cursor:not-allowed;opacity:.45}.tool-action{display:inline-flex;align-items:center;gap:7px;min-height:40px;border-radius:12px;background:#3f3430;color:#fff;padding:0 13px;font-size:13px;font-weight:600;transition:background .2s}.tool-action:hover:not(:disabled){background:#5a463e}@media (prefers-reduced-motion: reduce){.tool-button,.tool-action{transition:none}}`}</style>
    </section>
  );
}
