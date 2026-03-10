/**
 * FinalFrame — Feature Locks
 * Reference: BUILD_PHASES.md — Phase 0 requires global feature locks
 * 
 * Feature locks that prevent access to features not yet implemented.
 * These enforce the build phase order defined in BUILD_PHASES.md.
 */

import {
    CURRENT_BUILD_PHASE,
    isFeatureUnlocked,
    type FeatureName
} from '@/lib/config/build-phase';
import { getCurrentUserProfile } from '@/lib/guards';

/**
 * Check if project creation is allowed
 * 
 * Reference: BUILD_PHASES.md
 * - Phase 0: "no project creation, no editor access, no rendering before onboarding"
 * - Phase 1, exit rule: "Dashboard, project creation, and editor routes must be blocked unless onboarding = completed"
 * - Phase 2: Project creation becomes available
 * 
 * @returns true if project creation is allowed
 */
export async function canCreateProject(): Promise<boolean> {
    // Check build phase first
    if (CURRENT_BUILD_PHASE < 2) {
        return false;
    }

    // Check if onboarding is complete
    const profile = await getCurrentUserProfile();
    if (!profile || !profile.onboarding_completed) {
        return false;
    }

    return true;
}

/**
 * Check if project creation is allowed (sync version for UI)
 * 
 * Note: This only checks the build phase, not onboarding status.
 * For full check, use canCreateProject()
 */
export function canCreateProjectSync(): boolean {
    return CURRENT_BUILD_PHASE >= 2;
}

/**
 * Check if editor access is allowed
 * 
 * Reference: BUILD_PHASES.md — Phase 4: Editor & AI Remix
 * 
 * @returns true if editor access is allowed
 */
export function canAccessEditor(): boolean {
    return CURRENT_BUILD_PHASE >= 4;
}

/**
 * Check if renderer access is allowed
 * 
 * Reference: BUILD_PHASES.md — Phase 3: Render Pipeline
 * 
 * @returns true if renderer access is allowed
 */
export function canAccessRenderer(): boolean {
    return CURRENT_BUILD_PHASE >= 3;
}

/**
 * Check if export is allowed
 * 
 * Reference: BUILD_PHASES.md — Phase 5: Export & Quality Gates
 * 
 * @returns true if export is allowed
 */
export function canExport(): boolean {
    return CURRENT_BUILD_PHASE >= 5;
}

/**
 * Check if onboarding is available
 * 
 * Reference: BUILD_PHASES.md — Phase 1: Onboarding & Studio Setup
 * 
 * @returns true if onboarding is available
 */
export function canAccessOnboarding(): boolean {
    return CURRENT_BUILD_PHASE >= 1;
}

/**
 * Check if asset management is available
 * 
 * Reference: BUILD_PHASES.md — Phase 6: Asset Management & Consistency
 * 
 * @returns true if asset management is available
 */
export function canAccessAssetManagement(): boolean {
    return CURRENT_BUILD_PHASE >= 6;
}

/**
 * Check if billing is available
 * 
 * Reference: BUILD_PHASES.md — Phase 7: Billing & Credits
 * 
 * @returns true if billing is available
 */
export function canAccessBilling(): boolean {
    return CURRENT_BUILD_PHASE >= 7;
}

/**
 * Check if admin panel is available
 * 
 * Reference: BUILD_PHASES.md — Phase 8: Admin Panel
 * Note: This only checks build phase, not admin role.
 * 
 * @returns true if admin panel build phase is reached
 */
export function canAccessAdminPanel(): boolean {
    return CURRENT_BUILD_PHASE >= 8;
}

/**
 * Get feature lock message for a given feature
 */
export function getFeatureLockMessage(feature: FeatureName): string {
    if (isFeatureUnlocked(feature)) {
        return '';
    }

    return `This feature will be available in a future update. (Requires Phase ${CURRENT_BUILD_PHASE + 1}+)`;
}

/**
 * Feature lock result type
 */
export interface FeatureLockResult {
    locked: boolean;
    message: string;
    requiredPhase: number;
    currentPhase: number;
}

/**
 * Check a feature's lock status with full details
 */
export function checkFeatureLock(feature: FeatureName): FeatureLockResult {
    const { getRequiredPhase } = require('@/lib/config/build-phase');
    const requiredPhase = getRequiredPhase(feature);
    const locked = !isFeatureUnlocked(feature);

    return {
        locked,
        message: locked ? getFeatureLockMessage(feature) : '',
        requiredPhase,
        currentPhase: CURRENT_BUILD_PHASE,
    };
}
