/**
 * FinalFrame — Public Layout
 * Reference: MASTER_PRD.md § 5.I — Public Website structure
 * Reference: BUILD_PHASES.md — Phase 0 requires global layouts
 */

import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            {/* --- Static Top Bar (Status) --- */}
            <div className="fixed top-0 left-0 right-0 h-10 bg-black/40 backdrop-blur-md border-b border-white/5 z-[60] flex items-center justify-center">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Private Beta Access Only
                </div>
            </div>
            <Header />
            <main>{children}</main>
            <Footer />
        </>
    );
}
