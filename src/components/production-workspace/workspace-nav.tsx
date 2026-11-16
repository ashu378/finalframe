'use client';

import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, GitBranch, LayoutDashboard } from 'lucide-react';
import { WORKSPACE_SECTIONS, type WorkspaceSection } from '@/lib/production-graph/contracts';

export function WorkspaceNav() {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const selection = useSearchParams();
  const productionId = selection.get('production');
  const timelineId = selection.get('timeline');
  const query = new URLSearchParams();
  if (productionId) query.set('production', productionId);
  if (productionId && timelineId) query.set('timeline', timelineId);
  const planStage=selection.get('stage');
  const selectedPlanStage=['brief','script','guide'].includes(planStage??'')?planStage:null;
  const suffix = query.size ? `?${query}` : '';
  return <div className="flex flex-wrap items-start justify-between gap-3">
    <Link href={`/dashboard/projects/${projectId}`} className="ff-link inline-flex min-h-11 items-center gap-2 text-sm"><ArrowLeft className="size-4" /> Project overview</Link>
    <details className="group w-full rounded-xl border border-border bg-card p-3 sm:w-auto"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-sm font-semibold">All project tools<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><nav aria-label="Video project workspace" className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:max-w-2xl sm:flex-wrap">
      {WORKSPACE_SECTIONS.map((section) => { const active = pathname?.endsWith(`/workspace/${section.slug}`) || (section.slug === 'overview' && pathname?.endsWith('/workspace')); return <Link key={section.slug} href={`/dashboard/projects/${projectId}/workspace/${section.slug}${section.slug==='plan'&&selectedPlanStage?`${suffix}${suffix?'&':'?'}stage=${selectedPlanStage}`:suffix}`} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-11 min-w-0 items-center rounded-lg px-3 text-sm font-semibold transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
        {section.slug === 'canvas' ? <GitBranch className="mr-2 inline size-4" aria-hidden="true" /> : section.slug === 'overview' ? <LayoutDashboard className="mr-2 inline size-4" aria-hidden="true" /> : null}{{ overview: 'Overview', plan: 'Script & plan', storyboard: 'Scene images', canvas: 'Connections', media: 'Media library', takes: 'Video clips', edit: 'Edit & sound', review: 'Review', export: 'Download' }[section.slug]}
      </Link>; })}
      <Link href={`/dashboard/projects/${projectId}/movies`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">Combine episodes</Link>
    </nav></details>
  </div>;
}
