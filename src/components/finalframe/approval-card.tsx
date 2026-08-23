'use client';

import type { ReactNode } from 'react';
import { Check, Coins, LockKeyhole } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ApprovalCardProps {
  title?: string;
  description?: string;
  creditCost?: number | string;
  creditLabel?: string;
  details?: ReactNode;
  children?: ReactNode;
  approveLabel?: string;
  cancelLabel?: string;
  onApprove?: () => void;
  onCancel?: () => void;
  isApproving?: boolean;
  className?: string;
}

export function ApprovalCard({
  title = 'Review before making',
  description = 'Everything looks ready. Check the plan and cost before FinalFrame starts creating.',
  creditCost,
  creditLabel = 'video credits',
  details,
  children,
  approveLabel = 'Approve and make video',
  cancelLabel = 'Keep editing',
  onApprove,
  onCancel,
  isApproving = false,
  className,
}: ApprovalCardProps) {
  return (
    <section className={cn('ff-card overflow-hidden', className)} aria-label={title}>
      <div className="border-b border-border/70 bg-secondary/35 px-6 py-5 sm:px-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-foreground" aria-hidden="true">
            <LockKeyhole className="size-4" />
          </span>
          <div>
            <h2 className="ff-display text-2xl font-semibold">{title}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>
      <div className="space-y-5 px-6 py-6 sm:px-7">
        {children}
        {details && <div className="rounded-xl border border-border/70 bg-background/60 p-4">{details}</div>}
        {creditCost !== undefined && (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-secondary/70 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold"><Coins className="size-4 text-primary" aria-hidden="true" /> Estimated cost</span>
            <span className="text-sm font-semibold text-foreground">{creditCost} {creditLabel}</span>
          </div>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {onCancel && <button type="button" className="ff-button-quiet" onClick={onCancel} disabled={isApproving}>{cancelLabel}</button>}
          {onApprove && (
            <button type="button" className="ff-button-primary" onClick={onApprove} disabled={isApproving} aria-busy={isApproving}>
              <Check className="size-4" aria-hidden="true" />
              {isApproving ? 'Starting…' : approveLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
