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
                Early access is open — bring an idea and make your first video.
            </div>
            <Header />
            <ScrollRevealRoot selector="#main-content > section, #main-content > div > section, #main-content > .legal-document-container, #main-content > div > .legal-document-container, #main-content > div > main" />
            <main id="main-content">{children}</main>
            <Footer />
        </>
    );
}
