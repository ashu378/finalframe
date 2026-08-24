/** @type {import('next').NextConfig} */
const nextConfig = {
    // The Convex URL is public configuration, not a secret. Keep a safe
    // production fallback so a Vercel deployment cannot crash during client
    // hydration when the dashboard environment variable is missing.
    env: {
        NEXT_PUBLIC_CONVEX_URL:
            process.env.NEXT_PUBLIC_CONVEX_URL ||
            'https://knowing-snail-785.convex.cloud',
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '50mb',
        },
    },
};

module.exports = nextConfig;
