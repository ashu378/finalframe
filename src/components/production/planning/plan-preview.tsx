'use client';

import { useState } from 'react';
import { Check, ChevronDown, Coins, FileText, Lightbulb, MapPin, MessageSquareText, Package, Pencil, Sparkles, Users } from 'lucide-react';
import type { CostEstimate, OutputPreset, QualityTier } from '@/lib/types/database';
import type { PlanningPreview } from '@/lib/production/actions';
import { cn } from '@/lib/utils';

interface PlanPreviewProps {
    preview: PlanningPreview;
    balance: number;
    outputPreset: OutputPreset;
    qualityTier: QualityTier;
    isSubmitting: boolean;
    onRevise: (note: string) => void;
    onApprove: () => void;
    onBack: () => void;
}

function outputLabel(outputPreset: OutputPreset): string {
    if (outputPreset === 'SQUARE') return 'Square social video';
    if (outputPreset === 'LANDSCAPE') return 'Landscape video';
    return 'Vertical social video';
}

function totalTakes(preview: PlanningPreview): number {
    return preview.parts.reduce((total, part) => total + part.takes.length, 0);
}

function EstimateLines({ estimate }: { estimate: CostEstimate }) {
    return (
        <div className="divide-y divide-border/70">
            {estimate.lineItems.map((item) => (
                <div key={`${item.operation}-${item.unit}`} className="flex items-start justify-between gap-4 py-3 text-sm">
                    <div>
                        <p className="font-semibold capitalize">{item.operation.toLowerCase()}</p>
                        <p className="mt-1 text-muted-foreground">{item.description}</p>
                    </div>
                    <span className="shrink-0 font-semibold">{item.credits} credits</span>
                </div>
            ))}
        </div>
    );
}

function GuideList({ icon: Icon, title, items, empty }: { icon: typeof Users; title: string; items: Array<{ name: string; description: string }>; empty: string }) {
    return (
        <div className="rounded-2xl border border-border/70 bg-background/55 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-accent" aria-hidden="true" /> {title}</div>
            {items.length ? (
                <div className="mt-4 space-y-3">
                    {items.map((item) => <div key={`${item.name}-${item.description}`} className="rounded-xl bg-secondary/45 p-3"><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p></div>)}
                </div>
            ) : <p className="mt-4 text-sm leading-6 text-muted-foreground">{empty}</p>}
        </div>
    );
}

export function PlanPreview({ preview, balance, outputPreset, qualityTier, isSubmitting, onRevise, onApprove, onBack }: PlanPreviewProps) {
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [revisionNote, setRevisionNote] = useState('');
    const affordable = balance >= preview.estimate.totalCredits;
    const takeCount = totalTakes(preview);

    function submitRevision() {
        if (!revisionNote.trim()) return;
        onRevise(revisionNote.trim());
        setRevisionNote('');
        setRevisionOpen(false);
    }

    return (
        <div className="space-y-6 pb-8">
            <section className="overflow-hidden rounded-[1.5rem] bg-[#f4ead6] p-6 sm:p-9" aria-labelledby="plan-preview-title">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className="inline-flex items-center gap-2 rounded-full bg-white/65 px-3 py-1.5"><Sparkles className="size-4 text-accent" aria-hidden="true" /> Plan ready</span><span className="text-muted-foreground">Nothing is being made yet</span></div>
                <h2 id="plan-preview-title" className="ff-display mt-5 max-w-3xl text-3xl font-semibold sm:text-4xl">{preview.title}</h2>
                <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{preview.summary}</p>
                <div className="mt-7 grid gap-3 sm:grid-cols-3" aria-label="Plan summary">
                    {[[preview.parts.length, 'parts'], [takeCount, 'takes'], [outputLabel(outputPreset), 'format']].map(([value, label]) => <div key={String(label)} className="rounded-xl bg-white/55 p-4"><p className="text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}
                </div>
            </section>

            <nav className="overflow-x-auto rounded-2xl border border-border/70 bg-card p-2" aria-label="Plan sections">
                <div className="flex min-w-max gap-1 text-sm font-semibold">
                    {[['script', 'Script'], ['guide', 'Creative guide'], ['parts', 'Parts & takes'], ['estimate', 'Estimate']].map(([id, label], index) => <a key={id} href={`#${id}`} className="rounded-xl px-3 py-2.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"><span className="mr-1.5 text-xs text-accent">0{index + 1}</span>{label}</a>)}
                </div>
            </nav>

            <section id="script" className="ff-card scroll-mt-5 p-6 sm:p-8">
                <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f6dfb1]"><FileText className="size-5" aria-hidden="true" /></span><div><p className="ff-eyebrow">01 · Story and script</p><h3 className="ff-display mt-2 text-2xl font-semibold">This is what the video is saying</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{preview.script.label}. You can ask for a change before approving the plan.</p></div></div>
                <div className="mt-6 rounded-2xl border border-border/70 bg-secondary/35 p-5 text-sm leading-7"><p className="whitespace-pre-wrap">{preview.script.text}</p></div>
            </section>

            <section id="guide" className="ff-card scroll-mt-5 p-6 sm:p-8">
                <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#c8ddd5]"><Lightbulb className="size-5" aria-hidden="true" /></span><div><p className="ff-eyebrow">02 · Creative guide</p><h3 className="ff-display mt-2 text-2xl font-semibold">The details that keep it feeling like one video</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">FinalFrame will use these choices as the reference while it plans each take.</p></div></div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[['Visual style', preview.creativeGuide.visualStyle], ['Tone', preview.creativeGuide.tone], ['Pace', preview.creativeGuide.pace], ['Palette', preview.creativeGuide.palette]].map(([label, value]) => <div key={label} className="rounded-2xl bg-secondary/45 p-4"><p className="ff-eyebrow">{label}</p><p className="mt-3 text-sm font-semibold leading-6">{value}</p></div>)}
                </div>
                {preview.creativeGuide.notes.length > 0 && <div className="mt-4 rounded-2xl border border-dashed border-border p-4"><p className="text-sm font-semibold">Guide notes</p><ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground sm:grid-cols-2">{preview.creativeGuide.notes.map((note) => <li key={note} className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-[hsl(var(--success))]" aria-hidden="true" />{note}</li>)}</ul></div>}
                <div className="mt-4 grid gap-3 md:grid-cols-3"><GuideList icon={Users} title="Characters" items={preview.creativeGuide.characters} empty="Characters will be defined from the story." /><GuideList icon={MapPin} title="Places" items={preview.creativeGuide.locations} empty="Locations will be shaped around the brief." /><GuideList icon={Package} title="Products and props" items={preview.creativeGuide.products} empty="No product reference is required for this plan." /></div>
            </section>

            <section id="parts" className="ff-card scroll-mt-5 p-6 sm:p-8">
                <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1c7b7]"><MessageSquareText className="size-5" aria-hidden="true" /></span><div><p className="ff-eyebrow">03 · Parts and takes</p><h3 className="ff-display mt-2 text-2xl font-semibold">A clear path from beginning to end</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Each take is planned independently so you can revise one moment without losing the rest.</p></div></div>
                <div className="mt-6 space-y-3">{preview.parts.map((part, index) => <details key={part.id} open={index === 0} className="group rounded-2xl border border-border/70 bg-background/55"><summary className="flex cursor-pointer list-none items-center gap-4 p-4 sm:p-5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-semibold">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{part.title}</span><span className="mt-1 block text-sm text-muted-foreground">{part.purpose}</span></span><span className="hidden text-xs font-semibold text-muted-foreground sm:block">{part.takes.length} {part.takes.length === 1 ? 'take' : 'takes'}</span><ChevronDown className="size-5 shrink-0 text-muted-foreground transition group-open:rotate-180" aria-hidden="true" /></summary><div className="space-y-3 border-t border-border/70 px-4 pb-4 pt-4 sm:px-5 sm:pb-5"><p className="text-sm leading-6 text-muted-foreground">{part.description}</p>{part.takes.map((take) => <div key={take.id} className="rounded-xl border border-border/70 bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{take.title}</p><p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Planned · {take.durationSeconds}s</p></div><span className="rounded-full bg-[#f6dfb1]/60 px-3 py-1.5 text-xs font-semibold">{take.requiredAssetCount ? `${take.requiredAssetCount} media reference${take.requiredAssetCount === 1 ? '' : 's'}` : 'No media required'}</span></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{take.prompt}</p></div>)}</div></details>)}</div>
            </section>

            <section id="estimate" className="ff-card scroll-mt-5 p-6 sm:p-8">
                <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d8cee8]"><Coins className="size-5" aria-hidden="true" /></span><div><p className="ff-eyebrow">04 · Estimate and approval</p><h3 className="ff-display mt-2 text-2xl font-semibold">You stay in control of the cost</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">This is an estimate only. Approving the plan does not start generation or payment; it saves the approved production structure for the next step.</p></div></div>
                <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_18rem]"><div className="rounded-2xl border border-border/70 bg-background/55 p-4 sm:p-5"><EstimateLines estimate={preview.estimate} /><div className="mt-3 flex items-center justify-between border-t border-border/70 pt-4"><span className="font-semibold">Estimated total</span><span className="ff-display text-2xl font-semibold">{preview.estimate.totalCredits} credits</span></div></div><div className="rounded-2xl bg-foreground p-5 text-background"><p className="text-sm font-semibold text-background/70">Your balance</p><p className="ff-display mt-3 text-3xl font-semibold">{balance}<span className="ml-2 text-sm font-normal text-background/65">credits</span></p><p className="mt-4 text-sm leading-6 text-background/70">{affordable ? 'You have enough credits for this estimate.' : 'You can still save this plan. Add credits before you start making it.'}</p></div></div>
            </section>

            {revisionOpen && <section className="rounded-2xl border border-primary/45 bg-[#fff8e9] p-5 sm:p-6" aria-labelledby="revision-title"><div className="flex items-start gap-3"><Pencil className="mt-1 size-5 text-accent" aria-hidden="true" /><div className="min-w-0 flex-1"><h3 id="revision-title" className="font-semibold">What should change?</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">The plan will be revised and saved as a new version. Nothing will be generated yet.</p><textarea value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} placeholder="Make the opening faster, give the character a stronger reaction…" className="mt-4 min-h-28 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm leading-6 outline-none focus:border-primary" autoFocus /><div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="ff-button-quiet" onClick={() => setRevisionOpen(false)} disabled={isSubmitting}>Keep this plan</button><button type="button" className="ff-button-primary" onClick={submitRevision} disabled={isSubmitting || !revisionNote.trim()}>{isSubmitting ? 'Revising…' : 'Revise the plan'}</button></div></div></div></section>}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={onBack} disabled={isSubmitting} className="ff-button-quiet min-h-12 border border-border"><Pencil className="size-4" aria-hidden="true" /> Change the brief</button><button type="button" onClick={() => setRevisionOpen((open) => !open)} disabled={isSubmitting} className="ff-button-quiet min-h-12"><Pencil className="size-4" aria-hidden="true" /> Ask for a revision</button><button type="button" onClick={onApprove} disabled={isSubmitting} aria-busy={isSubmitting} className={cn('ff-button-primary min-h-12 sm:min-w-64')}>{isSubmitting ? 'Saving approval…' : 'Approve this plan'}</button></div>
            <p className="text-center text-xs leading-5 text-muted-foreground">{qualityTier.toLowerCase()} quality · {outputLabel(outputPreset)} · Approval saves your plan only. Generation and payment happen later, after the next confirmation.</p>
        </div>
    );
}
