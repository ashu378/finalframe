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

export function ProductionReleaseView({ review, versions = [], warnings = [], timeline, renderer, download, savingDecision = false, lockingTimeline = false, retryingRender = false, onApprove, onRequestChanges, onSelectVersion, onCompareVersions, onLockTimeline, onRetryRender }: ProductionReleaseViewProps) {
  return <div className="space-y-6" data-testid="production-release-view"><div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)] lg:items-start"><section className="space-y-4"><ReviewStateCard availability={review.availability} />{review.videoUrl ? <div className="overflow-hidden rounded-3xl bg-black shadow-[0_24px_70px_-34px_rgba(25,18,14,.7)]"><ReviewPlayer url={review.videoUrl} /></div> : null}<div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6"><ReviewDecisionPanel decision={review.decision} canDecide={review.canDecide} saving={savingDecision} onApprove={onApprove} onRequestChanges={onRequestChanges} /></div></section><aside className="space-y-4 lg:sticky lg:top-6"><StaleDependencyWarning warnings={warnings} />{renderer ? <RendererStatusCard {...renderer} retrying={retryingRender} onRetry={onRetryRender} /> : null}</aside></div>{versions.length > 0 ? <VersionHistory versions={versions} onSelect={(version) => onSelectVersion?.(version)} onCompare={onCompareVersions} /> : null}{timeline ? <RenderReadiness timelineStatus={timeline.status} checks={timeline.checks} locking={lockingTimeline} onLock={onLockTimeline} /> : null}{download ? <DownloadState {...download} /> : null}</div>;
}
