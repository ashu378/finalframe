'use client';

import { useMemo, useState } from 'react';
import { Film, Loader2, LockKeyhole, MousePointer2 } from 'lucide-react';
import type { TimelineTrack, TimelineVersion, TransitionKind } from '@/lib/render/contracts';
import { TimelineOperationToolbar, type TimelineToolbarEvent } from './timeline-operation-toolbar';

export type TimelineEditEvent =
  | { type: 'select-clip'; clipId: string | null }
  | { type: 'undo' }
  | { type: 'redo' }
  | (Exclude<TimelineToolbarEvent, { type: 'undo' } | { type: 'redo' }> & { clipId: string; trackId: string });

export interface TimelineEditorProps {
  timeline?: Pick<TimelineVersion, 'id' | 'status' | 'durationSeconds' | 'tracks'> | { id: string; status: TimelineVersion['status']; durationSeconds: number; tracks: TimelineTrack[] };
  isLoading?: boolean;
  readOnly?: boolean;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'error';
  canUndo?: boolean;
  canRedo?: boolean;
  onEdit: (event: TimelineEditEvent) => void;
}

export function TimelineEditor({ timeline, isLoading = false, readOnly = false, saveStatus, canUndo, canRedo, onEdit }: TimelineEditorProps) {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const selected = useMemo(() => timeline?.tracks.flatMap((track) => track.clips.map((clip) => ({ clip, track }))).find(({ clip }) => clip.id === selectedClipId), [timeline, selectedClipId]);
  const isLocked = readOnly || timeline?.status === 'LOCKED' || timeline?.status === 'APPROVED' || Boolean(selected?.track.locked);
  if (isLoading) return <div role="status" aria-label="Loading timeline" className="grid min-h-72 place-items-center rounded-2xl border border-[#eadfce] bg-[#fffdf8] text-sm text-[#786b5e]"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Loading your edit</div>;
  if (!timeline) return <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-[#ddcfbd] bg-[#fffdf8] p-6 text-center"><Film className="mb-3 h-7 w-7 text-[#d08b42]" aria-hidden="true" /><h2 className="font-semibold text-[#2f2924]">Your timeline will appear here</h2><p className="mt-1 max-w-sm text-sm text-[#786b5e]">Generate or add a take before making edits.</p></div>;
  return <section aria-label="Practical timeline editor" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[.16em] text-[#9a806c]">Finishing studio</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-[#2f2924]">Shape the timing</h2></div>{isLocked && <span className="inline-flex items-center gap-2 rounded-full bg-[#f4ede4] px-3 py-2 text-xs font-medium text-[#6f5c4c]"><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />Locked version</span>}</div>
    <TimelineOperationToolbar selectedClipId={selectedClipId ?? undefined} trimStartSeconds={selected?.clip.startSeconds ?? 0} trimEndSeconds={(selected?.clip.startSeconds ?? 0) + (selected?.clip.durationSeconds ?? 0)} transition={selected?.clip.transitionIn?.kind ?? 'CUT'} audioLevelDb={selected?.clip.kind === 'AUDIO' ? selected.clip.volumeDb ?? 0 : 0} disabled={!selectedClipId} readOnly={isLocked} canUndo={canUndo} canRedo={canRedo} saveStatus={saveStatus} onEvent={(event) => { if (event.type === 'undo' || event.type === 'redo') { onEdit(event); return; } if (selected) onEdit({ ...event, clipId: selected.clip.id, trackId: selected.track.id }); }} />
    <div className="overflow-x-auto rounded-2xl border border-[#eadfce] bg-[#2f2926] p-3 shadow-[0_18px_40px_rgba(61,43,29,0.12)]"><div className="min-w-[620px] space-y-2"><div className="flex justify-between px-2 text-[11px] text-[#c8b7a7]"><span>00:00</span><span>{Math.floor(timeline.durationSeconds / 60).toString().padStart(2, '0')}:{Math.floor(timeline.durationSeconds % 60).toString().padStart(2, '0')}</span></div>{timeline.tracks.length === 0 ? <p className="px-3 py-10 text-center text-sm text-[#c8b7a7]">No tracks yet.</p> : timeline.tracks.slice().sort((a, b) => a.orderIndex - b.orderIndex).map((track) => <div key={track.id} className="grid grid-cols-[120px_minmax(0,1fr)] items-stretch gap-2"><div className="flex items-center gap-2 rounded-xl bg-[#403633] px-3 py-2 text-xs text-[#efe5d8]"><span className="truncate">{track.name}</span>{track.locked && <LockKeyhole className="ml-auto h-3 w-3" aria-hidden="true" />}</div><div className="relative min-h-14 rounded-xl bg-[#403633] p-1">{track.clips.length === 0 ? <span className="flex h-full items-center px-3 text-xs text-[#a99483]">No clips</span> : track.clips.map((clip) => { const width = Math.max(12, (clip.durationSeconds / Math.max(timeline.durationSeconds, 1)) * 100); return <button key={clip.id} type="button" aria-pressed={selectedClipId === clip.id} aria-label={`Select ${clip.kind.toLowerCase()} clip`} onClick={() => { setSelectedClipId(clip.id); onEdit({ type: 'select-clip', clipId: clip.id }); }} className={`mr-1 inline-flex min-h-12 items-center overflow-hidden rounded-lg border px-3 text-left text-xs transition ${selectedClipId === clip.id ? 'border-[#efb66d] bg-[#a96142] text-white' : 'border-[#66534b] bg-[#55443f] text-[#f3e9dc] hover:border-[#d08b42]'} ${isLocked || track.locked ? 'cursor-default' : 'cursor-pointer'}`} style={{ width: `${width}%` }}><span className="truncate">{clip.kind === 'CAPTIONS' ? 'Captions' : clip.kind[0] + clip.kind.slice(1).toLowerCase()}</span></button> })}</div></div>)}</div></div>
    {!selected && <p className="flex items-center gap-2 text-sm text-[#786b5e]"><MousePointer2 className="h-4 w-4 text-[#d08b42]" aria-hidden="true" />Select a clip to unlock timing, replacement, and sound controls.</p>}
  </section>;
}
