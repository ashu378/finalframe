'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowRight, FileText, ImagePlus, Loader2, Mic2, Sparkles, Upload, Video } from 'lucide-react';
import { createProject } from '@/lib/project/actions';
import { approveDirectorPlan, createDirectorPlan, reviseDirectorPlan, type CreateDirectorPlanResult } from '@/lib/production/actions';
import { uploadAsset } from '@/lib/assets/actions';
import { PlanPreview } from '@/components/production/planning';
import { VIDEO_TYPE_LABELS, VIDEO_TYPES } from '@/lib/ai/video-routing';
import { CreationIntentControls } from './creation-intent-controls';
import { legacyVideoTypeForCreatorIntent, parseCreatorIntent, type CreatorIntent } from '@/lib/production/creator-intent';
import { saveProjectCreatorPreference } from '@/lib/production/episode-actions';
import type { VideoType } from '@/lib/ai/video-routing';
import type { TemplateDefaults } from '@/lib/templates/catalog';
import type { PlanningContinuityOptions, SelectedProductionDefaults } from '@/lib/production/episode-actions';
import type { CreateIntent, OutputPreset, ProductionInputMode, ProjectContentType, QualityTier } from '@/lib/types/database';
import { OUTPUT_PRESETS } from '../../../renderer/src/output-presets';

const MODES: Array<{ id: ProductionInputMode; label: string; description: string; icon: typeof Sparkles }> = [
    { id: 'IDEA', label: 'Start with an idea', description: 'Tell us about a story, ad, cartoon, or product video.', icon: Sparkles },
    { id: 'SCRIPT', label: 'Paste a script', description: 'Bring dialogue or a rough outline and we will shape the visuals.', icon: FileText },
    { id: 'VOICE', label: 'Bring your voice', description: 'Use an optional recording as the timing and feeling guide.', icon: Mic2 },
    { id: 'IMAGES', label: 'Bring images', description: 'Use characters, products, logos, or references.', icon: ImagePlus },
    { id: 'FOOTAGE', label: 'Bring footage', description: 'Shape clips into a clearer story with captions.', icon: Video },
    { id: 'AD', label: 'Make an ad', description: 'Create a short promotion for a product or service.', icon: Sparkles },
];

type SuccessfulPlan = Extract<CreateDirectorPlanResult, { success: true }> & { projectId: string; inputAssetIds: string[] };

export function CreateProductionForm({ studioId, existingProjectId, productionId, continuityOptions, initialMode, templateDefaults, productionDefaults, initialCreatorIntent }: { initialCreatorIntent?: CreatorIntent; studioId?: string; existingProjectId?: string; productionId?: string; initialMode?: ProductionInputMode; templateDefaults?: TemplateDefaults; productionDefaults?: SelectedProductionDefaults; continuityOptions?: PlanningContinuityOptions }) {
    const router = useRouter();
    const [creatorIntent,setCreatorIntent]=useState<CreatorIntent>(initialCreatorIntent??productionDefaults?.creatorIntent??{version:1,path:'CREATE_VIDEO',involvement:'KEY_STAGE_REVIEW',videoKind:'CINEMATIC',visualStyle:{id:'REALISTIC'}});
    const [useCreatorIntent,setUseCreatorIntent]=useState(Boolean(initialCreatorIntent||productionDefaults?.creatorIntent||!productionDefaults&&!templateDefaults));
    function changeCreatorIntent(value:CreatorIntent){setCreatorIntent(value);setUseCreatorIntent(true);setVideoType(legacyVideoTypeForCreatorIntent(value));if(value.path==='IMPROVE_FOOTAGE')setMode('FOOTAGE');}

    const [mode, setMode] = useState<ProductionInputMode>(initialCreatorIntent?.path==='IMPROVE_FOOTAGE'?'FOOTAGE':productionDefaults?.mode ?? initialMode ?? templateDefaults?.mode ?? 'IDEA');
    const [name, setName] = useState(productionDefaults ? '' : templateDefaults?.name ?? '');
    const [prompt, setPrompt] = useState(productionDefaults?.brief ?? templateDefaults?.brief ?? '');
    const [videoType, setVideoType] = useState<VideoType>(initialCreatorIntent?legacyVideoTypeForCreatorIntent(initialCreatorIntent):productionDefaults?.videoType ?? templateDefaults?.videoType ?? 'CINEMATIC_FILM');
    const [duration, setDuration] = useState(productionDefaults?.durationSeconds ?? templateDefaults?.durationSeconds ?? 30);
    const [outputPreset, setOutputPreset] = useState<OutputPreset>(productionDefaults?.outputPreset ?? templateDefaults?.outputPreset ?? 'SOCIAL_VERTICAL');
    const [qualityTier, setQualityTier] = useState<QualityTier>('STANDARD');
    const [files, setFiles] = useState<File[]>([]);
    const [retainedInputIds,setRetainedInputIds]=useState<string[]>(productionDefaults?.inputAssets?.map(asset=>asset.id)??[]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [planError, setPlanError] = useState('');
    const [plan, setPlan] = useState<SuccessfulPlan | null>(null);
    const [continuityChoice, setContinuityChoice] = useState('');
    const selectedBible = continuityOptions?.bibles.find((bible) => bible.id === continuityChoice);
    function reportPlanError(message: string) { setPlanError(message); toast.error(message); }

    async function requestPlan(options?: { existingProjectId?: string; inputAssetIds?: string[]; revision?: string }) {
        if (continuityOptions?.selectionError) { reportPlanError(continuityOptions.selectionError); return; }
        if (continuityOptions?.requiresBible && !continuityChoice && !plan?.continuityBibleId) { reportPlanError('Choose an approved continuity bible or explicitly start blank for this episode.'); return; }
        if(useCreatorIntent&&creatorIntent.path==='FOCUSED_TOOL'&&!creatorIntent.tool){reportPlanError('Choose a focused operation before preparing its plan.');return;}
        if(productionDefaults?.inputSourcesError){reportPlanError(productionDefaults.inputSourcesError);return;}
        if(useCreatorIntent&&creatorIntent.path==='IMPROVE_FOOTAGE'&&!files.some(file=>file.type.startsWith('video/'))&&!productionDefaults?.inputAssets?.some(asset=>retainedInputIds.includes(asset.id)&&asset.mimeType.startsWith('video/'))){reportPlanError('Add the footage you want to improve. Your original clips remain retained.');return;}
        const brief = prompt.trim();
        const hasMediaInput = files.length > 0;
        if (!options?.existingProjectId && brief.length < 10 && !hasMediaInput) {
            reportPlanError(mode === 'VOICE' ? 'Add a voice recording or tell us a little about the video first.' : 'Add some detail or bring a piece of media to start the plan.');
            return;
        }
        if (files.length > 0 && !studioId && !options?.existingProjectId) {
            reportPlanError('Your studio is still loading. Please try again in a moment.');
            return;
        }

        setIsSubmitting(true);
        setPlanError('');
        let safeFailure: string | undefined;
        try {
            let projectId = options?.existingProjectId || existingProjectId;
            let inputAssetIds = [...(options?.inputAssetIds ?? retainedInputIds)];
            if (!projectId) {
                const contentType: ProjectContentType = mode === 'AD' ? 'commercial' : mode === 'FOOTAGE' ? 'ugc' : mode === 'SCRIPT' ? 'explainer' : 'commercial';
                const project = await createProject({ name: name.trim() || 'Untitled video', contentType, videoType, description: brief || 'A video shaped around the media you supplied.', outcomeGoal: mode === 'AD' ? 'convert_sales' : 'get_attention' });
                if (!project.success || !project.projectId) { safeFailure = project.error || 'Could not create your project'; throw new Error('Project creation failed'); }
                projectId = project.projectId;
            }
            if (files.length > 0 && studioId && !options?.inputAssetIds) {
                    for (const file of files) {
                        const formData = new FormData();
                        formData.append('file', file);
                        const upload = await uploadAsset(studioId, formData, `/productions/${projectId}`);
                        if (!upload.success || !upload.asset) { safeFailure = upload.error || 'Could not upload the selected media'; throw new Error('Media upload failed'); }
                        inputAssetIds.push(upload.asset.id);
                    }
            }

            if(useCreatorIntent){const preference=await saveProjectCreatorPreference(projectId,parseCreatorIntent(creatorIntent)!);if(!preference.success){safeFailure=preference.error;throw new Error('Preference save failed');}}
            const intent: CreateIntent = {
                ...(useCreatorIntent?{creatorIntent:parseCreatorIntent(creatorIntent)}:{}),
                projectId,
                productionId: plan?.productionId || productionId,
                continuityBibleId: plan?.continuityBibleId || (continuityChoice && continuityChoice !== 'NEW_BLANK_BIBLE' ? continuityChoice : undefined),
                continuityMode: continuityChoice === 'NEW_BLANK_BIBLE' && !plan?.continuityBibleId ? 'NEW_BLANK_BIBLE' : continuityChoice || plan?.continuityBibleId ? 'USE_APPROVED_BIBLE' : undefined,
                videoType:useCreatorIntent?legacyVideoTypeForCreatorIntent(creatorIntent):videoType,
                mode,
                prompt: mode === 'SCRIPT' ? undefined : brief || undefined,
                script: mode === 'SCRIPT' ? brief : undefined,
                inputAssetIds,
                requestedDurationSeconds: duration,
                outputPreset,
                qualityTier,
                language: productionDefaults?.language,
                workflow: productionDefaults?.workflow ?? (mode === 'AD' ? 'BUSINESS_AD' : mode === 'FOOTAGE' ? 'FOOTAGE_TRANSFORM' : mode === 'VOICE' ? 'COMEDY' : 'SOCIAL'),
            };
            const result = options?.revision ? await reviseDirectorPlan(intent, options.revision) : await createDirectorPlan(intent);
            if (!result.success) { safeFailure = result.error || 'Could not create your plan'; throw new Error('Planning failed'); }
            setPlan({ ...result, projectId, inputAssetIds });
            if (result.continuityBibleId) setContinuityChoice(result.continuityBibleId);
            toast.success(options?.revision ? 'Your revised plan is ready to review.' : 'Your plan is ready to review.');
            if (result.warning) toast.info(result.warning);
        } catch {
            reportPlanError(safeFailure || 'We could not prepare your plan. Your brief and selected references are still here. Check the connection and try again when ready.');
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleApprove() {
        if (!plan?.planId) return;
        setIsSubmitting(true);
        const result = await approveDirectorPlan(plan.planId);
        setIsSubmitting(false);
        if (!result.success) {
            reportPlanError(result.error || 'Could not approve the plan');
            return;
        }
        toast.success('Plan approved. Your video is ready for the making stage.');
        router.push(`/dashboard/projects/${plan.projectId}/workspace/overview?production=${encodeURIComponent(plan.productionId)}`);
    }

    if (plan) {
        return <div className="space-y-4">{planError ? <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{planError}</p> : null}<PlanPreview projectId={plan.projectId} productionId={plan.productionId} creatorIntent={useCreatorIntent?creatorIntent:undefined} castReferencesRequired={Boolean(plan.plan.bible.characters?.length)} referenceSetupHref={`/dashboard/projects/${encodeURIComponent(plan.projectId)}/workspace/media?production=${encodeURIComponent(plan.productionId)}#guided-character-setup`} referenceBindingHref={`/dashboard/projects/${encodeURIComponent(plan.projectId)}/workspace/storyboard?production=${encodeURIComponent(plan.productionId)}#draft-cast-bindings`} preview={plan.planningPreview} balance={plan.balance} outputPreset={outputPreset} qualityTier={qualityTier} isSubmitting={isSubmitting} onBack={() => setPlan(null)} onRevise={(revision) => requestPlan({ existingProjectId: plan.projectId, inputAssetIds: plan.inputAssetIds, revision })} onApprove={handleApprove} /></div>;
    }

    return (
        <div className="space-y-8">
            <div className="rounded-2xl border border-border/70 bg-secondary/35 px-4 py-3 text-sm leading-6 text-muted-foreground"><span className="font-semibold text-foreground">Start your way.</span> An idea or script is enough. Voice, images, footage, and other media are optional ways to give the plan more to work with.</div>
            <CreationIntentControls value={creatorIntent} onChange={changeCreatorIntent} disabled={isSubmitting}/>{!useCreatorIntent?<p className="text-sm text-muted-foreground">This saved production keeps its existing workflow until you deliberately change the creation choices above.</p>:null}
            <details open={!useCreatorIntent}><summary className="min-h-11 cursor-pointer text-sm font-semibold">Starting material · {MODES.find(item=>item.id===mode)?.label}</summary><p className="mb-3 text-sm text-muted-foreground">Ideas, scripts and supplied media are inputs to the same project, rather than separate products.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{MODES.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} onClick={() => setMode(item.id)} aria-pressed={mode === item.id} className={`rounded-[1.15rem] border p-5 text-left transition hover:-translate-y-0.5 ${mode === item.id ? 'border-primary bg-[#151b25] shadow-[0_15px_35px_-25px_hsl(38_86%_48%_/_0.9)]' : 'border-border bg-card hover:bg-secondary/45'}`}><span className={`grid size-10 place-items-center rounded-xl ${mode === item.id ? 'bg-[#86a7ff]' : 'bg-secondary'}`}><Icon className="size-5" aria-hidden="true" /></span><span className="mt-8 block font-semibold">{item.label}</span><span className="mt-2 block text-sm leading-6 text-muted-foreground">{item.description}</span></button>; })}</div></details>
            <div className="ff-card space-y-7 p-6 sm:p-8">
                {productionDefaults?.inputAssets?.length?<fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-1 text-sm font-semibold">Retained production inputs</legend><p className="text-xs leading-5 text-muted-foreground">These exact inputs were saved on this production. Keep them or deliberately remove them from the new draft. Originals and approved versions remain retained; availability and approval are checked before generation.</p>{productionDefaults.inputAssets.map(asset=><label key={asset.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" aria-label={`Retain ${asset.name}`} checked={retainedInputIds.includes(asset.id)} onChange={event=>setRetainedInputIds(current=>event.target.checked?[...current,asset.id]:current.filter(id=>id!==asset.id))}/><span>{asset.name} · {asset.mimeType}</span></label>)}</fieldset>:null}
                {productionDefaults?.inputSourcesError?<p role="alert" className="text-sm text-destructive">{productionDefaults.inputSourcesError}</p>:null}
                {existingProjectId && continuityOptions ? <section aria-label="Project reference guidance" className="space-y-2 rounded-xl border border-border bg-secondary/30 p-4">
                    <h2 className="text-sm font-semibold">{continuityOptions.requiresBible ? 'Continue this project' : 'Plan with project references'}</h2>
                    <p className="text-sm leading-6 text-muted-foreground">Choose approved project references to reuse a character, voice, or visual style. In your brief, describe what happens in this video and any changes to outfits, locations, or supporting characters.</p>
                    <Link className="ff-link inline-flex min-h-11 items-center text-sm" href={`/dashboard/projects/${encodeURIComponent(existingProjectId)}/workspace/media${productionId ? `?production=${encodeURIComponent(productionId)}` : ''}`}>Manage project characters, voices, and references</Link>
                    <p className="text-xs leading-5 text-muted-foreground">Create an original character or upload your own reference in the project media workspace. Review and approve its version before adding it to an approved continuity bible. Earlier approved episodes keep their saved versions.</p>
                </section> : null}
                {continuityOptions ? <div><label htmlFor="production-continuity" className="text-sm font-semibold">Project continuity {continuityOptions.requiresBible ? '(required for this episode)' : '(optional)'}</label><p className="mt-1 text-sm leading-6 text-muted-foreground">Use exact approved character, voice, location, and style references, or deliberately start with no identity defaults.</p><select id="production-continuity" value={continuityChoice} onChange={(event) => setContinuityChoice(event.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">{continuityOptions.requiresBible ? 'Choose continuity for this episode' : 'No bible for this standalone production'}</option>{continuityOptions.bibles.map((bible) => <option key={bible.id} value={bible.id}>Approved project bible · version {bible.versionNumber}</option>)}{continuityChoice && continuityChoice !== 'NEW_BLANK_BIBLE' && !continuityOptions.bibles.some((bible) => bible.id === continuityChoice) ? <option value={continuityChoice}>Selected project continuity bible</option> : null}<option value="NEW_BLANK_BIBLE">Start an explicitly blank project bible</option></select>{continuityOptions.selectionError ? <p role="alert" className="mt-2 text-sm text-destructive">{continuityOptions.selectionError}</p> : null}</div> : null}
                {selectedBible ? <section aria-label="Selected approved project references" className="space-y-2 rounded-xl border border-border p-4 text-sm">
                    <h3 className="font-semibold">Using approved bible version {selectedBible.versionNumber}</h3>
                    <p>{selectedBible.referenceCount} saved reference{selectedBible.referenceCount === 1 ? '' : 's'} · {selectedBible.ruleCount} continuity rule{selectedBible.ruleCount === 1 ? '' : 's'}</p>
                    {selectedBible.storyPreview ? <p className="leading-6 text-muted-foreground">Story: {selectedBible.storyPreview}</p> : null}
                    {selectedBible.visualStylePreview ? <p className="leading-6 text-muted-foreground">Visual style: {selectedBible.visualStylePreview}</p> : null}
                    {selectedBible.rulePreview.length ? <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{selectedBible.rulePreview.map((rule, index) => <li key={index}>{rule}</li>)}</ul> : null}
                    {selectedBible.ruleCount > selectedBible.rulePreview.length ? <p className="text-xs text-muted-foreground">Showing the first {selectedBible.rulePreview.length} rules. The planner receives the complete selected bible.</p> : null}
                </section> : continuityChoice === 'NEW_BLANK_BIBLE' ? <p role="status" className="text-sm text-muted-foreground">This bible starts without saved character, voice, or brand references. Accepted story history can still inform the episode.</p> : null}
                <div><label htmlFor="production-name" className="text-sm font-semibold">Name your video <span className="font-normal text-muted-foreground">(optional)</span></label><input id="production-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. A funny launch video for my bakery" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary" /></div>
                {!useCreatorIntent?<div><label htmlFor="production-video-type" className="text-sm font-semibold">What kind of video are you making?</label><p className="mt-1 text-sm text-muted-foreground">FinalFrame uses this to choose the right video or graphics workflow.</p><select id="production-video-type" value={videoType} onChange={(event) => setVideoType(event.target.value as VideoType)} className="mt-3 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{VIDEO_TYPES.map((type) => <option key={type} value={type}>{VIDEO_TYPE_LABELS[type]}</option>)}</select></div>:<p className="text-sm text-muted-foreground">Your video type and visual style are saved separately. FinalFrame resolves a compatible production recipe and shows its cost before work starts. No global identity is selected.</p>}
                <div><label htmlFor="production-brief" className="text-sm font-semibold">{mode === 'SCRIPT' ? 'Paste your script' : 'Tell us what you want to make'}</label><p className="mt-1 text-sm text-muted-foreground">{mode === 'VOICE' ? 'Optional when you upload a recording. Add context if you have it.' : 'Write it like you would explain it to a creative friend.'}</p><textarea id="production-brief" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === 'SCRIPT' ? 'Paste your script here…' : mode === 'VOICE' ? 'Optional context: what is happening in this performance?' : 'Make a warm 30-second video about…'} className="mt-3 min-h-44 w-full resize-y rounded-xl border border-border bg-background p-4 text-sm leading-7 outline-none focus:border-primary" /></div>
                <div className="grid gap-4 sm:grid-cols-3"><div><label htmlFor="production-duration" className="text-sm font-semibold">Length</label><select id="production-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{![4, 8, 15, 30, 60].includes(duration) ? <option value={duration}>{duration} seconds</option> : null}<option value={4}>4 seconds · quick test</option><option value={8}>8 seconds · short clip</option><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option></select></div><div><label htmlFor="production-output" className="text-sm font-semibold">Where it will go</label><select id="production-output" value={outputPreset} onChange={(event) => setOutputPreset(event.target.value as OutputPreset)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{outputPreset === 'SOCIAL_VERTICAL' ? <option value="SOCIAL_VERTICAL">Vertical · 9:16 (saved format)</option> : null}{OUTPUT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} · {preset.aspectRatio}</option>)}</select></div><div><label htmlFor="production-quality" className="text-sm font-semibold">Finish level</label><select id="production-quality" value={qualityTier} onChange={(event) => setQualityTier(event.target.value as QualityTier)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="ECONOMY">Quick draft</option><option value="STANDARD">Standard</option><option value="PREMIUM">Polished</option></select></div></div>
                <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/30 px-4 text-sm text-muted-foreground transition hover:border-primary hover:bg-secondary/60"><Upload className="size-5 shrink-0" aria-hidden="true" /><span>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} ready to use` : 'Add a logo, photo, clip, voice note, or reference (optional)'}</span><input type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label>
                <button type="button" onClick={() => requestPlan()} disabled={isSubmitting} className="ff-button-primary min-h-12 w-full">{isSubmitting ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-5" aria-hidden="true" />} Show me the plan</button>
                {planError ? <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{planError}</p> : null}
            </div>
        </div>
    );
}
