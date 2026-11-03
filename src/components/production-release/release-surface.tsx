'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import type { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { ProductionReleaseView } from './production-release-view';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/review/share-button';
import { EmergencyReset } from '@/components/project/emergency-reset';
import type { RenderJobState } from '@/lib/render/contracts';
import { captionTrackDownloadName } from '@/lib/production/caption-controls';

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
  const currentVersionId=state?.production?.currentVersionId;
  const belongsToCurrent=(item:any)=>Boolean(currentVersionId&&item.productionId===id&&item.projectId===state?.production?.projectId&&item.manifest?.productionId===id&&item.manifest?.projectId===state?.production?.projectId&&item.manifest?.productionVersionId===currentVersionId);
  const assemblyCategory=(item:any)=>belongsToCurrent(item)?'Current production':item.manifest?.productionVersionId&&item.manifest.productionVersionId!==currentVersionId?'Historical production':'Retained assembly';
  const currentManifest=state?.manifests?.find(belongsToCurrent);
  const manifestHistoryLimited=(state?.manifests?.length??0)>=100;
  const manifest = state?.manifests?.find((item: any) => item._id === manifestChoice) ?? currentManifest;
  const isCurrent=Boolean(manifest&&belongsToCurrent(manifest));
  const writableContract=Boolean(manifest&&[4,5].includes(manifest.manifest?.version)&&manifest.manifest.version===manifest.contractVersion);
  const review = state?.reviews?.filter((item: any) => item.manifestId === manifest?._id && !item.exportId).sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
  const latestExport = state?.exports?.find((item: any) => item.manifestId === manifest?._id);
  const exportDetails = useQuery(api.reviewExport.getExport, latestExport ? { exportId: latestExport._id } : 'skip');
  const captionFiles = useQuery(api.assembly.captionSidecars, manifest && latestExport?.status === 'COMPLETED' && Array.isArray((manifest.manifest as any)?.captionTracks) && (manifest.manifest as any).captionTracks.length ? { manifestId: manifest._id, exportId: latestExport._id } : 'skip');
  const latestJob = jobs?.find((item: any) => item.manifestId === manifest?._id);
  const canEdit = ['OWNER', 'EDITOR'].includes(state?.projectRole ?? ''); const canDecide = ['OWNER', 'EDITOR', 'REVIEWER'].includes(state?.projectRole ?? '');
  // An unexported assembly is not evidence of an unavailable renderer. Other
  // immutable assembly versions can already have a verified downloadable file.
  const rendererState = latestJob ? rendererStateFor(latestJob.status) : 'NOT_STARTED';
  const completedManifests = state?.manifests?.filter((item: any) => state.exports?.some((output: any) => output.manifestId === item._id && output.status === 'COMPLETED' && output.storageId)) ?? [];
  const decision = review?.status === 'APPROVED' ? 'APPROVED' : review?.status === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : 'PENDING';
  const availability = latestExport?.status === 'COMPLETED' && exportDetails?.downloadUrl ? 'READY' : !latestJob ? 'NOT_STARTED' : 'WAITING';
  const downloadStatus = latestExport?.status === 'COMPLETED' && exportDetails?.downloadUrl ? 'READY' : latestExport && !['FAILED', 'CANCELED'].includes(latestExport.status) ? 'VERIFYING' : 'NOT_READY';
  async function save(action: () => Promise<unknown>) {
    setSaving(true); setError(undefined);
    try { await action(); } catch { setError('This action could not finish. Check that the selected timeline is approved, locked, and belongs to this production.'); } finally { setSaving(false); }
  }
  async function createReview() {
    const selected = manifest;
    if (!selected || !isCurrent || !writableContract || !canEdit) return;
    await save(() => requestReview({ productionId: id, manifestId: selected._id, idempotencyKey: `release-review:${selected._id}` }));
  }
  async function queueExport() {
    const selected = manifest; const approved = review;
    if (!selected || !approved || !isCurrent || !writableContract || !canEdit) return;
    await save(() => requestExport({ productionId: id, manifestId: selected._id, reviewId: approved._id, idempotencyKey: `release-export:${selected._id}:${approved._id}` }));
  }
  function downloadCaptions(text: string, language: string, trackId: string, format: 'srt' | 'vtt') {
    const url = URL.createObjectURL(new Blob([text], { type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = captionTrackDownloadName(language, trackId, format);
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  if (state === undefined || jobs === undefined || latestExport && exportDetails === undefined) {
    return <section role="status" aria-busy="true" className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading this production’s saved reviews and exports…</section>;
  }
  return <div className="space-y-6">
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Review and export an approved timeline</h2>
      {!currentManifest ? <div className="space-y-2 text-sm text-muted-foreground"><p>{manifestHistoryLimited?'No current assembly was found in the recent history. Check the saved versions before creating another timeline.':'The current production version needs finishing. Create and approve its timeline, then build an assembly in Edit.'}</p>{state?.projectExternalId ? <Link className="inline-flex min-h-11 items-center text-primary underline underline-offset-4" href={`/dashboard/projects/${encodeURIComponent(state.projectExternalId)}/workspace/edit?production=${encodeURIComponent(productionId)}`}>Open Edit for the current production</Link> : null}</div> : null}
      {state?.manifests?.length ? <label className="block space-y-2 text-sm">Assembly version<select className="w-full rounded-lg border border-border bg-background p-3" value={manifest?._id??''} onChange={event => {setManifestChoice(event.target.value);setError(undefined);}}><option value="" disabled={Boolean(currentManifest)}>Choose a retained assembly to inspect</option>{state.manifests.map((item: any) => <option key={item._id} value={item._id}>{assemblyCategory(item)} · Assembly v{item.versionNumber} · {new Date(item.createdAt).toLocaleString()}</option>)}</select></label> : null}
      {manifest&&!isCurrent ? <p role="status" className="text-sm text-muted-foreground">Viewing a retained historical assembly. Its review and saved download belong to that exact version; it is read-only here.</p> : manifest&&!writableContract ? <p className="text-sm text-muted-foreground">This saved assembly is available for viewing and download. Create a new current timeline to make changes.</p> : null}
      {completedManifests.some((item: any) => item._id !== manifest?._id) && <div className="space-y-2 text-sm"><p className="text-muted-foreground">Completed exports are retained on their exact assembly versions.</p><div className="flex flex-wrap gap-2">{completedManifests.filter((item: any) => item._id !== manifest?._id).map((item: any) => <Button key={item._id} variant="secondary" onClick={() => setManifestChoice(item._id)}>View {belongsToCurrent(item)?'completed':'historical'} Assembly v{item.versionNumber}</Button>)}</div></div>}
      <div className="flex flex-wrap gap-3"><Button disabled={!canEdit || saving || !isCurrent || !writableContract || Boolean(review)} onClick={createReview}>Request version review</Button><Button variant="secondary" disabled={!canEdit || saving || !isCurrent || !writableContract || review?.status !== 'APPROVED' || Boolean(latestJob && !['FAILED', 'CANCELED'].includes(latestJob.status))} onClick={queueExport}>Queue asynchronous export</Button></div>
      {latestJob?.status === 'QUEUED' && <p className="text-sm text-muted-foreground">Export queued. Your approved timeline is saved; processing has not started.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {latestExport?.status === 'COMPLETED' && canEdit && isCurrent && writableContract && state?.projectExternalId && <ShareButton projectId={state.projectExternalId} />}
      {captionFiles?.length ? <div className="space-y-2"><p className="text-sm text-muted-foreground">Caption files match this exact completed export. Tracks download separately; caption styling is included in the video.</p><div className="space-y-3">{captionFiles.map((file, index) => <div key={file.trackId} className="space-y-2 rounded-lg border border-border p-3"><p className="break-all text-xs text-muted-foreground">Caption track {index + 1} · {file.language} · {file.trackId}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" aria-label={`Download ${file.language} caption track ${file.trackId} as SRT`} onClick={() => downloadCaptions(file.srt, file.language, file.trackId, 'srt')}>Download track {index + 1} SRT</Button><Button variant="secondary" aria-label={`Download ${file.language} caption track ${file.trackId} as VTT`} onClick={() => downloadCaptions(file.vtt, file.language, file.trackId, 'vtt')}>Download track {index + 1} VTT</Button></div></div>)}</div></div> : null}
    </section>
    <ProductionReleaseView review={{ availability, videoUrl: exportDetails?.downloadUrl ?? undefined, decision, canDecide: Boolean(canDecide && isCurrent && writableContract && review && review.status === 'REQUESTED') }} renderer={{ state: rendererState, message: latestJob?.errorMessage ?? undefined }} download={{ status: downloadStatus, href: exportDetails?.downloadUrl ?? undefined, fileName: exportDetails?.mimeType === 'video/webm' ? 'finalframe-export.webm' : exportDetails?.mimeType === 'video/quicktime' ? 'finalframe-export.mov' : 'finalframe-export.mp4' }} savingDecision={saving} retryingRender={saving} onApprove={review && isCurrent && writableContract ? () => save(() => approve({ reviewId: review._id })) : undefined} onRequestChanges={review && isCurrent && writableContract ? note => save(() => requestRevision({ reviewId: review._id, note })) : undefined} />
    {state?.projectExternalId ? <EmergencyReset key={state.projectExternalId} projectId={state.projectExternalId} /> : null}
  </div>;
}
