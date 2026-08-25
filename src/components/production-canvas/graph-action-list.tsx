'use client';

import { GitCompareArrows, LockKeyhole, RefreshCw, ScanSearch } from 'lucide-react';
import type { ProductionGraphNode } from '@/lib/production-graph/contracts';
import { cn } from '@/lib/utils';

export type ProductionCanvasAction = 'inspect' | 'compare' | 'keepVersion' | 'regenerate';

export interface ProductionCanvasActionEvent {
  action: ProductionCanvasAction;
  node: ProductionGraphNode;
  supported: false;
  reason: string;
}

export interface GraphActionListProps {
  node: ProductionGraphNode;
  onAction?: (event: ProductionCanvasActionEvent) => void;
  className?: string;
}

const actions: Array<{
  action: ProductionCanvasAction;
  label: string;
  icon: typeof ScanSearch;
}> = [
  { action: 'inspect', label: 'Inspect', icon: ScanSearch },
  { action: 'compare', label: 'Compare', icon: GitCompareArrows },
  { action: 'keepVersion', label: 'Keep version', icon: LockKeyhole },
  { action: 'regenerate', label: 'Regenerate', icon: RefreshCw },
];

const actionReason = 'This Canvas control is a preview event and is not connected to production commands yet.';

/**
 * Mobile-safe actions for a graph node.
 *
 * These controls intentionally emit typed UI events only. They do not mutate
 * production state, create a job, or reserve credits until the command layer
 * is connected in a later Canvas phase.
 */
export function GraphActionList({ node, onAction, className }: GraphActionListProps) {
  function emit(action: ProductionCanvasAction) {
    onAction?.({ action, node, supported: false, reason: actionReason });
  }

  return (
    <div className={cn('mt-4 rounded-2xl border border-dashed border-border bg-secondary/45 p-3', className)}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-background text-muted-foreground" aria-hidden="true">
          <ScanSearch className="size-3.5" />
        </span>
        <div>
          <p className="text-xs font-semibold text-foreground">Canvas controls</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground" id={`canvas-action-note-${node.id}`}>
            Preview only for now. These actions do not generate video or use credits yet.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2" aria-describedby={`canvas-action-note-${node.id}`}>
        {actions.map(({ action, label, icon: Icon }) => (
          <button
            key={action}
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-left text-xs font-semibold text-foreground transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
            onClick={() => emit(action)}
            title={`${label} is not connected yet`}
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 truncate">{label}</span>
            <span className="sr-only">Not connected yet. This is a preview event only.</span>
          </button>
        ))}
      </div>
    </div>
  );
}
