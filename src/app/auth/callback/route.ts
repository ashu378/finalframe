import { NextResponse } from 'next/server';

function safeNextPath(value: string | null) {
    return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

/**
 * Convex Auth completes code exchange in its Next.js provider/proxy.
 * This compatibility route only forwards the code to a same-origin page.
 */
export async function GET(request: Request) {
    const url = new URL(request.url);
    const destination = new URL(safeNextPath(url.searchParams.get('next')), url.origin);
    const code = url.searchParams.get('code');
    if (code) destination.searchParams.set('code', code);
    return NextResponse.redirect(destination);
}
