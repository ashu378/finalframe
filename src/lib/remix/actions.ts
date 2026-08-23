'use server';

import { parseRemixIntent } from './parser';
import type { RemixLayerType } from '@/lib/types/database';

const unsupported = (operation: string): never => {
    throw new Error(`UNSUPPORTED_CONVEX_OPERATION: ${operation} is not exposed by the current Convex API.`);
};

export async function submitRemixJob(
    projectId: string,
    renderJobId: string,
    query: string
): Promise<
    | { success: true; jobId: string; parsedIntent: Awaited<ReturnType<typeof parseRemixIntent>> }
    | { success: false; error: string }
> {
    void projectId;
    void renderJobId;
    void query;
    return unsupported('Remix job submission');
}

export async function estimateRemixCost(query: string) {
    try {
        const parsed = await parseRemixIntent(query);
        const cost = getCostForLayer(parsed.target_layer);
        return { cost, parsed };
    } catch {
        return { error: 'Could not parse intent' };
    }
}

function getCostForLayer(layer: RemixLayerType): number {
    switch (layer) {
        case 'text': return 1;
        case 'audio': return 2;
        case 'background': return 5;
        case 'overlay': return 3;
        case 'actor': return 10;
        case 'motion': return 5;
        default: return 1;
    }
}

export async function checkRemixStatus(renderJobId: string) {
    void renderJobId;
    return unsupported('Remix status lookup');
}
