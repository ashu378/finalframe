/**
 * FinalFrame — Dashboard Layout
 * Reference: MASTER_PRD.md § 5.II — User Dashboard
 * Reference: BUILD_PHASES.md — Phase 0 requires protected dashboard layout
 * 
 * Protected layout with sidebar. Auth guard enforced in middleware.
 */

import { Sidebar } from '@/components/layout/sidebar';
import { requireOnboardingComplete } from '@/lib/guards';
import Link from 'next/link';
import { Film, FolderOpen, Plus, Settings } from 'lucide-react';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireOnboardingComplete();

    // Admin Access Control
    // If we're on a route starting with /admin, ensure the user is an admin
    // In a Server Layout, we can't easily see the current path without headers 
    // or a client component, but we can rely on the page itself or middleware for the path-specific check.
    // However, since we moved it from middleware, we should ideally check it here if possible,
    // or just let the /admin/page fetch the profile.
    // Given the middleware now allows it, we'll keep it simple: layout enforces onboarding, 
    // and admin pages check their own permissions.

    return (
        <div className="min-h-dvh bg-background text-foreground font-sans">
            <div className="relative z-20 hidden md:block">
                <Sidebar />
            </div>
            <nav className="sticky top-0 z-20 flex items-center justify-between border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl md:hidden" aria-label="Mobile studio navigation">
                <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-8 place-items-center rounded-lg bg-foreground text-background"><Film className="size-4" /></span>FinalFrame</Link>
                <div className="flex items-center gap-1">
                    <Link href="/dashboard/create" className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground" aria-label="Create a video"><Plus className="size-4" /></Link>
                    <Link href="/dashboard/assets" className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Media library"><FolderOpen className="size-4" /></Link>
                    <Link href="/dashboard/settings" className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Settings and credits"><Settings className="size-4" /></Link>
                </div>
            </nav>
            <main id="main-content" className="min-h-dvh md:ml-64">
                <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-8 sm:py-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
