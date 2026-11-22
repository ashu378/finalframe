'use client';

import { ReviewDecisionPanel } from '@/components/review/review-decision-panel';
import { ReviewPlayer } from '@/components/review/review-player';
import { ReviewStateCard } from '@/components/review/review-state-card';
import { StaleDependencyWarning } from '@/components/review/stale-dependency-warning';
import { VersionHistory } from '@/components/review/version-history';
import type { ReviewAvailability, ReviewDecision, ReviewDependencyWarning, ReviewVersion } from '@/components/review/review-types';
import { DownloadState } from '@/components/render/download-state';
import { RenderReadiness, type RenderReadinessCheck } from '@/components/render/render-readiness';
import { RendererStatusCard } from '@/components/render/renderer-status-card';
import type { RenderJobState } from '@/lib/render/contracts';

export interface ProductionReleaseViewProps {
  stage?: 'review' | 'export';
  review: { availability: ReviewAvailability; videoUrl?: string; decision?: ReviewDecision; canDecide?: boolean };
  versions?: ReviewVersion[];
  warnings?: ReviewDependencyWarning[];
  timeline?: { status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'LOCKED' | 'SUPERSEDED'; checks: RenderReadinessCheck[] };
  renderer?: { state: RenderJobState | 'NOT_STARTED' | 'UNAVAILABLE'; message?: string; attempt?: number };
  download?: { status: 'NOT_READY' | 'VERIFYING' | 'READY' | 'EXPIRED'; href?: string; fileName?: string; expiresAt?: string };
  savingDecision?: boolean;
  lockingTimeline?: boolean;
  retryingRender?: boolean;
  onApprove?: () => void | Promise<void>;
  onRequestChanges?: (note: string) => void | Promise<void>;
  onSelectVersion?: (version: ReviewVersion) => void;
  onCompareVersions?: (left: ReviewVersion, right: ReviewVersion) => void;
  onLockTimeline?: () => void | Promise<void>;
  onRetryRender?: () => void | Promise<void>;
}

export function ProductionReleaseView({ stage, review, versions = [], warnings = [], timeline, renderer, download, savingDecision = false, lockingTimeline = false, retryingRender = false, onApprove, onRequestChanges, onSelectVersion, onCompareVersions, onLockTimeline, onRetryRender }: ProductionReleaseViewProps) {
  const showReview = stage !== 'export';
  const showExport = stage !== 'review';
  return <div className="min-w-0 space-y-6 sm:space-y-8" data-testid="production-release-view">
    <div className={stage ? 'min-w-0 space-y-4' : 'grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)] xl:items-start'}>
      {showReview && <section className="min-w-0 space-y-4" aria-label="Video review">
        {stage==='review' && warnings.length>0?<StaleDependencyWarning warnings={warnings}/>:null}
        <ReviewStateCard availability={review.availability} />
        {review.videoUrl ? <div className="overflow-hidden rounded-2xl border border-border bg-black"><ReviewPlayer url={review.videoUrl} /></div> : null}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6"><ReviewDecisionPanel decision={review.decision} canDecide={review.canDecide} saving={savingDecision} onApprove={onApprove} onRequestChanges={onRequestChanges} /></div>
      </section>}
      {showExport && <aside className="min-w-0 space-y-4" aria-label="Video processing status">
        <StaleDependencyWarning warnings={warnings} />
        {renderer ? <RendererStatusCard {...renderer} retrying={retryingRender} onRetry={onRetryRender} /> : null}
      </aside>}
    </div>
    {showReview && versions.length > 0 ? <VersionHistory versions={versions} onSelect={(version) => onSelectVersion?.(version)} onCompare={onCompareVersions} /> : null}
    {showExport && timeline ? <RenderReadiness timelineStatus={timeline.status} checks={timeline.checks} locking={lockingTimeline} onLock={onLockTimeline} /> : null}
    {showExport && download ? <DownloadState {...download} /> : null}
  </div>;
}
