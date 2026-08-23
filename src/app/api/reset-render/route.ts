import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { api } from '../../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';

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
        const convex = await getAuthenticatedConvexClient();
        const current = await convex.query(api.account.current, {});
        const studioExternalId = current?.studio?.externalId;

        if (!studioExternalId) {
            return NextResponse.json({ error: 'Unauthorized - no Convex studio session' }, { status: 401 });
        }

        const projects = await convex.query(api.projects.list, { studioExternalId });
        const project = projects.find((candidate) => candidate.externalId === projectId);

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Convex is the authority for new projects. The previous reset mutated
        // legacy render tables that do not exist in Convex. Do
        // not report success without a real Convex mutation behind the route.
        revalidatePath(`/dashboard/projects/${projectId}`);

        return NextResponse.json({
            success: false,
            error: 'Render reset is not available for this Convex project yet.',
            message: 'The project was found, but no Convex reset operation is currently exposed.'
        }, { status: 409 });
    } catch (e: any) {
        console.error('[API Reset] FATAL:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
