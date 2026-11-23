'use client';

import { useRef, useState } from 'react';
import { useAction, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { useRouter } from 'next/navigation';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';

type Take = Id<'shotVersions'>;
type Asset = Id<'assets'>;
type Shot = Id<'shots'>;
type Video = {id: Asset; title: string; url: string};
type Options = {shotId: Shot; videos: Video[]; targetStartFrame: number; targetEndFrame: number; fps: number};
type Range = {targetStartFrame: number; targetEndFrame: number; donorStartFrame: number; donorEndFrame: number};
const list = makeFunctionReference<'query', {shotVersionId: Take}, Options | null>('performanceCutaways:options');
const save = makeFunctionReference<'action', Range & {shotVersionId: Take; shotId: Shot; baseAssetId: Asset; donorAssetId: Asset}, {shotVersionId: Take; assetId: Asset}>('performanceCutaways:save');
const control = 'mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm';

function ClipRange({label, videos, selected, choose, start, end, changeStart, changeEnd, fps}: {
  label: string; videos: Video[]; selected: string; choose: (value: string) => void;
  start: string; end: string; changeStart: (value: string) => void; changeEnd: (value: string) => void; fps: number;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const clip = videos.find(item => item.id === selected);
  function mark(change: (value: string) => void) {
    const element = player.current;
    if (!element || element.readyState < 1) return;
    element.pause();
    const last = Math.ceil(element.duration * fps) - 1;
    change(String(Math.max(0, Math.min(last, Math.floor(element.currentTime * fps + 0.00001)))));
  }
  return <fieldset className="min-w-0 space-y-2 rounded-lg border border-border p-3">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    <label className="block text-sm">Project video
      <select className={control} value={selected} onChange={event => choose(event.target.value)}>
        <option value="">Choose an approved video</option>
        {videos.map(video => <option key={video.id} value={video.id}>{video.title}</option>)}
      </select>
    </label>
    {clip && <video key={clip.id} ref={player} controls playsInline preload="metadata" className="max-h-48 w-full rounded bg-black" src={clip.url} aria-label={label} />}
    <div className="grid grid-cols-2 gap-3">
      {([{label: 'First frame', value: start, change: changeStart}, {label: 'Last frame', value: end, change: changeEnd}]).map(field =>
        <div key={field.label}><label className="text-sm">{field.label}
          <input type="number" min={0} step={1} className={control} value={field.value} onChange={event => field.change(event.target.value)} />
        </label>{clip && <Button type="button" size="sm" variant="secondary" onClick={() => mark(field.change)}>Use playhead</Button>}</div>
      )}
    </div>
  </fieldset>;
}

export function PerformanceCutaway({takeId}: {takeId: Take}) {
  const [open, setOpen] = useState(false);
  const options = useQuery(list, open ? {shotVersionId: takeId} : 'skip');
  return <details className="rounded-lg border border-border p-3" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-medium">Fix the action with footage you already have</summary>
    {open && (options ? <CutawayForm key={takeId} takeId={takeId} options={options} /> :
      <p role="status" className="mt-2 text-sm">{options === undefined ? 'Loading project footage…' : 'A failed action review and a current editable shot are required.'}</p>)}
  </details>;
}

function CutawayForm({takeId, options}: {takeId: Take; options: Options}) {
  const router = useRouter();
  const apply = useAction(save);
  const [base, setBase] = useState('');
  const [donor, setDonor] = useState('');
  const [first, setFirst] = useState(String(options.targetStartFrame));
  const [last, setLast] = useState(String(options.targetEndFrame - 1));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Take | null>(null);
  const numbers = [first, last, start, end];
  const valid = numbers.every(value => value.trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0)
    && Number(last) >= Number(first) && Number(end) >= Number(start);
  const targetFrames = Number(last) - Number(first) + 1;
  const donorFrames = Number(end) - Number(start) + 1;
  const compatible = targetFrames >= 1 && donorFrames >= targetFrames && donorFrames <= targetFrames * 3
    && (targetFrames > 1 || donorFrames === 1) && Number(last) < 360 && Number(end) < 360;
  const enabled = valid && compatible && base !== donor && [base, donor].every(id => options.videos.some(v => v.id === id));

  async function submit() {
    if (!enabled || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await apply({shotVersionId: takeId, shotId: options.shotId,
        baseAssetId: base as Asset, donorAssetId: donor as Asset, targetStartFrame: Number(first),
        targetEndFrame: Number(last) + 1, donorStartFrame: Number(start), donorEndFrame: Number(end) + 1});
      setResult(saved.shotVersionId);
      router.refresh();
    } catch {
      setError('Could not save the take. Check that both videos are approved, the selected frames exist, and the original recording fits the shot. Open saved takes before trying again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (result) return <div role="status" className="mt-3 space-y-2 text-sm"><p>New take saved. Review the action and listen to the original voices.</p>
    <Button type="button" onClick={() => {
      const url = new URL(window.location.href);
      url.searchParams.set('shot', options.shotId); url.searchParams.set('take', result); url.searchParams.set('clipStep', 'review');
      router.push(url.pathname + url.search);
    }}>Review the new take</Button></div>;
  return <div className="mt-3 space-y-3">
    <p className="text-sm">Use a moment from another clip to fix this action. The suggested time comes from the shot review. Play each clip and mark the first and last frames to use.</p>
    <fieldset disabled={busy} className="grid min-w-0 gap-3 lg:grid-cols-2">
      <ClipRange label="1. Shot to fix" videos={options.videos} selected={base} choose={setBase} start={first} end={last} changeStart={setFirst} changeEnd={setLast} fps={options.fps} />
      <ClipRange label="2. Footage with the action" videos={options.videos.filter(v => v.id !== base)} selected={donor} choose={value => {setDonor(value);setStart('');setEnd('');}} start={start} end={end} changeStart={setStart} changeEnd={setEnd} fps={options.fps} />
    </fieldset>
    {valid && !compatible && <p className="text-sm" role="status">Use footage up to 15 seconds long. The action can play at its original speed or up to three times faster.</p>}
    {enabled && <p className="text-sm">{donorFrames} source frames will play in {targetFrames} frames at {(donorFrames / targetFrames).toFixed(2)}× speed. The new take uses the original recording.</p>}
    <Button type="button" disabled={!enabled || busy} onClick={() => void submit()}>{busy ? 'Saving new take…' : 'Save new take · no AI charge'}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
