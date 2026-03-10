/**
 * FinalFrame — Maintenance Mode Page
 * Reference: MASTER_PRD.md § 11 — Maintenance mode
 * Reference: BUILD_PHASES.md — Phase 0 error handling
 * 
 * This page is shown when MAINTENANCE_MODE is enabled in environment.
 * Middleware redirects all traffic here during maintenance.
 */

import styles from './page.module.css';

export const metadata = {
    title: 'Maintenance',
    description: 'FinalFrame is currently undergoing maintenance',
};

export default function MaintenancePage() {
    return (
        <div className={styles.container}>
            <div className={styles.content}>
                <div className={styles.icon}>🔧</div>
                <h1 className={styles.title}>Under Maintenance</h1>
                <p className={styles.description}>
                    FinalFrame is currently undergoing scheduled maintenance.
                    We&apos;ll be back shortly.
                </p>
                <p className={styles.eta}>
                    Expected duration: Less than 1 hour
                </p>
            </div>
        </div>
    );
}
