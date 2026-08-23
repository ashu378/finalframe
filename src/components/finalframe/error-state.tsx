'use client';

import type { HTMLAttributes } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description: string;
  actionLabel?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'This needs another look',
  description,
  actionLabel = 'Try again',
  onRetry,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      className={cn('ff-card flex flex-col items-center border-destructive/30 px-6 py-10 text-center', className)}
      role="alert"
      {...props}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive" aria-hidden="true">
        <TriangleAlert className="size-5" />
      </span>
      <h2 className="ff-display mt-5 text-2xl font-semibold">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {onRetry && (
        <button type="button" className="ff-button-secondary mt-6" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
