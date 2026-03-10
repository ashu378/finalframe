/**
 * FinalFrame — Card Component
 * Reference: MASTER_PRD.md — Container component for content sections
 */

import { HTMLAttributes, forwardRef } from 'react';
import styles from './card.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'elevated' | 'outlined';
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

/**
 * Card container component
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ children, variant = 'default', padding = 'md', className = '', ...props }, ref) => {
        const classes = [
            styles.card,
            styles[variant],
            styles[`padding-${padding}`],
            className,
        ]
            .filter(Boolean)
            .join(' ');

        return (
            <div ref={ref} className={classes} {...props}>
                {children}
            </div>
        );
    }
);

Card.displayName = 'Card';

/**
 * Card Header component
 */
export function CardHeader({
    children,
    className = '',
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={`${styles.header} ${className}`} {...props}>
            {children}
        </div>
    );
}

/**
 * Card Title component
 */
export function CardTitle({
    children,
    className = '',
    ...props
}: HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h3 className={`${styles.title} ${className}`} {...props}>
            {children}
        </h3>
    );
}

/**
 * Card Description component
 */
export function CardDescription({
    children,
    className = '',
    ...props
}: HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p className={`${styles.description} ${className}`} {...props}>
            {children}
        </p>
    );
}

/**
 * Card Content component
 */
export function CardContent({
    children,
    className = '',
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={`${styles.content} ${className}`} {...props}>
            {children}
        </div>
    );
}

/**
 * Card Footer component
 */
export function CardFooter({
    children,
    className = '',
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={`${styles.footer} ${className}`} {...props}>
            {children}
        </div>
    );
}
