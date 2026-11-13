'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { approveDirectorPlan } from '@/lib/production/actions';

export function EpisodeBlueprint({ projectId, productionId, planId, summary, approved, sequences, canEdit = false, versionId }: {
    projectId: string; productionId: string; planId?: string; summary: string; approved: boolean; canEdit?: boolean; versionId?: string;
    sequences: Array<{ title: string; scenes: Array<{ title: string; purpose: string; shots: Array<{ title?: string; prompt: string; durationSeconds: number }> }> }>;
}) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const query = `production=${encodeURIComponent(productionId)}`;
    return <section className="ff-card space-y-6 p-6 sm:p-8">
        <div><p className="ff-eyebrow">{approved ? 'Approved production snapshot' : 'Production plan draft'}</p><p className="mt-3 max-w-3xl leading-7 text-muted-foreground">{summary || (approved ? 'Review the approved scenes and shots for this episode.' : 'Create a plan for this episode, then review its scenes and shots here.')}</p></div>
        {sequences.map((sequence, sequenceIndex) => <div key={sequenceIndex} className="space-y-3"><h2 className="ff-display text-xl font-semibold">{sequence.title}</h2>{sequence.scenes.map((scene, sceneIndex) => <section key={sceneIndex} className="rounded-2xl border border-border p-4"><h3 className="font-semibold">{scene.title}</h3><p className="mt-2 text-sm text-muted-foreground">{scene.purpose}</p><ol className="mt-4 space-y-3">{scene.shots.map((shot, shotIndex) => <li key={shotIndex} className="border-l-2 border-primary pl-3"><p className="text-sm font-semibold">{shot.title || `Shot ${shotIndex + 1}`} · {shot.durationSeconds}s</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{shot.prompt}</p></li>)}</ol></section>)}</div>)}
        <div className="flex flex-wrap gap-3">
            {canEdit && !approved && planId && versionId ? <Button disabled={pending} onClick={() => startTransition(async () => {
                setError(null);
                const result = await approveDirectorPlan(planId);
                if (!result.success) setError(result.error || 'The plan could not be approved.');
                else router.refresh();
            })}>{pending ? 'Approving…' : 'Approve this plan'}</Button> : null}
            {canEdit ? <Link href={`/dashboard/create?project=${encodeURIComponent(projectId)}&${query}`} className="ff-button-secondary">{approved || planId ? 'Create a revised plan' : 'Create this episode’s plan'}</Link> : null}
            {approved ? <Link href={`/dashboard/projects/${encodeURIComponent(projectId)}/workspace/takes?${query}`} className="ff-button-primary">Make this episode</Link> : null}
        </div>
        {versionId ? <p className="break-all text-xs text-muted-foreground">Selected production version: {versionId}</p> : null}
        {approved ? <p className="text-xs leading-5 text-muted-foreground">This approved version is retained unchanged. Revising the plan creates a new version.</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>;
}
