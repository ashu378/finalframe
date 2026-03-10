/**
 * FinalFrame — Project Card Component
 */

import Link from 'next/link';
import { STATE_LABELS } from '@/lib/project/state-machine';
import type { FullProject, ProjectState } from '@/lib/types/database';
import { ArrowRight, Clock } from 'lucide-react';

import { ProjectActionsMenu } from './project-actions-menu';

interface ProjectCardProps {
    project: FullProject;
}

/**
 * Get badge styling based on project state
 */
function getStateStyles(state: ProjectState) {
    switch (state) {
        case 'draft':
            return 'bg-zinc-950 text-zinc-500 border-zinc-800';
        case 'blueprint_ready':
            return 'bg-primary/10 text-primary border-primary/30';
        case 'approved':
        case 'rendered':
            return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        case 'rendering':
            return 'bg-zinc-800 text-zinc-100 border-zinc-700 animate-pulse';
        default:
            return 'bg-zinc-950 text-zinc-600 border-zinc-900';
    }
}

/**
 * Project card for dashboard listing
 */
export function ProjectCard({ project }: ProjectCardProps) {
    const stateLabel = STATE_LABELS[project.state] || project.state;
    const stateStyles = getStateStyles(project.state);
    const createdDate = new Date(project.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
    });

    return (
        <div className="group relative rounded-sm border border-zinc-800 bg-zinc-900 hover:border-primary/50 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5">
            <div className="flex justify-between items-start mb-6">
                <div className={`px-2.5 py-1 rounded-sm text-metadata border ${stateStyles}`}>
                    {stateLabel}
                </div>
                <div className="flex items-center gap-1 -mr-2 -mt-1 scale-90">
                    <ProjectActionsMenu project={project} />
                </div>
            </div>

            <Link
                href={`/dashboard/projects/${project.id}`}
                className="block"
            >
                <h3 className="text-sm font-black uppercase tracking-widest mb-4 text-zinc-50 group-hover:text-primary transition-colors leading-relaxed">
                    {project.name}
                </h3>

                <div className="flex flex-wrap gap-2 mb-8">
                    {project.outcome_goal && (
                        <span className="text-metadata font-black uppercase tracking-widest px-3 py-1 rounded-sm bg-zinc-950 text-zinc-400 border border-zinc-800 group-hover:border-primary/40 group-hover:text-zinc-50 transition-colors">
                            {project.outcome_goal.replace(/_/g, ' ')}
                        </span>
                    )}
                    {project.platform && (
                        <span className="text-metadata font-black uppercase tracking-widest px-3 py-1 rounded-sm bg-zinc-950 text-zinc-400 border border-zinc-800 group-hover:border-primary/40 group-hover:text-zinc-50 transition-colors">
                            {project.platform.replace(/_/g, ' ')}
                        </span>
                    )}
                </div>

                <div className="flex items-center text-metadata font-black uppercase tracking-widest text-zinc-500 border-t border-zinc-800 pt-5 group-hover:border-primary/40 transition-colors">
                    <Clock className="w-4 h-4 mr-2 opacity-80" />
                    INIT: {createdDate}
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                        <ArrowRight className="w-4 h-4 text-primary" />
                    </div>
                </div>
            </Link>
        </div>
    );
}
