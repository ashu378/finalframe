import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => new Response(JSON.stringify({ ok: true, service: "finalframe-convex" }), { status: 200, headers: { "content-type": "application/json" } })),
});

http.route({
  path: "/renderer/callback",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const configuredSecret = process.env.RENDER_WORKER_SHARED_SECRET;
    const suppliedSecret = request.headers.get("x-finalframe-worker-secret");
    if (!configuredSecret || !suppliedSecret || suppliedSecret !== configuredSecret) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
    let envelope: any;
    try { envelope = await request.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "content-type": "application/json" } }); }
    if (!envelope || typeof envelope.jobId !== "string" || !envelope.payload || typeof envelope.payload !== "object") return new Response(JSON.stringify({ error: "Invalid callback" }), { status: 400, headers: { "content-type": "application/json" } });
    const event = envelope.eventType === "render.completed" ? "COMPLETED" : envelope.eventType === "render.failed" ? "FAILED" : undefined;
    if (!event) return new Response(JSON.stringify({ error: "Unsupported callback event" }), { status: 400, headers: { "content-type": "application/json" } });
    const result = await ctx.runMutation(internal.renderJobs.applyRendererCallback, { jobId: envelope.jobId, leaseId: envelope.payload.leaseId, event, rendererJobId: envelope.rendererVersion, storageId: envelope.payload.storageId, mimeType: envelope.payload.mimeType, checksum: envelope.payload.checksum, errorCode: envelope.payload.errorCode, errorMessage: envelope.payload.errorMessage, retryable: envelope.payload.retryable, actualCost: envelope.payload.actualCost });
    return new Response(JSON.stringify({ ok: true, jobId: result?._id }), { status: 202, headers: { "content-type": "application/json" } });
  }),
});

export default http;
