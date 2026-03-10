/**
 * FinalFrame — Auth Server Actions
 * Reference: BUILD_PHASES.md — Phase 0 requires authentication logic
 * 
 * Server actions for authentication operations.
 * All actions redirect on completion (with error params if failed).
 */

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Sign up a new user
 * 
 * Reference: MASTER_PRD.md § 5.I — Signup modal
 */
export async function signUp(formData: FormData) {
    const supabase = await createClient();

    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const fullName = formData.get('fullName') as string;

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
            },
        },
    });

    if (error) {
        redirect(`/signup?error=${encodeURIComponent(error.message)}`);
    }

    // If email confirmation is required, redirect with message
    if (data.user && !data.session) {
        redirect('/login?message=Check your email to confirm your account');
    }

    revalidatePath('/', 'layout');
    redirect('/dashboard');
}

/**
 * Sign in an existing user
 * 
 * Reference: MASTER_PRD.md § 5.I — Login modal
 */
export async function signIn(formData: FormData) {
    const supabase = await createClient();

    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath('/', 'layout');
    redirect('/dashboard');
}

/**
 * Sign out the current user
 * 
 * Reference: MASTER_PRD.md — User can log out
 */
export async function signOut() {
    const supabase = await createClient();

    await supabase.auth.signOut();

    revalidatePath('/', 'layout');
    redirect('/');
}

/**
 * Request password reset
 * 
 * Reference: MASTER_PRD.md § 5.I — Forgot Password modal
 */
export async function requestPasswordReset(formData: FormData) {
    const supabase = await createClient();

    const email = formData.get('email') as string;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/reset-password`,
    });

    if (error) {
        redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
    }

    redirect('/login?message=Check your email for a password reset link');
}

/**
 * Update password (after clicking reset link)
 */
export async function updatePassword(formData: FormData) {
    const supabase = await createClient();

    const password = formData.get('password') as string;

    const { error } = await supabase.auth.updateUser({
        password,
    });

    if (error) {
        redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath('/', 'layout');
    redirect('/dashboard');
}

