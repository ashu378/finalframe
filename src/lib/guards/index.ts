/**
 * FinalFrame — Route Guards
 * Reference: BUILD_PHASES.md — Phase 0 requires global guards
 * 
 * Server-side guards for route protection.
 * These are used in middleware and server components.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserProfile } from '@/lib/types/database';

/**
 * Require authentication to access a route
 * Redirects to login if not authenticated
 * 
 * @throws Redirect to /login if not authenticated
 * 
 * Reference: BUILD_PHASES.md — "No access to dashboard actions unless authenticated"
 */
export async function requireAuth(): Promise<{ user: { id: string; email: string } }> {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/login');
    }

    return { user: { id: user.id, email: user.email || '' } };
}

/**
 * Require onboarding completion to access protected features
 * Redirects to onboarding if not completed
 * 
 * @throws Redirect to /onboarding if onboarding is not complete
 * 
 * Reference: BUILD_PHASES.md — Phase 1 exit rule
 * "Dashboard, project creation, and editor routes must be blocked unless onboarding = completed"
 */
export async function requireOnboardingComplete(): Promise<UserProfile> {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/login');
    }

    // Get user profile from database
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (!profile || !profile.onboarding_completed) {
        redirect('/onboarding');
    }

    return profile as UserProfile;
}

/**
 * Require admin role to access admin routes
 * Redirects to dashboard if not admin
 * 
 * @throws Redirect to /dashboard if not admin
 * 
 * Reference: MASTER_PRD.md § 5.III — Admin Panel access control
 */
export async function requireAdmin(): Promise<UserProfile> {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/login');
    }

    // Get user profile from database
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (!profile || !profile.is_admin) {
        redirect('/dashboard');
    }

    return profile as UserProfile;
}

/**
 * Get current user without redirecting
 * Returns null if not authenticated
 * 
 * Useful for pages that behave differently based on auth state
 */
export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return null;
    }

    return { id: user.id, email: user.email || '' };
}

/**
 * Get current user profile without redirecting
 * Returns null if not authenticated or profile doesn't exist
 */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return null;
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    return profile as UserProfile | null;
}
