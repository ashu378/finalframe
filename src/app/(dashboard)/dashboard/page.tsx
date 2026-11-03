/**
 * FinalFrame — Dashboard Home Page
 * Reference: MASTER_PRD.md § 5.II — Dashboard Home
 * Reference: BUILD_PHASES.md — Phase 2 Project Creation
 *
 * Shows project list and "New Project" button.
 */

import { requireAuth, getCurrentUserProfile } from '@/lib/guards';
import { getStudioContext } from '@/lib/project/actions';
import { getDashboardOverview } from '@/lib/dashboard/actions';
import { getProjectLibraryPage } from '@/lib/project/library-actions';
import { DashboardClient } from './dashboard-client';
import { api } from '@/../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { toLifecycleProjectCard } from '@/lib/project/lifecycle-presentation';

export const metadata = {
    title: 'Productions | FinalFrame',
    description: 'Manage and create your studio productions',
};

export default async function DashboardPage() {
    // Ensure user is authenticated
    const { user } = await requireAuth();

    // Next.js may render a parent layout and its page concurrently. Provision
    // the starter workspace here before starting dashboard queries so new
    // accounts never race the overview query and see a missing-studio error.
    await (await getAuthenticatedConvexClient()).mutation(api.account.ensureAccount, {});

    // Fetch user's projects, studio context, overview stats, and profile
    const [projectPage, studioRes, overviewData, profile] = await Promise.all([
        getProjectLibraryPage({ mode: 'active', preview: true }),
        getStudioContext(),
        getDashboardOverview(),
        getCurrentUserProfile()
    ]);

    const projects = projectPage.page.map(toLifecycleProjectCard);
    const studioId = studioRes.success ? studioRes.studioId : undefined;
    const userAccount = profile?.full_name || user.email;

    return (
        <div className="space-y-6">
            <DashboardClient
                userAccount={userAccount}
                projects={projects}
                projectsLimited={!projectPage.isDone}
                studioId={studioId}
                title="Productions"
                stats={overviewData.stats}
                activities={overviewData.activities}
            />
        </div>
    );
}
