import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Check, Film, Sparkles } from 'lucide-react';
import { api } from '../../../../../../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { GraphMap } from '@/components/production-workspace/graph-map';
import { CanvasSurface } from '@/components/production-workspace/canvas-surface';
import { EditSurface } from '@/components/editor/production-edit/edit-surface';
import { ReleaseSurface } from '@/components/production-release/release-surface';
import { WORKSPACE_SECTIONS, type WorkspaceSection } from '@/lib/production-graph/contracts';
import { requireOnboardingComplete } from '@/lib/guards';

const steps = [
  { label: 'Idea', description: 'Start with what you want to make.' },
  { label: 'Plan', description: 'Shape the story before generation.' },
  { label: 'Make', description: 'Create and compare individual takes.' },
  { label: 'Review', description: 'Request changes or approve the result.' },
  { label: 'Download', description: 'Export the finished video.' },
];

export default async function WorkspaceSectionPage({ params }: { params: Promise<{ id: string; section: string }> }) {
  await requireOnboardingComplete();
  const { id, section } = await params;
  if (!WORKSPACE_SECTIONS.some((item) => item.slug === section)) notFound();
  const active = section as WorkspaceSection;
  const convex = await getAuthenticatedConvexClient();
  const graph = await convex.query(api.productionGraph.getByProject, { projectExternalId: id });
  if (!graph) return <EmptyProject projectId={id} />;

  const currentStep = graph.summary.hasExport ? 'Download' : graph.summary.hasTimeline ? 'Review' : graph.summary.hasVersion ? 'Make' : graph.summary.hasPlan ? 'Plan' : 'Idea';
  return <div className="space-y-8">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="ff-eyebrow">Video project workspace</p><h1 className="ff-display mt-2 text-4xl font-semibold capitalize sm:text-5xl">{graph.production.workflow.replaceAll('_', ' ').toLowerCase()}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Your production stays connected from the plan to the final download.</p></div><div className="rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm"><span className="text-muted-foreground">Current step</span><span className="ml-2 font-semibold">{currentStep}</span></div></header>
    <section className="ff-card overflow-hidden p-5 sm:p-7" aria-label="Video production progress"><div className="grid gap-4 sm:grid-cols-5">{steps.map((step, index) => { const complete = index === 0 || (index === 1 && graph.summary.hasPlan) || (index === 2 && graph.summary.hasVersion) || (index === 3 && graph.summary.hasReview) || (index === 4 && graph.summary.hasExport); return <div key={step.label} className="relative"><div className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-full ${complete ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'}`}>{complete ? <Check className="size-4" /> : index + 1}</span><span className="font-semibold">{step.label}</span></div><p className="mt-2 pl-12 text-xs leading-5 text-muted-foreground">{step.description}</p>{index < steps.length - 1 ? <span className="absolute left-9 top-4 hidden h-px w-[calc(100%-1.5rem)] bg-border sm:block" aria-hidden="true" /> : null}</div>; })}</div></section>
    {active === 'overview' ? <GraphMap projectId={id} nodes={graph.nodes} edges={graph.edges} /> : active === 'canvas' ? <CanvasSurface nodes={graph.nodes} edges={graph.edges} /> : active === 'edit' ? <EditSurface productionId={String(graph.production._id)} nodes={graph.nodes} /> : active === 'review' || active === 'export' ? <ReleaseSurface productionId={String(graph.production._id)} /> : <SectionView projectId={id} section={active} hasPlan={graph.summary.hasPlan} hasVersion={graph.summary.hasVersion} />}
  </div>;
}

function SectionView({ projectId, section, hasPlan, hasVersion }: { projectId: string; section: WorkspaceSection; hasPlan: boolean; hasVersion: boolean }) {
  const copy: Record<WorkspaceSection, { eyebrow: string; title: string; description: string; action?: string; href?: string }> = {
    overview: { eyebrow: 'Workspace overview', title: 'Everything for this video, in one place.', description: 'The project overview shows progress, decisions, media, and the next recommended action.' },
    plan: { eyebrow: 'Your plan', title: hasPlan ? 'Review the creative direction.' : 'Your plan will appear here.', description: hasPlan ? 'Open the plan to review the story structure and approve the direction before making takes.' : 'Start with an idea or script and FinalFrame will turn it into an understandable plan.', action: hasPlan ? 'Open the plan' : 'Start a video', href: hasPlan ? `/dashboard/projects/${projectId}/blueprint` : '/dashboard/create' },
    storyboard: { eyebrow: 'Storyboard', title: hasVersion ? 'Your video, part by part.' : 'Your storyboard will appear after approval.', description: 'Each part of the video will have its own purpose, media, and takes so changes stay easy to understand.' },
    canvas: { eyebrow: 'Production Canvas', title: 'Your production map.', description: 'The Canvas is the control room for the plan, references, parts, takes, media, edit, review, and download.' },
    media: { eyebrow: 'Media', title: 'Everything your video uses.', description: 'Bring in images, footage, voice, products, characters, locations, and references. Media roles and ownership stay visible.' },
    takes: { eyebrow: 'Takes', title: 'Make and compare individual takes.', description: 'Generation will run in the background. You will be able to review, replace, or regenerate one take without losing earlier versions.' },
    edit: { eyebrow: 'Edit', title: 'Shape the finished video.', description: 'Practical editing will include trim, split, reorder, captions, audio levels, transitions, and prompt-based changes.' },
    review: { eyebrow: 'Review', title: 'Ask for a change or approve the video.', description: 'Comments, versions, approvals, and revision requests stay attached to the exact part they refer to.' },
    export: { eyebrow: 'Download', title: 'Export when the video is ready.', description: 'Exports will be built from a locked timeline and verified before a download becomes available.' },
  };
  const item = copy[section];
  return <section className="ff-card p-7 sm:p-10"><div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="ff-eyebrow">{item.eyebrow}</p><h2 className="ff-display mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">{item.title}</h2><p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{item.description}</p>{item.href && item.action ? <Link href={item.href} className="ff-button-primary mt-7">{item.action}<ArrowRight className="size-4" /></Link> : null}</div><div className="grid size-24 place-items-center rounded-[1.75rem] bg-secondary text-foreground"><Sparkles className="size-8" /></div></div></section>;
}

function EmptyProject({ projectId }: { projectId: string }) {
  return <section className="ff-card mx-auto max-w-2xl p-8 text-center"><Film className="mx-auto size-10 text-muted-foreground" /><h1 className="ff-display mt-5 text-3xl font-semibold">This video project is not ready yet.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Start with an idea, script, voice recording, or your own media to create the first production plan.</p><Link href={`/dashboard/create?project=${encodeURIComponent(projectId)}`} className="ff-button-primary mt-7">Start the plan</Link></section>;
}
