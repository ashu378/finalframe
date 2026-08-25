'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { ArrowLeft, GitBranch, LayoutDashboard } from 'lucide-react';
import { WORKSPACE_SECTIONS, type WorkspaceSection } from '@/lib/production-graph/contracts';

export function WorkspaceNav() {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  return <div className="space-y-4">
    <Link href={`/dashboard/projects/${projectId}`} className="ff-link inline-flex items-center gap-2 text-sm"><ArrowLeft className="size-4" /> Back to video project</Link>
    <nav aria-label="Video project workspace" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {WORKSPACE_SECTIONS.map((section) => { const active = pathname?.endsWith(`/workspace/${section.slug}`) || (section.slug === 'overview' && pathname?.endsWith('/workspace')); return <Link key={section.slug} href={`/dashboard/projects/${projectId}/workspace/${section.slug}`} aria-current={active ? 'page' : undefined} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition ${active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
        {section.slug === 'canvas' ? <GitBranch className="mr-2 inline size-4" aria-hidden="true" /> : section.slug === 'overview' ? <LayoutDashboard className="mr-2 inline size-4" aria-hidden="true" /> : null}{section.label}
      </Link>; })}
    </nav>
  </div>;
}
