import type { HTMLAttributes } from 'react';

import { friendlyProjectStatus, type FriendlyProjectStatus, type FriendlyStatusTone } from '@/lib/ui/labels';
import { cn } from '@/lib/utils';

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: string | FriendlyProjectStatus;
  tone?: FriendlyStatusTone;
}

const toneClasses: Record<FriendlyStatusTone, string> = {
  neutral: 'border-border bg-secondary text-secondary-foreground',
  warm: 'border-primary/25 bg-primary/10 text-foreground',
  success: 'border-[hsl(var(--success)/.25)] bg-[hsl(var(--success)/.12)] text-[hsl(var(--success))]',
  danger: 'border-destructive/25 bg-destructive/10 text-destructive',
};

export function StatusBadge({ status, tone, className, ...props }: StatusBadgeProps) {
  const friendly = typeof status === 'object' ? status : friendlyProjectStatus(status);
  const resolvedTone = tone ?? friendly.tone;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
        toneClasses[resolvedTone],
        className,
      )}
      title={friendly.description}
      {...props}
    >
      {friendly.label}
    </span>
  );
}
