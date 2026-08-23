/**
 * Legacy export entry point retained for import compatibility.
 * The current Convex API does not yet expose export-job processing.
 */
export async function processExportJob(jobId: string): Promise<never> {
    void jobId;
    throw new Error('UNSUPPORTED_CONVEX_OPERATION: Export pipeline processing is not exposed by the current Convex API.');
}
