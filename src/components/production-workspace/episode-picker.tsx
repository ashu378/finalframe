'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createProjectEpisode, changeProjectEpisodeRelationship, refreshProjectEpisodeContinuity, type EpisodeOption, type EpisodeSettings } from '@/lib/production/episode-actions';
import { OUTPUT_PRESETS } from '../../../renderer/src/output-presets';

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
    const [useSettings, setUseSettings] = useState(false);
    const [settings, setSettings] = useState({ mode: '', workflow: '', outputPreset: '', language: '' });
    const [continuityMode, setContinuityMode] = useState<'STORY_CONTINUATION' | 'PROJECT_IDENTITY'>('STORY_CONTINUATION');
    const [relationshipOpen, setRelationshipOpen] = useState(false);
    const [existingMode, setExistingMode] = useState<'STORY_CONTINUATION' | 'PROJECT_IDENTITY'>('STORY_CONTINUATION');
    const storageKey = `finalframe:project:${projectExternalId}:production`;
    const selected = options.find((option) => option.productionId === selectedProductionId);
    const explicitSettings = useSettings || selected?.settingsSupported === false;
    const settingsComplete = settings.mode && settings.workflow && settings.outputPreset && settings.language.trim();

    useEffect(() => {
        try {
            if (selectedProductionId) {
                localStorage.setItem(storageKey, selectedProductionId);
            } else if (!searchParams.has('timeline')) {
                const saved = localStorage.getItem(storageKey);
                if (saved && options.some((option) => option.productionId === saved)) {
                    const query = new URLSearchParams(searchParams.toString());
                    query.set('production', saved);
                    query.delete('timeline');
                    router.replace(`${pathname}?${query.toString()}`);
                }
            }
        } catch { /* Explicit URL selection continues to work when browser storage is unavailable. */ }
    }, [options, pathname, router, searchParams, selectedProductionId, storageKey]);

    function select(productionId: string) {
        setRelationshipOpen(false);
        const query = new URLSearchParams(searchParams.toString());
        query.set('production', productionId);
        if (productionId !== selectedProductionId) query.delete('timeline');
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
        {selected?.episodeId && Number.isFinite(selected.updatedAt) ? <div className="space-y-3"><p className="text-xs text-muted-foreground">Relationship: {selected.continuityMode === 'PROJECT_IDENTITY' ? 'independent post using project identity' : 'continuation of the previous story'}.</p><Button variant="ghost" disabled={pending} onClick={() => { setExistingMode(selected.continuityMode ?? 'STORY_CONTINUATION'); setRelationshipOpen(value => !value); }}>Change relationship before approval</Button>{relationshipOpen ? <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={event => { event.preventDefault(); setError(null); startTransition(async () => {
            const result = await changeProjectEpisodeRelationship({ projectExternalId, episodeId: selected.episodeId!, continuityMode: existingMode, expectedUpdatedAt: selected.updatedAt! });
            if (!result.success) { setError(result.error); return; }
            setRelationshipOpen(false);
            if (result.requiresNewPlan) router.push(`/dashboard/create?project=${encodeURIComponent(projectExternalId)}&production=${encodeURIComponent(selected.productionId)}`);
            else router.refresh();
        }); }}><label className="text-sm">Episode relationship<RelationshipSelect value={existingMode} onChange={setExistingMode} label="Existing episode relationship" /></label><p className="text-xs leading-5 text-muted-foreground">Only episodes without approved versions or timelines can change. An unapproved draft plan is retained as superseded and must be planned and reviewed again. This does not generate or approve anything.</p><Button type="submit" disabled={pending || existingMode === (selected.continuityMode ?? 'STORY_CONTINUATION')}>Save relationship and reopen planning</Button></form> : null}</div> : null}
        {selected?.continuityStatus === 'STALE' && selected.continuityMode !== 'PROJECT_IDENTITY' ? <div className="space-y-3"><p role="status" className="text-sm text-amber-300">Earlier story decisions changed or have not been approved. Refresh continuity for a continuing story, or explicitly change an unapproved episode to an independent post.</p>{selected.episodeId ? <Button variant="secondary" disabled={pending} onClick={() => startTransition(async () => {
            setError(null);
            const result = await refreshProjectEpisodeContinuity(projectExternalId, selected.episodeId!);
            if (!result.success) setError(result.error);
            else router.refresh();
        })}>Refresh accepted continuity</Button> : null}</div> : null}
        {showCreate ? <form onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
                const result = await createProjectEpisode({ projectExternalId, episodeNumber: nextEpisodeNumber, title, durationSeconds: duration, sourceProductionId: selectedProductionId, continuityMode, ...(explicitSettings ? { settings: { ...settings, language: settings.language.trim() } as EpisodeSettings } : {}) });
                if (!result.success) { setError(result.error); if ('requiresSettings' in result && result.requiresSettings) setUseSettings(true); return; }
                setShowCreate(false);
                router.push(`/dashboard/create?project=${encodeURIComponent(projectExternalId)}&production=${encodeURIComponent(result.productionId)}`);
            });
        }} className="grid gap-4 border-t border-border pt-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <div><label htmlFor="episode-title" className="text-sm font-medium">Episode {nextEpisodeNumber} title</label><input id="episode-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></div>
            <div><label htmlFor="episode-duration" className="text-sm font-medium">Length</label><select id="episode-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{[4, 8, 15, 30, 60].map((value) => <option key={value} value={value}>{value} seconds</option>)}</select></div>
            <Button type="submit" disabled={pending || !title.trim() || explicitSettings && !settingsComplete}>{pending ? 'Creating…' : 'Create episode'}</Button>
            <div className="space-y-3 sm:col-span-3">
                <label className="block text-sm font-medium">How does this video relate to the project?<RelationshipSelect value={continuityMode} onChange={setContinuityMode} label="New episode relationship" /></label><p className="text-xs leading-5 text-muted-foreground">Story continuation uses the preceding episode’s accepted story. An independent post uses your explicitly chosen approved project identity and references without waiting for earlier drafts to finish.</p>
                {selected?.settingsSupported === false ? <p role="status" className="text-sm text-amber-300">This source uses older settings. Choose supported settings for the new episode. Its project references and earlier approved episodes stay unchanged.</p> : <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={useSettings} onChange={(event) => setUseSettings(event.target.checked)} />Choose different settings for this episode</label>}
                {explicitSettings ? <fieldset className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-medium">Explicit new episode settings</legend>
                    <label className="text-sm">Starting mode<select aria-label="New episode starting mode" required value={settings.mode} onChange={(event) => setSettings((old) => ({ ...old, mode: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Choose a mode</option>{['IDEA', 'SCRIPT', 'VOICE', 'IMAGES', 'FOOTAGE', 'AD'].map((value) => <option key={value} value={value}>{value.toLowerCase()}</option>)}</select></label>
                    <label className="text-sm">Workflow<select aria-label="New episode workflow" required value={settings.workflow} onChange={(event) => setSettings((old) => ({ ...old, workflow: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Choose a workflow</option>{[['SOCIAL', 'Social / story'], ['COMEDY', 'Comedy'], ['BUSINESS_AD', 'Business advertisement'], ['FOOTAGE_TRANSFORM', 'Edit supplied footage']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="text-sm">Output format<select aria-label="New episode output format" required value={settings.outputPreset} onChange={(event) => setSettings((old) => ({ ...old, outputPreset: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Choose a format</option>{OUTPUT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} · {preset.aspectRatio}</option>)}</select></label>
                    <label className="text-sm">Language code<input aria-label="New episode language" required maxLength={35} pattern="[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*" placeholder="en, pcm, or fr" value={settings.language} onChange={(event) => setSettings((old) => ({ ...old, language: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
                </fieldset> : null}
            </div>
        </form> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>;
}

function RelationshipSelect({ value, onChange, label }: { value: 'STORY_CONTINUATION' | 'PROJECT_IDENTITY'; onChange: (value: 'STORY_CONTINUATION' | 'PROJECT_IDENTITY') => void; label: string }) {
    return <select aria-label={label} value={value} onChange={event => onChange(event.target.value as typeof value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="STORY_CONTINUATION">Continue the previous story</option><option value="PROJECT_IDENTITY">Independent post using project identity</option></select>;
}
