'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { decidePublicReview, postPublicReviewComment } from '@/lib/review/actions';

type ReviewData = {
    projectName: string; label: string; timelineVersionNumber: number; durationSeconds: number; status: string; expiresAt: number; videoUrl: string | null;
    comments: Array<{ id: string; authorName: string; body: string; timeSeconds: number; createdAt: number; resolved: boolean }>;
};
export function ScopedReview({ token, data }: { token: string; data: ReviewData }) {
    const router = useRouter(); const player = useRef<HTMLVideoElement>(null);
    const [authorName, setAuthorName] = useState(''); const [body, setBody] = useState(''); const [timeSeconds, setTimeSeconds] = useState(0);
    const [pending, setPending] = useState(false); const [error, setError] = useState<string>();
    const request = useRef<{ payload: string; id: string } | undefined>(undefined);
    const decided = data.status === 'APPROVED' || data.status === 'CHANGES_REQUESTED';
    async function comment() {
        setPending(true); setError(undefined);
        try {
            const payload = JSON.stringify([token, authorName, body, timeSeconds]);
            if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
            const result = await postPublicReviewComment({ token, authorName, body, timeSeconds, requestId: request.current.id });
            if (result.success) { setBody(''); request.current = undefined; router.refresh(); } else setError(result.error);
        } catch {
            setError('The comment could not be saved. Try again.');
        } finally { setPending(false); }
    }
    async function decide(decision: 'APPROVED' | 'CHANGES_REQUESTED') {
        setPending(true); setError(undefined);
        try {
            const result = await decidePublicReview({ token, authorName, decision, note: body || undefined });
            if (result.success) router.refresh(); else setError(result.error);
        } catch {
            setError('The decision could not be saved. Try again.');
        } finally { setPending(false); }
    }
    return <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section className="space-y-5">
            <video ref={player} controls preload="metadata" src={data.videoUrl ?? undefined} className="max-h-[80vh] w-full rounded-2xl border border-border bg-black object-contain" aria-label="Video under review" onTimeUpdate={event => setTimeSeconds(Math.min(data.durationSeconds, Math.round(event.currentTarget.currentTime * 10) / 10))} />
            <div className="rounded-2xl border border-border bg-card p-6"><h2 className="text-xl font-semibold">Timeline version {data.timelineVersionNumber}</h2><p className="mt-2 text-sm text-muted-foreground">Feedback and decisions apply to this exact export. New edits require a new review link.</p><p className="mt-3 text-sm">Status: {data.status.replaceAll('_', ' ').toLowerCase()}</p></div>
            <div className="flex flex-wrap gap-3"><Button disabled={pending || decided || !authorName.trim()} onClick={() => decide('APPROVED')}>Approve this version</Button><Button variant="secondary" disabled={pending || decided || !authorName.trim() || !body.trim()} onClick={() => decide('CHANGES_REQUESTED')}>Request changes</Button></div>
        </section>
        <aside className="space-y-5 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Version feedback</h2>
            <label className="block space-y-2 text-sm">Your name<input value={authorName} maxLength={100} disabled={pending} onChange={event => setAuthorName(event.target.value)} className="w-full rounded-lg border border-border bg-background p-3" autoComplete="name" /></label>
            <label className="block space-y-2 text-sm">Note or revision reason<textarea value={body} maxLength={10000} disabled={pending} onChange={event => setBody(event.target.value)} className="min-h-28 w-full rounded-lg border border-border bg-background p-3" /></label>
            <p className="text-sm text-muted-foreground">At {timeSeconds.toFixed(1)} seconds. Pause the video at the moment you want to discuss.</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button disabled={pending || data.status === 'APPROVED' || !authorName.trim() || !body.trim()} onClick={comment}>{pending ? 'Saving…' : 'Add timestamped comment'}</Button>
            <ul className="space-y-4 border-t border-border pt-5">{data.comments.map(item => <li key={item.id} className="space-y-1"><button className="text-sm font-medium text-primary underline" onClick={() => { if (player.current) player.current.currentTime = item.timeSeconds; }}>{item.timeSeconds.toFixed(1)}s · {item.authorName}</button><p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>{item.resolved && <span className="text-xs text-muted-foreground">Resolved</span>}</li>)}</ul>
        </aside>
    </div>;
}
