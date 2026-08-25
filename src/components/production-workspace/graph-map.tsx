import Link from 'next/link';
import { ArrowRight, CircleAlert, GitBranch, LoaderCircle, LockKeyhole } from 'lucide-react';
import type { ProductionGraphNode, ProductionGraphEdge } from '@/lib/production-graph/contracts';
import { graphStateClass, graphStateLabel } from '@/lib/production-graph/contracts';

const kindLabels: Record<string, string> = { production: 'Project', plan: 'Plan', productionVersion: 'Version', sequence: 'Chapter', scene: 'Part', shot: 'Take brief', videoTake: 'Video take', image: 'Media', timeline: 'Edit', review: 'Review', export: 'Download' };

function StateIcon({ state }: { state: ProductionGraphNode['state'] }) {
  if (state === 'working') return <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />;
  if (state === 'failed' || state === 'blocked') return <CircleAlert className="size-4" aria-hidden="true" />;
  if (state === 'locked') return <LockKeyhole className="size-4" aria-hidden="true" />;
  return <span className="size-2 rounded-full bg-current" aria-hidden="true" />;
}

export function GraphMap({ projectId, nodes, edges }: { projectId: string; nodes: ProductionGraphNode[]; edges: ProductionGraphEdge[] }) {
  const visibleNodes = nodes.slice(0, 18);
  const connections = new Map(edges.map((item) => [item.target, item.source]));
  return <section className="ff-card overflow-hidden" aria-labelledby="production-map-heading">
    <div className="flex flex-col gap-4 border-b border-border/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7"><div><p className="ff-eyebrow">Production map</p><h2 id="production-map-heading" className="ff-display mt-2 text-2xl font-semibold">See how the video is coming together.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">FinalFrame keeps the plan, parts, takes, media, edit, review, and download connected in one place.</p></div><Link href={`/dashboard/projects/${projectId}/workspace/canvas`} className="ff-button-secondary shrink-0"><GitBranch className="size-4" /> Open Canvas</Link></div>
    {nodes.length === 0 ? <div className="p-7 text-sm text-muted-foreground">Your production map will appear after a plan is created.</div> : <ol className="grid gap-3 p-5 sm:grid-cols-2 sm:p-7 lg:grid-cols-3">{visibleNodes.map((item, index) => <li key={item.id} className="relative"><div className="rounded-2xl border border-border/70 bg-background/65 p-4"><div className="flex items-start justify-between gap-3"><span className="text-xs font-semibold text-muted-foreground">{kindLabels[item.kind] || 'Production step'}</span><span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${graphStateClass(item.state)}`}><StateIcon state={item.state} />{graphStateLabel(item.state)}</span></div><h3 className="mt-4 font-semibold">{item.label}</h3>{item.detail ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{item.detail}</p> : null}{connections.has(item.id) ? <p className="mt-3 text-xs text-muted-foreground">Connected to an earlier production step</p> : null}</div>{index < visibleNodes.length - 1 ? <ArrowRight className="absolute -bottom-3 left-1/2 z-10 hidden size-4 -translate-x-1/2 rotate-90 text-border sm:block lg:hidden" aria-hidden="true" /> : null}</li>)}</ol>}
    {nodes.length > visibleNodes.length ? <p className="border-t border-border/70 px-5 py-4 text-sm text-muted-foreground sm:px-7">Showing the first {visibleNodes.length} steps. Open Canvas to inspect the complete production.</p> : null}
  </section>;
}
