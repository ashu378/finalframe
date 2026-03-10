/**
 * FinalFrame — Feature Lock Component
 * Reference: BUILD_PHASES.md — Phase 0 requires feature lock UI
 * 
 * Displays a placeholder for features not yet available.
 * UI shell only, no mock data per user requirements.
 */

import styles from './feature-lock.module.css';
import { CURRENT_BUILD_PHASE, type FeatureName, getRequiredPhase } from '@/lib/config/build-phase';

interface FeatureLockProps {
    feature: FeatureName;
    title: string;
    description?: string;
}

/**
 * Feature lock placeholder component
 * Displays when a feature is not yet implemented
 */
export function FeatureLock({ feature, title, description }: FeatureLockProps) {
    const requiredPhase = getRequiredPhase(feature);

    return (
        <div className={styles.container}>
            <div className={styles.icon}>
                <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
            </div>
            <h2 className={styles.title}>{title}</h2>
            {description && <p className={styles.description}>{description}</p>}
            <div className={styles.badge}>
                <span>Coming in Phase {requiredPhase}</span>
            </div>
            <p className={styles.phaseInfo}>
                Current phase: {CURRENT_BUILD_PHASE}
            </p>
        </div>
    );
}
