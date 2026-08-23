export type FinalFrameFeature =
    | 'productionStudio'
    | 'convexAuth'
    | 'openRouterMedia'
    | 'motionGraphics'
    | 'stylized2d'
    | 'ugcWorkflow'
    | 'cinematicWorkflow'
    | 'bacsPayments'
    | 'adminOperations';

const truthy = new Set(['1', 'true', 'on', 'yes']);

function readFlag(name: string, fallback: boolean) {
    const value = process.env[name];
    return value === undefined ? fallback : truthy.has(value.toLowerCase());
}

const defaults: Record<FinalFrameFeature, boolean> = {
    productionStudio: true,
    convexAuth: false,
    openRouterMedia: true,
    motionGraphics: true,
    stylized2d: false,
    ugcWorkflow: false,
    cinematicWorkflow: false,
    bacsPayments: false,
    adminOperations: false,
};

const envNames: Record<FinalFrameFeature, string> = {
    productionStudio: 'NEXT_PUBLIC_FF_PRODUCTION_STUDIO',
    convexAuth: 'NEXT_PUBLIC_FF_CONVEX_AUTH',
    openRouterMedia: 'NEXT_PUBLIC_FF_OPENROUTER_MEDIA',
    motionGraphics: 'NEXT_PUBLIC_FF_MOTION_GRAPHICS',
    stylized2d: 'NEXT_PUBLIC_FF_STYLIZED_2D',
    ugcWorkflow: 'NEXT_PUBLIC_FF_UGC_WORKFLOW',
    cinematicWorkflow: 'NEXT_PUBLIC_FF_CINEMATIC_WORKFLOW',
    bacsPayments: 'NEXT_PUBLIC_FF_BACS_PAYMENTS',
    adminOperations: 'NEXT_PUBLIC_FF_ADMIN_OPERATIONS',
};

export function isFeatureEnabled(feature: FinalFrameFeature) {
    return readFlag(envNames[feature], defaults[feature]);
}

export function getFeatureFlags(): Record<FinalFrameFeature, boolean> {
    return Object.fromEntries(
        (Object.keys(defaults) as FinalFrameFeature[]).map((feature) => [feature, isFeatureEnabled(feature)]),
    ) as Record<FinalFrameFeature, boolean>;
}
