export const CURRENT_BUILD_PHASE: number = 6;

export type FeatureName =
    | 'onboarding'
    | 'dashboard'
    | 'projectCreation'
    | 'aiScript'
    | 'aiVisuals'
    | 'editor'
    | 'export'
    | 'mediaLibrary'
    | 'templates'
    | 'teamSettings'
    | 'billing'
    | 'contentModeration'
    | 'adminDashboard'
    | 'userManagement';

/**
 * Returns the required phase for a feature
 */
export function getRequiredPhase(feature: FeatureName): number {
    switch (feature) {
        case 'onboarding': return 0;
        case 'dashboard': return 0;
        case 'projectCreation': return 2;
        case 'aiScript': return 2;
        case 'aiVisuals': return 3;
        case 'editor': return 4;
        case 'export': return 5;
        case 'mediaLibrary': return 6;
        case 'templates': return 6;
        case 'teamSettings': return 6;
        case 'billing': return 7;
        case 'contentModeration': return 8;
        case 'adminDashboard': return 8;
        case 'userManagement': return 8;
        default: return 99;
    }
}

export function isFeatureUnlocked(feature: FeatureName): boolean {
    return CURRENT_BUILD_PHASE >= getRequiredPhase(feature);
}
