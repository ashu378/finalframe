/**
 * Legacy remix entry point retained for import compatibility.
 * Remix persistence and execution are not exposed by the current Convex API.
 */
export async function processRemixJob(jobId: string): Promise<never> {
    void jobId;
    throw new Error('UNSUPPORTED_CONVEX_OPERATION: Remix pipeline processing is not exposed by the current Convex API.');
}
