import { redirect } from 'next/navigation';
import { decodeProjectRouteId } from '@/lib/project/route-id';

export default async function ProductionPage({ params, searchParams }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ production?: string | string[] }>;
}) {
    const [{ id }, { production }] = await Promise.all([params, searchParams]);
    const query = new URLSearchParams();
    if (production !== undefined) {
        for (const value of Array.isArray(production) ? production : [production]) {
            query.append('production', value);
        }
    }
    const path = `/dashboard/projects/${encodeURIComponent(decodeProjectRouteId(id))}/workspace/takes`;
    // The workspace owns project and episode authorization and take review.
    redirect(query.size ? `${path}?${query}` : path);
}
