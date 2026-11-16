import { decodeProjectRouteId } from '@/lib/project/route-id';
/**
 * FinalFrame — Project Detail Page
 * Reference: MASTER_PRD.md § 5.II — Creative Studio
 * Reference: BUILD_PHASES.md — Phase 2 Project Creation
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAuth } from '@/lib/guards';
import { getProjectById } from '@/lib/project/actions';
import { getProductionWorkspace } from '@/lib/production/actions';
import { getEpisodeNavigation } from '@/lib/production/episode-actions';
import { getScenesForProject } from '@/lib/scene/actions';
import { getRenderJobs } from '@/lib/render/actions';
import { ReviewPlayer } from '@/components/review/review-player';
import { STATE_LABELS, STATE_DESCRIPTIONS, canEdit } from '@/lib/project/state-machine';
import { Button } from '@/components/ui/button';
import { RenderButton } from '@/components/render/render-button';
import { RenderProgress } from '@/components/render/render-progress';
import { EmergencyReset } from '@/components/project/emergency-reset';
import type { ProjectState } from '@/lib/types/database';
import { ArrowLeft, Edit2, Lock, Eye, Film } from 'lucide-react';
import { ShareButton } from '@/components/review/share-button';
import { cn } from '@/lib/utils';

export const metadata = {
    title: 'Project Details',
    description: 'View and manage your project',
};

interface ProjectPageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ production?: string }>;
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
    await requireAuth();
    const { id: routeId } = await params;
    const id = decodeProjectRouteId(routeId);
    const selection = await searchParams;
    const navigation = await getEpisodeNavigation(id);
    if (!navigation) notFound();
    if (selection.production && !navigation.options.some(option => option.productionId === selection.production)) notFound();
    // Canonical productions own their episode selection and finishing history.
    // Choose that route before any legacy loader asks for an ambiguous project.
    if (navigation.options.length) {
        const query = selection.production ? `?${new URLSearchParams({ production: selection.production })}` : '';
        redirect(`/dashboard/projects/${encodeURIComponent(id)}/workspace/overview${query}`);
    }

    const [result, scenesResult, jobsResult, workspace] = await Promise.all([
        getProjectById(id),
        getScenesForProject(id),
        getRenderJobs(id),
        getProductionWorkspace(id),
    ]);

    if (!result.success || !result.project) {
        notFound();
        return null;
    }

    const project = result.project;
    // Production approval and generated takes live in the canonical workspace.
    // Project lifecycle state deliberately does not mirror blueprint approval.
    if (workspace.success && workspace.production) {
        redirect(`/dashboard/projects/${encodeURIComponent(project.id)}/workspace/overview`);
    }
    const sceneCount = scenesResult.success ? (scenesResult.scenes?.length || 0) : 0;
    const completedJob = jobsResult.success ? jobsResult.jobs?.find(j => j.status === 'completed' && j.output_result?.video_url) : null;
    const videoUrl = completedJob?.output_result?.video_url;
    const stateLabel = STATE_LABELS[project.state as ProjectState] || project.state;
    const stateDescription = STATE_DESCRIPTIONS[project.state as ProjectState] || '';
    const isEditable = canEdit(project.state as ProjectState);

    return (
        <div className="project-theme space-y-8 ">
            <div className="flex justify-end">
                <Link href={`/dashboard/projects/${id}/workspace/overview`} className="ff-button-primary min-h-11">Open video workspace</Link>
            </div>
            {/* Header */}
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div>
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 text-metadata text-zinc-500 hover:text-primary transition-all group mb-4"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Back to projects
                    </Link>
                    <div className="flex items-center gap-4 mb-4">
                        <h1 className="ff-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                            {project.name}
                        </h1>
                        <span className={cn(
                            "px-3 py-1.5 rounded-sm text-metadata border",
                            project.state === 'approved' || project.state === 'rendered'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                                : 'bg-primary/10 text-primary border-primary/20 shadow-[0_0_15px_rgba(251,191,36,0.1)]'
                        )}>
                            {stateLabel}
                        </span>
                    </div>
                        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                        {project.project_description || stateDescription}
                    </p>
                </div>

                <div className="flex flex-wrap gap-4 pb-1">
                    <ShareButton projectId={id} />
                    <Link href={`/dashboard/projects/${id}/workspace/plan`}>
                        <Button
                            variant="primary"
                            size="md"
                            className="gap-3 px-8 h-10 rounded-xl font-semibold tracking-normal text-xs"
                        >
                            {isEditable ? <Edit2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            {isEditable ? 'Open plan' : 'View plan'}
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Blueprint Overview */}
                <div className="lg:col-span-2 bg-zinc-900/40 rounded-xl border border-white/5 p-6 sm:p-10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 sm:p-10 opacity-[0.02] group-hover:opacity-10 transition-opacity duration-1000">
                        <Film className="w-40 h-40 text-white" />
                    </div>

                    <div className="relative z-10 space-y-8">
                        <div className="flex items-center justify-between border-b border-white/5 pb-6">
                            <h2 className="text-xs font-semibold tracking-normal text-zinc-400">
                                Video details
                            </h2>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-zinc-400 tracking-normal">Platform</p>
                                <p className="text-[14px] font-semibold text-white tracking-wider">{project.platform?.replace('_', ' ') || 'STANDARD'}</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-zinc-400 tracking-normal">Video shape</p>
                                <p className="text-[14px] font-semibold text-white tracking-wider">{project.aspect_ratio?.replace('_', ' ') || '16:9'}</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-metadata text-zinc-500">Scenes</p>
                                <p className="text-base font-semibold text-zinc-50 tracking-wider">{sceneCount} Scenes</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-metadata text-zinc-500">Visibility</p>
                                <p className="text-base font-semibold text-zinc-50 tracking-wider">{project.is_shared ? 'Public' : 'Private'}</p>
                            </div>
                        </div>

                        <div className="pt-10 mt-10 border-t border-zinc-800">
                            <div className="flex flex-wrap gap-4">
                                <div className="px-5 py-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center gap-3 ">
                                    <span className="text-metadata text-zinc-500 tracking-widest">Project status: <span className="text-zinc-300 font-bold">Ready to work on</span></span>
                                </div>
                            </div>

                            {/* Emergency Recovery */}
                            <EmergencyReset projectId={project.id} />
                        </div>
                    </div>
                </div>

                {/* Inherited DNA */}
                <div className="bg-zinc-900/40 rounded-xl border border-white/5 p-6 sm:p-10 flex flex-col justify-between group">
                    <div>
                        <h2 className="text-xs font-semibold tracking-normal text-zinc-400 mb-8 pb-6 border-b border-white/5">
                            Creative direction
                        </h2>

                        <div className="space-y-6">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-bold text-zinc-400 tracking-widest">People in the video</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-zinc-400 tracking-widest leading-none">
                                        {project.identity_presence?.replace(/_/g, ' ') || 'No People'}
                                    </span>
                                    {project.actor_locked ? (
                                        <Lock className="w-3.5 h-3.5 text-primary" />
                                    ) : (
                                        <Eye className="w-3.5 h-3.5 text-zinc-500" />
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <span className="text-sm text-muted-foreground">Story type</span>
                                <span className="text-sm font-semibold text-zinc-400 tracking-widest leading-none">
                                    {project.context?.replace(/_/g, ' ') || 'Organic Content'}
                                </span>
                            </div>

                            {project.creative_dna_snapshot && (
                                <div className="pt-2">
                                    <span className="text-sm text-muted-foreground block mb-4">Style notes</span>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.values(project.creative_dna_snapshot).filter(v => typeof v === 'string' && v.length > 0).map((val, i) => (
                                            <span key={i} className="px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/20 text-metadata font-semibold text-primary tracking-widest hover:bg-primary/10 transition-colors">
                                                {String(val)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-zinc-800">
                                <Link href={`/dashboard/projects/${id}/workspace/plan`} className="block">
                            <Button variant="ghost" className="w-full text-metadata font-bold tracking-widest text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 py-6">
                                Edit the plan
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Workflow Action Area */}
            <div className="pt-4">
                {project.state === 'rendering' ? (
                    <RenderProgress projectId={project.id} />
                ) : project.state === 'approved' ? (
                    <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-zinc-900 p-6 sm:p-10 text-center group shadow-2xl">
                        <div className="absolute inset-0 bg-grid-white/[0.02] [mask-image:linear-gradient(0deg,transparent,black)]" />
                        <div className="relative z-10 flex flex-col items-center max-w-lg mx-auto">
                            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-8 border border-primary/20 group-hover:scale-105 transition-transform duration-700">
                                <Film className="w-8 h-8 text-primary" />
                            </div>
                            <h3 className="text-base font-semibold text-zinc-50 mb-4 tracking-normal">Your plan is approved</h3>
                            <p className="text-sm font-bold text-zinc-400 mb-10 tracking-widest leading-loose">
                                Your plan is approved. Start making the takes when you are ready.
                            </p>
                            <RenderButton projectId={project.id} />
                        </div>
                    </div>
                ) : project.state === 'rendered' ? (
                    <div className="bg-zinc-900 border border-emerald-500/10 p-6 sm:p-10 text-center space-y-10 overflow-hidden relative group shadow-2xl">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-50" />
                        <div className="relative z-10">
                            <h3 className="text-base font-semibold text-emerald-400 tracking-normal mb-4">Video complete</h3>
                            <p className="text-sm font-bold text-zinc-400 tracking-widest mb-10">Your finished video is ready to watch and download.</p>
                            <div className="aspect-video max-w-4xl mx-auto bg-zinc-950 rounded-xl border border-zinc-800 relative shadow-2xl overflow-hidden group/video">
                                {videoUrl ? (
                                    <ReviewPlayer url={videoUrl} />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center relative">
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.05),transparent_70%)]" />
                                        <span className="text-zinc-600 font-semibold tracking-normal text-metadata">Your preview will appear here</span>
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/video:opacity-100 transition-all duration-500 flex items-center justify-center backdrop-blur-sm">
                                                <Link href={`/dashboard/projects/${id}/workspace/edit`}>
                                                <Button size="lg" className="primary-cta px-10">
                                                    <Edit2 className="w-4 h-4" />
                                                    Open finishing studio
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : project.state === 'blueprint_ready' ? (
                    <div className="relative overflow-hidden rounded-xl border border-primary/10 bg-zinc-900 p-6 sm:p-10 text-center group shadow-2xl">
                        <div className="absolute inset-0 bg-grid-white/[0.01]" />
                        <div className="relative z-10 flex flex-col items-center max-w-lg mx-auto">
                            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-8 border border-primary/20 group-hover:rotate-6 transition-transform duration-700">
                                <Eye className="w-8 h-8 text-primary" />
                            </div>
                            <h3 className="text-base font-semibold text-foreground mb-4">Plan ready for your review</h3>
                            <p className="text-sm font-bold text-zinc-400 mb-10 tracking-widest leading-loose">
                                FinalFrame has turned your idea into an ordered video plan. Review it before generation.
                            </p>
                            <div className="flex gap-4">
                                <Link href={`/dashboard/projects/${project.id}/workspace/plan`}>
                                    <Button variant="primary" size="md" className="gap-3 px-10 h-12 rounded-xl font-semibold tracking-widest text-metadata ">
                                        <Edit2 className="w-4 h-4" />
                                        Review the plan
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-10 text-center group shadow-2xl">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.03),transparent_40%)]" />
                        <div className="relative z-10 flex flex-col items-center max-w-lg mx-auto">
                            <div className="w-14 h-14 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-8 text-zinc-700 group-hover:text-primary transition-colors duration-700 shadow-xl">
                                <Lock className="w-5 h-5" />
                            </div>
                            <h4 className="text-base font-semibold text-foreground mb-4">Your plan is waiting for a decision</h4>
                            <p className="text-sm font-bold text-zinc-400 tracking-widest leading-loose mb-10">
                                {project.state === 'draft'
                                    ? 'Review the plan and approve it before FinalFrame starts making your video.'
                                    : 'This project is archived and can be viewed but not changed.'}
                            </p>
                            {project.state === 'draft' && (
                                    <Link href={`/dashboard/projects/${project.id}/workspace/plan`}>
                                    <Button size="md" className="primary-cta px-12">
                                        Open the plan
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
