/**
 * FinalFrame — Dashboard Layout
 * Reference: MASTER_PRD.md § 5.II — User Dashboard
 * Reference: BUILD_PHASES.md — Phase 0 requires protected dashboard layout
 * 
 * Protected layout with sidebar. Auth guard enforced in middleware.
 */

import { Sidebar } from '@/components/layout/sidebar';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Middleware handles basic auth, but layout handles the onboarding/admin logic
    if (!user) {
        return redirect('/login');
    }

    // Fetch profile for onboarding & admin status
    const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed, is_admin')
        .eq('id', user.id)
        .single();

    // Force onboarding if not completed
    if (!profile?.onboarding_completed) {
        // Since this layout wraps (dashboard) routes, any access here 
        // with an incomplete profile should lead to onboarding.
        return redirect('/onboarding');
    }

    // Admin Access Control
    // If we're on a route starting with /admin, ensure the user is an admin
    // In a Server Layout, we can't easily see the current path without headers 
    // or a client component, but we can rely on the page itself or middleware for the path-specific check.
    // However, since we moved it from middleware, we should ideally check it here if possible,
    // or just let the /admin/page fetch the profile.
    // Given the middleware now allows it, we'll keep it simple: layout enforces onboarding, 
    // and admin pages check their own permissions.

    return (
        <div className="min-h-screen bg-background text-foreground flex font-sans selection:bg-primary/20 selection:text-primary overflow-hidden relative">
            {/* ... rest of the JSX ... */}
            <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-600/10 blur-[150px] rounded-full mix-blend-screen animate-pulse duration-[5000ms]" />
                <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-fuchsia-600/10 blur-[150px] rounded-full mix-blend-screen" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-150 contrast-150" />
            </div>

            <div className="relative z-20 h-screen sticky top-0">
                <Sidebar />
            </div>

            <main className="flex-1 relative z-10 overflow-y-auto h-screen">
                <div className="container mx-auto px-6 py-8 max-w-7xl">
                    {children}
                </div>
            </main>
        </div>
    );
}
