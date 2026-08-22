'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, Check, FileText, ImagePlus, Loader2, Mic2, Sparkles, Upload, Video } from 'lucide-react';
import { createProject } from '@/lib/project/actions';
import { approveDirectorPlan, createDirectorPlan } from '@/lib/production/actions';
import { uploadAsset } from '@/lib/assets/actions';
import type { CreateIntent, ProductionInputMode, OutputPreset, QualityTier, ProjectContentType } from '@/lib/types/database';

const MODES: Array<{ id: ProductionInputMode; label: string; description: string; icon: typeof Sparkles }> = [
  { id: 'IDEA', label: 'Start with an idea', description: 'Tell us about a story, ad, cartoon, or product video.', icon: Sparkles },
  { id: 'SCRIPT', label: 'Paste a script', description: 'Bring dialogue, a voiceover, or a rough outline.', icon: FileText },
  { id: 'VOICE', label: 'Bring your voice', description: 'Use a recording as the timing and feeling guide.', icon: Mic2 },
  { id: 'IMAGES', label: 'Bring images', description: 'Use characters, products, logos, or references.', icon: ImagePlus },
  { id: 'FOOTAGE', label: 'Bring footage', description: 'Shape clips into a clearer story with captions.', icon: Video },
  { id: 'AD', label: 'Make an ad', description: 'Create a short promotion for a product or service.', icon: Sparkles },
];

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
  const [plan, setPlan] = useState<any>(null);

  async function handlePlan() {
    if (prompt.trim().length < 10) { toast.error('Give your idea a little more detail first.'); return; }
    setIsSubmitting(true);
    try {
      const contentType: ProjectContentType = mode === 'AD' ? 'commercial' : mode === 'FOOTAGE' ? 'ugc' : mode === 'SCRIPT' ? 'explainer' : 'commercial';
      const project = await createProject({ name: name.trim() || 'Untitled video', contentType, description: prompt.trim(), outcomeGoal: mode === 'AD' ? 'convert_sales' : 'get_attention' });
      if (!project.success || !project.projectId) throw new Error(project.error || 'Could not create your project');
      const inputAssetIds: string[] = [];
      if (files.length > 0 && studioId) for (const file of files) { const formData = new FormData(); formData.append('file', file); const upload = await uploadAsset(studioId, formData, `/productions/${project.projectId}`); if (!upload.success || !upload.asset) throw new Error(upload.error || `Could not upload ${file.name}`); inputAssetIds.push(upload.asset.id); }
      const intent: CreateIntent = { projectId: project.projectId, mode, prompt: mode === 'SCRIPT' ? undefined : prompt.trim(), script: mode === 'SCRIPT' ? prompt.trim() : undefined, inputAssetIds, requestedDurationSeconds: duration, outputPreset, qualityTier, workflow: mode === 'AD' ? 'BUSINESS_AD' : mode === 'FOOTAGE' ? 'FOOTAGE_TRANSFORM' : mode === 'VOICE' ? 'COMEDY' : 'SOCIAL' };
      const result = await createDirectorPlan(intent);
      if (!result.success) throw new Error(result.error || 'Could not create your plan');
      setPlan({ ...result, projectId: project.projectId });
      toast.success('Your plan is ready to review.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Something went wrong'); } finally { setIsSubmitting(false); }
  }

  async function handleApprove() {
    if (!plan?.planId) return;
    setIsSubmitting(true);
    const result = await approveDirectorPlan(plan.planId);
    setIsSubmitting(false);
    if (!result.success) { toast.error(result.error || 'Could not approve the plan'); return; }
    toast.success('Plan approved. Your video is ready to make.');
    router.push(`/dashboard/projects/${plan.projectId}`);
  }

  if (plan) return <div className="space-y-6">
    <div className="rounded-[1.4rem] bg-[#f4ead6] p-7 sm:p-9"><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-accent" /> Your plan is ready</div><h2 className="ff-display mt-5 text-3xl font-semibold">{plan.plan.summary}</h2><p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Read through the story, check the estimate, and approve only when it feels right.</p></div>
    <div className="grid gap-4 sm:grid-cols-3"><div className="ff-card p-5"><p className="ff-eyebrow">Estimated cost</p><p className="ff-display mt-3 text-3xl font-semibold">{plan.estimate.totalCredits}<span className="ml-2 text-sm tracking-normal text-muted-foreground">credits</span></p></div><div className="ff-card p-5"><p className="ff-eyebrow">Your balance</p><p className="ff-display mt-3 text-3xl font-semibold">{plan.balance}<span className="ml-2 text-sm tracking-normal text-muted-foreground">credits</span></p></div><div className="ff-card p-5"><p className="ff-eyebrow">Output</p><p className="mt-3 text-lg font-semibold">{duration}s · {outputPreset === 'SOCIAL_VERTICAL' ? 'Vertical' : outputPreset === 'SQUARE' ? 'Square' : 'Landscape'}</p></div></div>
    <div className="ff-card space-y-5 p-6 sm:p-8"><div className="flex items-center justify-between border-b border-border/70 pb-5"><p className="ff-eyebrow">Your video outline</p><span className="text-sm text-muted-foreground">{qualityTier.toLowerCase()} quality</span></div>{plan.plan.sequences?.map((sequence: any) => <div key={sequence.title} className="rounded-xl bg-secondary/55 p-5"><p className="font-semibold">{sequence.title}</p>{sequence.scenes?.map((scene: any) => <div key={scene.title} className="mt-3 flex items-center justify-between gap-4 border-l-2 border-primary/60 pl-4 text-sm"><span className="text-muted-foreground">{scene.title}</span><span className="shrink-0 text-xs text-muted-foreground">{scene.shots?.length || 0} takes</span></div>)}</div>)}</div>
    <div className="flex flex-col gap-3 sm:flex-row"><button onClick={() => setPlan(null)} className="ff-button-quiet min-h-12 border border-border">Adjust my idea</button><button onClick={handleApprove} disabled={isSubmitting || plan.balance < plan.estimate.totalCredits} className="ff-button-primary min-h-12 flex-1">{isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{plan.balance < plan.estimate.totalCredits ? 'You need more credits' : 'Approve plan and continue'}</button></div>
  </div>;

  return <div className="space-y-8">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{MODES.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} onClick={() => setMode(item.id)} className={`rounded-[1.15rem] border p-5 text-left transition hover:-translate-y-0.5 ${mode === item.id ? 'border-primary bg-[#fff8e9] shadow-[0_15px_35px_-25px_hsl(38_86%_48%_/_0.9)]' : 'border-border bg-card hover:bg-secondary/45'}`}><span className={`grid size-10 place-items-center rounded-xl ${mode === item.id ? 'bg-[#f6dfb1]' : 'bg-secondary'}`}><Icon className="size-5" /></span><span className="mt-8 block font-semibold">{item.label}</span><span className="mt-2 block text-sm leading-6 text-muted-foreground">{item.description}</span></button>; })}</div>
    <div className="ff-card space-y-7 p-6 sm:p-8"><div><label htmlFor="production-name" className="text-sm font-semibold">Name your video <span className="font-normal text-muted-foreground">(optional)</span></label><input id="production-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. A funny launch video for my bakery" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary" /></div><div><label htmlFor="production-brief" className="text-sm font-semibold">Tell us what you want to make</label><p className="mt-1 text-sm text-muted-foreground">Write it like you would explain it to a creative friend.</p><textarea id="production-brief" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === 'SCRIPT' ? 'Paste your script here…' : 'Make a warm 30-second video about…'} className="mt-3 min-h-44 w-full resize-y rounded-xl border border-border bg-background p-4 text-sm leading-7 outline-none focus:border-primary" /></div><div className="grid gap-4 sm:grid-cols-3"><div><label className="text-sm font-semibold">Length</label><select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option></select></div><div><label className="text-sm font-semibold">Where it will go</label><select value={outputPreset} onChange={(event) => setOutputPreset(event.target.value as OutputPreset)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="SOCIAL_VERTICAL">Social · vertical</option><option value="SQUARE">Social · square</option><option value="LANDSCAPE">Website · landscape</option></select></div><div><label className="text-sm font-semibold">Finish level</label><select value={qualityTier} onChange={(event) => setQualityTier(event.target.value as QualityTier)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="ECONOMY">Quick draft</option><option value="STANDARD">Standard</option><option value="PREMIUM">Polished</option></select></div></div><label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/30 px-4 text-sm text-muted-foreground transition hover:border-primary hover:bg-secondary/60"><Upload className="size-5" /><span>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} ready to use` : 'Add a logo, photo, clip, voice note, or reference (optional)'}</span><input type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label><button type="button" onClick={handlePlan} disabled={isSubmitting} className="ff-button-primary min-h-12 w-full">{isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />} Show me the plan</button></div>
  </div>;
}
