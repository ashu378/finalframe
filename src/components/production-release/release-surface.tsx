'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { ProductionReleaseView } from './production-release-view';
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
  const [saving, setSaving] = useState(false);
  const approve = useMutation(api.reviewExport.approve);
  const requestRevision = useMutation(api.reviewExport.requestRevision);
  const review = state?.review;
  const latestExport = state?.exports?.[0];
  const exportDetails = useQuery(api.reviewExport.getExport, latestExport ? { exportId: latestExport._id } : 'skip');
  const latestJob = jobs?.[0];

  const rendererState = latestJob ? rendererStateFor(latestJob.status) : 'UNAVAILABLE';

  const decision = review?.status === 'APPROVED' ? 'APPROVED' : review?.status === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : 'PENDING';
  const availability = state === undefined ? 'WAITING' : review ? 'READY' : 'WAITING';
  const downloadStatus = latestExport?.status === 'COMPLETED' && exportDetails?.downloadUrl ? 'READY' : latestExport ? 'VERIFYING' : 'NOT_READY';

  async function handleApprove() {
    if (!review) return;
    setSaving(true);
    try { await approve({ reviewId: review._id }); } finally { setSaving(false); }
  }

  async function handleRequestChanges(note: string) {
    if (!review) return;
    setSaving(true);
    try { await requestRevision({ reviewId: review._id, note }); } finally { setSaving(false); }
  }

  return <ProductionReleaseView
    review={{ availability, decision, canDecide: Boolean(review && review.status !== 'APPROVED') }}
    renderer={{ state: rendererState, message: latestJob?.errorMessage ?? undefined }}
    download={{ status: downloadStatus, href: exportDetails?.downloadUrl ?? undefined, fileName: exportDetails?.mimeType ? `finalframe-export.${exportDetails.mimeType.split('/')[1] ?? 'mp4'}` : undefined }}
    savingDecision={saving}
    onApprove={review ? handleApprove : undefined}
    onRequestChanges={review ? handleRequestChanges : undefined}
  />;
}
