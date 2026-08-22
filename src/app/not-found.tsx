/**
 * FinalFrame — 404 Not Found Page
 * Reference: MASTER_PRD.md § 11 — Custom 404
 * Reference: BUILD_PHASES.md — Phase 0 error handling
 */

import Link from 'next/link';
export default function NotFound() {
    return (
        <main className="ff-noise grid min-h-dvh place-items-center bg-background px-5 py-16">
            <div className="ff-card w-full max-w-xl p-8 text-center sm:p-12">
                <p className="ff-eyebrow">A missing page</p>
                <p className="ff-display mt-5 text-7xl font-semibold text-primary">404</p>
                <h1 className="ff-display mt-6 text-3xl font-semibold">This page did not make the cut.</h1>
                <p className="mx-auto mt-4 max-w-md leading-7 text-muted-foreground">
                    The page you&apos;re looking for doesn&apos;t exist or has been moved.
                </p>
                <Link href="/" className="ff-button-primary mt-8">
                    Back to FinalFrame
                </Link>
            </div>
        </main>
    );
}
