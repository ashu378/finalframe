/**
 * FinalFrame — Error Boundary Page
 * Reference: MASTER_PRD.md § 11 — Generic error handling
 * Reference: BUILD_PHASES.md — Phase 0 error handling
 */

'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Application error:', error);
    }, [error]);

    return (
        <main className="ff-noise grid min-h-dvh place-items-center bg-background px-5 py-16">
            <div className="ff-card w-full max-w-xl p-8 text-center sm:p-12">
                <p className="ff-eyebrow">A quick reset</p>
                <h1 className="ff-display mt-5 text-4xl font-semibold">Something went wrong.</h1>
                <p className="mx-auto mt-4 max-w-md leading-7 text-muted-foreground">
                    We encountered an unexpected error. Please try again or contact support if the problem persists.
                </p>
                {error.digest && (
                    <p className="mt-5 text-xs text-muted-foreground">
                        Error ID: {error.digest}
                    </p>
                )}
                <button onClick={reset} className="ff-button-primary mt-8">
                    Try Again
                </button>
            </div>
        </main>
    );
}
