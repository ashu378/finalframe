/**
 * FinalFrame — Root Layout
 * Reference: MASTER_PRD.md — Application shell
 * Reference: BUILD_PHASES.md — Phase 0 Foundation
 * 
 * This is the root layout that wraps all pages.
 * It provides global metadata, fonts, and styles.
 */
import type { Metadata } from 'next';
const inter = { variable: 'font-sans' };
const mono = { variable: 'font-mono' };
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
    title: {
        default: 'FinalFrame — Studio-Grade Creative Production',
        template: '%s | FinalFrame',
    },
    description: 'A studio-grade creative operating system for Hollywood-standard content.',
    keywords: ['video production', 'AI video', 'creative studio', 'content creation'],
    authors: [{ name: 'FinalFrame' }],
    creator: 'FinalFrame',
    openGraph: {
        type: 'website',
        locale: 'en_US',
        url: 'https://finalframe.ai',
        siteName: 'FinalFrame',
        title: 'FinalFrame — Studio-Grade Creative Production',
        description: 'A studio-grade creative operating system for Hollywood-standard content.',
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: 'FinalFrame — Studio-Grade Creative Production',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'FinalFrame — Studio-Grade Creative Production',
        description: 'A studio-grade creative operating system for Hollywood-standard content.',
        images: ['/og-image.png'],
    },
    icons: {
        icon: '/icon.svg',
        apple: '/icon.svg',
    },
    robots: {
        index: true,
        follow: true,
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
            <body className="min-h-screen bg-background font-sans antialiased" suppressHydrationWarning>
                <Toaster position="top-right" theme="dark" richColors />
                {children}
            </body>
        </html>
    );
}
