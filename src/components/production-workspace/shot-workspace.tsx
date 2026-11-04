'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { GenerateShotButton } from '@/components/production/generate-shot-button';
import { ApprovalControls, controlInput } from './resource-approval-controls';
import { bindShotResources, saveShotOperationControls } from '@/lib/production/workspace-actions';
import type { ShotControlView, WorkspaceControlData } from '@/lib/production/workspace-controls';
import { isSourceVideoEdit, VIDEO_OPERATIONS, type VideoOperation } from '@/lib/ai/video-routing';

const operationLabels: Record<VideoOperation, string> = { GENERATE: 'Create footage', FRAME_TO_VIDEO: 'Animate a first frame', EDIT: 'Edit footage', APPEARANCE_EDIT: 'Change appearance or hairstyle', OBJECT_REPLACE: 'Replace a product, car, or object', PERFORMANCE_TRANSFER: 'Transfer a recorded performance', EXTEND: 'Extend an accepted clip', LIP_SYNC: 'Animate a portrait to recorded speech', UPSCALE: 'Upscale footage' };

export function ShotWorkspace({ data }: { data: WorkspaceControlData }) {
    return <div className="space-y-6"><GenerationStatus productionId={data.productionId} canEdit={data.canEdit} /><header><h2 className="text-2xl font-semibold">Shots and takes</h2><p className="mt-2 text-sm text-muted-foreground">Bind the exact references and operation before approving the plan. Model availability and costs are checked again when a job is queued.</p></header>
        {data.versionState === 'APPROVED' ? <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">This plan is an immutable approved snapshot. Create a revised plan to change shot instructions or references. New takes preserve previous results.</p> : null}
        {!data.scenes.length ? <p className="ff-card p-6 text-sm text-muted-foreground">Create a draft plan to begin editing its scenes and shots.</p> : null}
        {data.scenes.map((scene) => <section key={scene.id} className="space-y-4" aria-label={scene.title}><div><h3 className="text-lg font-semibold">{scene.title}</h3><p className="text-sm text-muted-foreground">{scene.purpose}</p></div>{scene.shots.map((shot) => <ShotCard key={`${shot.id}:${data.versionState}`} data={data} shot={shot} />)}</section>)}
    </div>;
}

function ShotCard({ data, shot }: { data: WorkspaceControlData; shot: ShotControlView }) {
    const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState(''); const [saved, setSaved] = useState('');
    const [resourceIds, setResourceIds] = useState(shot.resourceVersionIds);
    const [controls, setControls] = useState(shot.operationControls);
    const editable = data.canEdit && data.versionState === 'DRAFT' && shot.state !== 'LOCKED';
    const sourceEdit = isSourceVideoEdit(controls.operation);
    const [savedSourceId, ...extraSavedReferences] = shot.operationControls.referenceAssetIds;
    const comparisonSource = isSourceVideoEdit(shot.operationControls.operation) && extraSavedReferences.length === 0
        ? data.assets.find((asset) => asset.id === savedSourceId && asset.url && asset.mimeType.startsWith('video/') && ['APPROVED', 'LOCKED'].includes(asset.state))
        : undefined;
    const candidates = data.boundResources.filter((resource) => ['APPROVED', 'LOCKED'].includes(resource.state));
    async function save(action: () => Promise<{ success: boolean; error?: string }>) {
        setError(''); setSaved(''); try { const result = await action(); if (!result.success) setError(result.error || 'This change could not be saved.'); else { setSaved('Saved to this draft production.'); router.refresh(); } }
        catch { setError('This change could not be saved. Please try again.'); }
    }
    return <article className="ff-card space-y-6 p-5 sm:p-7"><header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h4 className="font-semibold">{shot.title}</h4><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{shot.prompt}</p><p className="mt-2 text-xs text-muted-foreground">{shot.durationSeconds} seconds · {operationLabels[shot.operationControls.operation] || 'Video operation'}</p></div>{data.canEdit && data.versionState === 'APPROVED' ? <GenerateShotButton productionId={data.productionId} shotId={shot.id} /> : null}</header>
        <details className="rounded-xl border border-border p-4" open={editable}><summary className="min-h-8 cursor-pointer text-sm font-semibold">Exact continuity references</summary><div className="mt-3 space-y-2">{candidates.map((resource) => <label key={resource.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={!editable || pending} checked={resourceIds.includes(resource.id)} onChange={(event) => setResourceIds((previous) => event.target.checked ? [...previous, resource.id] : previous.filter((id) => id !== resource.id))} />{resource.name} · version {resource.versionNumber}</label>)}{!candidates.length ? <p className="text-sm text-muted-foreground">This plan has no approved continuity resources. Create and approve project references and a bible, then include that bible in a new plan.</p> : null}{editable ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => save(() => bindShotResources({ projectExternalId: data.projectExternalId, productionId: data.productionId, shotId: shot.id, resourceVersionIds: resourceIds })))}>Save shot bindings</Button> : null}</div></details>
        <details className="rounded-xl border border-border p-4" open={editable}><summary className="min-h-8 cursor-pointer text-sm font-semibold">Operation and source media</summary><form className="mt-3 grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); start(() => save(() => saveShotOperationControls({ projectExternalId: data.projectExternalId, productionId: data.productionId, shotId: shot.id, controls }))); }}>
            <label className="text-sm font-medium">Operation<select aria-label="Video operation" className={controlInput} disabled={!editable || pending} value={controls.operation} onChange={(event) => { const operation = event.target.value as VideoOperation; setControls((previous) => ({ ...previous, operation, audioPolicy: operation === 'LIP_SYNC' ? 'USE_RECORDING' : isSourceVideoEdit(operation) ? 'KEEP_SOURCE' : previous.audioPolicy, previousJobId: operation === 'EXTEND' ? previous.previousJobId : '', upscaleFactor: operation === 'UPSCALE' ? previous.upscaleFactor ?? 2 : undefined, upscaleMode: operation === 'UPSCALE' ? previous.upscaleMode ?? 'PRECISE' : undefined })); }}>{VIDEO_OPERATIONS.map((operation) => <option key={operation} value={operation}>{operationLabels[operation]}</option>)}</select></label>
            <label className="text-sm font-medium">Audio policy<select className={controlInput} disabled={!editable || pending} value={controls.audioPolicy} onChange={(event) => setControls((previous) => ({ ...previous, audioPolicy: event.target.value as typeof previous.audioPolicy }))}><option value="SILENT">Silent footage</option><option value="KEEP_SOURCE">Keep original source audio</option><option value="USE_RECORDING">Use selected voice or music recording</option><option value="GENERATE">Generate audio · supported models only</option></select></label>
            {sourceEdit && <p className="text-sm leading-6 text-muted-foreground md:col-span-2">
                Choose one approved project video and keep its original audio. In the shot prompt, describe one change, then say which person, movement, or framing to preserve. The edited take is saved separately for comparison.
            </p>}
            {controls.operation === 'PERFORMANCE_TRANSFER' && <p className="text-sm leading-6 text-muted-foreground md:col-span-2">
                Performance transfer uses a motion reference to animate a character. FinalFrame needs a reviewed route for your references before it can generate a take.
            </p>}
            {controls.operation === 'EXTEND' ? <label className="text-sm font-medium md:col-span-2">Approved clip to continue<select required className={controlInput} disabled={!editable || pending} value={controls.previousJobId || ''} onChange={(event) => setControls((previous) => ({ ...previous, previousJobId: event.target.value }))}><option value="">Choose a completed, approved take</option>{controls.previousJobId && !data.continuationSources.some(source => source.providerJobId === controls.previousJobId) ? <option value={controls.previousJobId} disabled>Previous selection is unavailable; choose again</option> : null}{data.continuationSources.map(source => <option key={source.jobId} value={source.providerJobId}>{source.label}</option>)}</select><span className="mt-2 block text-xs leading-5 text-muted-foreground">Continuation keeps this clip’s original generation settings. {data.continuationSources.length ? 'The take must still be approved when generation starts.' : 'Approve a completed take in this production before extending it.'}</span></label> : null}
            {controls.operation === 'UPSCALE' ? <>
                <label className="text-sm font-medium">Upscale factor<input required type="number" min={1.5} max={3} step="any" className={controlInput} disabled={!editable || pending} value={controls.upscaleFactor ?? ''} onChange={(event) => setControls((previous) => ({ ...previous, upscaleFactor: event.target.value ? Number(event.target.value) : undefined }))} /><span className="mt-2 block text-xs text-muted-foreground">Enlarge from 1.5× to 3×. The reviewed route must support your setting.</span></label>
                <label className="text-sm font-medium">Upscale mode<select required className={controlInput} disabled={!editable || pending} value={controls.upscaleMode || ''} onChange={(event) => setControls((previous) => ({ ...previous, upscaleMode: event.target.value as 'PRECISE' | 'CREATIVE' }))}><option value="" disabled>Choose a mode</option><option value="PRECISE">Precise · preserve detail</option><option value="CREATIVE">Creative · add detail</option></select><span className="mt-2 block text-xs text-muted-foreground">Upscaling is available only when the complete request has a verified price.</span></label>
            </> : null}
            <fieldset className="space-y-1 md:col-span-2"><legend className="mb-2 text-sm font-medium">Source footage and reference media</legend><div className="grid gap-1 sm:grid-cols-2">{data.assets.map((asset) => <label key={asset.id} className="flex min-h-11 min-w-0 items-center gap-3 text-sm"><input type="checkbox" disabled={!editable || pending} checked={controls.referenceAssetIds.includes(asset.id)} onChange={(event) => setControls((previous) => ({ ...previous, referenceAssetIds: event.target.checked ? [...previous.referenceAssetIds, asset.id] : previous.referenceAssetIds.filter((id) => id !== asset.id) }))} /><span className="break-words">{asset.name}<span className="ml-1 text-xs text-muted-foreground">{asset.mimeType.split('/')[0]}</span></span></label>)}</div></fieldset>
            {(['firstFrameAssetId', 'lastFrameAssetId'] as const).map((field) => <label key={field} className="text-sm font-medium">{field === 'firstFrameAssetId' ? 'First frame' : 'Last frame'}<select className={controlInput} disabled={!editable || pending} value={controls[field]} onChange={(event) => setControls((previous) => ({ ...previous, [field]: event.target.value }))}><option value="">No frame constraint</option>{data.assets.filter((asset) => asset.mimeType.startsWith('image/')).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>)}
            <p className="text-xs leading-5 text-muted-foreground md:col-span-2">These are requirements, not promises of availability. FinalFrame stops if no reviewed model supports the operation, media, audio policy, and spending cap together.</p>
            {editable ? <Button type="submit" disabled={pending}>Save operation requirements</Button> : null}
        </form></details>
        <section aria-label={`${shot.title} takes`} className="space-y-3"><h5 className="text-sm font-semibold">Saved takes</h5>{!shot.takes.length ? <p className="text-sm text-muted-foreground">{data.versionState==='APPROVED'?'No takes yet.':'No takes yet. Approve the plan before starting a generation job.'}</p> : <div className="grid gap-4 lg:grid-cols-2">
            {comparisonSource?.url && <figure className="min-w-0 space-y-3 rounded-xl border border-border p-4">
                <figcaption className="text-sm font-medium">Original source · {comparisonSource.name}</figcaption>
                <video src={comparisonSource.url} controls playsInline preload="none" aria-label="Original source footage" className="max-h-72 w-full rounded-lg bg-black" />
            </figure>}
            {shot.takes.map((take) => <div key={take.id} className="min-w-0 space-y-3 rounded-xl border border-border p-4"><p className="text-sm font-medium">Take {take.versionNumber} · {take.status.toLowerCase()}</p>{take.url && take.mimeType?.startsWith('video/') ? <video src={take.url} controls playsInline preload="metadata" className="max-h-72 w-full rounded-lg bg-black" /> : take.url && take.mimeType?.startsWith('image/') ? <a href={take.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm text-primary underline">View take image</a> : null}{take.url ? <a href={take.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm text-primary underline">Open or download take</a> : <p className="text-xs text-muted-foreground">Media is not available for this take.</p>}{take.provider || take.model ? <p className="break-words text-xs text-muted-foreground">{take.provider} · {take.model}</p> : null}<ApprovalControls data={data} resourceType="shotVersion" resourceId={take.id} state={take.state} /></div>)}</div>}</section>
        {saved ? <p role="status" className="text-sm text-emerald-300">{saved}</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </article>;
}

function GenerationStatus({ productionId, canEdit }: { productionId: string; canEdit: boolean }) {
    const router = useRouter();
    const retry = useMutation(api.generationJobs.retry);
    const [resumingJobId, setResumingJobId] = useState<string | null>(null);
    const [resumeMessage, setResumeMessage] = useState('');
    const [resumeError, setResumeError] = useState('');
    const resumePending = useRef(false);
    const result = useQuery(api.generationJobs.list, { productionId: productionId as Id<'productions'> });
    const jobs = (result || []) as Array<{ _id: string; shotId?: string; status: string; executionStage?: string; progress?: number; errorMessage?: string; provider?: string; providerJobId?: string; model?: string; estimatedProviderCostUsd?: number; providerCostUsd?: number; request?: { operation?: string } }>;
    const canResume = (job: (typeof jobs)[number]) => canEdit && job.provider === 'openrouter' && Boolean(job.providerJobId?.trim()) && job.status === 'FAILED' && job.executionStage !== 'RECONCILIATION_REQUIRED';
    async function resume(job: (typeof jobs)[number]) {
        if (!canResume(job) || resumePending.current) return;
        resumePending.current = true;
        setResumingJobId(job._id); setResumeMessage(''); setResumeError('');
        try {
            await retry({ jobId: job._id as Id<'generationJobs'> });
            router.refresh();
            setResumeMessage('Resume requested for the existing accepted take.');
        } catch {
            setResumeError('Unable to resume this take. Refresh its saved status and check project access.');
        } finally { resumePending.current = false; setResumingJobId(null); }
    }
    if (!jobs.some((job) => job.shotId)) return null;
    return <section className="ff-card space-y-3 p-5" aria-label="Generation job status"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Background generation</h2><Button variant="secondary" size="sm" onClick={() => router.refresh()}>Refresh saved takes</Button></div>{jobs.filter((job) => job.shotId).slice(0, 20).map((job) => <article key={job._id} className="space-y-2 rounded-xl border border-border p-3"><p className="text-sm font-medium">{job.executionStage === 'RECONCILIATION_REQUIRED' ? 'Needs an administrator check; this job will not be purchased again automatically.' : job.status.toLowerCase().replaceAll('_', ' ')}</p><progress className="h-2 w-full" max={100} value={job.progress || 0} aria-label="Persisted generation progress" /><p className="break-words text-xs text-muted-foreground">{job.provider} · {job.model}{typeof job.providerCostUsd === 'number' ? ` · reported provider cost $${job.providerCostUsd.toFixed(4)}` : typeof job.estimatedProviderCostUsd === 'number' ? ` · ${job.request?.operation === 'UPSCALE' ? 'provider cost ceiling' : 'estimated provider cost'} $${job.estimatedProviderCostUsd.toFixed(4)}` : ''}</p>{job.errorMessage ? <p className="text-sm text-destructive">{job.errorMessage}</p> : null}{canResume(job) ? <div className="space-y-2"><Button variant="secondary" size="sm" disabled={resumingJobId !== null} onClick={() => void resume(job)}>{resumingJobId === job._id ? 'Requesting resume…' : 'Resume accepted take'}</Button><p className="text-xs text-muted-foreground">Uses the existing accepted generation. Its saved status and recovery limits are checked again.</p></div> : null}</article>)}{resumeMessage ? <p role="status" className="text-sm text-muted-foreground">{resumeMessage}</p> : null}{resumeError ? <p role="alert" className="text-sm text-destructive">{resumeError}</p> : null}</section>;
}
