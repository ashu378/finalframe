/**
 * FinalFrame — Admin Layout
 * Reference: MASTER_PRD.md § 5.III — Admin Panel
 * Reference: BUILD_PHASES.md — Phase 0 requires admin route protection
 * 
 * Admin-only layout. Access enforced in middleware.
 */

import Link from 'next/link';
import styles from './layout.module.css';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className={styles.layout}>
            <aside className={styles.sidebar}>
                <div className={styles.logo}>
                    <Link href="/admin" className={styles.logoLink}>
                        <span className={styles.logoIcon}>F</span>
                        <span className={styles.logoText}>Admin</span>
                    </Link>
                </div>
                <nav className={styles.nav}>
                    <Link href="/admin" className={styles.navItem}>
                        Dashboard
                    </Link>
                    <Link href="/admin/users" className={styles.navItem}>
                        Users
                    </Link>
                    <Link href="/admin/moderation" className={styles.navItem}>
                        Moderation
                    </Link>
                </nav>
                <div className={styles.footer}>
                    <Link href="/dashboard" className={styles.backLink}>
                        ← Back to App
                    </Link>
                </div>
            </aside>
            <main className={styles.main}>
                <div className={styles.container}>
                    {children}
                </div>
            </main>
        </div>
    );
}
