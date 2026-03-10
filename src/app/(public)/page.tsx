/**
 * FinalFrame — Home Page
 * "Show certainty. Remove mystery."
 */

import Link from 'next/link';
import { MoveRight, ChevronRight, Lock, Layout, PencilLine, Share2, PlayCircle, ShieldCheck, Zap, Fingerprint, Users, Cpu, Database, Eye, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
    title: 'FinalFrame — Studio-Grade Creative Production',
    description: 'A studio-grade creative operating system for Hollywood-standard content.',
};

export default function HomePage() {
    return (
        <div className="min-h-screen flex flex-col bg-background text-foreground overflow-x-hidden font-sans selection:bg-primary/20">


            {/* --- Hero Section --- */}
            <section className="relative pt-40 pb-20 md:pt-64 md:pb-40 overflow-hidden flex flex-col items-center justify-center min-h-[80vh]">
                <div className="container relative z-10 flex flex-col items-center text-center px-4 md:px-0">
                    {/* H1 Title - Precise & Intentional */}
                    <h1 className="public-heading-hero mb-8 max-w-5xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
                        Direct your video.<br />
                        <span className="text-zinc-400 font-medium font-sans">Don’t prompt it.</span>
                    </h1>

                    {/* Subtitle - Certainty */}
                    <p className="public-body-text max-w-2xl mb-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
                        FinalFrame turns intent, assets, and structure into<br className="hidden md:block" />
                        production-ready video. Built for agencies and founders.
                    </p>

                    {/* CTA - Private Beta */}
                    <div className="flex flex-col sm:flex-row gap-5 items-center animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
                        <Link
                            href="/beta-request"
                            className="primary-cta group"
                        >
                            Request Private Beta
                            <MoveRight className="w-4 h-4 ml-3 opacity-50 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                </div>

                {/* Subtle Background Detail */}
                <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 blur-[120px] rounded-full" />
                </div>
            </section>

            {/* --- Proof Section: The Pipeline --- */}
            <section className="public-page-section relative bg-zinc-900/10">
                <div className="container px-4 md:px-0">
                    <div className="max-w-3xl mb-24">
                        <h2 className="text-caption text-primary mb-6">Proof of Workflow</h2>
                        <h3 className="public-heading-section">
                            A pipeline built for<br /> deterministic results.
                        </h3>
                    </div>

                    <div className="relative">
                        {/* Connecting Line (Desktop) */}
                        <div className="hidden md:block absolute top-[60px] left-0 right-0 h-[1px] bg-zinc-800/50 z-0" />

                        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 relative z-10">
                            {[
                                { step: '01', label: 'Project', icon: Layout, desc: 'Define intent & lock brand energy.' },
                                { step: '02', label: 'Blueprint', icon: PencilLine, desc: 'Generate unique, structured scenes.' },
                                { step: '03', label: 'Scene', icon: Zap, desc: 'Bind assets & cinematic constraints.' },
                                { step: '04', label: 'Render', icon: PlayCircle, desc: 'Execute production with certainty.' },
                                { step: '05', label: 'Export', icon: Share2, desc: 'Final delivery in studio quality.' },
                            ].map((item, idx) => (
                                <div key={idx} className="group relative">
                                    <div className="w-12 h-12 rounded-sm bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-8 group-hover:border-primary/50 transition-colors shadow-xl">
                                        <item.icon className="w-5 h-5 text-zinc-400 group-hover:text-primary transition-colors" />
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-xs text-zinc-500">{item.step}</span>
                                            <span className="font-bold text-sm tracking-tight text-zinc-200">{item.label}</span>
                                        </div>
                                        <p className="text-xs text-zinc-400 leading-relaxed max-w-[180px]">
                                            {item.desc}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* --- Differentiation: Determinism --- */}
            <section className="public-page-section">
                <div className="container px-4 md:px-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
                        <div className="space-y-12">
                            <div className="space-y-8">
                                <h2 className="public-heading-section">Show certainty.<br />Remove mystery.</h2>
                                <p className="public-body-text">
                                    Generative AI is often a slot machine. FinalFrame is a studio.
                                    By locking assets to specific scenes and defining non-negotiable intent,
                                    we remove the guesswork from high-stakes production.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-10">
                                {[
                                    { title: 'Asset-Locked Scenes', desc: 'Your brand assets don’t drift. They are anchored to specific narrative beats.' },
                                    { title: 'Explainable AI', desc: 'Every scene has a goal, an emotional intent, and a cinematic configuration.' },
                                    { title: 'No Hallucinations', desc: 'Technical constraints overrule creative randomness. Every frame serves the script.' }
                                ].map((feature, idx) => (
                                    <div key={idx} className="flex gap-6 items-start">
                                        <div className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                        <div className="space-y-2">
                                            <h4 className="font-bold text-base text-zinc-100 uppercase tracking-wider">{feature.title}</h4>
                                            <p className="text-sm text-zinc-400 leading-relaxed">{feature.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Visual Proof: Technical Layout */}
                        <div className="aspect-square bg-zinc-900 border border-zinc-800 rounded-sm p-10 flex items-center justify-center relative overflow-hidden group shadow-2xl">
                            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none" />
                            <div className="w-full h-full border border-zinc-800 rounded-sm p-6 font-mono text-[11px] text-zinc-500 overflow-hidden select-none">
                                <div className="flex justify-between border-b border-zinc-800 pb-4 mb-6">
                                    <span className="font-bold tracking-widest text-[10px] uppercase">SCENE_01_PROD_LOG</span>
                                    <span className="text-primary font-black uppercase tracking-[0.2em] italic">LOCKED</span>
                                </div>
                                <div className="space-y-2">
                                    <div>{'>'} INJECTING_STATIC_ASSET: logo_v2.png</div>
                                    <div>{'>'} APPLYING_LENS: 35mm_cinematic</div>
                                    <div>{'>'} SYNCING_MOTION_DELTA: 0.82</div>
                                    <div className="pt-8 text-zinc-400 font-sans text-sm italic font-light leading-relaxed">"The truth is in the structure."</div>
                                </div>
                            </div>
                            {/* Subtle Gradient Shadow */}
                            <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent" />
                        </div>
                    </div>
                </div>
            </section>

            {/* --- The Studio Engines --- */}
            <section className="public-page-section bg-zinc-900/5 overflow-hidden">
                <div className="container px-4 md:px-0">
                    <div className="max-w-3xl mb-24">
                        <h2 className="text-caption text-primary mb-6">Studio Toolset</h2>
                        <h3 className="public-heading-section">
                            Five professional engines.<br />One unified workflow.
                        </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1px bg-zinc-800 border border-zinc-800 rounded-sm overflow-hidden">
                        {[
                            { title: 'Blueprint Director', icon: Cpu, desc: 'AI-driven narrative structure that generates scene hierarchies based on studio intent.' },
                            { title: 'Signal Validator', icon: Eye, desc: 'Real-time health monitoring of scene continuity, asset binding, and cinematic constraints.' },
                            { title: 'Material Registry', icon: Database, desc: 'Centralized brand vault for 1:1 asset injection. No style drift, no compromise.' },
                            { title: 'Magic Oven', icon: Zap, desc: 'High-fidelity synthesis engine optimized for studio-grade export and temporal consistency.' },
                            { title: 'Collaborative Sync', icon: Users, desc: 'Multi-seat studio environments with permission models and unified production logs.' },
                            { title: 'Studio Templates', icon: Layout, desc: 'Access legendary cinematic structures. Inject pre-baked creative DNA directly into your timeline.' },
                        ].map((engine, idx) => (
                            <div key={idx} className="bg-zinc-950 p-10 group hover:bg-zinc-900/40 transition-all duration-500">
                                <engine.icon className="w-8 h-8 text-zinc-600 group-hover:text-primary transition-colors mb-8" />
                                <h4 className="text-base font-black text-zinc-100 uppercase tracking-widest mb-4 italic">{engine.title}</h4>
                                <p className="text-sm text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors">
                                    {engine.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- Your Creative DNA --- */}
            <section className="public-page-section border-t border-white/5">
                <div className="container px-4 md:px-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
                        <div className="relative order-2 md:order-1">
                            <div className="absolute -inset-20 bg-primary/5 blur-[100px] rounded-full" />
                            <div className="relative aspect-video bg-zinc-950 border border-zinc-800 rounded-sm p-1 flex items-center justify-center overflow-hidden">
                                <div className="absolute inset-0 flex items-center justify-center opacity-10">
                                    <Fingerprint className="w-64 h-64 text-primary" />
                                </div>
                                <div className="z-10 text-center space-y-4">
                                    <div className="text-[10px] font-mono text-primary uppercase tracking-[0.4em] animate-pulse">DNA_SYNC_IN_PROGRESS</div>
                                    <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                        <div className="w-2/3 h-full bg-primary" />
                                    </div>
                                    <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Aesthetic Calibration: 84.2%</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8 order-1 md:order-2">
                            <h2 className="text-caption text-primary">Identity Presence</h2>
                            <h3 className="public-heading-section">Your creative DNA.<br />Unlocked.</h3>
                            <p className="public-body-text">
                                FinalFrame doesn't just generate generic video. It learns your studio's specific
                                aesthetic preferences, brand constraints, and narrative voice to ensure
                                every output feels native to your identity.
                            </p>
                            <div className="flex gap-4">
                                <Link href="/beta-request" className="text-xs font-black uppercase tracking-widest text-primary hover:text-white transition-colors flex items-center gap-2">
                                    Learn about DNA Tuning <ChevronRight className="w-3 h-3" />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- Cinematic Gallery --- */}
            <section className="public-page-section bg-black overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
                <div className="container px-4 md:px-0">
                    <div className="text-center mb-24 space-y-4">
                        <h2 className="text-caption text-zinc-500">Recent Productions</h2>
                        <h3 className="public-heading-section text-4xl md:text-5xl">Studio Results.</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-10 mt-20">
                            <div className="group relative overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900 shadow-2xl">
                                <img src="/images/gallery/frame_1.png" alt="Sci-Fi Laboratory" className="w-full aspect-video object-cover grayscale group-hover:grayscale-0 transition-all duration-1000 scale-105 group-hover:scale-100" />
                                <div className="absolute bottom-0 inset-x-0 p-6 bg-black/60 backdrop-blur-md border-t border-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary italic">SCENE_01: NEON_SYNTHESIS</p>
                                </div>
                            </div>
                            <div className="group relative overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900 shadow-2xl">
                                <img src="/images/gallery/frame_2.png" alt="Luxury Car Commercial" className="w-full aspect-video object-cover grayscale group-hover:grayscale-0 transition-all duration-1000 scale-105 group-hover:scale-100" />
                                <div className="absolute bottom-0 inset-x-0 p-6 bg-black/60 backdrop-blur-md border-t border-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary italic">SCENE_04: GOLDEN_PASS</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-10">
                            <div className="group relative overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900 shadow-2xl">
                                <img src="/images/gallery/frame_3.png" alt="Fashion Documentary" className="w-full aspect-video object-cover grayscale group-hover:grayscale-0 transition-all duration-1000 scale-105 group-hover:scale-100" />
                                <div className="absolute bottom-0 inset-x-0 p-6 bg-black/60 backdrop-blur-md border-t border-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary italic">UNIT_02: BRUTALIST_WALK</p>
                                </div>
                            </div>
                            <div className="group relative overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900 shadow-2xl">
                                <img src="/images/gallery/frame_4.png" alt="Designer Workspace" className="w-full aspect-video object-cover grayscale group-hover:grayscale-0 transition-all duration-1000 scale-105 group-hover:scale-100" />
                                <div className="absolute bottom-0 inset-x-0 p-6 bg-black/60 backdrop-blur-md border-t border-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary italic">SCENE_07: CREATIVE_SYNC</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- Built for Commercial Use --- */}
            <section className="public-page-section bg-zinc-950 relative overflow-hidden">
                <div className="absolute -right-64 -top-64 w-[600px] h-[600px] bg-primary/5 blur-[120px] rounded-full" />
                <div className="container px-4 md:px-0 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
                        <div className="space-y-6">
                            <ShieldCheck className="w-12 h-12 text-primary" />
                            <h4 className="text-lg font-black uppercase tracking-[0.2em] italic text-zinc-50">Studio-Grade Security</h4>
                            <p className="text-sm text-zinc-500 leading-loose">
                                Your data and assets are isolated at the infrastructure level.
                                We never use studio production data to train our global models.
                            </p>
                        </div>
                        <div className="space-y-6">
                            <Lock className="w-12 h-12 text-primary" />
                            <h4 className="text-lg font-black uppercase tracking-[0.2em] italic text-zinc-50">Rights Cleared</h4>
                            <p className="text-sm text-zinc-500 leading-loose">
                                Architected for full legal and intellectual property compliance.
                                Own every pixel, every structure, and every sequence you direct.
                            </p>
                        </div>
                        <div className="space-y-6">
                            <Sparkles className="w-12 h-12 text-primary" />
                            <h4 className="text-lg font-black uppercase tracking-[0.2em] italic text-zinc-50">Private Beta</h4>
                            <p className="text-sm text-zinc-500 leading-loose">
                                We are currently selecting a limited number of studios for high-touch
                                support and custom creative DNA calibration.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- Final CTA --- */}
            <section className="py-40 text-center relative overflow-hidden bg-zinc-900/20">
                <div className="container relative z-10 px-4">
                    <h2 className="public-heading-hero mb-12">
                        Ready to direct?<br />
                        <span className="text-zinc-500 font-sans italic">Join the waiting list.</span>
                    </h2>
                    <Link
                        href="/beta-request"
                        className="primary-cta group"
                    >
                        Request Private Beta
                        <MoveRight className="w-4 h-4 ml-3 opacity-50 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>
            </section>

        </div>
    );
}
