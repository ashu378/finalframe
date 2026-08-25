export type ReviewDecision = 'PENDING' | 'CHANGES_REQUESTED' | 'APPROVED';

export type ReviewAvailability = 'READY' | 'WAITING' | 'UNAVAILABLE' | 'ERROR';

export interface ReviewVersion {
  id: string;
  label: string;
  createdAt: string;
  createdBy?: string;
  status: 'DRAFT' | 'READY' | 'APPROVED' | 'SUPERSEDED';
  durationSeconds?: number;
  note?: string;
  previewUrl?: string;
}

export interface ReviewDependencyWarning {
  id: string;
  label: string;
  detail: string;
  href?: string;
}
