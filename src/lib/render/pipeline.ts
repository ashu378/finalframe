/**
 * Legacy render entry point retained for import compatibility.
 * Render-job creation and worker orchestration are not exposed by the current
 * authenticated Convex API, so this path fails closed instead of touching a
 * legacy datastore or returning a fake artifact.
 */
export async function processRenderJob(jobId: string, context?: any): Promise<never> {
    void jobId;
    void context;
    throw new Error('UNSUPPORTED_CONVEX_OPERATION: Render pipeline orchestration is not exposed by the current Convex API.');
}
