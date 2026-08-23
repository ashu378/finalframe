'use client';

import { ConvexReactClient } from 'convex/react';
import { ConvexAuthNextjsProvider } from '@convex-dev/auth/nextjs';
import { isFeatureEnabled } from '@/lib/config/feature-flags';

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;

export function FinalFrameProviders({ children }: { children: React.ReactNode }) {
  if (!client || !isFeatureEnabled('convexAuth')) return children;
  return <ConvexAuthNextjsProvider client={client}>{children}</ConvexAuthNextjsProvider>;
}
