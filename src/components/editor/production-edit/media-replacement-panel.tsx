'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { controlInput } from '@/components/production-workspace/resource-approval-controls';

export function MediaReplacementPanel({ timelineId, clipId, disabled, onApply, onCancel }: {
  timelineId: Id<'timelines'>; clipId: string; disabled: boolean;
  onApply: (assetId: Id<'assets'>) => Promise<void>; onCancel: () => void;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const result = useQuery(api.timelineEditor.replacementAssets, { timelineId, clipId, paginationOpts: { cursor, numItems: 25 } });
  return <section className="ff-card space-y-4 p-5 sm:p-7" aria-label="Replace selected media">
    <div><h3 className="text-xl font-semibold">Choose replacement media</h3><p className="mt-2 text-sm text-muted-foreground">Choose approved media from this project of the same type. The clip keeps its timing, source trim and captions. Saving creates a new timeline version and leaves the original intact.</p></div>
    {!result ? <p role="status" className="text-sm">Loading approved replacement media…</p> : <>
      <label className="grid gap-1 text-sm">Approved project replacement<select className={controlInput} disabled={disabled} value={selected} onChange={event => { setSelected(event.target.value); setError(''); }}><option value="">Choose exact media</option>{result.page.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
      {!result.page.length ? <p className="text-sm text-muted-foreground">No eligible replacement on this page. Media must cover the current source window.{!result.isDone ? ' Continue to the next page to inspect older media.' : ''}</p> : null}
      <div className="flex flex-wrap gap-3">{cursor ? <Button type="button" variant="secondary" disabled={disabled} onClick={() => { setSelected(''); setCursor(null); }}>First media page</Button> : null}{!result.isDone ? <Button type="button" variant="secondary" disabled={disabled} onClick={() => { setSelected(''); setCursor(result.continueCursor); }}>Next media page</Button> : null}</div>
    </>}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-wrap gap-3"><Button type="button" disabled={disabled || !selected || !result?.page.some(asset => asset.id === selected)} onClick={async () => { setError(''); try { await onApply(selected as Id<'assets'>); } catch { setError('The replacement could not be saved. Check its approval, source duration and project access, then try again.'); } }}>Replace in a new timeline version</Button><Button type="button" variant="secondary" disabled={disabled} onClick={onCancel}>Cancel replacement</Button></div>
  </section>;
}
