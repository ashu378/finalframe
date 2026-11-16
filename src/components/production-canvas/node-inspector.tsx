'use client';

import { ArrowUpRight, CheckCircle2, CircleAlert, Clock3, LockKeyhole, X } from 'lucide-react';
import type { ProductionGraphNode } from '@/lib/production-graph/contracts';
import { graphNodeDetail, graphStateClass, graphStateLabel } from '@/lib/production-graph/contracts';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const kindLabels: Record<string, string> = {
  production: 'Video project',
  plan: 'Plan',
  productionVersion: 'Plan version',
  sequence: 'Chapter',
  scene: 'Scene',
  shot: 'Shot',
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
      <aside className={cn('flex min-w-0 min-h-[16rem] flex-col justify-center border-t border-border/70 bg-card/75 p-5 lg:min-h-[22rem] lg:border-l lg:border-t-0 lg:p-7', className)} aria-label="Canvas inspector">
        <div className="grid size-11 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <ArrowUpRight className="size-5" aria-hidden="true" />
        </div>
        <h2 className="ff-display mt-4 text-2xl font-semibold">Choose a video step</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Select a step to see its progress, saved version and connected media.</p>
      </aside>
    );
  }

  const kindLabel = kindLabels[node.kind] ?? 'Production step';
  const artifactHref = node.artifactHref && (/^\/(?!\/)/.test(node.artifactHref) || /^https:\/\//.test(node.artifactHref)) ? node.artifactHref : undefined;

  return (
    <aside className={cn('min-w-0 border-t border-border/70 bg-card/75 p-5 lg:border-l lg:border-t-0 lg:p-7', className)} aria-label={`Inspector for ${node.label}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{kindLabel}</p>
          <h2 className="ff-display mt-2 break-words text-2xl font-semibold leading-tight">{node.label}</h2>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close node inspector">
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
          <dt className="text-xs font-semibold text-muted-foreground">Progress</dt>
          <dd className="text-sm font-medium">{graphStateLabel(node.state)}</dd>
        </div>
        <div className="grid gap-1 p-4">
          <dt className="text-xs font-semibold text-muted-foreground">Saved record ID</dt>
          <dd className="break-all font-mono text-xs text-muted-foreground">{node.resourceId}</dd>
        </div>
      </dl>

      {node.detail ? <p className="mt-5 text-sm leading-6 text-muted-foreground">{graphNodeDetail(node)}</p> : null}

      {artifactHref ? <Link className="ff-button-secondary mt-7 flex min-h-11 w-full items-center justify-center gap-2" href={artifactHref} prefetch={false}>Open this saved version<ArrowUpRight className="size-4" aria-hidden="true" /></Link> : onInspect ? (
        <button type="button" onClick={() => onInspect(node)} className="ff-button-secondary mt-7 min-h-11 w-full">
          View step details
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </aside>
  );
}

