'use client';

import type { HTMLAttributes } from 'react';
import { ArrowRight, Sparkles, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Sparkles,
  actionLabel,
  onAction,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn('ff-card flex flex-col items-center px-6 py-12 text-center sm:px-10', className)}
      {...props}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-foreground" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <h2 className="ff-display mt-5 text-2xl font-semibold">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <button type="button" className="ff-button-primary mt-6" onClick={onAction}>
          {actionLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
