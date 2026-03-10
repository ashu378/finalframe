/**
 * FinalFrame — Input Component
 * Reference: MASTER_PRD.md — Form input for auth and data collection
 */

import { forwardRef, InputHTMLAttributes } from 'react';
import styles from './input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
}

/**
 * Input component with label and error states
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, hint, id, className = '', ...props }, ref) => {
        const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

        return (
            <div className={styles.container}>
                {label && (
                    <label htmlFor={inputId} className={styles.label}>
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={`${styles.input} ${error ? styles.error : ''} ${className}`}
                    {...props}
                />
                {hint && !error && <p className={styles.hint}>{hint}</p>}
                {error && <p className={styles.errorMessage}>{error}</p>}
            </div>
        );
    }
);

Input.displayName = 'Input';
