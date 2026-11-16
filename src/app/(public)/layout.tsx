/**
 * FinalFrame — Public Layout
 * Reference: MASTER_PRD.md § 5.I — Public Website structure
 * Reference: BUILD_PHASES.md — Phase 0 requires global layouts
 */

import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ScrollRevealRoot } from '@/components/threeui/scroll-reveal-root';

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <div className="border-b border-border/70 bg-secondary/60 px-4 py-2 text-center text-xs font-medium text-muted-foreground">
                Your next video starts with an idea.
            </div>
            <Header />
            <ScrollRevealRoot selector="[data-reveal]" />
            <main id="main-content">{children}</main>
            <Footer />
        </>
    );
}
