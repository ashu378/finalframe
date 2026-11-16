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
            return 'bg-background text-muted-foreground border-border';
        case 'blueprint_ready':
            return 'bg-primary/10 text-primary border-primary/30';
        case 'approved':
        case 'rendered':
            return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        case 'rendering':
            return 'bg-secondary text-foreground border-border';
        default:
            return 'bg-background text-muted-foreground border-border';
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
        <div className="group relative rounded-xl border border-border bg-card hover:border-primary/50 p-5 transition-colors">
            <div className="flex justify-between items-start mb-6">
                <div className={`px-2.5 py-1 rounded-xl text-sm border ${stateStyles}`}>
                    {stateLabel}
                </div>
                <div className="flex items-center gap-1 -mr-2 -mt-1">
                    <ProjectActionsMenu project={project} />
                </div>
            </div>

            <Link
                href={`/dashboard/projects/${project.id}`}
                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <h3 className="break-words text-lg font-semibold mb-4 text-foreground group-hover:text-primary transition-colors leading-relaxed">
                    {project.name}
                </h3>

                <div className="flex flex-wrap gap-2 mb-8">
                    {project.outcome_goal && (
                        <span className="text-sm font-semibold  tracking-normal px-3 py-1 rounded-xl bg-background text-muted-foreground border border-border group-hover:border-primary/40 group-hover:text-foreground transition-colors">
                            {project.outcome_goal.replace(/_/g, ' ')}
                        </span>
                    )}
                    {project.platform && (
                        <span className="text-sm font-semibold  tracking-normal px-3 py-1 rounded-xl bg-background text-muted-foreground border border-border group-hover:border-primary/40 group-hover:text-foreground transition-colors">
                            {project.platform.replace(/_/g, ' ')}
                        </span>
                    )}
                </div>

                <div className="flex items-center text-sm font-semibold  tracking-normal text-muted-foreground border-t border-border pt-5 group-hover:border-primary/40 transition-colors">
                    <Clock className="w-4 h-4 mr-2 opacity-80" />
                    Created {createdDate}
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                        <ArrowRight className="w-4 h-4 text-primary" />
                    </div>
                </div>
            </Link>
        </div>
    );
}
