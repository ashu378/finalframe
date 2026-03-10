/**
 * FinalFrame — Methodology
 * "The truth is in the structure."
 */

import Link from 'next/link';
import { Target, Cpu, Shield, Zap, MoveRight } from 'lucide-react';

export const metadata = {
    title: 'Process // FinalFrame',
    description: 'Deterministic creative production through architectural intent.',
};

export default function MethodologyPage() {
    return (
        <div className="min-h-screen pt-40 pb-20 bg-background text-foreground selection:bg-primary/20">
            <div className="container px-6 mx-auto">

                {/* Header Section */}
                <header className="max-w-4xl mb-32">
                    <h1 className="text-[14px] font-black uppercase tracking-[0.4em] mb-6 text-primary italic">Our_Process</h1>
                    <h2 className="text-5xl md:text-7xl font-black tracking-tight leading-[0.9] text-white uppercase italic">
                        Certainty_by<br />
                        <span className="text-zinc-500">Design.</span>
                    </h2>
                    <p className="text-[12px] font-bold text-zinc-400 uppercase tracking-[0.2em] mt-12 max-w-xl leading-relaxed">
                        Generative video is a slot machine. FinalFrame is a studio.
                        We replace creative randomness with technical architecture.
                    </p>
                </header>

                {/* Core Principles Grid */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-32">
                    <div className="bg-black/40 border border-white/5 p-12 rounded-sm group hover:border-primary/20 transition-all duration-500 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                            <Target className="w-32 h-32 text-primary" />
                        </div>
                        <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.3em] mb-8 italic">01 // Intent_Locking</h3>
                        <p className="text-[14px] font-bold text-zinc-300 uppercase leading-relaxed tracking-wide">
                            Every scene begins with a non-negotiable directive. We anchor brand assets to specific narrative beats, ensuring zero visual drift across the production pipeline.
                        </p>
                    </div>

                    <div className="bg-black/40 border border-white/5 p-12 rounded-sm group hover:border-primary/20 transition-all duration-500 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                            <Cpu className="w-32 h-32 text-primary" />
                        </div>
                        <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.3em] mb-8 italic">02 // Deterministic_AI</h3>
                        <p className="text-[14px] font-bold text-zinc-300 uppercase leading-relaxed tracking-wide">
                            Our architecture overlays cinematic constraints on top of generative models. We don't hope for the right frame; we calculate the parameters that guarantee it.
                        </p>
                    </div>
                </section>

                {/* Technical Layout Section */}
                <section className="border-t border-white/5 pt-32 mb-32">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
                        <div className="space-y-12">
                            <h2 className="text-4xl font-black tracking-tight text-white uppercase italic">The_Protocol</h2>
                            <div className="space-y-12">
                                {[
                                    { title: 'ASSET_SYNC', desc: 'Securely upload your studio materials and brand assets.' },
                                    { title: 'BLUEPRINT_GEN', desc: 'Automatically generate a structured storyboard for your narrative.' },
                                    { title: 'STUDIO_DIRECTING', desc: 'Lock your assets and cinematic goals to every individual scene.' },
                                    { title: 'SYNTHESIS_RENDER', desc: 'Execute the final synthesis for studio-grade, high-fidelity output.' }
                                ].map((step, idx) => (
                                    <div key={idx} className="flex gap-8 group">
                                        <div className="text-[10px] font-black text-zinc-600 group-hover:text-primary transition-colors">0{idx + 1}</div>
                                        <div className="space-y-2">
                                            <h4 className="text-[12px] font-black text-white uppercase tracking-widest">{step.title}</h4>
                                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-loose">{step.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Visual Logic Mockup */}
                        <div className="bg-zinc-950 border border-white/10 p-1 rounded-sm shadow-2xl">
                            <div className="bg-black p-8 border border-white/5 rounded-sm">
                                <div className="flex justify-between items-center mb-12 border-b border-white/5 pb-4">
                                    <div className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">system_active</div>
                                    <div className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.4em]">v.01.2.5</div>
                                </div>
                                <div className="space-y-6 font-mono text-[9px] uppercase tracking-widest">
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">INPUT_VECTOR:</span>
                                        <span className="text-white">[0.82, -0.14, 0.99]</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">INTENT_LOCK:</span>
                                        <span className="text-primary">ESTABLISHED</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">ASSET_DRIFT:</span>
                                        <span className="text-emerald-500">0.000%</span>
                                    </div>
                                    <div className="pt-8 text-zinc-600 italic">
                                        {'>'} FinalFrame_OS // CORE_ACTIVE
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Technical Protocol Spec */}
                <section className="mb-32">
                    <div className="max-w-4xl mx-auto">
                        <div className="overflow-x-auto rounded-sm border border-white/10 bg-black/20">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="border-b border-white/10 bg-white/[0.02]">
                                        <th className="p-8 text-left text-[10px] font-black text-primary uppercase tracking-[0.4em] italic">Protocol_Tier</th>
                                        <th className="p-8 text-left text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em]">Engine_Core</th>
                                        <th className="p-8 text-left text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em]">Validation_Metric</th>
                                    </tr>
                                </thead>
                                <tbody className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                                    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <td className="p-8 text-white italic">Structure_Alpha</td>
                                        <td className="p-8 text-zinc-500">Blueprint_Director_v2</td>
                                        <td className="p-8 text-primary">Narrative_Consistency: 0.98</td>
                                    </tr>
                                    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <td className="p-8 text-white italic">Asset_Delta</td>
                                        <td className="p-8 text-zinc-500">Material_Registry_v4</td>
                                        <td className="p-8 text-primary">Visual_Drift: {'<'} 0.01%</td>
                                    </tr>
                                    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <td className="p-8 text-white italic">Synthesis_Gamma</td>
                                        <td className="p-8 text-zinc-500">Magic_Oven_Render</td>
                                        <td className="p-8 text-primary">Temporal_Stability: 0.95</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* Final CTA */}
                <section className="text-center pt-32 border-t border-white/5">
                    <Link
                        href="/signup"
                        className="group h-16 px-12 inline-flex items-center justify-center rounded-sm bg-primary text-black font-black text-[11px] uppercase tracking-[0.3em] shadow-2xl hover:bg-white transition-all active:scale-[0.98]"
                    >
                        Initialize_Studio_Access
                        <MoveRight className="w-4 h-4 ml-4 opacity-50 group-hover:translate-x-2 transition-transform" />
                    </Link>
                </section>

            </div>
        </div>
    );
}
