/**
 * FinalFrame — Root Layout
 * Reference: MASTER_PRD.md — Application shell
 * Reference: BUILD_PHASES.md — Phase 0 Foundation
 * 
 * This is the root layout that wraps all pages.
 * It provides global metadata, fonts, and styles.
 */
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import { FinalFrameProviders } from '@/components/providers/convex-auth-provider';

export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://finalframe.ai'),
    title: {
        default: 'FinalFrame — Make the video in your head',
        template: '%s | FinalFrame',
    },
    description: 'Turn an idea, script, or your own media into a finished video with FinalFrame.',
    keywords: ['video production', 'AI video', 'creative studio', 'content creation'],
    authors: [{ name: 'FinalFrame' }],
    creator: 'FinalFrame',
    openGraph: {
        type: 'website',
        locale: 'en_US',
        url: 'https://finalframe.ai',
        siteName: 'FinalFrame',
        title: 'FinalFrame — Make the video in your head',
        description: 'Turn an idea, script, or your own media into a finished video with FinalFrame.',
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
        <html lang="en" suppressHydrationWarning>
            <body className="min-h-dvh bg-background font-sans antialiased" suppressHydrationWarning>
                <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-foreground focus:px-4 focus:py-3 focus:text-background">Skip to content</a>
                <Toaster position="top-right" theme="light" richColors />
                <FinalFrameProviders>{children}</FinalFrameProviders>
            </body>
        </html>
    );
}
