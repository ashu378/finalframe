'use client';

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { OUTPUT_PRESETS, getOutputPreset, type OutputPresetId } from '../../../../renderer/src/output-presets';
import { availablePlatformGuides, resolvePlatformGuide, type PlatformGuideId } from '@/lib/production/platform-guides';
import { Button } from '@/components/ui/button';
import { controlInput } from '@/components/production-workspace/resource-approval-controls';

type Picture = { id: string; kind: string; metadata?: Record<string, unknown> };
interface Props {
  timeline: { _id: Id<'timelines'>; productionId: Id<'productions'>; versionNumber: number; updatedAt?: number };
  clips: Picture[]; canCreate: boolean; canEdit: boolean; rootTimelineId?: Id<'timelines'>; onCreated: (id: Id<'timelines'>) => void;
}

export function FormatVariantPanel({ timeline, clips, canCreate, canEdit, rootTimelineId, onCreated }: Props) {
  const options = useQuery(api.timeline.formatOptions, {});
  const variants = useQuery(api.timeline.formatVariants, { productionId: timeline.productionId });
  const create = useMutation(api.timeline.createFormatVariant);
  const apply = useMutation(api.timelineEditor.apply);
  const [presetId, setPresetId] = useState<OutputPresetId>('VERTICAL');
  const [guideId, setGuideId] = useState<PlatformGuideId>('GENERAL');
  const guideDescriptionId = useId();
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [x, setX] = useState(.5), [y, setY] = useState(.5);
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const pictures = clips.filter(clip => ['VIDEO', 'IMAGE'].includes(clip.kind));
  const [clipId, setClipId] = useState(pictures[0]?.id ?? '');
  const preview = useQuery(api.timelineEditor.formatPreview, clipId ? { timelineId: timeline._id, clipId } : 'skip');
  const [pending, setPending] = useState(false), [message, setMessage] = useState('');
  const request = useRef<{ signature: string; key: string } | null>(null);
  const busy = useRef(false);
  const preset = getOutputPreset(presetId);
  const guide = resolvePlatformGuide(guideId, presetId);

  async function save(kind: 'create' | 'framing') {
    if (busy.current) return;
    const framing = { fit, focalPoint: { x, y }, backgroundColor };
    const signature = JSON.stringify({ kind, timelineId: timeline._id, version: timeline.versionNumber, updatedAt: timeline.updatedAt, presetId, clipId, ...framing });
    if (request.current?.signature !== signature) request.current = { signature, key: `format-variant:${crypto.randomUUID()}` };
    busy.current = true; setPending(true); setMessage('');
    try {
      const result = kind === 'create'
        ? await create({ timelineId: timeline._id, presetId, expectedVersionNumber: timeline.versionNumber, expectedUpdatedAt: timeline.updatedAt ?? null, idempotencyKey: request.current.key, ...framing })
        : await apply({ timelineId: timeline._id, kind: 'adjustFraming', input: { clipId, ...framing }, idempotencyKey: request.current.key });
      request.current = null;
      onCreated(result.timelineId);
    } catch { setMessage('This format could not be saved. Refresh the edit and check project access and source approval.'); }
    finally { busy.current = false; setPending(false); }
  }

  if (!options?.enabled) return null;
  return <section className="ff-card space-y-4 p-5" aria-label="Output format variants">
    <h3 className="font-semibold">Make another format</h3>
    <p className="text-sm text-muted-foreground">Each format gets its own edit, review and export. Approved media and sound are reused.</p>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <label className="block text-sm">Output format<select className={controlInput} value={presetId} onChange={event => { const next = event.target.value as OutputPresetId; setPresetId(next); setGuideId(current => resolvePlatformGuide(current, next).id); }}>{OUTPUT_PRESETS.map(item => <option key={item.id} value={item.id}>{item.label} · {item.aspectRatio} · {item.width}×{item.height}</option>)}</select></label>
        <label className="block text-sm">Preview placement guide<select className={`${controlInput} min-w-0 max-w-full`} value={guide.id} aria-describedby={guideDescriptionId} onChange={event => setGuideId(resolvePlatformGuide(event.target.value, presetId).id)}>{availablePlatformGuides(presetId).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        {pictures.length ? <label className="block text-sm">Preview source<select className={controlInput} value={clipId} onChange={event => setClipId(event.target.value)}>{pictures.map((clip, index) => <option key={clip.id} value={clip.id}>{clip.kind === 'VIDEO' ? 'Video' : 'Image'} {index + 1}</option>)}</select></label> : null}
        <label className="block text-sm">Framing<select className={controlInput} value={fit} onChange={event => setFit(event.target.value as 'contain' | 'cover')}><option value="contain">Fit the full source inside the frame</option><option value="cover">Crop to fill the frame</option></select></label>
        {fit === 'cover' ? <><label className="block text-sm">Horizontal crop position<input aria-label="Horizontal crop position" className="block w-full" type="range" min="0" max="1" step="0.01" value={x} onChange={event => setX(Number(event.target.value))} /></label><label className="block text-sm">Vertical crop position<input aria-label="Vertical crop position" className="block w-full" type="range" min="0" max="1" step="0.01" value={y} onChange={event => setY(Number(event.target.value))} /></label></> : null}
        <label className="flex items-center gap-3 text-sm">Background<input type="color" aria-label="Format background" value={backgroundColor} onChange={event => setBackgroundColor(event.target.value)} /></label>
      </div>
      <div className="min-w-0 space-y-2">
        <div className="relative mx-auto max-w-full overflow-hidden rounded-lg border border-border" style={{ aspectRatio: `${preset.width}/${preset.height}`, width: `min(100%, ${Math.round(300*preset.width/preset.height)}px)`, backgroundColor }}>
          {preview?.url ? preview.kind === 'VIDEO' ? <video controls preload="metadata" muted src={preview.url} className="h-full w-full" style={{ objectFit: fit, objectPosition: `${x * 100}% ${y * 100}%` }} /> : <Image unoptimized fill sizes="320px" alt="Selected approved project source" src={preview.url} style={{ objectFit: fit, objectPosition: `${x * 100}% ${y * 100}%` }} /> : <p className="grid h-full place-items-center p-4 text-center text-sm text-white">Graphics and captions reflow within this format.</p>}
          <svg role="img" aria-label={`${guide.label} preview guide`} className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${guide.canvas.width} ${guide.canvas.height}`} preserveAspectRatio="none"><polygon points={guide.polygon.map(([px, py]) => `${px},${py}`).join(' ')} fill="none" stroke="#fcd34d" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" /></svg>
        </div>
        <p id={guideDescriptionId} className="text-xs text-muted-foreground">{guide.description} Placement guide only: verify in the destination platform. Guides are never included in your export. {guide.source ? <a className="text-primary underline" href={guide.source.url} target="_blank" rel="noopener noreferrer">Official guide (checked {guide.source.checkedAt})</a> : null}</p>
        <p className="text-xs text-muted-foreground">Output is {preset.width}×{preset.height}. {preview?.sourceWidth && preview.sourceHeight ? `Measured source is ${preview.sourceWidth}×${preview.sourceHeight}.` : ''} If the framing needs a new take, review its estimate before generating.</p>
        <p className="flex flex-wrap gap-x-4 gap-y-2 text-xs"><a className="text-primary underline" href="https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads?lang=en" target="_blank" rel="noopener noreferrer">TikTok ad placement guidance</a><a className="text-primary underline" href="https://support.google.com/google-ads/answer/13547298?hl=en" target="_blank" rel="noopener noreferrer">Google Ads placement guidance</a><a className="text-primary underline" href="https://support.google.com/youtube/answer/6375112?hl=en" target="_blank" rel="noopener noreferrer">YouTube formats and aspect ratios</a></p>
      </div>
    </div>
    <div className="flex flex-wrap gap-3">{canCreate ? <Button disabled={pending} onClick={() => void save('create')}>Create editable {preset.label.toLowerCase()} variant</Button> : <p className="text-sm text-muted-foreground">Approve this edit to create another format.</p>}{canEdit && clipId ? <Button variant="secondary" disabled={pending} onClick={() => void save('framing')}>Save this clip’s framing</Button> : null}</div>
    {variants?.variants.length ? <div className="flex flex-wrap gap-2" aria-label="Saved format variants">{rootTimelineId && rootTimelineId!==timeline._id ? <Button size="sm" variant="ghost" onClick={()=>onCreated(rootTimelineId)}>Original edit</Button> : null}{variants.variants.map(item => <Button key={item.id} size="sm" variant="ghost" onClick={() => onCreated(item.id)}>{getOutputPreset(item.presetId).label} · version {item.versionNumber}</Button>)}</div> : null}
    {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
  </section>;
}
