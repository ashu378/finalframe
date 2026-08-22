'use server';

import { createClient } from '@/lib/supabase/server';
import { type FullProject } from '@/lib/types/database';
import { getStudioCreditBalance } from '@/lib/credits/service';

export async function getDashboardOverview() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: studio } = user ? await supabase.from('studios').select('id').eq('user_id', user.id).single() : { data: null };

    // 1. Fetch Stats
    const [
        { count: totalProjects },
        { count: activeJobs },
        { count: totalAssets },
    ] = await Promise.all([
        supabase.from('projects').select('*', { count: 'exact', head: true }).is('archived_at', null).neq('state', 'archived'),
        supabase.from('render_jobs').select('*', { count: 'exact', head: true }).in('status', ['queued', 'processing']),
        supabase.from('studio_assets').select('*', { count: 'exact', head: true }),
    ]);

    // 2. Fetch Recent Projects
    const { data: recentProjects } = await supabase
        .from('projects')
        .select(`
            *,
            studio:studios (id, name),
            actor:ai_actors (id, name, type)
        `)
        .is('archived_at', null)
        .neq('state', 'archived')
        .order('updated_at', { ascending: false })
        .limit(5);

    // 3. Construct Activities (Mocked for now based on recent projects/assets)
    // In a real app, this would query an audit_logs or notifications table.
    const activities = (recentProjects || []).slice(0, 4).map(p => ({
        id: p.id,
        type: 'project' as const,
        label: p.name,
        description: `Project state updated to ${p.state}`,
        timestamp: p.updated_at
    }));

    return {
        stats: {
            totalProjects: totalProjects || 0,
            activeJobs: activeJobs || 0,
            totalAssets: totalAssets || 0,
        creditsRemaining: studio ? await getStudioCreditBalance(studio.id) : 0,
        },
        recentProjects: (recentProjects as FullProject[]) || [],
        activities
    };
}
