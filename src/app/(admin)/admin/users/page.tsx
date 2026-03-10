/**
 * FinalFrame — Admin Users Page
 * Reference: MASTER_PRD.md § 5.III — User management
 * Reference: BUILD_PHASES.md — Phase 8: Admin Panel
 */

import { requireAdmin } from '@/lib/guards';
import { FeatureLock } from '@/components/feature-lock';

export const metadata = {
    title: 'User Management',
    description: 'FinalFrame User Management',
};

export default async function AdminUsersPage() {
    await requireAdmin();

    return (
        <FeatureLock
            feature="userManagement"
            title="User Management"
            description="Manage users, view activity, and adjust permissions. Coming in Phase 8."
        />
    );
}
