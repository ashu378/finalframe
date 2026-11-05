'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ApprovalControls, controlInput } from './resource-approval-controls';
import { buildWorkspaceTimelineManifest, createWorkspaceTimeline } from '@/lib/production/workspace-actions';
import { validateCompositionAudioTracks } from '@/lib/production/workspace-controls';
import {GraphicDesigner,emptyGraphicDraft} from './graphic-designer';
import {parseGraphicsV2Authoring} from '../../../renderer/src/templates/graphics-v2-contract';
import { SoundtrackEditor, type SoundtrackEntry } from './soundtrack-editor';
import type { CompositionClip, WorkspaceControlData } from '@/lib/production/workspace-controls';
import { OUTPUT_PRESETS, OUTPUT_FPS, outputFormatLabel } from '../../../renderer/src/output-presets';

type ClipEntry = { id: string; label: string; durationSeconds: number; clip: CompositionClip };
const approved = (state: string) => state === 'APPROVED' || state === 'LOCKED';
const outputPresets = [
    { id: 'small-landscape', label: 'Small landscape · 320 × 180', width: 320, height: 180 },
    { id: 'landscape-720', label: 'Landscape · 1280 × 720', width: 1280, height: 720 },
    ...OUTPUT_PRESETS.map(preset=>({...preset,label:`${preset.label} · ${preset.aspectRatio} · ${preset.width} × ${preset.height}`})),
];
function timelineFormat(timeline: WorkspaceControlData['timelines'][number]) {
    return `${outputFormatLabel(timeline.outputPreset,timeline.width,timeline.height)}${timeline.width&&timeline.height?` · ${timeline.width}×${timeline.height}`:''}`;
}

export function TimelineComposer({ data }: { data: WorkspaceControlData }) {
    const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState(''); const [message, setMessage] = useState('');
    const [entries, setEntries] = useState<ClipEntry[]>([]); const [takeId, setTakeId] = useState(''); const [assetId, setAssetId] = useState(''); const [assetDuration, setAssetDuration] = useState(4);
    const [template, setTemplate] = useState<'kinetic-title' | 'brand-card' | 'feature-callout' | 'end-card'>('brand-card'); const [title, setTitle] = useState(''); const [subtitle, setSubtitle] = useState(''); const [brand, setBrand] = useState(''); const [logo, setLogo] = useState(''); const [graphicDuration, setGraphicDuration] = useState(4);
    const [graphic,setGraphic]=useState(emptyGraphicDraft);
    const [soundtrack, setSoundtrack] = useState<SoundtrackEntry[]>([]);
    const [outputPreset, setOutputPreset] = useState('');
    const [outputFps, setOutputFps] = useState<24 | 25 | 30 | 50 | 60>(30);
    const takes = data.scenes.flatMap((scene) => scene.shots.flatMap((shot) => shot.takes.filter((take) => approved(take.state) && take.assetId).map((take) => ({ id: take.id, assetId: take.assetId, label: `${scene.title} / ${shot.title} · take ${take.versionNumber}`, durationSeconds: shot.durationSeconds }))));
    const selectedTake = takes.find((take) => take.id === takeId);
    const selectedTakeAsset = selectedTake && data.assets.find((asset) => asset.id === selectedTake.assetId);
    const takeNeedsMediaApproval = Boolean(selectedTakeAsset && !approved(selectedTakeAsset.state));
    const mediaHref = `/dashboard/projects/${encodeURIComponent(data.projectExternalId)}/workspace/media?production=${encodeURIComponent(data.productionId)}`;
    const assets = data.assets.filter((asset) => approved(asset.state)); const total = entries.reduce((sum, entry) => sum + entry.durationSeconds, 0);
    const editable = data.canEdit && data.versionState === 'APPROVED';
    function add(label: string, durationSeconds: number, clip: CompositionClip) {
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || total + durationSeconds > 60 || entries.length >= 200) { setError('Choose positive clip lengths totaling no more than 60 seconds.'); return; }
        setError(''); setEntries((previous) => [...previous, { id: crypto.randomUUID(), label, durationSeconds, clip }]);
    }
    function move(index: number, direction: -1 | 1) { setEntries((previous) => { const copy = [...previous]; const next = index + direction; if (next < 0 || next >= copy.length) return copy; [copy[index], copy[next]] = [copy[next], copy[index]]; return copy; }); }
    function run(action: () => Promise<{ success: boolean; error?: string }>, success: string) {
        start(async () => { setError(''); setMessage(''); try { const result = await action(); if (!result.success) setError(result.error || 'The timeline could not be saved.'); else { setMessage(success); router.refresh(); } } catch { setError('The timeline could not be saved. Please try again.'); } });
    }
    return <section className="ff-card space-y-6 p-5 sm:p-7" aria-label="Compose a timeline"><div><h2 className="text-2xl font-semibold">Build the first timeline</h2><p className="mt-2 text-sm text-muted-foreground">Explicitly choose approved takes, your project media, or designed titles. Reorder the list, then save a draft for review. This does not purchase AI generation or start a render.</p></div>
        {!editable ? <p role="status" className="text-sm text-amber-300">Approve the current production plan before creating its timeline. Reviewers can inspect and approve existing timeline drafts below.</p> : <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-border p-4">
                    <label className="block text-sm font-medium">
                        Approved shot take
                        <select aria-label="Approved shot take" className={controlInput} value={takeId} onChange={(event) => setTakeId(event.target.value)}>
                            <option value="">Choose one take</option>
                            {takes.map((take) => <option key={take.id} value={take.id}>{take.label}</option>)}
                        </select>
                    </label>
                    {takeNeedsMediaApproval && <p role="status" className="text-sm text-amber-300">
                        Approve this take’s source asset before adding it to the timeline. <Link className="underline" href={mediaHref}>Review source in Media</Link>
                    </p>}
                    <Button variant="secondary" size="sm" disabled={!selectedTake || takeNeedsMediaApproval || pending} onClick={() => {
                        if (selectedTake && !takeNeedsMediaApproval) add(selectedTake.label, selectedTake.durationSeconds, { kind: 'TAKE', shotVersionId: selectedTake.id });
                    }}>Add selected take</Button>
                </div>
                <div className="space-y-3 rounded-xl border border-border p-4"><label className="block text-sm font-medium">Approved project footage or image<select aria-label="Approved project footage or image" className={controlInput} value={assetId} onChange={(event) => setAssetId(event.target.value)}><option value="">Choose project media</option>{assets.filter((asset) => /^(video|image)\//.test(asset.mimeType)).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><label className="block text-sm font-medium">Clip length in seconds<input type="number" min={0.1} max={60} step={0.1} className={controlInput} value={assetDuration} onChange={(event) => setAssetDuration(Number(event.target.value))} /></label><Button variant="secondary" size="sm" disabled={!assetId || pending} onClick={() => { const asset = assets.find((entry) => entry.id === assetId); if (asset) add(asset.name, assetDuration, { kind: 'ASSET', assetId, durationSeconds: assetDuration }); }}>Add project clip</Button></div></div>
            {data.graphicsV2Enabled?<section className="space-y-4 rounded-xl border border-border p-4" aria-label="Designed graphics"><h3 className="font-semibold">Designed graphics · exact content</h3><GraphicDesigner value={graphic} onChange={setGraphic} images={assets.filter(a=>a.mimeType.startsWith('image/'))} disabled={pending}/><label className="grid gap-1 text-sm">Graphic length in seconds<input type="number" min={0.1} max={60} step={0.1} value={graphicDuration} className={controlInput} onChange={e=>setGraphicDuration(Number(e.target.value))}/></label><Button type="button" variant="secondary" disabled={pending} onClick={()=>{try{const spec=parseGraphicsV2Authoring(graphic,Math.round(graphicDuration*outputFps),outputFps);add(graphic.props.title,graphicDuration,{kind:'GRAPHIC',...graphic,props:spec.props,durationSeconds:graphicDuration});}catch(error){setError(error instanceof Error?error.message:'Check graphic content.');}}}>Add exact graphic</Button></section>:<fieldset className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">Designed graphics · exact text and project logo</legend><label className="text-sm font-medium">Card design<select aria-label="Card design" className={controlInput} value={template} onChange={(event) => setTemplate(event.target.value as typeof template)}><option value="brand-card">Product or brand introduction</option><option value="kinetic-title">Animated title</option><option value="feature-callout">Feature callout</option><option value="end-card">Closing card</option></select></label><label className="text-sm font-medium">Graphic length in seconds<input type="number" min={0.1} max={60} step={0.1} value={graphicDuration} className={controlInput} onChange={(event) => setGraphicDuration(Number(event.target.value))} /></label>
                <label className="text-sm font-medium">Exact title<input maxLength={200} className={controlInput} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="text-sm font-medium">Supporting text<input maxLength={500} className={controlInput} value={subtitle} onChange={(event) => setSubtitle(event.target.value)} /></label><label className="text-sm font-medium">Project brand name · optional<input maxLength={160} className={controlInput} value={brand} onChange={(event) => setBrand(event.target.value)} /></label><label className="text-sm font-medium">Approved project logo · optional<select aria-label="Approved project logo · optional" className={controlInput} value={logo} disabled={template === 'kinetic-title'} onChange={(event) => setLogo(event.target.value)}><option value="">No logo</option>{assets.filter((asset) => asset.mimeType.startsWith('image/')).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
                <Button variant="secondary" size="sm" disabled={!title.trim() || pending} onClick={() => add(title.trim(), graphicDuration, { kind: 'GRAPHIC', templateId: template, durationSeconds: graphicDuration, props: { title: title.trim(), subtitle, brandName: brand, ...(template === 'feature-callout' ? { feature: title.trim(), detail: subtitle } : {}) }, ...(logo && template !== 'kinetic-title' ? { logoAssetId: logo } : {}) })}>Add designed card</Button>
            </fieldset>}
            <section aria-label="Ordered timeline clips" className="space-y-3"><h3 className="font-semibold">Clip order · {total.toFixed(1)} / 60 seconds</h3>{!entries.length ? <p className="text-sm text-muted-foreground">Nothing is selected automatically. Add the exact media you want in this export.</p> : <ol className="space-y-2">{entries.map((entry, index) => <li key={entry.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words text-sm">{index + 1}. {entry.label}</p><p className="text-xs text-muted-foreground">{entry.durationSeconds} seconds · {entry.clip.kind.toLowerCase()}</p></div><div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" disabled={index === 0 || pending} onClick={() => move(index, -1)} aria-label={`Move clip ${index + 1} earlier`}>Earlier</Button><Button variant="ghost" size="sm" disabled={index === entries.length - 1 || pending} onClick={() => move(index, 1)} aria-label={`Move clip ${index + 1} later`}>Later</Button><Button variant="ghost" size="sm" disabled={pending} onClick={() => setEntries((previous) => previous.filter((item) => item.id !== entry.id))} aria-label={`Remove clip ${index + 1}`}>Remove</Button></div></li>)}</ol>}</section>
            <SoundtrackEditor entries={soundtrack} assets={assets} disabled={pending} totalSeconds={total} onChange={setSoundtrack} />
            <fieldset className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2" disabled={pending}>
                <legend className="px-1 text-sm font-semibold">Output settings</legend>
                <label className="text-sm font-medium">Video size<select aria-label="Video size" className={controlInput} value={outputPreset} onChange={(event) => setOutputPreset(event.target.value)}><option value="">Project format</option>{outputPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
                <label className="text-sm font-medium">Frames per second<select aria-label="Frames per second" className={controlInput} value={outputFps} onChange={(event) => setOutputFps(Number(event.target.value) as typeof outputFps)}>{OUTPUT_FPS.map((fps) => <option key={fps} value={fps}>{fps} fps</option>)}</select></label>
                <p className="text-sm text-muted-foreground sm:col-span-2">A smaller output uses less rendering time and storage. These settings belong to this new timeline version.</p>
            </fieldset>
            <Button disabled={pending || !entries.length || total > 60} onClick={() => { const audioTracks = soundtrack.map(entry => entry.track); try { validateCompositionAudioTracks(audioTracks, total); } catch (failure) { setError(failure instanceof Error ? failure.message : "Check the audio timing."); return; } const selectedOutput = outputPresets.find((preset) => preset.id === outputPreset); run(() => createWorkspaceTimeline({ projectExternalId: data.projectExternalId, productionId: data.productionId, versionId: data.versionId!, requestId: crypto.randomUUID(), clips: entries.map((entry) => entry.clip), audioTracks, fps: outputFps, ...(selectedOutput ? { outputSettings: { width: selectedOutput.width, height: selectedOutput.height } } : {}) }), "Draft timeline saved. Review its media and approve the exact version below."); }}>Create draft timeline</Button>
        </div>}
        <section className="space-y-3" aria-label="Timeline versions"><h3 className="font-semibold">Saved timeline versions</h3>{data.timelines.map((timeline) => <article key={timeline.id} className="space-y-3 rounded-xl border border-border p-4"><h4 className="font-medium">Timeline version {timeline.versionNumber} · {timelineFormat(timeline)}</h4>{!timeline.matchesProductionVersion ? <p className="text-xs text-muted-foreground">Historical or unbound timeline · read-only. Its media and approval history are retained. State: {timeline.state.toLowerCase().replaceAll('_', ' ')}.</p> : <ApprovalControls data={data} resourceType="timeline" resourceId={timeline.id} state={timeline.state} />}{data.canEdit && timeline.matchesProductionVersion && approved(timeline.state) ? <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => buildWorkspaceTimelineManifest({ projectExternalId: data.projectExternalId, productionId: data.productionId, timelineId: timeline.id }), 'Canonical assembly manifest saved. Rendering is a separate asynchronous operation.')}>Build canonical manifest</Button> : null}</article>)}</section>
        {message ? <p role="status" className="text-sm text-emerald-300">{message}</p> : null}{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>;
}
