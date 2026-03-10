// Phase 5: Export Constants

export const EXPORT_PLATFORMS = ['tiktok', 'reels', 'youtube', 'twitter', 'linkedin'] as const;
export type ExportPlatform = typeof EXPORT_PLATFORMS[number];

export const EXPORT_RESOLUTIONS = ['720p', '1080p', '4k'] as const;
export type ExportResolution = typeof EXPORT_RESOLUTIONS[number];

// Cost Matrix (Credits)
export const EXPORT_COSTS: Record<ExportPlatform, Record<ExportResolution, number>> = {
    tiktok: {
        '720p': 1,
        '1080p': 2,
        '4k': 4
    },
    reels: {
        '720p': 1,
        '1080p': 2,
        '4k': 4
    },
    youtube: {
        '720p': 2,
        '1080p': 3,
        '4k': 6
    },
    twitter: {
        '720p': 1,
        '1080p': 2,
        '4k': 4 // Twitter maxes at 1080p usually, but future proofing
    },
    linkedin: {
        '720p': 1,
        '1080p': 2,
        '4k': 4
    }
};
