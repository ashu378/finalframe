/**
 * FinalFrame — Admin Moderation Page
 * Reference: MASTER_PRD.md § 5.III — Content moderation
 * Reference: BUILD_PHASES.md — Phase 8: Admin Panel
 */

import { requireAdmin } from '@/lib/guards';
import { FeatureLock } from '@/components/feature-lock';

export const metadata = {
    title: 'Content Moderation',
    description: 'FinalFrame Content Moderation',
};

export default async function AdminModerationPage() {
    await requireAdmin();

    return (
        <FeatureLock
            feature="contentModeration"
            title="Content Moderation"
            description="Review flagged content and enforce community guidelines. Coming in Phase 8."
        />
    );
}
