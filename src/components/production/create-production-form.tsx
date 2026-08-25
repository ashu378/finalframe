'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, FileText, ImagePlus, Loader2, Mic2, Sparkles, Upload, Video } from 'lucide-react';
import { createProject } from '@/lib/project/actions';
import { approveDirectorPlan, createDirectorPlan, reviseDirectorPlan, type CreateDirectorPlanResult } from '@/lib/production/actions';
import { uploadAsset } from '@/lib/assets/actions';
import { PlanPreview } from '@/components/production/planning';
import type { CreateIntent, OutputPreset, ProductionInputMode, ProjectContentType, QualityTier } from '@/lib/types/database';

const MODES: Array<{ id: ProductionInputMode; label: string; description: string; icon: typeof Sparkles }> = [
    { id: 'IDEA', label: 'Start with an idea', description: 'Tell us about a story, ad, cartoon, or product video.', icon: Sparkles },
    { id: 'SCRIPT', label: 'Paste a script', description: 'Bring dialogue or a rough outline and we will shape the visuals.', icon: FileText },
    { id: 'VOICE', label: 'Bring your voice', description: 'Use an optional recording as the timing and feeling guide.', icon: Mic2 },
    { id: 'IMAGES', label: 'Bring images', description: 'Use characters, products, logos, or references.', icon: ImagePlus },
    { id: 'FOOTAGE', label: 'Bring footage', description: 'Shape clips into a clearer story with captions.', icon: Video },
    { id: 'AD', label: 'Make an ad', description: 'Create a short promotion for a product or service.', icon: Sparkles },
];

type SuccessfulPlan = Extract<CreateDirectorPlanResult, { success: true }> & { projectId: string; inputAssetIds: string[] };

export function CreateProductionForm({ studioId }: { studioId?: string }) {
    const router = useRouter();
    const [mode, setMode] = useState<ProductionInputMode>('IDEA');
    const [name, setName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [duration, setDuration] = useState(30);
    const [outputPreset, setOutputPreset] = useState<OutputPreset>('SOCIAL_VERTICAL');
    const [qualityTier, setQualityTier] = useState<QualityTier>('STANDARD');
    const [files, setFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [plan, setPlan] = useState<SuccessfulPlan | null>(null);

    async function requestPlan(options?: { existingProjectId?: string; inputAssetIds?: string[]; revision?: string }) {
        const brief = prompt.trim();
        const hasMediaInput = files.length > 0;
        if (!options?.existingProjectId && brief.length < 10 && !hasMediaInput) {
            toast.error(mode === 'VOICE' ? 'Add a voice recording or tell us a little about the video first.' : 'Add some detail or bring a piece of media to start the plan.');
            return;
        }
        if (files.length > 0 && !studioId && !options?.existingProjectId) {
            toast.error('Your studio is still loading. Please try again in a moment.');
            return;
        }

        setIsSubmitting(true);
        try {
            let projectId = options?.existingProjectId;
            let inputAssetIds = options?.inputAssetIds || [];
            if (!projectId) {
                const contentType: ProjectContentType = mode === 'AD' ? 'commercial' : mode === 'FOOTAGE' ? 'ugc' : mode === 'SCRIPT' ? 'explainer' : 'commercial';
                const project = await createProject({ name: name.trim() || 'Untitled video', contentType, description: brief || 'A video shaped around the media you supplied.', outcomeGoal: mode === 'AD' ? 'convert_sales' : 'get_attention' });
                if (!project.success || !project.projectId) throw new Error(project.error || 'Could not create your project');
                projectId = project.projectId;
                if (files.length > 0 && studioId) {
                    for (const file of files) {
                        const formData = new FormData();
                        formData.append('file', file);
                        const upload = await uploadAsset(studioId, formData, `/productions/${projectId}`);
                        if (!upload.success || !upload.asset) throw new Error(upload.error || `Could not upload ${file.name}`);
                        inputAssetIds.push(upload.asset.id);
                    }
                }
            }

            const intent: CreateIntent = {
                projectId,
                mode,
                prompt: mode === 'SCRIPT' ? undefined : brief || undefined,
                script: mode === 'SCRIPT' ? brief : undefined,
                inputAssetIds,
                requestedDurationSeconds: duration,
                outputPreset,
                qualityTier,
                workflow: mode === 'AD' ? 'BUSINESS_AD' : mode === 'FOOTAGE' ? 'FOOTAGE_TRANSFORM' : mode === 'VOICE' ? 'COMEDY' : 'SOCIAL',
            };
            const result = options?.revision ? await reviseDirectorPlan(intent, options.revision) : await createDirectorPlan(intent);
            if (!result.success) throw new Error(result.error || 'Could not create your plan');
            setPlan({ ...result, projectId, inputAssetIds });
            toast.success(options?.revision ? 'Your revised plan is ready to review.' : 'Your plan is ready to review.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Something went wrong');
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
            toast.error(result.error || 'Could not approve the plan');
            return;
        }
        toast.success('Plan approved. Your video is ready for the making stage.');
        router.push(`/dashboard/projects/${plan.projectId}`);
    }

    if (plan) {
        return <PlanPreview preview={plan.planningPreview} balance={plan.balance} outputPreset={outputPreset} qualityTier={qualityTier} isSubmitting={isSubmitting} onBack={() => setPlan(null)} onRevise={(revision) => requestPlan({ existingProjectId: plan.projectId, inputAssetIds: plan.inputAssetIds, revision })} onApprove={handleApprove} />;
    }

    return (
        <div className="space-y-8">
            <div className="rounded-2xl border border-border/70 bg-secondary/35 px-4 py-3 text-sm leading-6 text-muted-foreground"><span className="font-semibold text-foreground">Start your way.</span> An idea or script is enough. Voice, images, footage, and other media are optional ways to give the plan more to work with.</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{MODES.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} onClick={() => setMode(item.id)} aria-pressed={mode === item.id} className={`rounded-[1.15rem] border p-5 text-left transition hover:-translate-y-0.5 ${mode === item.id ? 'border-primary bg-[#fff8e9] shadow-[0_15px_35px_-25px_hsl(38_86%_48%_/_0.9)]' : 'border-border bg-card hover:bg-secondary/45'}`}><span className={`grid size-10 place-items-center rounded-xl ${mode === item.id ? 'bg-[#f6dfb1]' : 'bg-secondary'}`}><Icon className="size-5" aria-hidden="true" /></span><span className="mt-8 block font-semibold">{item.label}</span><span className="mt-2 block text-sm leading-6 text-muted-foreground">{item.description}</span></button>; })}</div>
            <div className="ff-card space-y-7 p-6 sm:p-8">
                <div><label htmlFor="production-name" className="text-sm font-semibold">Name your video <span className="font-normal text-muted-foreground">(optional)</span></label><input id="production-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. A funny launch video for my bakery" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary" /></div>
                <div><label htmlFor="production-brief" className="text-sm font-semibold">{mode === 'SCRIPT' ? 'Paste your script' : 'Tell us what you want to make'}</label><p className="mt-1 text-sm text-muted-foreground">{mode === 'VOICE' ? 'Optional when you upload a recording. Add context if you have it.' : 'Write it like you would explain it to a creative friend.'}</p><textarea id="production-brief" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === 'SCRIPT' ? 'Paste your script here…' : mode === 'VOICE' ? 'Optional context: what is happening in this performance?' : 'Make a warm 30-second video about…'} className="mt-3 min-h-44 w-full resize-y rounded-xl border border-border bg-background p-4 text-sm leading-7 outline-none focus:border-primary" /></div>
                <div className="grid gap-4 sm:grid-cols-3"><div><label htmlFor="production-duration" className="text-sm font-semibold">Length</label><select id="production-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option></select></div><div><label htmlFor="production-output" className="text-sm font-semibold">Where it will go</label><select id="production-output" value={outputPreset} onChange={(event) => setOutputPreset(event.target.value as OutputPreset)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="SOCIAL_VERTICAL">Social · vertical</option><option value="SQUARE">Social · square</option><option value="LANDSCAPE">Website · landscape</option></select></div><div><label htmlFor="production-quality" className="text-sm font-semibold">Finish level</label><select id="production-quality" value={qualityTier} onChange={(event) => setQualityTier(event.target.value as QualityTier)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="ECONOMY">Quick draft</option><option value="STANDARD">Standard</option><option value="PREMIUM">Polished</option></select></div></div>
                <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/30 px-4 text-sm text-muted-foreground transition hover:border-primary hover:bg-secondary/60"><Upload className="size-5 shrink-0" aria-hidden="true" /><span>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} ready to use` : 'Add a logo, photo, clip, voice note, or reference (optional)'}</span><input type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label>
                <button type="button" onClick={() => requestPlan()} disabled={isSubmitting} className="ff-button-primary min-h-12 w-full">{isSubmitting ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-5" aria-hidden="true" />} Show me the plan</button>
            </div>
        </div>
    );
}
