/**
 * FinalFrame — Error Boundary Page
 * Reference: MASTER_PRD.md § 11 — Generic error handling
 * Reference: BUILD_PHASES.md — Phase 0 error handling
 */

'use client';

import { useEffect } from 'react';
import styles from './error.module.css';

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
        <div className={styles.container}>
            <div className={styles.content}>
                <h1 className={styles.title}>Something went wrong</h1>
                <p className={styles.description}>
                    We encountered an unexpected error. Please try again or contact support if the problem persists.
                </p>
                {error.digest && (
                    <p className={styles.errorId}>
                        Error ID: {error.digest}
                    </p>
                )}
                <button onClick={reset} className={styles.button}>
                    Try Again
                </button>
            </div>
        </div>
    );
}
