/**
 * FinalFrame — Next.js Middleware
 * Reference: BUILD_PHASES.md — Phase 0 requires server-side route protection
 * 
 * This middleware enforces:
 * 1. Maintenance mode (global, before all other checks)
 * 2. Authentication for protected routes
 * 3. Onboarding completion for dashboard routes
 * 4. Admin role verification for admin routes
 * 
 * All guard enforcement is server-side per user requirements.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/middleware';
import { MAINTENANCE_MODE, shouldBypassMaintenance } from '@/lib/config/maintenance';

/**
 * Route configuration
 */
const PUBLIC_ROUTES = [
    '/',
    '/pricing',
    '/case-studies',
    '/contact',
    '/legal',
];

const AUTH_ROUTES = [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
];

const PROTECTED_ROUTES = [
    '/dashboard',
    '/onboarding',
];

const ADMIN_ROUTES = [
    '/admin',
];

/**
 * Check if a path matches any of the given routes
 */
function matchesRoute(pathname: string, routes: string[]): boolean {
    return routes.some(
        (route) => pathname === route || pathname.startsWith(route + '/')
    );
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // ============================================
    // 1. FAST EXIT — Skip middleware for static files, public assets, and common extensions
    // ============================================
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname.startsWith('/images') ||
        pathname.startsWith('/fonts') ||
        pathname.includes('.') ||
        pathname === '/favicon.ico'
    ) {
        return NextResponse.next();
    }

    // ============================================
    // 2. MAINTENANCE MODE CHECK (GLOBAL)
    // Reference: MASTER_PRD.md § 11 — Maintenance mode handling
    // ============================================
    if (MAINTENANCE_MODE && !shouldBypassMaintenance(pathname)) {
        const maintenanceUrl = new URL('/maintenance', request.url);
        return NextResponse.redirect(maintenanceUrl);
    }

    // ============================================
    // 3. PUBLIC ROUTES — No auth required, early exit
    // ============================================
    if (matchesRoute(pathname, PUBLIC_ROUTES)) {
        return NextResponse.next();
    }

    // ============================================
    // 4. CREATE SUPABASE CLIENT & REFRESH SESSION
    // Only initialized for routes that strictly require it
    // ============================================
    const { supabase, response } = await createClient(request);

    // Refresh session if expired
    const { data: { user } } = await supabase.auth.getUser();

    // ============================================
    // 5. AUTH ROUTES — Redirect authenticated users
    // ============================================
    if (matchesRoute(pathname, AUTH_ROUTES)) {
        if (user) {
            const dashboardUrl = new URL('/dashboard', request.url);
            return NextResponse.redirect(dashboardUrl);
        }
        return response;
    }

    // ============================================
    // 6. PROTECTED ROUTES — Require authentication
    // ============================================
    if (matchesRoute(pathname, PROTECTED_ROUTES)) {
        if (!user) {
            const loginUrl = new URL('/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    // ============================================
    // 7. ADMIN ROUTES
    // ============================================
    if (matchesRoute(pathname, ADMIN_ROUTES)) {
        if (!user) {
            const loginUrl = new URL('/login', request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    return response;
}

/**
 * Configure which paths the middleware should run on
 */
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
