'use server';

import type { RenderJob } from '@/lib/types/database';

const unsupported = (operation: string): string =>
    `UNSUPPORTED_CONVEX_OPERATION: ${operation} is not exposed by the current Convex API.`;

export async function submitRenderJob(
    projectId: string,
    sceneId?: string
): Promise<{ success: boolean; jobId?: string; error?: string }> {
    void projectId;
    void sceneId;
    return { success: false, error: unsupported('Render job submission') };
}

export async function getRenderJobs(projectId: string): Promise<{ success: boolean; jobs?: RenderJob[]; error?: string }> {
    void projectId;
    return { success: false, error: unsupported('Render job listing') };
}

export async function resetStuckRender(projectId: string): Promise<{ success: boolean; error?: string }> {
    void projectId;
    return { success: false, error: unsupported('Render recovery') };
}

export async function resumeStuckJob(projectId: string): Promise<{ success: boolean; error?: string }> {
    void projectId;
    return { success: false, error: unsupported('Render resume') };
}
