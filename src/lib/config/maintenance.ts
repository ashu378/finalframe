/**
 * FinalFrame — Maintenance Mode Configuration
 * Reference: MASTER_PRD.md § 11 — Maintenance mode handling
 * Reference: BUILD_PHASES.md — Phase 0 requires maintenance mode support
 * 
 * Maintenance mode is enforced globally by the Next.js proxy.
 * When enabled, all routes except bypass paths redirect to /maintenance.
 */

/**
 * Maintenance mode flag
 * This is read from environment variable for runtime configuration.
 * Set MAINTENANCE_MODE=true in .env.local to enable.
 */
export const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';

/**
 * Paths that are accessible even during maintenance mode
 */
export const MAINTENANCE_BYPASS_PATHS = [
    '/maintenance',
    '/api/health', // Health check endpoint for monitoring
    '/_next', // Next.js static assets
    '/favicon.ico',
] as const;

/**
 * Check if a path should bypass maintenance mode
 */
export function shouldBypassMaintenance(pathname: string): boolean {
    return MAINTENANCE_BYPASS_PATHS.some(
        (bypassPath) => pathname === bypassPath || pathname.startsWith(bypassPath + '/')
    );
}
