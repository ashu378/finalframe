/**
 * FinalFrame — Supabase Browser Client
 * Reference: BUILD_PHASES.md — Phase 0 requires authentication
 * 
 * Creates a Supabase client for use in browser/client components.
 * This client handles user sessions automatically.
 */

import { createBrowserClient } from '@supabase/ssr';

/**
 * Create a Supabase client for browser-side operations
 * 
 * Usage:
 * ```tsx
 * 'use client';
 * import { createClient } from '@/lib/supabase/client';
 * 
 * const supabase = createClient();
 * ```
 */
export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}
