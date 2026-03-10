import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * EMERGENCY RESET ENDPOINT
 * Visit: /api/reset-render?projectId=YOUR_PROJECT_ID
 */
export async function GET(request: NextRequest) {
    const projectId = request.nextUrl.searchParams.get('projectId');

    if (!projectId) {
        return NextResponse.json({ error: 'Missing projectId query parameter' }, { status: 400 });
    }

    console.log(`[API Reset] >>> FORCE RESET: ${projectId}`);

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized - no session' }, { status: 401 });
        }

        console.log(`[API Reset] User: ${user.id}`);

        // Cancel job
        const { data: jobs } = await supabase
            .from('render_jobs')
            .select('id, status')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(1);

        const job = jobs?.[0];
        if (job && (job.status === 'queued' || job.status === 'processing')) {
            await supabase
                .from('render_jobs')
                .update({ status: 'cancelled', error_message: 'API_RESET' })
                .eq('id', job.id);
            console.log(`[API Reset] Job ${job.id} cancelled`);
        }

        // Reset project
        const { data: updateResult, error } = await supabase
            .from('projects')
            .update({ state: 'approved', execution_locked: false })
            .eq('id', projectId)
            .select();

        console.log(`[API Reset] Update result: ${updateResult?.length} rows affected, error: ${error?.message || 'none'}`);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!updateResult || updateResult.length === 0) {
            return NextResponse.json({ error: 'RLS_BLOCKED: Zero rows affected' }, { status: 403 });
        }

        revalidatePath(`/dashboard/projects/${projectId}`);

        return NextResponse.json({
            success: true,
            message: 'Project reset to approved state',
            rowsAffected: updateResult.length
        });
    } catch (e: any) {
        console.error('[API Reset] FATAL:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
