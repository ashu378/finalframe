/**
 * FinalFrame — Dashboard Home Page
 * Reference: MASTER_PRD.md § 5.II — Dashboard Home
 * Reference: BUILD_PHASES.md — Phase 2 Project Creation
 * 
 * Shows project list and "New Project" button.
 */

import { requireAuth, getCurrentUserProfile } from '@/lib/guards';
import { getProjectsForUser, getStudioContext } from '@/lib/project/actions';
import { getDashboardOverview } from '@/lib/dashboard/actions';
import { DashboardClient } from './dashboard-client';

export const metadata = {
    title: 'Productions | FinalFrame',
    description: 'Manage and create your studio productions',
};

export default async function DashboardPage() {
    // Ensure user is authenticated
    const { user } = await requireAuth();

    // Fetch user's projects, studio context, overview stats, and profile
    const [projectRes, studioRes, overviewData, profile] = await Promise.all([
        getProjectsForUser(),
        getStudioContext(),
        getDashboardOverview(),
        getCurrentUserProfile()
    ]);

    const projects = projectRes.success ? (projectRes.projects || []) : [];
    const studioId = studioRes.success ? studioRes.studioId : undefined;
    const userAccount = profile?.full_name || user.email;

    return (
        <div className="space-y-6">
            <DashboardClient
                userAccount={userAccount}
                projects={projects}
                studioId={studioId}
                title="Productions"
                stats={overviewData.stats}
                activities={overviewData.activities}
            />
        </div>
    );
}
