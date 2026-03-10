/**
 * FinalFrame — Case Studies
 * "Results worth auditing."
 */

import Link from 'next/link';
import { Play, MoveRight } from 'lucide-react';

export const metadata = {
    title: 'Case Studies // FinalFrame',
    description: 'See how creators are using FinalFrame to produce Hollywood-standard content.',
};

export default function CaseStudiesPage() {
    return (
        <div className="min-h-screen pt-40 pb-20 bg-background text-foreground selection:bg-primary/20">
            <div className="container px-6 mx-auto">

                {/* Header Section */}
                <header className="max-w-4xl mb-32">
                    <h1 className="text-[14px] font-black uppercase tracking-[0.4em] mb-6 text-primary italic">Success_Manifests</h1>
                    <h2 className="text-5xl md:text-7xl font-black tracking-tight leading-[0.9] text-white uppercase italic">
                        Proof_of<br />
                        <span className="text-zinc-500">Production.</span>
                    </h2>
                    <p className="text-[12px] font-bold text-zinc-400 uppercase tracking-[0.2em] mt-12 max-w-xl leading-relaxed">
                        Explore how industry-leading agencies and studios are utilizing deterministic
                        AI to streamline high-fidelity video throughput.
                    </p>
                </header>

                {/* Placeholder Content */}
                <section className="border-t border-white/5 pt-32 mb-32">
                    <div className="bg-black/40 border border-white/5 p-20 rounded-sm text-center relative overflow-hidden group">
                        {/* Visual Grid Detail */}
                        <div className="absolute inset-0 opacity-[0.02] pointer-events-none">
                            <div className="w-full h-full bg-[linear-gradient(to_right,#ffffff1a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff1a_1px,transparent_1px)] bg-[size:40px_40px]" />
                        </div>

                        <div className="relative z-10 space-y-8">
                            <div className="w-20 h-20 bg-zinc-900 border border-white/5 rounded-sm flex items-center justify-center mx-auto mb-12">
                                <Play className="w-6 h-6 text-zinc-500 animate-pulse" />
                            </div>
                            <h3 className="text-2xl font-black text-white uppercase italic tracking-tight">Signal_Pending</h3>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.3em] max-w-xs mx-auto leading-loose">
                                We are currently declassifying success stories from our private beta partners.
                            </p>
                            <div className="pt-12">
                                <Link
                                    href="/signup"
                                    className="text-[9px] font-black text-primary uppercase tracking-[0.4em] hover:text-white transition-colors underline underline-offset-8"
                                >
                                    Join_Beta_for_Access
                                </Link>
                            </div>
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
