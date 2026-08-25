'use client';

import { useState } from 'react';
import { Check, MessageSquare, ShieldCheck } from 'lucide-react';
import { RevisionRequestForm } from './revision-request-form';
import type { ReviewDecision } from './review-types';

interface ReviewDecisionPanelProps {
  decision?: ReviewDecision;
  canDecide?: boolean;
  saving?: boolean;
  onApprove?: () => void | Promise<void>;
  onRequestChanges?: (note: string) => void | Promise<void>;
}

export function ReviewDecisionPanel({ decision = 'PENDING', canDecide = false, saving = false, onApprove, onRequestChanges }: ReviewDecisionPanelProps) {
  const [requestingChanges, setRequestingChanges] = useState(false);
  const isApproved = decision === 'APPROVED';
  const isChangesRequested = decision === 'CHANGES_REQUESTED';

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 ${isApproved ? 'bg-[#c8ddd5]/70 text-[hsl(var(--success))]' : isChangesRequested ? 'bg-[#fff8e9] text-[#805b14]' : 'bg-secondary text-muted-foreground'}`}>
          <ShieldCheck className="size-4" aria-hidden="true" />
          {isApproved ? 'Approved' : isChangesRequested ? 'Changes requested' : 'Waiting for your decision'}
        </span>
      </div>
      {isChangesRequested ? <p className="rounded-xl bg-[#fff8e9] p-4 text-sm leading-6 text-muted-foreground">Your note is saved. FinalFrame will use it to prepare the next version.</p> : null}
      {canDecide && !isApproved && (requestingChanges ? <RevisionRequestForm submitting={saving} onCancel={() => setRequestingChanges(false)} onSubmit={async (note) => { await onRequestChanges?.(note); setRequestingChanges(false); }} /> : <div className="flex flex-col gap-3 sm:flex-row"><button type="button" className="ff-button-quiet min-h-11 border border-border" onClick={() => setRequestingChanges(true)} disabled={saving}><MessageSquare className="size-4" aria-hidden="true" /> Ask for a change</button><button type="button" className="ff-button-primary min-h-11" onClick={() => void onApprove?.()} disabled={saving}><Check className="size-4" aria-hidden="true" /> Approve this version</button></div>)}
      {!canDecide && !isApproved ? <p className="text-sm leading-6 text-muted-foreground">Review actions are not connected for this link yet. Nothing has been approved or requested.</p> : null}
    </div>
  );
}
