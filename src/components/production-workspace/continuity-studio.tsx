'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ApprovalControls, controlInput } from './resource-approval-controls';
import { VoiceSetup } from './voice-setup';
import { PreparationPanel } from './preparation-panel';
import { UploadButton } from '@/components/assets/upload-button';
import { acceptEpisodeStory, loadMoreResourceVersions, saveProjectBible, saveProjectResource } from '@/lib/production/workspace-actions';
import { PROJECT_RESOURCE_KINDS, type ResourceVersionView, type WorkspaceControlData } from '@/lib/production/workspace-controls';

const lines = (text: string) => text.split('\n').map((value) => value.trim()).filter(Boolean);
const label = (text: string) => text.replaceAll('_', ' ').toLowerCase();

export function ContinuityStudio({ data, showStory = false }: { data: WorkspaceControlData; showStory?: boolean }) {
    const router = useRouter();
    const [resources, setResources] = useState(data.resources);
    const [cursor, setCursor] = useState(data.resourceCursor);
    const [pending, start] = useTransition();
    const [error, setError] = useState('');
    const [kind, setKind] = useState<(typeof PROJECT_RESOURCE_KINDS)[number]>('CHARACTER');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [assetIds, setAssetIds] = useState<string[]>([]);
    const [voiceId, setVoiceId] = useState('');
    const [revision, setRevision] = useState<ResourceVersionView | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [rules, setRules] = useState('');
    const [story, setStory] = useState('');
    const [style, setStyle] = useState('');
    const [bibleSource, setBibleSource] = useState('');
    const readyResources = resources.filter((resource) => resource.state === 'APPROVED' || resource.state === 'LOCKED');
    const currentResources = data.resources === resources ? resources : [...new Map([...data.resources, ...resources].map((resource) => [resource.id, resource])).values()];

    async function run(action: () => Promise<{ success: boolean; error?: string }>) {
        setError('');
        try { const result = await action(); if (!result.success) setError(result.error || 'The change could not be saved.'); else router.refresh(); }
        catch { setError('The change could not be saved. Please try again.'); }
    }
    function revise(resource: ResourceVersionView) {
        setRevision(resource); setKind(resource.kind); setName(resource.name);
        setDescription(typeof resource.profile.description === 'string' ? resource.profile.description : ''); setAssetIds(resource.assetIds); setVoiceId(resource.voiceId || '');
    }
    return <div className="space-y-6">
        <section className="ff-card space-y-5 p-5 sm:p-7" aria-label="Project media library"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">Project media</h2><p className="mt-2 text-sm text-muted-foreground">Only media deliberately added to this project can be used by its productions.</p></div>{data.canEdit ? <UploadButton studioId={data.studioExternalId} projectExternalId={data.projectExternalId} /> : null}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.assets.map((asset) => <div key={asset.id} className="min-w-0 rounded-xl border border-border p-3"><p className="break-words text-sm font-medium">{asset.name}</p><p className="mt-1 text-xs text-muted-foreground">{asset.mimeType}</p>{asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center text-sm text-primary underline">Open project asset</a> : null}<div className="mt-3"><ApprovalControls data={data} resourceType="asset" resourceId={asset.id} state={asset.state} /></div></div>)}</div>{!data.assets.length ? <p className="text-sm text-muted-foreground">Upload a reference image, footage, or an authorized voice recording to begin.</p> : null}
        </section>
        <VoiceSetup key={data.voices.map((voice) => `${voice.id}:${voice.status}:${voice.state}:${voice.hasConsent}`).join(',')} data={data} />
        <PreparationPanel productionId={data.productionId} voices={data.voices} assets={data.assets} canEdit={data.canEdit} />
        <section className="ff-card space-y-6 p-5 sm:p-7" aria-label="Project resource versions"><div><h2 className="text-xl font-semibold">Characters, locations, and brand references</h2><p className="mt-2 text-sm text-muted-foreground">Each revision creates a separate version. Approved references remain unchanged.</p></div>
            {data.canEdit ? <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); start(() => run(async () => {
                const saved = await saveProjectResource({ projectExternalId: data.projectExternalId, kind, name, profile: { ...(revision?.profile || {}), description }, assetIds, voiceId: voiceId || undefined, resourceId: revision?.resourceId, expectedVersionNumber: revision?.latestVersionNumber });
                if (saved.success) { setName(''); setDescription(''); setAssetIds([]); setVoiceId(''); setRevision(null); }
                return saved;
            })); }}><label className="text-sm font-medium">Resource type<select className={controlInput} value={kind} disabled={Boolean(revision)} onChange={(event) => { setKind(event.target.value as typeof kind); setVoiceId(''); }}>{PROJECT_RESOURCE_KINDS.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
                <label className="text-sm font-medium">Name<input className={controlInput} value={name} disabled={Boolean(revision)} onChange={(event) => setName(event.target.value)} required maxLength={160} /></label>
                <label className="text-sm font-medium md:col-span-2">Appearance and continuity notes<textarea className={controlInput} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10000} required /></label>
                <label className="text-sm font-medium">Reference media<select multiple className={`${controlInput} min-h-28`} value={assetIds} onChange={(event) => setAssetIds(Array.from(event.target.selectedOptions, (option) => option.value))}>{data.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">Choose only the media belonging to this resource.</span></label>
                {kind === 'CHARACTER' ? <label className="text-sm font-medium">Voice<select className={controlInput} value={voiceId} onChange={(event) => setVoiceId(event.target.value)}><option value="">No voice assigned</option>{data.voices.filter((voice) => voice.status !== 'REVOKED' && voice.status !== 'DELETED').map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {label(voice.kind)}</option>)}</select></label> : null}
                <div className="flex flex-wrap gap-3 md:col-span-2"><Button disabled={pending}>{revision ? 'Save a new reference version' : 'Create project reference'}</Button>{revision ? <Button type="button" variant="ghost" onClick={() => { setRevision(null); setName(''); setDescription(''); setAssetIds([]); setVoiceId(''); }}>Cancel revision</Button> : null}</div>
            </form> : null}
            <div className="grid gap-4 lg:grid-cols-2">{currentResources.map((resource) => <article key={resource.id} className="space-y-4 rounded-2xl border border-border p-4"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">{label(resource.kind)} · version {resource.versionNumber}</p><h3 className="mt-1 break-words font-semibold">{resource.name}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{typeof resource.profile.description === 'string' ? resource.profile.description : 'Structured reference profile'}</p></div><ApprovalControls data={data} resourceType="projectResourceVersion" resourceId={resource.id} state={resource.state} />{data.canEdit ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => revise(resource)}>Create revised version</Button> : null}</article>)}</div>
            {cursor ? <Button variant="secondary" disabled={pending} onClick={() => start(async () => { try { const page = await loadMoreResourceVersions(data.projectExternalId, cursor); setResources((previous) => [...new Map([...previous, ...page.resources].map((resource) => [resource.id, resource])).values()]); setCursor(page.cursor); } catch { setError('More references could not be loaded. Please try again.'); } })}>Load more reference versions</Button> : null}
        </section>
        <section className="ff-card space-y-5 p-5 sm:p-7" aria-label="Project continuity bible"><h2 className="text-xl font-semibold">Continuity bible</h2><p className="text-sm text-muted-foreground">Choose exact approved reference versions and rules for the next plan. Existing approved plans keep their original snapshot.</p>
            {data.canEdit ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); start(() => run(() => saveProjectBible({ projectExternalId: data.projectExternalId, sourceBibleId: bibleSource || undefined, snapshot: { resourceBindings: selected.map((id) => { const resource = readyResources.find((entry) => entry.id === id)!; return { resourceId: resource.resourceId, resourceVersionId: resource.id }; }), rules: lines(rules), story, visualStyle: style } }))); }}>
                <label className="block text-sm font-medium">Revise a previous bible<select className={controlInput} value={bibleSource} onChange={(event) => { setBibleSource(event.target.value); const bible = data.bibles.find((entry) => entry.id === event.target.value); if (bible) { setSelected(bible.snapshot.resourceBindings.map((binding) => binding.resourceVersionId)); setRules(bible.snapshot.rules.join('\n')); setStory(bible.snapshot.story); setStyle(bible.snapshot.visualStyle); } }}><option value="">Create an independent snapshot</option>{data.bibles.map((bible) => <option value={bible.id} key={bible.id}>Bible version {bible.versionNumber}</option>)}</select></label>
                <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Approved reference versions</legend>{readyResources.map((resource) => <label key={resource.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={selected.includes(resource.id)} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous.filter((id) => readyResources.find((entry) => entry.id === id)?.resourceId !== resource.resourceId), resource.id] : previous.filter((id) => id !== resource.id))} />{resource.name} · v{resource.versionNumber}</label>)}{!readyResources.length ? <p className="text-sm text-muted-foreground">Approve reference versions above, or create an intentionally blank bible with written rules.</p> : null}</fieldset>
                <label className="block text-sm font-medium">Story world<textarea className={controlInput} rows={3} value={story} maxLength={10000} onChange={(event) => setStory(event.target.value)} /></label>
                <label className="block text-sm font-medium">Visual style<input className={controlInput} value={style} maxLength={10000} onChange={(event) => setStyle(event.target.value)} /></label>
                <label className="block text-sm font-medium">Continuity rules · one per line<textarea className={controlInput} rows={3} value={rules} maxLength={20000} onChange={(event) => setRules(event.target.value)} /></label>
                <Button disabled={pending || selected.some((id) => !readyResources.some((resource) => resource.id === id))}>Save draft bible</Button>
            </form> : null}
            {data.bibles.map((bible) => <article key={bible.id} className="space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">Bible version {bible.versionNumber}{data.plannedBibleId === bible.id ? ' · used by this plan' : ''}</h3><p className="whitespace-pre-wrap text-sm text-muted-foreground">{bible.snapshot.story || 'No story-world description.'}</p><p className="text-xs text-muted-foreground">{bible.snapshot.resourceBindings.length} reference versions · {bible.snapshot.rules.length} rules</p><ApprovalControls data={data} resourceType="continuityBible" resourceId={bible.id} state={bible.state} /></article>)}
        </section>
        {showStory ? <StoryAcceptance data={data} /> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>;
}

export function StoryAcceptance({ data }: { data: WorkspaceControlData }) {
    const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState('');
    const [summary, setSummary] = useState(data.acceptedStory?.summary || '');
    const [facts, setFacts] = useState(data.acceptedStory?.facts.join('\n') || '');
    const [threads, setThreads] = useState(data.acceptedStory?.unresolvedThreads.join('\n') || '');
    const [cliffhanger, setCliffhanger] = useState(data.acceptedStory?.cliffhanger || '');
    const [payoff, setPayoff] = useState(data.acceptedStory?.nextEpisodePayoff || '');
    const [characters, setCharacters] = useState(data.acceptedStory?.characterStates || []);
    const [timelineId, setTimelineId] = useState('');
    const eligible = data.timelines.filter((timeline) => timeline.matchesProductionVersion && ['APPROVED', 'LOCKED'].includes(timeline.state));
    return <section className="ff-card space-y-5 p-5 sm:p-7" aria-label="Accept episode story"><h2 className="text-xl font-semibold">Accepted story facts</h2><p className="text-sm text-muted-foreground">After reviewing the approved final timeline, save only events that actually happened. Later episodes use this snapshot; changing it marks their continuity stale.</p>
        <div className="space-y-3">{data.timelines.filter((timeline) => timeline.matchesProductionVersion).map((timeline) => <article key={timeline.id} className="space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">Timeline version {timeline.versionNumber}</h3><p className="text-xs text-muted-foreground">Approve only after checking the complete timeline and its selected takes.</p><ApprovalControls data={data} resourceType="timeline" resourceId={timeline.id} state={timeline.state} /></article>)}</div>
        {!data.episodeId ? <p className="text-sm text-muted-foreground">Create an episode to carry story facts into the next installment.</p> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); start(async () => { setError(''); try { const result = await acceptEpisodeStory({ projectExternalId: data.projectExternalId, productionId: data.productionId, episodeId: data.episodeId!, versionId: data.versionId!, timelineId, continuityBibleId: data.plannedBibleId || undefined, previousAcceptedStateId: data.acceptedStoryStateId || undefined, snapshot: { summary, facts: lines(facts), unresolvedThreads: lines(threads), cliffhanger, nextEpisodePayoff: payoff, characterStates: characters } }); if (!result.success) setError(result.error); else router.refresh(); } catch { setError('Story facts could not be accepted. Please try again.'); } }); }}>
            <label className="block text-sm font-medium">Approved final timeline<select className={controlInput} value={timelineId} required onChange={(event) => setTimelineId(event.target.value)}><option value="">Choose the reviewed version</option>{eligible.map((timeline) => <option key={timeline.id} value={timeline.id}>Timeline version {timeline.versionNumber}</option>)}</select></label>
            {!eligible.length ? <p className="text-sm text-amber-300">Approve a final timeline for this production version before accepting story facts.</p> : null}
            {([['What happened', summary, setSummary], ['New facts · one per line', facts, setFacts], ['Unresolved threads · one per line', threads, setThreads], ['Cliffhanger', cliffhanger, setCliffhanger], ['Next episode payoff', payoff, setPayoff]] as const).map(([title, value, setter]) => <label key={title} className="block text-sm font-medium">{title}<textarea className={controlInput} rows={2} value={value} maxLength={10000} required={title === 'What happened'} onChange={(event) => setter(event.target.value)} /></label>)}
            {data.boundResources.filter((resource) => resource.kind === 'CHARACTER').map((resource) => { const state = characters.find((entry) => entry.resourceId === resource.resourceId); return <fieldset key={resource.resourceId} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">{resource.name}</legend>{(['knowledge', 'relationships'] as const).map((field) => <label key={field} className="text-sm capitalize">{field}<textarea className={controlInput} rows={2} value={state?.[field] || ''} maxLength={5000} onChange={(event) => setCharacters((previous) => { const current = previous.find((entry) => entry.resourceId === resource.resourceId) || { resourceId: resource.resourceId, knowledge: '', relationships: '' }; return [...previous.filter((entry) => entry.resourceId !== resource.resourceId), { ...current, [field]: event.target.value }]; })} /></label>)}</fieldset>; })}
            <Button disabled={pending || !data.canEdit || data.versionState !== 'APPROVED' || !timelineId}>{pending ? 'Saving…' : 'Accept final story snapshot'}</Button>
        </form>}{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>;
}
