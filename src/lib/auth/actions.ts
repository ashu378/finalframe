'use client';

type AuthRequest = {
    action: 'auth:signIn' | 'auth:signOut';
    args: Record<string, unknown>;
};

function field(formData: FormData, name: string) {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
}

function safeNextPath() {
    if (typeof window === 'undefined') return '/dashboard';
    const value = new URLSearchParams(window.location.search).get('redirect');
    return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

async function callConvexAuth(request: AuthRequest) {
    const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(request),
    });

    let body: { error?: string } | null = null;
    try {
        body = await response.json();
    } catch {
        // Treat a non-JSON proxy response as a failed authentication attempt.
    }

    if (!response.ok || body?.error) {
        throw new Error(body?.error || 'Authentication failed.');
    }
}

function showAuthError(path: string, error: unknown) {
    const message = error instanceof Error ? error.message : 'Authentication failed.';
    window.location.assign(`${path}?error=${encodeURIComponent(message)}`);
}

export async function signUp(formData: FormData) {
    try {
        await callConvexAuth({
            action: 'auth:signIn',
            args: {
                provider: 'password',
                params: {
                    flow: 'signUp',
                    email: field(formData, 'email'),
                    password: formData.get('password') || '',
                    name: field(formData, 'fullName'),
                },
            },
        });
        window.location.assign(safeNextPath());
    } catch (error) {
        showAuthError('/signup', error);
    }
}

export async function signIn(formData: FormData) {
    try {
        await callConvexAuth({
            action: 'auth:signIn',
            args: {
                provider: 'password',
                params: {
                    flow: 'signIn',
                    email: field(formData, 'email'),
                    password: formData.get('password') || '',
                },
            },
        });
        window.location.assign(safeNextPath());
    } catch (error) {
        showAuthError('/login', error);
    }
}

/** Sign out through Convex Auth so its HTTP-only cookies are cleared. */
export async function signOut() {
    try {
        await callConvexAuth({ action: 'auth:signOut', args: {} });
        window.location.assign('/');
    } catch {
        // A failed sign-out is not reported as success and can be retried.
    }
}

/** Fails closed until Password({ reset }) has a real email provider. */
export async function requestPasswordReset(formData: FormData) {
    try {
        await callConvexAuth({
            action: 'auth:signIn',
            args: {
                provider: 'password',
                params: { flow: 'reset', email: field(formData, 'email') },
            },
        });
        window.location.assign('/login?message=Check your email for a password reset link');
    } catch (error) {
        showAuthError('/forgot-password', error);
    }
}

export async function updatePassword(formData: FormData) {
    const code = typeof window === 'undefined'
        ? ''
        : new URLSearchParams(window.location.search).get('code') || '';
    const password = formData.get('password') || '';
    const confirmation = formData.get('confirmPassword') || '';

    if (password !== confirmation) {
        showAuthError('/reset-password', new Error('Passwords do not match.'));
        return;
    }

    try {
        await callConvexAuth({
            action: 'auth:signIn',
            args: {
                provider: 'password',
                params: {
                    flow: 'reset-verification',
                    email: field(formData, 'email'),
                    code,
                    newPassword: password,
                },
            },
        });
        window.location.assign('/dashboard');
    } catch (error) {
        showAuthError('/reset-password', error);
    }
}
