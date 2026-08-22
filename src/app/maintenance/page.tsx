/**
 * FinalFrame — Maintenance Mode Page
 * Reference: MASTER_PRD.md § 11 — Maintenance mode
 * Reference: BUILD_PHASES.md — Phase 0 error handling
 * 
 * This page is shown when MAINTENANCE_MODE is enabled in environment.
 * Middleware redirects all traffic here during maintenance.
 */

export const metadata = {
    title: 'Maintenance',
    description: 'FinalFrame is currently undergoing maintenance',
};

export default function MaintenancePage() {
    return (
        <main className="ff-noise grid min-h-dvh place-items-center bg-background px-5 py-16">
            <div className="ff-card w-full max-w-xl p-8 text-center sm:p-12">
                <p className="ff-eyebrow">A short pause</p>
                <h1 className="ff-display mt-5 text-4xl font-semibold">We are tuning the studio.</h1>
                <p className="mx-auto mt-4 max-w-md leading-7 text-muted-foreground">
                    FinalFrame is currently undergoing scheduled maintenance.
                    We&apos;ll be back shortly.
                </p>
                <p className="mt-6 text-sm font-semibold text-accent">
                    Please check back soon.
                </p>
            </div>
        </main>
    );
}
