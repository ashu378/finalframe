/**
 * FinalFrame — About
 * "The creative operating system."
 */

import Link from 'next/link';
import { Sparkles, Globe, Heart, Shield, MoveRight } from 'lucide-react';

export const metadata = {
    title: 'About // FinalFrame',
    description: 'The creative operating system for Hollywood-standard content.',
};

export default function AboutPage() {
    return (
        <div className="min-h-screen pt-40 pb-20 bg-background text-foreground selection:bg-primary/20">
            <div className="container px-6 mx-auto">

                {/* Mission Section */}
                <header className="max-w-4xl mb-32">
                    <h1 className="text-[14px] font-black uppercase tracking-[0.4em] mb-6 text-primary italic">Operational_Mission</h1>
                    <h2 className="text-5xl md:text-7xl font-black tracking-tight leading-[0.9] text-white uppercase italic">
                        Bridging_Intent<br />
                        <span className="text-zinc-500">and_Execution.</span>
                    </h2>
                    <p className="text-[12px] font-bold text-zinc-400 uppercase tracking-[0.2em] mt-12 max-w-xl leading-relaxed">
                        FinalFrame is the creative operating system built for deterministic video production.
                        We believe that the future of content isn't manual labor—it's structural intent.
                    </p>
                </header>

                {/* Core Vision Grid */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-24 mb-32 items-center">
                    <div className="space-y-12">
                        <div className="space-y-6">
                            <h3 className="text-3xl font-black text-white uppercase italic tracking-tight">The_Standard</h3>
                            <p className="text-[14px] font-bold text-zinc-400 uppercase leading-relaxed tracking-wide">
                                Hollywood-standard content should be accessible to anyone with a vision.
                                By abstracting the technical friction of production, we allow creators to focus
                                on what matters: the signal.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-8">
                            {[
                                { icon: Globe, label: 'GLOBAL_REACH', desc: 'A studio-grade pipeline available anywhere in the world.' },
                                { icon: Shield, label: 'BRAND_SECURITY', desc: 'Deterministic results that protect your visual identity.' },
                                { icon: Heart, label: 'CREATOR_FIRST', desc: 'Designed to amplify human intent, not replace it.' }
                            ].map((item, idx) => (
                                <div key={idx} className="flex gap-6 items-start group">
                                    <div className="w-10 h-10 rounded-sm bg-zinc-900 border border-white/5 flex items-center justify-center shrink-0 group-hover:border-primary/30 transition-colors">
                                        <item.icon className="w-4 h-4 text-zinc-500 group-hover:text-primary transition-colors" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-[11px] font-black text-white uppercase tracking-widest">{item.label}</h4>
                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-loose">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative">
                        <div className="aspect-[4/5] bg-zinc-950 border border-white/5 rounded-sm p-1 shadow-2xl overflow-hidden relative group">
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none opacity-50" />
                            <div className="h-full border border-white/5 rounded-sm p-12 flex flex-col justify-end">
                                <div className="space-y-4">
                                    <Sparkles className="w-12 h-12 text-primary" />
                                    <div className="text-[14px] font-black text-white uppercase tracking-[0.3em] italic">FinalFrame_Core</div>
                                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-loose max-w-xs">
                                        "The creative process is no longer a mystery. It is a protocol."
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Status Float Detail */}
                        <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-black border border-white/10 rounded-sm p-6 shadow-2xl">
                            <div className="text-[9px] font-black text-primary uppercase tracking-[0.3em] mb-4">status</div>
                            <div className="space-y-2">
                                <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                                    <div className="h-full w-2/3 bg-primary" />
                                </div>
                                <div className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Optimizing_Workflow</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Team / Origin Section */}
                <section className="pt-32 border-t border-white/5 mb-32">
                    <div className="max-w-2xl">
                        <h2 className="text-[11px] font-black text-primary uppercase tracking-[0.4em] mb-8 italic">Operational_Context</h2>
                        <h3 className="text-4xl font-black tracking-tight text-white uppercase italic mb-12">Built_for_Deterministic_Output.</h3>
                        <p className="text-[14px] font-bold text-zinc-400 uppercase leading-relaxed tracking-wide mb-12">
                            FinalFrame was founded by a collective of directors, engineers, and designers who were tired
                            of the "slot machine" nature of early generative AI. We set out to build the tool we needed:
                            a studio that prioritizes certainty over chance.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-12 pt-12">
                        {[
                            { label: 'Studio_Nodes', value: '4.2k+' },
                            { label: 'Render_Throughput', value: '250GB/s' },
                            { label: 'Uptime_Compliance', value: '99.99%' },
                            { label: 'IP_Isolation', value: 'Hardware-Level' }
                        ].map((stat, idx) => (
                            <div key={idx} className="space-y-2">
                                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{stat.label}</p>
                                <p className="text-2xl font-black text-white italic">{stat.value}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Ecosystem Section */}
                <section className="py-32 bg-zinc-950 border border-white/5 rounded-sm p-12 mb-32 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-12 opacity-[0.05]">
                        <Globe className="w-64 h-64 text-primary" />
                    </div>
                    <div className="relative z-10 max-w-2xl">
                        <h3 className="text-3xl font-black text-white uppercase italic mb-8">The_Studio_Ecosystem</h3>
                        <p className="text-[13px] font-bold text-zinc-400 uppercase leading-loose tracking-wider mb-12">
                            FinalFrame is more than an editor. It is a unified environment for asset management,
                            collaborative directing, and automated high-fidelity synthesis. Our ecosystem is
                            built on the principles of isolation, speed, and creative persistence.
                        </p>
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
