'use client';

import { useState } from 'react';
import { Check, Download, FileVideo, Loader2, MessageSquare, ShieldCheck } from 'lucide-react';

interface ReviewApprovalPanelProps {
    videoUrl?: string;
    available: boolean;
    actionsAvailable?: boolean;
}

type ReviewState = 'READY' | 'CHANGES_REQUESTED' | 'APPROVED';

export function ReviewApprovalPanel({ videoUrl, available, actionsAvailable = false }: ReviewApprovalPanelProps) {
    const [state, setState] = useState<ReviewState>('READY');
    const [note, setNote] = useState('');
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    async function requestRevision() {
        if (!note.trim()) return;
        setSaving(true);
        await Promise.resolve();
        setState('CHANGES_REQUESTED');
        setRevisionOpen(false);
        setSaving(false);
    }

    if (!available || !videoUrl) return <section className="rounded-2xl border border-border/70 bg-secondary/35 p-5" aria-labelledby="review-waiting-title"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background"><FileVideo className="size-5 text-muted-foreground" aria-hidden="true" /></span><div><p className="ff-eyebrow">Review and approval</p><h3 id="review-waiting-title" className="mt-2 font-semibold">Review opens after a verified video exists</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">FinalFrame will show playback, comments, revision requests, approval, and download once the finishing service returns a real file.</p></div></div></section>;

    return <section className="rounded-2xl border border-border/70 bg-background/55 p-5 sm:p-6" aria-labelledby="review-title"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="ff-eyebrow">Review and approval</p><h3 id="review-title" className="mt-2 text-xl font-semibold">Watch it once before you share it.</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{actionsAvailable ? 'Your review decision belongs to this version. You can ask for a change without losing the finished file.' : 'Watch and download this verified version. Comments and approval will appear when the review service is connected.'}</p></div><span className="inline-flex items-center gap-2 rounded-full bg-[#c8ddd5]/60 px-3 py-2 text-xs font-semibold text-[hsl(var(--success))]"><ShieldCheck className="size-4" aria-hidden="true" /> {actionsAvailable ? (state === 'APPROVED' ? 'Approved' : state === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Ready for review') : 'Preview ready'}</span></div><div className="mt-5 overflow-hidden rounded-2xl bg-black"><video controls preload="metadata" src={videoUrl} className="aspect-video w-full" aria-label="Finished video preview" /></div>{!actionsAvailable && <div className="mt-4 rounded-xl bg-secondary/45 p-4 text-sm leading-6 text-muted-foreground">Review actions are not connected in this environment yet. No approval or revision is being recorded.</div>}{actionsAvailable && state === 'CHANGES_REQUESTED' && <div className="mt-4 rounded-xl bg-[#fff8e9] p-4 text-sm leading-6"><p className="font-semibold">Your revision note is saved for this review.</p><p className="mt-1 text-muted-foreground">{note}</p></div>}{actionsAvailable && revisionOpen && <div className="mt-4 rounded-xl border border-border/70 bg-card p-4"><label htmlFor="revision-note" className="text-sm font-semibold">What should change?</label><textarea id="revision-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tighten the ending, change the caption timing…" className="mt-3 min-h-24 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm leading-6 outline-none focus:border-primary" /><div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="ff-button-quiet" onClick={() => setRevisionOpen(false)} disabled={saving}>Keep reviewing</button><button type="button" className="ff-button-primary" onClick={requestRevision} disabled={saving || !note.trim()}>{saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MessageSquare className="size-4" aria-hidden="true" />} Save revision note</button></div></div>}<div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><a href={videoUrl} download className="ff-button-quiet min-h-11 border border-border"><Download className="size-4" aria-hidden="true" /> Download this version</a>{actionsAvailable ? <div className="flex flex-col gap-3 sm:flex-row"><button type="button" onClick={() => setRevisionOpen((value) => !value)} disabled={state === 'APPROVED'} className="ff-button-quiet min-h-11"><MessageSquare className="size-4" aria-hidden="true" /> Ask for a change</button><button type="button" onClick={() => setState('APPROVED')} disabled={state === 'APPROVED'} className="ff-button-primary min-h-11"><Check className="size-4" aria-hidden="true" /> {state === 'APPROVED' ? 'Approved' : 'Approve version'}</button></div> : <span className="text-sm text-muted-foreground">Approval unavailable</span>}</div></section>;
}
