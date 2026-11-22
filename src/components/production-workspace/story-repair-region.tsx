'use client';

import { useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';

type Rectangle = { x: number; y: number; width: number; height: number };
/** The selection is a human decision. No face detector silently authorizes a
 * region, and saving it never starts a provider request. */
export function StoryRepairRegion({ takeId, requirementKey, source, saved }: {
  takeId: Id<'shotVersions'>; requirementKey: string;
  source: { width: number | null; height: number | null; url: string | null };
  saved?: { selection: Rectangle };
}) {
  const measure = useAction(api.storyActionRepairs.measureRegion);
  const record = useMutation(api.storyActionReviews.recordRepairRegion);
  const [draft, setDraft] = useState<{ key: string; rectangle: Rectangle } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const rectangle = draft?.key === requirementKey ? draft.rectangle : saved?.selection ?? { x: 0, y: 0, width: 64, height: 64 };
  const width = source.width ?? 0, height = source.height ?? 0;
  async function save() {
    setBusy(true); setMessage('Measuring this take before saving the area…');
    try {
      await measure({ takeId });
      // Saved selections also carry version/window proof. Never spread those
      // server-owned fields into the strictly validated mutation arguments.
      await record({ takeId, requirementKey, x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height, stationaryConfirmed: true });
      setMessage('Repair area saved for this exact take. Review the repair estimate below before any purchase.');
      setConfirmed(false);
    } catch {
      setMessage('This area could not be saved. Keep it inside the picture, use even pixel values and a minimum of 64 × 64 pixels, covering no more than half the image. The exact video must pass timing checks and the focused repair worker must be available. Nothing was purchased.');
    } finally { setBusy(false); }
  }
  return <section aria-label="Focused shot repair area" className="space-y-3 rounded-lg border border-border p-3">
    <h6 className="font-semibold">Focus on the part that needs fixing</h6>
    <p className="text-sm text-muted-foreground">Use this only when the subject and camera stay still enough to remain inside the box for the entire missing action. Include the moving body parts and a little surrounding space. Everything outside this box and the action time stays unchanged. Moving subjects need another approach.</p>
    {source.url && width > 0 && height > 0 ? <div className="relative overflow-hidden rounded-md" style={{ aspectRatio: `${width} / ${height}` }}>
      <video src={source.url} controls preload="metadata" playsInline className="h-full w-full" aria-label="Source take for repair area review" />
      <div aria-hidden="true" className="pointer-events-none absolute border-2 border-lime-400" style={{ left: `${rectangle.x / width * 100}%`, top: `${rectangle.y / height * 100}%`, width: `${rectangle.width / width * 100}%`, height: `${rectangle.height / height * 100}%` }} />
    </div> : null}
    <p className="text-xs text-muted-foreground">Source: {width || 'unknown'} × {height || 'unknown'} pixels. The box is a fixed selection, not automatic tracking.</p>
    <div className="grid grid-cols-2 gap-3">{(['x', 'y', 'width', 'height'] as const).map(field => <label key={field} className="text-sm">
      {{ x: 'Distance from left', y: 'Distance from top', width: 'Box width', height: 'Box height' }[field]} (pixels)
      <input type="number" min={field === 'x' || field === 'y' ? 0 : 64} step={2} value={rectangle[field]} disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2" onChange={event => {
        setDraft({ key: requirementKey, rectangle: { ...rectangle, [field]: Number(event.target.value) } }); setConfirmed(false);
      }} />
    </label>)}</div>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I watched the action window. The intended subject stays inside this box, and I approve this area.</label>
    <Button type="button" variant="secondary" disabled={busy || !confirmed || !width || !height} onClick={() => void save()}>Save repair area · no AI purchase</Button>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </section>;
}
