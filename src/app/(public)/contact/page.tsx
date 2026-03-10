/**
 * FinalFrame — Contact
 * "Open signal for collaboration."
 */

import Link from 'next/link';
import { Mail, MessageSquare, MoveRight } from 'lucide-react';

export const metadata = {
    title: 'Contact // FinalFrame',
    description: 'Get in touch with the FinalFrame team.',
};

export default function ContactPage() {
    return (
        <div className="min-h-screen pt-40 pb-20 bg-background text-foreground selection:bg-primary/20">
            <div className="container px-6 mx-auto">

                {/* Header Section */}
                <header className="max-w-4xl mb-32">
                    <h1 className="text-metadata text-primary mb-6">Signal Inquiry</h1>
                    <h2 className="public-heading-hero">
                        Initialize<br />
                        <span className="text-zinc-500 font-sans italic">Connection.</span>
                    </h2>
                    <p className="public-body-text mt-12 max-w-xl">
                        Have questions about our process or looking for specialized
                        enterprise authorization? Our core team is available for direct signal.
                    </p>
                </header>

                {/* Contact Card */}
                <section className="max-w-xl mb-32">
                    <div className="bg-black/40 border border-white/5 p-12 rounded-sm group hover:border-primary/20 transition-all duration-500 relative overflow-hidden">
                        {/* Visual Detail */}
                        <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                            <MessageSquare className="w-32 h-32 text-primary" />
                        </div>

                        <div className="relative z-10 space-y-12">
                            <div className="space-y-4">
                                <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.3em] italic">Direct_Channel</h3>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-loose">
                                    For general inquiries, sales protocol, or technical support.
                                </p>
                            </div>

                            <div className="space-y-8">
                                <div className="space-y-2">
                                    <div className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.3em]">Email_ID</div>
                                    <a
                                        href="mailto:hello@finalframe.ai"
                                        className="text-2xl font-black text-white hover:text-primary transition-colors uppercase italic tracking-tight underline underline-offset-8 decoration-white/10 hover:decoration-primary/50"
                                    >
                                        hello@finalframe.ai
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* FAQ / Context Section */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-24 pt-32 border-t border-white/5 mb-32">
                    <div className="space-y-6">
                        <h4 className="text-[11px] font-black text-white uppercase tracking-widest">Urgent_Support</h4>
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] leading-loose">
                            Existing beta participants should use the internal 'Signal Support' channel for immediate assistance during active production cycles.
                        </p>
                    </div>
                    <div className="space-y-6">
                        <h4 className="text-[11px] font-black text-white uppercase tracking-widest">Media_Inquiries</h4>
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] leading-loose">
                            For press kits, brand assets, or interview requests, please prepend 'PRESS' to your email subject line.
                        </p>
                    </div>
                </section>

                {/* Final CTA */}
                <section className="text-center pt-32 border-t border-zinc-800">
                    <Link
                        href="/signup"
                        className="primary-cta inline-flex"
                    >
                        Initialize Studio Access
                        <MoveRight className="w-4 h-4 ml-4 opacity-50 group-hover:translate-x-2 transition-transform" />
                    </Link>
                </section>

            </div>
        </div>
    );
}
