import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

const CALLBACK_MAX_AGE_MS = 10 * 60 * 1000;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function hmacSignature(rawBody: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `sha256=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)))}`;
}

async function sha256(rawBody: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody)));
}

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
    const signature = request.headers.get("x-finalframe-renderer-signature")?.trim() ?? "";
    const suppliedSecret = request.headers.get("x-finalframe-worker-secret")?.trim() ?? "";
    if (!configuredSecret || !signature || !suppliedSecret || !safeEqual(suppliedSecret, configuredSecret)) return jsonResponse({ error: "Unauthorized", code: "CALLBACK_UNAUTHORIZED" }, 401);
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > 2_000_000) return jsonResponse({ error: "Callback body is too large", code: "CALLBACK_TOO_LARGE" }, 413);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 2_000_000) return jsonResponse({ error: "Callback body is too large", code: "CALLBACK_TOO_LARGE" }, 413);
    const expectedSignature = await hmacSignature(rawBody, configuredSecret);
    if (!safeEqual(signature, expectedSignature)) return jsonResponse({ error: "Unauthorized", code: "CALLBACK_SIGNATURE_INVALID" }, 401);
    let envelope: any;
    try { envelope = JSON.parse(rawBody); } catch { return jsonResponse({ error: "Invalid callback JSON", code: "CALLBACK_INVALID_JSON" }, 400); }
    if (!envelope || envelope.version !== 1 || typeof envelope.eventId !== "string" || envelope.eventId.length < 1 || envelope.eventId.length > 256 || typeof envelope.idempotencyKey !== "string" || envelope.idempotencyKey.length < 1 || envelope.idempotencyKey.length > 256 || typeof envelope.jobId !== "string" || envelope.jobId.length < 1 || envelope.jobId.length > 256 || typeof envelope.projectId !== "string" || envelope.projectId.length < 1 || envelope.projectId.length > 256 || typeof envelope.rendererVersion !== "string" || envelope.rendererVersion.length < 1 || envelope.rendererVersion.length > 128 || typeof envelope.occurredAt !== "string" || envelope.occurredAt.length < 1 || envelope.occurredAt.length > 64 || !envelope.payload || typeof envelope.payload !== "object" || Array.isArray(envelope.payload) || !Number.isInteger(envelope.attempt) || envelope.attempt < 1 || envelope.attempt > 1000) return jsonResponse({ error: "Invalid callback envelope", code: "CALLBACK_INVALID_ENVELOPE" }, 400);
    const event = envelope.eventType === "render.completed" ? "COMPLETED" : envelope.eventType === "render.failed" ? "FAILED" : undefined;
    if (!event) return jsonResponse({ error: "Unsupported callback event", code: "CALLBACK_EVENT_UNSUPPORTED" }, 400);
    const occurredAt = Date.parse(envelope.occurredAt);
    if (!Number.isFinite(occurredAt) || Math.abs(Date.now() - occurredAt) > CALLBACK_MAX_AGE_MS) return jsonResponse({ error: "Callback timestamp is outside the accepted window", code: "CALLBACK_STALE" }, 400);
    try {
      const result = await ctx.runMutation(internal.renderJobs.applyRendererCallback, { jobId: envelope.jobId, leaseId: envelope.payload.leaseId, event, eventId: envelope.eventId, idempotencyKey: envelope.idempotencyKey, projectId: envelope.projectId, eventType: envelope.eventType, occurredAt, attempt: envelope.attempt, payloadHash: await sha256(rawBody), signature, rendererJobId: envelope.rendererVersion, storageId: envelope.payload.storageId, mimeType: envelope.payload.mimeType, checksum: envelope.payload.checksum, errorCode: envelope.payload.errorCode, errorMessage: envelope.payload.errorMessage, retryable: envelope.payload.retryable, actualCost: envelope.payload.actualCost });
      return jsonResponse({ ok: true, duplicate: result?.duplicate === true, jobId: result?.job?._id }, result?.duplicate ? 200 : 202);
    } catch {
      return jsonResponse({ error: "Callback rejected", code: "CALLBACK_REJECTED" }, 409);
    }
  }),
});

export default http;
