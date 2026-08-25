'use client';

import { ArrowUpRight, CheckCircle2, CircleAlert, Clock3, LockKeyhole, X } from 'lucide-react';
import type { ProductionGraphNode } from '@/lib/production-graph/contracts';
import { graphStateClass, graphStateLabel } from '@/lib/production-graph/contracts';
import { cn } from '@/lib/utils';

const kindLabels: Record<string, string> = {
  production: 'Video project',
  plan: 'Plan',
  productionVersion: 'Plan version',
  sequence: 'Chapter',
  scene: 'Part',
  shot: 'Take brief',
  videoTake: 'Video take',
  image: 'Image',
  imageEdit: 'Image version',
  voice: 'Voice',
  audio: 'Audio',
  transcript: 'Transcript',
  captions: 'Captions',
  timeline: 'Edit timeline',
  review: 'Review',
  export: 'Download',
};

function StateIcon({ state }: { state: ProductionGraphNode['state'] }) {
  if (state === 'working') return <Clock3 className="size-4" aria-hidden="true" />;
  if (state === 'failed' || state === 'blocked') return <CircleAlert className="size-4" aria-hidden="true" />;
  if (state === 'locked') return <LockKeyhole className="size-4" aria-hidden="true" />;
  return <CheckCircle2 className="size-4" aria-hidden="true" />;
}

export type NodeInspectorProps = {
  node?: ProductionGraphNode;
  onClose?: () => void;
  onInspect?: (node: ProductionGraphNode) => void;
  className?: string;
};

export function NodeInspector({ node, onClose, onInspect, className }: NodeInspectorProps) {
  if (!node) {
    return (
      <aside className={cn('flex min-h-[22rem] flex-col justify-center border-l border-border/70 bg-card/75 p-6 lg:p-7', className)} aria-label="Canvas inspector">
        <div className="grid size-11 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <ArrowUpRight className="size-5" aria-hidden="true" />
        </div>
        <p className="ff-eyebrow mt-6">Node inspector</p>
        <h2 className="ff-display mt-2 text-2xl font-semibold">Choose a production step.</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Select a card on the map to see its current state and place in the production.</p>
      </aside>
    );
  }

  const kindLabel = kindLabels[node.kind] ?? 'Production step';

  return (
    <aside className={cn('border-l border-border/70 bg-card/75 p-6 lg:p-7', className)} aria-label={`Inspector for ${node.label}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="ff-eyebrow">{kindLabel}</p>
          <h2 className="ff-display mt-2 text-2xl font-semibold leading-tight">{node.label}</h2>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label="Close node inspector">
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className={cn('mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold', graphStateClass(node.state))}>
        <StateIcon state={node.state} />
        {graphStateLabel(node.state)}
      </div>

      <dl className="mt-7 divide-y divide-border/70 rounded-2xl border border-border/70 bg-background/60">
        <div className="grid gap-1 p-4">
          <dt className="text-xs font-semibold text-muted-foreground">What this is</dt>
          <dd className="text-sm font-medium">{kindLabel}</dd>
        </div>
        <div className="grid gap-1 p-4">
          <dt className="text-xs font-semibold text-muted-foreground">Current state</dt>
          <dd className="text-sm font-medium">{graphStateLabel(node.state)}</dd>
        </div>
        <div className="grid gap-1 p-4">
          <dt className="text-xs font-semibold text-muted-foreground">Record</dt>
          <dd className="break-all font-mono text-xs text-muted-foreground">{node.resourceId}</dd>
        </div>
      </dl>

      {node.detail ? <p className="mt-5 text-sm leading-6 text-muted-foreground">{node.detail}</p> : null}

      {onInspect ? (
        <button type="button" onClick={() => onInspect(node)} className="ff-button-secondary mt-7 w-full">
          Inspect this step
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </aside>
  );
}

