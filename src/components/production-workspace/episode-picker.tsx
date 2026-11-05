'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createProjectEpisode, refreshProjectEpisodeContinuity, type EpisodeOption } from '@/lib/production/episode-actions';

export function EpisodePicker({ projectExternalId, options, selectedProductionId, nextEpisodeNumber }: {
    projectExternalId: string; options: EpisodeOption[]; selectedProductionId?: string; nextEpisodeNumber: number;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [showCreate, setShowCreate] = useState(false);
    const [title, setTitle] = useState('');
    const [duration, setDuration] = useState(30);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const storageKey = `finalframe:project:${projectExternalId}:production`;
    const selected = options.find((option) => option.productionId === selectedProductionId);

    useEffect(() => {
        try {
            if (selectedProductionId) {
                localStorage.setItem(storageKey, selectedProductionId);
            } else {
                const saved = localStorage.getItem(storageKey);
                if (saved && options.some((option) => option.productionId === saved)) {
                    const query = new URLSearchParams(searchParams.toString());
                    query.set('production', saved);
                    router.replace(`${pathname}?${query.toString()}`);
                }
            }
        } catch { /* Explicit URL selection continues to work when browser storage is unavailable. */ }
    }, [options, pathname, router, searchParams, selectedProductionId, storageKey]);

    function select(productionId: string) {
        const query = new URLSearchParams(searchParams.toString());
        query.set('production', productionId);
        router.push(`${pathname}?${query.toString()}`);
    }

    return <section className="ff-card space-y-4 p-5" aria-label="Project episodes">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1 sm:max-w-xl"><label htmlFor="episode-production" className="text-sm font-semibold">Production or episode</label>
                <select id="episode-production" value={selectedProductionId || ''} onChange={(event) => select(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
                    <option value="" disabled>Select an episode</option>
                    {options.map((option) => <option key={option.productionId} value={option.productionId}>{option.title}</option>)}
                </select>
            </div>
            <Button variant="secondary" onClick={() => setShowCreate((value) => !value)} disabled={pending || nextEpisodeNumber > 500}>New episode</Button>
        </div>
        {selected?.continuityStatus === 'STALE' ? <div className="space-y-3"><p role="status" className="text-sm text-amber-300">Earlier story decisions changed or have not been approved. Refresh and review continuity before approving this episode.</p>{selected.episodeId ? <Button variant="secondary" disabled={pending} onClick={() => startTransition(async () => {
            setError(null);
            const result = await refreshProjectEpisodeContinuity(projectExternalId, selected.episodeId!);
            if (!result.success) setError(result.error);
            else router.refresh();
        })}>Refresh accepted continuity</Button> : null}</div> : null}
        {showCreate ? <form onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
                const result = await createProjectEpisode({ projectExternalId, episodeNumber: nextEpisodeNumber, title, durationSeconds: duration, sourceProductionId: selectedProductionId });
                if (!result.success) { setError(result.error); return; }
                setShowCreate(false);
                router.push(`/dashboard/create?project=${encodeURIComponent(projectExternalId)}&production=${encodeURIComponent(result.productionId)}`);
            });
        }} className="grid gap-4 border-t border-border pt-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <div><label htmlFor="episode-title" className="text-sm font-medium">Episode {nextEpisodeNumber} title</label><input id="episode-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></div>
            <div><label htmlFor="episode-duration" className="text-sm font-medium">Length</label><select id="episode-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{[4, 8, 15, 30, 60].map((value) => <option key={value} value={value}>{value} seconds</option>)}</select></div>
            <Button type="submit" disabled={pending || !title.trim()}>{pending ? 'Creating…' : 'Create episode'}</Button>
        </form> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>;
}
