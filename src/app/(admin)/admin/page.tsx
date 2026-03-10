/**
 * FinalFrame — Admin Dashboard Page
 * Reference: MASTER_PRD.md § 5.III — Admin dashboard (usage, MRR)
 * Reference: BUILD_PHASES.md — Phase 8: Admin Panel (feature locked in Phase 0)
 * 
 * UI shell only. No mock data per user requirements.
 * Access is server-side enforced via middleware.
 */

import { requireAdmin } from '@/lib/guards';
import { FeatureLock } from '@/components/feature-lock';

export const metadata = {
    title: 'Admin Dashboard',
    description: 'FinalFrame Admin Dashboard',
};

export default async function AdminDashboardPage() {
    // Ensure user is admin (server-side guard)
    await requireAdmin();

    return (
        <FeatureLock
            feature="adminDashboard"
            title="Admin Dashboard"
            description="View usage metrics, MRR, and system health. Full admin features coming in Phase 8."
        />
    );
}
