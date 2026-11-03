import Link from 'next/link';
import { ArrowLeft, ArrowRight, Film, Plus } from 'lucide-react';
import { requireAuth } from '@/lib/guards';
import { getProjectLibraryPage } from '@/lib/project/library-actions';
import { parseProjectLibraryMode, type ProjectLibraryMode } from '@/lib/project/library';
import { ProjectLibraryControls } from '@/components/project/project-library-controls';
import { countProjectLifecycles, projectLifecyclePresentation } from '@/lib/project/lifecycle-presentation';

export const metadata = { title: 'Project library | FinalFrame', description: 'Find, organize, archive, and restore your video projects.' };

function libraryHref(mode: ProjectLibraryMode, search: string, cursor?: string | null) {
  const query = new URLSearchParams({ mode });
  if (search) query.set('q', search);
  if (cursor) query.set('cursor', cursor);
  return `/dashboard/projects?${query}`;
}

export default async function ProjectLibraryPage({ searchParams }: { searchParams: Promise<{ mode?: string; q?: string; cursor?: string }> }) {
  await requireAuth();
  const query = await searchParams;
  const mode = parseProjectLibraryMode(query.mode);
  const search = typeof query.q === 'string' ? query.q.trim() : '';
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined;
  let result;
  try { result = await getProjectLibraryPage({ mode, search, cursor }); }
  catch { return <div className="ff-card mx-auto max-w-3xl space-y-4 p-8"><h1 className="text-2xl font-semibold">The project library could not load.</h1><p role="alert" className="text-sm leading-6 text-muted-foreground">Check your connection and access. Searches must be 100 characters or fewer; start again if your search or page changed.</p><Link href="/dashboard/projects" className="ff-button-primary">Open the first page</Link></div>; }
  const projectCounts = countProjectLifecycles(result.page);
  return <div className="mx-auto max-w-6xl space-y-8 py-5 sm:py-8">
    <div className="flex flex-wrap items-end justify-between gap-5"><div><Link href="/dashboard" className="ff-link inline-flex items-center gap-2 text-sm"><ArrowLeft className="size-4" />Dashboard</Link><p className="ff-eyebrow mt-8">Your video projects</p><h1 className="ff-display mt-3 text-4xl font-semibold">Project library</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Find your projects, put completed work aside, or bring a project back. Archived and deleted projects keep their media, versions, and history.</p></div><Link href="/dashboard/create" className="ff-button-primary"><Plus className="size-4" />Create a video</Link></div>
    <form action="/dashboard/projects" method="get" className="ff-card flex flex-col gap-4 p-5 sm:flex-row sm:items-end"><input type="hidden" name="mode" value={mode} /><label className="flex-1 text-sm font-semibold">Search names and descriptions<input name="q" type="search" maxLength={100} defaultValue={search} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-4 font-normal" placeholder="Find a video project" /></label><button type="submit" className="ff-button-primary min-h-11">Search projects</button>{search ? <Link href={libraryHref(mode, '')} className="ff-button-quiet min-h-11">Clear search</Link> : null}</form>
    <nav aria-label="Project lifecycle" className="flex flex-wrap gap-3">{(['active', 'archived', 'deleted'] as const).map((item) => <Link key={item} aria-current={mode === item ? 'page' : undefined} href={libraryHref(item, search)} className={`min-h-11 rounded-full border px-5 py-3 text-sm font-semibold capitalize ${mode === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'}`}>{item}</Link>)}</nav>
    {result.page.length ? <div className="space-y-4">{result.page.map((project) => <article key={project.id} className="ff-card p-5 sm:p-6"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary"><Film className="size-5 text-primary" /></span><div className="min-w-0 flex-1"><h2 className="break-words text-xl font-semibold">{project.name}</h2>{project.description ? <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-muted-foreground">{project.description}</p> : null}<p className="mt-3 text-xs text-muted-foreground">{project.role.toLowerCase()} · {projectLifecyclePresentation(project).label} · Updated {new Date(project.updatedAt).toLocaleDateString('en-GB')}</p>{project.moderationStatus === 'RESTRICTED' ? <p role="status" className="mt-3 text-sm text-destructive">Restricted for content review. Production and media access are blocked.</p> : null}{mode !== 'deleted' && project.moderationStatus !== 'RESTRICTED' ? <Link href={`/dashboard/projects/${encodeURIComponent(project.externalId)}`} className="ff-link mt-4 inline-flex min-h-11 items-center gap-2 text-sm">{mode === 'active' ? 'Open project' : 'View project'}<ArrowRight className="size-4" /></Link> : null}{mode !== 'deleted' ? <Link href={`/dashboard/projects/${encodeURIComponent(project.externalId)}/report`} className="ff-link mt-3 inline-flex min-h-11 items-center text-sm">{project.moderationStatus === 'RESTRICTED' ? 'View restriction status or report' : 'Report concern'}</Link> : null}</div></div><ProjectLibraryControls project={project} mode={mode} /></article>)}</div> : <div className="ff-card p-8 text-center"><h2 className="text-xl font-semibold">{result.isDone ? `No ${mode} projects${search ? ' match this search' : ''}.` : 'No matches on this page.'}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{result.isDone ? 'Try another search or project category.' : 'More projects remain to search. Continue below to check the next page.'}</p></div>}
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6"><p aria-live="polite" className="text-sm text-muted-foreground">{projectCounts.total} matching project{projectCounts.total === 1 ? '' : 's'} on this page.{!result.isDone ? ' More projects remain.' : ' You reached the end.'}</p><div className="flex flex-wrap gap-3">{cursor ? <Link href={libraryHref(mode, search)} className="ff-button-quiet min-h-11">First page</Link> : null}{result.continueCursor ? <Link href={libraryHref(mode, search, result.continueCursor)} className="ff-button-primary min-h-11">{search ? 'Continue search' : 'More projects'}<ArrowRight className="size-4" /></Link> : null}</div></div>
  </div>;
}
