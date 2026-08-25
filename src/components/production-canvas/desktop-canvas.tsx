'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronRight, CircleAlert, Clock3, Crosshair, Eye, Film, Grid2X2, Image, LayoutTemplate, Maximize2, Mic2, PlaySquare, RotateCcw, ScanLine, Settings2, Sparkles, StepForward, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ProductionGraphEdge, ProductionGraphNode } from '@/lib/production-graph/contracts';
import { graphStateClass, graphStateLabel } from '@/lib/production-graph/contracts';
import { cn } from '@/lib/utils';
import { NodeInspector } from './node-inspector';

type CanvasColumn = {
  key: string;
  label: string;
  description: string;
};

const columns: CanvasColumn[] = [
  { key: 'direction', label: 'Direction', description: 'What the video is trying to say' },
  { key: 'story', label: 'Story', description: 'The ordered parts of the plan' },
  { key: 'visuals', label: 'Visuals', description: 'Images and video takes' },
  { key: 'sound', label: 'Sound', description: 'Voice, audio, and captions' },
  { key: 'finish', label: 'Finish', description: 'Edit, review, and download' },
];

const columnByKind: Record<string, string> = {
  production: 'direction',
  plan: 'direction',
  productionVersion: 'direction',
  sequence: 'story',
  scene: 'story',
  shot: 'story',
  image: 'visuals',
  imageEdit: 'visuals',
  videoTake: 'visuals',
  voice: 'sound',
  audio: 'sound',
  transcript: 'sound',
  captions: 'sound',
  timeline: 'finish',
  review: 'finish',
  export: 'finish',
};

const kindIcons: Record<string, LucideIcon> = {
  production: Film,
  plan: Sparkles,
  productionVersion: LayoutTemplate,
  sequence: StepForward,
  scene: ScanLine,
  shot: PlaySquare,
  videoTake: PlaySquare,
  image: Image,
  imageEdit: Settings2,
  voice: Mic2,
  audio: Volume2,
  transcript: Eye,
  captions: Eye,
  timeline: Grid2X2,
  review: Eye,
  export: ChevronRight,
};

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
  if (state === 'working') return <Clock3 className="size-3.5" aria-hidden="true" />;
  if (state === 'failed' || state === 'blocked') return <CircleAlert className="size-3.5" aria-hidden="true" />;
  return <span className="size-2 rounded-full bg-current" aria-hidden="true" />;
}

export type DesktopCanvasProps = {
  nodes: ProductionGraphNode[];
  edges: ProductionGraphEdge[];
  onSelect?: (node: ProductionGraphNode) => void;
};

type PositionedNode = ProductionGraphNode & { column: CanvasColumn; row: number };

export function DesktopCanvas({ nodes, edges, onSelect }: DesktopCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [localSelectedNodeId, setLocalSelectedNodeId] = useState<string>();
  const [scale, setScale] = useState(0.86);
  const activeNodeId = localSelectedNodeId;

  const nodeLayout = useMemo<PositionedNode[]>(() => {
    const rowsByColumn = new Map<string, number>();
    return nodes.map((node) => {
      const columnKey = columnByKind[node.kind] ?? 'story';
      const column = columns.find((item) => item.key === columnKey) ?? columns[1];
      const row = rowsByColumn.get(column.key) ?? 0;
      rowsByColumn.set(column.key, row + 1);
      return { ...node, column, row };
    });
  }, [nodes]);

  const nodesByColumn = useMemo(() => columns.map((column) => ({
    column,
    nodes: nodeLayout.filter((node) => node.column.key === column.key),
  })), [nodeLayout]);

  const incomingCount = useMemo(() => {
    const counts = new Map<string, number>();
    edges.forEach((edge) => counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1));
    return counts;
  }, [edges]);

  const outgoingCount = useMemo(() => {
    const counts = new Map<string, number>();
    edges.forEach((edge) => counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1));
    return counts;
  }, [edges]);

  function selectNode(node: ProductionGraphNode) {
    setLocalSelectedNodeId(node.id);
    onSelect?.(node);
  }

  function fitView() {
    setScale(0.78);
    viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  }

  function resetView() {
    setScale(0.86);
    setLocalSelectedNodeId(undefined);
    viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  }

  return (
    <section className="ff-card overflow-hidden" aria-labelledby="desktop-canvas-heading">
      <div className="flex flex-col gap-5 border-b border-border/70 p-5 sm:p-7 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-[#f6dfb1] text-foreground">
              <Crosshair className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="ff-eyebrow">Production Canvas</p>
              <h2 id="desktop-canvas-heading" className="ff-display mt-1 text-2xl font-semibold">See every part of the video in context.</h2>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">The map is generated from your production plan. Select a step to inspect where it sits and what state it is in.</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Canvas view controls">
          <button type="button" onClick={fitView} className="ff-button-quiet min-h-10 px-3 text-xs" title="Fit the production map in view">
            <Maximize2 className="size-4" aria-hidden="true" /> Fit map
          </button>
          <button type="button" onClick={resetView} className="ff-button-quiet min-h-10 px-3 text-xs" title="Reset map position and selection">
            <RotateCcw className="size-4" aria-hidden="true" /> Reset
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div ref={viewportRef} className="ff-grid-paper min-h-[40rem] overflow-auto bg-background/40 p-5 sm:p-7" tabIndex={0} aria-label="Production Canvas map. Use Tab to move through production steps.">
          {nodes.length === 0 ? (
            <div className="flex min-h-[34rem] items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center">
              <div className="max-w-sm">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground"><Sparkles className="size-5" aria-hidden="true" /></div>
                <h3 className="ff-display mt-5 text-2xl font-semibold">Your production map will appear here.</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Create a plan first, then use the Canvas to follow its connected parts.</p>
              </div>
            </div>
          ) : (
            <div className="origin-top-left transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `scale(${scale})`, width: `${100 / scale}%` }}>
              <div className="grid min-w-[1000px] grid-cols-5 gap-5">
                {nodesByColumn.map(({ column, nodes: columnNodes }, columnIndex) => (
                  <div key={column.key} className="relative min-h-[32rem]">
                    <div className="mb-4 border-b border-border/70 pb-3">
                      <p className="text-sm font-semibold">{column.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{column.description}</p>
                    </div>
                    <div className="space-y-3">
                      {columnNodes.length === 0 ? <div className="rounded-2xl border border-dashed border-border/70 p-4 text-xs leading-5 text-muted-foreground">No connected steps yet.</div> : null}
                      {columnNodes.map((node) => {
                        const Icon = kindIcons[node.kind] ?? ScanLine;
                        const isSelected = activeNodeId === node.id;
                        const incoming = incomingCount.get(node.id) ?? 0;
                        const outgoing = outgoingCount.get(node.id) ?? 0;
                        return (
                          <button key={node.id} type="button" onClick={() => selectNode(node)} aria-pressed={isSelected} className={cn('group relative block w-full rounded-2xl border bg-card p-4 text-left shadow-[0_16px_34px_-26px_hsl(24_30%_22%_/_0.6)] transition duration-200 hover:-translate-y-0.5 hover:border-primary/60 focus-visible:-translate-y-0.5', isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border/70')}>
                            {columnIndex < columns.length - 1 ? <span className="pointer-events-none absolute -right-5 top-1/2 hidden h-px w-5 bg-border lg:block" aria-hidden="true" /> : null}
                            <span className="flex items-start justify-between gap-3">
                              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-foreground"><Icon className="size-4" aria-hidden="true" /></span>
                              <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold leading-none', graphStateClass(node.state))}><StateIcon state={node.state} />{graphStateLabel(node.state)}</span>
                            </span>
                            <span className="mt-4 block text-sm font-semibold leading-5">{node.label}</span>
                            <span className="mt-1 block text-xs font-medium text-muted-foreground">{kindLabels[node.kind] ?? 'Production step'}</span>
                            {node.detail ? <span className="mt-3 block line-clamp-2 text-xs leading-5 text-muted-foreground">{node.detail}</span> : null}
                            {(incoming > 0 || outgoing > 0) ? <span className="mt-4 flex items-center gap-2 border-t border-border/70 pt-3 text-[11px] font-semibold text-muted-foreground"><span>{incoming} in</span><span className="text-border">·</span><span>{outgoing} out</span></span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <NodeInspector node={nodeLayout.find((node) => node.id === activeNodeId)} onClose={() => setLocalSelectedNodeId(undefined)} onInspect={onSelect} />
      </div>
    </section>
  );
}
