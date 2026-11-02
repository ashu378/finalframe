'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { ProductionReleaseView } from './production-release-view';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/review/share-button';
import type { RenderJobState } from '@/lib/render/contracts';

function rendererStateFor(status: string): RenderJobState | 'UNAVAILABLE' {
  if (status === 'QUEUED') return 'QUEUED';
  if (status === 'PROCESSING' || status === 'SUBMITTED') return 'RENDERING';
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'RETRYING') return 'RETRYABLE_FAILURE';
  if (status === 'FAILED') return 'FAILED';
  if (status === 'CANCELED' || status === 'CANCELLED') return 'CANCELED';
  return 'UNAVAILABLE';
}
export function ReleaseSurface({ productionId }: { productionId: string }) {
  const id = productionId as Id<'productions'>;
  const state = useQuery(api.reviewExport.getState, { productionId: id });
  const jobs = useQuery(api.renderJobs.list, { productionId: id });
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string>(); const [manifestChoice, setManifestChoice] = useState('');
  const approve = useMutation(api.reviewExport.approve); const requestRevision = useMutation(api.reviewExport.requestRevision);
  const requestReview = useMutation(api.reviewExport.requestReview); const requestExport = useMutation(api.reviewExport.requestExport);
  const manifest = state?.manifests?.find((item: any) => item._id === manifestChoice) ?? state?.manifests?.[0];
  const review = state?.reviews?.filter((item: any) => item.manifestId === manifest?._id && !item.exportId).sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
  const latestExport = state?.exports?.find((item: any) => item.manifestId === manifest?._id);
  const exportDetails = useQuery(api.reviewExport.getExport, latestExport ? { exportId: latestExport._id } : 'skip');
  const latestJob = jobs?.find((item: any) => item.manifestId === manifest?._id);
  const canEdit = ['OWNER', 'EDITOR'].includes(state?.projectRole ?? ''); const canDecide = ['OWNER', 'EDITOR', 'REVIEWER'].includes(state?.projectRole ?? '');
  // An unexported assembly is not evidence of an unavailable renderer. Other
  // immutable assembly versions can already have a verified downloadable file.
  const rendererState = latestJob ? rendererStateFor(latestJob.status) : 'NOT_STARTED';
  const completedManifests = state?.manifests?.filter((item: any) => state.exports?.some((output: any) => output.manifestId === item._id && output.status === 'COMPLETED' && output.storageId)) ?? [];
  const decision = review?.status === 'APPROVED' ? 'APPROVED' : review?.status === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : 'PENDING';
  const availability = state === undefined ? 'WAITING' : review ? 'READY' : 'WAITING';
  const downloadStatus = latestExport?.status === 'COMPLETED' && exportDetails?.downloadUrl ? 'READY' : latestExport && !['FAILED', 'CANCELED'].includes(latestExport.status) ? 'VERIFYING' : 'NOT_READY';
  async function save(action: () => Promise<unknown>) {
    setSaving(true); setError(undefined);
    try { await action(); } catch { setError('This action could not finish. Check that the selected timeline is approved, locked, and belongs to this production.'); } finally { setSaving(false); }
  }
  async function createReview() {
    const selected = manifest;
    if (!selected) return;
    await save(() => requestReview({ productionId: id, manifestId: selected._id, idempotencyKey: `release-review:${selected._id}` }));
  }
  async function queueExport() {
    const selected = manifest; const approved = review;
    if (!selected || !approved) return;
    await save(() => requestExport({ productionId: id, manifestId: selected._id, reviewId: approved._id, idempotencyKey: `release-export:${selected._id}:${approved._id}` }));
  }
  return <div className="space-y-6">
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Review and export an approved timeline</h2>
      {manifest ? <label className="block space-y-2 text-sm">Assembly version<select className="w-full rounded-lg border border-border bg-background p-3" value={manifest._id} onChange={event => setManifestChoice(event.target.value)}>{state?.manifests?.map((item: any) => <option key={item._id} value={item._id}>Assembly v{item.versionNumber} · {new Date(item.createdAt).toLocaleString()}</option>)}</select></label> : <p className="text-sm text-muted-foreground">Create and approve a timeline, then build its manifest in the edit workspace.</p>}
      {completedManifests.some((item: any) => item._id !== manifest?._id) && <div className="space-y-2 text-sm"><p className="text-muted-foreground">Completed exports are retained on their exact assembly versions.</p><div className="flex flex-wrap gap-2">{completedManifests.filter((item: any) => item._id !== manifest?._id).map((item: any) => <Button key={item._id} variant="secondary" onClick={() => setManifestChoice(item._id)}>View completed Assembly v{item.versionNumber}</Button>)}</div></div>}
      <div className="flex flex-wrap gap-3"><Button disabled={!canEdit || saving || !manifest || Boolean(review)} onClick={createReview}>Request version review</Button><Button variant="secondary" disabled={!canEdit || saving || !manifest || review?.status !== 'APPROVED' || Boolean(latestJob && !['FAILED', 'CANCELED'].includes(latestJob.status))} onClick={queueExport}>Queue asynchronous export</Button></div>
      {latestJob?.status === 'QUEUED' && <p className="text-sm text-muted-foreground">Export queued. Your approved timeline is saved; processing has not started.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {latestExport?.status === 'COMPLETED' && canEdit && state?.projectExternalId && <ShareButton projectId={state.projectExternalId} />}
    </section>
    <ProductionReleaseView review={{ availability, videoUrl: exportDetails?.downloadUrl ?? undefined, decision, canDecide: Boolean(canDecide && review && review.status === 'REQUESTED') }} renderer={{ state: rendererState, message: latestJob?.errorMessage ?? undefined }} download={{ status: downloadStatus, href: exportDetails?.downloadUrl ?? undefined, fileName: exportDetails?.mimeType === 'video/webm' ? 'finalframe-export.webm' : exportDetails?.mimeType === 'video/quicktime' ? 'finalframe-export.mov' : 'finalframe-export.mp4' }} savingDecision={saving} onApprove={review ? () => save(() => approve({ reviewId: review._id })) : undefined} onRequestChanges={review ? note => save(() => requestRevision({ reviewId: review._id, note })) : undefined} />
  </div>;
}
