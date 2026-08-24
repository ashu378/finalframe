import { isAuthenticatedNextjs, convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { makeFunctionReference } from 'convex/server';
import { ConvexHttpClient } from 'convex/browser';
import { redirect } from 'next/navigation';
import type { UserProfile } from '@/lib/types/database';

type VerifiedUser = {
    id: string;
    email: string;
    name: string | null;
    onboardingCompleted: boolean;
    isAdmin: boolean;
    role: 'owner' | 'admin' | 'member' | null;
    studioExternalId: string | null;
    createdAt: number;
};

const currentUserQuery = makeFunctionReference<'query', {}, VerifiedUser | null>('auth:currentUser');

async function getVerifiedUser(): Promise<VerifiedUser | null> {
    if (!process.env.NEXT_PUBLIC_CONVEX_URL) return null;

    try {
        if (!(await isAuthenticatedNextjs({ convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL }))) {
            return null;
        }

        const token = await convexAuthNextjsToken();
        if (!token) return null;

        const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL, {
            auth: token,
            logger: false,
        });
        return await client.query(currentUserQuery, {});
    } catch {
        // Auth/provider/configuration errors must never become an allow path.
        return null;
    }
}

function profileFromUser(user: VerifiedUser): UserProfile {
    const timestamp = new Date(user.createdAt).toISOString();
    return {
        id: user.id,
        email: user.email,
        full_name: user.name,
        avatar_url: null,
        onboarding_completed: user.onboardingCompleted,
        is_admin: user.isAdmin,
        studio_name: null,
        role: user.isAdmin ? 'admin' : 'creator',
        created_at: timestamp,
        updated_at: timestamp,
    };
}

/** Require a verified Convex Auth session. */
export async function requireAuth(): Promise<{ user: { id: string; email: string } }> {
    const user = await getVerifiedUser();
    if (!user) redirect('/login');
    return { user: { id: user.id, email: user.email } };
}

/** Require a verified session with a Convex-backed studio. */
export async function requireOnboardingComplete(): Promise<UserProfile> {
    const user = await getVerifiedUser();
    if (!user) redirect('/login');
    if (!user.onboardingCompleted) redirect('/onboarding');
    return profileFromUser(user);
}

/**
 * Admin access is deny-by-default until an explicit Convex role claim/storage
 * is provisioned. No caller-supplied role or user id can grant access.
 */
export async function requireAdmin(): Promise<UserProfile> {
    const user = await getVerifiedUser();
    if (!user) redirect('/login');
    if (!user.isAdmin) redirect('/dashboard');
    return profileFromUser(user);
}

/** Get the verified current user without redirecting. */
export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
    const user = await getVerifiedUser();
    return user ? { id: user.id, email: user.email } : null;
}

/** Get the verified current user profile without redirecting. */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
    const user = await getVerifiedUser();
    return user ? profileFromUser(user) : null;
}
