'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { controlInput } from '@/components/production-workspace/resource-approval-controls';

export function SharedMovieReview({ token }: { token: string }) {
  const data = useQuery(api.movieReviews.getSharedReview, { token });
  const comment = useMutation(api.movieReviews.addSharedComment); const decide = useMutation(api.movieReviews.decideSharedReview);
  const player = useRef<HTMLVideoElement>(null); const requestId = useRef<string | undefined>(undefined);
  const [frame, setFrame] = useState(0); const [name, setName] = useState(''); const [body, setBody] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  async function action(run: () => Promise<unknown>) { setPending(true); setError(''); try { await run(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'This review action could not finish.'); } finally { setPending(false); } }
  if (data === undefined) return <p role="status">Loading private movie review…</p>;
  if (!data) return <p role="status">This movie review is unavailable. Its link may have expired, or its current source permissions need verification.</p>;
  const approved = ['APPROVED', 'LOCKED'].includes(data.status); const maxFrame = data.durationInFrames - 1;
  const capture = () => setFrame(Math.min(maxFrame, Math.floor((player.current?.currentTime ?? 0) * data.fps)));
  return <div className="space-y-6"><header><p className="text-sm text-muted-foreground">FinalFrame · Private movie review</p><h1 className="mt-2 text-3xl font-semibold">{data.projectName}</h1><p className="mt-2">{data.label} · movie version {data.movieVersionNumber}</p><p className="mt-2 text-sm text-muted-foreground">{data.status.replaceAll('_', ' ').toLowerCase()} · expires {new Date(data.expiresAt).toLocaleDateString()}</p></header>
    {data.videoUrl && <video ref={player} src={data.videoUrl} className="w-full rounded-xl bg-black" controls preload="metadata" aria-label="Private exact movie review" onPause={capture} onSeeked={capture} />}
    <p className="text-sm text-muted-foreground">Feedback and decisions apply to this exact movie version and selection. Pause or seek the player to capture a frame.</p>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); action(async () => { requestId.current ??= crypto.randomUUID(); await comment({ token, authorName: name, body, movieFrame: frame, requestId: requestId.current }); requestId.current = undefined; setBody(''); }); }}>
      <label className="block text-sm">Your name<input required maxLength={100} className={controlInput} value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="block text-sm">Movie frame<input type="number" min={0} max={maxFrame} step={1} className={controlInput} value={frame} onChange={event => { setFrame(Number(event.target.value)); requestId.current = undefined; }} /></label><p className="text-xs text-muted-foreground">{(frame / data.fps).toFixed(3)} seconds; component occurrence and source version are recorded with your comment.</p>
      <label className="block text-sm">Feedback<textarea required maxLength={10000} className={controlInput} value={body} onChange={event => { setBody(event.target.value); requestId.current = undefined; }} /></label>
      <div className="flex flex-wrap gap-3"><Button disabled={pending || !data.enabled || approved || !name.trim() || !body.trim() || !Number.isSafeInteger(frame) || frame < 0 || frame > maxFrame}>Comment on exact frame</Button><Button type="button" variant="secondary" disabled={pending || !data.enabled || approved || !name.trim()} onClick={() => action(() => decide({ token, authorName: name, decision: 'APPROVED' }))}>Approve this movie review</Button><Button type="button" variant="secondary" disabled={pending || !data.enabled || approved || !name.trim() || !body.trim()} onClick={() => action(() => decide({ token, authorName: name, decision: 'CHANGES_REQUESTED', note: body }))}>Request changes with feedback</Button></div>
    </form>
    <ul className="space-y-3">{data.comments.map((note: any) => <li key={note.id} className="rounded-xl border border-border p-4 text-sm"><button className="ff-link" type="button" onClick={() => { if (player.current) player.current.currentTime = note.movieFrame / data.fps; setFrame(note.movieFrame); }}>{note.authorName} · movie frame {note.movieFrame} · component frame {note.componentFrame}</button><p className="mt-2 whitespace-pre-wrap">{note.body}</p><p className="mt-2 break-all text-xs text-muted-foreground">Occurrence {note.componentId}{note.resolved ? ' · resolved' : ''}</p></li>)}</ul>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
