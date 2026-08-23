import { convexAuthNextjsMiddleware, nextjsMiddlewareRedirect } from '@convex-dev/auth/nextjs/server';
import { NextResponse } from 'next/server';
import { MAINTENANCE_MODE, shouldBypassMaintenance } from '@/lib/config/maintenance';

const PUBLIC_ROUTES = [
    '/',
    '/about',
    '/methodology',
    '/pricing',
    '/case-studies',
    '/contact',
    '/legal',
    '/review',
];

const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];
const PROTECTED_ROUTES = ['/dashboard', '/onboarding'];
const ADMIN_ROUTES = ['/admin'];

function matchesRoute(pathname: string, routes: string[]) {
    return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isFastExit(pathname: string) {
    return (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname.startsWith('/images') ||
        pathname.startsWith('/fonts') ||
        pathname.includes('.') ||
        pathname === '/favicon.ico'
    );
}

/**
 * Convex Auth owns auth-cookie refresh and /api/auth proxying. Route checks
 * only consume its verified session result and fail closed when unavailable.
 */
export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
    const { pathname } = request.nextUrl;

    if (isFastExit(pathname)) return NextResponse.next();

    if (MAINTENANCE_MODE && !shouldBypassMaintenance(pathname)) {
        return NextResponse.redirect(new URL('/maintenance', request.url));
    }

    if (matchesRoute(pathname, PUBLIC_ROUTES)) return NextResponse.next();

    // No deployment URL means auth cannot be verified. Public pages remain
    // reachable, but protected pages never fall through as authenticated.
    const authConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
    const authenticated = authConfigured && await convexAuth.isAuthenticated();

    if (matchesRoute(pathname, AUTH_ROUTES)) {
        return authenticated
            ? nextjsMiddlewareRedirect(request, '/dashboard')
            : NextResponse.next();
    }

    if (matchesRoute(pathname, PROTECTED_ROUTES) || matchesRoute(pathname, ADMIN_ROUTES)) {
        if (!authenticated) {
            const login = new URL('/login', request.url);
            login.searchParams.set('redirect', pathname);
            return NextResponse.redirect(login);
        }
    }

    return NextResponse.next();
}, {
    // The default /api/auth path is used by the Convex Auth client provider.
    apiRoute: '/api/auth',
});

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
