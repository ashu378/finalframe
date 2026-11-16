'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { controlInput } from '@/components/production-workspace/resource-approval-controls';

export function SharedMovieReview({ token }: { token: string }) {
  const data = useQuery(api.movieReviews.getSharedReview, { token });
  const comment = useMutation(api.movieReviews.addSharedComment); const decide = useMutation(api.movieReviews.decideSharedReview);
  const player = useRef<HTMLVideoElement>(null); const request = useRef<{ payload: string; id: string } | undefined>(undefined);
  const [frame, setFrame] = useState(0); const [name, setName] = useState(''); const [body, setBody] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  async function action(run: () => Promise<unknown>) { setPending(true); setError(''); try { await run(); } catch { setError('This review action could not finish. Check that the link is active and try again.'); } finally { setPending(false); } }
  if (data === undefined) return <p role="status">Loading private movie review…</p>;
  if (!data) return <p role="status">This review is not available. Its link may have expired or access to its source media may have changed. Ask the project owner for a new link.</p>;
  const approved = ['APPROVED', 'LOCKED'].includes(data.status); const maxFrame = data.durationInFrames - 1;
  const capture = () => setFrame(Math.min(maxFrame, Math.floor((player.current?.currentTime ?? 0) * data.fps)));
  return <div className="min-w-0 space-y-6 sm:space-y-8"><header><p className="text-sm text-muted-foreground">FinalFrame · Private movie review</p><h1 className="mt-3 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{data.projectName}</h1><p className="mt-2">{data.label} · movie version {data.movieVersionNumber}</p><p className="mt-2 text-sm text-muted-foreground">{data.status.replaceAll('_', ' ').toLowerCase()} · expires {new Date(data.expiresAt).toLocaleDateString()}</p></header>
    {data.videoUrl && <video ref={player} src={data.videoUrl} className="w-full rounded-xl bg-black" controls preload="metadata" aria-label="Private exact movie review" onPause={capture} onSeeked={capture} />}
    <p className="text-sm text-muted-foreground">Feedback and decisions apply to this exact movie version and selection. Pause or seek the player to capture a frame.</p>
    <form className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-6" onSubmit={event => { event.preventDefault(); if (pending || !data.enabled || approved) return; action(async () => {
      const payload = JSON.stringify([token, name, body, frame]);
      if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
      await comment({ token, authorName: name, body, movieFrame: frame, requestId: request.current.id });
      request.current = undefined; setBody('');
    }); }}>
      <label className="block text-sm">Your name<input autoComplete="name" required maxLength={100} disabled={pending} className={`${controlInput} min-h-12 text-base`} value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="block text-sm">Frame to comment on<input type="number" min={0} max={maxFrame} step={1} disabled={pending} className={`${controlInput} min-h-12 text-base`} value={frame} onChange={event => setFrame(Number(event.target.value))} /></label><p className="text-sm leading-relaxed text-muted-foreground">{(frame / data.fps).toFixed(3)} seconds. Your comment stays linked to this saved part and its source version.</p>
      <label className="block text-sm">Feedback<textarea required maxLength={10000} disabled={pending} className={`${controlInput} min-h-12 text-base`} value={body} onChange={event => setBody(event.target.value)} /></label>
      <div className="grid gap-3 sm:flex sm:flex-wrap"><Button disabled={pending || !data.enabled || approved || !name.trim() || !body.trim() || !Number.isSafeInteger(frame) || frame < 0 || frame > maxFrame}>Add comment at this frame</Button><Button type="button" variant="secondary" disabled={pending || !data.enabled || approved || !name.trim()} onClick={() => action(() => decide({ token, authorName: name, decision: 'APPROVED' }))}>Approve this movie review</Button><Button type="button" variant="secondary" disabled={pending || !data.enabled || approved || !name.trim() || !body.trim()} onClick={() => action(() => decide({ token, authorName: name, decision: 'CHANGES_REQUESTED', note: body }))}>Request changes</Button></div>
    </form>
    <section className="space-y-4"><h2 className="text-xl font-semibold">Feedback</h2>{!data.comments.length && <p className="text-sm text-muted-foreground">No comments yet. Pause the video where you want to leave feedback.</p>}<ul className="space-y-3">{data.comments.map((note: any) => <li key={note.id} className="rounded-xl border border-border p-4 text-sm"><button className="ff-link inline-flex min-h-11 items-center text-left" type="button" onClick={() => { if (player.current) player.current.currentTime = note.movieFrame / data.fps; setFrame(note.movieFrame); }}>{note.authorName} · movie frame {note.movieFrame} · source frame {note.componentFrame}</button><p className="mt-2 whitespace-pre-wrap">{note.body}</p><p className="mt-2 break-all text-sm text-muted-foreground">Saved part {note.componentId}{note.resolved ? ' · resolved' : ''}</p></li>)}</ul></section>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
