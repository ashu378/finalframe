"use node";

import crypto from "node:crypto";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

function verify(rawBody: string, timestamp: string, signature: string, secret: string, toleranceSeconds = 300) {
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export const receive = action({
  args: { rawBody: v.string(), timestamp: v.string(), signature: v.string() },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const secret = process.env.BACHS_WEBHOOK_SECRET;
    if (!secret || !verify(args.rawBody, args.timestamp, args.signature, secret)) throw new Error("Invalid Bachs webhook signature.");
    let event: Record<string, any>;
    try { event = JSON.parse(args.rawBody) as Record<string, any>; } catch { throw new Error("Invalid Bachs webhook JSON."); }
    if (typeof event.id !== "string" || typeof event.type !== "string") throw new Error("Invalid Bachs webhook event envelope.");
    const data = event.data && typeof event.data === "object" ? event.data : {};
    if (event.type === "collection.succeeded") {
      const status = typeof data.status === "string" ? data.status.toUpperCase() : "";
      if (status !== "SUCCEEDED" && status !== "ACCEPTED") throw new Error("Bachs payment success event has no successful payment status.");
    }
    const amount = data.amount === undefined ? undefined : Number(data.amount);
    const refundAmountValue = data.refunded_amount ?? data.requested_amount ?? data.amount;
    const refundAmount = event.type.startsWith("refund.") && refundAmountValue !== undefined ? Number(refundAmountValue) : undefined;
    return await ctx.runMutation(internal.payments.processBachsEvent, {
      eventId: event.id,
      eventType: event.type,
      payload: event,
      checkoutId: typeof data.checkout_id === "string" ? data.checkout_id : undefined,
      reference: typeof data.reference === "string" ? data.reference : typeof data.metadata?.reference === "string" ? data.metadata.reference : undefined,
      chargeId: typeof data.charge_id === "string" ? data.charge_id : undefined,
      amount: Number.isFinite(amount) ? amount : undefined,
      currency: typeof data.currency === "string" ? data.currency : undefined,
      refundId: typeof data.refund_id === "string" ? data.refund_id : undefined,
      refundAmount: Number.isFinite(refundAmount) ? refundAmount : undefined,
    });
  },
});
