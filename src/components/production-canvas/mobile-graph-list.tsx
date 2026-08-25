'use client';

import { useMemo } from 'react';
import { ArrowDown, CircleAlert, GitBranch, LoaderCircle, LockKeyhole } from 'lucide-react';
import type { ProductionGraphEdge, ProductionGraphNode } from '@/lib/production-graph/contracts';
import { graphStateClass, graphStateLabel } from '@/lib/production-graph/contracts';
import { cn } from '@/lib/utils';
import { GraphActionList, type ProductionCanvasActionEvent } from './graph-action-list';

export interface MobileGraphListProps {
  nodes: ProductionGraphNode[];
  edges: ProductionGraphEdge[];
  onSelect?: (node: ProductionGraphNode) => void;
  isLoading?: boolean;
  onAction?: (event: ProductionCanvasActionEvent) => void;
  className?: string;
  title?: string;
  description?: string;
}

const kindLabels: Record<string, string> = {
  production: 'Video project',
  plan: 'Plan',
  productionVersion: 'Version',
  sequence: 'Chapter',
  scene: 'Part',
  shot: 'Take brief',
  videoTake: 'Video take',
  image: 'Media',
  imageEdit: 'Edited media',
  voice: 'Voice',
  audio: 'Audio',
  transcript: 'Transcript',
  captions: 'Captions',
  timeline: 'Edit',
  review: 'Review',
  export: 'Download',
};

function StateIcon({ state }: { state: ProductionGraphNode['state'] }) {
  if (state === 'working') return <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />;
  if (state === 'failed' || state === 'blocked') return <CircleAlert className="size-3.5" aria-hidden="true" />;
  if (state === 'locked') return <LockKeyhole className="size-3.5" aria-hidden="true" />;
  return <span className="size-2 rounded-full bg-current" aria-hidden="true" />;
}

function stableDependencyOrder(nodes: ProductionGraphNode[], edges: ProductionGraphEdge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const position = new Map(nodes.map((node, index) => [node.id, index]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) continue;
    outgoing.get(edge.source)?.push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  const queue = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  const orderedIds: string[] = [];

  while (queue.length > 0) {
    queue.sort((left, right) => (position.get(left) ?? 0) - (position.get(right) ?? 0));
    const current = queue.shift();
    if (!current) continue;
    orderedIds.push(current);

    for (const target of outgoing.get(current) ?? []) {
      const nextCount = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, nextCount);
      if (nextCount === 0) queue.push(target);
    }
  }

  // Preserve visibility if an incomplete graph contains a cycle or a partially
  // loaded edge set. The original order is the safest fallback for those nodes.
  for (const node of nodes) {
    if (!orderedIds.includes(node.id)) orderedIds.push(node.id);
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  return orderedIds.flatMap((id) => {
    const node = byId.get(id);
    return node ? [node] : [];
  });
}

function connectedLabels(node: ProductionGraphNode, edges: ProductionGraphEdge[], byId: Map<string, ProductionGraphNode>, direction: 'from' | 'to') {
  const ids = edges
    .filter((edge) => direction === 'from' ? edge.target === node.id : edge.source === node.id)
    .map((edge) => direction === 'from' ? edge.source : edge.target);

  return ids.flatMap((id) => {
    const connected = byId.get(id);
    return connected ? [connected.label] : [];
  });
}

function LoadingList() {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-label="Loading production Canvas">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="animate-pulse rounded-2xl border border-border/70 bg-card p-4">
          <div className="h-3 w-24 rounded-full bg-secondary" />
          <div className="mt-4 h-5 w-2/3 rounded-full bg-secondary" />
          <div className="mt-3 h-3 w-full rounded-full bg-secondary" />
          <div className="mt-2 h-3 w-4/5 rounded-full bg-secondary" />
        </div>
      ))}
      <span className="sr-only">Loading the production graph.</span>
    </div>
  );
}

export function MobileGraphList({
  nodes,
  edges,
  onSelect,
  isLoading = false,
  onAction,
  className,
  title = 'Production steps',
  description = 'Follow the production in order. Each step stays connected to the media and decisions that shape it.',
}: MobileGraphListProps) {
  const orderedNodes = useMemo(() => stableDependencyOrder(nodes, edges), [nodes, edges]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  return (
    <section className={cn('ff-card overflow-hidden', className)} aria-labelledby="mobile-production-steps-heading">
      <div className="border-b border-border/70 p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary" aria-hidden="true">
            <GitBranch className="size-5" />
          </span>
          <div>
            <p className="ff-eyebrow">Mobile Canvas</p>
            <h2 id="mobile-production-steps-heading" className="ff-display mt-2 text-2xl font-semibold">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {isLoading ? <LoadingList /> : orderedNodes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-secondary/35 px-6 py-10 text-center">
            <GitBranch className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
            <h3 className="ff-display mt-4 text-xl font-semibold">Your production map is taking shape</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Once a plan is ready, its connected steps will appear here in the order they need to happen.
            </p>
          </div>
        ) : (
          <ol className="space-y-3" aria-label="Production steps in dependency order">
            {orderedNodes.map((node, index) => {
              const connectedFrom = connectedLabels(node, edges, byId, 'from');
              const connectedTo = connectedLabels(node, edges, byId, 'to');
              const stateClass = graphStateClass(node.state);

              return (
                <li key={node.id} className="relative">
                  <article className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-[0_12px_28px_-24px_hsl(24_30%_22%_/_0.7)]">
                    <div className="flex items-start gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold text-secondary-foreground" aria-label={`Step ${index + 1}`}>
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground">{kindLabels[node.kind] ?? 'Production step'}</span>
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold', stateClass)}>
                            <StateIcon state={node.state} />
                            {graphStateLabel(node.state)}
                          </span>
                        </div>
                        {onSelect ? (
                          <button
                            type="button"
                            className="mt-2 block max-w-full break-words text-left font-semibold text-foreground underline decoration-primary/40 underline-offset-4 transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => onSelect(node)}
                            aria-label={`Select ${node.label}`}
                          >
                            {node.label}
                          </button>
                        ) : (
                          <h3 className="mt-2 break-words font-semibold text-foreground">{node.label}</h3>
                        )}
                        {node.detail ? <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{node.detail}</p> : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                      <ConnectionGroup label="Connected from" values={connectedFrom} emptyLabel="Starts here" />
                      <ConnectionGroup label="Connected to" values={connectedTo} emptyLabel="No next step yet" />
                    </div>

                    <GraphActionList node={node} onAction={onAction} />
                  </article>
                  {index < orderedNodes.length - 1 ? (
                    <div className="flex h-6 items-center justify-center text-border" aria-hidden="true">
                      <ArrowDown className="size-4" />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function ConnectionGroup({ label, values, emptyLabel }: { label: string; values: string[]; emptyLabel: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-secondary/55 px-3 py-2">
      <p className="font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 break-words leading-5 text-foreground">{values.length > 0 ? values.join(' · ') : emptyLabel}</p>
    </div>
  );
}
