'use client';

/**
 * FinalFrame — Dashboard Home Page (Client Component)
 */

import { useState } from 'react';
import { ProjectCard, NewProjectDialog } from '@/components/project';
import { Button } from '@/components/ui/button';
import type { FullProject } from '@/lib/types/database';
import { Plus, Activity, Film, Layers, Zap, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardClientProps {
    userAccount: string;
    projects: FullProject[];
    studioId?: string;
    title?: string;
    stats?: {
        totalProjects: number;
        activeJobs: number;
        totalAssets: number;
        creditsRemaining: number;
    };
    activities?: {
        id: string;
        type: string;
        label: string;
        description: string;
        timestamp: string;
    }[];
}

export function DashboardClient({ userAccount, projects, studioId, title = "Welcome back", stats, activities }: DashboardClientProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const projectsPerPage = 9;

    // Pagination Logic
    const indexOfLastProject = currentPage * projectsPerPage;
    const indexOfFirstProject = indexOfLastProject - projectsPerPage;
    const currentProjects = projects.slice(indexOfFirstProject, indexOfLastProject);
    const totalPages = Math.ceil(projects.length / projectsPerPage);

    const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

    return (
        <div className="relative">
            <div className="space-y-10 animate-in fade-in duration-500">
                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                    <div className="space-y-4">
                        <h1 className="text-lg font-black uppercase tracking-[0.3em] text-zinc-50 italic border-b-2 border-primary/30 pb-4 inline-block">{title}</h1>
                        <p className="text-metadata text-zinc-500 uppercase tracking-widest mt-8">
                            User Account: <span className="text-primary italic font-bold">{userAccount}</span>
                        </p>
                    </div>

                    <button
                        onClick={() => setIsDialogOpen(true)}
                        className="primary-cta px-10 h-14"
                    >
                        <Plus className="w-5 h-5" />
                        Start New Project
                    </button>
                </header>

                {/* Content Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                    {/* Main Section */}
                    <div className="xl:col-span-8 space-y-12">
                        {/* Stats Summary (Mobile/Tablet visible) */}
                        {stats && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-6 border-b border-zinc-800 xl:hidden">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Projects</p>
                                    <p className="text-lg font-black text-zinc-50 italic">{stats.totalProjects}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Active</p>
                                    <p className="text-lg font-black text-primary italic">{stats.activeJobs}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Assets</p>
                                    <p className="text-lg font-black text-zinc-50 italic">{stats.totalAssets}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Credits</p>
                                    <p className="text-lg font-black text-zinc-50 italic">{stats.creditsRemaining}</p>
                                </div>
                            </div>
                        )}

                        <section>
                            {projects.length > 0 ? (
                                <>
                                    <h2 className="text-caption text-primary mb-10 flex items-center gap-4">
                                        <div className="w-2 h-2 bg-primary rounded-none shadow-[0_0_10px_#fbbf24]" />
                                        Your Active Projects
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                        {currentProjects.map((project) => (
                                            <ProjectCard key={project.id} project={project} />
                                        ))}
                                    </div>

                                    {/* Premium Pagination Controls */}
                                    {totalPages > 1 && (
                                        <div className="mt-12 flex items-center justify-between border-t border-zinc-800 pt-8">
                                            <p className="text-metadata text-zinc-500 uppercase tracking-widest italic">
                                                Registry Page <span className="text-zinc-50 font-black">{currentPage}</span> of <span className="text-zinc-50 font-black">{totalPages}</span>
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => paginate(Math.max(1, currentPage - 1))}
                                                    disabled={currentPage === 1}
                                                    className="w-10 h-10 flex items-center justify-center rounded-none border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-primary hover:border-primary/50 disabled:opacity-30 disabled:hover:text-zinc-400 disabled:hover:border-zinc-800 transition-all shadow-lg active:scale-95"
                                                >
                                                    <ChevronLeft className="w-5 h-5" />
                                                </button>

                                                <div className="flex items-center">
                                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((number) => (
                                                        <button
                                                            key={number}
                                                            onClick={() => paginate(number)}
                                                            className={cn(
                                                                "w-10 h-10 text-metadata font-black transition-all",
                                                                currentPage === number
                                                                    ? "text-primary italic border-b-2 border-primary"
                                                                    : "text-zinc-500 hover:text-zinc-50"
                                                            )}
                                                        >
                                                            {number.toString().padStart(2, '0')}
                                                        </button>
                                                    ))}
                                                </div>

                                                <button
                                                    onClick={() => paginate(Math.min(totalPages, currentPage + 1))}
                                                    disabled={currentPage === totalPages}
                                                    className="w-10 h-10 flex items-center justify-center rounded-none border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-primary hover:border-primary/50 disabled:opacity-30 disabled:hover:text-zinc-400 disabled:hover:border-zinc-800 transition-all shadow-lg active:scale-95"
                                                >
                                                    <ChevronRight className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-28 border border-zinc-800 rounded-sm bg-zinc-900 shadow-2xl">
                                    <div className="w-20 h-20 rounded-sm bg-primary/5 flex items-center justify-center mb-10 border border-primary/20 relative">
                                        <div className="absolute inset-0 border border-primary/10 animate-pulse rounded-sm" />
                                        <span className="text-3xl opacity-60 grayscale group-hover:grayscale-0 transition-all">🎬</span>
                                    </div>
                                    <h2 className="text-lg font-black uppercase tracking-[0.4em] mb-4 text-zinc-50 italic">No Projects Yet</h2>
                                    <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest text-center max-w-sm mb-12 leading-loose italic">
                                        Studio registry is currently vacant. Start a new project to get started.
                                    </p>
                                    <button
                                        onClick={() => setIsDialogOpen(true)}
                                        className="primary-cta px-12 h-14"
                                    >
                                        Start Project
                                    </button>
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Sidebar Section (Desktop) */}
                    <aside className="xl:col-span-4 space-y-12 hidden xl:block">
                        {/* Production Telemetry */}
                        {stats && (
                            <div className="space-y-6">
                                <h2 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.4em] flex items-center gap-3 italic px-2">
                                    <Activity className="w-4 h-4 text-primary" />
                                    Production_Telemetry
                                </h2>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-6 rounded-sm border border-zinc-800 bg-zinc-950/50 shadow-inner group hover:border-primary/20 transition-all">
                                        <Film className="w-4 h-4 text-zinc-600 mb-4 group-hover:text-primary transition-colors" />
                                        <p className="text-2xl font-black text-zinc-50 italic">{stats.totalProjects}</p>
                                        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mt-1">Nodes</p>
                                    </div>
                                    <div className="p-6 rounded-sm border border-zinc-800 bg-zinc-950/50 shadow-inner group hover:border-primary/20 transition-all">
                                        <Layers className="w-4 h-4 text-zinc-600 mb-4 group-hover:text-primary transition-colors" />
                                        <p className="text-2xl font-black text-zinc-50 italic">{stats.totalAssets}</p>
                                        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mt-1">Materials</p>
                                    </div>
                                    <div className="p-6 rounded-sm border border-zinc-800 bg-zinc-950/50 shadow-inner group hover:border-primary/20 transition-all">
                                        <Zap className="w-4 h-4 text-zinc-600 mb-4 group-hover:text-primary transition-colors" />
                                        <p className="text-2xl font-black text-zinc-50 italic">{stats.creditsRemaining}</p>
                                        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mt-1">Signals</p>
                                    </div>
                                    <div className="p-6 rounded-sm border border-primary/10 bg-primary/5 shadow-inner group hover:bg-primary/20 transition-all">
                                        <Activity className="w-4 h-4 text-primary/60 mb-4 group-hover:text-primary transition-colors" />
                                        <p className="text-2xl font-black text-primary italic">{stats.activeJobs}</p>
                                        <p className="text-[9px] font-black text-primary/60 uppercase tracking-widest mt-1">Active</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Recent Activity */}
                        {activities && (
                            <div className="space-y-6">
                                <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.4em] px-2 italic">Registry_Activity</h2>
                                <div className="rounded-sm border border-zinc-800 bg-zinc-950/30 p-8 space-y-8 shadow-inner">
                                    {activities.map((act) => (
                                        <div key={act.id} className="relative pl-10 group">
                                            <div className="absolute left-0 top-0.5 w-6 h-6 rounded-sm bg-zinc-900 border border-zinc-800 flex items-center justify-center z-10 group-hover:border-primary/40 transition-all shadow-lg">
                                                <CheckCircle2 className="w-3 h-3 text-zinc-700 group-hover:text-primary transition-colors" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-tight mb-1 line-clamp-1 italic">{act.label}</p>
                                                <p className="text-metadata font-bold text-zinc-600 leading-tight line-clamp-2 italic">{act.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </aside>
                </div>
            </div>

            <NewProjectDialog
                isOpen={isDialogOpen}
                studioId={studioId}
                onClose={() => setIsDialogOpen(false)}
            />
        </div>
    );
}
