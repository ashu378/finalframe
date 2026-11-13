import { ProductionJourney } from '@/components/production-workspace/production-journey';
import { PlanStagePanel } from '@/components/production-workspace/plan-stage-panel';
import { VisualStoryboard } from '@/components/production-workspace/visual-storyboard';
import { parseCreatorIntent } from '@/lib/production/creator-intent';
import type { CreatorStage } from '@/lib/production/creator-journey';
import { decodeProjectRouteId } from '@/lib/project/route-id';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRight, Film, Sparkles } from 'lucide-react';
import { api } from '../../../../../../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { GraphMap } from '@/components/production-workspace/graph-map';
import { CanvasSurface } from '@/components/production-workspace/canvas-surface';
import { EditSurface } from '@/components/editor/production-edit/edit-surface';
import { ReleaseSurface } from '@/components/production-release/release-surface';
import { WORKSPACE_SECTIONS, type WorkspaceSection } from '@/lib/production-graph/contracts';
import { requireOnboardingComplete } from '@/lib/guards';
import { getEpisodeNavigation } from '@/lib/production/episode-actions';
import { EpisodePicker } from '@/components/production-workspace/episode-picker';
import { loadWorkspaceControls } from '@/lib/production/workspace-actions';
import { ContinuityStudio, StoryAcceptance } from '@/components/production-workspace/continuity-studio';
import { TimelineComposer } from '@/components/production-workspace/timeline-composer';
import { RecipePanel } from '@/components/production-workspace/recipe-panel';
import { ShotWorkspace } from '@/components/production-workspace/shot-workspace';
import type { Id } from '../../../../../../../../convex/_generated/dataModel';

export default async function WorkspaceSectionPage({ params, searchParams }: { params: Promise<{ id: string; section: string }>; searchParams: Promise<{ production?: string; timeline?: string | string[]; stage?: string | string[] }> }) {
  await requireOnboardingComplete();
  const { id: routeId, section } = await params;
  const id = decodeProjectRouteId(routeId);
  if (!WORKSPACE_SECTIONS.some((item) => item.slug === section)) notFound();
  const active = section as WorkspaceSection;
  const query = await searchParams;
  const navigation = await getEpisodeNavigation(id);
  if (!navigation) notFound();
  const selectedProductionId = query.production || (navigation.options.length === 1 ? navigation.options[0].productionId : undefined);
  if (selectedProductionId && !navigation.options.some((option) => option.productionId === selectedProductionId)) notFound();
  const picker = <EpisodePicker projectExternalId={id} options={navigation.options} selectedProductionId={selectedProductionId} nextEpisodeNumber={navigation.nextEpisodeNumber} />;
  if (!selectedProductionId && navigation.options.length > 1) return <div className="space-y-6">{picker}<p className="text-sm text-muted-foreground">Select an episode to open its production workspace.</p></div>;
  const convex = await getAuthenticatedConvexClient();
  const authoring = ['overview','plan','storyboard','canvas','media','takes'].includes(active);
  const graph = await convex.query(api.productionGraph.getByProject, { projectExternalId: id, productionId: selectedProductionId as Id<'productions'> | undefined, ...(authoring?{preferDraft:true}:{}), ...(!authoring&&typeof query.timeline==='string'?{timelineId:query.timeline as Id<'timelines'>}:{}) });
  if (!graph) return <div className="space-y-6">{picker}<EmptyProject projectId={id} /></div>;
  let selectedTimelineId: string | undefined;
  if (active === 'edit' && query.timeline !== undefined) {
    try {
      if (typeof query.timeline !== 'string' || !query.timeline.trim()) throw new Error('Invalid edit selection');
      const selected = await convex.query(api.timelineEditor.getDraft, { productionId: graph.production._id, timelineId: query.timeline as Id<'timelines'> });
      if (!selected?.timeline || selected.timeline._id !== query.timeline || selected.timeline.productionId !== graph.production._id || selected.timeline.projectId && selected.timeline.projectId !== graph.production.projectId) throw new Error('Unavailable edit selection');
      selectedTimelineId = String(selected.timeline._id);
    } catch {
      return <div className="space-y-6">{picker}<section role="alert" className="ff-card space-y-3 p-6"><h1 className="text-xl font-semibold">Selected edit unavailable</h1><p className="text-sm text-muted-foreground">This edit could not be opened for the selected project and episode. Check the link or deliberately open the latest available edit.</p><Link className="ff-link inline-flex min-h-11 items-center" href={`/dashboard/projects/${encodeURIComponent(id)}/workspace/edit?production=${encodeURIComponent(String(graph.production._id))}`}>Open latest available edit</Link></section></div>;
    }
  }
  // A legacy link may omit production when this project has just one. Make
  // the authorized association explicit before same-production navigation.
  if (selectedTimelineId && !query.production) redirect(`/dashboard/projects/${encodeURIComponent(id)}/workspace/edit?${new URLSearchParams({ production: String(graph.production._id), timeline: selectedTimelineId })}`);

  const controls = await loadWorkspaceControls(id,String(graph.production._id));
  const canonical = await convex.query(api.productions.getWorkspace,{productionId:graph.production._id});
  const savedInput=canonical?.plan?.input;
  let creatorIntent;try{creatorIntent=parseCreatorIntent(savedInput?.creatorIntent);}catch{creatorIntent=undefined;}
  const planStage = typeof query.stage==='string'&&['brief','script','guide'].includes(query.stage)?query.stage as 'brief'|'script'|'guide':'script';
  const journeyStage:CreatorStage=active==='plan'?planStage:active==='media'?'guide':active==='canvas'?'storyboard':active==='overview'?'brief':active as CreatorStage;
  const isDraftContext=graph.summary.viewContext==='DRAFT';
  const finishingUncertain=!isDraftContext&&graph.summary.finishingHistoryLimited&&!graph.summary.hasExport;
  const currentStep = isDraftContext ? 'Plan' : finishingUncertain ? 'Check finishing history' : graph.summary.hasExport ? 'Download' : graph.summary.hasTimeline ? 'Review' : graph.summary.hasVersion ? 'Make' : graph.summary.hasPlan ? 'Plan' : 'Idea';
  return <div className="space-y-8">
    {picker}
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="ff-eyebrow">Video project workspace</p><h1 className="ff-display mt-2 text-4xl font-semibold capitalize sm:text-5xl">{graph.production.workflow.replaceAll('_', ' ').toLowerCase()}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Your production stays connected from the plan to the final download.</p><p className="mt-2 text-sm text-muted-foreground">{isDraftContext?`Editing draft${graph.summary.selectedVersionNumber?' v'+graph.summary.selectedVersionNumber:''}. Earlier approved takes, edits and downloads belong to their retained version; they do not complete this draft.`:graph.summary.viewContext==='APPROVED'?`Approved production${graph.summary.selectedVersionNumber?' v'+graph.summary.selectedVersionNumber:''}. Finishing progress below belongs to this approved version.`:graph.summary.viewContext==='RETAINED'?'Retained production version. Review its exact resources before continuing.':'Start a plan for this production.'}</p></div><div className="rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm"><span className="text-muted-foreground">Current step</span><span className="ml-2 font-semibold">{currentStep}</span></div></header>
    <ProductionJourney projectId={id} projectRecordId={graph.production.projectId?String(graph.production.projectId):undefined} productionId={String(graph.production._id)} activeStage={journeyStage} timelineId={!authoring&&typeof query.timeline==='string'?query.timeline:undefined} creatorIntent={creatorIntent} canEdit={controls?.canEdit??false} />
    {graph.summary.sourceHistoryLimited?<p role="status" className="text-sm text-muted-foreground">This production map shows a bounded selection of source history. Use the visual storyboard and saved take lists to inspect retained alternatives.</p>:null}
    {!isDraftContext&&graph.summary.finishingHistoryLimited ? <section role="status" className="ff-card space-y-2 p-5 text-sm text-muted-foreground"><p>{finishingUncertain?'Only recent finishing history was checked. Current finishing progress is not confirmed.':'This map includes only recent finishing history; earlier records are not shown.'}</p><Link className="inline-flex min-h-11 items-center text-primary underline underline-offset-4" href={`/dashboard/projects/${encodeURIComponent(id)}/workspace/review?production=${encodeURIComponent(String(graph.production._id))}`}>Inspect saved assembly versions</Link></section> : null}
    {/* Convex owns recipe rollout. RecipePanel reads the authorized project's
        enabled state; a second frontend flag hid enabled execution controls. */}
    {['storyboard','takes'].includes(active) ? <RecipePanel productionId={String(graph.production._id)} creatorIntent={creatorIntent} /> : null}
    {active === 'media' && controls ? <ContinuityStudio key={`${controls.productionId}:${controls.versionId ?? 'unplanned'}`} data={controls} /> : active === 'storyboard' && controls ? <VisualStoryboard data={controls} /> : active === 'takes' && controls ? <ShotWorkspace data={controls} /> : active === 'plan' ? <PlanStagePanel projectId={id} productionId={String(graph.production._id)} stage={planStage} planId={canonical?.plan?._id} versionId={canonical?.version?._id} status={canonical?.version?.status} input={savedInput} plan={canonical?.version?.snapshot??canonical?.plan?.plan} canEdit={controls?.canEdit??false} creatorIntent={creatorIntent} /> : active === 'overview' ? <GraphMap projectId={id} productionId={String(graph.production._id)} nodes={graph.nodes} edges={graph.edges} /> : active === 'canvas' ? <CanvasSurface nodes={graph.nodes} edges={graph.edges} /> : active === 'edit' ? <><TimelineComposer data={controls!} /><EditSurface key={`${graph.production._id}:${selectedTimelineId ?? 'latest'}`} productionId={String(graph.production._id)} initialTimelineId={selectedTimelineId} nodes={graph.nodes} /></> : active === 'review' || active === 'export' ? <ReleaseSurface productionId={String(graph.production._id)} /> : <SectionView projectId={id} productionId={String(graph.production._id)} section={active} hasPlan={graph.summary.hasPlan} hasVersion={graph.summary.hasVersion} />}
    {active === 'review' && controls ? <StoryAcceptance data={controls} /> : null}
  </div>;
}

function SectionView({ projectId, productionId, section, hasPlan, hasVersion }: { projectId: string; productionId: string; section: WorkspaceSection; hasPlan: boolean; hasVersion: boolean }) {
  const copy: Record<WorkspaceSection, { eyebrow: string; title: string; description: string; action?: string; href?: string }> = {
    overview: { eyebrow: 'Workspace overview', title: 'Everything for this video, in one place.', description: 'The project overview shows progress, decisions, media, and the next recommended action.' },
    plan: { eyebrow: 'Your plan', title: hasPlan ? 'Review the creative direction.' : 'Your plan will appear here.', description: hasPlan ? 'Open the plan to review the story structure and approve the direction before making takes.' : 'Start with an idea or script and FinalFrame will turn it into an understandable plan.', action: hasPlan ? 'Open the plan' : 'Start a video', href: hasPlan ? `/dashboard/projects/${projectId}/blueprint?production=${encodeURIComponent(productionId)}` : `/dashboard/create?project=${encodeURIComponent(projectId)}&production=${encodeURIComponent(productionId)}` },
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
