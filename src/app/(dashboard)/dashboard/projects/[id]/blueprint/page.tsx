/**
 * FinalFrame — Blueprint Editor Page
 * Reference: MASTER_PRD.md § 5.II — AI Director Blueprint
 * Reference: BUILD_PHASES.md — Phase 2 Blueprint editing, Scene reordering
 */

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
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
        return null;
    }

    const project = result.project;
    const scenes = scenesResult.success ? (scenesResult.scenes || []) : [];

    // Fetch assets for the studio
    const assets = await getAssets(project.studio_id);

    return (
        <div className="mx-auto max-w-6xl py-5 sm:py-8">
            <header className="mb-10 space-y-4">
                <Link href={`/dashboard/projects/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
                    <ArrowLeft className="size-4" /> Back to project
                </Link>
                <div className="rounded-[1.5rem] bg-[#f4ead6] p-7 sm:p-10"><p className="ff-eyebrow flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Your video plan</p><h1 className="public-heading-section mt-4">{project.name}</h1><p className="public-body-text mt-4 max-w-2xl">Read the story, adjust the parts that matter, and approve the plan when it feels right.</p></div>
            </header>

            <BlueprintEditor project={project} scenes={scenes} studioAssets={assets} />
        </div>
    );
}
