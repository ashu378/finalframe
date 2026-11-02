'use client';
import { useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { queuePreparation } from '@/lib/production/preparation-actions';
import type { PreparationKind } from '@/lib/ai/preparation';

export function PreparationPanel({ productionId, voices, assets, canEdit }: {
  productionId: string;
  voices: Array<{ id: string; name: string; kind: string; status: string }>;
  assets: Array<{ id: string; name: string; mimeType: string }>;
  canEdit: boolean;
}) {
  const [kind, setKind] = useState<PreparationKind>('NARRATION');
  const [text, setText] = useState('');
  const [voiceId, setVoice] = useState('');
  const [sourceAssetId, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJob] = useState<string>();
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  const state = useQuery(api.generationJobs.get, jobId ? { jobId: jobId as Id<'generationJobs'> } : 'skip');
  const job = state?.job;
  async function submit() {
    setBusy(true); setError('');
    try {
      const payload = { productionId, kind, text, ...(kind === 'NARRATION' || kind === 'VOICE_PREVIEW' ? { voiceId } : {}), ...(kind === 'TRANSCRIPT' ? { sourceAssetId } : {}) };
      const fingerprint = JSON.stringify(payload);
      if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, key: `preparation:${crypto.randomUUID()}` };
      const result = await queuePreparation({ ...payload, idempotencyKey: submission.current.key });
      if (result.success) setJob(result.jobId); else setError(result.error);
    } finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-2xl border border-white/15 bg-white/[0.03] p-5" aria-labelledby="preparation-heading">
    <div><h2 id="preparation-heading" className="text-lg font-semibold">Prepare project media</h2><p className="mt-1 text-sm text-muted-foreground">Create one reference image, prepare narration, or transcribe an uploaded recording. Each request uses the capped test budget and stays in this project.</p></div>
    <label className="block text-sm">Preparation type<select value={kind} onChange={event => setKind(event.target.value as PreparationKind)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/20 bg-background p-2"><option value="NARRATION">Narration</option><option value="VOICE_PREVIEW">Voice preview</option><option value="CHARACTER_REFERENCE">Reference image</option><option value="TRANSCRIPT">Transcribe recording</option></select></label>
    {kind === 'TRANSCRIPT' ? <label className="block text-sm">Project recording<select value={sourceAssetId} onChange={event => setSource(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/20 bg-background p-2"><option value="">Choose audio (up to 60 seconds)</option>{assets.filter(asset => asset.mimeType.startsWith('audio/')).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label> : <label className="block text-sm">{kind === 'CHARACTER_REFERENCE' ? 'Describe the reference image' : 'Words to speak'}<textarea value={text} maxLength={4000} onChange={event => setText(event.target.value)} rows={3} className="mt-1 block w-full rounded-lg border border-white/20 bg-background p-3" /></label>}
    {(kind === 'NARRATION' || kind === 'VOICE_PREVIEW') && <label className="block text-sm">Approved project voice<select value={voiceId} onChange={event => setVoice(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/20 bg-background p-2"><option value="">Choose a voice</option>{voices.filter(voice => voice.status === 'READY' && voice.kind !== 'RECORDED').map(voice => <option key={voice.id} value={voice.id}>{voice.name} · {voice.kind}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">Cloned voices require current consent and approved reference recordings. Use original recordings directly in the timeline.</span></label>}
    <Button onClick={submit} disabled={!canEdit || busy || (kind === 'TRANSCRIPT' ? !sourceAssetId : !text.trim()) || ((kind === 'NARRATION' || kind === 'VOICE_PREVIEW') && !voiceId)}>{busy ? 'Queuing…' : 'Queue preparation'}</Button>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {job && <div role="status" className="space-y-2 text-sm"><p>{job.status} · {Math.round(job.progress || 0)}% · {job.model}</p>{job.errorMessage && <p>{job.errorMessage}</p>}{job.transcriptText && <p className="whitespace-pre-wrap">{job.transcriptText}</p>}{job.assetId && <p>Prepared media is saved in the project library. Review it before use.</p>}</div>}
  </section>;
}
