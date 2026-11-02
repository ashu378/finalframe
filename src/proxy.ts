import { convexAuthNextjsMiddleware } from '@convex-dev/auth/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
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

const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email'];
const PROTECTED_ROUTES = ['/dashboard', '/onboarding'];
const ADMIN_ROUTES = ['/admin'];

function matchesRoute(pathname: string, routes: string[]) {
    return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function routeRedirect(request: NextRequest, path: string) {
    const target = new URL(path, request.url);
    // Next's development proxy can normalize 127.0.0.1 to localhost. Keep
    // local redirects on the browser's origin; accept only loopback hosts.
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    if (process.env.NODE_ENV === 'development' && host && /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) target.host = host;
    return NextResponse.redirect(target);
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
export const proxy = convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
    const { pathname } = request.nextUrl;

    if (isFastExit(pathname)) return NextResponse.next();

    if (MAINTENANCE_MODE && !shouldBypassMaintenance(pathname)) {
        return routeRedirect(request, '/maintenance');
    }

    if (matchesRoute(pathname, PUBLIC_ROUTES)) return NextResponse.next();

    // No deployment URL means auth cannot be verified. Public pages remain
    // reachable, but protected pages never fall through as authenticated.
    const authConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
    const authenticated = authConfigured && await convexAuth.isAuthenticated();

    if (matchesRoute(pathname, AUTH_ROUTES)) {
        return authenticated
            ? routeRedirect(request, '/dashboard')
            : NextResponse.next();
    }

    if (matchesRoute(pathname, PROTECTED_ROUTES) || matchesRoute(pathname, ADMIN_ROUTES)) {
        if (!authenticated) {
            return routeRedirect(request, `/login?${new URLSearchParams({ redirect: pathname })}`);
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
