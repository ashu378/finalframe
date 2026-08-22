import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/** Use only in trusted server routes such as verified payment webhooks. */
export function createAdminClient() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
