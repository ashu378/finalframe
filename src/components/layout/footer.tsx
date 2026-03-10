import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="bg-background border-t border-white/5 py-12 md:py-16 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/5 blur-[100px] rounded-full pointer-events-none opacity-50" />

            <div className="container relative z-10 px-4 md:px-0">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
                    {/* Brand */}
                    <div className="md:col-span-1">
                        <Link href="/" className="inline-flex items-center gap-2 mb-6">
                            <div className="w-8 h-8 rounded-sm bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                                <div className="w-2.5 h-2.5 bg-black rounded-sm" />
                            </div>
                            <span className="text-xl font-black tracking-[0.2em] uppercase italic">FinalFrame</span>
                        </Link>
                        <p className="text-muted-foreground leading-relaxed text-sm">
                            Studio-grade creative production for Hollywood-standard content. Replace your pipeline with process.
                        </p>
                    </div>

                    {/* Product Links */}
                    <div>
                        <h4 className="font-semibold mb-6 text-white">Product</h4>
                        <nav className="flex flex-col gap-3">
                            <Link href="/pricing" className="text-muted-foreground hover:text-white transition-colors text-sm">
                                Pricing
                            </Link>
                            <Link href="/case-studies" className="text-muted-foreground hover:text-white transition-colors text-sm">
                                Case Studies
                            </Link>
                            <Link href="/studio" className="text-muted-foreground hover:text-white transition-colors text-sm">
                                Studio
                            </Link>
                        </nav>
                    </div>

                    {/* Company Links */}
                    <div>
                        <h4 className="font-semibold mb-6 text-white">Company</h4>
                        <nav className="flex flex-col gap-3">
                            <Link href="/contact" className="text-muted-foreground hover:text-white transition-colors text-sm">
                                Contact
                            </Link>
                            <Link href="/about" className="text-muted-foreground hover:text-white transition-colors text-sm">
                                About Us
                            </Link>
                        </nav>
                    </div>

                    {/* Legal Links */}
                    <div>
                        <h4 className="font-semibold mb-6 text-white">Legal</h4>
                        <nav className="flex flex-col gap-3">
                            <Link href="/legal/terms" className="text-muted-foreground hover:text-white transition-colors text-sm">
                                Terms of Service
                            </Link>
                            <Link href="/legal/privacy" className="text-muted-foreground hover:text-white transition-colors text-sm">
                                Privacy Policy
                            </Link>
                            <Link href="/legal/cookies" className="text-muted-foreground hover:text-white transition-colors text-sm">
                                Cookie Policy
                            </Link>
                        </nav>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5">
                    <p className="text-xs text-muted-foreground">
                        © {currentYear} FinalFrame. All rights reserved.
                    </p>
                    <div className="flex items-center gap-6 mt-4 md:mt-0">
                        {/* Socials / Extra Links if needed */}
                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-500 px-3 py-1 rounded-sm bg-white/5 border border-white/5">
                            <div className="w-1.5 h-1.5 rounded-sm bg-emerald-500 animate-pulse" />
                            Core_Systems_Operational
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
