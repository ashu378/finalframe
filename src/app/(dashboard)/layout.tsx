/**
 * FinalFrame — Dashboard Layout
 * Reference: MASTER_PRD.md § 5.II — User Dashboard
 * Reference: BUILD_PHASES.md — Phase 0 requires protected dashboard layout
 *
 * Protected layout with sidebar. Auth guard enforced in the Next.js proxy.
 */

import { Sidebar } from '@/components/layout/sidebar';
import { requireOnboardingComplete } from '@/lib/guards';
import Link from 'next/link';
import Image from 'next/image';
import { Plus } from 'lucide-react';
import { MobileStudioMenu } from '@/components/layout/mobile-studio-menu';
import { api } from '@/../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { readPlatformRole } from '@/lib/guards/platform';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireOnboardingComplete();
    // Repair accounts created before automatic starter-studio provisioning.
    // This is idempotent and keeps the project flow independent of onboarding.
    await (await getAuthenticatedConvexClient()).mutation(api.account.ensureAccount, {});

    const canAccessPlatform = !!(await readPlatformRole());

    return (
        <div className="min-h-dvh bg-background text-foreground font-sans">
            <div className="relative z-20 hidden md:block">
                <Sidebar canAccessPlatform={canAccessPlatform} />
            </div>
            <nav className="sticky top-0 z-20 flex items-center justify-between border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl md:hidden" aria-label="Mobile studio navigation">
                <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-8 place-items-center overflow-hidden rounded-lg border border-border/70 bg-card"><Image src="/brand/finalframe-icon-v1.png" alt="" width={32} height={32} className="size-full object-cover" priority /></span><span className="hidden min-[380px]:inline">FinalFrame</span></Link>
                <div className="flex items-center gap-2">
                    <Link href="/dashboard/create" className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground" aria-label="Create a video"><Plus className="size-5" /></Link>
                    <MobileStudioMenu canAccessPlatform={canAccessPlatform} />
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
