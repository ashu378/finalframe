/**
 * FinalFrame — Blueprint Editor Page
 * Reference: MASTER_PRD.md § 5.II — AI Director Blueprint
 * Reference: BUILD_PHASES.md — Phase 2 Blueprint editing, Scene reordering
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/guards';
import { getProjectById } from '@/lib/project/actions';
import { getScenesForProject } from '@/lib/scene/actions';
import { BlueprintEditor } from '@/components/project';
import { getAssets } from '@/lib/assets/actions';
import styles from './page.module.css';

export const metadata = {
    title: 'Blueprint Editor',
    description: 'Edit your project blueprint',
};

interface BlueprintPageProps {
    params: Promise<{ id: string }>;
}

export default async function BlueprintPage({ params }: BlueprintPageProps) {
    await requireAuth();
    const { id } = await params;

    const [result, scenesResult] = await Promise.all([
        getProjectById(id),
        getScenesForProject(id)
    ]);

    if (!result.success || !result.project) {
        notFound();
    }

    const project = result.project;
    const scenes = scenesResult.success ? (scenesResult.scenes || []) : [];

    // Fetch assets for the studio
    const assets = await getAssets(project.studio_id);

    return (
        <div className="max-w-[1200px] px-8 py-10">
            <header className="mb-10 space-y-4">
                <Link href={`/dashboard/projects/${id}`} className="text-metadata font-black text-zinc-500 uppercase tracking-widest hover:text-primary transition-colors flex items-center gap-2">
                    <span className="text-lg">←</span> Back to Project
                </Link>
                <h1 className="text-xl font-black text-zinc-50 uppercase tracking-[0.3em] italic border-b border-primary/20 pb-4 inline-block">
                    {project.name}
                </h1>
            </header>

            <BlueprintEditor project={project} scenes={scenes} studioAssets={assets} />
        </div>
    );
}
