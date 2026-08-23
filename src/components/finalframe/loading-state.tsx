import type { HTMLAttributes } from 'react';

import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { cn } from '@/lib/utils';

export interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function LoadingState({
  label = 'Loading',
  description,
  size = 'md',
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      className={cn('flex min-h-40 flex-col items-center justify-center text-center', className)}
      role="status"
      aria-live="polite"
      {...props}
    >
      <LoadingSpinner size={size} className="text-primary" aria-hidden="true" />
      <p className="mt-4 text-sm font-semibold text-foreground">{label}</p>
      {description && <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>}
    </div>
  );
}
